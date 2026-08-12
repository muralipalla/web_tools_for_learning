# Palladium

An interactive learning lab with quizzes, simulations, user accounts, and optional cloud progress through Supabase.

## Supabase setup

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
   Re-run the same file after pulling account feature updates; it is safe to run repeatedly. The administrator allowlist defaults to `muralipalla@gmail.com` and can be changed near the top of the schema.
2. Enable Email and/or Google under Authentication providers.
3. Set the production Site URL to `https://muralipalla.github.io/web_tools_for_learning/`.
4. Add these exact redirect URLs:
   - `https://muralipalla.github.io/web_tools_for_learning/account.html`
   - `http://localhost:5500/account.html`
5. Put only the Project URL and `sb_publishable_...` key in `js/supabase-client.js`. Never put a secret/service-role key in browser code.

## Local testing

Serve the repository over HTTP rather than opening files directly:

```powershell
py -m http.server 5500
```

Open `http://localhost:5500/account.html`.

Signed-out quiz history remains in `localStorage`. Signed-in quiz attempts are also written to `quiz_attempts`, and the account page can import existing local progress without creating duplicates.
