(function () {
  'use strict';
  // This page receives no account data, password or session. Tokens stay in memory.
  var parentOrigin = 'https://localhost';
  var nonce = new URLSearchParams(location.hash.slice(1)).get('nonce');
  if (window.parent === window || !/^[a-f0-9]{32}$/.test(nonce || '')) return;
  var initialized = false;
  function send(type, value) {
    window.parent.postMessage({ channel: 'travelmate-captcha', nonce: nonce, type: type, value: value || '' }, parentOrigin);
  }
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.origin !== parentOrigin || event.source !== window.parent || !data || data.channel !== 'travelmate-captcha' || data.nonce !== nonce || data.type !== 'init' || initialized) return;
    initialized = true;
    var script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onerror = function () { send('error', 'script'); };
    script.onload = function () {
      try {
        window.turnstile.render('#challenge', {
          sitekey: '0x4AAAAAAEPl5T3VCWJgnHPE',
          theme: data.theme === 'dark' ? 'dark' : 'light',
          callback: function (token) { send('token', token); },
          'expired-callback': function () { send('expired'); },
          'error-callback': function (code) { send('error', String(code || 'challenge')); }
        });
      } catch (error) { send('error', 'render'); }
    };
    document.head.appendChild(script);
  });
  send('ready');
})();
