# T.M.D AI Professional

## Vercel setup
1. Upload the CONTENTS of this folder to the root of the GitHub repository.
2. In Vercel set Root Directory to the folder that directly contains `index.html` and `api/`.
3. Framework Preset: Other.
4. Build Command: leave empty.
5. Output Directory: leave empty.
6. Add `OPENAI_API_KEY` as a Secret for Production and Preview.
7. Optional: `OPENAI_MODEL=gpt-5.6-luna`.
8. Redeploy with **Use existing Build Cache OFF** for the first clean deployment.

## Test
Open `/api/health`. It must return JSON with `"ok": true`.
Then open the main site and send a message.

Never put the OpenAI key in frontend JavaScript or GitHub.
