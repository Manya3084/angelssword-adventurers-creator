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

                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const x = (canvas.width - drawW) / 2;
                const y = (canvas.height - drawH) / 2;

                ctx.drawImage(img, x, y, drawW, drawH);
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

        const tabBar = document.getElementById('tabBar');
        if (tabBar) {
            const videoGenTab = tabBar.querySelector('[data-tab="tab-video-gen"]');
            if (videoGenTab) videoGenTab.click();
        }

        setTimeout(() => {
            const status = document.getElementById('vgStatus');
            if (status) {
                status.innerHTML = '<span class="status-msg info">📌 Reference image ready from AI Generate. Upload it in the Reference Image section.</span>';
            }
        }, 500);
    }

    async function handleGenerate() {
        const status = document.getElementById('sgStatus');
        const btn = document.getElementById('sgGenerateBtn');
        const resultsSection = document.getElementById('sgResultsSection');
        const resultsGrid = document.getElementById('sgResultsGrid');

        if (btn) btn.disabled = true;
        if (status) { status.innerHTML = '<span class="spinner"></span> Generating...'; status.style.color = ''; }
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

            if (resultsSection && resultsGrid && resultsGrid.children.length > 0) {
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

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px; margin-top:8px;';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-sm btn-secondary';
        downloadBtn.textContent = '💾 Download';
        downloadBtn.onclick = (e) => { e.stopImmediatePropagation(); const a = document.createElement('a'); a.href = imageSrc; a.download = `generated_${index+1}.png`; a.click(); };

        const selectBtn = document.createElement('button');
        selectBtn.className = 'btn btn-sm btn-primary';
        selectBtn.textContent = '✓ Select';
        selectBtn.onclick = (e) => { e.stopImmediatePropagation(); selectResult(card, resultData); };

        btnGroup.appendChild(downloadBtn);
        btnGroup.appendChild(selectBtn);

        card.appendChild(img);
        card.appendChild(btnGroup);
        img.onclick = () => selectResult(card, resultData);

        return card;
    }

    function selectResult(cardElement, resultData) {
        document.querySelectorAll('#sgResultsGrid .result-card').forEach(c => { c.style.border = '1px solid var(--border)'; c.style.boxShadow = 'none'; });
        cardElement.style.border = '2px solid var(--accent-gold)';
        cardElement.style.boxShadow = '0 0 0 3px rgba(219,184,88,0.2)';

        currentSelectedResult = resultData;

        const canvas = document.getElementById('sgCanvas');
        if (canvas && resultData && resultData.imageSrc) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.fillStyle = selectedKeyColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(img, (canvas.width - w)/2, (canvas.height - h)/2, w, h);
            };
            img.src = resultData.imageSrc;
        }
    }

    async function generateOpenAI(status, resultsGrid) {
        const prompt = buildPrompt();
        const res = await fetch('/api/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-2', prompt, n: selectedGenCount, size: '1024x1024' })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        if (data.data?.length) {
            data.data.forEach((img, i) => {
                const src = img.b64_json ? `data:image/png;base64,${img.b64_json}` : img.url;
                if (src) {
                    const resultData = { imageSrc: src, index: i };
                    generatedResults.push(resultData);
                    resultsGrid.appendChild(createResultCard(src, i, resultData));
                }
            });
            if (status) status.innerHTML = `✅ Generated ${data.data.length} sprite(s)`;
        }
    }

    async function generateGrok(status, resultsGrid) {
        const tokenInfo = getGrokTokenInfo();
        if (!tokenInfo) throw new Error('No SuperGrok token or xAI API key found.');

        const prompt = buildPrompt();
        const models = ['grok-imagine-image-quality', 'grok-imagine-image'];

        for (const model of models) {
            try {
                const res = await fetch('/api/xai/images/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenInfo.value}` },
                    body: JSON.stringify({ model, prompt, n: selectedGenCount })
                });
                if (!res.ok) { if ((await res.text()).includes('Incorrect API key')) continue; throw new Error(await res.text()); }

                const data = await res.json();
                if (data.data?.length) {
                    data.data.forEach((img, i) => {
                        const src = img.b64_json ? `data:image/png;base64,${img.b64_json}` : img.url;
                        if (src) {
                            const resultData = { imageSrc: src, index: i };
                            generatedResults.push(resultData);
                            resultsGrid.appendChild(createResultCard(src, i, resultData));
                        }
                    });
                    if (status) status.innerHTML = `✅ Generated with ${model}`;
                    return;
                }
            } catch (e) { console.error(e); }
        }
        throw new Error('Grok generation failed. Use an xAI API key from console.x.ai.');
    }

    async function generateComfyUI(status, resultsGrid) {
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

        const qRes = await fetch('/api/comfyui/proxy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, path: '/prompt', method: 'POST', body: { prompt: workflow } })
        });
        if (!qRes.ok) throw new Error('ComfyUI queue failed');

        const qData = await qRes.json();
        const pid = qData.prompt_id;
        if (status) status.innerHTML = '⏳ Generating in ComfyUI...';

        if (!pid) return;

        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const hRes = await fetch('/api/comfyui/proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl, path: `/history/${pid}`, method: 'GET' })
                });
                const hist = await hRes.json();
                const output = hist[pid]?.outputs?.["9"]?.images?.[0];

                if (output?.filename) {
                    const filename = output.filename;

                    // Fetch the actual image from ComfyUI
                    const viewRes = await fetch('/api/comfyui/proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            baseUrl,
                            path: `/view?filename=${filename}&type=output`,
                            method: 'GET'
                        })
                    });

                    if (viewRes.ok) {
                        const blob = await viewRes.blob();
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const imageSrc = reader.result;
                            const resultData = { imageSrc, index: 0, filename };
                            generatedResults.push(resultData);

                            const card = createResultCard(imageSrc, 0, resultData);
                            if (resultsGrid) resultsGrid.appendChild(card);

                            if (status) status.innerHTML = `✅ Generated (ComfyUI)`;

                            // Auto select first image
                            if (resultsGrid && resultsGrid.children.length === 1) {
                                selectResult(card, resultData);
                            }
                        };
                        reader.readAsDataURL(blob);
                    } else {
                        if (status) status.innerHTML = `✅ Saved as ${filename} (check ComfyUI output)`;
                    }
                    return;
                }
            } catch (e) {
                // keep polling
            }
        }

        if (status) status.innerHTML = '⏳ Still processing in ComfyUI...';
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