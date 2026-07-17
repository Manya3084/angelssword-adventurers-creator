/**
 * ⚔️ ComfyUI bridge — UI injection + generation helpers
 * Adds ComfyUI provider buttons, Settings panel, and generation entry points.
 */
(function () {
    'use strict';

    function ensureClient() {
        if (!window.ComfyUIClient) throw new Error('ComfyUI client not loaded');
        return window.ComfyUIClient;
    }

    async function ensureReachable() {
        const c = ensureClient();
        try {
            await c.testConnection();
        } catch (e) {
            throw new Error(
                'Cannot reach ComfyUI at ' + c.getBaseUrl() +
                '. Start ComfyUI and check Settings → ComfyUI. (' + e.message + ')'
            );
        }
    }

    async function generateSprite(promptText, onProgress) {
        await ensureReachable();
        return ensureClient().generateSprite({
            prompt: promptText,
            width: 1280,
            height: 720,
            onProgress
        });
    }

    async function generateVideo(promptText, imageDataUrl, duration, onProgress) {
        await ensureReachable();
        return ensureClient().generateVideo({
            prompt: promptText,
            imageDataUrl,
            duration,
            onProgress
        });
    }

    // ---------- UI injection ----------

    function injectProviderButton(containerId, provider, label, title) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (el.querySelector(`[data-provider="${provider}"]`)) return;

        const btn = document.createElement('button');
        btn.className = 'mode-btn';
        btn.dataset.provider = provider;
        btn.title = title;
        btn.textContent = label;
        el.appendChild(btn);
    }

    function injectSettingsPanel() {
        const section = document.querySelector('#tab-settings .settings-section');
        if (!section || document.getElementById('settingsComfyUrl')) return;

        const panel = document.createElement('div');
        panel.className = 'glass-panel';
        panel.innerHTML = `
            <div class="panel-title"><span class="title-icon">🖥️</span> ComfyUI (Local)</div>
            <div class="panel-subtitle">
                Use a local <strong>ComfyUI</strong> instance for sprites (Animagine XL 4.0 / SDXL) and video.
                ComfyUI must be running. Default: <code>http://127.0.0.1:8188</code>
            </div>
            <div class="form-row">
                <label for="settingsComfyUrl">ComfyUI URL</label>
                <input type="text" id="settingsComfyUrl" placeholder="http://127.0.0.1:8188">
            </div>
            <div class="form-row">
                <label for="settingsComfyCkpt">Checkpoint filename</label>
                <input type="text" id="settingsComfyCkpt" placeholder="animagine-xl-4.0.safetensors">
                <div class="text-dim mt-1" style="font-size:0.7rem">Must match the exact filename in ComfyUI/models/checkpoints/</div>
            </div>
            <div class="api-key-row" style="margin-top:0.5rem">
                <button class="btn btn-sm btn-secondary" id="settingsComfySave">Save</button>
                <button class="btn btn-sm btn-accent" id="settingsComfyTest">Test Connection</button>
            </div>
            <div id="settingsComfyStatus"></div>
        `;

        // Insert before Notifications panel if present, else append
        const notif = section.querySelector('.panel-title') &&
            Array.from(section.querySelectorAll('.glass-panel')).find(p =>
                p.textContent.includes('Notifications')
            );
        if (notif) section.insertBefore(panel, notif);
        else {
            const about = Array.from(section.querySelectorAll('.glass-panel')).find(p =>
                p.querySelector('.about-section')
            );
            if (about) section.insertBefore(panel, about);
            else section.appendChild(panel);
        }

        wireSettingsHandlers();
    }

    function wireSettingsHandlers() {
        const c = window.ComfyUIClient;
        if (!c) return;

        const urlInput = document.getElementById('settingsComfyUrl');
        const ckptInput = document.getElementById('settingsComfyCkpt');
        const saveBtn = document.getElementById('settingsComfySave');
        const testBtn = document.getElementById('settingsComfyTest');
        const statusEl = document.getElementById('settingsComfyStatus');

        if (urlInput) urlInput.value = c.getBaseUrl();
        if (ckptInput) ckptInput.value = c.getCheckpoint();

        saveBtn?.addEventListener('click', () => {
            c.setBaseUrl(urlInput.value.trim() || c.DEFAULT_URL);
            if (ckptInput) c.setCheckpoint(ckptInput.value.trim() || c.DEFAULT_CKPT);
            showToast('ComfyUI settings saved', 'success');
        });

        testBtn?.addEventListener('click', async () => {
            c.setBaseUrl(urlInput.value.trim() || c.DEFAULT_URL);
            if (ckptInput) c.setCheckpoint(ckptInput.value.trim() || c.DEFAULT_CKPT);
            if (statusEl) statusEl.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Testing ComfyUI…</div>';
            try {
                await c.testConnection();
                if (statusEl) statusEl.innerHTML = '<div class="status-msg success">✅ ComfyUI connected</div>';
                showToast('ComfyUI connection OK', 'success');
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
                showToast(err.message, 'error');
            }
        });
    }

    function patchProviderLabels() {
        // Sprite prep generate button label support
        const origSg = document.getElementById('sgGenerateBtn');
        // Video gen is handled in video-gen.js label fn if present
    }

    /**
     * Monkey-patch sprite-prep generate path by wrapping the Generate button.
     * When ComfyUI is selected, we intercept and run local generation.
     */
    function patchSpriteGenerate() {
        const btn = document.getElementById('sgGenerateBtn');
        if (!btn || btn.dataset.comfyPatched) return;
        btn.dataset.comfyPatched = '1';

        btn.addEventListener('click', async (e) => {
            const container = document.getElementById('sgProvider');
            const active = container?.querySelector('.mode-btn.active');
            const provider = active?.dataset.provider;
            if (provider !== 'comfyui') return; // let normal handler run

            e.stopImmediatePropagation();
            e.preventDefault();

            const name = document.getElementById('sgCharName')?.value?.trim();
            if (!name) {
                showToast('Please enter a character name', 'warning');
                return;
            }

            // Reuse prompt builder from DOM fields (same structure as sprite-prep)
            const desc = document.getElementById('sgCharDesc')?.value?.trim() || '';
            const action = document.getElementById('sgCharAction')?.value?.trim() || 'standing in a neutral idle position';
            const keySwatch = document.querySelector('#sgColorSwatches .color-swatch.selected');
            const keyHex = keySwatch?.dataset.color || '#00FF00';
            const keyName = (window.colorName && window.colorName(keyHex)) || 'Green';

            const raceActive = document.querySelector('#sgRaceMode .mode-btn.active');
            const race = raceActive?.dataset.mode || 'normal';
            let raceDirective = '';
            if (race === 'kanolith') {
                raceDirective = 'Kemonomimi style: fully human face, animal ears and tail only. ';
            } else if (race === 'zoalith') {
                raceDirective = 'Full anthropomorphic beastfolk with snout and fur. ';
            }

            const promptText = [
                `A single ${name}${desc ? ', ' + desc : ''}, ${action}.`,
                raceDirective,
                `Character shown from the waist up, centered, lower portion of canvas.`,
                `Entire background must be solid uniform ${keyName} (${keyHex}), no gradients.`,
                `High-quality anime/JRPG art style, clean linework, cel-shading.`,
                `1280x720, crisp edges, bold outlines, flat studio lighting.`
            ].join(' ');

            const genCountEl = document.getElementById('sgGenCount');
            const countBtn = genCountEl?.querySelector('.gen-count-btn.active');
            const genCount = countBtn ? parseInt(countBtn.dataset.count) : 1;

            const status = document.getElementById('sgStatus');
            const progress = document.getElementById('sgProgress');
            progress?.classList.add('active');
            btn.disabled = true;
            if (status) status.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Generating with ComfyUI (Animagine XL)…</div>';

            try {
                const results = [];
                for (let i = 0; i < genCount; i++) {
                    const dataUrl = await generateSprite(promptText, (p) => {
                        if (status && p.stage === 'polling') {
                            status.innerHTML = `<div class="status-msg info"><span class="spinner"></span> ComfyUI working… (${p.attempt || 0})</div>`;
                        }
                    });
                    results.push(dataUrl);
                }

                // Populate results grid similarly to sprite-prep
                const grid = document.getElementById('sgResultsGrid');
                const section = document.getElementById('sgResultsSection');
                if (grid && section) {
                    grid.innerHTML = '';
                    section.classList.remove('hidden');
                    results.forEach((dataUrl, idx) => {
                        const card = document.createElement('div');
                        card.className = 'result-card' + (idx === 0 ? ' selected' : '');
                        card.innerHTML = `
                            <img src="${dataUrl}" alt="ComfyUI sprite ${idx + 1}">
                            <div class="card-actions">
                                <button class="btn btn-sm btn-secondary" data-comfy-dl="${idx}">💾 Save</button>
                                <button class="btn btn-sm btn-primary" data-comfy-sel="${idx}">✓ Select</button>
                            </div>`;
                        grid.appendChild(card);
                    });

                    // Store for handoff via shared handoff + canvas preview
                    window.__comfySpriteResults = results;
                    window.__comfySelectedSprite = results[0];

                    const canvas = document.getElementById('sgCanvas');
                    if (canvas && results[0]) {
                        const ctx = canvas.getContext('2d');
                        const img = new Image();
                        img.onload = () => {
                            ctx.clearRect(0, 0, 1280, 720);
                            const scale = Math.min(1280 / img.width, 720 / img.height);
                            const w = img.width * scale, h = img.height * scale;
                            ctx.drawImage(img, (1280 - w) / 2, (720 - h) / 2, w, h);
                        };
                        img.src = results[0];
                    }

                    grid.onclick = (ev) => {
                        const dl = ev.target.closest('[data-comfy-dl]');
                        const sel = ev.target.closest('[data-comfy-sel]');
                        if (dl) {
                            const i = parseInt(dl.dataset.comfyDl);
                            const a = document.createElement('a');
                            a.href = results[i];
                            a.download = `${name || 'sprite'}_comfy_${i + 1}.png`;
                            a.click();
                        }
                        if (sel) {
                            const i = parseInt(sel.dataset.comfySel);
                            window.__comfySelectedSprite = results[i];
                            grid.querySelectorAll('.result-card').forEach((c, j) =>
                                c.classList.toggle('selected', j === i)
                            );
                        }
                    };

                    // Hook handoff buttons to use comfy selection when present
                    const handoff = document.getElementById('sgHandoffBtn');
                    if (handoff && !handoff.dataset.comfyHandoff) {
                        handoff.dataset.comfyHandoff = '1';
                        handoff.addEventListener('click', (ev) => {
                            const src = window.__comfySelectedSprite;
                            if (!src) return;
                            // If comfy results exist and provider was comfy, set handoff
                            if (window.ASAdventurer) {
                                window.ASAdventurer.handoff.spriteBase64 = src;
                                try {
                                    window.ASAdventurer.handoff.spriteBlob = base64ToBlob(src);
                                } catch (_) {}
                            }
                        }, true);
                    }
                }

                if (status) status.innerHTML = `<div class="status-msg success">✅ Generated ${results.length} sprite(s) with ComfyUI!</div>`;
                window.notificationSound?.play();
            } catch (err) {
                console.error('[ComfyUI sprite]', err);
                if (status) status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
                showToast(err.message, 'error');
            } finally {
                progress?.classList.remove('active');
                btn.disabled = false;
            }
        }, true); // capture phase so we run before sprite-prep handler
    }

    function patchVideoGenerate() {
        const btn = document.getElementById('vgGenerateBtn');
        if (!btn || btn.dataset.comfyPatched) return;
        btn.dataset.comfyPatched = '1';

        btn.addEventListener('click', async (e) => {
            const container = document.getElementById('vgProvider');
            const active = container?.querySelector('.mode-btn.active');
            const provider = active?.dataset.provider;
            if (provider !== 'comfyui') return;

            e.stopImmediatePropagation();
            e.preventDefault();

            // Get reference image from handoff or preview
            let imageDataUrl =
                window.ASAdventurer?.handoff?.spriteBase64 ||
                document.getElementById('vgRefImage')?.src ||
                null;

            if (!imageDataUrl || imageDataUrl === window.location.href) {
                showToast('Upload a reference image or send one from Sprite Prep first', 'warning');
                return;
            }

            const prompt =
                document.getElementById('vgPrompt')?.value?.trim() ||
                'subtle idle breathing animation, locked camera, seamless loop';
            const duration = parseInt(document.getElementById('vgDuration')?.value || '5', 10);

            const status = document.getElementById('vgStatus');
            const progress = document.getElementById('vgProgress');
            progress?.classList.add('active');
            btn.disabled = true;
            if (status) status.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Generating video with ComfyUI…</div>';

            try {
                const result = await generateVideo(prompt, imageDataUrl, duration, (p) => {
                    if (status && p.stage === 'polling') {
                        status.innerHTML = `<div class="status-msg info"><span class="spinner"></span> ComfyUI video… (${p.attempt || 0})</div>`;
                    }
                });

                // Show in results
                const grid = document.getElementById('vgResultsGrid');
                const section = document.getElementById('vgResultsSection');
                if (grid && section) {
                    grid.innerHTML = '';
                    section.classList.remove('hidden');
                    const card = document.createElement('div');
                    card.className = 'result-card selected';
                    const videoWrap = document.createElement('div');
                    videoWrap.className = 'video-preview';
                    const videoEl = document.createElement('video');
                    videoEl.loop = true;
                    videoEl.muted = true;
                    videoEl.playsInline = true;
                    videoEl.src = result.url;
                    videoEl.load();
                    videoWrap.appendChild(videoEl);
                    card.appendChild(videoWrap);
                    grid.appendChild(card);

                    window.ASAdventurer.handoff.videoBlob = result.blob;
                    window.ASAdventurer.handoff.videoUrl = result.url;
                }

                if (status) status.innerHTML = '<div class="status-msg success">✅ ComfyUI video ready!</div>';
                window.notificationSound?.play();
            } catch (err) {
                console.error('[ComfyUI video]', err);
                if (status) status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
                showToast(err.message, 'error');
            } finally {
                progress?.classList.remove('active');
                btn.disabled = false;
            }
        }, true);
    }

    function init() {
        injectProviderButton('sgProvider', 'comfyui', '🖥️ ComfyUI', 'Use local ComfyUI (Animagine XL 4.0)');
        injectProviderButton('vgProvider', 'comfyui', '🖥️ ComfyUI', 'Use local ComfyUI for video');
        injectSettingsPanel();
        patchSpriteGenerate();
        patchVideoGenerate();

        // Restore provider selection if saved as comfyui
        const sgProv = localStorage.getItem('sg_ai_provider');
        if (sgProv === 'comfyui') {
            const el = document.getElementById('sgProvider');
            el?.querySelectorAll('.mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.provider === 'comfyui')
            );
        }
        const vgProv = localStorage.getItem('vg_ai_provider');
        if (vgProv === 'comfyui') {
            const el = document.getElementById('vgProvider');
            el?.querySelectorAll('.mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.provider === 'comfyui')
            );
        }

        // Persist when clicking injected buttons
        document.getElementById('sgProvider')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-provider]');
            if (btn?.dataset.provider) localStorage.setItem('sg_ai_provider', btn.dataset.provider);
        });
        document.getElementById('vgProvider')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-provider]');
            if (btn?.dataset.provider) localStorage.setItem('vg_ai_provider', btn.dataset.provider);
        });

        console.log('[ComfyUI] Bridge ready — provider buttons + Settings injected');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
    } else {
        setTimeout(init, 100);
    }

    window.ComfyBridge = { generateSprite, generateVideo, ensureReachable };
})();
