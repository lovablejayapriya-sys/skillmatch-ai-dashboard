# Fix: "Groq is not configured" on the Vercel deployment

## Diagnosis
The server code reads `GROQ_API_KEY` at request time inside the server handler — that part is correct. You've added all the variables in Vercel, but the running deployment was built before the variables existed. Vercel only injects environment variables into **new** deployments; existing deployments never see variables added later.

## Plan

1. **Redeploy on Vercel** (the actual fix)
   - In the Vercel dashboard: Deployments → latest deployment → "Redeploy" (no cache needed).
   - Or push any small commit to trigger a fresh deployment.
   - After the redeploy finishes, retry "Parse & Continue" — the Groq error should be gone.

2. **Verify the variables are scoped correctly**
   - `GROQ_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must be enabled for the environment you're visiting (Production if you use the production URL, Preview for preview URLs). From your list, both already cover Production — this step is just a sanity check.
   - `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, and `NEXT_PUBLIC_SUPABASE_URL` are unused by this app and can stay or be removed; they don't affect anything.

3. **Confirm the key itself is valid**
   - If the error changes to a Groq authentication/401 message after redeploy, the key value pasted in Vercel is wrong or expired — re-copy it from console.groq.com → API Keys (it starts with `gsk_`).

4. **Confirm the Groq model is available on your Groq account**
   - The app calls `openai/gpt-oss-120b`. If Groq returns "model not found" after the key works, I'll switch the model string to one your account supports (e.g. `llama-3.3-70b-versatile`).

## No code changes needed
The app code is already correct — this is a deployment-configuration fix. Steps 1–3 happen in the Vercel/Groq dashboards; I'll only edit code if step 4 comes up.

## Verification
After the redeploy: open the site, paste the demo job description, click "Parse & Continue", and confirm the requirements screen appears instead of the Groq error.
