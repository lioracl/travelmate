# TravelMate V2.1 — Health Connect / Samsung Health Integration

## 1. מטרה

להוסיף ל־TravelMate שכבת בריאות/פעילות **Read Only** שתאפשר, בהסכמה מפורשת של המשתמש, להציג בסיכום הטיול נתונים עובדתיים כמו מספר צעדים ומרחק יומי.

המטרה אינה להפוך את TravelMate לאפליקציית בריאות. הנתונים מיועדים להעשיר את חוויית הטיול וה־Trip Summary בלבד.

## 2. מצב קיים

TravelMate היא כיום PWA סטטית עם Supabase, Service Worker ושכבת Web מלאה. אין בפרויקט מעטפת Capacitor פעילה, `package.json` או פרויקט Android Native.

בקוד קיימת רק תאימות עתידית למצב שבו האפליקציה תרוץ בתוך Capacitor.

מכאן ש־Health Connect אינו יכול להיכנס נכון דרך Web API רגיל. נדרשת שכבת Android Native/Capacitor קטנה ומבודדת, תוך שמירה על ה־PWA כבסיס המוצר.

## 3. עקרונות מחייבים

- Opt-in בלבד. אין גישה לנתוני Health ללא פעולה מפורשת.
- Read Only בלבד ב־V2.1.
- אין קריאת Heart Rate, Sleep, Weight, Blood Pressure או נתונים רפואיים.
- אין Background Health Sync אוטומטי בגרסה הראשונה.
- אין GPS חדש ואין Background Location.
- אין שליחת נתוני Health ל־Mate או ל־AI אוטומטית.
- אין שימוש בנתוני Health לצורך הרשאות, דירוג משתמש או החלטות אבטחה.
- Web/PWA ממשיכה לעבוד במלואה גם כאשר Health Connect אינו זמין.
- Account switch חייב לבטל כל תוצאה אסינכרונית שנפתחה תחת החשבון הקודם.
- ברירת המחדל היא Local Only לנתוני Health. העלאה לענן דורשת החלטה נפרדת בעתיד.

## 4. מקורות נתונים

### Android

מקור הנתונים הקנוני יהיה **Health Connect**.

Samsung Health יכולה להזרים נתונים ל־Health Connect במכשירים/הגדרות שבהם המשתמש מאפשר זאת. TravelMate לא תבנה אינטגרציה פרטית ישירה מול Samsung Health.

Google Fit ייחשב מקור Legacy בלבד. אין לבנות API חדש שתלוי ב־Google Fit כאשר Health Connect הוא שכבת האינטגרציה המועדפת באנדרואיד.

### Web / iPhone

ב־Web adapter מוחזר `unsupported` ללא שגיאה וללא בקשת הרשאה.

iOS אינו חלק ממימוש V2.1 Android. בעתיד ניתן להוסיף adapter מקביל ל־Apple Health בתוך מעטפת iOS.

## 5. נתונים מאושרים ל־V2.1

היקף מינימלי:

- Steps ליום.
- Distance walked/moved ליום, אם המקור מספק אותו.
- טווח תאריכים מוגבל לימי הטיול.
- `lastSyncedAt`.
- מקור כללי: `health-connect`.

לא נשמור Raw Samples אם אין צורך. נעדיף Aggregates לפי יום.

דוגמה ל־shape פנימי:

```js
{
  version: 1,
  source: 'health-connect',
  range: { start: '2026-10-01', end: '2026-10-07' },
  days: [
    {
      date: '2026-10-01',
      steps: 14320,
      distanceMeters: 10840
    }
  ],
  lastSyncedAt: '2026-10-07T10:00:00+03:00'
}
```

## 6. ארכיטקטורה

### 6.1 Web contract

להוסיף adapter יחיד:

`window.TravelMateHealth`

API מוצע:

```js
isAvailable()
getPermissionState()
requestPermissions()
readTripSummary({ start, end })
disconnect()
```

כל consumer באפליקציה מדבר רק עם החוזה הזה.

### 6.2 Web fallback

ב־PWA רגיל:

- `isAvailable()` מחזיר `false`.
- אין exceptions שמפריעים ל־Trip Summary.
- UI מציג שהחיבור זמין בגרסת Android Native בלבד.
- שאר סיכום הטיול ממשיך לפעול כרגיל.

### 6.3 Native bridge

במעטפת Android:

PWA/Capacitor
→ `TravelMateHealth`
→ Capacitor Plugin / Native Bridge
→ Health Connect SDK
→ Daily aggregates

יש להעדיף plugin קטן ומבוקר בבעלות הפרויקט על פני dependency רחב שלא נבדק.

### 6.4 הפרדת אחריות

- `health-adapter.js` — contract + Web fallback.
- Native plugin — הרשאות וקריאת Health Connect בלבד.
- `trip-analytics.js` — מקבל aggregates מוכנים ואינו מכיר Android APIs.
- `trip-summary.js` — תצוגה בלבד.
- Settings/Profile — consent, connect/disconnect, status.

## 7. פרטיות ואחסון

ברירת המחדל:

- Health data נשמר מקומית בלבד.
- אין כתיבה ל־`travel_trips.payload` ב־V2.1 Phase 1.
- אין Supabase migration.
- אין Realtime.
- אין cross-device sync של Health aggregates.
- Logout/account switch מנקה cache בזיכרון.
- Cache קבוע, אם יתווסף, חייב להיות owner-partitioned.

אם בעתיד יוחלט על Cloud Sync:
- תידרש הסכמה נפרדת.
- יש לשמור aggregates בלבד.
- יש להגדיר retention/delete/export.
- נדרש Security/RLS review נפרד.

## 8. UX

### Settings / Profile

כרטיס חדש: **Health & Activity**

מצבים:
- לא זמין במכשיר זה.
- זמין אך לא מחובר.
- מחובר.
- הרשאה חלקית.
- הרשאה בוטלה.

פעולות:
- חיבור ל־Health Connect.
- רענון עכשיו.
- ניתוק.
- הסבר קצר "מה נקרא" ו"מה לא נקרא".

### Trip Summary

כאשר קיימים נתונים:
- צעדים לכל יום.
- סה״כ צעדים בטיול.
- מרחק יומי וסה״כ.
- סימון ברור שהנתון הגיע מ־Health Connect.

כאשר אין נתונים:
- אין placeholder מטעה.
- אין הערכה מומצאת.
- הנתון מוצג כ־Unknown/Not connected.

## 9. התנהגות Offline

- נתון שכבר נקרא יכול להישאר זמין בזיכרון/Cache המקומי בהתאם למדיניות.
- אין ניסיון הרשאה חדש Offline.
- אין חסימה של Trip Summary אם Health Connect אינו זמין.
- אין fallback שממציא Steps מתוך מרחק המסלול.

## 10. Account Isolation

כל בקשה שומרת:
- `ownerId`
- `authGeneration`
- `requestGeneration`

לפני commit ל־UI או ל־cache:
- המשתמש עדיין זהה.
- generation עדיין תקף.
- הטיול עדיין שייך לאותו owner.

תרחיש A → B → A חייב לדחות תוצאה ישנה של A הראשון.

## 11. Timezone וגבולות יום

Health data חייב להיות משויך ליום לפי timezone של הטיול כאשר הוא ידוע, ולא רק לפי timezone הנוכחי של המכשיר.

יש לבדוק:
- טיסות בין אזורי זמן.
- יום חוצה חצות.
- DST.
- Trip start/end חלקיים.
- נתון שנקרא לאחר החזרה הביתה.

## 12. שלבי יישום

### Phase 0 — Native Foundation
- יצירת מעטפת Capacitor מינימלית בלי לשנות את התנהגות ה־PWA.
- Android app ID קבוע.
- Build מקומי ב־Android Studio.
- smoke לפתיחת TravelMate מתוך ה־Web assets הקיימים.

### Phase 1 — Health Adapter
- `TravelMateHealth` Web contract.
- Web fallback.
- Native plugin ל־availability/permissions.
- contract tests ללא Health data אמיתי.

### Phase 2 — Read Only Data
- Steps + Distance aggregates.
- date range מוגבל לימי הטיול.
- ביטול בקשות stale.
- no-cloud default.

### Phase 3 — UX
- Health & Activity settings card.
- connect/disconnect/refresh.
- Trip Summary daily/total metrics.
- accessibility + RTL + light/dark.

### Phase 4 — Device QA
- Samsung device עם Samsung Health → Health Connect.
- Pixel/Android Health Connect baseline.
- permission deny/revoke.
- account A → B → A.
- offline/restart.
- 390/430 visual gate.
- battery/performance check.

## 13. בדיקות קבלה

חובה לפני release:

- Web PWA PASS ללא Capacitor.
- Health unavailable אינו גורם error.
- permission denied אינו חוסם את האפליקציה.
- revoke לאחר connect מתעדכן נכון.
- Steps/Distance אינם חוצים משתמשים.
- A → B → A stale result נדחה.
- אין Health request ב־page load.
- אין Health request ב־Mate.
- אין AI call כתוצאה מחיבור Health.
- אין GPS request.
- אין raw Health samples ב־Supabase.
- Trip Summary אינו ממציא נתונים חסרים.
- RTL/VoiceOver/TalkBack labels תקינים.
- reduced-motion אינו נפגע.
- full regression של TravelMate נשאר ירוק.

## 14. מחוץ ל־V2.1

לא נכנס בשלב הראשון:

- Heart Rate.
- Sleep.
- Calories/Nutrition.
- Weight.
- Medical records.
- Workout write-back.
- Background continuous sync.
- Automatic AI coaching.
- Apple Health implementation.
- Cloud sync של Health data.

## 15. מדריך משתמש קצר

בגרסת Android התומכת:

1. פותחים הגדרות → Health & Activity.
2. בוחרים **חיבור ל־Health Connect**.
3. Android מציג את ההרשאות המבוקשות.
4. מאשרים Steps ו־Distance בלבד.
5. חוזרים ל־TravelMate ובוחרים **רענון עכשיו**.
6. בסיכום הטיול מופיעים צעדים ומרחק לפי יום ובסה״כ.
7. ניתן לבחור **ניתוק** בכל רגע.

אם Samsung Health משמש כמקור, המשתמש צריך לאפשר ל־Samsung Health לשתף את הנתונים המתאימים עם Health Connect.

## 16. החלטת ארכיטקטורה

אין להוסיף Health Connect ישירות ל־PWA הנוכחית.

המסלול המאושר ל־V2.1 הוא:

**PWA יציבה → Capacitor Android shell → TravelMateHealth adapter → Health Connect read-only → Trip Summary**

כך V2.20.3 נשארת יציבה, והיכולת החדשה נכנסת בשכבה נפרדת, ניתנת לביטול, ללא Migration וללא שינוי בהתנהגות Web.
