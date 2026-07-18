 (function() {
    'use strict';

    // State
    let spriteImage = null;
    let spriteFileName = '';
    let selectedKeyColor = '#00FF00';
    let selectedRaceMode = 'normal';
    let selectedGenCount = 1;
    let offset = parseInt(localStorage.getItem('sp-offset')) || 0;
    let zoom = parseInt(localStorage.getItem('sp-zoom')) || 100;

    // Generative state
    let charRefBase64 = null;
    let styleRefBase64 = null;
    let aiProvider = localStorage.getItem('sg_ai_provider') || 'openai';

    function getGrokAccessToken() {
        // Try many possible keys used by xAI/SuperGrok OAuth flows
        const possibleKeys = [
            'grok_access_token',
            'xai_access_token',
            'access_token',
            'grok_token',
            'superGrokToken',
            'grokSession',
            'xai_token',
            'oauth_token'
        ];

        for (const key of possibleKeys) {
            const val = localStorage.getItem(key);
            if (val) return val;
        }

        // Also try to find any key that looks like a JWT
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const val = localStorage.getItem(key);
            if (val && val.length > 100 && val.split('.').length === 3) {
                return val; // looks like a JWT
            }
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
        console.log('[SpritePrep] Initialized');
    }

    function initAIGenerateMode() {
        // Race Mode
        const raceModeContainer = document.getElementById('sgRaceMode');
        if (raceModeContainer) {
            raceModeContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;

                raceModeContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                selectedRaceMode = btn.dataset.mode || 'normal';
            });

            const defaultBtn = raceModeContainer.querySelector('.mode-btn.active') || raceModeContainer.querySelector('.mode-btn');
            if (defaultBtn) {
                defaultBtn.classList.add('active');
                selectedRaceMode = defaultBtn.dataset.mode || 'normal';
            }
        }

        // Key Color
        const colorSwatches = document.getElementById('sgColorSwatches');
        if (colorSwatches) {
            colorSwatches.addEventListener('click', (e) => {
                const swatch = e.target.closest('.color-swatch');
                if (!swatch) return;

                colorSwatches.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');

                selectedKeyColor = swatch.dataset.color || '#00FF00';
            });

            const initialSwatch = colorSwatches.querySelector('.color-swatch.selected') || colorSwatches.querySelector('.color-swatch');
            if (initialSwatch) {
                initialSwatch.classList.add('selected');
                selectedKeyColor = initialSwatch.dataset.color || '#00FF00';
            }
        }

        // Simultaneous Generations
        const genCountContainer = document.getElementById('sgGenCount');
        if (genCountContainer) {
            genCountContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.gen-count-btn');
                if (!btn) return;

                genCountContainer.querySelectorAll('.gen-count-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                selectedGenCount = parseInt(btn.dataset.count) || 1;
            });

            const defaultBtn = genCountContainer.querySelector('.gen-count-btn.active') || genCountContainer.querySelector('.gen-count-btn');
            if (defaultBtn) {
                defaultBtn.classList.add('active');
                selectedGenCount = parseInt(defaultBtn.dataset.count) || 1;
            }
        }

        // Character Reference
        const charRefInput = document.getElementById('sgCharRefInput');
        const charRefPreview = document.getElementById('sgCharRefPreview');

        if (charRefInput) {
            charRefInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    charRefBase64 = ev.target.result;
                    if (charRefPreview) {
                        charRefPreview.innerHTML = `<img src="${charRefBase64}" style="max-height:120px;border-radius:8px;border:1px solid var(--border);">`;
                        charRefPreview.classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // Style Reference
        const styleRefInput = document.getElementById('sgStyleRefInput');
        const styleRefPreview = document.getElementById('sgStyleRefPreview');

        if (styleRefInput) {
            styleRefInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    styleRefBase64 = ev.target.result;
                    if (styleRefPreview) {
                        styleRefPreview.innerHTML = `<img src="${styleRefBase64}" style="max-height:120px;border-radius:8px;border:1px solid var(--border);">`;
                        styleRefPreview.classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // Provider buttons
        const providerContainer = document.getElementById('sgProvider');
        if (providerContainer) {
            providerContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;

                providerContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                aiProvider = btn.dataset.provider;
                localStorage.setItem('sg_ai_provider', aiProvider);
                updateGenerateButtonLabel();
            });

            const initialBtn = providerContainer.querySelector(`[data-provider="${aiProvider}"]`);
            if (initialBtn) {
                providerContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                initialBtn.classList.add('active');
            }
        }

        // Generate button
        const generateBtn = document.getElementById('sgGenerateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', handleGenerate);
        }

        updateGenerateButtonLabel();
    }

    function updateGenerateButtonLabel() {
        const btn = document.getElementById('sgGenerateBtn');
        if (!btn) return;

        if (aiProvider === 'comfyui') {
            btn.innerHTML = '🖥️ Generate Sprite (ComfyUI)';
        } else if (aiProvider === 'grok') {
            btn.innerHTML = '✨ Generate Sprite (Grok Imagine)';
        } else {
            btn.innerHTML = '✨ Generate Sprite (OpenAI)';
        }
    }

    async function handleGenerate() {
        const statusEl = document.getElementById('sgStatus');
        const btn = document.getElementById('sgGenerateBtn');

        if (btn) btn.disabled = true;
        if (statusEl) {
            statusEl.innerHTML = '<span class="spinner"></span> Generating...';
            statusEl.style.color = '';
        }

        try {
            if (aiProvider === 'comfyui') {
                await generateComfyUI(statusEl);
            } else if (aiProvider === 'grok') {
                await generateGrok(statusEl);
            } else {
                await generateOpenAI(statusEl);
            }
        } catch (e) {
            console.error(e);
            if (statusEl) {
                statusEl.innerHTML = '❌ ' + (e.message || e);
                statusEl.style.color = 'var(--red, red)';
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function generateOpenAI(statusEl) {
        const name = document.getElementById('sgCharName')?.value || 'character';
        const desc = document.getElementById('sgCharDesc')?.value || '';

        const prompt = `Full body clean sprite of ${name}. ${desc}. White background, game asset style. Race: ${selectedRaceMode}.`;

        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-image-2',
                prompt: prompt,
                n: selectedGenCount,
                size: '1024x1024'
            })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OpenAI failed: ${res.status} ${text}`);
        }

        const data = await res.json();
        if (statusEl) {
            statusEl.innerHTML = (data.data && data.data.length > 0)
                ? `✅ Generated ${data.data.length} sprite(s)`
                : '✅ Done';
        }
    }

    async function generateGrok(statusEl) {
        const token = getGrokAccessToken();

        if (!token) {
            throw new Error('No Grok access token found. Please log in with SuperGrok first.');
        }

        const name = document.getElementById('sgCharName')?.value || 'character';
        const desc = document.getElementById('sgCharDesc')?.value || '';

        const prompt = `Full body clean sprite of ${name}. ${desc}. White background, game asset style. Race: ${selectedRaceMode}.`;

        const res = await fetch('/api/xai/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                prompt: prompt,
                n: selectedGenCount,
                size: '1024x1024'
            })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Grok failed: ${res.status} ${text}`);
        }

        const data = await res.json();
        if (statusEl) {
            statusEl.innerHTML = (data.data && data.data.length > 0)
                ? `✅ Generated ${data.data.length} sprite(s) with Grok` 
                : '✅ Done with Grok';
        }
    }

    async function generateComfyUI(statusEl) {
        const baseUrl = localStorage.getItem('comfyui_base_url') || 'http://127.0.0.1:8188';
        const checkpoint = localStorage.getItem('comfyui_checkpoint') || 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';

        const name = document.getElementById('sgCharName')?.value || 'character';
        const desc = document.getElementById('sgCharDesc')?.value || '';

        const workflow = {
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": Math.floor(Math.random() * 1000000000),
                    "steps": 20,
                    "cfg": 7,
                    "sampler_name": "euler_ancestral",
                    "scheduler": "normal",
                    "denoise": 1,
                    "model": ["4", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0]
                }
            },
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": { "ckpt_name": checkpoint }
            },
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": { "width": 1024, "height": 1024, "batch_size": selectedGenCount }
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": { "text": `${name}, ${desc}, full body sprite, clean background`, "clip": ["4", 1] }
            },
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": { "text": "blurry, lowres, bad anatomy", "clip": ["4", 1] }
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": { "samples": ["3", 0], "vae": ["4", 2] }
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": { "filename_prefix": "as_adventurer", "images": ["8", 0] }
            }
        };

        const queueRes = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: baseUrl,
                path: '/prompt',
                method: 'POST',
                body: { prompt: workflow }
            })
        });

        if (!queueRes.ok) {
            const text = await queueRes.text();
            throw new Error(`ComfyUI queue failed: ${queueRes.status} ${text}`);
        }

        const queueData = await queueRes.json();
        const promptId = queueData.prompt_id;

        if (!promptId) {
            if (statusEl) statusEl.innerHTML = '✅ Queued in ComfyUI';
            return;
        }

        if (statusEl) statusEl.innerHTML = '⏳ Waiting for ComfyUI...';

        // Simple polling for result (max ~30 seconds)
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 2000));

            try {
                const historyRes = await fetch('/api/comfyui/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        baseUrl: baseUrl,
                        path: `/history/${promptId}`,
                        method: 'GET'
                    })
                });

                const history = await historyRes.json();
                const output = history[promptId]?.outputs;

                if (output) {
                    if (statusEl) statusEl.innerHTML = '✅ ComfyUI generation complete';
                    console.log('[ComfyUI] Generation finished', output);
                    return;
                }
            } catch (e) {
                // ignore polling errors
            }
        }

        if (statusEl) statusEl.innerHTML = '⏳ Still processing in ComfyUI (check queue)';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();