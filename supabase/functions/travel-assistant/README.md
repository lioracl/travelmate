# TravelMate AI assistant

The browser never receives the OpenAI API key. Configure it only as a Supabase
Edge Function secret named `OPENAI_API_KEY`. The optional `OPENAI_MODEL` secret
can override the default `gpt-5.6-sol` model.

Automatic deployment from `main` uses `.github/workflows/deploy-supabase-functions.yml`
and requires the GitHub Actions secret `SUPABASE_ACCESS_TOKEN`. Configure
`OPENAI_API_KEY` in Supabase Edge Function secrets, not in the repository.

The function requires an authenticated Supabase user and accepts only a short
chat history plus a privacy-filtered trip summary. Documents, passwords, vault
secrets, payment information and GPS data are not sent by the app.
