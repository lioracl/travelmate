# הפעלת העוזר האישי של TravelMate

העוזר בנוי כך שמפתח OpenAI לעולם אינו מגיע לדפדפן, לטלפון או לקוד ב־GitHub.

## 1. מפתח OpenAI ב־Supabase

1. יוצרים מפתח API ב־OpenAI Platform: https://platform.openai.com/api-keys
2. בפרויקט Supabase פותחים **Edge Functions → Secrets**.
3. מוסיפים Secret בשם `OPENAI_API_KEY` ומדביקים בו את המפתח.
4. אפשר להוסיף `OPENAI_MODEL` כדי לשנות מודל. ברירת המחדל היא `gpt-5.6-sol`.

אין לשלוח את המפתח בצ׳אט, להכניס אותו לקובץ JavaScript או לשמור אותו ב־GitHub.

## 2. פריסה אוטומטית מ־GitHub

1. ב־Supabase Account פותחים **Access Tokens** ויוצרים token לפריסה.
2. ב־GitHub פותחים את `lioracl/travelmate`.
3. נכנסים אל **Settings → Secrets and variables → Actions**.
4. יוצרים Repository secret בשם `SUPABASE_ACCESS_TOKEN` ושומרים בו את ה־token.

לאחר מכן כל שינוי עתידי ב־`supabase/functions` שיקודם לענף `main` יפרוס את
פונקציית `travel-assistant` אוטומטית.

## 3. פרטיות ועלויות

- הפונקציה זמינה רק למשתמש מחובר.
- נשלחים יעד, תאריכים, פעילויות, מקומות והשיחה הקצרה בלבד.
- מסמכים, סיסמאות, פרטי כספת ו־GPS אינם נשלחים.
- התשובות מוגדרות עם `store: false`.
- קיימת מגבלה של 60 שאלות למשתמש ביום כדי לצמצם שימוש בלתי צפוי.
