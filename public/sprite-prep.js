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
        // Try all known keys from xAI/SuperGrok OAuth flows
        const candidates = [
            'grok_access_token',
            'xai_access_token',
            'access_token',
            'grok_token',
            'superGrokToken',
            'grokSession',
            'xai_token'
        ];

        for (const key of candidates) {
            const token = localStorage.getItem(key);
            if (token && token.length > 50) {
                console.log('[Grok] Found token in localStorage key:', key);
                return token;
            }
        }

        // Fallback: look for any JWT-like string
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            if (value && value.split('.').length === 3 && value.length > 100) {
                console.log('[Grok] Found JWT-like token in key:', key);
                return value;
            }
        }

        console.warn('[Grok] No access token found in localStorage');
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
            if (def) {
                def.classList.add('active');
                selectedRaceMode = def.dataset.mode || 'normal';
            }
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
            if (init) {
                init.classList.add('selected');
                selectedKeyColor = init.dataset.color || '#00FF00';
            }
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
            if (def) {
                def.classList.add('active');
                selectedGenCount = parseInt(def.dataset.count) || 1;
            }
        }

        // Uploads
        const charInput = document.getElementById('sgCharRefInput');
        const charPrev = document.getElementById('sgCharRefPreview');
        if (charInput) {
            charInput.addEventListener('change', (e) => {
                const f = e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = (ev) => {
                    charRefBase64 = ev.target.result;
                    if (charPrev) {
                        charPrev.innerHTML = `<img src="${charRefBase64}" style="max-height:120px;border-radius:8px;border:1px solid var(--border);">`;
                        charPrev.classList.remove('hidden');
                    }
                };
                r.readAsDataURL(f);
            });
        }

        const styleInput = document.getElementById('sgStyleRefInput');
        const stylePrev = document.getElementById('sgStyleRefPreview');
        if (styleInput) {
            styleInput.addEventListener('change', (e) => {
                const f = e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = (ev) => {
                    styleRefBase64 = ev.target.result;
                    if (stylePrev) {
                        stylePrev.innerHTML = `<img src="${styleRefBase64}" style="max-height:120px;border-radius:8px;border:1px solid var(--border);">`;
                        stylePrev.classList.remove('hidden');
                    }
                };
                r.readAsDataURL(f);
            });
        }

        // Provider selection
        const providerBox = document.getElementById('sgProvider');
        if (providerBox) {
            providerBox.addEventListener('click', (e) => {
                const b = e.target.closest('.mode-btn');
                if (!b) return;
                providerBox.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                aiProvider = b.dataset.provider;
                localStorage.setItem('sg_ai_provider', aiProvider);
                updateGenerateButtonLabel();
            });
            const initB = providerBox.querySelector(`[data-provider="${aiProvider}"]`);
            if (initB) {
                providerBox.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
                initB.classList.add('active');
            }
        }

        const genBtn = document.getElementById('sgGenerateBtn');
        if (genBtn) genBtn.addEventListener('click', handleGenerate);

        updateGenerateButtonLabel();
    }

    function updateGenerateButtonLabel() {
        const btn = document.getElementById('sgGenerateBtn');
        if (!btn) return;
        btn.innerHTML = (aiProvider === 'comfyui') ? '🖥️ Generate Sprite (ComfyUI)' :
                        (aiProvider === 'grok')   ? '✨ Generate Sprite (Grok Imagine)' :
                                                      '✨ Generate Sprite (OpenAI)';
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-2', prompt, n: selectedGenCount, size: '1024x1024' })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (status) status.innerHTML = data.data?.length ? `✅ Generated ${data.data.length} sprite(s)` : '✅ Done';
    }

    async function generateGrok(status) {
        const token = getGrokAccessToken();
        if (!token) {
            throw new Error('No Grok access token found. Please make sure you are logged in with SuperGrok.');
        }

        const prompt = buildPrompt();

        const res = await fetch('/api/xai/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ prompt, n: selectedGenCount })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Grok error: ${err}`);
        }

        const data = await res.json();
        if (status) status.innerHTML = data.data?.length ? `✅ Generated ${data.data.length} sprite(s) with Grok` : '✅ Done';
    }

    async function generateComfyUI(status) {
        const baseUrl = localStorage.getItem('comfyui_base_url') || 'http://127.0.0.1:8188';
        const ckpt = localStorage.getItem('comfyui_checkpoint') || 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
        const promptText = buildPrompt();

        const workflow = {
            "3": { "class_type": "KSampler", "inputs": { "seed": Math.floor(Math.random() * 1e9), "steps": 20, "cfg": 7, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
            "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": ckpt } },
            "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": selectedGenCount } },
            "6": { "class_type": "CLIPTextEncode", "inputs": { "text": promptText, "clip": ["4", 1] } },
            "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "bad quality, blurry", "clip": ["4", 1] } },
            "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
            "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "as_adventurer", "images": ["8", 0] } }
        };

        const qRes = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, path: '/prompt', method: 'POST', body: { prompt: workflow } })
        });

        if (!qRes.ok) throw new Error('ComfyUI queue failed');
        const qData = await qRes.json();
        const pid = qData.prompt_id;

        if (status) status.innerHTML = pid ? '⏳ Generating in ComfyUI...' : '✅ Queued';

        // Basic polling
        if (pid) {
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const hRes = await fetch('/api/comfyui/proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ baseUrl, path: `/history/${pid}`, method: 'GET' })
                    });
                    const hist = await hRes.json();
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