/**
 * ⚔️ AS Adventurer — Video Generation Module
 * Angel's Sword Studios
 *
 * Tab 2: Generate animated videos from sprite images.
 * Providers: Google Gemini Omni Flash  |  Grok Imagine (SuperGrok OAuth)
 */

(function() {
    'use strict';

    // ============================================
    // STATE
    // ============================================
    let generating = false;
    let cancelled = false;
    let referenceImages = []; // Array of { dataUrl }
    let generatedVideos = [];  // Array of { blob, url }
    let selectedVideos = new Set();
    let fromSpritePrep = false;
    let aiProvider = localStorage.getItem('vg_ai_provider') || 'gemini'; // 'gemini' | 'grok'

    // ============================================
    // REFERENCE IMAGE HANDLING
    // ============================================

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

    // ============================================
    // VIDEO GENERATION
    // ============================================

    function getSelectedProvider() {
        const container = document.getElementById('vgProvider');
        const active = container?.querySelector('.mode-btn.active');
        return active?.dataset.provider || aiProvider || 'gemini';
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
            if (!window.XaiOAuth) {
                showToast('Grok OAuth module not loaded', 'error');
                return;
            }
            const token = await window.XaiOAuth.getAccessToken();
            if (!token) {
                showToast('Not logged in with SuperGrok. Go to Settings → Login with SuperGrok.', 'error');
                return;
            }
        }

        if (referenceImages.length === 0) {
            showToast('Upload a reference image first, or send one from Sprite Prep', 'warning');
            return;
        }

        const modeSelector = document.getElementById('vgModeSelector');
        const activeMode = modeSelector?.querySelector('.mode-btn.active');
        const mode = activeMode?.dataset.mode || 'reference';

        if (mode === 'keyframe' && referenceImages.length < 2) {
            showToast('Keyframe mode requires both a Start Frame and End Frame', 'warning');
            return;
        }

        const duration = parseInt(document.getElementById('vgDuration')?.value || '5');
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
        const providerLabel = provider === 'grok' ? 'Grok Imagine' : 'Gemini Omni Flash';
        status.innerHTML = `<div class="status-msg info"><span class="spinner"></span> Generating video with ${providerLabel} — this may take several minutes…</div>`;

        try {
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
                if (result.status === 'fulfilled' && result.value) {
                    generatedVideos.push(result.value);
                }
            }

            if (generatedVideos.length > 0) {
                displayVideoResults();
                window.notificationSound?.play();
                status.innerHTML = `<div class="status-msg success">✅ Generated ${generatedVideos.length} video(s) with ${providerLabel}!</div>`;
            } else if (!cancelled) {
                const errors = results
                    .filter(r => r.status === 'rejected')
                    .map(r => r.reason?.message || String(r.reason));
                const errorMsg = errors.length > 0 ? errors[0] : 'Unknown error — check the server console for details.';
                status.innerHTML = `<div class="status-msg error">❌ ${errorMsg}</div>`;
                console.error('[VideoGen] All attempts failed:', errors);
            }
        } catch (err) {
            status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
        } finally {
            generating = false;
            document.getElementById('vgProgress')?.classList.remove('active');
            document.getElementById('vgGenerateBtn').disabled = false;
            const fillEl = document.getElementById('vgProgressFill');
            if (fillEl) fillEl.style.width = '0%';
        }
    }

    // ---------- Gemini path ----------
    async function generateOneGeminiVideo(apiKey, prompt, duration, mode) {
        const textPrompt = prompt || 'Generate a gentle breathing idle animation with slight body sway. Keep the character on the same background.';

        const requestBody = {
            model: 'gemini-omni-flash-preview'
        };

        if (mode === 'keyframe' && referenceImages.length >= 2) {
            const startRef = referenceImages[0];
            const startRaw = startRef.dataUrl.includes(',') ? startRef.dataUrl.split(',')[1] : startRef.dataUrl;
            const startMime = startRef.dataUrl.includes('image/png') ? 'image/png' : 'image/jpeg';

            requestBody.input = [
                { type: 'image', data: startRaw, mime_type: startMime },
                { type: 'text', text: `Starting from this image (start frame), animate the character transitioning to the end pose. ${textPrompt}` }
            ];
            requestBody.generation_config = {
                video_config: { task: 'image_to_video' }
            };
        } else if (referenceImages.length > 0) {
            const ref = referenceImages[0];
            const raw = ref.dataUrl.includes(',') ? ref.dataUrl.split(',')[1] : ref.dataUrl;
            const mimeType = ref.dataUrl.includes('image/png') ? 'image/png' : 'image/jpeg';

            requestBody.input = [
                { type: 'image', data: raw, mime_type: mimeType },
                { type: 'text', text: textPrompt }
            ];
            requestBody.generation_config = {
                video_config: { task: 'image_to_video' }
            };
        } else {
            requestBody.input = textPrompt;
        }

        const response = await fetch('/api/video/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = err?.error?.message || err?.message || `API error: ${response.status}`;
            throw new Error(msg);
        }

        const data = await response.json();
        console.log('[VideoGen/Gemini] Response:', JSON.stringify(data).substring(0, 500));

        return extractVideoFromGeminiResponse(data);
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

        if (data.result) {
            return extractVideoFromGeminiResponse(data.result);
        }

        console.warn('[VideoGen] Could not extract video from Gemini response:', JSON.stringify(data).substring(0, 1000));
        throw new Error('No video data found in Gemini response. Check the console for details.');
    }

    // ---------- Grok Imagine path ----------
    // Docs: https://docs.x.ai/developers/model-capabilities/video/image-to-video
    // POST /v1/videos/generations
    // {
    //   model: "grok-imagine-video-1.5",
    //   prompt: "motion description string",
    //   image: { url: "data:image/png;base64,..." },  // or public URL
    //   duration: 5-15,
    //   aspect_ratio: "16:9",
    //   resolution: "720p"
    // }
    // → { request_id }
    // poll GET /v1/videos/{request_id} until status === "done" → video.url

    function toDataUri(dataUrl) {
        if (!dataUrl) return null;
        if (dataUrl.startsWith('data:')) return dataUrl;
        // assume raw base64 PNG
        return `data:image/png;base64,${dataUrl}`;
    }

    function formatApiError(err, status) {
        if (!err) return `Grok video start failed: ${status}`;
        if (typeof err === 'string') return err;
        // xAI often returns { error: { message, code, type } } or { message }
        const nested = err.error;
        if (typeof nested === 'string') return nested;
        if (nested?.message) {
            const code = nested.code || nested.type || '';
            return code ? `${nested.message} (${code})` : nested.message;
        }
        if (err.message) return err.message;
        try {
            return JSON.stringify(err).substring(0, 300);
        } catch {
            return `Grok video start failed: ${status}`;
        }
    }

    async function generateOneGrokVideo(prompt, duration, mode) {
        const token = await window.XaiOAuth.getAccessToken();
        if (!token) throw new Error('SuperGrok token unavailable — please re-login in Settings');

        let textPrompt = prompt ||
            'Gentle breathing idle animation with slight body sway. Perfect seamless loop. Static locked-off camera. Keep the character and solid background exactly as in the source image.';

        if (mode === 'keyframe') {
            textPrompt = `Starting from this image as the first frame, animate a smooth transition. ${textPrompt}`;
        }

        const ref = referenceImages[0];
        if (!ref?.dataUrl) throw new Error('No reference image for Grok video');

        const dataUri = toDataUri(ref.dataUrl);

        // Clamp duration to typical Grok Imagine range (docs: ~5–15s; examples use 6, 10, 12)
        let grokDuration = parseInt(duration, 10) || 5;
        if (grokDuration < 1) grokDuration = 5;
        if (grokDuration > 15) grokDuration = 15;

        // Official image-to-video shape
        const body = {
            model: 'grok-imagine-video-1.5',
            prompt: textPrompt,
            image: {
                url: dataUri
            },
            duration: grokDuration,
            aspect_ratio: '16:9',
            resolution: '720p'
        };

        console.log('[VideoGen/Grok] Starting image-to-video…', {
            model: body.model,
            duration: body.duration,
            aspect_ratio: body.aspect_ratio,
            resolution: body.resolution,
            promptLen: textPrompt.length,
            imagePrefix: dataUri.substring(0, 40) + '…'
        });

        const startResp = await fetch('/api/xai/videos/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        const startText = await startResp.text();
        let startData = {};
        try {
            startData = startText ? JSON.parse(startText) : {};
        } catch {
            startData = { raw: startText };
        }

        if (!startResp.ok) {
            console.error('[VideoGen/Grok] Start failed', startResp.status, startData);
            throw new Error(formatApiError(startData, startResp.status));
        }

        console.log('[VideoGen/Grok] Start response:', JSON.stringify(startData).substring(0, 400));

        const requestId = startData.request_id
            || startData.id
            || startData.requestId
            || startData.data?.request_id
            || startData.data?.id
            || null;

        if (!requestId) {
            const immediate = await tryExtractGrokVideo(startData);
            if (immediate) return immediate;
            throw new Error('No request_id in Grok video response: ' + JSON.stringify(startData).substring(0, 200));
        }

        return pollGrokVideo(token, requestId);
    }

    async function pollGrokVideo(token, requestId) {
        const maxAttempts = 120; // ~10 min at 5s
        const pollInterval = 5000;

        for (let i = 0; i < maxAttempts; i++) {
            if (cancelled) return null;

            await new Promise(r => setTimeout(r, pollInterval));

            const fillEl = document.getElementById('vgProgressFill');
            const textEl = document.getElementById('vgProgressText');
            if (fillEl) fillEl.style.width = `${Math.min(95, ((i + 1) / maxAttempts) * 100)}%`;
            if (textEl) textEl.textContent = `Grok Imagine generating… (${Math.floor((i + 1) * pollInterval / 1000)}s)`;

            try {
                const resp = await fetch(`/api/xai/videos/${encodeURIComponent(requestId)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!resp.ok) {
                    console.warn('[VideoGen/Grok] Poll HTTP', resp.status);
                    continue;
                }

                const data = await resp.json();
                const status = (data.status || data.state || '').toLowerCase();
                console.log('[VideoGen/Grok] Poll status:', status, data.progress != null ? `(${data.progress}%)` : '');

                if (status === 'done' || status === 'completed' || status === 'succeeded' || status === 'success') {
                    const video = await tryExtractGrokVideo(data);
                    if (video) return video;
                    throw new Error('Grok reported done but no video URL/data found');
                }

                if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'expired') {
                    throw new Error(formatApiError(data, status) || `Grok video ${status}`);
                }
            } catch (e) {
                // Re-throw hard failures; soft poll errors continue
                if (e.message && (
                    e.message.includes('Grok') ||
                    e.message.includes('done but') ||
                    e.message.includes('expired') ||
                    e.message.includes('failed')
                )) throw e;
                console.warn('[VideoGen/Grok] Poll error:', e.message);
            }
        }

        throw new Error('Grok video generation timed out after ~10 minutes');
    }

    async function tryExtractGrokVideo(data) {
        const url = data.video?.url
            || data.url
            || data.video_url
            || data.data?.video?.url
            || data.data?.url
            || data.result?.video?.url
            || null;

        if (url) {
            console.log('[VideoGen/Grok] Downloading video from', url.substring(0, 80));
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Failed to download Grok video: ${resp.status}`);
            const blob = await resp.blob();
            return { blob, url: URL.createObjectURL(blob) };
        }

        const b64 = data.video?.data
            || data.data?.b64
            || data.b64
            || data.video_base64
            || null;

        if (b64) {
            const mime = data.video?.mime_type || data.mime_type || 'video/mp4';
            const raw = b64.includes(',') ? b64.split(',')[1] : b64;
            const blob = base64ToBlob(raw, mime);
            return { blob, url: URL.createObjectURL(blob) };
        }

        return null;
    }

    // ============================================
    // RESULTS DISPLAY
    // ============================================

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

            const actions = document.createElement('div');
            actions.className = 'card-actions';
            actions.innerHTML = `
                <button class="btn btn-sm btn-secondary" data-action="play" data-idx="${idx}" title="Play/pause this video">▶️ Play</button>
                <button class="btn btn-sm btn-secondary" data-action="download" data-idx="${idx}" title="Download this video">💾 Save</button>
                <button class="btn btn-sm ${selectedVideos.has(idx) ? 'btn-primary' : 'btn-secondary'}" data-action="select" data-idx="${idx}" title="Select this video for the pipeline">
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
                    a.download = `${window.ASAdventurer.characterName || 'video'}_gen_${idx + 1}.mp4`;
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
                updateGenerateButtonLabel();
            });
        }
        updateGenerateButtonLabel();

        initUploadZone('vgUploadZone', 'vgFileInput', (files) => {
            loadReferenceFiles(files);
        });

        initUploadZone('vgStartFrameZone', 'vgStartFrameInput', (files) => {
            if (files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (referenceImages.length === 0) referenceImages.push({});
                    referenceImages[0] = { dataUrl: e.target.result };

                    const preview = document.getElementById('vgStartFramePreview');
                    if (preview) {
                        preview.src = e.target.result;
                        preview.classList.remove('hidden');
                    }
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
                    if (preview) {
                        preview.src = e.target.result;
                        preview.classList.remove('hidden');
                    }
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
        if (panel) {
            observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function updateGenerateButtonLabel() {
        const btn = document.getElementById('vgGenerateBtn');
        if (!btn) return;
        const p = getSelectedProvider();
        if (p === 'grok') {
            btn.innerHTML = '🎬 Generate Video (Grok Imagine)';
            btn.title = 'Generate video(s) using Grok Imagine (SuperGrok)';
        } else {
            btn.innerHTML = '🎬 Generate Video (Gemini)';
            btn.title = 'Generate video(s) using Gemini Omni Flash';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVideoGen);
    } else {
        initVideoGen();
    }

})();
