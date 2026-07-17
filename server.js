/**
 * ⚔️ AS Adventurer — Local Server + API Proxy
 * Angel's Sword Studios
 *
 * Serves static files from public/ and proxies API requests
 * to OpenAI, Google Gemini, xAI Grok, and local ComfyUI
 * to avoid CORS issues and protect API keys / OAuth tokens.
 */

const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const APP_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
app.use(express.static(path.join(APP_DIR, 'public')));

// --- OpenAI / Gemini / xAI routes (unchanged core) ---

app.post('/api/generate', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify(req.body),
            timeout: 300000
        });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/edits', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const { model, prompt, images, n, size, quality } = req.body;
        const form = new FormData();
        form.append('model', model || 'gpt-image-2');
        form.append('prompt', prompt);
        if (n) form.append('n', String(n));
        if (size) form.append('size', size);
        if (quality) form.append('quality', quality);
        if (images && Array.isArray(images)) {
            images.forEach((imgEntry, index) => {
                let raw, fileName;
                if (typeof imgEntry === 'object' && imgEntry.data) {
                    raw = imgEntry.data;
                    fileName = `${imgEntry.label || 'ref' + index}.png`;
                } else {
                    raw = String(imgEntry);
                    fileName = `ref${index}.png`;
                }
                if (raw.includes(',')) raw = raw.substring(raw.indexOf(',') + 1);
                form.append('image[]', Buffer.from(raw, 'base64'), { filename: fileName, contentType: 'image/png' });
            });
        }
        const response = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { 'Authorization': authHeader, ...form.getHeaders() },
            body: form,
            timeout: 300000
        });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/chat', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify(req.body),
            timeout: 30000
        });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/video/generate', async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) return res.status(401).json({ error: 'No Google API key provided' });
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            timeout: 600000
        });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/video/poll', async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) return res.status(401).json({ error: 'No Google API key provided' });
    try {
        const { operationName } = req.body;
        if (!operationName) return res.status(400).json({ error: 'No operationName provided' });
        const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
        const response = await fetch(url, { method: 'GET', timeout: 30000 });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

// --- xAI ---
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
const XAI_DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code';
const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token';
const XAI_API_BASE = 'https://api.x.ai/v1';

app.post('/api/xai/oauth/device', async (req, res) => {
    try {
        const body = new URLSearchParams({ client_id: XAI_CLIENT_ID, scope: XAI_SCOPE, referrer: 'as-adventurer' });
        const response = await fetch(XAI_DEVICE_CODE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-grok-client-version': '1.0.0', 'x-grok-client-surface': 'cli' },
            body: body.toString()
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/xai/oauth/token', async (req, res) => {
    try {
        const params = new URLSearchParams({ client_id: XAI_CLIENT_ID, ...req.body });
        const response = await fetch(XAI_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-grok-client-version': '1.0.0', 'x-grok-client-surface': 'cli' },
            body: params.toString()
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/xai/images/generations', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const response = await fetch(`${XAI_API_BASE}/images/generations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify(req.body),
            timeout: 300000
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/xai/videos/generations', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const response = await fetch(`${XAI_API_BASE}/videos/generations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify(req.body),
            timeout: 120000
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.get('/api/xai/videos/:requestId', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const response = await fetch(`${XAI_API_BASE}/videos/${req.params.requestId}`, {
            method: 'GET',
            headers: { 'Authorization': authHeader },
            timeout: 60000
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/xai/video-fetch', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const { url } = req.body || {};
        if (!url) return res.status(400).json({ error: 'Missing url' });
        const parsed = new URL(url);
        const allowed = ['vidgen.x.ai', 'api.x.ai', 'cdn.x.ai', 'imagine.x.ai'];
        if (!allowed.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
            return res.status(400).json({ error: `Blocked download host: ${parsed.hostname}` });
        }
        const response = await fetch(url, { method: 'GET', timeout: 300000, headers: { Authorization: authHeader } });
        if (!response.ok) return res.status(response.status).json({ error: `Video download failed: ${response.status}` });
        const buf = await response.buffer();
        res.status(200);
        res.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
        res.send(buf);
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/xai/test', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header provided' });
    try {
        const response = await fetch(`${XAI_API_BASE}/models`, { headers: { Authorization: authHeader } });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ============================================
// ComfyUI Local Proxy
// ============================================

function sanitizeComfyBase(baseUrl) {
    if (!baseUrl || typeof baseUrl !== 'string') return null;
    let u;
    try { u = new URL(baseUrl); } catch { return null; }
    // Only allow local / private network targets
    const host = u.hostname;
    const ok =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    if (!ok) return null;
    return u.origin;
}

/**
 * POST /api/comfyui/proxy
 * Body: { baseUrl, path, method, body, isBinary }
 */
app.post('/api/comfyui/proxy', async (req, res) => {
    try {
        const { baseUrl, path: apiPath, method, body, isBinary } = req.body || {};
        const origin = sanitizeComfyBase(baseUrl || 'http://127.0.0.1:8188');
        if (!origin) return res.status(400).json({ error: 'Invalid or non-local ComfyUI URL' });

        let p = apiPath || '/';
        if (!p.startsWith('/')) p = '/' + p;

        const url = origin + p;
        console.log(`  [COMFY] ${method || 'GET'} ${url}`);

        const opts = {
            method: method || 'GET',
            timeout: 300000,
            headers: {}
        };

        if (body && (method === 'POST' || method === 'PUT')) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }

        const response = await fetch(url, opts);

        if (isBinary) {
            const buf = await response.buffer();
            const ct = response.headers.get('content-type') || 'application/octet-stream';
            res.status(response.status);
            res.set('Content-Type', ct);
            return res.send(buf);
        }

        const text = await response.text();
        res.status(response.status).type('application/json').send(text);
    } catch (err) {
        console.error('  [COMFY] proxy error:', err.message);
        res.status(502).json({ error: `ComfyUI proxy error: ${err.message}. Is ComfyUI running?` });
    }
});

/**
 * POST /api/comfyui/upload
 * Upload a base64 image to ComfyUI input folder
 * Body: { baseUrl, image: dataUrl, filename }
 */
app.post('/api/comfyui/upload', async (req, res) => {
    try {
        const { baseUrl, image, filename } = req.body || {};
        const origin = sanitizeComfyBase(baseUrl || 'http://127.0.0.1:8188');
        if (!origin) return res.status(400).json({ error: 'Invalid or non-local ComfyUI URL' });
        if (!image) return res.status(400).json({ error: 'Missing image' });

        let raw = image;
        let contentType = 'image/png';
        if (raw.includes(',')) {
            const header = raw.split(',')[0];
            if (header.includes('jpeg') || header.includes('jpg')) contentType = 'image/jpeg';
            if (header.includes('webp')) contentType = 'image/webp';
            raw = raw.substring(raw.indexOf(',') + 1);
        }
        const buf = Buffer.from(raw, 'base64');
        const name = filename || `as_upload_${Date.now()}.png`;

        const form = new FormData();
        form.append('image', buf, { filename: name, contentType });
        form.append('overwrite', 'true');

        console.log(`  [COMFY] upload ${name} (${buf.length} bytes) → ${origin}`);

        const response = await fetch(`${origin}/upload/image`, {
            method: 'POST',
            headers: form.getHeaders(),
            body: form,
            timeout: 120000
        });

        const text = await response.text();
        console.log(`  [COMFY] upload → ${response.status}`);
        res.status(response.status).type('application/json').send(text);
    } catch (err) {
        console.error('  [COMFY] upload error:', err.message);
        res.status(502).json({ error: `ComfyUI upload error: ${err.message}` });
    }
});

app.post('/api/comfyui/test', async (req, res) => {
    try {
        const origin = sanitizeComfyBase((req.body && req.body.baseUrl) || 'http://127.0.0.1:8188');
        if (!origin) return res.status(400).json({ error: 'Invalid or non-local ComfyUI URL' });
        const response = await fetch(`${origin}/system_stats`, { timeout: 10000 });
        const text = await response.text();
        res.status(response.status).type('application/json').send(text);
    } catch (err) {
        res.status(502).json({ error: `Cannot reach ComfyUI: ${err.message}` });
    }
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log('');
    console.log('  ⚔️  AS Adventurer — VTuber Creation Pipeline');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Server running at http://localhost:${PORT}`);
    console.log('  ComfyUI proxy ready (point Settings at your local ComfyUI)');
    console.log('  Press Ctrl+C to stop');
    console.log('');

    const url = `http://localhost:${PORT}`;
    const start = process.platform === 'win32' ? 'start' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${start} ${url}`);
});
