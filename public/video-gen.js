/**
 * AS Adventurer — Video Generation Module
 * Providers: Google Gemini | Grok video | ComfyUI Wan I2V
 */

(function() {
    'use strict';

    let generating = false;
    let cancelled = false;
    let referenceImages = [];
    let generatedVideos = [];
    let selectedVideos = new Set();
    let fromSpritePrep = false;
    let aiProvider = localStorage.getItem('vg_ai_provider') || 'gemini';

    const EMOTION_PRESETS = {
        idle: {
            label: 'Idle',
            prompt: 'Alive idle animation, clear breathing with chest and shoulders rising and falling, soft natural blinks, slight hair movement, gentle body sway, character fully visible head to feet, locked-off static camera, no zoom no pan, seamless loop friendly, 2d anime game character animation, animated not a still frame'
        },
        talk_neutral: {
            label: 'Talk Neutral',
            prompt: 'Character talking with neutral expression, clear natural mouth and jaw motion, soft blinks, slight head movement, breathing motion, character fully visible head to feet, locked-off static camera, no zoom no pan, 2d anime game character animation'
        },
        talk_happy: {
            label: 'Talk Happy',
            prompt: 'Character talking happily, warm smile, cheerful expression, clear mouth motion, lively subtle head and shoulder motion, soft blinks, character fully visible head to feet, locked-off static camera, no zoom no pan, 2d anime game character animation'
        },
        talk_sad: {
            label: 'Talk Sad',
            prompt: 'Character talking sadly, melancholic expression, slower mouth motion, soft eye motion, slight head movement, breathing, character fully visible head to feet, locked-off static camera, no zoom no pan, 2d anime game character animation'
        }
    };

    function loadReferenceFromHandoff() {
        const handoff = window.ASAdventurer.handoff;
        if (handoff.spriteBase64) {
            referenceImages = [{ dataUrl: handoff.spriteBase64 }];
            fromSpritePrep = true;
            const preview = document.getElementById('vgRefImagePreview');
            const img = document.getElementById('vgRefImage');
            if (img) img.src = handoff.spriteBase64;
            preview?.classList.remove('hidden');
            document.getElementById('vgRefFromSprite')?.classList.remove('hidden');
            document.getElementById('vgUploadZone')?.classList.add('hidden');
        }
    }

    function loadReferenceFiles(files) {
        referenceImages = [];
        fromSpritePrep = false;
        document.getElementById('vgRefFromSprite')?.classList.add('hidden');
        const maxFiles = Math.min(files.length, 3);
        let loaded = 0;
        for (let i = 0; i < maxFiles; i++) {
            const reader = new FileReader();
            reader.onload = (e) => {
                referenceImages.push({ dataUrl: e.target.result });
                loaded++;
                if (loaded === maxFiles) {
                    const preview = document.getElementById('vgRefImagePreview');
                    const img = document.getElementById('vgRefImage');
                    if (img) img.src = referenceImages[0].dataUrl;
                    preview?.classList.remove('hidden');
                    showToast(`${referenceImages.length} reference image(s) loaded`, 'success');
                }
            };
            reader.readAsDataURL(files[i]);
        }
    }

    function getSelectedProvider() {
        const container = document.getElementById('vgProvider');
        const active = container?.querySelector('.mode-btn.active');
        return active?.dataset.provider || aiProvider || 'gemini';
    }

    function getSelectedEmotions() {
        const box = document.getElementById('vgEmotionPresets');
        if (!box) return ['idle'];
        const checked = [...box.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
        return checked.length ? checked : ['idle'];
    }

    function updateProviderUI() {
        const p = getSelectedProvider();
        const comfyOpts = document.getElementById('vgComfyOptions');
        const cloudOpts = document.getElementById('vgCloudOptions');
        if (comfyOpts) comfyOpts.classList.toggle('hidden', p !== 'comfyui');
        if (cloudOpts) cloudOpts.classList.toggle('hidden', p === 'comfyui');
        updateGenerateButtonLabel();
    }

    async function generateVideo() {
        if (generating) return;
        const provider = getSelectedProvider();

        if (provider === 'gemini') {
            const apiKey = localStorage.getItem('google_api_key');
            if (!apiKey) {
                showToast('No Google API key. Go to Settings to add one.', 'error');
                return;
            }
        } else if (provider === 'grok') {
            const manualKey = localStorage.getItem('xai_api_key');
            let hasAuth = !!(manualKey && manualKey.startsWith('xai-'));
            if (!hasAuth && window.XaiOAuth) {
                const token = await window.XaiOAuth.getAccessToken();
                if (token) hasAuth = true;
            }
            if (!hasAuth) {
                showToast('No xAI API key or Grok login found.', 'error');
                return;
            }
        } else if (provider === 'comfyui') {
            // connection checked at generate time
        }

        if (referenceImages.length === 0) {
            showToast('Upload a reference image first, or send one from Sprite Prep', 'warning');
            return;
        }

        const modeSelector = document.getElementById('vgModeSelector');
        const activeMode = modeSelector?.querySelector('.mode-btn.active');
        const mode = activeMode?.dataset.mode || 'reference';

        if (provider !== 'comfyui' && mode === 'keyframe' && referenceImages.length < 2) {
            showToast('Keyframe mode requires both a Start Frame and End Frame', 'warning');
            return;
        }

        const duration = parseInt(document.getElementById('vgDuration')?.value || '6');
        const genCountEl = document.getElementById('vgGenCount');
        const activeBtn = genCountEl?.querySelector('.gen-count-btn.active');
        const genCount = activeBtn ? parseInt(activeBtn.dataset.count) : 1;

        const prompt = mode === 'keyframe'
            ? (document.getElementById('vgKeyframePrompt')?.value?.trim() || '')
            : (document.getElementById('vgPrompt')?.value?.trim() || '');

        generating = true;
        cancelled = false;
        document.getElementById('vgProgress')?.classList.add('active');
        document.getElementById('vgGenerateBtn').disabled = true;
        const status = document.getElementById('vgStatus');
        const providerLabel = provider === 'grok' ? 'Grok video'
            : provider === 'comfyui' ? 'ComfyUI Wan I2V' : 'Gemini Omni Flash';
        status.innerHTML = `<div class="status-msg info"><span class="spinner"></span> Generating with ${providerLabel}…</div>`;

        try {
            if (provider === 'comfyui') {
                await generateComfyVideos(status, duration);
            } else {
                const promises = [];
                for (let i = 0; i < genCount; i++) {
                    if (cancelled) break;
                    if (provider === 'grok') {
                        promises.push(generateOneGrokVideo(prompt, duration, mode));
                    } else {
                        const apiKey = localStorage.getItem('google_api_key');
                        promises.push(generateOneGeminiVideo(apiKey, prompt, duration, mode));
                    }
                }
                const results = await Promise.allSettled(promises);
                generatedVideos = [];
                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value) generatedVideos.push(result.value);
                }
                if (generatedVideos.length > 0) {
                    displayVideoResults();
                    window.notificationSound?.play();
                    status.innerHTML = `<div class="status-msg success">✅ Generated ${generatedVideos.length} video(s) with ${providerLabel}!</div>`;
                    showToast(`✅ Generated ${generatedVideos.length} video(s)`, 'success');
                } else if (!cancelled) {
                    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
                    status.innerHTML = `<div class="status-msg error">❌ ${errors[0] || 'Unknown error'}</div>`;
                }
            }
        } catch (err) {
            status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
            showToast(err.message, 'error');
        } finally {
            generating = false;
            document.getElementById('vgProgress')?.classList.remove('active');
            document.getElementById('vgGenerateBtn').disabled = false;
            const fillEl = document.getElementById('vgProgressFill');
            if (fillEl) fillEl.style.width = '0%';
        }
    }

    // ---------- ComfyUI Wan I2V ----------

    function getWanConfig() {
        if (window.ComfyUISettings?.getVideoConfig) {
            return window.ComfyUISettings.getVideoConfig();
        }
        // Fallback if bridge not loaded
        return {
            baseUrl: localStorage.getItem('comfyui_base_url') || '',
            unet: localStorage.getItem('comfyui_wan_unet') || 'Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors',
            vae: localStorage.getItem('comfyui_wan_vae') || 'wan_2.1_vae.safetensors',
            textEncoder: localStorage.getItem('comfyui_wan_text_encoder') || 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
            clipVision: localStorage.getItem('comfyui_wan_clip_vision') || 'clip_vision_h.safetensors',
            width: parseInt(localStorage.getItem('comfyui_wan_width') || '832', 10),
            height: parseInt(localStorage.getItem('comfyui_wan_height') || '480', 10),
            frames: parseInt(localStorage.getItem('comfyui_wan_frames') || '97', 10),
            steps: parseInt(localStorage.getItem('comfyui_wan_steps') || '20', 10),
            cfg: parseFloat(localStorage.getItem('comfyui_wan_cfg') || '5'),
            useGguf: localStorage.getItem('comfyui_wan_use_gguf') === 'true'
        };
    }

    /**
     * Fit full sprite into Wan canvas (contain + pad). Prevents head/feet crop from
     * center-scaling a 720p full-body still into 832×480.
     * Pad color is sampled from the top-left pixel (usually chroma key).
     */
    function fitImageToWanCanvas(dataUrl, targetW, targetH) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const tw = Math.max(64, targetW | 0);
                    const th = Math.max(64, targetH | 0);
                    const sw = img.naturalWidth || img.width;
                    const sh = img.naturalHeight || img.height;
                    const scale = Math.min(tw / sw, th / sh);
                    const dw = Math.max(1, Math.round(sw * scale));
                    const dh = Math.max(1, Math.round(sh * scale));
                    const ox = Math.floor((tw - dw) / 2);
                    const oy = Math.floor((th - dh) / 2);

                    const canvas = document.createElement('canvas');
                    canvas.width = tw;
                    canvas.height = th;
                    const ctx = canvas.getContext('2d');

                    // Sample corner for pad (green screen / solid bg)
                    const probe = document.createElement('canvas');
                    probe.width = 1;
                    probe.height = 1;
                    const pctx = probe.getContext('2d');
                    pctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
                    const pix = pctx.getImageData(0, 0, 1, 1).data;
                    ctx.fillStyle = `rgb(${pix[0]},${pix[1]},${pix[2]})`;
                    ctx.fillRect(0, 0, tw, th);

                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, sw, sh, ox, oy, dw, dh);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image for Wan resize'));
            img.src = dataUrl;
        });
    }

    async function uploadImageToComfy(baseUrl, dataUrl, filename) {
        const res = await fetch('/api/comfyui/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, image: dataUrl, filename })
        });
        if (!res.ok) throw new Error('Upload failed: ' + (await res.text()).substring(0, 200));
        const data = await res.json();
        return data.name || data.filename || filename;
    }

    /**
     * Native-style Wan I2V graph (ComfyUI core nodes where possible).
     * GGUF uses UnetLoaderGGUF if enabled in settings.
     */
    function buildWanI2VWorkflow(opts) {
        const {
            imageName, positiveText, seed, width, height, frames, steps, cfg,
            unet, vae, textEncoder, clipVision, useGguf
        } = opts;

        const wf = {};
        let id = 1;
        const nid = () => String(id++);

        const loadImg = nid();
        wf[loadImg] = { class_type: 'LoadImage', inputs: { image: imageName } };

        const clipVisLoad = nid();
        wf[clipVisLoad] = { class_type: 'CLIPVisionLoader', inputs: { clip_name: clipVision } };

        const clipVisEnc = nid();
        wf[clipVisEnc] = {
            class_type: 'CLIPVisionEncode',
            // 'none' avoids an extra center crop on top of our letterboxed frame
            inputs: { clip_vision: [clipVisLoad, 0], image: [loadImg, 0], crop: 'none' }
        };

        const clipLoad = nid();
        wf[clipLoad] = {
            class_type: 'CLIPLoader',
            inputs: { clip_name: textEncoder, type: 'wan', device: 'default' }
        };

        const pos = nid();
        wf[pos] = {
            class_type: 'CLIPTextEncode',
            inputs: { text: positiveText, clip: [clipLoad, 0] }
        };

        const neg = nid();
        wf[neg] = {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'blurry, low quality, distorted face, extra limbs, text, watermark, camera move, zoom, pan', clip: [clipLoad, 0] }
        };

        const unetLoad = nid();
        if (useGguf) {
            wf[unetLoad] = {
                class_type: 'UnetLoaderGGUF',
                inputs: { unet_name: unet }
            };
        } else {
            wf[unetLoad] = {
                class_type: 'UNETLoader',
                inputs: { unet_name: unet, weight_dtype: 'default' }
            };
        }

        const vaeLoad = nid();
        wf[vaeLoad] = { class_type: 'VAELoader', inputs: { vae_name: vae } };

        // WanImageToVideo creates the starting latent conditioned on the image + clip vision
        const wan = nid();
        wf[wan] = {
            class_type: 'WanImageToVideo',
            inputs: {
                positive: [pos, 0],
                negative: [neg, 0],
                vae: [vaeLoad, 0],
                clip_vision_output: [clipVisEnc, 0],
                start_image: [loadImg, 0],
                width,
                height,
                length: frames,
                batch_size: 1
            }
        };

        const sample = nid();
        wf[sample] = {
            class_type: 'KSampler',
            inputs: {
                seed,
                steps,
                cfg,
                sampler_name: 'uni_pc',
                scheduler: 'simple',
                denoise: 1,
                model: [unetLoad, 0],
                positive: [wan, 0],
                negative: [wan, 1],
                latent_image: [wan, 2]
            }
        };

        const decode = nid();
        wf[decode] = {
            class_type: 'VAEDecode',
            inputs: { samples: [sample, 0], vae: [vaeLoad, 0] }
        };

        // Prefer CreateVideo + SaveVideo (newer Comfy); fallback SaveAnimatedWEBP handled by history scan
        const createVid = nid();
        wf[createVid] = {
            class_type: 'CreateVideo',
            inputs: {
                images: [decode, 0],
                fps: 16
            }
        };

        const saveVid = nid();
        wf[saveVid] = {
            class_type: 'SaveVideo',
            inputs: {
                video: [createVid, 0],
                filename_prefix: 'as_wan_i2v',
                format: 'auto',
                codec: 'auto'
            }
        };

        return { wf, saveNodeId: saveVid, decodeId: decode };
    }

    async function queueComfyPrompt(base, wf) {
        const q = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl: base, path: '/prompt', method: 'POST', body: { prompt: wf } })
        });
        if (!q.ok) {
            const t = await q.text();
            throw new Error('ComfyUI queue failed: ' + t.substring(0, 400));
        }
        const data = await q.json();
        if (!data.prompt_id) throw new Error('No prompt_id from ComfyUI');
        return data.prompt_id;
    }

    async function waitComfyHistory(base, promptId, onTick) {
        for (let i = 0; i < 180; i++) {
            if (cancelled) throw new Error('Cancelled');
            await new Promise(r => setTimeout(r, 2000));
            if (onTick) onTick(i);
            const h = await fetch('/api/comfyui/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl: base, path: `/history/${promptId}`, method: 'GET' })
            });
            if (!h.ok) continue;
            const hist = await h.json();
            const entry = hist[promptId];
            if (!entry || !entry.outputs) continue;
            return entry;
        }
        throw new Error('Timed out waiting for ComfyUI video');
    }

    function findMediaInHistory(entry) {
        const outs = entry.outputs || {};
        for (const k of Object.keys(outs)) {
            const o = outs[k];
            if (o.gifs?.length) return { kind: 'gif', meta: o.gifs[0] };
            if (o.videos?.length) return { kind: 'video', meta: o.videos[0] };
            if (o.images?.length) return { kind: 'images', metas: o.images };
        }
        return null;
    }

    async function fetchComfyBinary(base, meta) {
        const fname = meta.filename;
        const subfolder = meta.subfolder || '';
        const type = meta.type || 'output';
        const qs = `filename=${encodeURIComponent(fname)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;
        const v = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl: base, path: `/view?${qs}`, method: 'GET', isBinary: true })
        });
        if (!v.ok) throw new Error('Failed to download ' + fname);
        return await v.blob();
    }

    async function generateComfyVideos(status, durationSec) {
        const cfg = getWanConfig();
        const base = (cfg.baseUrl || '').replace(/\/$/, '');
        if (!base) throw new Error('Set ComfyUI URL in Settings → ComfyUI → Connection');

        // Adjust frames for requested duration if user moved duration slider
        let frames = cfg.frames;
        if (durationSec && durationSec !== 6) {
            frames = Math.round(durationSec * 16);
            frames = Math.max(17, Math.round((frames - 1) / 4) * 4 + 1);
        }

        const emotions = getSelectedEmotions();
        const ref = referenceImages[0];
        if (!ref?.dataUrl) throw new Error('No reference image');

        status.innerHTML = `<div class="status-msg info"><span class="spinner"></span> Fitting full character to ${cfg.width}×${cfg.height} (no crop)…</div>`;
        // 720p (or any) still → letterbox into Wan size so head/feet are not clipped
        const fitted = await fitImageToWanCanvas(ref.dataUrl, cfg.width, cfg.height);
        const imageName = await uploadImageToComfy(base, fitted, `as_wan_ref_${cfg.width}x${cfg.height}_${Date.now()}.png`);

        generatedVideos = [];
        const fillEl = document.getElementById('vgProgressFill');
        const textEl = document.getElementById('vgProgressText');

        for (let i = 0; i < emotions.length; i++) {
            if (cancelled) break;
            const key = emotions[i];
            const preset = EMOTION_PRESETS[key] || EMOTION_PRESETS.idle;
            const customExtra = (document.getElementById('vgPrompt')?.value || '').trim();
            const positive = customExtra
                ? `${preset.prompt}. ${customExtra}`
                : preset.prompt;

            status.innerHTML = `<div class="status-msg info"><span class="spinner"></span> ComfyUI ${preset.label} (${i + 1}/${emotions.length})…</div>`;
            if (textEl) textEl.textContent = `Wan I2V · ${preset.label}…`;

            const seed = Math.floor(Math.random() * 1e9);
            const { wf } = buildWanI2VWorkflow({
                imageName,
                positiveText: positive,
                seed,
                width: cfg.width,
                height: cfg.height,
                frames,
                steps: cfg.steps,
                cfg: cfg.cfg,
                unet: cfg.unet,
                vae: cfg.vae,
                textEncoder: cfg.textEncoder,
                clipVision: cfg.clipVision,
                useGguf: cfg.useGguf
            });

            try {
                const pid = await queueComfyPrompt(base, wf);
                const entry = await waitComfyHistory(base, pid, (tick) => {
                    if (fillEl) fillEl.style.width = `${Math.min(95, ((i + (tick / 180)) / emotions.length) * 100)}%`;
                });

                const media = findMediaInHistory(entry);
                if (!media) throw new Error('No video/frames in ComfyUI output — check Wan nodes/models');

                let blob;
                if (media.kind === 'images') {
                    // If only frames returned, take first as placeholder failure message
                    throw new Error('Comfy returned images only. Ensure CreateVideo/SaveVideo nodes exist in your ComfyUI version.');
                } else {
                    blob = await fetchComfyBinary(base, media.meta);
                }

                if (!blob || blob.size < 500) throw new Error('Empty video blob');
                generatedVideos.push({
                    blob,
                    url: URL.createObjectURL(blob),
                    label: preset.label
                });
            } catch (e) {
                console.error('[VideoGen/Comfy]', key, e);
                status.innerHTML = `<div class="status-msg error">⚠️ ${preset.label}: ${e.message}</div>`;
                // continue other emotions
            }
        }

        if (generatedVideos.length === 0) {
            throw new Error(
                'All ComfyUI video gens failed. Install Wan I2V models + nodes, match filenames in Settings → ComfyUI → Video. ' +
                'On Intel Arc, Wan may not run — try NVIDIA or cloud providers.'
            );
        }

        displayVideoResults();
        window.notificationSound?.play();
        status.innerHTML = `<div class="status-msg success">✅ Generated ${generatedVideos.length} ComfyUI clip(s)</div>`;
        showToast(`✅ Generated ${generatedVideos.length} ComfyUI clip(s)`, 'success');
        if (fillEl) fillEl.style.width = '100%';
    }

    // ---------- Gemini / Grok (unchanged logic) ----------

    async function generateOneGeminiVideo(apiKey, prompt, duration, mode) {
        const textPrompt = prompt || 'Generate a gentle breathing idle animation with slight body sway. Keep the character on the same background.';
        const requestBody = { model: 'gemini-omni-flash-preview' };

        if (mode === 'keyframe' && referenceImages.length >= 2) {
            const startRef = referenceImages[0];
            const startRaw = startRef.dataUrl.includes(',') ? startRef.dataUrl.split(',')[1] : startRef.dataUrl;
            const startMime = startRef.dataUrl.includes('image/png') ? 'image/png' : 'image/jpeg';
            requestBody.input = [
                { type: 'image', data: startRaw, mime_type: startMime },
                { type: 'text', text: `Starting from this image (start frame), animate the character transitioning to the end pose. ${textPrompt}` }
            ];
            requestBody.generation_config = { video_config: { task: 'image_to_video' } };
        } else if (referenceImages.length > 0) {
            const ref = referenceImages[0];
            const raw = ref.dataUrl.includes(',') ? ref.dataUrl.split(',')[1] : ref.dataUrl;
            const mimeType = ref.dataUrl.includes('image/png') ? 'image/png' : 'image/jpeg';
            requestBody.input = [
                { type: 'image', data: raw, mime_type: mimeType },
                { type: 'text', text: textPrompt }
            ];
            requestBody.generation_config = { video_config: { task: 'image_to_video' } };
        } else {
            requestBody.input = textPrompt;
        }

        const response = await fetch('/api/video/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err?.error?.message || err?.message || `API error: ${response.status}`);
        }
        return extractVideoFromGeminiResponse(await response.json());
    }

    function extractVideoFromGeminiResponse(data) {
        if (data.steps && Array.isArray(data.steps)) {
            for (const step of data.steps) {
                if (step.type === 'model_output' && step.content) {
                    for (const item of step.content) {
                        if (item.type === 'video' && item.data) {
                            const mimeType = item.mime_type || 'video/mp4';
                            const blob = base64ToBlob(item.data, mimeType);
                            return { blob, url: URL.createObjectURL(blob) };
                        }
                    }
                }
            }
        }
        if (data.candidates) {
            for (const candidate of data.candidates) {
                if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData?.mimeType?.startsWith('video/')) {
                            const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType);
                            return { blob, url: URL.createObjectURL(blob) };
                        }
                    }
                }
            }
        }
        if (data.result) return extractVideoFromGeminiResponse(data.result);
        throw new Error('No video data found in Gemini response.');
    }

    function toDataUri(dataUrl) {
        if (!dataUrl) return null;
        if (dataUrl.startsWith('data:')) return dataUrl;
        return `data:image/png;base64,${dataUrl}`;
    }

    function formatApiError(err, status) {
        if (!err) return `Grok video error: ${status}`;
        if (typeof err === 'string') return err;
        const nested = err.error;
        if (typeof nested === 'string') return nested;
        if (nested?.message) {
            const code = nested.code || nested.type || '';
            return code ? `${nested.message} (${code})` : nested.message;
        }
        if (err.message) return err.message;
        try { return JSON.stringify(err).substring(0, 300); } catch { return `Grok video error: ${status}`; }
    }

    async function getGrokAuthHeader() {
        const manualKey = localStorage.getItem('xai_api_key');
        if (manualKey && manualKey.startsWith('xai-')) return `Bearer ${manualKey}`;
        if (window.XaiOAuth) {
            const token = await window.XaiOAuth.getAccessToken();
            if (token) return `Bearer ${token}`;
        }
        throw new Error('No xAI API key or Grok login found.');
    }

    async function generateOneGrokVideo(prompt, duration, mode) {
        const authHeader = await getGrokAuthHeader();
        let textPrompt = prompt ||
            'Gentle breathing idle animation with slight body sway. Perfect seamless loop. Static locked-off camera. Keep the character and solid background exactly as in the source image.';
        if (mode === 'keyframe') textPrompt = `Starting from this image as the first frame, animate a smooth transition. ${textPrompt}`;
        const ref = referenceImages[0];
        if (!ref?.dataUrl) throw new Error('No reference image for Grok video');
        const dataUri = toDataUri(ref.dataUrl);
        let grokDuration = parseInt(duration, 10) || 6;
        if (grokDuration < 1) grokDuration = 6;
        if (grokDuration > 15) grokDuration = 15;
        const body = {
            model: 'grok-imagine-video-1.5',
            prompt: textPrompt,
            image: { url: dataUri },
            duration: grokDuration,
            aspect_ratio: '16:9',
            resolution: '720p'
        };
        const startResp = await fetch('/api/xai/videos/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify(body)
        });
        const startText = await startResp.text();
        let startData = {};
        try { startData = startText ? JSON.parse(startText) : {}; } catch { startData = { raw: startText }; }
        if (!startResp.ok) throw new Error(formatApiError(startData, startResp.status));
        const immediate = await tryExtractGrokVideo(authHeader, startData);
        if (immediate) return immediate;
        const requestId = startData.request_id || startData.id || startData.requestId || startData.data?.request_id || startData.data?.id || null;
        if (!requestId) throw new Error('No request_id in Grok video response');
        return pollGrokVideo(authHeader, requestId);
    }

    async function pollGrokVideo(authHeader, requestId) {
        const maxAttempts = 90;
        const pollInterval = 5000;
        let consecutive403 = 0;
        let lastBody = null;
        for (let i = 0; i < maxAttempts; i++) {
            if (cancelled) return null;
            await new Promise(r => setTimeout(r, pollInterval));
            let currentAuth = authHeader;
            try { currentAuth = await getGrokAuthHeader(); } catch (_) {}
            const fillEl = document.getElementById('vgProgressFill');
            const textEl = document.getElementById('vgProgressText');
            if (fillEl) fillEl.style.width = `${Math.min(95, ((i + 1) / maxAttempts) * 100)}%`;
            if (textEl) textEl.textContent = `Grok video generating… (${Math.floor((i + 1) * pollInterval / 1000)}s)`;
            try {
                const resp = await fetch(`/api/xai/videos/${encodeURIComponent(requestId)}`, {
                    method: 'GET', headers: { 'Authorization': currentAuth }
                });
                const text = await resp.text();
                let data = {};
                try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
                lastBody = data;
                if (resp.status === 202) { consecutive403 = 0; continue; }
                if (resp.status === 403 || resp.status === 429) {
                    consecutive403++;
                    if (lastBody) {
                        const maybe = await tryExtractGrokVideo(currentAuth, lastBody);
                        if (maybe) return maybe;
                    }
                    if (consecutive403 >= 5) throw new Error('Grok poll 403/429 repeatedly. ' + formatApiError(data, resp.status));
                    await new Promise(r => setTimeout(r, 3000 * consecutive403));
                    continue;
                }
                if (resp.status === 401) throw new Error('Grok auth expired during poll');
                if (!resp.ok && resp.status !== 200) {
                    if (resp.status >= 500) continue;
                    throw new Error(formatApiError(data, resp.status));
                }
                consecutive403 = 0;
                const st = String(data.status || data.state || '').toLowerCase();
                const hasUrl = !!(data.video?.url || data.url || data.video_url);
                if (st === 'done' || st === 'completed' || st === 'succeeded' || st === 'success' || hasUrl) {
                    const video = await tryExtractGrokVideo(currentAuth, data);
                    if (video) return video;
                    if (hasUrl) throw new Error('Grok returned URL but download failed');
                }
                if (st === 'failed' || st === 'error' || st === 'cancelled' || st === 'expired') {
                    throw new Error(formatApiError(data, st));
                }
            } catch (e) {
                if (e.message && (e.message.includes('Grok') || e.message.includes('auth') || e.message.includes('download') || e.message.includes('rate limit'))) throw e;
            }
        }
        throw new Error('Grok video generation timed out');
    }

    async function tryExtractGrokVideo(authHeader, data) {
        if (!data || typeof data !== 'object') return null;
        const remoteUrl = data.video?.url || data.url || data.video_url || data.data?.video?.url || data.data?.url || data.result?.video?.url || null;
        if (remoteUrl) {
            const resp = await fetch('/api/xai/video-fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                body: JSON.stringify({ url: remoteUrl })
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || err.detail || `Grok video download failed: ${resp.status}`);
            }
            const blob = await resp.blob();
            if (!blob || blob.size < 1000) throw new Error('Grok video download returned empty file');
            return { blob, url: URL.createObjectURL(blob) };
        }
        const b64 = data.video?.data || data.data?.b64 || data.b64 || data.video_base64 || null;
        if (b64) {
            const mime = data.video?.mime_type || data.mime_type || 'video/mp4';
            const raw = b64.includes(',') ? b64.split(',')[1] : b64;
            const blob = base64ToBlob(raw, mime);
            return { blob, url: URL.createObjectURL(blob) };
        }
        return null;
    }

    function displayVideoResults() {
        const grid = document.getElementById('vgResultsGrid');
        const section = document.getElementById('vgResultsSection');
        grid.querySelectorAll('video').forEach(v => {
            if (v.src && v.src.startsWith('blob:')) {
                v.pause();
                v.removeAttribute('src');
                v.load();
            }
        });
        grid.innerHTML = '';
        section.classList.remove('hidden');
        selectedVideos = new Set([0]);

        generatedVideos.forEach((video, idx) => {
            const card = document.createElement('div');
            card.className = 'result-card' + (idx === 0 ? ' selected' : '');
            card.dataset.idx = idx;
            const videoWrap = document.createElement('div');
            videoWrap.className = 'video-preview';
            const videoEl = document.createElement('video');
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.src = video.url;
            videoEl.load();
            videoWrap.appendChild(videoEl);
            const label = video.label ? `<div class="text-dim" style="font-size:0.75rem;margin-bottom:0.35rem">${video.label}</div>` : '';
            const actions = document.createElement('div');
            actions.className = 'card-actions';
            actions.innerHTML = `
                ${label}
                <button class="btn btn-sm btn-secondary" data-action="play" data-idx="${idx}">▶️ Play</button>
                <button class="btn btn-sm btn-secondary" data-action="download" data-idx="${idx}">💾 Save</button>
                <button class="btn btn-sm ${selectedVideos.has(idx) ? 'btn-primary' : 'btn-secondary'}" data-action="select" data-idx="${idx}">
                    ${selectedVideos.has(idx) ? '✓ Selected' : '○ Select'}
                </button>
            `;
            card.appendChild(videoWrap);
            card.appendChild(actions);
            grid.appendChild(card);
        });
    }

    function bindVideoResultEvents() {
        const grid = document.getElementById('vgResultsGrid');
        if (!grid) return;
        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const idx = parseInt(btn.dataset.idx);
            if (btn.dataset.action === 'play') {
                const video = grid.querySelectorAll('video')[idx];
                if (video) {
                    if (video.paused) { video.play(); btn.textContent = '⏸ Pause'; }
                    else { video.pause(); btn.textContent = '▶️ Play'; }
                }
            } else if (btn.dataset.action === 'download') {
                if (generatedVideos[idx]?.blob) {
                    const a = document.createElement('a');
                    a.href = generatedVideos[idx].url;
                    const tag = generatedVideos[idx].label ? `_${generatedVideos[idx].label.replace(/\s+/g, '_')}` : '';
                    a.download = `${window.ASAdventurer.characterName || 'video'}${tag}_${idx + 1}.mp4`;
                    a.click();
                }
            } else if (btn.dataset.action === 'select') {
                if (selectedVideos.has(idx)) {
                    selectedVideos.delete(idx);
                    btn.className = 'btn btn-sm btn-secondary';
                    btn.innerHTML = '○ Select';
                    btn.closest('.result-card').classList.remove('selected');
                } else {
                    selectedVideos.add(idx);
                    btn.className = 'btn btn-sm btn-primary';
                    btn.innerHTML = '✓ Selected';
                    btn.closest('.result-card').classList.add('selected');
                }
            }
        });
    }

    function handoffToVideoPrep() {
        if (selectedVideos.size === 0) {
            showToast('Select at least one video first', 'warning');
            return;
        }
        const idx = Array.from(selectedVideos)[0];
        const video = generatedVideos[idx];
        if (video) {
            window.ASAdventurer.handoff.videoBlob = video.blob;
            window.ASAdventurer.handoff.videoUrl = video.url;
            showToast('Video sent to Video Preparation', 'success');
            switchTab('tab-video-prep');
        }
    }

    function initVideoGen() {
        initModeSelector('vgModeSelector', (mode) => {
            document.getElementById('vgReferenceMode')?.classList.toggle('hidden', mode !== 'reference');
            document.getElementById('vgKeyframeMode')?.classList.toggle('hidden', mode !== 'keyframe');
        });

        const providerEl = document.getElementById('vgProvider');
        if (providerEl) {
            providerEl.querySelectorAll('.mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.provider === aiProvider);
            });
            providerEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn || !btn.dataset.provider) return;
                providerEl.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                aiProvider = btn.dataset.provider;
                localStorage.setItem('vg_ai_provider', aiProvider);
                updateProviderUI();
            });
        }
        updateProviderUI();

        initUploadZone('vgUploadZone', 'vgFileInput', (files) => loadReferenceFiles(files));

        initUploadZone('vgStartFrameZone', 'vgStartFrameInput', (files) => {
            if (files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (referenceImages.length === 0) referenceImages.push({});
                    referenceImages[0] = { dataUrl: e.target.result };
                    const preview = document.getElementById('vgStartFramePreview');
                    if (preview) { preview.src = e.target.result; preview.classList.remove('hidden'); }
                    const icon = document.getElementById('vgStartFrameIcon');
                    const text = document.getElementById('vgStartFrameText');
                    if (icon) icon.textContent = '✅';
                    if (text) text.textContent = 'Start Frame Loaded';
                    showToast('Start frame loaded', 'success');
                };
                reader.readAsDataURL(files[0]);
            }
        });

        initUploadZone('vgEndFrameZone', 'vgEndFrameInput', (files) => {
            if (files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (referenceImages.length < 2) referenceImages.push({});
                    referenceImages[1] = { dataUrl: e.target.result };
                    const preview = document.getElementById('vgEndFramePreview');
                    if (preview) { preview.src = e.target.result; preview.classList.remove('hidden'); }
                    const icon = document.getElementById('vgEndFrameIcon');
                    const text = document.getElementById('vgEndFrameText');
                    if (icon) icon.textContent = '✅';
                    if (text) text.textContent = 'End Frame Loaded';
                    showToast('End frame loaded', 'success');
                };
                reader.readAsDataURL(files[0]);
            }
        });

        initRange('vgDuration', 'vgDurationVal', 's');
        initGenCount('vgGenCount');

        document.getElementById('vgGenerateBtn')?.addEventListener('click', generateVideo);
        document.getElementById('vgCancelBtn')?.addEventListener('click', () => {
            cancelled = true;
            showToast('Generation cancelled', 'warning');
        });
        document.getElementById('vgHandoffBtn')?.addEventListener('click', handoffToVideoPrep);

        bindVideoResultEvents();

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.target.classList.contains('active') && m.target.id === 'tab-video-gen') {
                    loadReferenceFromHandoff();
                }
            }
        });
        const panel = document.getElementById('tab-video-gen');
        if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }

    function updateGenerateButtonLabel() {
        const btn = document.getElementById('vgGenerateBtn');
        if (!btn) return;
        const p = getSelectedProvider();
        if (p === 'grok') {
            btn.innerHTML = '🎬 Generate Video (Grok)';
        } else if (p === 'comfyui') {
            btn.innerHTML = '🖥️ Generate Clips (ComfyUI Wan)';
        } else {
            btn.innerHTML = '🎬 Generate Video (Gemini)';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVideoGen);
    } else {
        initVideoGen();
    }
})();
