/**
 * ⚔️ AS Adventurer — Local Server + API Proxy
 * Angel's Sword Studios
 * 
 * Serves static files from public/ and proxies API requests
 * to OpenAI, Google Gemini, and xAI Grok (via SuperGrok OAuth or API key)
 * to avoid CORS issues and protect API keys / OAuth tokens.
 */

const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS headers for all responses
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Static files
// Detect pkg-compiled exe vs normal Node.js
const APP_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

app.use(express.static(path.join(APP_DIR, 'public')));

// --- API Proxy Routes ---

/**
 * POST /api/generate
 * Proxies to OpenAI Image Generations (text-only, no reference images)
 * Body: { model, prompt, n, size, quality }
 */
app.post('/api/generate', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No Authorization header provided' });
    }

    try {
        console.log('  [PROXY] POST /api/generate →  OpenAI /v1/images/generations');
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(req.body),
            timeout: 300000
        });

        const data = await response.text();
        console.log(`  [PROXY] /v1/images/generations → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] Generate proxy failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * POST /api/edits
 * Proxies to OpenAI Image Edits (with reference images)
 * Converts JSON body { model, prompt, images[], n, size, quality }
 * into multipart/form-data as required by OpenAI API.
 * 
 * Images can be:
 *   - Raw base64 strings
 *   - Objects { label: "character_reference", data: "base64..." }
 */
app.post('/api/edits', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No Authorization header provided' });
    }

    try {
        console.log('  [PROXY] POST /api/edits → OpenAI /v1/images/edits');
        const { model, prompt, images, n, size, quality } = req.body;

        const form = new FormData();
        form.append('model', model || 'gpt-image-2');
        form.append('prompt', prompt);
        if (n) form.append('n', String(n));
        if (size) form.append('size', size);
        if (quality) form.append('quality', quality);

        // Add images as file fields
        if (images && Array.isArray(images)) {
            images.forEach((imgEntry, index) => {
                let raw, fileName;

                if (typeof imgEntry === 'object' && imgEntry.data) {
                    // Labeled image: { label: "character_reference", data: "base64..." }
                    raw = imgEntry.data;
                    fileName = `${imgEntry.label || 'ref' + index}.png`;
                } else {
                    // Raw base64 string
                    raw = String(imgEntry);
                    fileName = `ref${index}.png`;
                }

                // Strip data URI prefix if present
                if (raw.includes(',')) {
                    raw = raw.substring(raw.indexOf(',') + 1);
                }

                const imgBuffer = Buffer.from(raw, 'base64');
                form.append('image[]', imgBuffer, {
                    filename: fileName,
                    contentType: 'image/png'
                });
                console.log(`    [IMG] ${fileName} (${imgBuffer.length} bytes)`);
            });
        }

        const response = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                ...form.getHeaders()
            },
            body: form,
            timeout: 300000
        });

        const data = await response.text();
        console.log(`  [PROXY] /v1/images/edits → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] Edits proxy failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * POST /api/chat
 * Proxies to OpenAI Chat Completions (used for test connection)
 * Body: Standard OpenAI chat completion body
 */
app.post('/api/chat', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No Authorization header provided' });
    }

    try {
        console.log('  [PROXY] POST /api/chat → OpenAI /v1/chat/completions');
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(req.body),
            timeout: 30000
        });

        const data = await response.text();
        console.log(`  [PROXY] /v1/chat/completions → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] Chat proxy failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * POST /api/video/generate
 * Proxies to Google Gemini Omni Flash Interactions API
 * Body: Standard Gemini interactions body with model, contents, generationConfig
 * Expects Google API key in query param or body
 */
app.post('/api/video/generate', async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) {
        return res.status(401).json({ error: 'No Google API key provided' });
    }

    try {
        console.log('  [PROXY] POST /api/video/generate → Gemini Interactions API');
        
        // Log the request body (redact image data for readability)
        const logBody = { ...req.body };
        if (logBody.input_image) {
            logBody.input_image = { mime_type: logBody.input_image.mime_type, data: `[${logBody.input_image.data?.length || 0} chars base64]` };
        }
        console.log('  [PROXY] Request body:', JSON.stringify(logBody, null, 2));

        const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
        console.log('  [PROXY] URL:', url.replace(apiKey, apiKey.substring(0, 8) + '...'));

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body),
            timeout: 600000 // 10 min timeout for video generation
        });

        const data = await response.text();
        console.log(`  [PROXY] Gemini Interactions → HTTP ${response.status}`);
        
        // Log response details
        if (response.status !== 200) {
            console.error('  [ERROR] Gemini API error response:');
            console.error('  ', data.substring(0, 500));
        } else {
            const sizeMB = (data.length / 1024 / 1024).toFixed(1);
            console.log(`  [PROXY] ✅ Video generated successfully! (${sizeMB} MB response)`);
        }

        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] Video generate proxy failed:', err.message);
        console.error('  [ERROR] Stack:', err.stack);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * POST /api/video/poll
 * Polls a Gemini Interactions operation for completion
 */
app.post('/api/video/poll', async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) {
        return res.status(401).json({ error: 'No Google API key provided' });
    }

    try {
        const { operationName } = req.body;
        if (!operationName) {
            return res.status(400).json({ error: 'No operationName provided' });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
        const response = await fetch(url, { method: 'GET', timeout: 30000 });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] Video poll failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

// --- xAI / Grok OAuth + Imagine Proxy (SuperGrok OAuth support) ---

const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
const XAI_DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code';
const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token';
const XAI_API_BASE = 'https://api.x.ai/v1';

/**
 * POST /api/xai/oauth/device
 * Request a device code for SuperGrok OAuth login.
 */
app.post('/api/xai/oauth/device', async (req, res) => {
    try {
        console.log('  [XAI] Requesting device code...');
        const body = new URLSearchParams({
            client_id: XAI_CLIENT_ID,
            scope: XAI_SCOPE,
            referrer: 'as-adventurer'
        });
        const response = await fetch(XAI_DEVICE_CODE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-grok-client-version': '1.0.0',
                'x-grok-client-surface': 'cli'
            },
            body: body.toString()
        });
        const data = await response.text();
        console.log(`  [XAI] Device code → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] XAI device code failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * POST /api/xai/oauth/token
 * Exchange device_code or refresh_token for access tokens.
 */
app.post('/api/xai/oauth/token', async (req, res) => {
    try {
        console.log('  [XAI] Token exchange...', req.body.grant_type);
        const params = new URLSearchParams({
            client_id: XAI_CLIENT_ID,
            ...req.body
        });
        if (!params.has('client_id')) params.set('client_id', XAI_CLIENT_ID);

        const response = await fetch(XAI_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-grok-client-version': '1.0.0',
                'x-grok-client-surface': 'cli'
            },
            body: params.toString()
        });
        const data = await response.text();
        console.log(`  [XAI] Token → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] XAI token failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * POST /api/xai/images/generations
 * Proxy to Grok Imagine image generation
 */
app.post('/api/xai/images/generations', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No Authorization header provided' });
    }

    try {
        console.log('  [XAI] POST /images/generations → Grok Imagine');
        const response = await fetch(`${XAI_API_BASE}/images/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(req.body),
            timeout: 300000
        });
        const data = await response.text();
        console.log(`  [XAI] /images/generations → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] XAI image gen failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * POST /api/xai/videos/generations
 * Start Grok Imagine video generation (async)
 */
app.post('/api/xai/videos/generations', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No Authorization header provided' });
    }

    try {
        console.log('  [XAI] POST /videos/generations → Grok Imagine Video');
        const logBody = { ...req.body };
        if (logBody.prompt && typeof logBody.prompt === 'object' && logBody.prompt.image) {
            logBody.prompt = { ...logBody.prompt, image: `[base64 ${String(logBody.prompt.image).length} chars]` };
        }
        console.log('  [XAI] Request:', JSON.stringify(logBody).substring(0, 400));

        const response = await fetch(`${XAI_API_BASE}/videos/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(req.body),
            timeout: 60000
        });
        const data = await response.text();
        console.log(`  [XAI] /videos/generations → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] XAI video start failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * GET /api/xai/videos/:requestId
 * Poll video generation status
 */
app.get('/api/xai/videos/:requestId', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No Authorization header provided' });
    }

    try {
        const { requestId } = req.params;
        console.log(`  [XAI] GET /videos/${requestId}`);
        const response = await fetch(`${XAI_API_BASE}/videos/${requestId}`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader
            },
            timeout: 30000
        });
        const data = await response.text();
        console.log(`  [XAI] video status → ${response.status}`);
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        console.error('  [ERROR] XAI video poll failed:', err.message);
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

// Test connection for OAuth token
app.post('/api/xai/test', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No Authorization header provided' });
    }
    try {
        const response = await fetch(`${XAI_API_BASE}/models`, {
            headers: { 'Authorization': authHeader }
        });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log('');
    console.log('  ⚔️  AS Adventurer — VTuber Creation Pipeline');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Server running at http://localhost:${PORT}`);
    console.log('  Press Ctrl+C to stop');
    console.log('');

    // Auto-open browser
    const url = `http://localhost:${PORT}`;
    const start = process.platform === 'win32' ? 'start' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${start} ${url}`);
});
