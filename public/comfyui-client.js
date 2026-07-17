/**
 * AS Adventurer — ComfyUI Local Client
 *
 * Sprites  — Pony Diffusion V6 XL @ 1216×832 + optional IP-Adapter
 * Video    — baseline img2vid via SDXL checkpoint + VHS_VideoCombine
 *
 * NOTE: LTX-Video-ICLoRA-pose-13b is an IC-LoRA, NOT a full checkpoint.
 * CheckpointLoaderSimple only accepts files that appear in
 * ComfyUI/models/checkpoints/. Put a real SDXL (or LTX base) filename
 * in Settings → Video model.
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
    // Baseline video uses the same class of file as sprites (must be in checkpoints/)
    const DEFAULT_VIDEO_MODEL = 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
    const DEFAULT_IPADAPTER = 'ip-adapter-plus-face_sdxl_vit-h.safetensors';
    const DEFAULT_CLIPVISION = 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';
    const DEFAULT_IP_WEIGHT = 0.55;

    const DEFAULT_SPRITE_W = 1216;
    const DEFAULT_SPRITE_H = 832;

    // RepeatLatentBatch in stock ComfyUI maxes at 64
    const MAX_VIDEO_FRAMES = 64;

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
        var v = localStorage.getItem(STORAGE_VIDEO) || DEFAULT_VIDEO_MODEL;
        // Migrate old invalid default that is an IC-LoRA, not a checkpoint
        if (/LTX-Video-ICLoRA/i.test(v)) {
            console.warn('[ComfyUI] Video model was set to an IC-LoRA filename; using sprite checkpoint instead. Set a real checkpoints/ file in Settings.');
            return getCheckpoint();
        }
        return v;
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

    async function comfyFetch(path, options) {
        options = options || {};
        const resp = await fetch('/api/comfyui/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: getBaseUrl(),
                path: path,
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
            const err = await resp.json().catch(function () { return {}; });
            throw new Error(err.error || 'ComfyUI unreachable (' + resp.status + ')');
        }
        return resp.json();
    }

    /** List checkpoint filenames ComfyUI can load (best-effort). */
    async function listCheckpoints() {
        try {
            // ComfyUI exposes model lists at /models/{folder}
            var resp = await comfyFetch('/models/checkpoints');
            if (!resp.ok) return [];
            var data = await resp.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

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
            const err = await uploadResp.json().catch(function () { return {}; });
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

    function formatNodeErrors(err) {
        if (!err || !err.node_errors || typeof err.node_errors !== 'object') {
            if (err && err.error) {
                return typeof err.error === 'string' ? err.error : JSON.stringify(err.error).slice(0, 400);
            }
            return null;
        }

        return Object.entries(err.node_errors)
            .map(function (entry) {
                var id = entry[0];
                var e = entry[1];
                var errors = e.errors || [];
                var parts = errors.map(function (item) {
                    var type = item.type || '';
                    var details = item.details || item.message || '';
                    if (type === 'value_not_in_list' && /ckpt_name/i.test(details)) {
                        return (
                            'Checkpoint not found: ' + details +
                            '. Open Settings → ComfyUI → Video model and pick an exact filename from ComfyUI/models/checkpoints/ ' +
                            '(LTX-Video-ICLoRA-* is a LoRA, not a checkpoint — use a real SDXL/LTX base .safetensors instead, e.g. your Pony file).'
                        );
                    }
                    if (type === 'value_bigger_than_max') {
                        return details + ' (capped internally on next run)';
                    }
                    return details || item.message || JSON.stringify(item);
                });
                if (!parts.length) {
                    parts.push(e.message || e.exception_message || JSON.stringify(e).slice(0, 200));
                }
                return 'node ' + id + ': ' + parts.join(' | ');
            })
            .join('; ')
            .slice(0, 800);
    }

    function buildSpriteWorkflowT2I(opts) {
        var ckpt = opts.checkpoint || getCheckpoint();
        var w = opts.width || DEFAULT_SPRITE_W;
        var h = opts.height || DEFAULT_SPRITE_H;
        var s = opts.seed == null ? Math.floor(Math.random() * Math.pow(2, 32)) : opts.seed;

        console.log('[ComfyUI] T2I checkpoint:', ckpt, w + 'x' + h);

        return {
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
            '2': { class_type: 'CLIPTextEncode', inputs: { text: opts.prompt, clip: ['1', 1] } },
            '3': { class_type: 'CLIPTextEncode', inputs: { text: ponyNegative(opts.negative, false), clip: ['1', 1] } },
            '4': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
            '5': {
                class_type: 'KSampler',
                inputs: {
                    seed: s, steps: opts.steps || 25, cfg: opts.cfg || 7,
                    sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1,
                    model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0]
                }
            },
            '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
            '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'ASAdventurer_sprite', images: ['6', 0] } }
        };
    }

    function buildSpriteWorkflowIPAdapter(opts) {
        var ckpt = opts.checkpoint || getCheckpoint();
        var w = opts.width || DEFAULT_SPRITE_W;
        var h = opts.height || DEFAULT_SPRITE_H;
        var s = opts.seed == null ? Math.floor(Math.random() * Math.pow(2, 32)) : opts.seed;
        var weight = opts.ipWeight == null ? getIpAdapterWeight() : opts.ipWeight;

        console.log('[ComfyUI] IP-Adapter checkpoint:', ckpt, '| weight:', weight);

        return {
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
            '2': { class_type: 'LoadImage', inputs: { image: opts.imageName } },
            '3': { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: getIpAdapterModel() } },
            '4': { class_type: 'CLIPVisionLoader', inputs: { clip_name: getClipVisionModel() } },
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
            '6': { class_type: 'CLIPTextEncode', inputs: { text: opts.prompt, clip: ['1', 1] } },
            '7': { class_type: 'CLIPTextEncode', inputs: { text: ponyNegative(opts.negative, true), clip: ['1', 1] } },
            '8': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
            '9': {
                class_type: 'KSampler',
                inputs: {
                    seed: s, steps: opts.steps || 28, cfg: opts.cfg || 7.5,
                    sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1,
                    model: ['5', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0]
                }
            },
            '10': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['1', 2] } },
            '11': { class_type: 'SaveImage', inputs: { filename_prefix: 'ASAdventurer_sprite_ipa', images: ['10', 0] } }
        };
    }

    async function queueAndWait(workflow, onProgress) {
        var clientId = 'as-adventurer-' + Math.random().toString(36).slice(2);

        var queueResp = await comfyFetch('/prompt', {
            method: 'POST',
            body: { prompt: workflow, client_id: clientId }
        });

        if (!queueResp.ok) {
            var err = await queueResp.json().catch(function () { return {}; });
            var msg = formatNodeErrors(err) || ('Queue failed (' + queueResp.status + ')');
            throw new Error(msg);
        }

        var queueData = await queueResp.json();
        var promptId = queueData.prompt_id;
        if (!promptId) throw new Error('No prompt_id from ComfyUI');

        onProgress && onProgress({ stage: 'queued', promptId: promptId });

        for (var i = 0; i < 240; i++) {
            await new Promise(function (r) { setTimeout(r, 5000); });
            onProgress && onProgress({ stage: 'polling', attempt: i + 1, promptId: promptId });

            var histResp = await comfyFetch('/history/' + promptId);
            if (!histResp.ok) continue;

            var hist = await histResp.json();
            var entry = hist[promptId];
            if (!entry) continue;

            if (entry.status && entry.status.status_str === 'error') {
                throw new Error('ComfyUI workflow error: ' + JSON.stringify(entry.status).slice(0, 300));
            }

            var outputs = entry.outputs;
            if (outputs) {
                var images = [];
                Object.keys(outputs).forEach(function (nodeId) {
                    var o = outputs[nodeId];
                    if (o.images) o.images.forEach(function (img) { images.push(img); });
                    if (o.gifs) o.gifs.forEach(function (g) { images.push(Object.assign({}, g, { isVideo: true })); });
                    if (o.videos) o.videos.forEach(function (v) { images.push(Object.assign({}, v, { isVideo: true })); });
                });
                if (images.length > 0) {
                    onProgress && onProgress({ stage: 'done', count: images.length });
                    return images;
                }
            }
        }

        throw new Error('ComfyUI generation timed out');
    }

    async function fetchOutput(fileInfo) {
        var qs = new URLSearchParams({
            filename: fileInfo.filename,
            subfolder: fileInfo.subfolder || '',
            type: fileInfo.type || 'output'
        });

        var resp = await comfyFetch('/view?' + qs.toString(), { isBinary: true });
        if (!resp.ok) throw new Error('Failed to fetch ComfyUI output: ' + resp.status);

        var blob = await resp.blob();
        var dataUrl = await new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        var isVideo =
            !!fileInfo.isVideo ||
            /\.(mp4|webm|gif|mkv)$/i.test(fileInfo.filename || '');

        return { blob: blob, dataUrl: dataUrl, isVideo: isVideo };
    }

    async function generateSprite(opts) {
        opts = opts || {};
        var ckpt = getCheckpoint();
        var workflow;

        if (opts.referenceImageDataUrl) {
            opts.onProgress && opts.onProgress({ stage: 'upload', checkpoint: ckpt });
            var squared = await squareCropDataUrl(opts.referenceImageDataUrl, 512);
            var imageName = await uploadImage(squared, 'as_char_ref_' + Date.now() + '.png');
            opts.onProgress && opts.onProgress({ stage: 'ipadapter', imageName: imageName, checkpoint: ckpt });
            workflow = buildSpriteWorkflowIPAdapter({
                prompt: opts.prompt,
                negative: opts.negative,
                width: opts.width || DEFAULT_SPRITE_W,
                height: opts.height || DEFAULT_SPRITE_H,
                seed: opts.seed,
                checkpoint: ckpt,
                imageName: imageName,
                ipWeight: opts.ipWeight
            });
        } else {
            opts.onProgress && opts.onProgress({ stage: 't2i', checkpoint: ckpt });
            workflow = buildSpriteWorkflowT2I({
                prompt: opts.prompt,
                negative: opts.negative,
                width: opts.width || DEFAULT_SPRITE_W,
                height: opts.height || DEFAULT_SPRITE_H,
                seed: opts.seed,
                checkpoint: ckpt
            });
        }

        var outputs = await queueAndWait(workflow, opts.onProgress);
        var img = outputs.find(function (o) { return !o.isVideo; }) || outputs[0];
        if (!img) throw new Error('No image in ComfyUI output');
        return (await fetchOutput(img)).dataUrl;
    }

    /**
     * Baseline image-to-video:
     * encode ref → repeat latent frames (max 64) → light img2img → VHS mp4.
     * Requires a real checkpoint filename + Video Helper Suite.
     */
    function buildBaselineVideoWorkflow(opts) {
        var modelName = opts.modelName || getVideoModel();
        var seed = Math.floor(Math.random() * Math.pow(2, 32));
        // Hard cap at RepeatLatentBatch max
        var frameCount = Math.min(MAX_VIDEO_FRAMES, Math.max(16, opts.frames || 48));

        var pos = (opts.prompt || 'subtle idle breathing, locked camera, seamless loop') +
            ', static camera, no zoom, no pan, character only moves slightly, anime style';
        var neg = 'camera move, zoom, pan, blur, morphing, low quality, watermark, text, photorealistic';

        console.log('[ComfyUI] Video checkpoint:', modelName, '| frames:', frameCount);

        return {
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: modelName } },
            '2': { class_type: 'LoadImage', inputs: { image: opts.imageName } },
            '3': { class_type: 'CLIPTextEncode', inputs: { text: pos, clip: ['1', 1] } },
            '4': { class_type: 'CLIPTextEncode', inputs: { text: neg, clip: ['1', 1] } },
            '5': { class_type: 'VAEEncode', inputs: { pixels: ['2', 0], vae: ['1', 2] } },
            '6': { class_type: 'RepeatLatentBatch', inputs: { samples: ['5', 0], amount: frameCount } },
            '7': {
                class_type: 'KSampler',
                inputs: {
                    seed: seed, steps: 20, cfg: 3.5,
                    sampler_name: 'euler', scheduler: 'normal', denoise: 0.45,
                    model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['6', 0]
                }
            },
            '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['1', 2] } },
            '9': {
                class_type: 'VHS_VideoCombine',
                inputs: {
                    images: ['8', 0],
                    frame_rate: 12,
                    loop_count: 0,
                    filename_prefix: 'ASAdventurer_vid',
                    format: 'video/h264-mp4',
                    pingpong: false,
                    save_output: true
                }
            }
        };
    }

    async function generateVideo(opts) {
        opts = opts || {};
        var onProgress = opts.onProgress;
        onProgress && onProgress({ stage: 'upload' });

        var modelName = getVideoModel();
        // Guard: never send known IC-LoRA names into CheckpointLoaderSimple
        if (/ICLoRA|ic-lora/i.test(modelName)) {
            modelName = getCheckpoint();
            console.warn('[ComfyUI] Rejected IC-LoRA as video checkpoint; using', modelName);
        }

        var uploadedName = await uploadImage(opts.imageDataUrl, 'as_vid_ref_' + Date.now() + '.png');

        // ~12 fps, hard-capped at 64 frames (RepeatLatentBatch limit)
        var frames = Math.min(
            MAX_VIDEO_FRAMES,
            Math.max(16, Math.round((opts.duration || 5) * 12))
        );

        var workflow = buildBaselineVideoWorkflow({
            prompt: opts.prompt || 'subtle idle breathing animation, locked camera, seamless loop',
            imageName: uploadedName,
            frames: frames,
            modelName: modelName
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
        listCheckpoints: listCheckpoints,
        generateSprite: generateSprite,
        generateVideo: generateVideo,
        DEFAULT_URL: DEFAULT_URL,
        DEFAULT_CKPT: DEFAULT_CKPT,
        DEFAULT_VIDEO_MODEL: DEFAULT_VIDEO_MODEL,
        DEFAULT_IPADAPTER: DEFAULT_IPADAPTER,
        DEFAULT_CLIPVISION: DEFAULT_CLIPVISION,
        DEFAULT_IP_WEIGHT: DEFAULT_IP_WEIGHT,
        DEFAULT_SPRITE_W: DEFAULT_SPRITE_W,
        DEFAULT_SPRITE_H: DEFAULT_SPRITE_H,
        MAX_VIDEO_FRAMES: MAX_VIDEO_FRAMES
    };

    console.log('[ComfyUI] Client ready (Pony + IP-Adapter + baseline video)');
})();
