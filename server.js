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
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(req.body)
        });
        res.status(r.status).type('application/json').send(await r.text());
    } catch (e) { res.status(502).json({ error: e.message }); }
});

// ============================================
// ComfyUI
// ============================================
app.post('/api/comfyui/proxy', async (req, res) => {
    try {
        const { baseUrl, path, method, body, isBinary } = req.body || {};
        const origin = baseUrl || process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
        const url = origin + (path.startsWith('/') ? path : '/' + path);
        const opts = { method: method || 'GET', headers: {} };
        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const r = await fetch(url, opts);
        if (isBinary) {
            res.status(r.status).set('Content-Type', r.headers.get('content-type')).send(await r.buffer());
        } else {
            res.status(r.status).type('application/json').send(await r.text());
        }
    } catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/comfyui/upload', async (req, res) => {
    try {
        const { baseUrl, image, filename } = req.body || {};
        const origin = baseUrl || process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
        const buf = Buffer.from(image.includes(',') ? image.split(',')[1] : image, 'base64');
        const form = new FormData();
        form.append('image', buf, { filename: filename || `as_upload_${Date.now()}.png` });
        form.append('overwrite', 'true');
        const r = await fetch(`${origin}/upload/image`, {
            method: 'POST', headers: form.getHeaders(), body: form
        });
        res.status(r.status).type('application/json').send(await r.text());
    } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`AS Adventurer running on port ${PORT}`);
});