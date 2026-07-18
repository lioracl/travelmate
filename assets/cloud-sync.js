(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-trips';
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
      user_id: userId,
      id: String(trip.id),
      country: String(trip.country || ''),
      city: String(trip.city || ''),
      start_date: trip.start,
      end_date: trip.end,
      budget: Number(trip.budget || 0),
      trip_type: String(trip.type || 'סולו'),
      days: Number(trip.days || 1),
      payload: payload,
      updated_at: timestamp
    };
  }

  function fromRow(row) {
    return Object.assign({}, row.payload || {}, {
      id: String(row.id),
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
    return result.data.session;
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
    trip.cloudUpdatedAt = timestamp;
    upsertLocalTrip(trip);
    var result = await client.from('travel_trips').upsert(toRow(trip, session.user.id, timestamp), { onConflict: 'user_id,id' });
    if (result.error) throw result.error;
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

  async function getTrip(id) {
    var local = getLocalTrips().find(function (trip) { return String(trip.id) === String(id); });
    var session = await getSession();
    if (!session || !session.user) return local || null;
    var client = await getClient();
    var result = await client.from('travel_trips').select('*').eq('id', String(id)).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
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
    return client.auth.signInWithPassword({ email: email, password: password });
  }

  async function signUp(email, password, redirectTo) {
    var client = await getClient();
    return client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: redirectTo } });
  }

  async function signOut() {
    var client = await getClient();
    return client.auth.signOut();
  }

  async function onAuthChange(callback) {
    var client = await getClient();
    return client.auth.onAuthStateChange(function (event, session) {
      setTimeout(function () { callback(event, session); }, 0);
    });
  }

  window.TravelMateCloud = {
    getClient: getClient,
    getSession: getSession,
    getLocalTrips: getLocalTrips,
    setLocalTrips: setLocalTrips,
    upsertLocalTrip: upsertLocalTrip,
    getTrip: getTrip,
    saveTrip: saveTrip,
    queueTripSave: queueTripSave,
    syncLocalTrips: syncLocalTrips,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    onAuthChange: onAuthChange
  };
})();
