/**
 * ⚔️ AS Adventurer — ComfyUI Local Client
 *
 * Sprites  — Pony Diffusion V6 XL @ 1216×832
 *            + optional IP-Adapter (character reference identity)
 * Video    — LTX-Video-ICLoRA-pose-13b-0.9.7
 *
 * IP-Adapter requires ComfyUI_IPAdapter_plus (or compatible) + SDXL weights:
 *   models/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors
 *   models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors
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
    // Face-oriented Plus is strongest for character identity on SDXL
    const DEFAULT_IPADAPTER = 'ip-adapter-plus-face_sdxl_vit-h.safetensors';
    const DEFAULT_CLIPVISION = 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';
    const DEFAULT_IP_WEIGHT = 0.75;

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

    function ponyNegative(negative) {
        return negative || [
            'score_4, score_5, score_6,',
            'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit,',
            'fewer digits, cropped, worst quality, low quality, jpeg artifacts,',
            'signature, watermark, username, blurry, gradient background,',
            'detailed background, scenery, 3d, realistic'
        ].join(' ');
    }

    /**
     * Plain T2I (no character reference).
     */
    function buildSpriteWorkflowT2I({ prompt, negative, width, height, seed, steps, cfg, checkpoint }) {
        const ckpt = checkpoint || getCheckpoint();
        const w = width || DEFAULT_SPRITE_W;
        const h = height || DEFAULT_SPRITE_H;
        const s = seed == null ? Math.floor(Math.random() * 2 ** 32) : seed;

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
                inputs: { text: ponyNegative(negative), clip: ['1', 1] }
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
     * T2I + IP-Adapter (ComfyUI_IPAdapter_plus).
     * Character reference image must already be uploaded to ComfyUI input folder.
     *
     * Nodes used:
     *   IPAdapterModelLoader, CLIPVisionLoader, IPAdapterAdvanced
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

        return {
            // Base SDXL checkpoint (Pony)
            '1': {
                class_type: 'CheckpointLoaderSimple',
                inputs: { ckpt_name: ckpt }
            },
            // Character reference image
            '2': {
                class_type: 'LoadImage',
                inputs: { image: imageName }
            },
            // IP-Adapter SDXL weights
            '3': {
                class_type: 'IPAdapterModelLoader',
                inputs: { ipadapter_file: getIpAdapterModel() }
            },
            // CLIP Vision encoder (ViT-H for plus / face plus SDXL)
            '4': {
                class_type: 'CLIPVisionLoader',
                inputs: { clip_name: getClipVisionModel() }
            },
            // Apply IP-Adapter → modified MODEL
            '5': {
                class_type: 'IPAdapterAdvanced',
                inputs: {
                    model: ['1', 0],
                    ipadapter: ['3', 0],
                    image: ['2', 0],
                    clip_vision: ['4', 0],
                    weight: weight,
                    weight_type: 'linear',
                    combine_embeds: 'concat',
                    start_at: 0.0,
                    end_at: 1.0,
                    embeds_scaling: 'V only'
                }
            },
            '6': {
                class_type: 'CLIPTextEncode',
                inputs: { text: prompt, clip: ['1', 1] }
            },
            '7': {
                class_type: 'CLIPTextEncode',
                inputs: { text: ponyNegative(negative), clip: ['1', 1] }
            },
            '8': {
                class_type: 'EmptyLatentImage',
                inputs: { width: w, height: h, batch_size: 1 }
            },
            '9': {
                class_type: 'KSampler',
                inputs: {
                    seed: s,
                    steps: steps || 25,
                    cfg: cfg || 7,
                    sampler_name: 'euler_ancestral',
                    scheduler: 'normal',
                    denoise: 1,
                    model: ['5', 0], // IP-Adapter-conditioned model
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
                        // Helpful hints for missing IP-Adapter install
                        if (/IPAdapter|CLIPVision/i.test(m) || /node.*not found/i.test(m)) {
                            return `node ${id}: ${m} — install ComfyUI_IPAdapter_plus and place SDXL IP-Adapter + CLIP Vision weights`;
                        }
                        return `node ${id}: ${m}`;
                    })
                    .join('; ')
                    .slice(0, 600);
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

        const maxAttempts = 240;
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
                    if (o.images) for (const img of o.images) images.push(img);
                    if (o.gifs) for (const g of o.gifs) images.push({ ...g, isVideo: true });
                    if (o.videos) for (const v of o.videos) images.push({ ...v, isVideo: true });
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
     * Generate one sprite.
     * If referenceImageDataUrl is provided → IP-Adapter path (identity hold).
     * Otherwise → plain T2I.
     */
    async function generateSprite({
        prompt,
        negative,
        width,
        height,
        seed,
        referenceImageDataUrl,
        ipWeight,
        onProgress
    }) {
        let workflow;

        if (referenceImageDataUrl) {
            onProgress?.({ stage: 'upload' });
            const imageName = await uploadImage(
                referenceImageDataUrl,
                'as_char_ref_' + Date.now() + '.png'
            );
            onProgress?.({ stage: 'ipadapter', imageName });
            workflow = buildSpriteWorkflowIPAdapter({
                prompt,
                negative,
                width: width || DEFAULT_SPRITE_W,
                height: height || DEFAULT_SPRITE_H,
                seed,
                checkpoint: getCheckpoint(),
                imageName,
                ipWeight
            });
        } else {
            workflow = buildSpriteWorkflowT2I({
                prompt,
                negative,
                width: width || DEFAULT_SPRITE_W,
                height: height || DEFAULT_SPRITE_H,
                seed,
                checkpoint: getCheckpoint()
            });
        }

        const outputs = await queueAndWait(workflow, onProgress);
        const img = outputs.find(o => !o.isVideo) || outputs[0];
        if (!img) throw new Error('No image in ComfyUI output');

        const result = await fetchOutput(img);
        return result.dataUrl;
    }

    function buildLtxVideoWorkflow({ prompt, imageName, frames }) {
        const modelName = getVideoModel();
        const seed = Math.floor(Math.random() * 2 ** 32);
        const frameCount = Math.min(97, Math.max(25, frames || 49));

        const pos = (prompt || 'subtle idle breathing, locked camera, seamless loop') +
            ', static camera, no zoom, no pan, character only moves slightly';
        const neg = 'camera move, zoom, pan, blur, morphing, low quality, watermark, text';

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
            '5': {
                class_type: 'VAEEncode',
                inputs: { pixels: ['2', 0], vae: ['1', 2] }
            },
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
        const uploadedName = await uploadImage(
            imageDataUrl,
            'as_vid_ref_' + Date.now() + '.png'
        );

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
        getIpAdapterModel,
        setIpAdapterModel,
        getClipVisionModel,
        setClipVisionModel,
        getIpAdapterWeight,
        setIpAdapterWeight,
        testConnection,
        generateSprite,
        generateVideo,
        DEFAULT_URL,
        DEFAULT_CKPT,
        DEFAULT_VIDEO_MODEL,
        DEFAULT_IPADAPTER,
        DEFAULT_CLIPVISION,
        DEFAULT_IP_WEIGHT,
        DEFAULT_SPRITE_W,
        DEFAULT_SPRITE_H
    };

    console.log('[ComfyUI] Client ready (Pony + IP-Adapter + LTX)');
})();
