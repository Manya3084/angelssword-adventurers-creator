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
        // Priority 1: Manual xAI API key from Settings
        const manualKey = localStorage.getItem('xai_api_key');
        if (manualKey && manualKey.startsWith('xai-')) {
            console.log('[Grok] Using manual xAI API key');
            return { type: 'api_key', value: manualKey };
        }

        // Priority 2: SuperGrok OAuth token from xai_oauth_tokens
        const oauthRaw = localStorage.getItem('xai_oauth_tokens');
        if (oauthRaw) {
            try {
                const parsed = JSON.parse(oauthRaw);
                // Common structures: { access_token: '...' } or { token: '...' } or direct string
                const token = parsed.access_token || parsed.token || parsed.accessToken || (typeof parsed === 'string' ? parsed : null);
                if (token) {
                    console.log('[Grok] Using SuperGrok OAuth token from xai_oauth_tokens');
                    return { type: 'oauth', value: token };
                }
            } catch (e) {
                // If it's not JSON, maybe it's stored as raw string
                if (oauthRaw.length > 50) {
                    console.log('[Grok] Using raw token from xai_oauth_tokens');
                    return { type: 'oauth', value: oauthRaw };
                }
            }
        }

        console.warn('[Grok] No valid SuperGrok token or xAI API key found');
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
        const raceMode = document.getElementById('sgRaceMode');
        if (raceMode) {
            raceMode.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;
                raceMode.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedRaceMode = btn.dataset.mode || 'normal';
            });
            const def = raceMode.querySelector('.mode-btn.active') || raceMode.querySelector('.mode-btn');
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
        const countBox = document.getElementById('sgGenCount');
        if (countBox) {
            countBox.addEventListener('click', (e) => {
                const b = e.target.closest('.gen-count-btn');
                if (!b) return;
                countBox.querySelectorAll('.gen-count-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                selectedGenCount = parseInt(b.dataset.count) || 1;
            });
            const def = countBox.querySelector('.gen-count-btn.active') || countBox.querySelector('.gen-count-btn');
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
            const initB = prov.querySelector(`[data-provider="${aiProvider}"]`);
            if (initB) { prov.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active')); initB.classList.add('active'); }
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
        const prompt = buildPrompt();
        const res = await fetch('/api/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-2', prompt, n: selectedGenCount, size: '1024x1024' })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (status) status.innerHTML = data.data?.length ? `✅ Generated ${data.data.length} sprite(s)` : '✅ Done';
    }

    async function generateGrok(status) {
        const tokenInfo = getGrokAccessToken();
        if (!tokenInfo) {
            throw new Error('No SuperGrok token or xAI API key found. Please log in with SuperGrok or add an xAI API key in Settings.');
        }

        const prompt = buildPrompt();

        const res = await fetch('/api/xai/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenInfo.value}`
            },
            body: JSON.stringify({ prompt, n: selectedGenCount })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Grok error: ${errText}`);
        }

        const data = await res.json();
        if (status) status.innerHTML = data.data?.length ? `✅ Generated ${data.data.length} sprite(s) with Grok` : '✅ Done';
    }

    async function generateComfyUI(status) {
        const baseUrl = localStorage.getItem('comfyui_base_url') || 'http://127.0.0.1:8188';
        const ckpt = localStorage.getItem('comfyui_checkpoint') || 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
        const promptText = buildPrompt();

        const workflow = {
            "3": { "class_type": "KSampler", "inputs": { "seed": Math.floor(Math.random()*1e9), "steps": 20, "cfg": 7, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1, "model": ["4",0], "positive": ["6",0], "negative": ["7",0], "latent_image": ["5",0] } },
            "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": ckpt } },
            "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": selectedGenCount } },
            "6": { "class_type": "CLIPTextEncode", "inputs": { "text": promptText, "clip": ["4",1] } },
            "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "bad quality", "clip": ["4",1] } },
            "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3",0], "vae": ["4",2] } },
            "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "as_adventurer", "images": ["8",0] } }
        };

        const q = await fetch('/api/comfyui/proxy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, path: '/prompt', method: 'POST', body: { prompt: workflow } })
        });
        if (!q.ok) throw new Error('ComfyUI queue failed');

        const qd = await q.json();
        const pid = qd.prompt_id;
        if (status) status.innerHTML = pid ? '⏳ Generating in ComfyUI...' : '✅ Queued';

        if (pid) {
            for (let i = 0; i < 12; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const h = await fetch('/api/comfyui/proxy', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ baseUrl, path: `/history/${pid}`, method: 'GET' })
                    });
                    const hist = await h.json();
                    if (hist[pid]?.outputs) {
                        if (status) status.innerHTML = '✅ ComfyUI generation complete';
                        return;
                    }
                } catch {}
            }
            if (status) status.innerHTML = '⏳ Still processing...';
        }
    }

    function buildPrompt() {
        const name = document.getElementById('sgCharName')?.value || 'character';
        const desc = document.getElementById('sgCharDesc')?.value || '';
        return `Full body clean sprite of ${name}. ${desc}. White background, game asset style. Race: ${selectedRaceMode}.`;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();