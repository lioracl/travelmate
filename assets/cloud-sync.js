(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-trips';
  var ACTIVE_USER_KEY = 'travelmate-active-user';
  var USER_STORAGE_PREFIX = 'travelmate-trips-user:';
  var SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/dist/umd/supabase.min.js';
  var SUPABASE_SRI = 'sha384-BmlQlKlDvXvKoxkn5OQuUo/aJQCTXeB+Kls6EccBmG4Kf8AXvp89RtO9MtPxP/r5';
  var saveTimers = new Map();
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

  function activateUserStorage(userId) {
    userId = userId ? String(userId) : '';
    var activeUser = localStorage.getItem(ACTIVE_USER_KEY) || '';
    if (activeUser === userId) return;

    var currentTrips = getLocalTrips();
    if (activeUser) localStorage.setItem(USER_STORAGE_PREFIX + activeUser, JSON.stringify(currentTrips));

    if (!userId) {
      localStorage.removeItem(ACTIVE_USER_KEY);
      setLocalTrips([]);
      return;
    }

    var userStorageKey = USER_STORAGE_PREFIX + userId;
    var hasUserSnapshot = localStorage.getItem(userStorageKey) !== null;
    var userTrips = hasUserSnapshot ? readTripList(userStorageKey) : (activeUser ? [] : currentTrips);
    localStorage.setItem(ACTIVE_USER_KEY, userId);
    localStorage.setItem(userStorageKey, JSON.stringify(userTrips));
    setLocalTrips(userTrips);
  }

  function upsertLocalTrip(trip) {
    var trips = getLocalTrips();
    var index = trips.findIndex(function (item) { return String(item.id) === String(trip.id); });
    if (index === -1) trips.push(trip);
    else trips[index] = trip;
    setLocalTrips(trips);
    return trip;
  }

  function toRow(trip, userId, timestamp) {
    var payload = Object.assign({}, trip, { cloudUpdatedAt: timestamp });
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
      cloudUpdatedAt: row.updated_at
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

  async function listCloudTrips() {
    var client = await getClient();
    var result = await client.from('travel_trips').select('*').order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    return (result.data || []).map(fromRow);
  }

  async function saveTrip(trip) {
    var client = await getClient();
    var session = await getSession();
    if (!session || !session.user) return { saved: false, reason: 'SIGNED_OUT' };
    var timestamp = new Date().toISOString();
    trip.ownerId = String(trip.ownerId || session.user.id);
    trip.cloudUpdatedAt = timestamp;
    upsertLocalTrip(trip);
    var row = toRow(trip, session.user.id, timestamp);
    var result;
    if (String(row.user_id) === String(session.user.id)) {
      result = await client.from('travel_trips').upsert(row, { onConflict: 'user_id,id' });
    } else {
      var update = Object.assign({}, row);
      delete update.user_id;
      delete update.id;
      result = await client.from('travel_trips').update(update)
        .eq('user_id', row.user_id).eq('id', row.id).select('id').maybeSingle();
    }
    if (result.error) throw result.error;
    if (String(row.user_id) !== String(session.user.id) && !result.data) throw new Error('TRIP_EDIT_FORBIDDEN');
    window.dispatchEvent(new CustomEvent('travelmate:trip-synced', { detail: { id: trip.id, timestamp: timestamp } }));
    return { saved: true, timestamp: timestamp };
  }

  function queueTripSave(trip, delay) {
    var id = String(trip.id);
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(function () {
      saveTimers.delete(id);
      saveTrip(trip).catch(function (error) {
        console.error('TravelMate cloud save failed', error);
        window.dispatchEvent(new CustomEvent('travelmate:sync-error', { detail: error }));
      });
    }, typeof delay === 'number' ? delay : 650));
  }

  async function getTrip(id, expectedOwnerId) {
    var session = await getSession();
    var local = getLocalTrips().find(function (trip) { return String(trip.id) === String(id); });
    if (!session || !session.user) return local || null;
    var client = await getClient();
    var query = client.from('travel_trips').select('*').eq('id', String(id));
    var ownerId = expectedOwnerId || (local && local.ownerId);
    if (ownerId) query = query.eq('user_id', String(ownerId));
    var result = await query.maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      if (local && local.ownerId && String(local.ownerId) !== String(session.user.id)) return null;
      if (local) await saveTrip(local);
      return local || null;
    }
    var cloud = fromRow(result.data);
    if (!local || Date.parse(cloud.cloudUpdatedAt || 0) >= Date.parse(local.cloudUpdatedAt || 0)) {
      upsertLocalTrip(cloud);
      return cloud;
    }
    await saveTrip(local);
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
    callbacks = callbacks || {};
    var channel = client.channel('travelmate-trip:' + ownerId + ':' + tripId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'travel_trips', filter: 'id=eq.' + String(tripId) }, function (payload) {
        if (!payload.new || String(payload.new.user_id) !== String(ownerId)) return;
        var incoming = fromRow(payload.new);
        upsertLocalTrip(incoming);
        if (!session || String(payload.new.updated_by || '') !== String(session.user.id)) {
          if (callbacks.onTripUpdate) callbacks.onTripUpdate(incoming);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: 'trip_id=eq.' + String(tripId) }, function (payload) {
        var row = payload.new || payload.old;
        if (row && String(row.trip_owner_id) === String(ownerId) && callbacks.onMembersChange) callbacks.onMembersChange(payload);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_messages', filter: 'trip_id=eq.' + String(tripId) }, function (payload) {
        if (payload.new && String(payload.new.trip_owner_id) === String(ownerId) && callbacks.onMessage) callbacks.onMessage(payload.new);
      });
    await channel.subscribe();
    return function () { client.removeChannel(channel); };
  }

  async function syncLocalTrips() {
    var session = await getSession();
    var localTrips = getLocalTrips();
    if (!session || !session.user) return localTrips;
    var cloudTrips = await listCloudTrips();
    var localById = new Map(localTrips.map(function (trip) { return [String(trip.id), trip]; }));
    var cloudById = new Map(cloudTrips.map(function (trip) { return [String(trip.id), trip]; }));
    var merged = [];

    for (var localIndex = 0; localIndex < localTrips.length; localIndex += 1) {
      var local = localTrips[localIndex];
      var cloud = cloudById.get(String(local.id));
      if (!cloud) {
        if (local.ownerId && String(local.ownerId) !== String(session.user.id)) continue;
        await saveTrip(local);
        merged.push(local);
      } else if (Date.parse(local.cloudUpdatedAt || 0) > Date.parse(cloud.cloudUpdatedAt || 0)) {
        await saveTrip(local);
        merged.push(local);
      } else {
        merged.push(cloud);
      }
      cloudById.delete(String(local.id));
    }
    cloudById.forEach(function (trip) { merged.push(trip); });
    merged.sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
    setLocalTrips(merged);
    return merged;
  }

  async function signIn(email, password) {
    var client = await getClient();
    var result = await client.auth.signInWithPassword({ email: email, password: password });
    if (result.data && result.data.session && result.data.session.user) activateUserStorage(result.data.session.user.id);
    return result;
  }

  async function signUp(email, password, redirectTo) {
    var client = await getClient();
    var result = await client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: redirectTo } });
    if (result.data && result.data.session && result.data.session.user) activateUserStorage(result.data.session.user.id);
    return result;
  }

  async function resendSignup(email, redirectTo) {
    var client = await getClient();
    return client.auth.resend({ type: 'signup', email: email, options: { emailRedirectTo: redirectTo } });
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

  async function signOut() {
    var client = await getClient();
    saveTimers.forEach(function (timer) { clearTimeout(timer); });
    saveTimers.clear();
    var result = await client.auth.signOut();
    if (!result.error) activateUserStorage(null);
    return result;
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

  window.TravelMateCloud = {
    getClient: getClient,
    getSession: getSession,
    getLocalTrips: getLocalTrips,
    setLocalTrips: setLocalTrips,
    upsertLocalTrip: upsertLocalTrip,
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
    queueTripSave: queueTripSave,
    syncLocalTrips: syncLocalTrips,
    signIn: signIn,
    signUp: signUp,
    resendSignup: resendSignup,
    updatePassword: updatePassword,
    authRedirectUrl: authRedirectUrl,
    signOut: signOut,
    onAuthChange: onAuthChange
  };
})();
