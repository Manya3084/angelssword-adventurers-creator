/**
 * ⚔️ ComfyUI bridge — UI injection + generation helpers
 * Adds ComfyUI provider buttons, Settings panel wiring, and generation entry points.
 *
 * IMPORTANT: Settings panel may already exist in index.html. We always wire
 * handlers even when injection is skipped (previous bug: early return left
 * Save/Test dead).
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
        const c = ensureClient();
        return c.generateSprite({
            prompt: promptText,
            width: c.DEFAULT_SPRITE_W || 1216,
            height: c.DEFAULT_SPRITE_H || 832,
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

    // ---------- UI ----------

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

    function updateExistingSettingsCopy() {
        const panel = document.getElementById('settingsComfyPanel');
        if (!panel) return;

        const sub = panel.querySelector('.panel-subtitle');
        if (sub) {
            sub.innerHTML =
                'Local generation with <strong>Pony Diffusion V6 XL</strong> (sprites @ 1216×832) ' +
                'and <strong>LTX-Video-ICLoRA-pose-13b</strong> (video). ComfyUI must be running.';
        }

        const ckptInput = document.getElementById('settingsComfyCkpt');
        if (ckptInput) {
            ckptInput.placeholder = 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
            // Only replace outdated default if user never customized
            if (
                !ckptInput.value ||
                ckptInput.value === 'animagine-xl-4.0.safetensors'
            ) {
                const stored = window.ComfyUIClient?.getCheckpoint?.();
                ckptInput.value = stored || 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
            }
        }

        // Ensure video model field exists
        if (!document.getElementById('settingsComfyVideoModel')) {
            const ckptRow = ckptInput?.closest('.form-row');
            if (ckptRow && ckptRow.parentNode) {
                const videoRow = document.createElement('div');
                videoRow.className = 'form-row';
                videoRow.innerHTML = `
                    <label for="settingsComfyVideoModel">Video model filename (LTX)</label>
                    <input type="text" id="settingsComfyVideoModel"
                        placeholder="LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors">
                    <div class="text-dim mt-1" style="font-size:0.7rem">
                        Exact filename under ComfyUI models (checkpoints or as required by ComfyUI-LTXVideo).
                        Needs <strong>ComfyUI-LTXVideo</strong> + <strong>Video Helper Suite</strong> nodes.
                    </div>`;
                ckptRow.parentNode.insertBefore(videoRow, ckptRow.nextSibling);
            }
        }

        const videoInput = document.getElementById('settingsComfyVideoModel');
        if (videoInput && !videoInput.value) {
            videoInput.value =
                window.ComfyUIClient?.getVideoModel?.() ||
                'LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors';
        }
    }

    function injectSettingsPanel() {
        const section = document.querySelector('#tab-settings .settings-section');
        if (!section) return;

        // If static panel already in index.html, just refresh copy — do NOT return before wiring
        if (document.getElementById('settingsComfyUrl')) {
            updateExistingSettingsCopy();
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'glass-panel';
        panel.id = 'settingsComfyPanel';
        panel.innerHTML = `
            <div class="panel-title"><span class="title-icon">🖥️</span> ComfyUI (Local)</div>
            <div class="panel-subtitle">
                Local generation with <strong>Pony Diffusion V6 XL</strong> (sprites @ 1216×832)
                and <strong>LTX-Video-ICLoRA-pose-13b</strong> (video). ComfyUI must be running.
                Default: <code>http://127.0.0.1:8188</code>
            </div>
            <div class="form-row">
                <label for="settingsComfyUrl">ComfyUI URL</label>
                <input type="text" id="settingsComfyUrl" placeholder="http://127.0.0.1:8188">
            </div>
            <div class="form-row">
                <label for="settingsComfyCkpt">Sprite checkpoint filename</label>
                <input type="text" id="settingsComfyCkpt" placeholder="ponyDiffusionV6XL_v6StartWithThisOne.safetensors">
                <div class="text-dim mt-1" style="font-size:0.7rem">Must match exact filename in ComfyUI/models/checkpoints/</div>
            </div>
            <div class="form-row">
                <label for="settingsComfyVideoModel">Video model filename (LTX)</label>
                <input type="text" id="settingsComfyVideoModel" placeholder="LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors">
                <div class="text-dim mt-1" style="font-size:0.7rem">
                    Requires ComfyUI-LTXVideo + Video Helper Suite custom nodes.
                </div>
            </div>
            <div class="api-key-row" style="margin-top:0.5rem">
                <button class="btn btn-sm btn-secondary" id="settingsComfySave">Save</button>
                <button class="btn btn-sm btn-accent" id="settingsComfyTest">Test Connection</button>
            </div>
            <div id="settingsComfyStatus"></div>
        `;

        const notif = Array.from(section.querySelectorAll('.glass-panel')).find(p =>
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
    }

    function showStatus(el, type, text) {
        if (!el) return;
        const cls = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
        el.innerHTML = `<div class="status-msg ${cls}">${text}</div>`;
    }

    function wireSettingsHandlers() {
        const c = window.ComfyUIClient;
        if (!c) {
            console.warn('[ComfyUI] Client missing — cannot wire Settings');
            return;
        }

        const urlInput = document.getElementById('settingsComfyUrl');
        const ckptInput = document.getElementById('settingsComfyCkpt');
        const videoInput = document.getElementById('settingsComfyVideoModel');
        const saveBtn = document.getElementById('settingsComfySave');
        const testBtn = document.getElementById('settingsComfyTest');
        const statusEl = document.getElementById('settingsComfyStatus');

        if (!urlInput || !saveBtn || !testBtn) {
            console.warn('[ComfyUI] Settings controls not found in DOM');
            return;
        }

        // Prevent double-binding
        if (saveBtn.dataset.comfyWired === '1') return;
        saveBtn.dataset.comfyWired = '1';
        testBtn.dataset.comfyWired = '1';

        // Populate from localStorage
        urlInput.value = c.getBaseUrl();
        if (ckptInput) ckptInput.value = c.getCheckpoint();
        if (videoInput) videoInput.value = c.getVideoModel();

        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = (urlInput.value || '').trim() || c.DEFAULT_URL;
            c.setBaseUrl(url);
            urlInput.value = c.getBaseUrl();

            if (ckptInput) {
                const ck = (ckptInput.value || '').trim() || c.DEFAULT_CKPT;
                c.setCheckpoint(ck);
                ckptInput.value = c.getCheckpoint();
            }
            if (videoInput && c.setVideoModel) {
                const vm = (videoInput.value || '').trim() || c.DEFAULT_VIDEO_MODEL;
                c.setVideoModel(vm);
                videoInput.value = c.getVideoModel();
            }

            showStatus(statusEl, 'success', '✅ Settings saved');
            if (typeof showToast === 'function') showToast('ComfyUI settings saved', 'success');
            else console.log('[ComfyUI] settings saved');
        });

        testBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Persist current form values before testing
            const url = (urlInput.value || '').trim() || c.DEFAULT_URL;
            c.setBaseUrl(url);
            if (ckptInput) c.setCheckpoint((ckptInput.value || '').trim() || c.DEFAULT_CKPT);
            if (videoInput && c.setVideoModel) {
                c.setVideoModel((videoInput.value || '').trim() || c.DEFAULT_VIDEO_MODEL);
            }

            showStatus(
                statusEl,
                'info',
                '<span class="spinner"></span> Testing ComfyUI at ' + c.getBaseUrl() + '…'
            );

            try {
                const stats = await c.testConnection();
                const devices = stats?.devices || stats?.system?.devices;
                const extra = devices ? ` · devices: ${JSON.stringify(devices).slice(0, 80)}` : '';
                showStatus(statusEl, 'success', '✅ ComfyUI connected' + extra);
                if (typeof showToast === 'function') showToast('ComfyUI connection OK', 'success');
            } catch (err) {
                showStatus(statusEl, 'error', '❌ ' + err.message);
                if (typeof showToast === 'function') showToast(err.message, 'error');
            }
        });

        console.log('[ComfyUI] Settings handlers wired');
    }

    function patchSpriteGenerate() {
        const btn = document.getElementById('sgGenerateBtn');
        if (!btn || btn.dataset.comfyPatched) return;
        btn.dataset.comfyPatched = '1';

        btn.addEventListener('click', async (e) => {
            const container = document.getElementById('sgProvider');
            const active = container?.querySelector('.mode-btn.active');
            const provider = active?.dataset.provider;
            if (provider !== 'comfyui') return;

            e.stopImmediatePropagation();
            e.preventDefault();

            const name = document.getElementById('sgCharName')?.value?.trim();
            if (!name) {
                if (typeof showToast === 'function') showToast('Please enter a character name', 'warning');
                return;
            }

            const desc = document.getElementById('sgCharDesc')?.value?.trim() || '';
            const action = document.getElementById('sgCharAction')?.value?.trim() || 'standing in a neutral idle position';
            const keySwatch = document.querySelector('#sgColorSwatches .color-swatch.selected');
            const keyHex = keySwatch?.dataset.color || '#00FF00';
            const keyName = (window.colorName && window.colorName(keyHex)) || 'green';

            const raceActive = document.querySelector('#sgRaceMode .mode-btn.active');
            const race = raceActive?.dataset.mode || 'normal';
            let raceDirective = '';
            if (race === 'kanolith') {
                raceDirective = 'kemonomimi, animal ears, tail, human face, ';
            } else if (race === 'zoalith') {
                raceDirective = 'anthropomorphic, furry, snout, ';
            }

            // Pony Diffusion V6 XL prompt style
            const promptText = [
                'score_9, score_8_up, score_7_up, source_anime,',
                `1girl, ${name}${desc ? ', ' + desc : ''}, ${action},`,
                raceDirective,
                'upper body, centered, looking at viewer,',
                `solid ${keyName} background, simple background, chroma key background,`,
                'anime style, clean linework, cel shading, high quality'
            ].join(' ');

            const genCountEl = document.getElementById('sgGenCount');
            const countBtn = genCountEl?.querySelector('.gen-count-btn.active');
            const genCount = countBtn ? parseInt(countBtn.dataset.count, 10) : 1;

            const status = document.getElementById('sgStatus');
            const progress = document.getElementById('sgProgress');
            progress?.classList.add('active');
            btn.disabled = true;
            if (status) {
                status.innerHTML =
                    '<div class="status-msg info"><span class="spinner"></span> Generating with ComfyUI (Pony V6 XL 1216×832)…</div>';
            }

            try {
                const results = [];
                for (let i = 0; i < genCount; i++) {
                    const dataUrl = await generateSprite(promptText, (p) => {
                        if (status && p.stage === 'polling') {
                            status.innerHTML =
                                `<div class="status-msg info"><span class="spinner"></span> ComfyUI working… (${p.attempt || 0})</div>`;
                        }
                    });
                    results.push(dataUrl);
                }

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

                    window.__comfySpriteResults = results;
                    window.__comfySelectedSprite = results[0];

                    const canvas = document.getElementById('sgCanvas');
                    if (canvas && results[0]) {
                        const ctx = canvas.getContext('2d');
                        const img = new Image();
                        img.onload = () => {
                            ctx.clearRect(0, 0, 1280, 720);
                            const scale = Math.min(1280 / img.width, 720 / img.height);
                            const w = img.width * scale;
                            const h = img.height * scale;
                            ctx.drawImage(img, (1280 - w) / 2, (720 - h) / 2, w, h);
                        };
                        img.src = results[0];
                    }

                    grid.onclick = (ev) => {
                        const dl = ev.target.closest('[data-comfy-dl]');
                        const sel = ev.target.closest('[data-comfy-sel]');
                        if (dl) {
                            const i = parseInt(dl.dataset.comfyDl, 10);
                            const a = document.createElement('a');
                            a.href = results[i];
                            a.download = `${name || 'sprite'}_pony_${i + 1}.png`;
                            a.click();
                        }
                        if (sel) {
                            const i = parseInt(sel.dataset.comfySel, 10);
                            window.__comfySelectedSprite = results[i];
                            grid.querySelectorAll('.result-card').forEach((card, j) =>
                                card.classList.toggle('selected', j === i)
                            );
                        }
                    };

                    const handoff = document.getElementById('sgHandoffBtn');
                    if (handoff && !handoff.dataset.comfyHandoff) {
                        handoff.dataset.comfyHandoff = '1';
                        handoff.addEventListener('click', () => {
                            const src = window.__comfySelectedSprite;
                            if (!src || !window.ASAdventurer) return;
                            window.ASAdventurer.handoff.spriteBase64 = src;
                            try {
                                if (typeof base64ToBlob === 'function') {
                                    window.ASAdventurer.handoff.spriteBlob = base64ToBlob(src);
                                }
                            } catch (_) {}
                        }, true);
                    }
                }

                if (status) {
                    status.innerHTML =
                        `<div class="status-msg success">✅ Generated ${results.length} sprite(s) with Pony V6 XL!</div>`;
                }
                window.notificationSound?.play();
            } catch (err) {
                console.error('[ComfyUI sprite]', err);
                if (status) status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
                if (typeof showToast === 'function') showToast(err.message, 'error');
            } finally {
                progress?.classList.remove('active');
                btn.disabled = false;
            }
        }, true);
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

            let imageDataUrl =
                window.ASAdventurer?.handoff?.spriteBase64 ||
                document.getElementById('vgRefImage')?.src ||
                null;

            if (!imageDataUrl || imageDataUrl === window.location.href) {
                if (typeof showToast === 'function') {
                    showToast('Upload a reference image or send one from Sprite Prep first', 'warning');
                }
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
            if (status) {
                status.innerHTML =
                    '<div class="status-msg info"><span class="spinner"></span> Generating video with LTX-Video ICLoRA…</div>';
            }

            try {
                const result = await generateVideo(prompt, imageDataUrl, duration, (p) => {
                    if (status && p.stage === 'polling') {
                        status.innerHTML =
                            `<div class="status-msg info"><span class="spinner"></span> LTX video… (${p.attempt || 0})</div>`;
                    }
                    if (status && p.stage === 'upload') {
                        status.innerHTML =
                            '<div class="status-msg info"><span class="spinner"></span> Uploading reference to ComfyUI…</div>';
                    }
                });

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
                    videoEl.controls = true;
                    videoEl.src = result.url;
                    videoEl.load();
                    videoWrap.appendChild(videoEl);
                    card.appendChild(videoWrap);
                    grid.appendChild(card);

                    if (window.ASAdventurer) {
                        window.ASAdventurer.handoff.videoBlob = result.blob;
                        window.ASAdventurer.handoff.videoUrl = result.url;
                    }
                }

                if (status) status.innerHTML = '<div class="status-msg success">✅ LTX video ready!</div>';
                window.notificationSound?.play();
            } catch (err) {
                console.error('[ComfyUI video]', err);
                if (status) status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
                if (typeof showToast === 'function') showToast(err.message, 'error');
            } finally {
                progress?.classList.remove('active');
                btn.disabled = false;
            }
        }, true);
    }

    function init() {
        injectProviderButton(
            'sgProvider',
            'comfyui',
            '🖥️ ComfyUI',
            'Use local ComfyUI (Pony Diffusion V6 XL)'
        );
        injectProviderButton(
            'vgProvider',
            'comfyui',
            '🖥️ ComfyUI',
            'Use local ComfyUI (LTX-Video ICLoRA pose)'
        );

        // 1) ensure panel exists / labels updated
        injectSettingsPanel();
        updateExistingSettingsCopy();
        // 2) ALWAYS wire handlers (fixes dead Save/Test)
        wireSettingsHandlers();

        patchSpriteGenerate();
        patchVideoGenerate();

        const sgProv = localStorage.getItem('sg_ai_provider');
        if (sgProv === 'comfyui') {
            document.getElementById('sgProvider')?.querySelectorAll('.mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.provider === 'comfyui')
            );
        }
        const vgProv = localStorage.getItem('vg_ai_provider');
        if (vgProv === 'comfyui') {
            document.getElementById('vgProvider')?.querySelectorAll('.mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.provider === 'comfyui')
            );
        }

        document.getElementById('sgProvider')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-provider]');
            if (b?.dataset.provider) localStorage.setItem('sg_ai_provider', b.dataset.provider);
        });
        document.getElementById('vgProvider')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-provider]');
            if (b?.dataset.provider) localStorage.setItem('vg_ai_provider', b.dataset.provider);
        });

        console.log('[ComfyUI] Bridge ready — Settings wired, Pony + LTX defaults');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
    } else {
        setTimeout(init, 100);
    }

    window.ComfyBridge = { generateSprite, generateVideo, ensureReachable };
})();
