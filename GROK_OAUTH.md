# Grok SuperGrok OAuth + Imagine Integration

## Status — COMPLETE ✅

### Server
- Device-code OAuth + token refresh (`/api/xai/oauth/device`, `/api/xai/oauth/token`)
- Image: `POST /api/xai/images/generations`
- Video start: `POST /api/xai/videos/generations`
- Video poll: `GET /api/xai/videos/:requestId`
- Test: `POST /api/xai/test`

### Client
- `public/xai-oauth.js`
- Settings SuperGrok login UI
- Sprite Prep: OpenAI | Grok
- Video Gen: Gemini | Grok

## Correct video payload (image-to-video)

Docs: https://docs.x.ai/developers/model-capabilities/video/image-to-video

```js
// POST https://api.x.ai/v1/videos/generations
{
  model: "grok-imagine-video-1.5",
  prompt: "Gentle breathing idle… static camera…",  // STRING, not object
  image: {
    url: "data:image/png;base64,..."   // data URI or public URL
    // alternatives: data_uri, file_id
  },
  duration: 5,           // seconds (typical 1–15)
  aspect_ratio: "16:9",
  resolution: "720p"
}
// → { request_id: "..." }
// poll GET /v1/videos/{request_id} until status === "done"
// → { status: "done", video: { url: "https://...mp4" } }
```

**422 root cause (fixed):** we previously sent `prompt: { image, text }` which is invalid.

## Image payload

```js
{
  model: "grok-imagine-image-quality",
  prompt: "...chroma-key sprite prompt...",
  n: 1,
  aspect_ratio: "16:9",
  resolution: "1k",
  response_format: "b64_json"
}
```

## User flow
1. Settings → Login with SuperGrok
2. Sprite Prep → AI Generate → ✨ Grok
3. Generate Video → ✨ Grok

## Security
Tokens only touch `auth.x.ai` / `api.x.ai` via the local proxy.
