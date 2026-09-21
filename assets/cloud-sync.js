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
  var lastSaveTime = 0;
  var fullSyncPromises = new Map();
  var deletedTripIds = new Set();
  var clientPromise;

  function loadLibrary() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (window.travelMateSupabaseLoader) return window.travelMateSupabaseLoader;
    window.travelMateSupabaseLoader = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = SUPABASE_CDN;
      script.integrity = SUPABASE_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = function () { resolve(window.supabase); };
      script.onerror = function () { reject(new Error('SUPABASE_LIBRARY_FAILED')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      window.travelMateSupabaseLoader = null;
      throw error;
    });
    return window.travelMateSupabaseLoader;
  }

  function getClient() {
    if (window.__travelMateSupabaseClient) return Promise.resolve(window.__travelMateSupabaseClient);
    if (clientPromise) return clientPromise;
    clientPromise = loadLibrary().then(function (library) {
      var config = window.TRAVELMATE_SUPABASE;
      if (!config || !config.url || !config.publishableKey) throw new Error('SUPABASE_NOT_CONFIGURED');
      window.__travelMateSupabaseClient = library.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return window.__travelMateSupabaseClient;
    });
    return clientPromise;
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

  function newestTrip(left, right) {
    var leftTime = tripTimestamp(left);
    var rightTime = tripTimestamp(right);
    return rightTime > leftTime ? right : left;
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

  function activateUserStorage(userId) {
    userId = userId ? String(userId) : '';
    var activeUser = localStorage.getItem(ACTIVE_USER_KEY) || '';
    if (activeUser === userId) {
      if (userId) {
        var activeSnapshotKey = USER_STORAGE_PREFIX + userId;
        var currentActiveTrips = getLocalTrips();
        var recoveredActiveTrips = mergeTripLists([currentActiveTrips, readTripList(activeSnapshotKey)], userId);
        localStorage.setItem(activeSnapshotKey, JSON.stringify(recoveredActiveTrips));
        if (JSON.stringify(recoveredActiveTrips) !== JSON.stringify(currentActiveTrips)) setLocalTrips(recoveredActiveTrips);
      }
      return;
    }

    var currentTrips = getLocalTrips();
    if (activeUser) localStorage.setItem(USER_STORAGE_PREFIX + activeUser, JSON.stringify(currentTrips));

    if (!userId) {
      localStorage.removeItem(ACTIVE_USER_KEY);
      setLocalTrips([]);
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
    return Object.assign({}, row.payload || {}, {
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
    if (snapshot.ownerId) trip.ownerId = snapshot.ownerId;
    trip.updatedAt = snapshot.updatedAt;
    trip.syncStatus = snapshot.syncStatus;
    upsertLocalTrip(snapshot);
    window.dispatchEvent(new CustomEvent('travelmate:trip-sync-state', { detail: { id: snapshot.id, status: 'pending', timestamp: snapshot.updatedAt } }));
    return snapshot;
  }

  function updateLocalSyncState(snapshot, status, cloudTimestamp, expectedUserId, cloudRevision) {
    if (expectedUserId && activeUserId() !== String(expectedUserId)) return;
    var current = localTripFor(snapshot);
    if (!current || tripTimestamp(current) > tripTimestamp(snapshot)) return;
    if (snapshot.ownerId) current.ownerId = snapshot.ownerId;
    current.syncStatus = status;
    if (cloudTimestamp) current.cloudUpdatedAt = cloudTimestamp;
    if (Number.isFinite(Number(cloudRevision)) && Number(cloudRevision) > 0) current.cloudRevision = Number(cloudRevision);
    if (status === 'synced') delete current.syncMutationId;
    upsertLocalTrip(current);
    window.dispatchEvent(new CustomEvent('travelmate:trip-sync-state', { detail: { id: snapshot.id, status: status, timestamp: cloudTimestamp || snapshot.updatedAt } }));
  }

  function acceptCloudTrip(incoming) {
    if (isTripDeleted(incoming)) return false;
    var current = localTripFor(incoming);
    if (current && tripTimestamp(current) > tripTimestamp(incoming)) return false;
    upsertLocalTrip(incoming);
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
        p_trip: trip
      }));
      if (result.error && !isMissingRpc(result.error, 'save_travel_trip')) throw result.error;
      if (!result.error) {
        response = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!response || response.result_status === 'conflict') throw cloudError('TRIP_CONFLICT', response);
        if (response.result_status === 'deleted') throw cloudError('TRIP_DELETED', response);
      }
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
    timestamp = response.result_updated_at || timestamp;
    updateLocalSyncState(trip, 'synced', timestamp, expectedUserId, response.result_revision);
    window.dispatchEvent(new CustomEvent('travelmate:trip-synced', { detail: { id: trip.id, timestamp: timestamp, revision: Number(response.result_revision || 0) } }));
    return { saved: true, timestamp: timestamp, revision: Number(response.result_revision || 0) };
  }

  function enqueueTripSave(snapshot, expectedUserId) {
    var id = saveIdentity(snapshot);
    if (isTripDeleted(snapshot, expectedUserId)) return Promise.resolve({ saved: false, reason: 'DELETED' });
    var previous = saveChains.get(id) || Promise.resolve();
    var current = previous.catch(function () {}).then(function () { return performTripSave(snapshot, expectedUserId); });
    saveChains.set(id, current);
    current.then(function () { if (saveChains.get(id) === current) saveChains.delete(id); }, function () { if (saveChains.get(id) === current) saveChains.delete(id); });
    return current.catch(function (error) {
      if (acceptRemoteDeletion(snapshot, error, expectedUserId)) throw error;
      var status = error && (error.code === 'TRIP_CONFLICT' || error.code === 'TRIP_DELETED') ? 'conflict'
        : error && error.code === 'TRIP_WRITE_TIMEOUT' ? 'unknown' : 'failed';
      updateLocalSyncState(snapshot, status, null, expectedUserId, error && error.cloud && error.cloud.result_revision);
      throw error;
    });
  }

  function saveTrip(trip, expectedUserId, reuseMutation) {
    expectedUserId = expectedUserId || activeUserId();
    if (isTripDeleted(trip, expectedUserId)) return Promise.resolve({ saved: false, reason: 'DELETED' });
    if (expectedUserId) assertActiveUser(expectedUserId);
    return enqueueTripSave(prepareTripSave(trip, reuseMutation), expectedUserId);
  }

  function deleteTrip(trip, expectedUserId) {
    var id = saveIdentity(trip);
    expectedUserId = expectedUserId || activeUserId();
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
        if (result.error && !isMissingRpc(result.error, 'delete_travel_trip')) throw result.error;
        if (!result.error) {
          response = Array.isArray(result.data) ? result.data[0] : result.data;
          if (response && response.result_status === 'conflict') throw cloudError('TRIP_CONFLICT', response);
        }
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
        : error && error.code === 'TRIP_WRITE_TIMEOUT' ? 'unknown' : 'failed', null, expectedUserId, error && error.cloud && error.cloud.result_revision);
      if (saveChains.get(id) === current) saveChains.delete(id);
    });
    return current;
  }

  function queueTripSave(trip, delay) {
    var expectedUserId = activeUserId();
    if (isTripDeleted(trip, expectedUserId)) return;
    var snapshot = prepareTripSave(trip);
    var id = tripIdentity(snapshot, expectedUserId);
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(function () {
      saveTimers.delete(id);
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
      if (local && local.ownerId && String(local.ownerId) !== String(session.user.id)) return null;
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
    if (!local || tripTimestamp(cloud) >= tripTimestamp(local)) {
      upsertLocalTrip(cloud);
      return cloud;
    }
    try { await saveTrip(local, requestUserId, true); }
    catch (error) { if (acceptRemoteDeletion(local, error, requestUserId)) return null; throw error; }
    if (isTripDeleted(id, expectedOwnerId || local && local.ownerId || requestUserId)) return null;
    return localTripFor(local) || local;
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
    var result = await client.from('trip_members').update({ role: role === 'viewer' ? 'viewer' : 'editor' })
      .eq('trip_owner_id', ownerId).eq('trip_id', String(tripId)).eq('user_id', userId);
    if (result.error) throw result.error;
    return true;
  }

  async function removeTripMember(ownerId, tripId, userId) {
    var client = await getClient();
    var result = await client.from('trip_members').delete()
      .eq('trip_owner_id', ownerId).eq('trip_id', String(tripId)).eq('user_id', userId);
    if (result.error) throw result.error;
    return true;
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

  async function performLocalTripSync(session, syncUserId) {
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
    var cloudById = new Map(cloudTrips.map(function (trip) { return [tripIdentity(trip, syncUserId), trip]; }));
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
        if (local.ownerId && String(local.ownerId) !== syncUserId) return null;
        try { await saveTrip(local, syncUserId, true); }
        catch (error) { if (acceptRemoteDeletion(local, error, syncUserId)) return null; throw error; }
        assertActiveUser(syncUserId);
        if (isTripDeleted(local)) return null;
        return localTripFor(local) || local;
      } else if (tripTimestamp(local) > tripTimestamp(cloud)) {
        try { await saveTrip(local, syncUserId, true); }
        catch (error) { if (acceptRemoteDeletion(local, error, syncUserId)) return null; throw error; }
        assertActiveUser(syncUserId);
        if (isTripDeleted(local)) return null;
        return localTripFor(local) || local;
      }
      return cloud;
    }));
    merged = merged.filter(Boolean);
    cloudById.forEach(function (trip) { if (!isTripDeleted(trip)) merged.push(trip); });
    assertActiveUser(syncUserId);
    merged = mergeTripLists([merged, getLocalTrips().filter(function (trip) { return !isTripDeleted(trip); })], syncUserId)
      .filter(function (trip) { return !isTripDeleted(trip); });
    merged.sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
    assertActiveUser(syncUserId);
    setLocalTrips(merged);
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

  function clearDeviceData() {
    var keys = [];
    for (var index = 0; index < localStorage.length; index += 1) {
      var key = localStorage.key(index);
      if (key && key.indexOf('travelmate-') === 0) keys.push(key);
    }
    keys.forEach(function (key) { localStorage.removeItem(key); });
    sessionStorage.removeItem('travelmate-pending-invite');
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

  window.addEventListener('online', function () { retryPendingTrips().catch(function () {}); });

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
    signIn: signIn,
    signUp: signUp,
    resendSignup: resendSignup,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
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
