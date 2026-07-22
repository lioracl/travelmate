(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-language';
  var supported = ['he', 'en'];
  var current = readLanguage();
  var originals = new WeakMap();
  var attributeOriginals = new WeakMap();
  var trackedNodes = new Set();
  var trackedElements = new Set();
  var observer;

  var en = {
    'הטיולים שלי': 'My trips', 'לאן נוסעים הפעם?': 'Where are we going this time?',
    'בחר יעד והמשך לתכנון, למסמכים ולליווי בזמן אמת.': 'Choose a destination and continue to planning, documents and real-time travel support.',
    'פתיחת מרכז טיול': 'Open trip center', 'סגירת האפליקציה': 'Close app', 'הוספת יעד חדש': 'Add a new destination',
    'בחר מדינה, עיר ותאריכים — כל הטיול ייבנה אוטומטית.': 'Choose a country, city and dates — the trip will be created automatically.',
    'טיול חדש': 'New trip', 'לאן תרצי לטוס?': 'Where would you like to travel?',
    'אפשר להקליד כל מדינה ועיר בעולם, למשל פראג, צ׳כיה או ברלין, גרמניה.': 'Enter any country and city, for example Prague, Czechia or Berlin, Germany.',
    'מדינה': 'Country', 'עיר': 'City', 'תאריך יציאה': 'Departure date', 'תאריך חזרה': 'Return date',
    'תקציב משוער (€)': 'Estimated budget (€)', 'סוג הטיול': 'Trip type', 'זוגי': 'Couple', 'משפחתי': 'Family',
    'חברים': 'Friends', 'סולו': 'Solo', 'בניית הטיול אוטומטית': 'Build trip automatically',
    'פתיחת הטיול': 'Open trip', 'פעיל': 'Active', 'לא פעיל': 'Inactive', 'ארכיון': 'Archive',
    'הטיולים הפעילים': 'Active trips', 'טיולים בארכיון': 'Archived trips',
    'כל הטיולים': 'All trips', 'סקירה': 'Overview', 'תוכנית': 'Plan', 'מקומות': 'Places', 'מסמכים': 'Documents',
    'תקציב': 'Budget', 'השכרת רכב': 'Car rental', 'טיולים מחוץ לעיר': 'Trips outside the city', 'הקבוצה': 'Group',
    'אלבום וסיכום': 'Album & summary', 'תחבורה ומחירים': 'Transport & prices', 'אודות': 'About',
    'הטיול החדש שלך': 'Your new trip', 'פתיחה במפה': 'Open map', 'משך הטיול': 'Trip length', 'היעד': 'Destination',
    'ניווט': 'Navigate', 'תקציב הטיול': 'Trip budget', 'המלצה ראשונית לחלוקה': 'Initial allocation recommendation',
    'מסלול אוטומטי': 'Automatic itinerary', 'יום לכל תאריך בטיול': 'A day for every trip date',
    'מקומות בעיר': 'Places in the city', 'חיפוש עדכני לפי היעד': 'Up-to-date destination search',
    'מסמכים וקבצים': 'Documents & files', 'שמירה במסד הנתונים': 'Secure cloud storage',
    'חברים, סנכרון וצ׳אט משותף': 'Members, sync and group chat', 'תחבורה חכמה': 'Smart transport',
    'מסלולים, רכבות, מטרו, אוטובוסים ומוניות': 'Routes, trains, metro, buses and taxis',
    'תוכנית יומית': 'Daily itinerary', 'חזרה לטיול': 'Back to trip', 'סגור אזור': 'Collapse section', 'פתח אזור': 'Expand section',
    'יומן TravelMate פנימי ומסונכרן': 'Internal, synchronized TravelMate calendar', 'פתיחת היומן': 'Open calendar',
    'פעילות': 'Activity', 'השלמה חכמה': 'Smart completion', 'סידור לפי שעה': 'Sort by time', 'ייצוא יומן (.ics)': 'Export calendar (.ics)',
    'הוספת פעילות ליום': 'Add activity to day', 'סימון כהושלם': 'Mark complete', 'עריכה': 'Edit', 'מחיקה': 'Delete', 'שמירה': 'Save', 'ביטול': 'Cancel',
    'מקומות ומפה': 'Places & map', 'GPS, מפה וקישורים חכמים': 'GPS, map and smart links',
    'אטרקציות מומלצות': 'Recommended attractions', 'חיפוש אתרים ודירוגים בעיר.': 'Search attractions and ratings in the city.',
    'מסעדות': 'Restaurants', 'אפשרויות אוכל סביב היעד.': 'Food options around the destination.', 'טיולי יום': 'Day trips',
    'מסלולים מחוץ למרכז העיר.': 'Routes outside the city center.', 'תכנון לפני ההגעה או בזמן הטיול': 'Plan before arrival or during the trip',
    'בחירת מקום לפי GPS או מפה': 'Choose a place using GPS or map', 'חיפוש חופשי': 'Free search', 'חיפוש באזור היעד': 'Search destination area',
    'מה מחפשים?': 'What are you looking for?', 'הכול': 'All', 'מסעדות ובתי קפה': 'Restaurants & cafés',
    'אטרקציות ותרבות': 'Attractions & culture', 'טיולים וטבע': 'Trips & nature', 'קניות': 'Shopping',
    'מסעדות כשרות': 'Kosher restaurants', 'בתי קפה כשרים': 'Kosher cafés', 'רדיוס': 'Radius', 'קילומטר': '1 kilometer',
    'חיפוש לפי GPS': 'Search using GPS', 'בחירת נקודה במפה': 'Choose a point on the map', 'חיפוש בעיר היעד': 'Search destination city',
    'איך מגיעים?': 'Directions', 'שיתוף מקום': 'Share place', 'אתר רשמי': 'Official website', 'ציונים וביקורות': 'Ratings & reviews',
    'מיקום מדויק': 'Exact location', 'הוסף ליומן': 'Add to calendar', 'שיתוף חכם': 'Smart share', 'הודעה אישית': 'Personal message',
    'צירוף פריטים מהטיול': 'Add trip items', 'סמן פעילויות או מקומות נוספים שיישלחו יחד עם המיקום.': 'Select activities or places to send with this location.',
    'שליחה ב־WhatsApp': 'Send via WhatsApp', 'כולל המיקום, הטקסט והפריטים שסומנו': 'Includes the location, your message and selected items',
    'שיתוף במכשיר': 'Share on device', 'הודעות, דוא״ל ואפליקציות נוספות': 'Messages, email and other apps',
    'העתקת קישור': 'Copy link', 'קישור חכם למקום ולניווט': 'Smart place and navigation link',
    'כרטיסים, הזמנות וקבצים': 'Tickets, bookings and files', 'העלאת קובץ': 'Upload file', 'כספת המסמכים של הטיול': 'Trip document vault',
    'ענן פרטי ומוצפן': 'Private encrypted cloud', 'העלאת קבצים': 'Upload files', 'יציאה': 'Sign out', 'קטגוריה': 'Category',
    'טיסות': 'Flights', 'לינה': 'Accommodation', 'ביטוח': 'Insurance', 'תחבורה': 'Transport', 'כרטיסים': 'Tickets',
    'דרכון ואשרות': 'Passport & visas', 'אחר': 'Other', 'הצפנה ושמירה': 'Encrypt & save', 'פתיחה': 'Open', 'הורדה': 'Download',
    'העלאה': 'Upload', 'העלאה נוספת': 'Upload another', 'חלוקה התחלתית': 'Initial allocation', 'תקציב כולל': 'Total budget',
    'לינה': 'Accommodation', 'אוכל': 'Food', 'אטרקציות': 'Attractions', 'רזרבה': 'Reserve', 'מעקב מדויק': 'Detailed tracking',
    'הוצאות וקבלות': 'Expenses & receipts', 'הוצאה חדשה': 'New expense', 'נרשם עד עכשיו': 'Recorded so far',
    'תחבורה ציבורית ומחירים': 'Public transport & prices', 'מאיפה?': 'From', 'לאן?': 'To', 'תאריך נסיעה': 'Travel date', 'שעה': 'Time',
    'מה להציג?': 'Show', 'כל האפשרויות': 'All options', 'מטרו ואוטובוסים': 'Metro & buses', 'רכבות': 'Trains', 'מוניות': 'Taxis',
    'חיפוש מסלול ומחיר': 'Search route & price', 'מדריך מחירים': 'Price guide', 'מטרו ואוטובוסים': 'Metro & buses',
    'חיפוש רכב לפי תאריכי הטיול': 'Search cars by trip dates', 'איסוף': 'Pickup', 'החזרה': 'Return', 'תאריך איסוף': 'Pickup date',
    'תאריך החזרה': 'Return date', 'חיפוש': 'Search', 'רישיון ונהגים': 'License & drivers', 'ביטוח ופיקדון': 'Insurance & deposit',
    'כבישי אגרה וחניה': 'Tolls & parking', 'טיולים קצרים מחוץ לעיר': 'Short trips outside the city', 'מציאת טיולים': 'Find trips',
    'כל המטיילים במקום אחד': 'All travelers in one place', 'הקבוצה של הטיול': 'Trip group', 'סנכרון חי': 'Live sync',
    'חברי הטיול': 'Trip members', 'מטיילים': 'travelers', 'הזמנה': 'Invite', 'מנהל הטיול': 'Trip manager', 'יכול לערוך': 'Can edit',
    'רק חברי הטיול יכולים לראות את התוכנית והשיחות.': 'Only trip members can view the itinerary and conversations.',
    'שיחה קבוצתית': 'Group conversation', 'הודעות': 'Messages', 'מחובר בזמן אמת': 'Connected live', 'אתה': 'You',
    'שיתוף מקום בקבוצה': 'Share place with group', 'שליחת הודעה': 'Send message', 'שיתוף מקום בקבוצה': 'Share place with group',
    'אלבום וסיכום הטיול': 'Trip album & summary', 'תמונות, רגעים וסיפור המסע': 'Photos, moments and the story of your journey',
    'אלבום Google Photos': 'Google Photos album', 'פתיחת האלבום': 'Open album', 'הסרת קישור': 'Remove link', 'שמירת קישור': 'Save link',
    'רגע מהטיול': 'Trip moment', 'הוספת תמונות או מסמכים': 'Add photos or documents', 'שמירת רגע': 'Save moment',
    'יומן מסע אוטומטי': 'Automatic travel journal', 'סיכום הטיול': 'Trip summary', 'רענון': 'Refresh', 'שדרוג עם נבו': 'Enhance with Nevo', 'העתקה': 'Copy',
    'מידע נוסף': 'More information', 'מפה וניווט בעיר': 'City map and navigation', 'רקע על העיר והמדינה': 'City and country background',
    'מדריך תיירות': 'Tourism guide', 'חיפוש האתר הרשמי של היעד': 'Find the official destination website',
    'העוזר האישי של TravelMate': 'TravelMate personal assistant', 'נבו · העוזר האישי שלך': 'Nevo · your personal assistant',
    'מוכן לעזור בכל שאלה': 'Ready to help with any question', 'שיחה חדשה': 'New conversation', 'סגירת העוזר': 'Close assistant',
    'מה נשלח?': 'What is shared?', 'בנה לי יום רגוע': 'Build me a relaxed day', 'מה כדאי להזמין מראש?': 'What should I book in advance?',
    'האם התוכנית עמוסה?': 'Is the itinerary too busy?', 'תן לי טיפ מפתיע ליעד': 'Give me a surprising destination tip',
    'הכתבה קולית': 'Voice dictation', 'פתיחת העוזר האישי': 'Open personal assistant', 'פתיחת המרכז החכם': 'Open smart center',
    'מזג האוויר': 'Weather', 'שינוי עמלה': 'Change fee', 'יום מלא': 'Full day', 'חצי יום': 'Half day', 'לילה אחד': 'One night', 'שני לילות': 'Two nights'
  };

  var skipSelector = '[data-no-translate],script,style,noscript,.group-message p,.group-message .message-sender,.saved-place-content h3,.saved-place-content p,.nearby-result h3,.nearby-result p,.trip-card h2,.trip-card p,.memory-item,.document-file-name,[contenteditable="true"]';

  Object.assign(en, {
    'שפת האפליקציה': 'App language', 'עברית': 'Hebrew',
    'סנכרון בין המחשב לטלפון': 'Sync between computer and phone', 'סנכרון עכשיו': 'Sync now', 'שינוי סיסמה': 'Change password',
    'טיולים פעילים': 'Active trips', 'ארכיון הטיולים': 'Trip archive',
    'טיול עתידי יופעל אוטומטית שבוע לפני היציאה': 'A future trip activates automatically one week before departure',
    'מתרחש עכשיו': 'Happening now', 'פעיל ידנית': 'Manually active',
    'אודות TravelMate': 'About TravelMate', 'בעלות, זכויות שימוש ומה חדש באפליקציה': 'Ownership, usage rights and what’s new',
    'פתיחה': 'Open', 'זיהוי רשת מוגבל': 'Limited network detection', 'מצב רשת': 'Network status',
    'ימים': 'days', 'נבנה לפי תאריכי הטיול': 'Built from your trip dates',
    'התוכנית נבנתה לפי התאריכים': 'The itinerary was built from your dates', 'יש חפיפת שעות': 'Time overlap detected',
    'תרבות': 'Culture', 'אטרקציה': 'Attraction', 'סיור': 'Tour', 'ערב': 'Evening', 'דק׳': 'min', 'חפיפה': 'Overlap',
    'אטרקציה מרכזית מומלצת': 'Recommended main attraction', 'ארוחה מקומית מומלצת': 'Recommended local meal',
    'שכונה מיוחדת וזמן חופשי': 'Special neighborhood and free time', 'סיור היכרות במרכז העיר': 'City center orientation tour',
    'שקיעה, תצפית או בילוי ערב': 'Sunset, viewpoint or evening activity', 'בוקר חופשי והתארגנות לחזרה': 'Free morning and departure preparations',
    'בחרי את המיקום הנוכחי שלך, או סמני מראש נקודה בעיר היעד.': 'Use your current location or choose a point in the destination city in advance.',
    'כל מקום נשמר ליום שתבחרי': 'Every place is saved to the day you choose', 'מרכז העיר אותר. אפשר להתחיל לחפש.': 'City center found. You can start searching.',
    '500 מטר': '500 meters', '3 ק״מ': '3 km', '5 ק״מ': '5 km', '10 ק״מ': '10 km',
    'הקבצים מוצפנים במכשיר לפני ההעלאה ונפתחים רק לאחר הזנת סיסמת הכספת.': 'Files are encrypted on your device before upload and open only after entering the vault password.',
    'סיסמת הכספת': 'Vault password', 'הצפנה מקומית': 'Local encryption', 'בחירת קבצים או גרירה לכאן': 'Choose files or drag them here',
    'PDF, תמונות וקובצי Office · עד 25MB לקובץ': 'PDF, images and Office files · up to 25 MB per file',
    'עדיין לא הועלו מסמכים לטיול הזה.': 'No documents have been uploaded for this trip yet.',
    'החלוקה מתעדכנת אוטומטית לפי התקציב הכולל.': 'The allocation updates automatically from the total budget.',
    'סריקת קבלה והוספת הוצאה': 'Scan receipt and add expense', 'אין עדיין הוצאות': 'No expenses yet',
    'חפש מסלול בתחבורה ציבורית, רכבת או מונית וקבל קישורים ישירים לשירותים אמינים.': 'Find a route by public transport, train or taxi with direct links to reliable services.',
    'נקודת מוצא או המיקום שלי': 'Starting point or my location', 'יעד, כתובת או מקום': 'Destination, address or place',
    'בחר נקודת מוצא ויעד כדי לראות אפשרויות.': 'Choose an origin and destination to see options.',
    'השווה הצעות להשכרת רכב לפי תאריכי הטיול והמיקום.': 'Compare car rental offers by trip dates and location.',
    'מצא מסלולים קצרים מחוץ לעיר, כולל אפשרות ללינה.': 'Find short trips outside the city, including overnight options.',
    'כתבו הודעה לקבוצה…': 'Write a message to the group…', 'הקלד הודעה': 'Type a message',
    'שמור רגעים, תמונות ומסמכים מהטיול בלי לקשר אותם לכספת.': 'Save trip moments, photos and documents without linking them to the vault.',
    'כותרת הרגע': 'Moment title', 'מה תרצו לזכור?': 'What would you like to remember?',
    'מכיר את הטיול שלך ויכול לעזור לתכנן, לבדוק עומסים וגם לענות על שאלות כלליות.': 'Knows your trip and can help plan, check pacing and answer general questions.',
    'היי, אני נבו 👋': 'Hi, I’m Nevo 👋', 'הקראה': 'Read aloud', 'העתקה': 'Copy',
    'שאל אותי על הטיול או על כל נושא…': 'Ask me about the trip or anything else…',
    'Enter לשליחה · Shift+Enter לשורה חדשה': 'Enter to send · Shift+Enter for a new line',
    'התשובות נוצרות בעזרת AI. כדאי לאמת מידע חשוב לפני הזמנה או נסיעה.': 'Answers are generated with AI. Verify important information before booking or traveling.',
    'מרכז חכם': 'Smart center', 'כלי הטיול החכמים שלך': 'Your smart travel tools',
    'מעונן': 'Cloudy', 'בהיר': 'Clear', 'גשם קל': 'Light rain',
    'שער ייחוס': 'Reference rate', 'שער ייחוס:': 'Reference rate:', 'כולל עמלת המרה': 'Including conversion fee',
    'כולל עמלת המרה של': 'including a conversion fee of', 'לפי השער היציג': 'At the representative rate',
    'נתוני ECB דרך Frankfurter': 'ECB data via Frankfurter', '· טיול': '· Trip',
    '· התוכנית נבנתה לפי התאריכים': '· itinerary built from your dates',
    'חזרה למסך הקודם בטיול': 'Back to previous trip screen', 'סימון המקום כהושלם': 'Mark place complete',
    'עריכת שעת המקום': 'Edit place time', 'מחיקת המקום': 'Delete place', 'הערות ליום הזה…': 'Notes for this day…',
    'קניות': 'Shopping', 'אטרקציה ותרבות': 'Attraction & culture',
    'הגעה, התמקמות וסיור קל ליד מקום הלינה': 'Arrival, check-in and an easy walk near the accommodation',
    'היכרות עם מרכז העיר והסביבה': 'Explore the city center and surroundings',
    'אתרי החובה והתרבות המקומית': 'Must-see sights and local culture',
    'מצב כללי · אפשר לשאול על כל נושא': 'General mode · ask about anything',
    'היי, אני נבו 👋 העוזר האישי שלך ב־TravelMate. אפשר לשאול אותי על יעדים, תכנון, תקציב, אריזה — או על כל נושא אחר.': 'Hi, I’m Nevo 👋 your personal TravelMate assistant. Ask me about destinations, planning, budgets, packing — or anything else.',
    'עזור לי לבחור יעד': 'Help me choose a destination', 'בנה רשימת אריזה': 'Build a packing list',
    'איך לחסוך בטיול?': 'How can I save on my trip?', 'תן לי רעיון מגניב לסופ״ש': 'Give me a cool weekend idea',
    'הודעה לעוזר': 'Message to assistant', 'AI עשוי לטעות': 'AI can make mistakes'
  });

  function readLanguage() {
    try { var value = localStorage.getItem(STORAGE_KEY); return supported.indexOf(value) > -1 ? value : 'he'; }
    catch (error) { return 'he'; }
  }

  function translateValue(value) {
    var leading = String(value || '').match(/^\s*/)[0];
    var trailing = String(value || '').match(/\s*$/)[0];
    var clean = String(value || '').trim();
    if (!clean) return value;
    if (en[clean]) return leading + en[clean] + trailing;
    var translated = clean
      .replace(/^יום (\d+)$/, 'Day $1')
      .replace(/^(\d+) ימים$/, '$1 days')
      .replace(/^התקדמות: (\d+) מתוך (\d+) פעילויות$/, 'Progress: $1 of $2 activities')
      .replace(/^(\d+) פעילויות · יש חפיפת שעות$/, '$1 activities · time overlap detected')
      .replace(/^(\d+) פעילויות$/, '$1 activities')
      .replace(/^(\d+) מטיילים$/, '$1 travelers')
      .replace(/^גרסה (.+) · פתיחה$/, 'Version $1 · Open')
      .replace(/^אודות · גרסה (.+)$/, 'About · version $1')
      .replace(/^מחובר\/ת בתור$/, 'Signed in as')
      .replace(/^חזרה לכל הטיולים$/, 'Back to all trips')
      .replace(/^הוסף ליומן$/, 'Add to calendar')
      .replace(/^הוספה לתאריך ולשעה$/, 'Add to date and time')
      .replace(/^הכול מסונכרן · (\d+) טיולים זמינים בכל המכשירים$/, 'Everything is synced · $1 trips available on every device')
      .replace(/^דגל (.+)$/, '$1 flag')
      .replace(/^תמונה של (.+)$/, 'Image of $1')
      .replace(/^אודות TravelMate, גרסה (.+)$/, 'About TravelMate, version $1')
      .replace(/^(\d+) ימים · טיול (.+) · התוכנית נבנתה לפי התאריכים$/, '$1 days · $2 trip · itinerary built from your dates')
      .replace(/^(\d+) דק׳( · חפיפה)?$/, function (_, minutes, overlap) { return minutes + ' min' + (overlap ? ' · overlap' : ''); })
      .replace(/^(.+) · (\d+) דק׳( · חפיפה)?$/, function (_, category, minutes, overlap) { return (en[category] || category) + ' · ' + minutes + ' min' + (overlap ? ' · overlap' : ''); })
      .replace(/^כ־(.+) ₪ כולל עמלת המרה של (.+)$/, 'Approx. ₪$1 including a $2 conversion fee')
      .replace(/^כ־(.+) ₪ לפי השער היציג$/, 'Approx. ₪$1 at the representative rate')
      .replace(/^מרכז חכם (\d+) כלים$/, 'Smart center · $1 tools')
      .replace(/^מזג האוויר ב(.+)$/, 'Weather in $1')
      .replace(/^(.+) · מרגיש כמו (.+)$/, function (_, condition, feels) { return (en[condition] || condition) + ' · feels like ' + feels; })
      .replace(/^מכיר את הטיול ל(.+) · ללא מסמכים או GPS$/, 'Knows your trip to $1 · no documents or GPS shared')
      .replace(/^מידע נוסף ל־(.+)$/, 'More information about $1');

    var calendarWords = {
      'יום ראשון': 'Sunday', 'יום שני': 'Monday', 'יום שלישי': 'Tuesday', 'יום רביעי': 'Wednesday',
      'יום חמישי': 'Thursday', 'יום שישי': 'Friday', 'יום שבת': 'Saturday',
      'בינואר': 'January', 'בפברואר': 'February', 'במרץ': 'March', 'באפריל': 'April', 'במאי': 'May', 'ביוני': 'June',
      'ביולי': 'July', 'באוגוסט': 'August', 'בספטמבר': 'September', 'באוקטובר': 'October', 'בנובמבר': 'November', 'בדצמבר': 'December'
    };
    Object.keys(calendarWords).forEach(function (word) { translated = translated.split(word).join(calendarWords[word]); });
    return translated === clean ? value : leading + translated + trailing;
  }

  function shouldSkip(element) {
    return !element || (element.closest && element.closest(skipSelector));
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || shouldSkip(node.parentElement)) return;
    if (!originals.has(node)) { originals.set(node, node.nodeValue); trackedNodes.add(node); }
    var original = originals.get(node);
    node.nodeValue = current === 'en' ? translateValue(original) : original;
  }

  function translateAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || shouldSkip(element)) return;
    var names = ['placeholder', 'title', 'aria-label'];
    if (!attributeOriginals.has(element)) attributeOriginals.set(element, {});
    var saved = attributeOriginals.get(element);
    names.forEach(function (name) {
      if (!element.hasAttribute(name)) return;
      if (!(name in saved)) saved[name] = element.getAttribute(name);
      element.setAttribute(name, current === 'en' ? translateValue(saved[name]) : saved[name]);
      trackedElements.add(element);
    });
  }

  function process(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
    translateAttributes(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node); else translateAttributes(node);
    }
  }

  function applyLanguage(language) {
    current = supported.indexOf(language) > -1 ? language : 'he';
    try { localStorage.setItem(STORAGE_KEY, current); } catch (error) {}
    document.documentElement.lang = current;
    document.documentElement.dir = current === 'en' ? 'ltr' : 'rtl';
    document.body && document.body.classList.toggle('language-english', current === 'en');
    trackedNodes.forEach(function (node) { if (node.isConnected) node.nodeValue = current === 'en' ? translateValue(originals.get(node)) : originals.get(node); });
    trackedElements.forEach(function (element) {
      if (!element.isConnected) return;
      var saved = attributeOriginals.get(element) || {};
      Object.keys(saved).forEach(function (name) { element.setAttribute(name, current === 'en' ? translateValue(saved[name]) : saved[name]); });
    });
    process(document.body);
    var selector = document.querySelector('[data-language-selector]');
    if (selector) {
      selector.setAttribute('aria-label', current === 'en' ? 'App language selection' : 'בחירת שפת האפליקציה');
      var title = selector.querySelector('b');
      var hebrewChoice = selector.querySelector('[data-language-choice="he"]');
      if (title) title.textContent = current === 'en' ? 'App language' : 'שפת האפליקציה';
      if (hebrewChoice) hebrewChoice.textContent = current === 'en' ? 'Hebrew' : 'עברית';
    }
    document.querySelectorAll('[data-language-choice]').forEach(function (button) {
      var selected = button.dataset.languageChoice === current;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    window.dispatchEvent(new CustomEvent('travelmate:language-change', { detail: { language: current } }));
  }

  function createSelector() {
    if (!document.querySelector('[data-trip-list]') || document.querySelector('[data-language-selector]')) return;
    var selector = document.createElement('div');
    selector.className = 'language-selector';
    selector.dataset.languageSelector = '';
    selector.dataset.noTranslate = '';
    selector.setAttribute('aria-label', 'בחירת שפת האפליקציה');
    selector.innerHTML = '<span><i class="fa-solid fa-language"></i><b>שפת האפליקציה</b></span><div><button type="button" data-language-choice="he">עברית</button><button type="button" data-language-choice="en">English</button></div>';
    var hero = document.querySelector('main > .hero');
    if (hero) hero.insertAdjacentElement('afterend', selector);
    selector.addEventListener('click', function (event) {
      var button = event.target.closest('[data-language-choice]');
      if (button) applyLanguage(button.dataset.languageChoice);
    });
  }

  function start() {
    createSelector();
    applyLanguage(current);
    observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) { mutation.addedNodes.forEach(process); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.TravelMateLanguage = { get: function () { return current; }, set: applyLanguage };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}());
