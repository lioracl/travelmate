(function () {
  'use strict';
  if (window.TravelMateAppShell) return;
  var root = document.documentElement;
  var header = document.querySelector('body.home-page .home-sidebar, body:not(.home-page) .mobile-header');
  function measureHeader() {
    var height = header && header.getBoundingClientRect().height;
    if (height > 0) root.style.setProperty('--tm-shell-header-height', Math.ceil(height) + 'px');
  }
  if (header && window.ResizeObserver) new ResizeObserver(measureHeader).observe(header);
  measureHeader();
  var capacitor = window.Capacitor;
  var bars = null;
  if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
    root.dataset.nativeShell = capacitor.getPlatform();
    bars = capacitor.Plugins && capacitor.Plugins.SystemBars;
    if (!bars && capacitor.registerPlugin) bars = capacitor.registerPlugin('SystemBars');
  }
  function syncBarContrast() {
    if (bars && bars.setStyle) bars.setStyle({style:root.dataset.theme === 'dark' ? 'DARK' : 'LIGHT'}).catch(function () {});
  }
  syncBarContrast();
  window.addEventListener('travelmate:theme-change', syncBarContrast);
  window.addEventListener('pageshow', measureHeader);
  // Read-only diagnostics: no second source of inset values or persisted state.
  window.TravelMateAppShell = {snapshot:function () {
    var style = getComputedStyle(root);
    return {top:style.getPropertyValue('--tm-safe-top').trim(),bottom:style.getPropertyValue('--tm-safe-bottom').trim(),headerHeight:style.getPropertyValue('--tm-shell-header-height').trim(),viewportHeight:window.visualViewport ? window.visualViewport.height : innerHeight};
  }};
})();
