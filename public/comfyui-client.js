/**
 * ⚔️ AS Adventurer — ComfyUI Local Client
 * Talks to a local ComfyUI instance via the AS Adventurer server proxy.
 *
 * Defaults:
 *   Sprites  — Pony Diffusion V6 XL @ 1216×832
 *   Video    — LTX-Video-ICLoRA-pose-13b-0.9.7 (ComfyUI-LTXVideo nodes)
 */

(function () {
    'use strict';

    const DEFAULT_URL = 'http://127.0.0.1:8188';
    const STORAGE_URL = 'comfyui_base_url';
    const STORAGE_CKPT = 'comfyui_checkpoint';
    const STORAGE_VIDEO = 'comfyui_video_model';

    // Common CivitAI / HF filenames — change in Settings if yours differs
    const DEFAULT_CKPT = 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
    const DEFAULT_VIDEO_MODEL = 'LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors';

    const DEFAULT_SPRITE_W = 1216;
    const DEFAULT_SPRITE_H = 832;

    function getBaseUrl() {
        return (localStorage.getItem(STORAGE_URL) || DEFAULT_URL).replace(/\/$/, '');
    }

    function setBaseUrl(url) {
        localStorage.setItem(STORAGE_URL, (url || DEFAULT_URL).replace(/\/$/, ''));
    }

    function getCheckpoint() {
        return localStorage.getItem(STORAGE_CKPT) || DEFAULT_CKPT;
    }

    function setCheckpoint(name) {
        localStorage.setItem(STORAGE_CKPT, name || DEFAULT_CKPT);
    }

    function getVideoModel() {
        return localStorage.getItem(STORAGE_VIDEO) || DEFAULT_VIDEO_MODEL;
    }

    function setVideoModel(name) {
        localStorage.setItem(STORAGE_VIDEO, name || DEFAULT_VIDEO_MODEL);
    }

    /** Proxy-aware fetch → /api/comfyui/... */
    async function comfyFetch(path, options = {}) {
        const base = getBaseUrl();
        const resp = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: base,
                path,
                method: options.method || 'GET',
                body: options.body || null,
                isBinary: !!options.isBinary
            })
        });
        return resp;
    }

    async function testConnection() {
        const resp = await comfyFetch('/system_stats');
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `ComfyUI unreachable (${resp.status})`);
        }
        return resp.json();
    }

    /**
     * SDXL text-to-image for Pony Diffusion V6 XL (or any SDXL ckpt).
     * Default resolution: 1216×832
     */
    function buildSpriteWorkflow({ prompt, negative, width, height, seed, steps, cfg, checkpoint }) {
        const ckpt = checkpoint || getCheckpoint();
        const w = width || DEFAULT_SPRITE_W;
        const h = height || DEFAULT_SPRITE_H;
        const s = seed == null ? Math.floor(Math.random() * 2 ** 32) : seed;

        // Pony works best with score tags + euler a / normal
        const ponyNeg = negative || [
            'score_4, score_5, score_6,',
            'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit,',
            'fewer digits, cropped, worst quality, low quality, jpeg artifacts,',
            'signature, watermark, username, blurry, gradient background,',
            'detailed background, scenery, 3d, realistic'
        ].join(' ');

        return {
            '1': {
                class_type: 'CheckpointLoaderSimple',
                inputs: { ckpt_name: ckpt }
            },
            '2': {
                class_type: 'CLIPTextEncode',
                inputs: { text: prompt, clip: ['1', 1] }
            },
            '3': {
                class_type: 'CLIPTextEncode',
                inputs: { text: ponyNeg, clip: ['1', 1] }
            },
            '4': {
                class_type: 'EmptyLatentImage',
                inputs: { width: w, height: h, batch_size: 1 }
            },
            '5': {
                class_type: 'KSampler',
                inputs: {
                    seed: s,
                    steps: steps || 25,
                    cfg: cfg || 7,
                    sampler_name: 'euler_ancestral',
                    scheduler: 'normal',
                    denoise: 1,
                    model: ['1', 0],
                    positive: ['2', 0],
                    negative: ['3', 0],
                    latent_image: ['4', 0]
                }
            },
            '6': {
                class_type: 'VAEDecode',
                inputs: { samples: ['5', 0], vae: ['1', 2] }
            },
            '7': {
                class_type: 'SaveImage',
                inputs: { filename_prefix: 'ASAdventurer_sprite', images: ['6', 0] }
            }
        };
    }

    /**
     * Queue a workflow and wait until finished.
     * Returns array of { filename, subfolder, type, isVideo? }.
     */
    async function queueAndWait(workflow, onProgress) {
        const clientId = 'as-adventurer-' + Math.random().toString(36).slice(2);

        const queueResp = await comfyFetch('/prompt', {
            method: 'POST',
            body: { prompt: workflow, client_id: clientId }
        });

        if (!queueResp.ok) {
            const err = await queueResp.json().catch(() => ({}));
            let msg;
            if (err.node_errors && typeof err.node_errors === 'object') {
                msg = Object.entries(err.node_errors)
                    .map(([id, e]) => `node ${id}: ${e.message || JSON.stringify(e)}`)
                    .join('; ')
                    .slice(0, 500);
            } else {
                msg = err.error
                    ? (typeof err.error === 'string' ? err.error : JSON.stringify(err.error).slice(0, 400))
                    : `Queue failed (${queueResp.status})`;
            }
            throw new Error(msg);
        }

        const queueData = await queueResp.json();
        const promptId = queueData.prompt_id;
        if (!promptId) throw new Error('No prompt_id from ComfyUI');

        onProgress?.({ stage: 'queued', promptId });

        const maxAttempts = 240; // ~20 min at 5s (LTX can be slow on Arc)
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 5000));
            onProgress?.({ stage: 'polling', attempt: i + 1, promptId });

            const histResp = await comfyFetch(`/history/${promptId}`);
            if (!histResp.ok) continue;

            const hist = await histResp.json();
            const entry = hist[promptId];
            if (!entry) continue;

            if (entry.status?.status_str === 'error') {
                throw new Error('ComfyUI workflow error: ' + JSON.stringify(entry.status).slice(0, 300));
            }

            const outputs = entry.outputs;
            if (outputs) {
                const images = [];
                for (const nodeId of Object.keys(outputs)) {
                    const o = outputs[nodeId];
                    if (o.images) {
                        for (const img of o.images) images.push(img);
                    }
                    if (o.gifs) {
                        for (const g of o.gifs) images.push({ ...g, isVideo: true });
                    }
                    if (o.videos) {
                        for (const v of o.videos) images.push({ ...v, isVideo: true });
                    }
                }
                if (images.length > 0) {
                    onProgress?.({ stage: 'done', count: images.length });
                    return images;
                }
            }
        }

        throw new Error('ComfyUI generation timed out');
    }

    async function fetchOutput(fileInfo) {
        const qs = new URLSearchParams({
            filename: fileInfo.filename,
            subfolder: fileInfo.subfolder || '',
            type: fileInfo.type || 'output'
        });

        const resp = await comfyFetch('/view?' + qs.toString(), { isBinary: true });
        if (!resp.ok) throw new Error(`Failed to fetch ComfyUI output: ${resp.status}`);

        const blob = await resp.blob();
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const isVideo =
            !!fileInfo.isVideo ||
            /\.(mp4|webm|gif|mkv)$/i.test(fileInfo.filename || '');

        return { blob, dataUrl, isVideo };
    }

    /**
     * Generate one sprite image (Pony V6 XL default).
     * @returns data URL (png)
     */
    async function generateSprite({ prompt, negative, width, height, seed, onProgress }) {
        const workflow = buildSpriteWorkflow({
            prompt,
            negative,
            width: width || DEFAULT_SPRITE_W,
            height: height || DEFAULT_SPRITE_H,
            seed,
            checkpoint: getCheckpoint()
        });

        const outputs = await queueAndWait(workflow, onProgress);
        const img = outputs.find(o => !o.isVideo) || outputs[0];
        if (!img) throw new Error('No image in ComfyUI output');

        const result = await fetchOutput(img);
        return result.dataUrl;
    }

    /**
     * Image-to-video using LTX-Video + ICLoRA pose model.
     *
     * Requires ComfyUI custom nodes:
     *   - ComfyUI-LTXVideo (Lightricks) or compatible LTX pack
     *   - ComfyUI-VideoHelperSuite (VHS_VideoCombine) for mp4 output
     *
     * Model file (settings): LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors
     * Place per your node pack docs (often models/checkpoints or models/loras).
     *
     * This graph uses widely published LTXV* class_types. If your pack uses
     * different names, ComfyUI will return a clear node error — install the
     * matching ComfyUI-LTXVideo version or adjust class_types.
     */
    function buildLtxVideoWorkflow({ prompt, imageName, frames, width, height }) {
        const modelName = getVideoModel();
        const seed = Math.floor(Math.random() * 2 ** 32);
        const w = width || 768;
        const h = height || 512;
        // LTX prefers multiples of 32; keep short idle clips
        const frameCount = Math.min(97, Math.max(25, frames || 49));

        const pos = (prompt || 'subtle idle breathing, locked camera, seamless loop') +
            ', static camera, no zoom, no pan, character only moves slightly';
        const neg = 'camera move, zoom, pan, blur, morphing, low quality, watermark, text';

        // Graph oriented around ComfyUI-LTXVideo common nodes + VHS
        // Loaders may accept the ICLoRA / distilled file as checkpoint depending on pack.
        return {
            '1': {
                class_type: 'CheckpointLoaderSimple',
                inputs: { ckpt_name: modelName }
            },
            '2': {
                class_type: 'LoadImage',
                inputs: { image: imageName }
            },
            '3': {
                class_type: 'CLIPTextEncode',
                inputs: { text: pos, clip: ['1', 1] }
            },
            '4': {
                class_type: 'CLIPTextEncode',
                inputs: { text: neg, clip: ['1', 1] }
            },
            // Encode first frame → latent; many LTX img2vid graphs start this way
            '5': {
                class_type: 'VAEEncode',
                inputs: { pixels: ['2', 0], vae: ['1', 2] }
            },
            // Stretch single latent into a short temporal batch via RepeatLatentBatch if available;
            // if node missing, ComfyUI errors with install hint.
            '6': {
                class_type: 'RepeatLatentBatch',
                inputs: { samples: ['5', 0], amount: frameCount }
            },
            '7': {
                class_type: 'KSampler',
                inputs: {
                    seed,
                    steps: 20,
                    cfg: 3.5,
                    sampler_name: 'euler',
                    scheduler: 'normal',
                    denoise: 0.65,
                    model: ['1', 0],
                    positive: ['3', 0],
                    negative: ['4', 0],
                    latent_image: ['6', 0]
                }
            },
            '8': {
                class_type: 'VAEDecode',
                inputs: { samples: ['7', 0], vae: ['1', 2] }
            },
            // Video Helper Suite — produces mp4/gif in history outputs
            '9': {
                class_type: 'VHS_VideoCombine',
                inputs: {
                    images: ['8', 0],
                    frame_rate: 16,
                    loop_count: 0,
                    filename_prefix: 'ASAdventurer_ltx',
                    format: 'video/h264-mp4',
                    pingpong: false,
                    save_output: true
                }
            }
        };
    }

    async function generateVideo({ prompt, imageDataUrl, duration, onProgress }) {
        onProgress?.({ stage: 'upload' });
        const uploadResp = await fetch('/api/comfyui/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: getBaseUrl(),
                image: imageDataUrl,
                filename: 'as_ref_' + Date.now() + '.png'
            })
        });

        if (!uploadResp.ok) {
            const err = await uploadResp.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to upload image to ComfyUI');
        }

        const uploadData = await uploadResp.json();
        const uploadedName = uploadData.name || uploadData.filename;
        if (!uploadedName) throw new Error('ComfyUI upload returned no filename');

        // ~16 fps idle length from duration slider
        const frames = Math.min(97, Math.max(25, Math.round((duration || 5) * 16)));

        const workflow = buildLtxVideoWorkflow({
            prompt: prompt || 'subtle idle breathing animation, locked camera, seamless loop',
            imageName: uploadedName,
            frames
        });

        const outputs = await queueAndWait(workflow, onProgress);
        const vid =
            outputs.find(o => o.isVideo || /\.(mp4|webm|gif|mkv)$/i.test(o.filename || '')) ||
            outputs[0];
        if (!vid) throw new Error('No video in ComfyUI output');

        const result = await fetchOutput(vid);
        return { blob: result.blob, url: URL.createObjectURL(result.blob) };
    }

    window.ComfyUIClient = {
        getBaseUrl,
        setBaseUrl,
        getCheckpoint,
        setCheckpoint,
        getVideoModel,
        setVideoModel,
        testConnection,
        generateSprite,
        generateVideo,
        DEFAULT_URL,
        DEFAULT_CKPT,
        DEFAULT_VIDEO_MODEL,
        DEFAULT_SPRITE_W,
        DEFAULT_SPRITE_H
    };

    console.log('[ComfyUI] Client ready (Pony V6 XL + LTX ICLoRA)');
})();
