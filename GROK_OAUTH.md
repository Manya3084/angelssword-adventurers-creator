# Grok SuperGrok OAuth + Imagine Integration

## Status (feature/grok-oauth-imagine branch) — COMPLETE ✅

### ✅ Done

**Server**
- Device-code OAuth + token refresh proxies (`/api/xai/oauth/device`, `/api/xai/oauth/token`)
- Grok Imagine image proxy (`/api/xai/images/generations`)
- Grok Imagine video start + poll (`/api/xai/videos/generations`, `GET /api/xai/videos/:requestId`)
- Token test (`/api/xai/test`)

**Client**
- `public/xai-oauth.js` — device-code manager, refresh, localStorage
- Settings panel: Login with SuperGrok, device code UI, status, Test / Refresh / Logout
- Sprite Prep: **OpenAI | Grok** provider selector (`#sgProvider`, persisted as `sg_ai_provider`)
- Video Gen: **Gemini | Grok** provider selector (`#vgProvider`, persisted as `vg_ai_provider`)
- Generation logic fully wired for both providers
- Button labels update with selected provider

## User flow
1. Open **Settings** → **Login with SuperGrok**
2. Browser opens auth.x.ai device verification
3. Approve with SuperGrok / X Premium+ account
4. Token stored in localStorage under `xai_oauth_tokens`
5. In Sprite Prep → AI Generate → select **✨ Grok** → Generate Sprite
6. In Generate Video → select **✨ Grok** → Generate Video

## Models
- Image: `grok-imagine-image-quality`
- Video: `grok-imagine-video`

## Payloads (high level)

### Image
```js
POST /api/xai/images/generations
Authorization: Bearer <access_token>
{
  model: "grok-imagine-image-quality",
  prompt: "...chroma-key sprite prompt...",
  n: 1,
  aspect_ratio: "16:9",
  resolution: "1k",
  response_format: "b64_json"
}
```

### Video
```js
POST /api/xai/videos/generations
{
  model: "grok-imagine-video",
  prompt: { image: "<base64>", text: "animation prompt" },
  duration: 5  // optional
}
// then poll GET /api/xai/videos/{request_id} until status done
// download video.url or use base64 if present
```

## Security
Tokens only go to `auth.x.ai` and `api.x.ai` via the local Node proxy. Never leave the machine otherwise.

⚔️ Ready for testing.
