 (function() {
    'use strict';

    let spriteImage = null;
    let selectedKeyColor = '#00FF00';
    let selectedRaceMode = 'normal';
    let selectedGenCount = 1;
    let charRefBase64 = null;
    let styleRefBase64 = null;
    let aiProvider = localStorage.getItem('sg_ai_provider') || 'openai';

    function getGrokAccessToken() {
        const keys = ['grok_access_token','xai_access_token','access_token','grok_token','superGrokToken','grokSession'];
        for (const k of keys) { const v = localStorage.getItem(k); if (v) return v; }
        for (let i=0; i<localStorage.length; i++) {
            const k = localStorage.key(i); const v = localStorage.getItem(k);
            if (v && v.length > 80 && v.split('.').length === 3) return v;
        }
        return null;
    }

    function initSpritePrep() {
        const modeSelector = document.getElementById('spritePrepMode');
        const manualMode = document.getElementById('spriteManualMode');
        const generateMode = document.getElementById('spriteGenerateMode');

        if (modeSelector) {
            modeSelector.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;
                modeSelector.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (btn.dataset.mode === 'manual') {
                    manualMode.classList.remove('hidden');
                    generateMode.classList.add('hidden');
                } else {
                    manualMode.classList.add('hidden');
                    generateMode.classList.remove('hidden');
                }
            });
        }
        initAIGenerateMode();
    }

    function initAIGenerateMode() {
        // Race Mode
        const race = document.getElementById('sgRaceMode');
        if (race) {
            race.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;
                race.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedRaceMode = btn.dataset.mode || 'normal';
            });
            const def = race.querySelector('.mode-btn.active') || race.querySelector('.mode-btn');
            if (def) { def.classList.add('active'); selectedRaceMode = def.dataset.mode || 'normal'; }
        }

        // Key Color
        const colors = document.getElementById('sgColorSwatches');
        if (colors) {
            colors.addEventListener('click', (e) => {
                const s = e.target.closest('.color-swatch');
                if (!s) return;
                colors.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('selected'));
                s.classList.add('selected');
                selectedKeyColor = s.dataset.color || '#00FF00';
            });
            const init = colors.querySelector('.color-swatch.selected') || colors.querySelector('.color-swatch');
            if (init) { init.classList.add('selected'); selectedKeyColor = init.dataset.color || '#00FF00'; }
        }

        // Generation Count
        const countContainer = document.getElementById('sgGenCount');
        if (countContainer) {
            countContainer.addEventListener('click', (e) => {
                const b = e.target.closest('.gen-count-btn');
                if (!b) return;
                countContainer.querySelectorAll('.gen-count-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                selectedGenCount = parseInt(b.dataset.count) || 1;
            });
            const def = countContainer.querySelector('.gen-count-btn.active') || countContainer.querySelector('.gen-count-btn');
            if (def) { def.classList.add('active'); selectedGenCount = parseInt(def.dataset.count) || 1; }
        }

        // Uploads
        const charIn = document.getElementById('sgCharRefInput');
        const charPrev = document.getElementById('sgCharRefPreview');
        if (charIn) {
            charIn.addEventListener('change', e => {
                const f = e.target.files[0]; if (!f) return;
                const r = new FileReader();
                r.onload = ev => { charRefBase64 = ev.target.result; if (charPrev) { charPrev.innerHTML = `<img src="${charRefBase64}" style="max-height:120px;border-radius:8px">`; charPrev.classList.remove('hidden'); } };
                r.readAsDataURL(f);
            });
        }

        const styleIn = document.getElementById('sgStyleRefInput');
        const stylePrev = document.getElementById('sgStyleRefPreview');
        if (styleIn) {
            styleIn.addEventListener('change', e => {
                const f = e.target.files[0]; if (!f) return;
                const r = new FileReader();
                r.onload = ev => { styleRefBase64 = ev.target.result; if (stylePrev) { stylePrev.innerHTML = `<img src="${styleRefBase64}" style="max-height:120px;border-radius:8px">`; stylePrev.classList.remove('hidden'); } };
                r.readAsDataURL(f);
            });
        }

        // Provider
        const prov = document.getElementById('sgProvider');
        if (prov) {
            prov.addEventListener('click', e => {
                const b = e.target.closest('.mode-btn'); if (!b) return;
                prov.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                aiProvider = b.dataset.provider;
                localStorage.setItem('sg_ai_provider', aiProvider);
                updateGenerateButtonLabel();
            });
            const initBtn = prov.querySelector(`[data-provider="${aiProvider}"]`);
            if (initBtn) { prov.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active')); initBtn.classList.add('active'); }
        }

        const genBtn = document.getElementById('sgGenerateBtn');
        if (genBtn) genBtn.addEventListener('click', handleGenerate);

        updateGenerateButtonLabel();
    }

    function updateGenerateButtonLabel() {
        const btn = document.getElementById('sgGenerateBtn');
        if (!btn) return;
        if (aiProvider === 'comfyui') btn.innerHTML = '🖥️ Generate Sprite (ComfyUI)';
        else if (aiProvider === 'grok') btn.innerHTML = '✨ Generate Sprite (Grok Imagine)';
        else btn.innerHTML = '✨ Generate Sprite (OpenAI)';
    }

    async function handleGenerate() {
        const status = document.getElementById('sgStatus');
        const btn = document.getElementById('sgGenerateBtn');
        if (btn) btn.disabled = true;
        if (status) { status.innerHTML = '<span class="spinner"></span> Generating...'; status.style.color = ''; }

        try {
            if (aiProvider === 'comfyui') await generateComfyUI(status);
            else if (aiProvider === 'grok') await generateGrok(status);
            else await generateOpenAI(status);
        } catch (e) {
            if (status) { status.innerHTML = '❌ ' + e.message; status.style.color = 'var(--red, red)'; }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function generateOpenAI(status) {
        const prompt = `Full body clean sprite of ${document.getElementById('sgCharName')?.value || 'character'}. ${document.getElementById('sgCharDesc')?.value || ''}`;
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-2', prompt, n: selectedGenCount, size: '1024x1024' })
        });
        if (!res.ok) throw new Error('OpenAI error: ' + await res.text());
        const data = await res.json();
        if (status) status.innerHTML = data.data?.length ? `✅ Generated ${data.data.length} sprite(s)` : '✅ Done';
    }

    async function generateGrok(status) {
        const token = getGrokAccessToken();
        if (!token) throw new Error('No Grok access token found. Please log in with SuperGrok first.');

        const prompt = `Full body clean sprite of ${document.getElementById('sgCharName')?.value || 'character'}. ${document.getElementById('sgCharDesc')?.value || ''}`;

        const res = await fetch('/api/xai/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ prompt, n: selectedGenCount })
        });

        if (!res.ok) throw new Error('Grok error: ' + await res.text());
        const data = await res.json();
        if (status) status.innerHTML = data.data?.length ? `✅ Generated ${data.data.length} sprite(s) with Grok` : '✅ Done with Grok';
    }

    async function generateComfyUI(status) {
        const baseUrl = localStorage.getItem('comfyui_base_url') || 'http://127.0.0.1:8188';
        const ckpt = localStorage.getItem('comfyui_checkpoint') || 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
        const name = document.getElementById('sgCharName')?.value || 'character';
        const desc = document.getElementById('sgCharDesc')?.value || '';

        const workflow = {
            "3": { "class_type": "KSampler", "inputs": { "seed": Math.floor(Math.random()*1e9), "steps": 20, "cfg": 7, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1, "model": ["4",0], "positive": ["6",0], "negative": ["7",0], "latent_image": ["5",0] } },
            "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": ckpt } },
            "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": selectedGenCount } },
            "6": { "class_type": "CLIPTextEncode", "inputs": { "text": `${name}, ${desc}, full body sprite`, "clip": ["4",1] } },
            "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "bad quality", "clip": ["4",1] } },
            "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3",0], "vae": ["4",2] } },
            "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "as_adventurer", "images": ["8",0] } }
        };

        const q = await fetch('/api/comfyui/proxy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, path: '/prompt', method: 'POST', body: { prompt: workflow } })
        });
        if (!q.ok) throw new Error('Queue failed: ' + await q.text());

        const qd = await q.json();
        const pid = qd.prompt_id;
        if (!pid) { if (status) status.innerHTML = '✅ Queued'; return; }

        if (status) status.innerHTML = '⏳ Generating...';

        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1500));
            try {
                const h = await fetch('/api/comfyui/proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl, path: `/history/${pid}`, method: 'GET' })
                });
                const hist = await h.json();
                const out = hist[pid]?.outputs?.["9"];
                if (out?.images?.[0]) {
                    const fname = out.images[0].filename;
                    if (status) status.innerHTML = `✅ Saved as: ${fname} (check ComfyUI output folder)`;
                    return;
                }
            } catch {}
        }
        if (status) status.innerHTML = '⏳ Still processing (check ComfyUI queue)';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();