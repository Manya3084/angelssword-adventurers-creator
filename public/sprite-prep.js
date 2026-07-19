(function() {
    'use strict';

    let spriteImage = null;
    let selectedKeyColor = '#00FF00';
    let selectedRaceMode = 'normal';
    let selectedGenCount = 1;
    let charRefBase64 = null;
    let styleRefBase64 = null;
    let aiProvider = localStorage.getItem('sg_ai_provider') || 'openai';
    let generatedResults = [];
    let currentSelectedResult = null;

    const DEFAULTS = {
        name: 'Mirrime the Mage',
        desc: 'Blue hair, red cape, golden feather cap, adventurer outfit',
        action: 'standing pose, confident expression'
    };

    /**
     * Resolve ComfyUI base URL.
     * - If user saved a URL in Settings → use that
     * - If page is opened on localhost → http://127.0.0.1:8188
     * - If page is opened remotely → http://<same-hostname>:8188
     */
    function getComfyUIBaseUrl() {
        const saved = (localStorage.getItem('comfyui_base_url') || '').trim();
        if (saved) return saved;

        const host = window.location.hostname;
        if (!host || host === 'localhost' || host === '127.0.0.1') {
            return 'http://127.0.0.1:8188';
        }
        return `http://${host}:8188`;
    }

    function getGrokTokenInfo() {
        const manualKey = localStorage.getItem('xai_api_key');
        if (manualKey && manualKey.startsWith('xai-')) {
            return { type: 'api_key', value: manualKey };
        }
        const raw = localStorage.getItem('xai_oauth_tokens');
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                const token = parsed.access_token || parsed.token || parsed.accessToken;
                if (token) return { type: 'oauth', value: token };
            } catch (e) {
                if (raw.length > 50) return { type: 'oauth', value: raw };
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
    }

    function initAIGenerateMode() {
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

        // Character Reference
        const charIn = document.getElementById('sgCharRefInput');
        const charPrev = document.getElementById('sgCharRefPreview');
        if (charIn) {
            charIn.addEventListener('change', e => {
                const f = e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = ev => {
                    charRefBase64 = ev.target.result;
                    if (charPrev) {
                        charPrev.innerHTML = `<img src="${charRefBase64}" style="max-height:120px; border-radius:8px; border:1px solid var(--border);">`;
                        charPrev.classList.remove('hidden');
                    }
                };
                r.readAsDataURL(f);
            });
        }

        // Style Reference
        const styleIn = document.getElementById('sgStyleRefInput');
        const stylePrev = document.getElementById('sgStyleRefPreview');
        if (styleIn) {
            styleIn.addEventListener('change', e => {
                const f = e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = ev => {
                    styleRefBase64 = ev.target.result;
                    if (stylePrev) {
                        stylePrev.innerHTML = `<img src="${styleRefBase64}" style="max-height:120px; border-radius:8px; border:1px solid var(--border);">`;
                        stylePrev.classList.remove('hidden');
                    }
                };
                r.readAsDataURL(f);
            });
        }

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

        const toManualBtn = document.getElementById('sgToManualBtn');
        if (toManualBtn) toManualBtn.addEventListener('click', handoffToManual);

        const handoffBtn = document.getElementById('sgHandoffBtn');
        if (handoffBtn) handoffBtn.addEventListener('click', handoffToVideoGen);

        updateGenerateButtonLabel();
    }

    function updateGenerateButtonLabel() {
        const btn = document.getElementById('sgGenerateBtn');
        if (!btn) return;
        if (aiProvider === 'comfyui') btn.innerHTML = '🖥️ Generate Sprite (ComfyUI)';
        else if (aiProvider === 'grok') btn.innerHTML = '✨ Generate Sprite (Grok Imagine)';
        else btn.innerHTML = '✨ Generate Sprite (OpenAI)';
    }

    function getFieldValue(id, defaultValue) {
        const el = document.getElementById(id);
        if (!el) return defaultValue;
        const val = (el.value || '').trim();
        return val.length > 0 ? val : defaultValue;
    }

    function buildPrompt() {
        const name = getFieldValue('sgCharName', DEFAULTS.name);
        const desc = getFieldValue('sgCharDesc', DEFAULTS.desc);
        const action = getFieldValue('sgCharAction', DEFAULTS.action);

        let p = `Full body clean sprite of ${name}. ${desc}. ${action}. White background, game asset style, clean lines. Race: ${selectedRaceMode}.`;

        if (charRefBase64) p += ` Use the uploaded character reference for face, clothing and pose accuracy.`;
        if (styleRefBase64) p += ` Match the visual style of the uploaded style reference.`;

        return p;
    }

    function buildComfyPrompt() {
        const name = getFieldValue('sgCharName', DEFAULTS.name);
        const desc = getFieldValue('sgCharDesc', DEFAULTS.desc);
        const action = getFieldValue('sgCharAction', DEFAULTS.action);

        let positive = `score_9, score_8_up, score_7_up, source_anime, rating_safe, ` +
                       `full body, standing, clean sprite, white background, simple background, ` +
                       `game asset, character design, ${name}, ${desc}, ${action}, ` +
                       `sharp focus, highly detailed, anime style`;

        if (selectedRaceMode === 'kanolith') positive += ', animal features, furry';
        if (selectedRaceMode === 'zoalith') positive += ', dragon features, scales';

        return positive;
    }

    function handoffToManual() {
        if (!currentSelectedResult || !currentSelectedResult.imageSrc) {
            alert('Please select a generated image first.');
            return;
        }

        const modeSelector = document.getElementById('spritePrepMode');
        const manualMode = document.getElementById('spriteManualMode');
        const generateMode = document.getElementById('spriteGenerateMode');

        if (modeSelector) modeSelector.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        const manualBtn = modeSelector ? modeSelector.querySelector('[data-mode="manual"]') : null;
        if (manualBtn) manualBtn.classList.add('active');

        if (manualMode) manualMode.classList.remove('hidden');
        if (generateMode) generateMode.classList.add('hidden');

        const canvas = document.getElementById('spCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.fillStyle = selectedKeyColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                const s = Math.min(canvas.width / img.width, canvas.height / img.height);
                ctx.drawImage(img, (canvas.width - img.width * s) / 2, (canvas.height - img.height * s) / 2, img.width * s, img.height * s);
            };
            img.src = currentSelectedResult.imageSrc;
        }
        spriteImage = currentSelectedResult.imageSrc;
    }

    function handoffToVideoGen() {
        if (!currentSelectedResult || !currentSelectedResult.imageSrc) {
            alert('Please select a generated image first.');
            return;
        }

        if (!window.ASAdventurer) window.ASAdventurer = {};
        if (!window.ASAdventurer.handoff) window.ASAdventurer.handoff = {};

        window.ASAdventurer.handoff.spriteBase64 = currentSelectedResult.imageSrc;

        const tabBar = document.getElementById('tabBar');
        if (tabBar) {
            const vtab = tabBar.querySelector('[data-tab="tab-video-gen"]');
            if (vtab) vtab.click();
        }
    }

    async function handleGenerate() {
        const status = document.getElementById('sgStatus');
        const btn = document.getElementById('sgGenerateBtn');
        const resultsSection = document.getElementById('sgResultsSection');
        const resultsGrid = document.getElementById('sgResultsGrid');

        if (btn) btn.disabled = true;
        if (status) status.innerHTML = '<span class="spinner"></span> Generating...';
        if (resultsSection) resultsSection.classList.add('hidden');
        if (resultsGrid) resultsGrid.innerHTML = '';
        generatedResults = [];
        currentSelectedResult = null;

        try {
            if (aiProvider === 'comfyui') {
                await generateComfyUI(status, resultsGrid);
            } else if (aiProvider === 'grok') {
                await generateGrok(status, resultsGrid);
            } else {
                await generateOpenAI(status, resultsGrid);
            }

            if (resultsSection && resultsGrid?.children.length > 0) {
                resultsSection.classList.remove('hidden');
            }
        } catch (e) {
            if (status) { status.innerHTML = '❌ ' + e.message; status.style.color = 'var(--red, red)'; }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function createResultCard(imageSrc, index, resultData) {
        const card = document.createElement('div');
        card.className = 'result-card glass-panel';
        card.style.cssText = 'padding:8px; cursor:pointer;';

        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = 'width:100%; border-radius:6px; display:block;';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex; gap:6px; margin-top:8px;';

        const dl = document.createElement('button');
        dl.className = 'btn btn-sm btn-secondary';
        dl.textContent = '💾 Download';
        dl.onclick = (e) => { e.stopImmediatePropagation(); const a = document.createElement('a'); a.href = imageSrc; a.download = `generated_${index + 1}.png`; a.click(); };

        const sel = document.createElement('button');
        sel.className = 'btn btn-sm btn-primary';
        sel.textContent = '✓ Select';
        sel.onclick = (e) => { e.stopImmediatePropagation(); selectResult(card, resultData); };

        btns.appendChild(dl);
        btns.appendChild(sel);
        card.appendChild(img);
        card.appendChild(btns);
        img.onclick = () => selectResult(card, resultData);
        return card;
    }

    function selectResult(card, data) {
        document.querySelectorAll('#sgResultsGrid .result-card').forEach(c => { c.style.border = '1px solid var(--border)'; c.style.boxShadow = 'none'; });
        card.style.border = '2px solid var(--accent-gold)';
        card.style.boxShadow = '0 0 0 3px rgba(219, 184, 88, 0.2)';
        currentSelectedResult = data;

        const canvas = document.getElementById('sgCanvas');
        if (canvas && data?.imageSrc) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.fillStyle = selectedKeyColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                const s = Math.min(canvas.width / img.width, canvas.height / img.height);
                ctx.drawImage(img, (canvas.width - img.width * s) / 2, (canvas.height - img.height * s) / 2, img.width * s, img.height * s);
            };
            img.src = data.imageSrc;
        }
    }

    async function generateOpenAI(status, grid) {
        const prompt = buildPrompt();
        const hasRef = !!charRefBase64;

        let res;
        if (hasRef) {
            res = await fetch('/api/edits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-image-2',
                    prompt: prompt,
                    n: selectedGenCount,
                    size: '1024x1024',
                    images: [charRefBase64]
                })
            });
        } else {
            res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gpt-image-2', prompt, n: selectedGenCount, size: '1024x1024' })
            });
        }

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        data.data?.forEach((d, i) => {
            const src = d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url;
            if (src) {
                const rd = { imageSrc: src, index: i };
                generatedResults.push(rd);
                grid.appendChild(createResultCard(src, i, rd));
            }
        });

        if (status) status.innerHTML = `✅ Generated ${data.data?.length || 0} sprite(s)`;
    }

    async function generateGrok(status, grid) {
        const tok = getGrokTokenInfo();
        if (!tok) throw new Error('No SuperGrok token or xAI API key found.');

        const prompt = buildPrompt();
        const models = ['grok-imagine-image-quality', 'grok-imagine-image'];

        for (const model of models) {
            try {
                const res = await fetch('/api/xai/images/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok.value}` },
                    body: JSON.stringify({ model, prompt, n: selectedGenCount })
                });
                if (!res.ok) {
                    const txt = await res.text();
                    if (txt.includes('Incorrect API key')) continue;
                    throw new Error(txt);
                }
                const data = await res.json();

                if (data.data?.length) {
                    data.data.forEach((d, i) => {
                        const src = d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url;
                        if (src) {
                            const rd = { imageSrc: src, index: i };
                            generatedResults.push(rd);
                            grid.appendChild(createResultCard(src, i, rd));
                        }
                    });
                    if (status) status.innerHTML = `✅ Generated with ${model}`;
                    return;
                }
            } catch (e) {
                console.error(e);
            }
        }
        throw new Error('Grok generation failed. Use an xAI API key from console.x.ai.');
    }

    async function uploadImageToComfy(baseUrl, dataUrl, filename) {
        const res = await fetch('/api/comfyui/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: baseUrl,
                image: dataUrl,
                filename: filename || `as_ref_${Date.now()}.png`
            })
        });
        if (!res.ok) throw new Error('Failed to upload reference image to ComfyUI');
        const data = await res.json();
        return data.name || data.filename || filename;
    }

    async function generateComfyUI(status, grid) {
        const base = getComfyUIBaseUrl();
        const ckpt = localStorage.getItem('comfyui_checkpoint') || 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';

        console.log('[ComfyUI] Using base URL:', base);

        if (status) status.innerHTML = '⏳ Preparing IP-Adapter + Pony workflow...';

        let refFilename = null;
        if (charRefBase64) {
            try {
                refFilename = await uploadImageToComfy(base, charRefBase64, `as_char_ref_${Date.now()}.png`);
                console.log('[ComfyUI] Uploaded character reference as:', refFilename);
            } catch (e) {
                console.warn('[ComfyUI] Could not upload reference, falling back to text-only:', e);
            }
        }

        const positiveText = buildComfyPrompt();
        const negativeText = 'score_6, score_5, score_4, blurry, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, artist name, black background, solid black, empty, pure black';

        let wf;
        let saveNodeId;

        if (refFilename) {
            wf = {
                "1": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": { "ckpt_name": ckpt }
                },
                "2": {
                    "class_type": "LoadImage",
                    "inputs": { "image": refFilename }
                },
                "3": {
                    "class_type": "IPAdapterModelLoader",
                    "inputs": {
                        "ipadapter_file": "ip-adapter-plus-face_sdxl_vit-h.safetensors"
                    }
                },
                "4": {
                    "class_type": "CLIPVisionLoader",
                    "inputs": {
                        "clip_name": "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
                    }
                },
                "5": {
                    "class_type": "IPAdapterAdvanced",
                    "inputs": {
                        "model": ["1", 0],
                        "ipadapter": ["3", 0],
                        "image": ["2", 0],
                        "clip_vision": ["4", 0],
                        "weight": 0.85,
                        "weight_type": "linear",
                        "combine_embeds": "concat",
                        "start_at": 0.0,
                        "end_at": 1.0,
                        "embeds_scaling": "V only"
                    }
                },
                "6": {
                    "class_type": "CLIPTextEncode",
                    "inputs": { "text": positiveText, "clip": ["1", 1] }
                },
                "7": {
                    "class_type": "CLIPTextEncode",
                    "inputs": { "text": negativeText, "clip": ["1", 1] }
                },
                "8": {
                    "class_type": "EmptyLatentImage",
                    "inputs": { "width": 1216, "height": 832, "batch_size": 1 }
                },
                "9": {
                    "class_type": "KSampler",
                    "inputs": {
                        "seed": Math.floor(Math.random() * 1e9),
                        "steps": 28,
                        "cfg": 5.0,
                        "sampler_name": "dpmpp_2m",
                        "scheduler": "karras",
                        "denoise": 1,
                        "model": ["5", 0],
                        "positive": ["6", 0],
                        "negative": ["7", 0],
                        "latent_image": ["8", 0]
                    }
                },
                "10": {
                    "class_type": "VAEDecode",
                    "inputs": { "samples": ["9", 0], "vae": ["1", 2] }
                },
                "11": {
                    "class_type": "SaveImage",
                    "inputs": { "filename_prefix": "as_adventurer", "images": ["10", 0] }
                }
            };
            saveNodeId = "11";
        } else {
            wf = {
                "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": ckpt } },
                "2": { "class_type": "CLIPTextEncode", "inputs": { "text": positiveText, "clip": ["1", 1] } },
                "3": { "class_type": "CLIPTextEncode", "inputs": { "text": negativeText, "clip": ["1", 1] } },
                "4": { "class_type": "EmptyLatentImage", "inputs": { "width": 1216, "height": 832, "batch_size": 1 } },
                "5": {
                    "class_type": "KSampler",
                    "inputs": {
                        "seed": Math.floor(Math.random() * 1e9),
                        "steps": 28,
                        "cfg": 5.0,
                        "sampler_name": "dpmpp_2m",
                        "scheduler": "karras",
                        "denoise": 1,
                        "model": ["1", 0],
                        "positive": ["2", 0],
                        "negative": ["3", 0],
                        "latent_image": ["4", 0]
                    }
                },
                "6": { "class_type": "VAEDecode", "inputs": { "samples": ["5", 0], "vae": ["1", 2] } },
                "7": { "class_type": "SaveImage", "inputs": { "filename_prefix": "as_adventurer", "images": ["6", 0] } }
            };
            saveNodeId = "7";
        }

        const q = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl: base, path: '/prompt', method: 'POST', body: { prompt: wf } })
        });
        if (!q.ok) {
            const errText = await q.text();
            throw new Error('ComfyUI queue failed: ' + errText);
        }
        const qd = await q.json();
        const pid = qd.prompt_id;
        if (status) status.innerHTML = refFilename ? '⏳ Generating with IP-Adapter + Pony @ 1216×832...' : '⏳ Generating with Pony @ 1216×832...';

        if (!pid) return;

        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const h = await fetch('/api/comfyui/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl: base, path: `/history/${pid}`, method: 'GET' })
                });
                const hist = await h.json();
                const out = hist[pid]?.outputs?.[saveNodeId]?.images?.[0];
                if (out?.filename) {
                    const fname = out.filename;
                    console.log('[ComfyUI] Got filename:', fname);

                    try {
                        const v = await fetch('/api/comfyui/proxy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                baseUrl: base,
                                path: `/view?filename=${encodeURIComponent(fname)}&type=output`,
                                method: 'GET',
                                isBinary: true
                            })
                        });

                        if (v.ok) {
                            const blob = await v.blob();
                            const dataUrl = await new Promise(resolve => {
                                const fr = new FileReader();
                                fr.onload = () => resolve(fr.result);
                                fr.readAsDataURL(blob);
                            });

                            const rd = { imageSrc: dataUrl, index: 0, filename: fname };
                            generatedResults.push(rd);
                            const card = createResultCard(dataUrl, 0, rd);
                            if (grid) grid.appendChild(card);

                            if (status) status.innerHTML = `✅ Generated (IP-Adapter + Pony)`;

                            if (grid && grid.children.length === 1) {
                                selectResult(card, rd);
                            }
                            return;
                        }
                    } catch (e) {
                        console.error('[ComfyUI] Image fetch failed:', e);
                        if (status) status.innerHTML = `✅ Saved: ${fname} (check ComfyUI output)`;
                        return;
                    }
                }
            } catch (e) {}
        }
        if (status) status.innerHTML = '⏳ Still processing...';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();
