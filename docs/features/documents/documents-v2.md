# TravelMate — Documents 2.0

## 1. מטרת הפיצ'ר

Documents 2.0 מרכז מסמכי טיול רגישים במקום אחד ומאפשר למשתמש לשמור, לסנן, לפתוח, להוריד ולמחוק מסמכים הקשורים לטיול, תוך הצפנת תוכן הקבצים במכשיר לפני העלאה לענן.

הפיצ'ר נועד לשמש כ־**Document Vault / כספת מסמכים** עבור מסמכים כגון טיסות, לינה, כרטיסים ותחבורה, ביטוח ומסמכים אישיים.

הפיצ'ר אינו מעביר את תוכן המסמכים ל־Mate או למנוע AI.

---

## 2. Actors / שחקנים

### משתמש מטייל
- מתחבר לחשבון.
- מזין סיסמת הצפנה לכספת.
- מעלה מסמך.
- מסנן מסמכים לפי קטגוריה.
- פותח/מוריד מסמך.
- מוחק מסמך.

### TravelMate Web/PWA
- מציג את ממשק המסמכים.
- מצפין ומפענח תוכן קובץ בצד הלקוח.
- מנהל קטגוריות ופעולות.
- פונה ל־Supabase Auth, Database ו־Storage.

### Supabase Auth
- מאמת את המשתמש.

### Supabase Database
- שומר Metadata של המסמך בטבלת `public.travel_documents`.

### Supabase Storage
- שומר את ה־blob המוצפן ב־bucket פרטי `travel-documents`.

---

## 3. Functional Requirements / דרישות פונקציונליות

| מזהה | דרישה |
|---|---|
| FR-DOC-001 | המערכת תאפשר למשתמש מחובר לגשת לכספת המסמכים של הטיול. |
| FR-DOC-002 | המערכת תאפשר יצירת חשבון, כניסה ויציאה דרך מנגנון האימות הקיים. |
| FR-DOC-003 | המערכת תדרוש סיסמת כספת נפרדת לצורך הצפנה/פענוח תוכן הקבצים. |
| FR-DOC-004 | תוכן הקובץ יוצפן בצד הלקוח לפני העלאה לענן. |
| FR-DOC-005 | המערכת תאפשר העלאת PDF, תמונות וקובצי Office נתמכים עד מגבלת 25MB לקובץ. |
| FR-DOC-006 | המערכת תאפשר שיוך מסמך לקטגוריות: טיסות, לינה, כרטיסים ותחבורה, ביטוח ואישי. |
| FR-DOC-007 | המערכת תאפשר סינון לפי קטגוריה ולפי ארכיון Mate. |
| FR-DOC-008 | המערכת תציג שם קובץ, גודל, תאריך, קטגוריה והערה כאשר קיימת. |
| FR-DOC-009 | המערכת תאפשר פתיחת מסמך לאחר פענוח בצד הלקוח. |
| FR-DOC-010 | המערכת תאפשר הורדת עותק מפוענח למכשיר המשתמש. |
| FR-DOC-011 | המערכת תאפשר מחיקה לצמיתות רק לאחר אישור מפורש של המשתמש. |
| FR-DOC-012 | במקרה שבו Metadata נמחק אך מחיקת ה־blob נכשלת, המערכת תשמור משימת ניקוי מקומית ותנסה להשלים אותה בהמשך. |
| FR-DOC-013 | המערכת לא תשלח תוכן מסמך מוצפן או מפוענח ל־Mate. |
| FR-DOC-014 | המערכת תמשיך להציג ניווט קטגוריות גם כאשר שירות הענן אינו זמין. |
| FR-DOC-015 | תגובת Metadata ישנה מסשן משתמש קודם לא תוצג לאחר שינוי סשן. |
| FR-DOC-016 | הממשק יציג פעולות פתיחה, הורדה ומחיקה באופן מפורש וברור. |

---

## 4. Non-Functional Requirements / דרישות לא־פונקציונליות

### Security
- הצפנת תוכן קובץ באמצעות AES-GCM.
- הפקת מפתח מסיסמת הכספת באמצעות PBKDF2-SHA-256.
- מספר איטרציות נוכחי: 310,000.
- סיסמת הכספת אינה נשמרת במסד הנתונים.
- גישה ל־Storage מוגבלת לתיקיית המשתמש באמצעות RLS/Storage Policies.

### Privacy
- שם קובץ, קטגוריה, הערה ו־Metadata אינם מוצפנים באותו מנגנון של תוכן הקובץ ולכן אין להזין בשדות אלה מידע רגיש שאינו נחוץ.
- תוכן המסמך אינו נשלח ל־AI.

### Accessibility
- תמיכה ב־RTL.
- פעולות מרכזיות בגודל נגיעה נגיש במובייל.
- Focus-visible לפקדים אינטראקטיביים.
- labels/ARIA לשדות ולפעולות רלוונטיות.

### Responsive UX
- תמיכה ב־390px, 430px, 768px ו־1440px.
- אין Horizontal Overflow.
- שמות קבצים ארוכים לא יוצאים מגבולות הכרטיס.

### Availability
- קטגוריות ומבנה Documents זמינים גם כאשר Bootstrap הענן נכשל.
- פעולות ענן מחזירות הודעת מצב ברורה למשתמש.

---

## 5. Data Model — מצב נוכחי

### public.travel_documents

השדות מאומתים מול migration `20260719090000_private_document_vault.sql`:

| שדה | תפקיד |
|---|---|
| id | מזהה UUID של המסמך |
| user_id | בעל המסמך |
| trip_id | הטיול שאליו המסמך משויך |
| file_name | שם הקובץ לתצוגה |
| storage_path | הנתיב של ה־blob המוצפן ב־Storage |
| mime_type | MIME type מקורי |
| file_size | גודל קובץ |
| category | קטגוריית מסמך |
| note | הערה |
| encrypted | האם הקובץ מוצפן |
| encryption_salt | Salt להפקת מפתח |
| encryption_iv | IV להצפנת AES-GCM |
| created_at | תאריך יצירה |

### Storage
- Bucket: `travel-documents`
- Private bucket.
- Maximum file size: 25MB.
- התוכן נשמר כ־`application/octet-stream`.
- הנתיב מתחיל ב־`user_id`, וה־Storage policies מגבילות כל משתמש לתיקייה שלו.

### Relation / קשרים לוגיים

```text
User
  1
  |
  | owns
  N
TravelDocument
  N
  |
  | belongs to
  1
Trip
```

בשלב הנוכחי `trip_id` הוא מזהה טקסטואלי בטבלת המסמכים ולא Foreign Key פיזי לטבלת טיולים.

---

## 6. Data Flow / זרימת מידע

### Upload

```text
User
  -> selects file
TravelMate
  -> reads bytes locally
  -> derives encryption key
  -> AES-GCM encrypts bytes
Supabase Storage
  <- encrypted blob only
Supabase Database
  <- document metadata + encryption parameters
```

### Open / Preview

```text
User
  -> Open
TravelMate
  -> validates authenticated access
Supabase Storage
  -> encrypted blob
TravelMate
  -> decrypts locally
  -> renders secure preview
```

### Delete

```text
User
  -> confirms permanent delete
TravelMate
  -> deletes metadata
Supabase Database
  -> metadata removed
TravelMate
  -> deletes encrypted blob
Supabase Storage
  -> blob removed

If blob deletion fails:
TravelMate -> local pending-cleanup queue -> retry when online
```

---

## 7. Diagrams to include in the master specification

### Context Diagram / תיחום חיצוני
יש להציג:
- Traveler
- TravelMate
- Supabase Auth
- Supabase Database
- Supabase Storage

### DFD Level 0
Processes:
- Authenticate User
- Manage Vault Session
- Encrypt & Upload Document
- List & Filter Documents
- Decrypt & Preview Document
- Delete Document

Data Stores:
- D1 Travel Documents Metadata
- D2 Encrypted Document Storage
- D3 Local Pending Cleanup Queue

### Sequence Diagrams
נדרשים:
1. Login + unlock.
2. Upload encrypted document.
3. Preview/download document.
4. Permanent delete with cleanup retry.

### ERD impact
יש להציג את `TravelDocument` כישות המשויכת ל־User ול־Trip ברמה הלוגית, תוך סימון שבמימוש הנוכחי `trip_id` אינו FK פיזי.

---

## 8. UX / Visual Design Principles

- Documents הוא אזור פונקציונלי אחד ולא אוסף כרטיסי Glass מקוננים.
- Intro קצר וקל.
- Access/Auth הוא Surface ברור אחד.
- Upload הוא Primary Action.
- Drop Zone הוא Secondary Action.
- Category navigation קומפקטי.
- Document rows שטוחים וקלים לסריקה.
- Open / Preview הוא פעולה ניטרלית ברורה.
- Delete מסומן כפעולה הרסנית אך אינו הפעולה הדומיננטית.
- אין Black Glass ואין Blur מקונן.

---

## 9. User Guide Seed / בסיס למדריך המשתמש

### כניסה למסמכים
1. פתח את הטיול.
2. בחר **מסמכים**.
3. אם אינך מחובר, התחבר או צור חשבון.
4. הזן את סיסמת הכספת שבה השתמשת להצפנת המסמכים.

### העלאת מסמך
1. לחץ **הוספת מסמך** / Upload.
2. בחר קטגוריה.
3. הוסף הערה אופציונלית ללא מידע רגיש.
4. בחר קובץ או גרור אותו לאזור ההעלאה.
5. TravelMate מצפין את הקובץ במכשיר ושומר את הגרסה המוצפנת בענן.

### סינון
השתמש בלשוניות:
- הכל
- טיסות
- לינה
- כרטיסים ותחבורה
- ביטוח
- אישי
- Mate

### פתיחה
1. אתר את המסמך.
2. לחץ **פתיחה**.
3. הזן/השאר את סיסמת הכספת הנכונה.
4. המסמך מפוענח במכשיר ונפתח ב־Secure Preview.

### הורדה
לחץ **הורדה** כדי ליצור עותק מפוענח עבור המשתמש.

### מחיקה
1. לחץ **מחיקה**.
2. אשר את אזהרת המחיקה לצמיתות.
3. המערכת מסירה את Metadata ואת ה־blob המוצפן.

### Troubleshooting
- **לא מצליח לפתוח מסמך**: ודא שסיסמת הכספת זהה לזו ששימשה בעת ההעלאה.
- **הענן אינו זמין**: בדוק חיבור רשת והתחברות לחשבון.
- **קובץ גדול מדי**: המגבלה היא 25MB לקובץ.
- **מחיקה הושלמה חלקית**: אם Metadata נמחק אך Storage אינו זמין, TravelMate ישלים את ניקוי הקובץ כאשר החיבור יתאפשר.
- **מסמך לא מופיע**: בדוק את מסנן הקטגוריה הפעיל.

---

## 10. Traceability seed

| Requirement | Component | Data | Test area |
|---|---|---|---|
| FR-DOC-004 | document-vault.js | encrypted blob | encryption contract |
| FR-DOC-006 | Documents filters/upload | category | documents-v2-contract |
| FR-DOC-009 | Secure Preview | storage_path + encryption parameters | preview contracts |
| FR-DOC-011 | Delete flow | metadata + blob | documents-v2-contract |
| FR-DOC-014 | Documents local UI | local DOM | Documents cloud-bootstrap contract |
| FR-DOC-016 | Document row actions | UI | Documents 2.0 visual contract |

---

## 11. Open items for the master document

- ליצור Context Diagram גרפי.
- ליצור DFD Level 0 ו־Level 1.
- לשלב את TravelDocument בתוך Target ERD המלא של TravelMate.
- להוסיף screenshots סופיים לאחר אישור עיצוב Documents 2.0 במכשיר אמיתי.
- להרחיב את מדריך המשתמש בהתאם למסכי Production הסופיים.
