const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// Server-side default for ComfyUI (set in docker-compose / env)
const COMFYUI_URL = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');

// Command used by the "Restart ComfyUI" button
// Examples:
//   COMFYUI_RESTART_CMD="docker restart comfyui"
//   COMFYUI_RESTART_CMD="systemctl restart comfyui"
//   COMFYUI_RESTART_CMD="/path/to/restart-comfyui.sh"
const COMFYUI_RESTART_CMD = process.env.COMFYUI_RESTART_CMD || '';

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

// ============================================
// Config (so frontend can pick up server defaults)
// ============================================
app.get('/api/config', (req, res) => {
    res.json({
        comfyuiUrl: COMFYUI_URL,
        comfyuiRestartAvailable: !!COMFYUI_RESTART_CMD,
        port: PORT
    });
});

// ============================================
// xAI / SuperGrok OAuth
// ============================================
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
const XAI_DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code';
const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token';
const XAI_API_BASE = 'https://api.x.ai/v1';

app.post('/api/xai/oauth/device', async (req, res) => {
    try {
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
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/xai/oauth/token', async (req, res) => {
    try {
        const params = new URLSearchParams({
            client_id: XAI_CLIENT_ID,
            ...req.body
        });
        const response = await fetch(XAI_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
});

app.post('/api/xai/test', async (req, res) => {
    try {
        res.json({ ok: true, message: 'Grok proxy is reachable' });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ============================================
// OpenAI
// ============================================
app.post('/api/generate', async (req, res) => {
    const authHeader = req.headers['authorization'] || (process.env.OPENAI_API_KEY ? `Bearer ${process.env.OPENAI_API_KEY}` : null);
    if (!authHeader) return res.status(401).json({ error: 'No OpenAI API key' });
    try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify(req.body),
            timeout: 300000
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

app.post('/api/edits', async (req, res) => {
    const authHeader = req.headers['authorization'] || (process.env.OPENAI_API_KEY ? `Bearer ${process.env.OPENAI_API_KEY}` : null);
    if (!authHeader) return res.status(401).json({ error: 'No OpenAI API key' });
    try {
        const form = new FormData();
        form.append('model', req.body.model || 'gpt-image-2');
        form.append('prompt', req.body.prompt);
        if (req.body.n) form.append('n', req.body.n);
        if (req.body.size) form.append('size', req.body.size);
        if (req.body.quality) form.append('quality', req.body.quality);

        if (req.body.images) {
            req.body.images.forEach((img, i) => {
                let data = img.data || img;
                if (data.includes(',')) data = data.split(',')[1];
                form.append('image[]', Buffer.from(data, 'base64'), { filename: `ref${i}.png` });
            });
        }

        const response = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: authHeader, ...form.getHeaders() },
            body: form,
            timeout: 300000
        });
        res.status(response.status).type('application/json').send(await response.text());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ============================================
// Gemini Video
// ============================================
app.post('/api/video/generate', async (req, res) => {
    const key = req.headers['x-api-key'] || process.env.GEMINI_API_KEY;
    if (!key) return res.status(401).json({ error: 'No Gemini key' });
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${key}`;
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
        res.status(r.status).type('application/json').send(await r.text());
    } catch (e) { res.status(502).json({ error: e.message }); }
});

// ============================================
// xAI Images
// ============================================
app.post('/api/xai/images/generations', async (req, res) => {
    const auth = req.headers['authorization'] || (process.env.XAI_API_KEY ? `Bearer ${process.env.XAI_API_KEY}` : null);
    if (!auth) return res.status(401).json({ error: 'No xAI key' });
    try {
        const r = await fetch(`${XAI_API_BASE}/images/generations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify(req.body)
        });
        res.status(r.status).type('application/json').send(await r.text());
    } catch (e) { res.status(502).json({ error: e.message }); }
});

// ============================================
// xAI / Grok Video
// ============================================
app.post('/api/xai/videos/generations', async (req, res) => {
    const auth = req.headers['authorization'] || (process.env.XAI_API_KEY ? `Bearer ${process.env.XAI_API_KEY}` : null);
    if (!auth) return res.status(401).json({ error: 'No xAI key' });

    try {
        const r = await fetch(`${XAI_API_BASE}/videos/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': auth
            },
            body: JSON.stringify(req.body)
        });
        res.status(r.status).type('application/json').send(await r.text());
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

app.get('/api/xai/videos/:id', async (req, res) => {
    const auth = req.headers['authorization'] || (process.env.XAI_API_KEY ? `Bearer ${process.env.XAI_API_KEY}` : null);
    if (!auth) return res.status(401).json({ error: 'No xAI key' });

    try {
        const r = await fetch(`${XAI_API_BASE}/videos/${encodeURIComponent(req.params.id)}`, {
            method: 'GET',
            headers: { 'Authorization': auth }
        });
        res.status(r.status).type('application/json').send(await r.text());
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

app.post('/api/xai/video-fetch', async (req, res) => {
    const auth = req.headers['authorization'] || (process.env.XAI_API_KEY ? `Bearer ${process.env.XAI_API_KEY}` : null);
    const { url } = req.body || {};

    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const headers = {};
        if (auth) headers['Authorization'] = auth;

        const r = await fetch(url, { headers });
        if (!r.ok) {
            return res.status(r.status).json({ error: `Failed to fetch video: ${r.status}` });
        }

        const contentType = r.headers.get('content-type') || 'video/mp4';
        const buffer = await r.buffer();

        res.status(200)
            .set('Content-Type', contentType)
            .set('Content-Length', buffer.length)
            .send(buffer);
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

// ============================================
// ComfyUI
// ============================================
function normalizeComfyBase(baseUrl) {
    if (!baseUrl) return null;
    let s = String(baseUrl).trim();

    // Fix common mistake: http://192.168.1.115/8188  →  http://192.168.1.115:8188
    s = s.replace(/^(https?:\/\/[^\/:]+)\/(\d+)$/i, '$1:$2');

    // Strip trailing slash
    s = s.replace(/\/$/, '');

    try {
        const u = new URL(s);
        const host = u.hostname;
        const ok =
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === 'comfyui' ||          // docker-compose service name
            host.endsWith('.local') ||
            host.startsWith('192.168.') ||
            host.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
        if (!ok) return null;
        return u.origin;
    } catch {
        return null;
    }
}

app.post('/api/comfyui/test', async (req, res) => {
    try {
        const origin = normalizeComfyBase((req.body && req.body.baseUrl) || COMFYUI_URL);
        if (!origin) return res.status(400).json({ error: 'Invalid or non-local ComfyUI URL' });

        const response = await fetch(`${origin}/system_stats`, { timeout: 10000 });
        const text = await response.text();
        res.status(response.status).type('application/json').send(text);
    } catch (err) {
        res.status(502).json({ error: `Cannot reach ComfyUI: ${err.message}` });
    }
});

// Restart ComfyUI (command comes from COMFYUI_RESTART_CMD env var)
app.post('/api/comfyui/restart', (req, res) => {
    if (!COMFYUI_RESTART_CMD) {
        return res.status(400).json({
            error: 'Restart not configured. Set COMFYUI_RESTART_CMD in docker-compose / environment.'
        });
    }

    console.log('[ComfyUI] Restart requested →', COMFYUI_RESTART_CMD);

    exec(COMFYUI_RESTART_CMD, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('[ComfyUI] Restart failed:', err.message, stderr);
            return res.status(500).json({
                error: err.message,
                stderr: (stderr || '').substring(0, 500)
            });
        }

        console.log('[ComfyUI] Restart OK:', (stdout || '').substring(0, 200));
        res.json({
            ok: true,
            message: 'ComfyUI restart command executed',
            stdout: (stdout || '').substring(0, 300)
        });
    });
});

app.post('/api/comfyui/proxy', async (req, res) => {
    try {
        const { baseUrl, path: reqPath, method, body, isBinary } = req.body || {};
        const origin = normalizeComfyBase(baseUrl || COMFYUI_URL);
        if (!origin) {
            return res.status(400).json({ error: 'Invalid ComfyUI base URL' });
        }

        const p = (reqPath || '/').startsWith('/') ? reqPath : '/' + (reqPath || '');
        const url = origin + p;

        const opts = {
            method: (method || 'GET').toUpperCase(),
            headers: {}
        };

        if (body && opts.method !== 'GET' && opts.method !== 'HEAD') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }

        console.log(`[ComfyUI proxy] ${opts.method} ${url}`);

        const r = await fetch(url, opts);

        if (isBinary) {
            res.status(r.status)
                .set('Content-Type', r.headers.get('content-type') || 'application/octet-stream')
                .send(await r.buffer());
        } else {
            const text = await r.text();
            if (r.status === 405) {
                console.error(`[ComfyUI proxy] 405 Method Not Allowed for ${opts.method} ${url}`);
            }
            res.status(r.status).type('application/json').send(text);
        }
    } catch (e) {
        console.error('[ComfyUI proxy] error:', e.message);
        res.status(502).json({ error: e.message });
    }
});

app.post('/api/comfyui/upload', async (req, res) => {
    try {
        const { baseUrl, image, filename } = req.body || {};
        const origin = normalizeComfyBase(baseUrl || COMFYUI_URL);
        if (!origin) return res.status(400).json({ error: 'Invalid ComfyUI base URL' });

        const buf = Buffer.from(image.includes(',') ? image.split(',')[1] : image, 'base64');
        const form = new FormData();
        form.append('image', buf, { filename: filename || `as_upload_${Date.now()}.png` });
        form.append('overwrite', 'true');

        const r = await fetch(`${origin}/upload/image`, {
            method: 'POST',
            headers: form.getHeaders(),
            body: form
        });
        res.status(r.status).type('application/json').send(await r.text());
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`AS Adventurer running on port ${PORT}`);
    console.log(`ComfyUI default URL: ${COMFYUI_URL}`);
    if (COMFYUI_RESTART_CMD) {
        console.log(`ComfyUI restart command: ${COMFYUI_RESTART_CMD}`);
    } else {
        console.log('ComfyUI restart: not configured (set COMFYUI_RESTART_CMD)');
    }
});
