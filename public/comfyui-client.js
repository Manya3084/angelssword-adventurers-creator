/**
 * AS Adventurer — ComfyUI Local Client
 *
 * Sprites — Pony V6 XL @ 1216×832 + optional IP-Adapter
 * Video  — sequential single-frame img2img (batch=1) then VHS combine
 *
 * Intel Arc Level Zero OOMs on RepeatLatentBatch * SDXL even with 128GB RAM.
 * Never sample more than 1 latent at a time on XPU.
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
    const DEFAULT_VIDEO_MODEL = 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
    const DEFAULT_IPADAPTER = 'ip-adapter-plus-face_sdxl_vit-h.safetensors';
    const DEFAULT_CLIPVISION = 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';
    const DEFAULT_IP_WEIGHT = 0.55;

    const DEFAULT_SPRITE_W = 1216;
    const DEFAULT_SPRITE_H = 832;

    // Sequential frames (each sampled alone). 4 frames @ 8fps ≈ 0.5s loop
    const VIDEO_FRAME_COUNT = 4;
    const VIDEO_WIDTH = 640;
    const VIDEO_HEIGHT = 448;
    const VIDEO_FPS = 8;

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
        if (/LTX-Video-ICLoRA/i.test(v)) return getCheckpoint();
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
        return fetch('/api/comfyui/proxy', {
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
    }

    async function testConnection() {
        const resp = await comfyFetch('/system_stats');
        if (!resp.ok) {
            const err = await resp.json().catch(function () { return {}; });
            throw new Error(err.error || 'ComfyUI unreachable (' + resp.status + ')');
        }
        return resp.json();
    }

    async function listCheckpoints() {
        try {
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
                canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
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
            base.push('photorealistic, realistic, photo, 3d, cgi, western comic, realistic skin texture');
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
                    var details = item.details || item.message || '';
                    if (item.type === 'value_not_in_list' && /ckpt_name/i.test(details)) {
                        return 'Checkpoint not found: ' + details +
                            '. Use exact filename from ComfyUI/models/checkpoints/ (not IC-LoRA).';
                    }
                    return details || JSON.stringify(item);
                });
                if (!parts.length) parts.push(e.message || JSON.stringify(e).slice(0, 200));
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
                    model: ['1', 0], ipadapter: ['3', 0], image: ['2', 0], clip_vision: ['4', 0],
                    weight: weight, weight_type: 'ease out', combine_embeds: 'concat',
                    start_at: 0.0, end_at: 0.65, embeds_scaling: 'V only'
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

    /** One frame only — never batch SDXL latents on Arc. */
    function buildSingleFrameImg2Img(opts) {
        var modelName = opts.modelName || getVideoModel();
        var seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * Math.pow(2, 32));
        var pos = (opts.prompt || 'subtle idle breathing, locked camera') +
            ', static camera, subtle motion, anime style';
        var neg = 'camera move, zoom, pan, blur, morphing, low quality, watermark, photorealistic';

        return {
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: modelName } },
            '2': { class_type: 'LoadImage', inputs: { image: opts.imageName } },
            '3': {
                class_type: 'ImageScale',
                inputs: {
                    image: ['2', 0],
                    upscale_method: 'bilinear',
                    width: VIDEO_WIDTH,
                    height: VIDEO_HEIGHT,
                    crop: 'center'
                }
            },
            '4': { class_type: 'CLIPTextEncode', inputs: { text: pos, clip: ['1', 1] } },
            '5': { class_type: 'CLIPTextEncode', inputs: { text: neg, clip: ['1', 1] } },
            '6': { class_type: 'VAEEncode', inputs: { pixels: ['3', 0], vae: ['1', 2] } },
            '7': {
                class_type: 'KSampler',
                inputs: {
                    seed: seed,
                    steps: 10,
                    cfg: 2.5,
                    sampler_name: 'euler',
                    scheduler: 'normal',
                    denoise: 0.28,
                    model: ['1', 0],
                    positive: ['4', 0],
                    negative: ['5', 0],
                    latent_image: ['6', 0]
                }
            },
            '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['1', 2] } },
            '9': {
                class_type: 'SaveImage',
                inputs: { filename_prefix: 'ASAdventurer_vframe', images: ['8', 0] }
            }
        };
    }

    /** Stitch already-generated frame files — no SDXL, low memory. */
    function buildVhsCombineWorkflow(frameNames) {
        var workflow = {};
        var i;
        for (i = 0; i < frameNames.length; i++) {
            workflow[String(10 + i)] = {
                class_type: 'LoadImage',
                inputs: { image: frameNames[i] }
            };
        }
        // Chain ImageBatch: (a,b)->ab, (ab,c)->abc, ...
        var prevId = '10';
        var nextNode = 50;
        for (i = 1; i < frameNames.length; i++) {
            var id = String(nextNode++);
            workflow[id] = {
                class_type: 'ImageBatch',
                inputs: {
                    image1: [prevId, 0],
                    image2: [String(10 + i), 0]
                }
            };
            prevId = id;
        }
        workflow['99'] = {
            class_type: 'VHS_VideoCombine',
            inputs: {
                images: [prevId, 0],
                frame_rate: VIDEO_FPS,
                loop_count: 0,
                filename_prefix: 'ASAdventurer_vid',
                format: 'video/h264-mp4',
                pingpong: false,
                save_output: true
            }
        };
        return workflow;
    }

    async function queueAndWait(workflow, onProgress) {
        var clientId = 'as-adventurer-' + Math.random().toString(36).slice(2);
        var queueResp = await comfyFetch('/prompt', {
            method: 'POST',
            body: { prompt: workflow, client_id: clientId }
        });

        if (!queueResp.ok) {
            var err = await queueResp.json().catch(function () { return {}; });
            throw new Error(formatNodeErrors(err) || ('Queue failed (' + queueResp.status + ')'));
        }

        var queueData = await queueResp.json();
        var promptId = queueData.prompt_id;
        if (!promptId) throw new Error('No prompt_id from ComfyUI');
        onProgress && onProgress({ stage: 'queued', promptId: promptId });

        for (var i = 0; i < 240; i++) {
            await new Promise(function (r) { setTimeout(r, 4000); });
            onProgress && onProgress({ stage: 'polling', attempt: i + 1, promptId: promptId });

            var histResp = await comfyFetch('/history/' + promptId);
            if (!histResp.ok) continue;
            var hist = await histResp.json();
            var entry = hist[promptId];
            if (!entry) continue;

            if (entry.status && entry.status.status_str === 'error') {
                var st = JSON.stringify(entry.status);
                if (/OUT_OF_HOST_MEMORY|out of memory|OOM|level_zero/i.test(st)) {
                    throw new Error(
                        'Arc Level Zero OOM during sample. Restart the ComfyUI container, ensure shm_size is set, ' +
                        'and use the latest client (sequential batch=1 video). Raw: ' + st.slice(0, 180)
                    );
                }
                throw new Error('ComfyUI workflow error: ' + st.slice(0, 300));
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
        var isVideo = !!fileInfo.isVideo || /\.(mp4|webm|gif|mkv)$/i.test(fileInfo.filename || '');
        return { blob: blob, dataUrl: dataUrl, isVideo: isVideo, fileInfo: fileInfo };
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
                prompt: opts.prompt, negative: opts.negative,
                width: opts.width || DEFAULT_SPRITE_W, height: opts.height || DEFAULT_SPRITE_H,
                seed: opts.seed, checkpoint: ckpt, imageName: imageName, ipWeight: opts.ipWeight
            });
        } else {
            opts.onProgress && opts.onProgress({ stage: 't2i', checkpoint: ckpt });
            workflow = buildSpriteWorkflowT2I({
                prompt: opts.prompt, negative: opts.negative,
                width: opts.width || DEFAULT_SPRITE_W, height: opts.height || DEFAULT_SPRITE_H,
                seed: opts.seed, checkpoint: ckpt
            });
        }

        var outputs = await queueAndWait(workflow, opts.onProgress);
        var img = outputs.find(function (o) { return !o.isVideo; }) || outputs[0];
        if (!img) throw new Error('No image in ComfyUI output');
        return (await fetchOutput(img)).dataUrl;
    }

    /**
     * Arc-safe video:
     *  1) Run N independent img2img passes (batch_size = 1 each)
     *  2) Re-upload frames and VHS-combine (no SDXL in that step)
     */
    async function generateVideo(opts) {
        opts = opts || {};
        var onProgress = opts.onProgress;
        var modelName = getVideoModel();
        if (/ICLoRA|ic-lora/i.test(modelName)) modelName = getCheckpoint();

        onProgress && onProgress({ stage: 'upload' });
        var baseName = await uploadImage(opts.imageDataUrl, 'as_vid_ref_' + Date.now() + '.png');

        var frameCount = VIDEO_FRAME_COUNT;
        var frameFiles = [];
        var baseSeed = Math.floor(Math.random() * Math.pow(2, 32));

        console.log('[ComfyUI] Sequential video:', frameCount, 'frames @', VIDEO_WIDTH + 'x' + VIDEO_HEIGHT, 'model', modelName);

        for (var f = 0; f < frameCount; f++) {
            onProgress && onProgress({
                stage: 'polling',
                attempt: f + 1,
                detail: 'frame ' + (f + 1) + '/' + frameCount
            });

            var wf = buildSingleFrameImg2Img({
                prompt: opts.prompt || 'subtle idle breathing animation, locked camera, seamless loop',
                imageName: baseName,
                modelName: modelName,
                seed: baseSeed + f * 17
            });

            var outs = await queueAndWait(wf, function (p) {
                if (p.stage === 'polling') {
                    onProgress && onProgress({
                        stage: 'polling',
                        attempt: f + 1,
                        detail: 'frame ' + (f + 1) + '/' + frameCount + ' step-poll ' + (p.attempt || 0)
                    });
                }
            });

            var frameMeta = outs.find(function (o) { return !o.isVideo; }) || outs[0];
            if (!frameMeta) throw new Error('No frame output from ComfyUI');

            // Prefer using the output filename already in ComfyUI output folder for VHS
            // But VHS LoadImage looks in input/ — so re-upload the pixels into input/
            var fetched = await fetchOutput(frameMeta);
            var uploadedFrame = await uploadImage(
                fetched.dataUrl,
                'as_vframe_' + Date.now() + '_' + f + '.png'
            );
            frameFiles.push(uploadedFrame);
        }

        onProgress && onProgress({ stage: 'polling', attempt: frameCount, detail: 'combining frames' });
        var combineWf = buildVhsCombineWorkflow(frameFiles);
        var combined = await queueAndWait(combineWf, onProgress);

        var vid = combined.find(function (o) {
            return o.isVideo || /\.(mp4|webm|gif|mkv)$/i.test(o.filename || '');
        }) || combined[0];
        if (!vid) throw new Error('No video in ComfyUI combine output');

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
        MAX_VIDEO_FRAMES: VIDEO_FRAME_COUNT
    };

    console.log('[ComfyUI] Client ready (Pony + IP-Adapter + sequential Arc video)');
})();
