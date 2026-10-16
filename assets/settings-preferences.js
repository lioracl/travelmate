(function (root, factory) {
  'use strict';
  var create = factory();
  if (typeof module === 'object' && module.exports) module.exports = create;
  if (root && !(root.TravelMateSettings && root.TravelMateSettings.getVoicePreferences)) {
    root.TravelMateSettings = Object.assign(root.TravelMateSettings || {}, create(root));
  }
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  var styles = Object.freeze([
    { id: 'auto', label: 'אוטומטי', rate: 1.06, pitch: 1, volume: 1, pauseMs: 50 },
    { id: 'calm', label: 'רגוע', rate: 0.96, pitch: 0.98, volume: 1, pauseMs: 140 },
    { id: 'friendly', label: 'ידידותי', rate: 1.04, pitch: 1.04, volume: 1, pauseMs: 80 },
    { id: 'professional', label: 'מקצועי', rate: 1.08, pitch: 1, volume: 1, pauseMs: 60 },
    { id: 'energetic', label: 'נמרץ', rate: 1.16, pitch: 1.03, volume: 1, pauseMs: 30 },
    { id: 'clear', label: 'ברור', rate: 1, pitch: 1, volume: 1, pauseMs: 110 }
  ].map(function (style) { return Object.freeze(style); }));
  return function createSettings(win) {
    function account() { try { return String(win.localStorage.getItem('travelmate-active-user') || ''); } catch (error) { return ''; } }
    function key() { return 'travelmate-settings:' + encodeURIComponent(account() || 'guest') + ':mate-voice'; }
    function normalize(value) {
      value = value && typeof value === 'object' ? value : {};
      return Object.freeze({ enabled: value.enabled !== false, autoSend: value.autoSend !== false, autoSpeakReplies: value.autoSpeakReplies !== false, style: styles.some(function (style) { return style.id === value.style; }) ? value.style : 'auto', voiceURI: typeof value.voiceURI === 'string' ? value.voiceURI.slice(0, 500) : '' });
    }
    function get() { try { return normalize(JSON.parse(win.localStorage.getItem(key()) || '{}')); } catch (error) { return normalize({}); } }
    function publish() { win.dispatchEvent(new win.CustomEvent('travelmate:voice-preferences-changed', { detail: { accountId: account(), preferences: get() } })); }
    function set(patch, options) {
      if (options && options.accountId !== undefined && String(options.accountId) !== account()) return null;
      var previous = get(), next = normalize({ autoSpeakReplies: patch && typeof patch.autoSpeakReplies === 'boolean' ? patch.autoSpeakReplies : previous.autoSpeakReplies, autoSend: patch && typeof patch.autoSend === 'boolean' ? patch.autoSend : previous.autoSend, enabled: patch && typeof patch.enabled === 'boolean' ? patch.enabled : previous.enabled, style: patch && patch.style !== undefined ? patch.style : previous.style, voiceURI: patch && patch.voiceURI !== undefined ? patch.voiceURI : previous.voiceURI });
      try { win.localStorage.setItem(key(), JSON.stringify(next)); } catch (error) { return null; }
      publish(); return next;
    }
    win.addEventListener('travelmate:account-context-changed', publish);
    win.addEventListener('storage', function (event) { if (!event.key || event.key === key() || event.key === 'travelmate-active-user') publish(); });
    return { getVoicePreferences: get, setVoicePreferences: set, getVoiceStyles: function () { return styles; } };
  };
});
