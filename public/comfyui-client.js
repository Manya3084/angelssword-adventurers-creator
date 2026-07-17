/**
 * AS Adventurer — ComfyUI Local Client
 *
 * Sprites  — Pony Diffusion V6 XL @ 1216×832
 *            + optional IP-Adapter (character identity, style-preserving defaults)
 * Video    — LTX-Video-ICLoRA-pose-13b-0.9.7
 */

(function () {
    'use strict';

    const DEFAULT_URL = 'http://127.0.0.1:8188';
    const STORAGE_URL = 'comfyui_base_url';
    const STORAGE_CKPT = 'comfyui_checkpoint';
    const STORAGE_VIDEO = 'comfyui_video_model';
    const STORAGE_IPADAPTER = 'comfyui_ipadapter_model';
    const STORAGE_CLIPVISION = 'comfyui_clip_vision_model';
    const STORAGE_IP_WEIGHT = 'comfyui_ipadapter_weight';

    const DEFAULT_CKPT = 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
    const DEFAULT_VIDEO_MODEL = 'LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors';
    const DEFAULT_IPADAPTER = 'ip-adapter-plus-face_sdxl_vit-h.safetensors';
    const DEFAULT_CLIPVISION = 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';
    // Lower default so Pony anime style wins; raise in Settings for stronger likeness
    const DEFAULT_IP_WEIGHT = 0.55;

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
    function getIpAdapterModel() {
        return localStorage.getItem(STORAGE_IPADAPTER) || DEFAULT_IPADAPTER;
    }
    function setIpAdapterModel(name) {
        localStorage.setItem(STORAGE_IPADAPTER, name || DEFAULT_IPADAPTER);
    }
    function getClipVisionModel() {
        return localStorage.getItem(STORAGE_CLIPVISION) || DEFAULT_CLIPVISION;
    }
    function setClipVisionModel(name) {
        localStorage.setItem(STORAGE_CLIPVISION, name || DEFAULT_CLIPVISION);
    }
    function getIpAdapterWeight() {
        const v = parseFloat(localStorage.getItem(STORAGE_IP_WEIGHT));
        if (Number.isFinite(v) && v >= 0 && v <= 2) return v;
        return DEFAULT_IP_WEIGHT;
    }
    function setIpAdapterWeight(w) {
        const n = parseFloat(w);
        localStorage.setItem(
            STORAGE_IP_WEIGHT,
            String(Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : DEFAULT_IP_WEIGHT)
        );
    }

    async function comfyFetch(path, options = {}) {
        const resp = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: getBaseUrl(),
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
     * Center-crop to square then resize — avoids CLIP center-crop surprises
     * and the non-square IP-Adapter warning.
     */
    function squareCropDataUrl(dataUrl, size) {
        size = size || 512;
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                var side = Math.min(img.naturalWidth, img.naturalHeight);
                var sx = Math.floor((img.naturalWidth - side) / 2);
                var sy = Math.floor((img.naturalHeight - side) / 2);
                var canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = function () { reject(new Error('Failed to process character reference image')); };
            img.src = dataUrl;
        });
    }

    async function uploadImage(imageDataUrl, filename) {
        const uploadResp = await fetch('/api/comfyui/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: getBaseUrl(),
                image: imageDataUrl,
                filename: filename || ('as_ref_' + Date.now() + '.png')
            })
        });
        if (!uploadResp.ok) {
            const err = await uploadResp.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to upload image to ComfyUI');
        }
        const data = await uploadResp.json();
        const name = data.name || data.filename;
        if (!name) throw new Error('ComfyUI upload returned no filename');
        return name;
    }

    function ponyNegative(negative, forIpAdapter) {
        if (negative) return negative;
        var base = [
            'score_4, score_5, score_6,',
            'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit,',
            'fewer digits, cropped, worst quality, low quality, jpeg artifacts,',
            'signature, watermark, username, blurry, gradient background,',
            'detailed background, scenery'
        ];
        // Push hard away from photo style when IP-Adapter might pull realism from the ref
        if (forIpAdapter) {
            base.push(
                'photorealistic, realistic, photo, 3d, cgi, western comic,',
                'realistic skin texture, pores, freckles photo'
            );
        } else {
            base.push('3d, realistic');
        }
        return base.join(' ');
    }

    function buildSpriteWorkflowT2I({ prompt, negative, width, height, seed, steps, cfg, checkpoint }) {
        const ckpt = checkpoint || getCheckpoint();
        const w = width || DEFAULT_SPRITE_W;
        const h = height || DEFAULT_SPRITE_H;
        const s = seed == null ? Math.floor(Math.random() * 2 ** 32) : seed;

        console.log('[ComfyUI] T2I checkpoint:', ckpt, w + 'x' + h);

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
                inputs: { text: ponyNegative(negative, false), clip: ['1', 1] }
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
     * IP-Adapter + Pony — identity early, Pony style late.
     * end_at < 1 lets the checkpoint finish the anime look without the ref overpowering it.
     */
    function buildSpriteWorkflowIPAdapter({
        prompt,
        negative,
        width,
        height,
        seed,
        steps,
        cfg,
        checkpoint,
        imageName,
        ipWeight
    }) {
        const ckpt = checkpoint || getCheckpoint();
        const w = width || DEFAULT_SPRITE_W;
        const h = height || DEFAULT_SPRITE_H;
        const s = seed == null ? Math.floor(Math.random() * 2 ** 32) : seed;
        const weight = ipWeight == null ? getIpAdapterWeight() : ipWeight;

        console.log(
            '[ComfyUI] IP-Adapter checkpoint:', ckpt,
            '| ipadapter:', getIpAdapterModel(),
            '| weight:', weight,
            '| end_at: 0.65'
        );

        return {
            '1': {
                class_type: 'CheckpointLoaderSimple',
                inputs: { ckpt_name: ckpt }
            },
            '2': {
                class_type: 'LoadImage',
                inputs: { image: imageName }
            },
            '3': {
                class_type: 'IPAdapterModelLoader',
                inputs: { ipadapter_file: getIpAdapterModel() }
            },
            '4': {
                class_type: 'CLIPVisionLoader',
                inputs: { clip_name: getClipVisionModel() }
            },
            // Identity early (0–65% of steps), then pure Pony finishes the style
            '5': {
                class_type: 'IPAdapterAdvanced',
                inputs: {
                    model: ['1', 0],
                    ipadapter: ['3', 0],
                    image: ['2', 0],
                    clip_vision: ['4', 0],
                    weight: weight,
                    weight_type: 'ease out',
                    combine_embeds: 'concat',
                    start_at: 0.0,
                    end_at: 0.65,
                    embeds_scaling: 'V only'
                }
            },
            '6': {
                class_type: 'CLIPTextEncode',
                inputs: { text: prompt, clip: ['1', 1] }
            },
            '7': {
                class_type: 'CLIPTextEncode',
                inputs: { text: ponyNegative(negative, true), clip: ['1', 1] }
            },
            '8': {
                class_type: 'EmptyLatentImage',
                inputs: { width: w, height: h, batch_size: 1 }
            },
            '9': {
                class_type: 'KSampler',
                inputs: {
                    seed: s,
                    steps: steps || 28,
                    cfg: cfg || 7.5,
                    sampler_name: 'euler_ancestral',
                    scheduler: 'normal',
                    denoise: 1,
                    model: ['5', 0],
                    positive: ['6', 0],
                    negative: ['7', 0],
                    latent_image: ['8', 0]
                }
            },
            '10': {
                class_type: 'VAEDecode',
                inputs: { samples: ['9', 0], vae: ['1', 2] }
            },
            '11': {
                class_type: 'SaveImage',
                inputs: { filename_prefix: 'ASAdventurer_sprite_ipa', images: ['10', 0] }
            }
        };
    }

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
                    .map(([id, e]) => {
                        const m = e.message || e.exception_message || JSON.stringify(e);
                        if (/IPAdapter|CLIPVision/i.test(m) || /node.*not found/i.test(m)) {
                            return 'node ' + id + ': ' + m +
                                ' — install ComfyUI_IPAdapter_plus and place SDXL IP-Adapter + CLIP Vision weights';
                        }
                        // weight_type enum mismatch — fall back hint
                        if (/weight_type|ease out|invalid/i.test(m)) {
                            return 'node ' + id + ': ' + m +
                                ' — update ComfyUI_IPAdapter_plus or change weight_type';
                        }
                        return 'node ' + id + ': ' + m;
                    })
                    .join('; ')
                    .slice(0, 600);
            } else {
                msg = err.error
                    ? (typeof err.error === 'string' ? err.error : JSON.stringify(err.error).slice(0, 400))
                    : 'Queue failed (' + queueResp.status + ')';
            }
            throw new Error(msg);
        }

        const queueData = await queueResp.json();
        const promptId = queueData.prompt_id;
        if (!promptId) throw new Error('No prompt_id from ComfyUI');

        onProgress && onProgress({ stage: 'queued', promptId: promptId });

        const maxAttempts = 240;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(function (r) { setTimeout(r, 5000); });
            onProgress && onProgress({ stage: 'polling', attempt: i + 1, promptId: promptId });

            const histResp = await comfyFetch('/history/' + promptId);
            if (!histResp.ok) continue;

            const hist = await histResp.json();
            const entry = hist[promptId];
            if (!entry) continue;

            if (entry.status && entry.status.status_str === 'error') {
                throw new Error('ComfyUI workflow error: ' + JSON.stringify(entry.status).slice(0, 300));
            }

            const outputs = entry.outputs;
            if (outputs) {
                const images = [];
                for (const nodeId of Object.keys(outputs)) {
                    const o = outputs[nodeId];
                    if (o.images) for (const img of o.images) images.push(img);
                    if (o.gifs) for (const g of o.gifs) images.push(Object.assign({}, g, { isVideo: true }));
                    if (o.videos) for (const v of o.videos) images.push(Object.assign({}, v, { isVideo: true }));
                }
                if (images.length > 0) {
                    onProgress && onProgress({ stage: 'done', count: images.length });
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
        if (!resp.ok) throw new Error('Failed to fetch ComfyUI output: ' + resp.status);

        const blob = await resp.blob();
        const dataUrl = await new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const isVideo =
            !!fileInfo.isVideo ||
            /\.(mp4|webm|gif|mkv)$/i.test(fileInfo.filename || '');

        return { blob: blob, dataUrl: dataUrl, isVideo: isVideo };
    }

    async function generateSprite(opts) {
        opts = opts || {};
        var prompt = opts.prompt;
        var negative = opts.negative;
        var width = opts.width;
        var height = opts.height;
        var seed = opts.seed;
        var referenceImageDataUrl = opts.referenceImageDataUrl;
        var ipWeight = opts.ipWeight;
        var onProgress = opts.onProgress;

        var workflow;
        var ckpt = getCheckpoint();

        if (referenceImageDataUrl) {
            onProgress && onProgress({ stage: 'upload', checkpoint: ckpt });
            // Square crop so CLIP doesn't random-center-crop a wide sprite sheet
            var squared = await squareCropDataUrl(referenceImageDataUrl, 512);
            var imageName = await uploadImage(squared, 'as_char_ref_' + Date.now() + '.png');
            onProgress && onProgress({ stage: 'ipadapter', imageName: imageName, checkpoint: ckpt });
            workflow = buildSpriteWorkflowIPAdapter({
                prompt: prompt,
                negative: negative,
                width: width || DEFAULT_SPRITE_W,
                height: height || DEFAULT_SPRITE_H,
                seed: seed,
                checkpoint: ckpt,
                imageName: imageName,
                ipWeight: ipWeight
            });
        } else {
            onProgress && onProgress({ stage: 't2i', checkpoint: ckpt });
            workflow = buildSpriteWorkflowT2I({
                prompt: prompt,
                negative: negative,
                width: width || DEFAULT_SPRITE_W,
                height: height || DEFAULT_SPRITE_H,
                seed: seed,
                checkpoint: ckpt
            });
        }

        var outputs = await queueAndWait(workflow, onProgress);
        var img = outputs.find(function (o) { return !o.isVideo; }) || outputs[0];
        if (!img) throw new Error('No image in ComfyUI output');

        var result = await fetchOutput(img);
        return result.dataUrl;
    }

    function buildLtxVideoWorkflow(opts) {
        var prompt = opts.prompt;
        var imageName = opts.imageName;
        var frames = opts.frames;
        var modelName = getVideoModel();
        var seed = Math.floor(Math.random() * Math.pow(2, 32));
        var frameCount = Math.min(97, Math.max(25, frames || 49));

        var pos = (prompt || 'subtle idle breathing, locked camera, seamless loop') +
            ', static camera, no zoom, no pan, character only moves slightly';
        var neg = 'camera move, zoom, pan, blur, morphing, low quality, watermark, text';

        return {
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: modelName } },
            '2': { class_type: 'LoadImage', inputs: { image: imageName } },
            '3': { class_type: 'CLIPTextEncode', inputs: { text: pos, clip: ['1', 1] } },
            '4': { class_type: 'CLIPTextEncode', inputs: { text: neg, clip: ['1', 1] } },
            '5': { class_type: 'VAEEncode', inputs: { pixels: ['2', 0], vae: ['1', 2] } },
            '6': { class_type: 'RepeatLatentBatch', inputs: { samples: ['5', 0], amount: frameCount } },
            '7': {
                class_type: 'KSampler',
                inputs: {
                    seed: seed, steps: 20, cfg: 3.5,
                    sampler_name: 'euler', scheduler: 'normal', denoise: 0.65,
                    model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['6', 0]
                }
            },
            '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['1', 2] } },
            '9': {
                class_type: 'VHS_VideoCombine',
                inputs: {
                    images: ['8', 0], frame_rate: 16, loop_count: 0,
                    filename_prefix: 'ASAdventurer_ltx', format: 'video/h264-mp4',
                    pingpong: false, save_output: true
                }
            }
        };
    }

    async function generateVideo(opts) {
        opts = opts || {};
        var onProgress = opts.onProgress;
        onProgress && onProgress({ stage: 'upload' });
        var uploadedName = await uploadImage(opts.imageDataUrl, 'as_vid_ref_' + Date.now() + '.png');
        var frames = Math.min(97, Math.max(25, Math.round((opts.duration || 5) * 16)));
        var workflow = buildLtxVideoWorkflow({
            prompt: opts.prompt || 'subtle idle breathing animation, locked camera, seamless loop',
            imageName: uploadedName,
            frames: frames
        });
        var outputs = await queueAndWait(workflow, onProgress);
        var vid = outputs.find(function (o) {
            return o.isVideo || /\.(mp4|webm|gif|mkv)$/i.test(o.filename || '');
        }) || outputs[0];
        if (!vid) throw new Error('No video in ComfyUI output');
        var result = await fetchOutput(vid);
        return { blob: result.blob, url: URL.createObjectURL(result.blob) };
    }

    window.ComfyUIClient = {
        getBaseUrl: getBaseUrl,
        setBaseUrl: setBaseUrl,
        getCheckpoint: getCheckpoint,
        setCheckpoint: setCheckpoint,
        getVideoModel: getVideoModel,
        setVideoModel: setVideoModel,
        getIpAdapterModel: getIpAdapterModel,
        setIpAdapterModel: setIpAdapterModel,
        getClipVisionModel: getClipVisionModel,
        setClipVisionModel: setClipVisionModel,
        getIpAdapterWeight: getIpAdapterWeight,
        setIpAdapterWeight: setIpAdapterWeight,
        testConnection: testConnection,
        generateSprite: generateSprite,
        generateVideo: generateVideo,
        DEFAULT_URL: DEFAULT_URL,
        DEFAULT_CKPT: DEFAULT_CKPT,
        DEFAULT_VIDEO_MODEL: DEFAULT_VIDEO_MODEL,
        DEFAULT_IPADAPTER: DEFAULT_IPADAPTER,
        DEFAULT_CLIPVISION: DEFAULT_CLIPVISION,
        DEFAULT_IP_WEIGHT: DEFAULT_IP_WEIGHT,
        DEFAULT_SPRITE_W: DEFAULT_SPRITE_W,
        DEFAULT_SPRITE_H: DEFAULT_SPRITE_H
    };

    console.log('[ComfyUI] Client ready (Pony + style-preserving IP-Adapter + LTX)');
})();
