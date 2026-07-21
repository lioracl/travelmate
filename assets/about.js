(function () {
  'use strict';

  var release = {
    version: '1.2',
    label: 'מד נתונים חכם וחסכוני',
    date: '21 ביולי 2026',
    highlights: [
      'מד שימוש יומי שמזהה Wi-Fi ורשת סלולרית ואינו סופר גלישה ב-Wi-Fi',
      'תכנון וניהול טיולים עם סנכרון בין המחשב לטלפון',
      'כספת מסמכים פרטית, שיתוף קבוצתי וצ׳אט בזמן אמת',
      'עוזר אישי, מזג אוויר, תחבורה, מקומות ומסלולים חכמים',
      'ארכיון טיולים אוטומטי ותצוגה מותאמת לטלפון',
      'אלבום Google Photos וסיכום מסע חכם',
      'סריקת קבלות, הוצאות והמרת אירו לשקלים',
      'אזורים מתקפלים לניווט ברור יותר בטלפון'
    ]
  };
  window.TravelMateRelease = release;

  function modalHtml() {
    return '<section class="about-backdrop" data-about-modal aria-hidden="true"><div class="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title"><header><div class="about-brand"><span><i class="fa-solid fa-route"></i></span><div><small>TravelMate</small><h2 id="about-title">אודות האפליקציה</h2></div></div><button class="about-close" type="button" data-about-close aria-label="סגירת אודות"><i class="fa-solid fa-xmark"></i></button></header><div class="about-content"><div class="about-version"><span>גרסה</span><strong>' + release.version + '</strong><small>' + release.label + ' · ' + release.date + '</small></div><section><h3>הטיול שלך, במקום אחד</h3><p>TravelMate מרכזת את תכנון הטיול, המסלול, המקומות, התחבורה, המסמכים, התקציב והשיחה הקבוצתית בחוויה אחת שמסתנכרנת בין המכשירים.</p></section><section><h3>מה כלול בגרסה הזו?</h3><ul>' + release.highlights.map(function (item) { return '<li><i class="fa-solid fa-circle-check"></i><span>' + item + '</span></li>'; }).join('') + '</ul></section><section class="about-rights"><h3><i class="fa-solid fa-copyright"></i> בעלות וזכויות שימוש</h3><p>© 2026 TravelMate. כל הזכויות שמורות לבעלי האפליקציה: <strong>ליאור אחלאו</strong> ו־<strong>נטלי ציינ׳י</strong>.</p><p>אין להעתיק, לשכפל, להפיץ, לפרסם, לשנות, למסחר או לעשות שימוש בקוד, בעיצוב, בתוכן, במאגרי המידע או במותג ללא אישור מראש ובכתב מבעלי האפליקציה. השימוש באפליקציה מותר בהתאם להרשאה ולתנאים שניתנו על ידי הבעלים.</p><p class="about-third-party">שמות, סמלים ושירותים של ספקים חיצוניים המופיעים באפליקציה שייכים לבעליהם, והשימוש בהם כפוף לתנאים של אותם ספקים.</p></section><section class="about-versioning"><h3>איך מספר הגרסה מתעדכן?</h3><div><span><b>1.0.1</b> תיקון נקודתי</span><span><b>1.1</b> פיצ׳ר או שיפור משמעותי</span><span><b>2.0</b> שינוי עמוק באפליקציה</span></div></section></div><footer><span><i class="fa-solid fa-shield-halved"></i> נבנה כדי לשמור את הטיול פרטי, נגיש ומסודר.</span><button type="button" data-about-close>סגירה</button></footer></div></section>';
  }
  function openAbout() {
    var modal = document.querySelector('[data-about-modal]');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('about-open');
    var close = modal.querySelector('[data-about-close]');
    if (close) close.focus();
  }
  function closeAbout() {
    var modal = document.querySelector('[data-about-modal]');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('about-open');
  }
  function addSidebarEntry() {
    var nav = document.querySelector('.sidebar nav');
    if (!nav || nav.querySelector('[data-about-open]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-about';
    button.dataset.aboutOpen = '';
    button.innerHTML = '<i class="fa-solid fa-circle-info"></i><span class="tip">אודות · גרסה ' + release.version + '</span>';
    button.setAttribute('aria-label', 'אודות TravelMate, גרסה ' + release.version);
    nav.appendChild(button);
  }
  function addHomeEntry() {
    if (document.querySelector('.workspace') || document.querySelector('[data-home-about]')) return;
    var main = document.querySelector('main.content');
    if (!main) return;
    var panel = document.createElement('section');
    panel.className = 'home-about';
    panel.dataset.homeAbout = '';
    panel.innerHTML = '<div><span><i class="fa-solid fa-circle-info"></i></span><div><strong>אודות TravelMate</strong><small>בעלות, זכויות שימוש ומה חדש באפליקציה</small></div></div><button type="button" data-about-open>גרסה ' + release.version + ' · פתיחה</button>';
    main.appendChild(panel);
  }
  function init() {
    if (!document.querySelector('[data-about-modal]')) document.body.insertAdjacentHTML('beforeend', modalHtml());
    addSidebarEntry();
    addHomeEntry();
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-about-open]')) { event.preventDefault(); openAbout(); return; }
      if (event.target.closest('[data-about-close]') || event.target.matches('[data-about-modal]')) closeAbout();
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeAbout(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
