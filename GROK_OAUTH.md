# Grok SuperGrok OAuth + Imagine Integration

## Status (feature/grok-oauth-imagine branch)

### ✅ Done
- Server proxies for device-code OAuth + token refresh
- Server proxies for Grok Imagine **image** (`/api/xai/images/generations`) and **video** (`/api/xai/videos/generations` + poll)
- Client OAuth manager: `public/xai-oauth.js`

### 🔲 Remaining to wire
1. Include `<script src="xai-oauth.js"></script>` in `index.html` (before app.js)
2. Settings panel: Login with SuperGrok button that calls `XaiOAuth.login(progress => ...)`
3. In Sprite Prep generative mode:
   - Provider selector: OpenAI | Grok
   - When Grok selected + logged in → use `await XaiOAuth.getAccessToken()` then `POST /api/xai/images/generations` with:
     ```js
     {
       model: "grok-imagine-image-quality",
       prompt: yourChromaKeyPrompt,
       n: 1,
       aspect_ratio: "16:9",
       resolution: "1k", // or "2k"
       response_format: "b64_json"
     }
     ```
4. In Video Gen:
   - Provider selector: Gemini | Grok
   - When Grok → `POST /api/xai/videos/generations` with image-to-video shape, then poll `GET /api/xai/videos/{request_id}` until `status === "done"`, download `video.url`.

## User flow
1. Open Settings → Login with SuperGrok
2. Browser opens auth.x.ai / accounts.x.ai device verification
3. Approve with SuperGrok / X Premium+ account
4. Token stored in localStorage under `xai_oauth_tokens`
5. Generate sprites / videos using Grok Imagine (no OpenAI or Google key required for those steps)

## Models
- Image: `grok-imagine-image-quality` (or `grok-imagine-image`)
- Video: `grok-imagine-video` or `grok-imagine-video-1.5`

## Security
Tokens only go to `auth.x.ai` and `api.x.ai` via the local Node proxy. Never leave the machine otherwise.

⚔️ Ready for the UI wiring pass.
