/**
 * ⚔️ ComfyUI bridge — UI injection + generation helpers
 *
 * Settings panel always has THREE separate fields:
 *   1. ComfyUI URL
 *   2. Sprite model (checkpoint)
 *   3. Video model (LTX)
 *
 * Save shows the same status-msg + toast pattern as OpenAI / Gemini.
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

    /** Full panel HTML — separate sprite vs video model fields */
    function buildPanelHTML() {
        const c = window.ComfyUIClient;
        const url = c ? c.getBaseUrl() : 'http://127.0.0.1:8188';
        const sprite = c ? c.getCheckpoint() : 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
        const video = c ? c.getVideoModel() : 'LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors';

        return `
            <div class="panel-title"><span class="title-icon">🖥️</span> ComfyUI (Local)</div>
            <div class="panel-subtitle">
                Point AS Adventurer at your local ComfyUI instance.
                Sprite and video models are configured <strong>separately</strong> below.
            </div>

            <div class="form-row">
                <label for="settingsComfyUrl">ComfyUI URL</label>
                <input type="text" id="settingsComfyUrl" placeholder="http://127.0.0.1:8188" value="${escapeAttr(url)}">
            </div>

            <hr class="gold-divider">

            <div class="form-row">
                <label for="settingsComfyCkpt">🎨 Sprite model <span class="text-dim">(checkpoint)</span></label>
                <input type="text" id="settingsComfyCkpt"
                    placeholder="ponyDiffusionV6XL_v6StartWithThisOne.safetensors"
                    value="${escapeAttr(sprite)}">
                <div class="text-dim mt-1" style="font-size:0.7rem">
                    Used for <strong>Sprite Prep → AI Generate</strong>.
                    Exact filename in <code>ComfyUI/models/checkpoints/</code>
                    (default: Pony Diffusion V6 XL @ 1216×832).
                </div>
            </div>

            <div class="form-row">
                <label for="settingsComfyVideoModel">🎬 Video model <span class="text-dim">(LTX / AnimateDiff / …)</span></label>
                <input type="text" id="settingsComfyVideoModel"
                    placeholder="LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors"
                    value="${escapeAttr(video)}">
                <div class="text-dim mt-1" style="font-size:0.7rem">
                    Used for <strong>Generate Video</strong> only.
                    Exact filename as required by your ComfyUI-LTXVideo pack
                    (default: LTX-Video-ICLoRA-pose-13b-0.9.7).
                    Needs <strong>ComfyUI-LTXVideo</strong> + <strong>Video Helper Suite</strong>.
                </div>
            </div>

            <div class="api-key-row" style="margin-top:0.75rem">
                <button type="button" class="btn btn-sm btn-secondary" id="settingsComfySave">Save</button>
                <button type="button" class="btn btn-sm btn-accent" id="settingsComfyTest">Test Connection</button>
            </div>

            <!-- Same status slot pattern as OpenAI / Gemini -->
            <div id="settingsComfyStatus"></div>

            <!-- Persistent "currently saved" summary (updated on Save) -->
            <div id="settingsComfySavedSummary" class="text-mono text-dim mt-1" style="font-size:0.7rem"></div>
        `;
    }

    function escapeAttr(s) {
        return String(s || '')
            .replace(/&/g, '&')
            .replace(/"/g, '"')
            .replace(/</g, '<')
            .replace(/>/g, '>');
    }

    function renderSavedSummary() {
        const el = document.getElementById('settingsComfySavedSummary');
        const c = window.ComfyUIClient;
        if (!el || !c) return;
        el.innerHTML =
            'Saved · URL: <span class="text-gold">' + escapeAttr(c.getBaseUrl()) + '</span><br>' +
            'Sprite: <span class="text-gold">' + escapeAttr(c.getCheckpoint()) + '</span><br>' +
            'Video: <span class="text-gold">' + escapeAttr(c.getVideoModel()) + '</span>';
    }

    /**
     * Always rebuild the ComfyUI settings panel so sprite/video fields are present
     * and labeled, regardless of whatever was in the static index.html.
     */
    function ensureSettingsPanel() {
        const section = document.querySelector('#tab-settings .settings-section');
        if (!section) return;

        let panel = document.getElementById('settingsComfyPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'glass-panel';
            panel.id = 'settingsComfyPanel';

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

        // Always refresh inner HTML so separate model fields exist
        panel.innerHTML = buildPanelHTML();
        renderSavedSummary();
    }

    function setStatus(html) {
        const el = document.getElementById('settingsComfyStatus');
        if (el) el.innerHTML = html || '';
    }

    function wireSettingsHandlers() {
        const c = window.ComfyUIClient;
        if (!c) {
            console.warn('[ComfyUI] Client missing — cannot wire Settings');
            return;
        }

        const urlInput = document.getElementById('settingsComfyUrl');
        const spriteInput = document.getElementById('settingsComfyCkpt');
        const videoInput = document.getElementById('settingsComfyVideoModel');
        const saveBtn = document.getElementById('settingsComfySave');
        const testBtn = document.getElementById('settingsComfyTest');

        if (!urlInput || !spriteInput || !videoInput || !saveBtn || !testBtn) {
            console.warn('[ComfyUI] Settings controls missing after panel build', {
                urlInput: !!urlInput,
                spriteInput: !!spriteInput,
                videoInput: !!videoInput,
                saveBtn: !!saveBtn,
                testBtn: !!testBtn
            });
            return;
        }

        // Idempotent: re-bind after panel rebuild by cloning buttons
        if (saveBtn.dataset.comfyWired === '1') return;
        saveBtn.dataset.comfyWired = '1';
        testBtn.dataset.comfyWired = '1';

        // Values already filled by buildPanelHTML; re-sync from storage
        urlInput.value = c.getBaseUrl();
        spriteInput.value = c.getCheckpoint();
        videoInput.value = c.getVideoModel();

        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const url = (urlInput.value || '').trim() || c.DEFAULT_URL;
            const sprite = (spriteInput.value || '').trim() || c.DEFAULT_CKPT;
            const video = (videoInput.value || '').trim() || c.DEFAULT_VIDEO_MODEL;

            c.setBaseUrl(url);
            c.setCheckpoint(sprite);
            c.setVideoModel(video);

            // Reflect normalized values back into inputs
            urlInput.value = c.getBaseUrl();
            spriteInput.value = c.getCheckpoint();
            videoInput.value = c.getVideoModel();

            // Match OpenAI/Gemini: toast + green status-msg under the buttons
            setStatus('<div class="status-msg success">✅ ComfyUI settings saved</div>');
            renderSavedSummary();

            if (typeof showToast === 'function') {
                showToast('ComfyUI settings saved', 'success');
            }
        });

        testBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Save current form values before testing (same as key test flows)
            const url = (urlInput.value || '').trim() || c.DEFAULT_URL;
            const sprite = (spriteInput.value || '').trim() || c.DEFAULT_CKPT;
            const video = (videoInput.value || '').trim() || c.DEFAULT_VIDEO_MODEL;
            c.setBaseUrl(url);
            c.setCheckpoint(sprite);
            c.setVideoModel(video);
            urlInput.value = c.getBaseUrl();
            spriteInput.value = c.getCheckpoint();
            videoInput.value = c.getVideoModel();
            renderSavedSummary();

            setStatus(
                '<div class="status-msg info"><span class="spinner"></span> Testing connection to ' +
                escapeAttr(c.getBaseUrl()) + '…</div>'
            );

            try {
                await c.testConnection();
                setStatus('<div class="status-msg success">✅ Connection successful!</div>');
                if (typeof showToast === 'function') showToast('ComfyUI connection OK', 'success');
            } catch (err) {
                setStatus('<div class="status-msg error">❌ ' + escapeAttr(err.message) + '</div>');
                if (typeof showToast === 'function') showToast(err.message, 'error');
            }
        });

        console.log('[ComfyUI] Settings handlers wired (sprite + video models separate)');
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

            const ckptName = window.ComfyUIClient?.getCheckpoint?.() || 'Pony V6 XL';
            if (status) {
                status.innerHTML =
                    `<div class="status-msg info"><span class="spinner"></span> Generating with ComfyUI (${escapeAttr(ckptName)} @ 1216×832)…</div>`;
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
                            a.download = `${name || 'sprite'}_comfy_${i + 1}.png`;
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
                        `<div class="status-msg success">✅ Generated ${results.length} sprite(s) with ComfyUI!</div>`;
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

            const videoModel = window.ComfyUIClient?.getVideoModel?.() || 'LTX';
            if (status) {
                status.innerHTML =
                    `<div class="status-msg info"><span class="spinner"></span> Generating video with ComfyUI (${escapeAttr(videoModel)})…</div>`;
            }

            try {
                const result = await generateVideo(prompt, imageDataUrl, duration, (p) => {
                    if (status && p.stage === 'polling') {
                        status.innerHTML =
                            `<div class="status-msg info"><span class="spinner"></span> ComfyUI video… (${p.attempt || 0})</div>`;
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

                if (status) status.innerHTML = '<div class="status-msg success">✅ ComfyUI video ready!</div>';
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
            'Use local ComfyUI (sprite model from Settings)'
        );
        injectProviderButton(
            'vgProvider',
            'comfyui',
            '🖥️ ComfyUI',
            'Use local ComfyUI (video model from Settings)'
        );

        // Rebuild panel with separate sprite/video fields, then wire Save/Test
        ensureSettingsPanel();
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

        console.log('[ComfyUI] Bridge ready — separate sprite/video model settings + save status');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
    } else {
        setTimeout(init, 100);
    }

    window.ComfyBridge = { generateSprite, generateVideo, ensureReachable };
})();
