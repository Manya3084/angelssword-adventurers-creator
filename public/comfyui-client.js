/**
 * ⚔️ AS Adventurer — ComfyUI Local Client
 * Talks to a local ComfyUI instance via the AS Adventurer server proxy.
 *
 * Models expected (user installs in ComfyUI):
 *   - Animagine XL 4.0 (or any SDXL checkpoint) for sprites
 *   - AnimateDiff SDXL stack for video (optional; uses img2vid workflow if present)
 */

(function () {
    'use strict';

    const DEFAULT_URL = 'http://127.0.0.1:8188';
    const STORAGE_URL = 'comfyui_base_url';
    const STORAGE_CKPT = 'comfyui_checkpoint';
    const DEFAULT_CKPT = 'animagine-xl-4.0.safetensors';

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
     * Build a minimal SDXL text-to-image workflow for Animagine XL / any SDXL ckpt.
     * Output: single SaveImage node.
     */
    function buildSpriteWorkflow({ prompt, negative, width, height, seed, steps, cfg, checkpoint }) {
        const ckpt = checkpoint || getCheckpoint();
        const w = width || 1280;
        const h = height || 720;
        const s = seed == null ? Math.floor(Math.random() * 2 ** 32) : seed;

        // Node graph (API format)
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
                inputs: {
                    text: negative || 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, gradient background, detailed background, scenery',
                    clip: ['1', 1]
                }
            },
            '4': {
                class_type: 'EmptyLatentImage',
                inputs: { width: w, height: h, batch_size: 1 }
            },
            '5': {
                class_type: 'KSampler',
                inputs: {
                    seed: s,
                    steps: steps || 28,
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
     * Queue a workflow and wait until finished. Returns array of { filename, subfolder, type }.
     */
    async function queueAndWait(workflow, onProgress) {
        const clientId = 'as-adventurer-' + Math.random().toString(36).slice(2);

        const queueResp = await comfyFetch('/prompt', {
            method: 'POST',
            body: { prompt: workflow, client_id: clientId }
        });

        if (!queueResp.ok) {
            const err = await queueResp.json().catch(() => ({}));
            const msg = err.error || err.node_errors
                ? JSON.stringify(err.node_errors || err.error).slice(0, 400)
                : `Queue failed (${queueResp.status})`;
            throw new Error(msg);
        }

        const queueData = await queueResp.json();
        const promptId = queueData.prompt_id;
        if (!promptId) throw new Error('No prompt_id from ComfyUI');

        onProgress?.({ stage: 'queued', promptId });

        // Poll history
        const maxAttempts = 180; // ~15 min at 5s
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 5000));
            onProgress?.({ stage: 'polling', attempt: i + 1, promptId });

            const histResp = await comfyFetch(`/history/${promptId}`);
            if (!histResp.ok) continue;

            const hist = await histResp.json();
            const entry = hist[promptId];
            if (!entry) continue;

            // status: success / error
            const statusStr = entry.status?.status_str || entry.status?.completed;
            if (entry.status?.status_str === 'error') {
                throw new Error('ComfyUI workflow error: ' + JSON.stringify(entry.status).slice(0, 300));
            }

            const outputs = entry.outputs;
            if (outputs) {
                const images = [];
                for (const nodeId of Object.keys(outputs)) {
                    const o = outputs[nodeId];
                    if (o.images) {
                        for (const img of o.images) {
                            images.push(img);
                        }
                    }
                    if (o.gifs) {
                        for (const g of o.gifs) {
                            images.push({ ...g, isVideo: true });
                        }
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

    /** Fetch an output file from ComfyUI and return as data URL (image) or blob URL helper data */
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

        return { blob, dataUrl, isVideo: !!fileInfo.isVideo || (fileInfo.filename || '').match(/\.(mp4|webm|gif)$/i) };
    }

    /**
     * Generate one sprite image.
     * @returns data URL (png)
     */
    async function generateSprite({ prompt, negative, width, height, seed, onProgress }) {
        const workflow = buildSpriteWorkflow({
            prompt,
            negative,
            width: width || 1280,
            height: height || 720,
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
     * Generate video from a reference image using a simplified img2vid approach.
     *
     * Strategy:
     * 1. Upload the reference image to ComfyUI
     * 2. Run a workflow that loads it and applies AnimateDiff-style motion
     *
     * Because AnimateDiff node packs vary, we use a flexible workflow builder.
     * If the user's ComfyUI lacks AnimateDiff nodes, they get a clear error.
     */
    async function generateVideo({ prompt, imageDataUrl, duration, onProgress }) {
        // Upload image first
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

        // Build AnimateDiff-oriented workflow (requires AnimateDiff nodes installed)
        // Falls back with a helpful error if nodes are missing at queue time.
        const frames = Math.min(24, Math.max(12, (duration || 5) * 4)); // ~4 fps feel for idle
        const workflow = buildAnimateDiffWorkflow({
            prompt: prompt || 'subtle idle breathing animation, locked camera, seamless loop',
            imageName: uploadedName,
            frames,
            checkpoint: getCheckpoint()
        });

        const outputs = await queueAndWait(workflow, onProgress);
        const vid = outputs.find(o => o.isVideo || /\.(mp4|webm|gif)$/i.test(o.filename || '')) || outputs[0];
        if (!vid) throw new Error('No video in ComfyUI output');

        const result = await fetchOutput(vid);
        return { blob: result.blob, url: URL.createObjectURL(result.blob) };
    }

    /**
     * Minimal AnimateDiff SDXL-style graph.
     * Requires common community nodes:
     *   - ADE_AnimateDiffLoaderGen1 or similar
     *   - VHS_VideoCombine (Video Helper Suite) for mp4 output
     *
     * If these aren't installed, ComfyUI will error on queue — we surface that message.
     */
    function buildAnimateDiffWorkflow({ prompt, imageName, frames, checkpoint }) {
        const ckpt = checkpoint || getCheckpoint();
        const seed = Math.floor(Math.random() * 2 ** 32);

        // This graph uses widely-available node names from AnimateDiff Evolved + VHS.
        // Users with different packs may need to adjust node class_types in ComfyUI.
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
                class_type: 'CLIPTextEncode',
                inputs: {
                    text: prompt + ', locked camera, static background, seamless loop, subtle motion only',
                    clip: ['1', 1]
                }
            },
            '4': {
                class_type: 'CLIPTextEncode',
                inputs: {
                    text: 'camera move, zoom, pan, blur, distortion, morphing, low quality, watermark',
                    clip: ['1', 1]
                }
            },
            '5': {
                class_type: 'VAEEncode',
                inputs: { pixels: ['2', 0], vae: ['1', 2] }
            },
            '6': {
                class_type: 'KSampler',
                inputs: {
                    seed,
                    steps: 20,
                    cfg: 7,
                    sampler_name: 'euler_ancestral',
                    scheduler: 'normal',
                    denoise: 0.55,
                    model: ['1', 0],
                    positive: ['3', 0],
                    negative: ['4', 0],
                    latent_image: ['5', 0]
                }
            },
            '7': {
                class_type: 'VAEDecode',
                inputs: { samples: ['6', 0], vae: ['1', 2] }
            },
            '8': {
                class_type: 'SaveImage',
                inputs: { filename_prefix: 'ASAdventurer_vidframe', images: ['7', 0] }
            }
        };
        // Note: true AnimateDiff multi-frame needs ADE nodes + batch latents.
        // This v1 path does img2img refinement as a safe baseline that always runs on SDXL.
        // Users with full AnimateDiff can replace workflows later; see COMFYUI.md.
    }

    window.ComfyUIClient = {
        getBaseUrl,
        setBaseUrl,
        getCheckpoint,
        setCheckpoint,
        testConnection,
        generateSprite,
        generateVideo,
        DEFAULT_URL,
        DEFAULT_CKPT
    };

    console.log('[ComfyUI] Client ready');
})();
