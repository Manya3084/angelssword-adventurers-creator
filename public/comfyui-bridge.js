/**
 * ComfyUI bridge — UI injection + generation helpers
 *
 * Settings:
 *   - ComfyUI URL
 *   - Sprite checkpoint (Pony)
 *   - Video model (LTX)
 *   - IP-Adapter model + CLIP Vision + weight (character reference)
 *
 * When Character Reference is uploaded in Sprite Prep, generation uses
 * IP-Adapter for identity hold. Without a ref → plain T2I.
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

    /** Read character reference data URL from Sprite Prep UI (if uploaded). */
    function getCharacterReferenceDataUrl() {
        const img = document.querySelector('#sgCharRefPreview img');
        const src = img && img.src;
        if (src && src.startsWith('data:')) return src;
        // Fallback if sprite-prep ever exposes it globally
        if (window.__sgCharRefBase64 && String(window.__sgCharRefBase64).startsWith('data:')) {
            return window.__sgCharRefBase64;
        }
        return null;
    }

    async function generateSprite(promptText, onProgress, referenceImageDataUrl) {
        await ensureReachable();
        const c = ensureClient();
        return c.generateSprite({
            prompt: promptText,
            width: c.DEFAULT_SPRITE_W || 1216,
            height: c.DEFAULT_SPRITE_H || 832,
            referenceImageDataUrl: referenceImageDataUrl || null,
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

    function injectProviderButton(containerId, provider, label, title) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (el.querySelector('[data-provider="' + provider + '"]')) return;

        const btn = document.createElement('button');
        btn.className = 'mode-btn';
        btn.dataset.provider = provider;
        btn.title = title;
        btn.textContent = label;
        el.appendChild(btn);
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&')
            .replace(/"/g, '"')
            .replace(/</g, '<')
            .replace(/>/g, '>');
    }

    function buildPanelHTML() {
        const c = window.ComfyUIClient;
        const url = c ? c.getBaseUrl() : 'http://127.0.0.1:8188';
        const sprite = c ? c.getCheckpoint() : 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
        const video = c ? c.getVideoModel() : 'LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors';
        const ipa = c ? c.getIpAdapterModel() : 'ip-adapter-plus-face_sdxl_vit-h.safetensors';
        const clipV = c ? c.getClipVisionModel() : 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';
        const ipW = c ? c.getIpAdapterWeight() : 0.75;

        return '' +
            '<div class="panel-title"><span class="title-icon">🖥️</span> ComfyUI (Local)</div>' +
            '<div class="panel-subtitle">' +
            'Sprite and video models are separate. Character Reference uses <strong>IP-Adapter</strong> when uploaded.' +
            '</div>' +

            '<div class="form-row">' +
            '<label for="settingsComfyUrl">ComfyUI URL</label>' +
            '<input type="text" id="settingsComfyUrl" placeholder="http://127.0.0.1:8188" value="' + escapeAttr(url) + '">' +
            '</div>' +

            '<hr class="gold-divider">' +

            '<div class="form-row">' +
            '<label for="settingsComfyCkpt">🎨 Sprite model <span class="text-dim">(checkpoint)</span></label>' +
            '<input type="text" id="settingsComfyCkpt" placeholder="ponyDiffusionV6XL_v6StartWithThisOne.safetensors" value="' + escapeAttr(sprite) + '">' +
            '<div class="text-dim mt-1" style="font-size:0.7rem">' +
            'Used for Sprite Prep → AI Generate. File in <code>ComfyUI/models/checkpoints/</code> (Pony V6 XL @ 1216×832).' +
            '</div></div>' +

            '<div class="form-row">' +
            '<label for="settingsComfyVideoModel">🎬 Video model</label>' +
            '<input type="text" id="settingsComfyVideoModel" placeholder="LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors" value="' + escapeAttr(video) + '">' +
            '<div class="text-dim mt-1" style="font-size:0.7rem">' +
            'Used for Generate Video only. Needs ComfyUI-LTXVideo + Video Helper Suite.' +
            '</div></div>' +

            '<hr class="gold-divider">' +

            '<div class="panel-title" style="font-size:0.9rem"><span class="title-icon">👤</span> IP-Adapter (Character Reference)</div>' +
            '<div class="panel-subtitle" style="margin-top:0">' +
            'When a Character Reference is uploaded in Sprite Prep, these weights lock identity. ' +
            'Requires <strong>ComfyUI_IPAdapter_plus</strong>.' +
            '</div>' +

            '<div class="form-row">' +
            '<label for="settingsComfyIpAdapter">IP-Adapter model</label>' +
            '<input type="text" id="settingsComfyIpAdapter" placeholder="ip-adapter-plus-face_sdxl_vit-h.safetensors" value="' + escapeAttr(ipa) + '">' +
            '<div class="text-dim mt-1" style="font-size:0.7rem">' +
            'Usually in <code>ComfyUI/models/ipadapter/</code>. Face Plus is best for character likeness.' +
            '</div></div>' +

            '<div class="form-row">' +
            '<label for="settingsComfyClipVision">CLIP Vision model</label>' +
            '<input type="text" id="settingsComfyClipVision" placeholder="CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors" value="' + escapeAttr(clipV) + '">' +
            '<div class="text-dim mt-1" style="font-size:0.7rem">' +
            'Usually in <code>ComfyUI/models/clip_vision/</code>.' +
            '</div></div>' +

            '<div class="form-row">' +
            '<label for="settingsComfyIpWeight">IP-Adapter weight <span class="text-dim">(0–2, default 0.75)</span></label>' +
            '<div class="range-row">' +
            '<input type="range" id="settingsComfyIpWeight" min="0" max="1.5" step="0.05" value="' + escapeAttr(ipW) + '">' +
            '<span class="range-value" id="settingsComfyIpWeightVal">' + escapeAttr(ipW) + '</span>' +
            '</div>' +
            '<div class="text-dim mt-1" style="font-size:0.7rem">' +
            'Higher = stronger likeness to Character Reference. ~0.6–0.85 is a good range.' +
            '</div></div>' +

            '<div class="api-key-row" style="margin-top:0.75rem">' +
            '<button type="button" class="btn btn-sm btn-secondary" id="settingsComfySave">Save</button>' +
            '<button type="button" class="btn btn-sm btn-accent" id="settingsComfyTest">Test Connection</button>' +
            '</div>' +

            '<div id="settingsComfyStatus"></div>' +
            '<div id="settingsComfySavedSummary" class="text-mono text-dim mt-1" style="font-size:0.7rem"></div>';
    }

    function renderSavedSummary() {
        const el = document.getElementById('settingsComfySavedSummary');
        const c = window.ComfyUIClient;
        if (!el || !c) return;
        el.innerHTML =
            'Saved · URL: <span class="text-gold">' + escapeAttr(c.getBaseUrl()) + '</span><br>' +
            'Sprite: <span class="text-gold">' + escapeAttr(c.getCheckpoint()) + '</span><br>' +
            'Video: <span class="text-gold">' + escapeAttr(c.getVideoModel()) + '</span><br>' +
            'IP-Adapter: <span class="text-gold">' + escapeAttr(c.getIpAdapterModel()) + '</span> @ ' +
            '<span class="text-gold">' + escapeAttr(c.getIpAdapterWeight()) + '</span><br>' +
            'CLIP Vision: <span class="text-gold">' + escapeAttr(c.getClipVisionModel()) + '</span>';
    }

    function ensureSettingsPanel() {
        const section = document.querySelector('#tab-settings .settings-section');
        if (!section) return;

        let panel = document.getElementById('settingsComfyPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'glass-panel';
            panel.id = 'settingsComfyPanel';

            const notif = Array.from(section.querySelectorAll('.glass-panel')).find(function (p) {
                return p.textContent.indexOf('Notifications') !== -1;
            });
            if (notif) section.insertBefore(panel, notif);
            else {
                var about = Array.from(section.querySelectorAll('.glass-panel')).find(function (p) {
                    return p.querySelector('.about-section');
                });
                if (about) section.insertBefore(panel, about);
                else section.appendChild(panel);
            }
        }

        panel.innerHTML = buildPanelHTML();
        renderSavedSummary();
    }

    function setStatus(html) {
        var el = document.getElementById('settingsComfyStatus');
        if (el) el.innerHTML = html || '';
    }

    function wireSettingsHandlers() {
        var c = window.ComfyUIClient;
        if (!c) {
            console.warn('[ComfyUI] Client missing — cannot wire Settings');
            return;
        }

        var urlInput = document.getElementById('settingsComfyUrl');
        var spriteInput = document.getElementById('settingsComfyCkpt');
        var videoInput = document.getElementById('settingsComfyVideoModel');
        var ipaInput = document.getElementById('settingsComfyIpAdapter');
        var clipInput = document.getElementById('settingsComfyClipVision');
        var weightInput = document.getElementById('settingsComfyIpWeight');
        var weightVal = document.getElementById('settingsComfyIpWeightVal');
        var saveBtn = document.getElementById('settingsComfySave');
        var testBtn = document.getElementById('settingsComfyTest');

        if (!urlInput || !spriteInput || !videoInput || !saveBtn || !testBtn) {
            console.warn('[ComfyUI] Settings controls missing after panel build');
            return;
        }

        if (saveBtn.dataset.comfyWired === '1') return;
        saveBtn.dataset.comfyWired = '1';
        testBtn.dataset.comfyWired = '1';

        urlInput.value = c.getBaseUrl();
        spriteInput.value = c.getCheckpoint();
        videoInput.value = c.getVideoModel();
        if (ipaInput) ipaInput.value = c.getIpAdapterModel();
        if (clipInput) clipInput.value = c.getClipVisionModel();
        if (weightInput) {
            weightInput.value = c.getIpAdapterWeight();
            if (weightVal) weightVal.textContent = String(c.getIpAdapterWeight());
            weightInput.addEventListener('input', function () {
                if (weightVal) weightVal.textContent = weightInput.value;
            });
        }

        function persistFromForm() {
            c.setBaseUrl((urlInput.value || '').trim() || c.DEFAULT_URL);
            c.setCheckpoint((spriteInput.value || '').trim() || c.DEFAULT_CKPT);
            c.setVideoModel((videoInput.value || '').trim() || c.DEFAULT_VIDEO_MODEL);
            if (ipaInput && c.setIpAdapterModel) {
                c.setIpAdapterModel((ipaInput.value || '').trim() || c.DEFAULT_IPADAPTER);
            }
            if (clipInput && c.setClipVisionModel) {
                c.setClipVisionModel((clipInput.value || '').trim() || c.DEFAULT_CLIPVISION);
            }
            if (weightInput && c.setIpAdapterWeight) {
                c.setIpAdapterWeight(weightInput.value);
            }

            urlInput.value = c.getBaseUrl();
            spriteInput.value = c.getCheckpoint();
            videoInput.value = c.getVideoModel();
            if (ipaInput) ipaInput.value = c.getIpAdapterModel();
            if (clipInput) clipInput.value = c.getClipVisionModel();
            if (weightInput) {
                weightInput.value = c.getIpAdapterWeight();
                if (weightVal) weightVal.textContent = String(c.getIpAdapterWeight());
            }
        }

        saveBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            persistFromForm();
            setStatus('<div class="status-msg success">✅ ComfyUI settings saved</div>');
            renderSavedSummary();
            if (typeof showToast === 'function') showToast('ComfyUI settings saved', 'success');
        });

        testBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            persistFromForm();
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

        console.log('[ComfyUI] Settings handlers wired (sprite / video / IP-Adapter)');
    }

    function patchSpriteGenerate() {
        var btn = document.getElementById('sgGenerateBtn');
        if (!btn || btn.dataset.comfyPatched) return;
        btn.dataset.comfyPatched = '1';

        btn.addEventListener('click', async function (e) {
            var container = document.getElementById('sgProvider');
            var active = container && container.querySelector('.mode-btn.active');
            var provider = active && active.dataset.provider;
            if (provider !== 'comfyui') return;

            e.stopImmediatePropagation();
            e.preventDefault();

            var name = (document.getElementById('sgCharName') && document.getElementById('sgCharName').value || '').trim();
            if (!name) {
                if (typeof showToast === 'function') showToast('Please enter a character name', 'warning');
                return;
            }

            var desc = (document.getElementById('sgCharDesc') && document.getElementById('sgCharDesc').value || '').trim();
            var actionEl = document.getElementById('sgCharAction');
            var action = (actionEl && actionEl.value || '').trim() || 'standing in a neutral idle position';
            var keySwatch = document.querySelector('#sgColorSwatches .color-swatch.selected');
            var keyHex = (keySwatch && keySwatch.dataset.color) || '#00FF00';
            var keyName = (window.colorName && window.colorName(keyHex)) || 'green';

            var raceActive = document.querySelector('#sgRaceMode .mode-btn.active');
            var race = (raceActive && raceActive.dataset.mode) || 'normal';
            var raceDirective = '';
            if (race === 'kanolith') raceDirective = 'kemonomimi, animal ears, tail, human face, ';
            else if (race === 'zoalith') raceDirective = 'anthropomorphic, furry, snout, ';

            var charRef = getCharacterReferenceDataUrl();

            var promptText = [
                'score_9, score_8_up, score_7_up, source_anime,',
                '1girl, ' + name + (desc ? ', ' + desc : '') + ', ' + action + ',',
                raceDirective,
                'upper body, centered, looking at viewer,',
                'solid ' + keyName + ' background, simple background, chroma key background,',
                'anime style, clean linework, cel shading, high quality'
            ].join(' ');

            if (charRef) {
                promptText += ', same character as reference, consistent face and outfit';
            }

            var genCountEl = document.getElementById('sgGenCount');
            var countBtn = genCountEl && genCountEl.querySelector('.gen-count-btn.active');
            var genCount = countBtn ? parseInt(countBtn.dataset.count, 10) : 1;

            var status = document.getElementById('sgStatus');
            var progress = document.getElementById('sgProgress');
            if (progress) progress.classList.add('active');
            btn.disabled = true;

            var ckptName = (window.ComfyUIClient && window.ComfyUIClient.getCheckpoint && window.ComfyUIClient.getCheckpoint()) || 'Pony V6 XL';
            var modeLabel = charRef ? 'IP-Adapter + ' + ckptName : ckptName;

            if (status) {
                status.innerHTML =
                    '<div class="status-msg info"><span class="spinner"></span> Generating with ComfyUI (' +
                    escapeAttr(modeLabel) + ' @ 1216×832)' +
                    (charRef ? ' · character reference locked' : '') +
                    '…</div>';
            }

            try {
                var results = [];
                for (var i = 0; i < genCount; i++) {
                    var dataUrl = await generateSprite(promptText, function (p) {
                        if (!status) return;
                        if (p.stage === 'upload') {
                            status.innerHTML =
                                '<div class="status-msg info"><span class="spinner"></span> Uploading character reference…</div>';
                        } else if (p.stage === 'ipadapter') {
                            status.innerHTML =
                                '<div class="status-msg info"><span class="spinner"></span> Running IP-Adapter workflow…</div>';
                        } else if (p.stage === 'polling') {
                            status.innerHTML =
                                '<div class="status-msg info"><span class="spinner"></span> ComfyUI working… (' +
                                (p.attempt || 0) + ')</div>';
                        }
                    }, charRef);
                    results.push(dataUrl);
                }

                var grid = document.getElementById('sgResultsGrid');
                var section = document.getElementById('sgResultsSection');
                if (grid && section) {
                    grid.innerHTML = '';
                    section.classList.remove('hidden');
                    results.forEach(function (du, idx) {
                        var card = document.createElement('div');
                        card.className = 'result-card' + (idx === 0 ? ' selected' : '');
                        card.innerHTML =
                            '<img src="' + du + '" alt="ComfyUI sprite ' + (idx + 1) + '">' +
                            '<div class="card-actions">' +
                            '<button class="btn btn-sm btn-secondary" data-comfy-dl="' + idx + '">💾 Save</button>' +
                            '<button class="btn btn-sm btn-primary" data-comfy-sel="' + idx + '">✓ Select</button>' +
                            '</div>';
                        grid.appendChild(card);
                    });

                    window.__comfySpriteResults = results;
                    window.__comfySelectedSprite = results[0];

                    var canvas = document.getElementById('sgCanvas');
                    if (canvas && results[0]) {
                        var ctx = canvas.getContext('2d');
                        var img = new Image();
                        img.onload = function () {
                            ctx.clearRect(0, 0, 1280, 720);
                            var scale = Math.min(1280 / img.width, 720 / img.height);
                            var w = img.width * scale;
                            var h = img.height * scale;
                            ctx.drawImage(img, (1280 - w) / 2, (720 - h) / 2, w, h);
                        };
                        img.src = results[0];
                    }

                    grid.onclick = function (ev) {
                        var dl = ev.target.closest('[data-comfy-dl]');
                        var sel = ev.target.closest('[data-comfy-sel]');
                        if (dl) {
                            var di = parseInt(dl.dataset.comfyDl, 10);
                            var a = document.createElement('a');
                            a.href = results[di];
                            a.download = (name || 'sprite') + '_comfy_' + (di + 1) + '.png';
                            a.click();
                        }
                        if (sel) {
                            var si = parseInt(sel.dataset.comfySel, 10);
                            window.__comfySelectedSprite = results[si];
                            grid.querySelectorAll('.result-card').forEach(function (card, j) {
                                card.classList.toggle('selected', j === si);
                            });
                        }
                    };

                    var handoff = document.getElementById('sgHandoffBtn');
                    if (handoff && !handoff.dataset.comfyHandoff) {
                        handoff.dataset.comfyHandoff = '1';
                        handoff.addEventListener('click', function () {
                            var src = window.__comfySelectedSprite;
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
                        '<div class="status-msg success">✅ Generated ' + results.length +
                        ' sprite(s) with ComfyUI' + (charRef ? ' + IP-Adapter' : '') + '!</div>';
                }
                if (window.notificationSound) window.notificationSound.play();
            } catch (err) {
                console.error('[ComfyUI sprite]', err);
                if (status) status.innerHTML = '<div class="status-msg error">❌ ' + escapeAttr(err.message) + '</div>';
                if (typeof showToast === 'function') showToast(err.message, 'error');
            } finally {
                if (progress) progress.classList.remove('active');
                btn.disabled = false;
            }
        }, true);
    }

    function patchVideoGenerate() {
        var btn = document.getElementById('vgGenerateBtn');
        if (!btn || btn.dataset.comfyPatched) return;
        btn.dataset.comfyPatched = '1';

        btn.addEventListener('click', async function (e) {
            var container = document.getElementById('vgProvider');
            var active = container && container.querySelector('.mode-btn.active');
            var provider = active && active.dataset.provider;
            if (provider !== 'comfyui') return;

            e.stopImmediatePropagation();
            e.preventDefault();

            var imageDataUrl =
                (window.ASAdventurer && window.ASAdventurer.handoff && window.ASAdventurer.handoff.spriteBase64) ||
                (document.getElementById('vgRefImage') && document.getElementById('vgRefImage').src) ||
                null;

            if (!imageDataUrl || imageDataUrl === window.location.href) {
                if (typeof showToast === 'function') {
                    showToast('Upload a reference image or send one from Sprite Prep first', 'warning');
                }
                return;
            }

            var promptEl = document.getElementById('vgPrompt');
            var prompt = (promptEl && promptEl.value || '').trim() ||
                'subtle idle breathing animation, locked camera, seamless loop';
            var duration = parseInt((document.getElementById('vgDuration') && document.getElementById('vgDuration').value) || '5', 10);

            var status = document.getElementById('vgStatus');
            var progress = document.getElementById('vgProgress');
            if (progress) progress.classList.add('active');
            btn.disabled = true;

            var videoModel = (window.ComfyUIClient && window.ComfyUIClient.getVideoModel && window.ComfyUIClient.getVideoModel()) || 'LTX';
            if (status) {
                status.innerHTML =
                    '<div class="status-msg info"><span class="spinner"></span> Generating video with ComfyUI (' +
                    escapeAttr(videoModel) + ')…</div>';
            }

            try {
                var result = await generateVideo(prompt, imageDataUrl, duration, function (p) {
                    if (!status) return;
                    if (p.stage === 'polling') {
                        status.innerHTML =
                            '<div class="status-msg info"><span class="spinner"></span> ComfyUI video… (' +
                            (p.attempt || 0) + ')</div>';
                    }
                    if (p.stage === 'upload') {
                        status.innerHTML =
                            '<div class="status-msg info"><span class="spinner"></span> Uploading reference to ComfyUI…</div>';
                    }
                });

                var grid = document.getElementById('vgResultsGrid');
                var section = document.getElementById('vgResultsSection');
                if (grid && section) {
                    grid.innerHTML = '';
                    section.classList.remove('hidden');
                    var card = document.createElement('div');
                    card.className = 'result-card selected';
                    var videoWrap = document.createElement('div');
                    videoWrap.className = 'video-preview';
                    var videoEl = document.createElement('video');
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
                if (window.notificationSound) window.notificationSound.play();
            } catch (err) {
                console.error('[ComfyUI video]', err);
                if (status) status.innerHTML = '<div class="status-msg error">❌ ' + escapeAttr(err.message) + '</div>';
                if (typeof showToast === 'function') showToast(err.message, 'error');
            } finally {
                if (progress) progress.classList.remove('active');
                btn.disabled = false;
            }
        }, true);
    }

    function init() {
        injectProviderButton('sgProvider', 'comfyui', '🖥️ ComfyUI', 'Local ComfyUI (Pony + optional IP-Adapter)');
        injectProviderButton('vgProvider', 'comfyui', '🖥️ ComfyUI', 'Local ComfyUI (video model from Settings)');

        ensureSettingsPanel();
        wireSettingsHandlers();
        patchSpriteGenerate();
        patchVideoGenerate();

        var sgProv = localStorage.getItem('sg_ai_provider');
        if (sgProv === 'comfyui') {
            var sg = document.getElementById('sgProvider');
            if (sg) sg.querySelectorAll('.mode-btn').forEach(function (b) {
                b.classList.toggle('active', b.dataset.provider === 'comfyui');
            });
        }
        var vgProv = localStorage.getItem('vg_ai_provider');
        if (vgProv === 'comfyui') {
            var vg = document.getElementById('vgProvider');
            if (vg) vg.querySelectorAll('.mode-btn').forEach(function (b) {
                b.classList.toggle('active', b.dataset.provider === 'comfyui');
            });
        }

        var sgP = document.getElementById('sgProvider');
        if (sgP) sgP.addEventListener('click', function (e) {
            var b = e.target.closest('[data-provider]');
            if (b && b.dataset.provider) localStorage.setItem('sg_ai_provider', b.dataset.provider);
        });
        var vgP = document.getElementById('vgProvider');
        if (vgP) vgP.addEventListener('click', function (e) {
            var b = e.target.closest('[data-provider]');
            if (b && b.dataset.provider) localStorage.setItem('vg_ai_provider', b.dataset.provider);
        });

        console.log('[ComfyUI] Bridge ready — IP-Adapter character reference support');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 100); });
    } else {
        setTimeout(init, 100);
    }

    window.ComfyBridge = { generateSprite, generateVideo, ensureReachable, getCharacterReferenceDataUrl };
})();
