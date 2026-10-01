(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-trips';
  var ACTIVE_USER_KEY = 'travelmate-active-user';
  var USER_STORAGE_PREFIX = 'travelmate-trips-user:';
  var SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/dist/umd/supabase.min.js';
  var SUPABASE_SRI = 'sha384-BmlQlKlDvXvKoxkn5OQuUo/aJQCTXeB+Kls6EccBmG4Kf8AXvp89RtO9MtPxP/r5';
  var WRITE_TIMEOUT_MS = Number(window.TRAVELMATE_CLOUD_WRITE_TIMEOUT_MS) || 15000;
  var saveTimers = new Map();
  var saveChains = new Map();
  var syncGenerations = new Map();
  var lastSaveTime = 0;
  var fullSyncPromises = new Map();
  var deletedTripIds = new Set();
  var authGeneration = 0;

  function loadLibrary() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (window.travelMateSupabaseLoader) return window.travelMateSupabaseLoader;
    window.travelMateSupabaseLoader = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = SUPABASE_CDN;
      script.integrity = SUPABASE_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = function () { resolve(window.supabase); };
      script.onerror = function () { script.remove(); reject(new Error('SUPABASE_LIBRARY_FAILED')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      window.travelMateSupabaseLoader = null;
      throw error;
    });
    return window.travelMateSupabaseLoader;
  }

  function getClient() {
    if (window.__travelMateSupabaseClient) return Promise.resolve(window.__travelMateSupabaseClient);
    return loadLibrary().then(function (library) {
      if (window.__travelMateSupabaseClient) return window.__travelMateSupabaseClient;
      var config = window.TRAVELMATE_SUPABASE;
      if (!config || !config.url || !config.publishableKey) throw new Error('SUPABASE_NOT_CONFIGURED');
      window.__travelMateSupabaseClient = library.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return window.__travelMateSupabaseClient;
    });
  }

  function getLocalTrips() {
    try {
      var value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function setLocalTrips(trips) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    var activeUser = localStorage.getItem(ACTIVE_USER_KEY) || '';
    if (activeUser) localStorage.setItem(USER_STORAGE_PREFIX + activeUser, JSON.stringify(trips));
    window.dispatchEvent(new CustomEvent('travelmate:local-trips-updated', { detail: trips }));
  }

  function readTripList(key) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function tripIdentity(trip, fallbackOwnerId) {
    var ownerId = String(trip && trip.ownerId || fallbackOwnerId || '');
    return ownerId + ':' + String(trip && trip.id || '');
  }

  function saveIdentity(trip) {
    return String(trip && trip.id || '');
  }

  function currentSyncGeneration(trip, fallbackOwnerId) {
    return Number(syncGenerations.get(tripIdentity(trip, fallbackOwnerId)) || 0);
  }

  function stampSyncGeneration(snapshot, fallbackOwnerId) {
    Object.defineProperty(snapshot, '__syncGeneration', {
      value: currentSyncGeneration(snapshot, fallbackOwnerId),
      enumerable: false,
      configurable: true
    });
    return snapshot;
  }

  function isStaleSyncSnapshot(snapshot, fallbackOwnerId) {
    return Boolean(snapshot && typeof snapshot.__syncGeneration === 'number'
      && snapshot.__syncGeneration !== currentSyncGeneration(snapshot, fallbackOwnerId));
  }

  function invalidatePendingTripSync(trip, fallbackOwnerId) {
    var key = tripIdentity(trip, fallbackOwnerId);
    syncGenerations.set(key, currentSyncGeneration(trip, fallbackOwnerId) + 1);
    clearTimeout(saveTimers.get(key));
    saveTimers.delete(key);
    saveChains.delete(key);
  }

  function deletionIdentity(trip, fallbackOwnerId) {
    var ownerId = typeof trip === 'object' && trip ? trip.ownerId : fallbackOwnerId;
    var tripId = typeof trip === 'object' && trip ? trip.id : trip;
    return String(ownerId || fallbackOwnerId || activeUserId() || '') + ':' + String(tripId || '');
  }

  function activeUserId() {
    return String(localStorage.getItem(ACTIVE_USER_KEY) || '');
  }

  function authContextError() {
    var error = new Error('AUTH_CONTEXT_CHANGED');
    error.code = 'AUTH_CONTEXT_CHANGED';
    return error;
  }

  function assertActiveUser(userId) {
    if (activeUserId() !== String(userId || '')) throw authContextError();
  }

  function isTripDeleted(trip, fallbackOwnerId) {
    return deletedTripIds.has(deletionIdentity(trip, fallbackOwnerId));
  }

  function acceptRemoteDeletion(trip, error, expectedUserId) {
    if (!error || error.code !== 'TRIP_DELETED') return false;
    if (expectedUserId && activeUserId() !== String(expectedUserId)) return false;
    deletedTripIds.add(deletionIdentity(trip, expectedUserId));
    removeLocalTrip(trip.id, trip.ownerId);
    return true;
  }

  function isTripEditForbidden(error) {
    var code = String(error && error.code || '');
    var message = String(error && error.message || '');
    return code === 'TRIP_EDIT_FORBIDDEN'
      || message === 'TRIP_EDIT_FORBIDDEN'
      || (code === '42501' && /trip edit forbidden/i.test(message));
  }

  function mutationId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var value = character === 'x' ? random : (random & 3) | 8;
      return value.toString(16);
    });
  }

  function cloudError(code, response) {
    var error = new Error(code);
    error.code = code;
    error.cloud = response || null;
    return error;
  }

  function isMissingRpc(error, functionName) {
    if (!error || error.code !== 'PGRST202' || !functionName) return false;
    var diagnostic = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    return diagnostic.indexOf(functionName) !== -1
      && /could not find the function|schema cache/i.test(diagnostic);
  }

  function runBoundedWrite(request) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller && request && typeof request.abortSignal === 'function') request = request.abortSignal(controller.signal);
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(cloudError('TRIP_WRITE_TIMEOUT'));
      }, WRITE_TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve(request), timeout]).finally(function () { clearTimeout(timer); });
  }

  function tripTimestamp(trip) {
    return Math.max(
      Date.parse(trip && trip.updatedAt || 0) || 0,
      Date.parse(trip && trip.cloudUpdatedAt || 0) || 0
    );
  }

  function tripRevision(trip) {
    var revision = Number(trip && trip.cloudRevision || 0);
    return Number.isFinite(revision) && revision > 0 ? revision : 0;
  }

  function hasUnsyncedChanges(trip) {
    if (!trip) return false;
    var status = String(trip.syncStatus || '');
    return Boolean(trip.syncMutationId)
      || status === 'pending'
      || status === 'failed'
      || status === 'unknown'
      || status === 'conflict';
  }

  function newestTrip(left, right) {
    var leftUnsynced = hasUnsyncedChanges(left);
    var rightUnsynced = hasUnsyncedChanges(right);
    if (leftUnsynced !== rightUnsynced) return rightUnsynced ? right : left;

    var leftRevision = tripRevision(left);
    var rightRevision = tripRevision(right);
    if (leftRevision !== rightRevision) return rightRevision > leftRevision ? right : left;

    var leftTime = tripTimestamp(left);
    var rightTime = tripTimestamp(right);
    return rightTime > leftTime ? right : left;
  }

  function shouldUseCloudTrip(local, cloud) {
    if (!local) return true;
    if (hasUnsyncedChanges(local)) return false;

    var localRevision = tripRevision(local);
    var cloudRevision = tripRevision(cloud);
    if (localRevision !== cloudRevision && (localRevision || cloudRevision)) {
      return cloudRevision > localRevision;
    }

    return tripTimestamp(cloud) >= tripTimestamp(local);
  }

  function mergeTripLists(lists, fallbackOwnerId) {
    var merged = new Map();
    (lists || []).forEach(function (list) {
      (Array.isArray(list) ? list : []).forEach(function (trip) {
        if (!trip || trip.id == null) return;
        var key = tripIdentity(trip, fallbackOwnerId);
        merged.set(key, merged.has(key) ? newestTrip(merged.get(key), trip) : trip);
      });
    });
    return Array.from(merged.values());
  }

  function mergeActiveTripsWithBackup(activeTrips, backupTrips, fallbackOwnerId) {
    var merged = new Map();
    (Array.isArray(backupTrips) ? backupTrips : []).forEach(function (trip) {
      if (trip && trip.id != null) merged.set(tripIdentity(trip, fallbackOwnerId), trip);
    });
    (Array.isArray(activeTrips) ? activeTrips : []).forEach(function (trip) {
      if (trip && trip.id != null) merged.set(tripIdentity(trip, fallbackOwnerId), trip);
    });
    return Array.from(merged.values());
  }

  function activateUserStorage(userId) {
    userId = userId ? String(userId) : '';
    var activeUser = localStorage.getItem(ACTIVE_USER_KEY) || '';
    if (activeUser === userId) {
      if (userId) {
        var activeSnapshotKey = USER_STORAGE_PREFIX + userId;
        var currentActiveTrips = getLocalTrips();
        var recoveredActiveTrips = mergeActiveTripsWithBackup(currentActiveTrips, readTripList(activeSnapshotKey), userId);
        localStorage.setItem(activeSnapshotKey, JSON.stringify(recoveredActiveTrips));
        if (JSON.stringify(recoveredActiveTrips) !== JSON.stringify(currentActiveTrips)) setLocalTrips(recoveredActiveTrips);
      }
      return;
    }

    authGeneration += 1;
    saveTimers.forEach(function (timer) { clearTimeout(timer); });
    saveTimers.clear();
    saveChains.clear();
    fullSyncPromises.clear();
    var currentTrips = getLocalTrips();
    if (activeUser) localStorage.setItem(USER_STORAGE_PREFIX + activeUser, JSON.stringify(currentTrips));

    if (!userId) {
      localStorage.removeItem(ACTIVE_USER_KEY);
      setLocalTrips([]);
      window.dispatchEvent(new CustomEvent('travelmate:account-context-changed', { detail: { previousUserId: activeUser || null, userId: null, generation: authGeneration, trips: [] } }));
      return;
    }

    var userStorageKey = USER_STORAGE_PREFIX + userId;
    var hasUserSnapshot = localStorage.getItem(userStorageKey) !== null;
    var snapshotTrips = hasUserSnapshot ? readTripList(userStorageKey) : [];
    var recoverableTrips = activeUser ? [] : currentTrips.filter(function (trip) {
      return !trip.ownerId || String(trip.ownerId) === userId;
    });
    var userTrips = mergeTripLists([snapshotTrips, recoverableTrips], userId);
    localStorage.setItem(ACTIVE_USER_KEY, userId);
    localStorage.setItem(userStorageKey, JSON.stringify(userTrips));
    setLocalTrips(userTrips);
    window.dispatchEvent(new CustomEvent('travelmate:account-context-changed', { detail: { previousUserId: activeUser || null, userId: userId, generation: authGeneration, trips: userTrips } }));
  }

  function upsertLocalTrip(trip) {
    var trips = getLocalTrips();
    var index = trips.findIndex(function (item) {
      if (String(item.id) !== String(trip.id)) return false;
      if (!item.ownerId || !trip.ownerId) return true;
      return String(item.ownerId) === String(trip.ownerId);
    });
    if (index === -1) trips.push(trip);
    else trips[index] = trip;
    setLocalTrips(trips);
    return trip;
  }

  function removeLocalTrip(tripId, ownerId) {
    var id = String(tripId);
    var owner = ownerId == null ? '' : String(ownerId);
    var trips = getLocalTrips().filter(function (trip) {
      if (String(trip.id) !== id) return true;
      return owner && String(trip.ownerId || '') !== owner;
    });
    setLocalTrips(trips);
    var activeUser = localStorage.getItem(ACTIVE_USER_KEY);
    if (activeUser) localStorage.setItem(USER_STORAGE_PREFIX + activeUser, JSON.stringify(trips));
    return trips;
  }

  function toRow(trip, userId, timestamp) {
    var payload = Object.assign({}, trip, { cloudUpdatedAt: timestamp, syncStatus: 'synced' });
    delete payload.syncConflict;
    return {
      user_id: String(trip.ownerId || userId),
      id: String(trip.id),
      country: String(trip.country || ''),
      city: String(trip.city || ''),
      start_date: trip.start,
      end_date: trip.end,
      budget: Number(trip.budget || 0),
      trip_type: String(trip.type || 'סולו'),
      days: Number(trip.days || 1),
      payload: payload,
      updated_at: timestamp,
      updated_by: userId
    };
  }

  function fromRow(row) {
    var payload = stripTransientSyncState(Object.assign({}, row.payload || {}));
    return Object.assign(payload, {
      id: String(row.id),
      ownerId: String(row.user_id),
      country: row.country,
      city: row.city,
      start: row.start_date,
      end: row.end_date,
      budget: Number(row.budget || 0),
      type: row.trip_type,
      days: Number(row.days || 1),
      cloudUpdatedAt: row.updated_at,
      cloudRevision: Number(row.revision || row.payload && row.payload.cloudRevision || 0),
      deletedAt: row.deleted_at || null,
      syncStatus: 'synced'
    });
  }

  async function getSession() {
    var client = await getClient();
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    var session = result.data.session;
    activateUserStorage(session && session.user ? session.user.id : null);
    return session;
  }

  async function assertMfaReadyForPersonalData() {
    var client = await getClient();
    if (!client.auth || !client.auth.mfa || typeof client.auth.mfa.getAuthenticatorAssuranceLevel !== 'function') return;
    var assuranceResult = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceResult.error) throw assuranceResult.error;
    var assurance = assuranceResult.data || {};
    if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      var mfaError = new Error('MFA_REQUIRED');
      mfaError.code = 'MFA_REQUIRED';
      throw mfaError;
    }
  }

  async function getPrivateStorageSession() {
    var client = await getClient();
    var sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    var session = sessionResult.data.session;
    if (!session || !session.user) {
      var signedOutError = new Error('STORAGE_SIGN_IN_REQUIRED');
      signedOutError.code = 'STORAGE_SIGN_IN_REQUIRED';
      throw signedOutError;
    }
    var assuranceResult = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceResult.error) throw assuranceResult.error;
    var assurance = assuranceResult.data || {};
    if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      var mfaError = new Error('MFA_REQUIRED');
      mfaError.code = 'MFA_REQUIRED';
      throw mfaError;
    }
    activateUserStorage(session.user.id);
    return { client: client, session: session, assurance: assurance };
  }

  async function listCloudTrips() {
    var client = await getClient();
    var result = await client.from('travel_trips').select('*').order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    return (result.data || []).map(fromRow);
  }

  function cloneTrip(trip) {
    return JSON.parse(JSON.stringify(trip));
  }

  function stripTransientSyncState(payload) {
    ['syncStatus', 'syncMutationId', 'syncConflict', 'deletePending', 'deleteMutationId'].forEach(function (key) {
      delete payload[key];
    });
    return payload;
  }

  function tripForCloud(trip) {
    return stripTransientSyncState(cloneTrip(trip));
  }

  async function listCloudTripTombstones() {
    var client = await getClient();
    if (typeof client.rpc !== 'function') return [];
    var result = await client.rpc('list_travel_trip_tombstones');
    if (result.error) {
      if (isMissingRpc(result.error, 'list_travel_trip_tombstones')) return [];
      throw result.error;
    }
    return (result.data || []).map(function (row) {
      return {
        ownerId: String(row.owner_id),
        id: String(row.trip_id),
        cloudRevision: Number(row.revision || 0),
        deletedAt: row.deleted_at || null
      };
    });
  }

  function nextSaveTimestamp(trip) {
    lastSaveTime = Math.max(Date.now(), lastSaveTime + 1, tripTimestamp(trip) + 1);
    return new Date(lastSaveTime).toISOString();
  }

  function localTripFor(snapshot) {
    var identity = tripIdentity(snapshot);
    return getLocalTrips().find(function (item) { return tripIdentity(item) === identity; })
      || getLocalTrips().find(function (item) {
        return String(item.id) === String(snapshot && snapshot.id) && !item.ownerId;
      }) || null;
  }

  function findLocalTrip(id, expectedOwnerId) {
    var matches = getLocalTrips().filter(function (trip) { return String(trip.id) === String(id); });
    return matches.find(function (trip) {
      return expectedOwnerId && trip.ownerId && String(trip.ownerId) === String(expectedOwnerId);
    }) || matches.find(function (trip) { return !trip.ownerId; }) || matches[0] || null;
  }

  function prepareTripSave(trip, reuseMutation) {
    var snapshot = cloneTrip(trip);
    snapshot.ownerId = String(snapshot.ownerId || localStorage.getItem(ACTIVE_USER_KEY) || '');
    snapshot.updatedAt = nextSaveTimestamp(snapshot);
    snapshot.syncStatus = 'pending';
    snapshot.syncMutationId = reuseMutation && snapshot.syncMutationId ? snapshot.syncMutationId : mutationId();
    stampSyncGeneration(snapshot, snapshot.ownerId);
    if (snapshot.ownerId) trip.ownerId = snapshot.ownerId;
    trip.updatedAt = snapshot.updatedAt;
    trip.syncStatus = snapshot.syncStatus;
    upsertLocalTrip(snapshot);
    window.dispatchEvent(new CustomEvent('travelmate:trip-sync-state', { detail: { id: snapshot.id, status: 'pending', timestamp: snapshot.updatedAt } }));
    return snapshot;
  }

  function updateLocalSyncState(snapshot, status, cloudTimestamp, expectedUserId, cloudRevision) {
    if (expectedUserId && activeUserId() !== String(expectedUserId)) return;
    if (isStaleSyncSnapshot(snapshot, expectedUserId)) return;
    var current = localTripFor(snapshot);
    if (!current || tripTimestamp(current) > tripTimestamp(snapshot)) return;
    if (snapshot.ownerId) current.ownerId = snapshot.ownerId;
    current.syncStatus = status;
    var serverRevision = Number(cloudRevision || 0);
    if (status === 'conflict') {
      current.syncConflict = {
        serverRevision: Number.isFinite(serverRevision) && serverRevision > 0 ? serverRevision : null,
        serverUpdatedAt: cloudTimestamp || null,
        detectedAt: new Date().toISOString()
      };
    } else {
      if (cloudTimestamp) current.cloudUpdatedAt = cloudTimestamp;
      if (Number.isFinite(serverRevision) && serverRevision > 0) current.cloudRevision = serverRevision;
      if (status === 'synced') {
        delete current.syncMutationId;
        delete current.syncConflict;
      }
    }
    upsertLocalTrip(current);
    var detail = { id: snapshot.id, ownerId: current.ownerId || snapshot.ownerId || null, status: status, timestamp: cloudTimestamp || snapshot.updatedAt };
    if (status === 'conflict') {
      detail.serverRevision = current.syncConflict.serverRevision;
      detail.serverUpdatedAt = current.syncConflict.serverUpdatedAt;
      window.dispatchEvent(new CustomEvent('travelmate:sync-conflict', { detail: detail }));
    }
    window.dispatchEvent(new CustomEvent('travelmate:trip-sync-state', { detail: detail }));
  }

  function acceptCloudTrip(incoming) {
    if (isTripDeleted(incoming)) return false;
    var current = localTripFor(incoming);
    if (current && !shouldUseCloudTrip(current, incoming)) return false;
    upsertLocalTrip(incoming);
    window.dispatchEvent(new CustomEvent('travelmate:canonical-trip-replaced', { detail: { userId: incoming.ownerId || activeUserId(), tripId: incoming.id, trip: incoming, generation: authGeneration, source: 'realtime' } }));
    return true;
  }

  async function performTripSave(trip, expectedUserId) {
    if (expectedUserId) assertActiveUser(expectedUserId);
    var client = await getClient();
    var session = await getSession();
    if (expectedUserId && (!session || !session.user || String(session.user.id) !== String(expectedUserId))) throw authContextError();
    if (!session || !session.user) {
      updateLocalSyncState(trip, 'local', null, expectedUserId);
      return { saved: false, reason: 'SIGNED_OUT' };
    }
    var timestamp = trip.updatedAt || new Date().toISOString();
    trip.ownerId = String(trip.ownerId || session.user.id);
    var row = toRow(trip, session.user.id, timestamp);
    var result;
    var response;
    if (typeof client.rpc === 'function') {
      result = await runBoundedWrite(client.rpc('save_travel_trip', {
        p_owner_id: row.user_id,
        p_trip_id: row.id,
        p_expected_revision: Number(trip.cloudRevision || 0) || null,
        p_expected_updated_at: trip.cloudRevision ? null : (trip.cloudUpdatedAt || null),
        p_mutation_id: trip.syncMutationId,
        p_trip: tripForCloud(trip)
      }));
      if (result.error) {
        if (isMissingRpc(result.error, 'save_travel_trip')) throw cloudError('TRIP_SYNC_RPC_UNAVAILABLE', result.error);
        throw result.error;
      }
      response = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!response || response.result_status === 'conflict') throw cloudError('TRIP_CONFLICT', response);
      if (response.result_status === 'deleted') throw cloudError('TRIP_DELETED', response);
    }
    if (!response) {
      if (String(row.user_id) === String(session.user.id)) {
        result = await runBoundedWrite(client.from('travel_trips').upsert(row, { onConflict: 'user_id,id' }));
      } else {
        var update = Object.assign({}, row);
        delete update.user_id;
        delete update.id;
        result = await runBoundedWrite(client.from('travel_trips').update(update)
          .eq('user_id', row.user_id).eq('id', row.id).select('id').maybeSingle());
      }
      if (result.error) throw result.error;
      if (String(row.user_id) !== String(session.user.id) && !result.data) throw new Error('TRIP_EDIT_FORBIDDEN');
      response = { result_status: 'saved', result_revision: trip.cloudRevision || 0, result_updated_at: timestamp };
    }
    if (expectedUserId) assertActiveUser(expectedUserId);
    if (isStaleSyncSnapshot(trip, expectedUserId)) return { saved: false, reason: 'STALE_AFTER_CONFLICT_RESOLUTION' };
    timestamp = response.result_updated_at || timestamp;
    updateLocalSyncState(trip, 'synced', timestamp, expectedUserId, response.result_revision);
    window.dispatchEvent(new CustomEvent('travelmate:trip-synced', { detail: { id: trip.id, timestamp: timestamp, revision: Number(response.result_revision || 0) } }));
    return { saved: true, timestamp: timestamp, revision: Number(response.result_revision || 0) };
  }

  function enqueueTripSave(snapshot, expectedUserId) {
    var id = tripIdentity(snapshot, expectedUserId);
    if (isTripDeleted(snapshot, expectedUserId)) return Promise.resolve({ saved: false, reason: 'DELETED' });
    var previous = saveChains.get(id) || Promise.resolve();
    var current = previous.catch(function () {}).then(function () { return performTripSave(snapshot, expectedUserId); });
    saveChains.set(id, current);
    current.then(function () { if (saveChains.get(id) === current) saveChains.delete(id); }, function () { if (saveChains.get(id) === current) saveChains.delete(id); });
    return current.catch(async function (error) {
      if (isStaleSyncSnapshot(snapshot, expectedUserId)) return { saved: false, reason: 'STALE_AFTER_CONFLICT_RESOLUTION' };
      if (acceptRemoteDeletion(snapshot, error, expectedUserId)) throw error;
      if (isTripEditForbidden(error)) {
        var restored = false;
        try {
          var remote = await fetchCloudTripVersion(snapshot.id, snapshot.ownerId, expectedUserId);
          if (remote) {
            if (expectedUserId) assertActiveUser(expectedUserId);
            upsertLocalTrip(remote);
            restored = true;
            window.dispatchEvent(new CustomEvent('travelmate:trip-write-forbidden', {
              detail: { id: snapshot.id, ownerId: remote.ownerId || snapshot.ownerId || null }
            }));
          }
        } catch (refreshError) {
          if (refreshError && refreshError.code === 'AUTH_CONTEXT_CHANGED') throw refreshError;
        }
        if (!restored) updateLocalSyncState(snapshot, 'failed', null, expectedUserId);
        throw error;
      }
      var status = error && (error.code === 'TRIP_CONFLICT' || error.code === 'TRIP_DELETED') ? 'conflict'
        : error && error.code === 'TRIP_WRITE_TIMEOUT' ? 'unknown' : 'failed';
      updateLocalSyncState(snapshot, status, error && error.cloud && error.cloud.result_updated_at, expectedUserId, error && error.cloud && error.cloud.result_revision);
      throw error;
    });
  }

  function saveTrip(trip, expectedUserId, reuseMutation) {
    expectedUserId = expectedUserId || activeUserId();
    if (!expectedUserId && !trip.ownerId) {
      return getSession().then(function (session) {
        var resolvedUserId = session && session.user ? String(session.user.id) : '';
        if (isTripDeleted(trip, resolvedUserId)) return { saved: false, reason: 'DELETED' };
        return enqueueTripSave(prepareTripSave(trip, reuseMutation), resolvedUserId);
      });
    }
    if (isTripDeleted(trip, expectedUserId)) return Promise.resolve({ saved: false, reason: 'DELETED' });
    if (expectedUserId) assertActiveUser(expectedUserId);
    return enqueueTripSave(prepareTripSave(trip, reuseMutation), expectedUserId);
  }

  function deleteTrip(trip, expectedUserId) {
    expectedUserId = expectedUserId || activeUserId();
    var id = tripIdentity(trip, expectedUserId);
    if (expectedUserId) assertActiveUser(expectedUserId);
    var deletionKey = deletionIdentity(trip, expectedUserId);
    var timerKey = tripIdentity(trip, expectedUserId);
    trip.deletePending = true;
    trip.deleteMutationId = trip.deleteMutationId || mutationId();
    trip.syncStatus = 'pending';
    upsertLocalTrip(cloneTrip(trip));
    deletedTripIds.add(deletionKey);
    clearTimeout(saveTimers.get(timerKey));
    saveTimers.delete(timerKey);
    var previous = saveChains.get(id) || Promise.resolve();
    var current = previous.catch(function () {}).then(async function () {
      var client = await getClient();
      var session = await getSession();
      if (expectedUserId && (!session || !session.user || String(session.user.id) !== String(expectedUserId))) throw authContextError();
      if (!session || !session.user) {
        deletedTripIds.delete(deletionKey);
        return { deleted: false, reason: 'SIGNED_OUT' };
      }
      var ownerId = String(trip && trip.ownerId || session.user.id);
      if (ownerId !== String(session.user.id)) throw new Error('TRIP_DELETE_FORBIDDEN');
      var result;
      var response;
      if (typeof client.rpc === 'function') {
        result = await runBoundedWrite(client.rpc('delete_travel_trip', {
          p_owner_id: ownerId,
          p_trip_id: String(trip.id),
          p_expected_revision: Number(trip.cloudRevision || 0) || null,
          p_expected_updated_at: trip.cloudRevision ? null : (trip.cloudUpdatedAt || null),
          p_mutation_id: trip.deleteMutationId
        }));
        if (result.error) {
          if (isMissingRpc(result.error, 'delete_travel_trip')) throw cloudError('TRIP_SYNC_RPC_UNAVAILABLE', result.error);
          throw result.error;
        }
        response = Array.isArray(result.data) ? result.data[0] : result.data;
        if (response && response.result_status === 'conflict') throw cloudError('TRIP_CONFLICT', response);
      }
      if (!response) {
        result = await runBoundedWrite(client.from('travel_trips').delete()
          .eq('user_id', ownerId).eq('id', String(trip.id)).select('id').maybeSingle());
        if (result.error) throw result.error;
      }
      if (expectedUserId) assertActiveUser(expectedUserId);
      removeLocalTrip(trip.id, ownerId);
      window.dispatchEvent(new CustomEvent('travelmate:trip-deleted', { detail: { id: trip.id, ownerId: ownerId } }));
      return { deleted: true };
    });
    saveChains.set(id, current);
    current.then(function () { if (saveChains.get(id) === current) saveChains.delete(id); }, function (error) {
      deletedTripIds.delete(deletionKey);
      updateLocalSyncState(trip, error && error.code === 'TRIP_CONFLICT' ? 'conflict'
        : error && error.code === 'TRIP_WRITE_TIMEOUT' ? 'unknown' : 'failed', error && error.cloud && error.cloud.result_updated_at, expectedUserId, error && error.cloud && error.cloud.result_revision);
      if (saveChains.get(id) === current) saveChains.delete(id);
    });
    return current;
  }

  function queueTripSave(trip, delay) {
    var expectedUserId = activeUserId();
    var expectedGeneration = authGeneration;
    if (isTripDeleted(trip, expectedUserId)) return;
    var snapshot = prepareTripSave(trip);
    var id = tripIdentity(snapshot, expectedUserId);
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(function () {
      saveTimers.delete(id);
      if (expectedGeneration !== authGeneration || activeUserId() !== String(expectedUserId || '')) return;
      enqueueTripSave(snapshot, expectedUserId).catch(function (error) {
        console.error('TravelMate cloud save failed', error);
        window.dispatchEvent(new CustomEvent('travelmate:sync-error', { detail: error }));
      });
    }, typeof delay === 'number' ? delay : 650));
  }

  async function getTrip(id, expectedOwnerId) {
    if (expectedOwnerId && isTripDeleted(id, expectedOwnerId)) return null;
    var session = await getSession();
    var local = findLocalTrip(id, expectedOwnerId);
    if (!session || !session.user) return local || null;
    await assertMfaReadyForPersonalData();
    var requestUserId = String(session.user.id);
    var deletionOwnerId = expectedOwnerId || local && local.ownerId || requestUserId;
    if (isTripDeleted(id, deletionOwnerId)) return null;
    var client = await getClient();
    var result = await client.from('travel_trips').select('*')
      .eq('id', String(id))
      .order('updated_at', { ascending: false })
      .limit(10);
    assertActiveUser(requestUserId);
    if (isTripDeleted(id, deletionOwnerId)) return null;
    if (result.error) throw result.error;
    local = findLocalTrip(id, expectedOwnerId);
    var rows = result.data || [];
    var ownerId = expectedOwnerId || (local && local.ownerId);
    var row = rows.find(function (item) {
      return ownerId && String(item.user_id) === String(ownerId);
    }) || rows.find(function (item) {
      return String(item.user_id) === String(session.user.id);
    }) || rows[0];
    if (!row) {
      if (local && local.ownerId && String(local.ownerId) !== String(session.user.id)) {
        removeLocalTrip(local.id, local.ownerId);
        return null;
      }
      if (local) {
        try { await saveTrip(local, requestUserId, true); }
        catch (error) { if (acceptRemoteDeletion(local, error, requestUserId)) return null; throw error; }
      }
      if (isTripDeleted(id)) return null;
      return local || null;
    }
    var cloud = fromRow(row);
    if (isTripDeleted(cloud, requestUserId)) return null;
    if (local && !local.ownerId) {
      local.ownerId = cloud.ownerId;
      upsertLocalTrip(local);
    }
    if (!local || shouldUseCloudTrip(local, cloud)) {
      upsertLocalTrip(cloud);
      return cloud;
    }
    var localConflict = String(local.syncStatus || '') === 'conflict';
    var legacyLocalAhead = !tripRevision(local) && !tripRevision(cloud)
      && tripTimestamp(local) > tripTimestamp(cloud);
    var localNeedsSave = (hasUnsyncedChanges(local) && !localConflict) || legacyLocalAhead;
    if (local.ownerId && String(local.ownerId) !== requestUserId && (localConflict || localNeedsSave)) {
      var editable = await canEditSharedTrip(local.ownerId, local.id);
      assertActiveUser(requestUserId);
      if (!editable) {
        upsertLocalTrip(cloud);
        return cloud;
      }
    }
    if (localConflict) return local;
    if (localNeedsSave) {
      try { await saveTrip(local, requestUserId, true); }
      catch (error) {
        if (acceptRemoteDeletion(local, error, requestUserId)) return null;
        if (error && error.code === 'TRIP_CONFLICT') return localTripFor(local) || local;
        throw error;
      }
      if (isTripDeleted(id, expectedOwnerId || local && local.ownerId || requestUserId)) return null;
      return localTripFor(local) || local;
    }
    return local;
  }

  async function acceptTripInvite(token) {
    var client = await getClient();
    var session = await getSession();
    if (!session || !session.user) return { accepted: false, reason: 'SIGNED_OUT' };
    var result = await client.rpc('accept_trip_invite', { p_token: token });
    if (result.error) throw result.error;
    return { accepted: true, trip: result.data };
  }

  async function createTripInvite(ownerId, tripId, role) {
    var client = await getClient();
    var result = await client.rpc('create_trip_invite', {
      p_trip_owner_id: ownerId,
      p_trip_id: String(tripId),
      p_role: role === 'viewer' ? 'viewer' : 'editor'
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function listTripMembers(ownerId, tripId) {
    var client = await getClient();
    var result = await client.from('trip_members').select('user_id,display_name,role,joined_at')
      .eq('trip_owner_id', ownerId).eq('trip_id', String(tripId)).order('joined_at', { ascending: true });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function updateTripMember(ownerId, tripId, userId, role) {
    var client = await getClient();
    var result = await client.rpc('update_trip_member_role', {
      p_trip_owner_id: ownerId,
      p_trip_id: String(tripId),
      p_user_id: userId,
      p_role: role === 'viewer' ? 'viewer' : 'editor'
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function removeTripMember(ownerId, tripId, userId) {
    var client = await getClient();
    var result = await client.rpc('remove_trip_member', {
      p_trip_owner_id: ownerId,
      p_trip_id: String(tripId),
      p_user_id: userId
    });
    if (result.error) throw result.error;
    return result.data === true;
  }

  async function listTripMessages(ownerId, tripId) {
    var client = await getClient();
    var result = await client.from('trip_messages').select('id,sender_user_id,body,created_at')
      .eq('trip_owner_id', ownerId).eq('trip_id', String(tripId))
      .order('created_at', { ascending: false }).limit(100);
    if (result.error) throw result.error;
    return (result.data || []).reverse();
  }

  async function sendTripMessage(ownerId, tripId, body) {
    var client = await getClient();
    var session = await getSession();
    if (!session || !session.user) throw new Error('SIGNED_OUT');
    var result = await client.from('trip_messages').insert({
      trip_owner_id: ownerId,
      trip_id: String(tripId),
      sender_user_id: session.user.id,
      body: String(body || '').trim()
    }).select('id,sender_user_id,body,created_at').single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function subscribeToSharedTrip(ownerId, tripId, callbacks) {
    var client = await getClient();
    var session = await getSession();
    var subscriberUserId = session && session.user ? String(session.user.id) : '';
    callbacks = callbacks || {};
    var channel = client.channel('travelmate-trip:' + ownerId + ':' + tripId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'travel_trips', filter: 'id=eq.' + String(tripId) }, function (payload) {
        if (activeUserId() !== subscriberUserId) return;
        if (!payload.new || String(payload.new.user_id) !== String(ownerId)) return;
        var incoming = fromRow(payload.new);
        if (!acceptCloudTrip(incoming)) return;
        if (!session || String(payload.new.updated_by || '') !== String(session.user.id)) {
          if (callbacks.onTripUpdate) callbacks.onTripUpdate(incoming);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: 'trip_id=eq.' + String(tripId) }, function (payload) {
        if (activeUserId() !== subscriberUserId) return;
        var row = payload.new || payload.old;
        if (row && String(row.trip_owner_id) === String(ownerId) && callbacks.onMembersChange) callbacks.onMembersChange(payload);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_messages', filter: 'trip_id=eq.' + String(tripId) }, function (payload) {
        if (activeUserId() !== subscriberUserId) return;
        if (payload.new && String(payload.new.trip_owner_id) === String(ownerId) && callbacks.onMessage) callbacks.onMessage(payload.new);
      });
    await channel.subscribe();
    return function () { client.removeChannel(channel); };
  }

  async function canEditSharedTrip(ownerId, tripId) {
    var client = await getClient();
    if (typeof client.rpc !== 'function') return true;
    var result = await client.rpc('can_edit_trip', {
      p_owner: ownerId,
      p_trip_id: String(tripId)
    });
    if (result.error) throw result.error;
    return result.data === true;
  }

  async function fetchCloudTripVersion(tripId, ownerId, expectedUserId) {
    if (expectedUserId) assertActiveUser(expectedUserId);
    await assertMfaReadyForPersonalData();
    var client = await getClient();
    var result = await client.from('travel_trips').select('*')
      .eq('id', String(tripId))
      .eq('user_id', String(ownerId))
      .maybeSingle();
    if (expectedUserId) assertActiveUser(expectedUserId);
    if (result.error) throw result.error;
    return result.data ? fromRow(result.data) : null;
  }

  async function resolveTripConflict(tripId, ownerId, strategy) {
    strategy = String(strategy || '').toLowerCase();
    if (strategy !== 'local' && strategy !== 'cloud') throw cloudError('INVALID_CONFLICT_STRATEGY');

    var session = await getSession();
    if (!session || !session.user) throw cloudError('SIGNED_OUT');
    var requestUserId = String(session.user.id);
    assertActiveUser(requestUserId);

    var local = findLocalTrip(tripId, ownerId);
    if (!local || String(local.syncStatus || '') !== 'conflict') throw cloudError('TRIP_CONFLICT_NOT_FOUND');
    var resolvedOwnerId = String(ownerId || local.ownerId || requestUserId);
    var cloud = await fetchCloudTripVersion(tripId, resolvedOwnerId, requestUserId);
    if (!cloud) throw cloudError('TRIP_CONFLICT_REMOTE_UNAVAILABLE');

    invalidatePendingTripSync(local, resolvedOwnerId);

    if (strategy === 'cloud') {
      upsertLocalTrip(cloud);
      window.dispatchEvent(new CustomEvent('travelmate:trip-conflict-resolved', {
        detail: { id: cloud.id, ownerId: cloud.ownerId, strategy: 'cloud', revision: cloud.cloudRevision }
      }));
      return { resolved: true, strategy: 'cloud', trip: cloud };
    }

    if (resolvedOwnerId !== requestUserId) {
      var editable = await canEditSharedTrip(resolvedOwnerId, tripId);
      assertActiveUser(requestUserId);
      if (!editable) throw cloudError('TRIP_EDIT_FORBIDDEN');
    }

    var candidate = cloneTrip(local);
    candidate.ownerId = cloud.ownerId;
    candidate.cloudRevision = cloud.cloudRevision;
    candidate.cloudUpdatedAt = cloud.cloudUpdatedAt;
    delete candidate.syncConflict;
    delete candidate.syncMutationId;
    await saveTrip(candidate, requestUserId, false);
    var resolved = localTripFor(candidate) || candidate;
    window.dispatchEvent(new CustomEvent('travelmate:trip-conflict-resolved', {
      detail: { id: resolved.id, ownerId: resolved.ownerId, strategy: 'local', revision: resolved.cloudRevision }
    }));
    return { resolved: true, strategy: 'local', trip: resolved };
  }

  async function performLocalTripSync(session, syncUserId) {
    assertActiveUser(syncUserId);
    await assertMfaReadyForPersonalData();
    assertActiveUser(syncUserId);
    var localTrips = getLocalTrips().filter(function (trip) { return !isTripDeleted(trip); });
    var cloudState = await Promise.all([listCloudTrips(), listCloudTripTombstones()]);
    var cloudTrips = cloudState[0];
    var tombstones = cloudState[1];
    assertActiveUser(syncUserId);
    var tombstoneIds = new Set(tombstones.map(function (trip) { return tripIdentity(trip, syncUserId); }));
    tombstones.forEach(function (trip) {
      deletedTripIds.add(deletionIdentity(trip, syncUserId));
      removeLocalTrip(trip.id, trip.ownerId);
    });
    localTrips = localTrips.filter(function (trip) { return !tombstoneIds.has(tripIdentity(trip, syncUserId)); });
    cloudTrips = cloudTrips.filter(function (trip) { return !isTripDeleted(trip); });
    localTrips = mergeTripLists([localTrips], syncUserId);
    cloudTrips = mergeTripLists([cloudTrips], syncUserId);
    var accessibleCloudIds = new Set(cloudTrips.map(function (trip) { return tripIdentity(trip, syncUserId); }));
    var cloudById = new Map(cloudTrips.map(function (trip) { return [tripIdentity(trip, syncUserId), trip]; }));
    var readOnlySharedIds = new Set();
    var merged = await Promise.all(localTrips.map(async function (local) {
      assertActiveUser(syncUserId);
      if (isTripDeleted(local)) return null;
      if (local.deletePending) {
        await deleteTrip(local, syncUserId);
        assertActiveUser(syncUserId);
        return null;
      }
      var identity = tripIdentity(local, syncUserId);
      var cloud = cloudById.get(identity);
      cloudById.delete(identity);
      if (!cloud) {
        if (local.ownerId && String(local.ownerId) !== syncUserId) {
          removeLocalTrip(local.id, local.ownerId);
          return null;
        }
        try { await saveTrip(local, syncUserId, true); }
        catch (error) { if (acceptRemoteDeletion(local, error, syncUserId)) return null; throw error; }
        assertActiveUser(syncUserId);
        if (isTripDeleted(local)) return null;
        return localTripFor(local) || local;
      }
      if (shouldUseCloudTrip(local, cloud)) return cloud;
      var localConflict = String(local.syncStatus || '') === 'conflict';
      var legacyLocalAhead = !tripRevision(local) && !tripRevision(cloud)
        && tripTimestamp(local) > tripTimestamp(cloud);
      var localNeedsSave = (hasUnsyncedChanges(local) && !localConflict) || legacyLocalAhead;
      if (local.ownerId && String(local.ownerId) !== syncUserId && (localConflict || localNeedsSave)) {
        var editable = await canEditSharedTrip(local.ownerId, local.id);
        assertActiveUser(syncUserId);
        if (!editable) {
          readOnlySharedIds.add(identity);
          removeLocalTrip(local.id, local.ownerId);
          upsertLocalTrip(cloud);
          return cloud;
        }
      }
      if (localConflict) return local;
      if (localNeedsSave) {
        try { await saveTrip(local, syncUserId, true); }
        catch (error) {
          if (acceptRemoteDeletion(local, error, syncUserId)) return null;
          if (error && error.code === 'TRIP_CONFLICT') return localTripFor(local) || local;
          throw error;
        }
        assertActiveUser(syncUserId);
        if (isTripDeleted(local)) return null;
        return localTripFor(local) || local;
      }
      return local;
    }));
    merged = merged.filter(Boolean);
    cloudById.forEach(function (trip) { if (!isTripDeleted(trip)) merged.push(trip); });
    assertActiveUser(syncUserId);
    var latestLocalTrips = getLocalTrips().filter(function (trip) {
      if (isTripDeleted(trip)) return false;
      if (!trip.ownerId || String(trip.ownerId) === syncUserId) return true;
      var identity = tripIdentity(trip, syncUserId);
      return accessibleCloudIds.has(identity) && !readOnlySharedIds.has(identity);
    });
    merged = mergeTripLists([merged, latestLocalTrips], syncUserId)
      .filter(function (trip) { return !isTripDeleted(trip); });
    merged.sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
    assertActiveUser(syncUserId);
    setLocalTrips(merged);
    window.dispatchEvent(new CustomEvent('travelmate:canonical-trip-replaced', { detail: { userId: syncUserId, generation: authGeneration, trips: merged, source: 'cloud-sync' } }));
    return merged;
  }

  function syncLocalTrips() {
    var requestedUserId = activeUserId();
    var syncKey = requestedUserId || '__session__';
    if (fullSyncPromises.has(syncKey)) return fullSyncPromises.get(syncKey);
    var syncPromise = getSession().then(function (session) {
      if (!session || !session.user) return getLocalTrips();
      var syncUserId = String(session.user.id);
      if (requestedUserId && requestedUserId !== syncUserId) throw authContextError();
      var existing = fullSyncPromises.get(syncUserId);
      if (existing && existing !== syncPromise) return existing;
      fullSyncPromises.set(syncUserId, syncPromise);
      return performLocalTripSync(session, syncUserId);
    });
    fullSyncPromises.set(syncKey, syncPromise);
    syncPromise.then(function () {
      if (fullSyncPromises.get(syncKey) === syncPromise) fullSyncPromises.delete(syncKey);
      fullSyncPromises.forEach(function (value, key) { if (value === syncPromise) fullSyncPromises.delete(key); });
    }, function () {
      if (fullSyncPromises.get(syncKey) === syncPromise) fullSyncPromises.delete(syncKey);
      fullSyncPromises.forEach(function (value, key) { if (value === syncPromise) fullSyncPromises.delete(key); });
    });
    return syncPromise;
  }

  function retryPendingTrips() {
    var pending = getLocalTrips().some(function (trip) { return trip && (trip.syncStatus === 'pending' || trip.syncStatus === 'failed' || trip.syncStatus === 'unknown'); });
    if (!pending) return Promise.resolve([]);
    return syncLocalTrips().then(function (trips) {
      var unsynced = getLocalTrips().some(function (trip) { return trip && (trip.syncStatus === 'pending' || trip.syncStatus === 'failed' || trip.syncStatus === 'unknown'); });
      if (!unsynced) window.dispatchEvent(new CustomEvent('travelmate:sync-restored', { detail: { trips: trips } }));
      return trips;
    }).catch(function (error) {
      window.dispatchEvent(new CustomEvent('travelmate:sync-error', { detail: error }));
      throw error;
    });
  }

  function captchaToken() {
    return window.TravelMateSecurity && typeof window.TravelMateSecurity.getCaptchaToken === 'function'
      ? window.TravelMateSecurity.getCaptchaToken() : undefined;
  }

  async function signIn(email, password) {
    var client = await getClient();
    var token = captchaToken();
    var credentials = { email: email, password: password };
    if (token) credentials.options = { captchaToken: token };
    var result = await client.auth.signInWithPassword(credentials);
    if (result.data && result.data.session && result.data.session.user) activateUserStorage(result.data.session.user.id);
    return result;
  }

  async function signUp(email, password, redirectTo) {
    var client = await getClient();
    var options = { emailRedirectTo: redirectTo };
    var token = captchaToken();
    if (token) options.captchaToken = token;
    var result = await client.auth.signUp({ email: email, password: password, options: options });
    if (result.data && result.data.session && result.data.session.user) activateUserStorage(result.data.session.user.id);
    return result;
  }

  async function resendSignup(email, redirectTo) {
    var client = await getClient();
    return client.auth.resend({ type: 'signup', email: email, options: { emailRedirectTo: redirectTo } });
  }

  async function resetPassword(email, redirectTo) {
    var client = await getClient();
    var options = { redirectTo: redirectTo };
    var token = captchaToken();
    if (token) options.captchaToken = token;
    return client.auth.resetPasswordForEmail(email, options);
  }

  async function updatePassword(password) {
    var client = await getClient();
    return client.auth.updateUser({ password: password });
  }

  async function updateProfile(displayName, preferences) {
    var client = await getClient();
    var normalizedName = String(displayName || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    var input = preferences && typeof preferences === 'object' ? preferences : {};
    var allowed = {
      pace: ['relaxed', 'balanced', 'active'],
      activityDensity: ['light', 'balanced', 'dense'],
      transport: ['walking', 'transit', 'mixed', 'car'],
      tripStyle: ['city', 'culture', 'nature', 'food', 'relaxation', 'mixed'],
      interests: ['culture', 'food', 'nature', 'history', 'shopping', 'nightlife', 'photography', 'relaxation']
    };
    function one(key) {
      return allowed[key].indexOf(String(input[key] || '')) >= 0 ? String(input[key]) : '';
    }
    var interests = Array.isArray(input.interests) ? input.interests.filter(function (item, index, list) {
      return allowed.interests.indexOf(String(item)) >= 0 && list.indexOf(item) === index;
    }).slice(0, 6) : [];
    var normalizedPreferences = {
      pace: one('pace'),
      activityDensity: one('activityDensity'),
      transport: one('transport'),
      tripStyle: one('tripStyle'),
      interests: interests,
      learningEnabled: input.learningEnabled !== false
    };
    var hasPreference = normalizedPreferences.pace || normalizedPreferences.activityDensity ||
      normalizedPreferences.transport || normalizedPreferences.tripStyle || interests.length || input.learningEnabled === false;
    return client.auth.updateUser({
      data: {
        display_name: normalizedName,
        travelmate_preferences: hasPreference ? normalizedPreferences : null
      }
    });
  }

  function authRedirectUrl(hash) {
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var base = local ? new URL(location.pathname.replace(/^\//, ''), 'https://lioracl.github.io/travelmate/') : new URL(location.pathname, location.origin);
    base.search = location.search;
    base.hash = hash || '';
    return base.href;
  }

  async function signOut(scope) {
    var client = await getClient();
    saveTimers.forEach(function (timer) { clearTimeout(timer); });
    saveTimers.clear();
    var result = await client.auth.signOut({ scope: scope === 'global' ? 'global' : 'local' });
    if (!result.error) activateUserStorage(null);
    return result;
  }

  async function listMfaFactors() {
    var client = await getClient();
    return client.auth.mfa.listFactors();
  }

  async function enrollTotp() {
    var client = await getClient();
    return client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'TravelMate' });
  }

  async function challengeAndVerifyTotp(factorId, code) {
    var client = await getClient();
    return client.auth.mfa.challengeAndVerify({ factorId: factorId, code: String(code || '').replace(/\D/g, '') });
  }

  async function unenrollMfa(factorId) {
    var client = await getClient();
    return client.auth.mfa.unenroll({ factorId: factorId });
  }

  async function getAssuranceLevel() {
    var client = await getClient();
    return client.auth.mfa.getAuthenticatorAssuranceLevel();
  }

  async function clearDeviceData() {
    var keys = [];
    for (var index = 0; index < localStorage.length; index += 1) {
      var key = localStorage.key(index);
      if (key && key.indexOf('travelmate-') === 0) keys.push(key);
    }
    keys.forEach(function (key) { localStorage.removeItem(key); });
    sessionStorage.removeItem('travelmate-pending-invite');

    if (typeof caches !== 'undefined' && caches && typeof caches.keys === 'function' && typeof caches.delete === 'function') {
      var cacheNames = await caches.keys();
      await Promise.all(cacheNames.filter(function (name) {
        return /^travelmate-smart-v\d+(?:-20\d{6}-\d+)?$/.test(name);
      }).map(function (name) { return caches.delete(name); }));
    }
    return keys.length;
  }

  async function onAuthChange(callback) {
    var client = await getClient();
    return client.auth.onAuthStateChange(function (event, session) {
      setTimeout(function () {
        activateUserStorage(session && session.user ? session.user.id : null);
        callback(event, session);
      }, 0);
    });
  }

  window.addEventListener('online', function () {
    syncLocalTrips().then(function (trips) {
      var unsynced = getLocalTrips().some(function (trip) {
        return trip && (trip.syncStatus === 'pending' || trip.syncStatus === 'failed' || trip.syncStatus === 'unknown');
      });
      if (!unsynced) window.dispatchEvent(new CustomEvent('travelmate:sync-restored', { detail: { trips: trips } }));
    }).catch(function (error) {
      window.dispatchEvent(new CustomEvent('travelmate:sync-error', { detail: error }));
    });
  });

  window.TravelMateCloud = {
    getClient: getClient,
    getSession: getSession,
    getPrivateStorageSession: getPrivateStorageSession,
    getLocalTrips: getLocalTrips,
    setLocalTrips: setLocalTrips,
    upsertLocalTrip: upsertLocalTrip,
    removeLocalTrip: removeLocalTrip,
    getTrip: getTrip,
    acceptTripInvite: acceptTripInvite,
    createTripInvite: createTripInvite,
    listTripMembers: listTripMembers,
    updateTripMember: updateTripMember,
    removeTripMember: removeTripMember,
    listTripMessages: listTripMessages,
    sendTripMessage: sendTripMessage,
    subscribeToSharedTrip: subscribeToSharedTrip,
    saveTrip: saveTrip,
    deleteTrip: deleteTrip,
    queueTripSave: queueTripSave,
    syncLocalTrips: syncLocalTrips,
    resolveTripConflict: resolveTripConflict,
    signIn: signIn,
    signUp: signUp,
    resendSignup: resendSignup,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    updateProfile: updateProfile,
    authRedirectUrl: authRedirectUrl,
    signOut: signOut,
    listMfaFactors: listMfaFactors,
    enrollTotp: enrollTotp,
    challengeAndVerifyTotp: challengeAndVerifyTotp,
    unenrollMfa: unenrollMfa,
    getAssuranceLevel: getAssuranceLevel,
    clearDeviceData: clearDeviceData,
    onAuthChange: onAuthChange
  };
})();
