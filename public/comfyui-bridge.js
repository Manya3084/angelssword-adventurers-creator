(function() {
    'use strict';

    const STORAGE = {
        URL: 'comfyui_base_url',
        CKPT: 'comfyui_checkpoint',
        IPADAPTER: 'comfyui_ipadapter_model',
        CLIPVISION: 'comfyui_clip_vision_model',
        IP_WEIGHT: 'comfyui_ipadapter_weight',
        CFG: 'comfyui_cfg',
        STEPS: 'comfyui_steps',
        LORAS: 'comfyui_loras',
        FLUX_CLIP_L: 'comfyui_flux_clip_l',
        FLUX_T5: 'comfyui_flux_t5',
        FLUX_VAE: 'comfyui_flux_vae',
        UNET_DTYPE: 'comfyui_unet_dtype',
        PULID_FILE: 'comfyui_pulid_file',
        PULID_WEIGHT: 'comfyui_pulid_weight',
        INSIGHTFACE_PROVIDER: 'comfyui_insightface_provider',
        // Video (Wan I2V)
        WAN_UNET: 'comfyui_wan_unet',
        WAN_VAE: 'comfyui_wan_vae',
        WAN_TEXT_ENCODER: 'comfyui_wan_text_encoder',
        WAN_CLIP_VISION: 'comfyui_wan_clip_vision',
        WAN_WIDTH: 'comfyui_wan_width',
        WAN_HEIGHT: 'comfyui_wan_height',
        WAN_FRAMES: 'comfyui_wan_frames',
        WAN_STEPS: 'comfyui_wan_steps',
        WAN_CFG: 'comfyui_wan_cfg',
        WAN_USE_GGUF: 'comfyui_wan_use_gguf'
    };

    const LORA_PRESETS = {
        none: [],
        chibi: [{ name: 'flux_icLora_chibi.safetensors', strength: 0.85 }],
        anime: [{ name: 'Flux-Dev-Real-Anime-LoRA.safetensors', strength: 0.80 }],
        pastel: [{ name: 'lora_pastel_anime_flux.safetensors', strength: 0.75 }],
        character: [{ name: 'Canopus-Anime-Character-Art-FluxDev-LoRA.safetensors', strength: 0.80 }]
    };

    function getAutoComfyUIUrl() {
        const host = window.location.hostname;
        if (!host || host === 'localhost' || host === '127.0.0.1') {
            return 'http://127.0.0.1:8188';
        }
        return `http://${host}:8188`;
    }

    const DEFAULTS = {
        URL: getAutoComfyUIUrl(),
        CKPT: 'flux1-dev-fp8.safetensors',
        IPADAPTER: 'ip-adapter-plus-face_sdxl_vit-h.safetensors',
        CLIPVISION: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        IP_WEIGHT: 0.55,
        CFG: 3.5,
        STEPS: 24,
        FLUX_CLIP_L: 'clip_l.safetensors',
        FLUX_T5: 't5/t5xxl_fp8_e4m3fn.safetensors',
        FLUX_VAE: 'ae.safetensors',
        UNET_DTYPE: 'auto',
        PULID_FILE: 'pulid_flux_v0.9.0.safetensors',
        PULID_WEIGHT: 0.9,
        INSIGHTFACE_PROVIDER: 'CPU',
        WAN_UNET: 'wan2.1_i2v_480p_14B_fp8_e4m3fn.safetensors',
        WAN_VAE: 'wan_2.1_vae.safetensors',
        WAN_TEXT_ENCODER: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        WAN_CLIP_VISION: 'clip_vision_h.safetensors',
        WAN_WIDTH: '832',
        WAN_HEIGHT: '480',
        WAN_FRAMES: '97',
        WAN_STEPS: '20',
        WAN_CFG: '5',
        WAN_USE_GGUF: 'false'
    };

    (function migrateBadDefaults() {
        const fixes = {
            [STORAGE.CKPT]: {
                from: [
                    'FLUX.1-dev-fp8.safetensors',
                    'flux1-dev.safetensors',
                    'ponyDiffusionV6XL_v6StartWithThisOne.safetensors'
                ],
                to: DEFAULTS.CKPT
            },
            [STORAGE.FLUX_T5]: {
                from: ['t5xxl_fp8_e4m3fn.safetensors', 't5xxl_fp16.safetensors'],
                to: DEFAULTS.FLUX_T5
            }
        };
        try {
            for (const [key, { from, to }] of Object.entries(fixes)) {
                const cur = (localStorage.getItem(key) || '').trim();
                if (!cur || from.some(f => f.toLowerCase() === cur.toLowerCase())) {
                    localStorage.setItem(key, to);
                }
            }
        } catch (e) { /* ignore */ }
    })();

    function getSetting(key) {
        const saved = localStorage.getItem(STORAGE[key]);
        if (saved !== null && saved !== '') return saved;
        return DEFAULTS[key];
    }

    function setSetting(key, value) {
        localStorage.setItem(STORAGE[key], value);
    }

    function loadLoras() {
        try {
            const raw = localStorage.getItem(STORAGE.LORAS);
            if (!raw) return [{ name: '', strength: 0.8 }, { name: '', strength: 0.8 }, { name: '', strength: 0.8 }];
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) throw new Error('bad');
            while (arr.length < 3) arr.push({ name: '', strength: 0.8 });
            return arr.slice(0, 3).map(x => ({
                name: (x && x.name) || '',
                strength: typeof x.strength === 'number' ? x.strength : parseFloat(x.strength) || 0.8
            }));
        } catch {
            return [{ name: '', strength: 0.8 }, { name: '', strength: 0.8 }, { name: '', strength: 0.8 }];
        }
    }

    function saveLoras(loras) {
        localStorage.setItem(STORAGE.LORAS, JSON.stringify(loras));
    }

    function readLorasFromUI() {
        const out = [];
        for (let i = 0; i < 3; i++) {
            const nameEl = document.getElementById('comfyuiLora' + i);
            const strEl = document.getElementById('comfyuiLoraStr' + i);
            out.push({
                name: nameEl ? nameEl.value.trim() : '',
                strength: strEl ? (parseFloat(strEl.value) || 0) : 0.8
            });
        }
        return out;
    }

    function writeLorasToUI(loras) {
        for (let i = 0; i < 3; i++) {
            const L = loras[i] || { name: '', strength: 0.8 };
            const nameEl = document.getElementById('comfyuiLora' + i);
            const strEl = document.getElementById('comfyuiLoraStr' + i);
            const valEl = document.getElementById('comfyuiLoraStrVal' + i);
            if (nameEl) nameEl.value = L.name || '';
            if (strEl) strEl.value = L.strength != null ? L.strength : 0.8;
            if (valEl) valEl.textContent = strEl ? strEl.value : '0.8';
        }
    }

    /** Public helper for video-gen.js */
    window.ComfyUISettings = {
        get(key) { return getSetting(key); },
        STORAGE,
        DEFAULTS,
        getVideoConfig() {
            return {
                baseUrl: getSetting('URL'),
                unet: getSetting('WAN_UNET'),
                vae: getSetting('WAN_VAE'),
                textEncoder: getSetting('WAN_TEXT_ENCODER'),
                clipVision: getSetting('WAN_CLIP_VISION'),
                width: parseInt(getSetting('WAN_WIDTH'), 10) || 832,
                height: parseInt(getSetting('WAN_HEIGHT'), 10) || 480,
                frames: parseInt(getSetting('WAN_FRAMES'), 10) || 97,
                steps: parseInt(getSetting('WAN_STEPS'), 10) || 20,
                cfg: parseFloat(getSetting('WAN_CFG')) || 5,
                useGguf: getSetting('WAN_USE_GGUF') === 'true'
            };
        }
    };

    function buildComfyUISettingsHTML() {
        const loras = loadLoras();
        const dtype = getSetting('UNET_DTYPE');
        const ifProvider = getSetting('INSIGHTFACE_PROVIDER');
        const useGguf = getSetting('WAN_USE_GGUF') === 'true';

        let loraRows = '';
        for (let i = 0; i < 3; i++) {
            const L = loras[i] || { name: '', strength: 0.8 };
            loraRows += `
                <div class="form-row" style="margin-bottom:0.75rem">
                    <label>LoRA ${i + 1}</label>
                    <input type="text" id="comfyuiLora${i}" value="${(L.name || '').replace(/"/g, '&quot;')}" placeholder="e.g. flux_icLora_chibi.safetensors">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.35rem">
                        <span class="text-dim" style="font-size:0.7rem;min-width:3.5rem">Strength</span>
                        <input type="range" id="comfyuiLoraStr${i}" min="0" max="1.5" step="0.05" value="${L.strength}" style="flex:1">
                        <span id="comfyuiLoraStrVal${i}" class="text-gold" style="min-width:2rem;font-size:0.8rem">${L.strength}</span>
                    </div>
                </div>`;
        }

        const dtypeOpts = [
            ['auto', 'Auto (fp8 file → fp8_e4m3fn)'],
            ['fp8_e4m3fn', 'fp8_e4m3fn — recommended'],
            ['fp8_e4m3fn_fast', 'fp8_e4m3fn_fast'],
            ['fp8_e5m2', 'fp8_e5m2'],
            ['default', 'default — may upcast']
        ].map(([v, label]) =>
            `<option value="${v}"${dtype === v ? ' selected' : ''}>${label}</option>`
        ).join('');

        const ifOpts = ['CPU', 'CUDA', 'ROCM'].map(v =>
            `<option value="${v}"${ifProvider === v ? ' selected' : ''}>${v}${v === 'CPU' ? ' (Intel Arc)' : ''}</option>`
        ).join('');

        return `
            <div class="glass-panel" id="comfyuiSettingsPanel">
                <div class="panel-title"><span class="title-icon">🖥️</span> ComfyUI Local</div>

                <div class="mode-selector" id="comfyuiSettingsTabs" style="margin-bottom:1rem">
                    <button type="button" class="mode-btn active" data-comfy-tab="connection">🔌 Connection</button>
                    <button type="button" class="mode-btn" data-comfy-tab="image">🖼️ Image</button>
                    <button type="button" class="mode-btn" data-comfy-tab="video">🎬 Video</button>
                </div>

                <!-- CONNECTION -->
                <div id="comfyuiTabConnection">
                    <div class="form-row">
                        <label>ComfyUI URL</label>
                        <input type="text" id="comfyuiUrl" value="${getSetting('URL')}">
                        <div class="text-dim mt-1" style="font-size:0.7rem">Auto-detects when empty. Prefer COMFYUI_URL in docker-compose.</div>
                    </div>
                    <div class="btn-group mt-2" style="flex-wrap:wrap;gap:0.5rem">
                        <button id="comfyuiTestBtn" class="btn btn-secondary" type="button">Test Connection</button>
                        <button id="comfyuiRestartBtn" class="btn btn-danger" type="button" title="Restart ComfyUI">🔄 Restart</button>
                    </div>
                </div>

                <!-- IMAGE -->
                <div id="comfyuiTabImage" class="hidden">
                    <div class="form-row">
                        <label>Model / UNET</label>
                        <input type="text" id="comfyuiCheckpoint" value="${getSetting('CKPT')}">
                        <div class="text-dim mt-1" style="font-size:0.7rem">e.g. <code>flux1-dev-fp8.safetensors</code></div>
                    </div>
                    <div class="form-row">
                        <label>UNET weight_dtype</label>
                        <select id="comfyuiUnetDtype">${dtypeOpts}</select>
                    </div>
                    <div class="form-row">
                        <label>Flux CLIP-L</label>
                        <input type="text" id="comfyuiFluxClipL" value="${getSetting('FLUX_CLIP_L')}">
                    </div>
                    <div class="form-row">
                        <label>Flux T5</label>
                        <input type="text" id="comfyuiFluxT5" value="${getSetting('FLUX_T5')}">
                    </div>
                    <div class="form-row">
                        <label>Flux VAE</label>
                        <input type="text" id="comfyuiFluxVae" value="${getSetting('FLUX_VAE')}">
                    </div>

                    <hr class="gold-divider">
                    <div class="panel-title" style="font-size:0.9rem"><span class="title-icon">🪪</span> PuLID-Flux</div>
                    <div class="text-dim" style="font-size:0.7rem;margin-bottom:0.5rem">Character reference on Flux stills.</div>
                    <div class="form-row">
                        <label>PuLID model file</label>
                        <input type="text" id="comfyuiPulidFile" value="${getSetting('PULID_FILE')}">
                    </div>
                    <div class="form-row">
                        <label>PuLID weight <span id="comfyuiPulidWeightValue" class="text-gold">${getSetting('PULID_WEIGHT')}</span></label>
                        <input type="range" id="comfyuiPulidWeight" min="0" max="1.5" step="0.05" value="${getSetting('PULID_WEIGHT')}">
                    </div>
                    <div class="form-row">
                        <label>InsightFace provider</label>
                        <select id="comfyuiInsightfaceProvider">${ifOpts}</select>
                    </div>

                    <hr class="gold-divider">
                    <div class="text-dim" style="font-size:0.7rem;margin-bottom:0.4rem">Pony / SDXL only</div>
                    <div class="form-row">
                        <label>IP-Adapter Model</label>
                        <input type="text" id="comfyuiIpAdapter" value="${getSetting('IPADAPTER')}">
                    </div>
                    <div class="form-row">
                        <label>CLIP Vision</label>
                        <input type="text" id="comfyuiClipVision" value="${getSetting('CLIPVISION')}">
                    </div>
                    <div class="form-row">
                        <label>IP-Adapter Weight <span id="comfyuiIpWeightValue" class="text-gold">${getSetting('IP_WEIGHT')}</span></label>
                        <input type="range" id="comfyuiIpWeight" min="0" max="2" step="0.05" value="${getSetting('IP_WEIGHT')}">
                    </div>
                    <div class="form-row">
                        <label>Guidance / CFG <span id="comfyuiCfgValue" class="text-gold">${getSetting('CFG')}</span></label>
                        <input type="range" id="comfyuiCfg" min="1" max="12" step="0.5" value="${getSetting('CFG')}">
                    </div>
                    <div class="form-row">
                        <label>Steps <span id="comfyuiStepsValue" class="text-gold">${getSetting('STEPS')}</span></label>
                        <input type="range" id="comfyuiSteps" min="10" max="50" step="1" value="${getSetting('STEPS')}">
                    </div>

                    <hr class="gold-divider">
                    <div class="panel-title" style="font-size:0.9rem"><span class="title-icon">🎨</span> LoRAs</div>
                    <div class="form-row">
                        <label>Presets</label>
                        <div class="btn-group" style="flex-wrap:wrap;gap:0.4rem" id="comfyuiLoraPresets">
                            <button type="button" class="btn btn-sm btn-secondary" data-lora-preset="none">None</button>
                            <button type="button" class="btn btn-sm btn-secondary" data-lora-preset="chibi">Chibi</button>
                            <button type="button" class="btn btn-sm btn-secondary" data-lora-preset="anime">Anime</button>
                            <button type="button" class="btn btn-sm btn-secondary" data-lora-preset="pastel">Pastel</button>
                            <button type="button" class="btn btn-sm btn-secondary" data-lora-preset="character">Character Art</button>
                        </div>
                    </div>
                    ${loraRows}
                </div>

                <!-- VIDEO -->
                <div id="comfyuiTabVideo" class="hidden">
                    <div class="text-dim" style="font-size:0.75rem;margin-bottom:0.75rem">
                        <b>Wan I2V</b> — image → ~6s clips (idle / talk emotions). Prefer <b>480p + GGUF/fp8</b> on 16GB.
                        Models under ComfyUI <code>models/</code>. Intel Arc/XPU support is experimental.
                    </div>
                    <div class="form-row">
                        <label class="flex items-center gap-sm" style="gap:0.5rem">
                            <input type="checkbox" id="comfyuiWanUseGguf" ${useGguf ? 'checked' : ''}>
                            Use GGUF loader (UnetLoaderGGUF)
                        </label>
                    </div>
                    <div class="form-row">
                        <label>Wan diffusion / UNET (or .gguf)</label>
                        <input type="text" id="comfyuiWanUnet" value="${getSetting('WAN_UNET')}">
                        <div class="text-dim mt-1" style="font-size:0.7rem">e.g. <code>wan2.1_i2v_480p_14B_fp8_e4m3fn.safetensors</code> or Q4/Q5 GGUF</div>
                    </div>
                    <div class="form-row">
                        <label>Wan VAE</label>
                        <input type="text" id="comfyuiWanVae" value="${getSetting('WAN_VAE')}">
                    </div>
                    <div class="form-row">
                        <label>Text encoder (UMT5)</label>
                        <input type="text" id="comfyuiWanTextEncoder" value="${getSetting('WAN_TEXT_ENCODER')}">
                    </div>
                    <div class="form-row">
                        <label>CLIP Vision</label>
                        <input type="text" id="comfyuiWanClipVision" value="${getSetting('WAN_CLIP_VISION')}">
                    </div>
                    <div class="form-row">
                        <label>Width × Height</label>
                        <div style="display:flex;gap:0.5rem">
                            <input type="number" id="comfyuiWanWidth" value="${getSetting('WAN_WIDTH')}" min="256" max="1280" style="flex:1">
                            <input type="number" id="comfyuiWanHeight" value="${getSetting('WAN_HEIGHT')}" min="256" max="1280" style="flex:1">
                        </div>
                        <div class="text-dim mt-1" style="font-size:0.7rem">Default 832×480 (~480p landscape)</div>
                    </div>
                    <div class="form-row">
                        <label>Frames <span class="text-dim">(97 ≈ 6s @ 16fps, prefer 4n+1)</span></label>
                        <input type="number" id="comfyuiWanFrames" value="${getSetting('WAN_FRAMES')}" min="17" max="161">
                    </div>
                    <div class="form-row">
                        <label>Steps <span id="comfyuiWanStepsValue" class="text-gold">${getSetting('WAN_STEPS')}</span></label>
                        <input type="range" id="comfyuiWanSteps" min="6" max="40" step="1" value="${getSetting('WAN_STEPS')}">
                    </div>
                    <div class="form-row">
                        <label>CFG <span id="comfyuiWanCfgValue" class="text-gold">${getSetting('WAN_CFG')}</span></label>
                        <input type="range" id="comfyuiWanCfg" min="1" max="10" step="0.5" value="${getSetting('WAN_CFG')}">
                    </div>
                </div>

                <div class="btn-group mt-2" style="flex-wrap:wrap;gap:0.5rem">
                    <button id="comfyuiSaveBtn" class="btn btn-primary" type="button">Save Settings</button>
                </div>
                <div id="comfyuiStatus" class="mt-1 text-sm"></div>
            </div>
        `;
    }

    function switchComfyTab(tab) {
        const map = {
            connection: 'comfyuiTabConnection',
            image: 'comfyuiTabImage',
            video: 'comfyuiTabVideo'
        };
        Object.entries(map).forEach(([k, id]) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', k !== tab);
        });
        const tabs = document.getElementById('comfyuiSettingsTabs');
        if (tabs) {
            tabs.querySelectorAll('.mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.comfyTab === tab);
            });
        }
    }

    function wireComfyUISettings() {
        const urlInput = document.getElementById('comfyuiUrl');
        const statusEl = document.getElementById('comfyuiStatus');
        if (!urlInput) return;

        const tabs = document.getElementById('comfyuiSettingsTabs');
        if (tabs) {
            tabs.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-comfy-tab]');
                if (btn) switchComfyTab(btn.dataset.comfyTab);
            });
        }

        const bindRange = (id, valId) => {
            const el = document.getElementById(id);
            const val = document.getElementById(valId);
            if (el && val) {
                el.addEventListener('input', () => { val.textContent = el.value; });
                val.textContent = el.value;
            }
        };
        bindRange('comfyuiIpWeight', 'comfyuiIpWeightValue');
        bindRange('comfyuiPulidWeight', 'comfyuiPulidWeightValue');
        bindRange('comfyuiCfg', 'comfyuiCfgValue');
        bindRange('comfyuiSteps', 'comfyuiStepsValue');
        bindRange('comfyuiWanSteps', 'comfyuiWanStepsValue');
        bindRange('comfyuiWanCfg', 'comfyuiWanCfgValue');

        for (let i = 0; i < 3; i++) {
            const strEl = document.getElementById('comfyuiLoraStr' + i);
            const valEl = document.getElementById('comfyuiLoraStrVal' + i);
            if (strEl && valEl) strEl.addEventListener('input', () => { valEl.textContent = strEl.value; });
        }

        const presetBox = document.getElementById('comfyuiLoraPresets');
        if (presetBox) {
            presetBox.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-lora-preset]');
                if (!btn) return;
                const key = btn.dataset.loraPreset;
                const preset = LORA_PRESETS[key] || [];
                writeLorasToUI([
                    preset[0] || { name: '', strength: 0.8 },
                    preset[1] || { name: '', strength: 0.8 },
                    preset[2] || { name: '', strength: 0.8 }
                ]);
                // Auto-save LoRAs on preset so generation picks them up immediately
                saveLoras(readLorasFromUI());
                if (statusEl) {
                    statusEl.innerHTML = key === 'none' ? 'LoRAs cleared & saved' : `Preset “${key}” applied & saved`;
                    statusEl.className = 'text-sm text-dim';
                }
            });
        }

        document.getElementById('comfyuiTestBtn')?.addEventListener('click', async () => {
            if (!statusEl) return;
            statusEl.innerHTML = '<span class="spinner"></span> Testing...';
            statusEl.className = 'text-sm text-dim';
            try {
                const resp = await fetch('/api/comfyui/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl: urlInput.value })
                });
                const text = await resp.text();
                let data;
                try { data = JSON.parse(text); } catch { data = { error: text.substring(0, 200) }; }
                if (resp.ok && !data.error) {
                    statusEl.innerHTML = '✅ Connected';
                    statusEl.className = 'text-sm text-green';
                } else {
                    statusEl.innerHTML = '❌ ' + (data.error || 'Connection failed');
                    statusEl.className = 'text-sm text-red';
                }
            } catch (e) {
                statusEl.innerHTML = '❌ ' + e.message;
                statusEl.className = 'text-sm text-red';
            }
        });

        document.getElementById('comfyuiSaveBtn')?.addEventListener('click', () => {
            setSetting('URL', urlInput.value.trim());
            const ckpt = document.getElementById('comfyuiCheckpoint');
            if (ckpt) setSetting('CKPT', ckpt.value.trim());
            const dtype = document.getElementById('comfyuiUnetDtype');
            if (dtype) setSetting('UNET_DTYPE', dtype.value);
            ['comfyuiFluxClipL', 'comfyuiFluxT5', 'comfyuiFluxVae', 'comfyuiPulidFile',
             'comfyuiIpAdapter', 'comfyuiClipVision'].forEach((id, i) => {
                const keys = ['FLUX_CLIP_L', 'FLUX_T5', 'FLUX_VAE', 'PULID_FILE', 'IPADAPTER', 'CLIPVISION'];
                const el = document.getElementById(id);
                if (el) setSetting(keys[i], el.value.trim());
            });
            const pulidW = document.getElementById('comfyuiPulidWeight');
            if (pulidW) setSetting('PULID_WEIGHT', pulidW.value);
            const ifP = document.getElementById('comfyuiInsightfaceProvider');
            if (ifP) setSetting('INSIGHTFACE_PROVIDER', ifP.value);
            const ipW = document.getElementById('comfyuiIpWeight');
            if (ipW) setSetting('IP_WEIGHT', ipW.value);
            const cfg = document.getElementById('comfyuiCfg');
            if (cfg) setSetting('CFG', cfg.value);
            const steps = document.getElementById('comfyuiSteps');
            if (steps) setSetting('STEPS', steps.value);
            saveLoras(readLorasFromUI());

            // Video
            const wanMap = [
                ['comfyuiWanUnet', 'WAN_UNET'],
                ['comfyuiWanVae', 'WAN_VAE'],
                ['comfyuiWanTextEncoder', 'WAN_TEXT_ENCODER'],
                ['comfyuiWanClipVision', 'WAN_CLIP_VISION'],
                ['comfyuiWanWidth', 'WAN_WIDTH'],
                ['comfyuiWanHeight', 'WAN_HEIGHT'],
                ['comfyuiWanFrames', 'WAN_FRAMES'],
                ['comfyuiWanSteps', 'WAN_STEPS'],
                ['comfyuiWanCfg', 'WAN_CFG']
            ];
            wanMap.forEach(([id, key]) => {
                const el = document.getElementById(id);
                if (el) setSetting(key, String(el.value).trim());
            });
            const gguf = document.getElementById('comfyuiWanUseGguf');
            if (gguf) setSetting('WAN_USE_GGUF', gguf.checked ? 'true' : 'false');

            if (statusEl) {
                statusEl.innerHTML = '✅ Saved';
                statusEl.className = 'text-sm text-green';
                setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 2000);
            }
        });

        const restartBtn = document.getElementById('comfyuiRestartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', async () => {
                if (!confirm('Restart ComfyUI? Running jobs will be cancelled.')) return;
                if (statusEl) {
                    statusEl.innerHTML = '<span class="spinner"></span> Restarting…';
                    statusEl.className = 'text-sm text-dim';
                }
                restartBtn.disabled = true;
                try {
                    const resp = await fetch('/api/comfyui/restart', { method: 'POST' });
                    const data = await resp.json().catch(() => ({}));
                    if (resp.ok && data.ok) {
                        if (statusEl) {
                            statusEl.innerHTML = '✅ Restart sent. Wait 15–30s then Test.';
                            statusEl.className = 'text-sm text-green';
                        }
                    } else if (statusEl) {
                        statusEl.innerHTML = '❌ ' + (data.error || 'Restart failed');
                        statusEl.className = 'text-sm text-red';
                    }
                } catch (e) {
                    if (statusEl) {
                        statusEl.innerHTML = '❌ ' + e.message;
                        statusEl.className = 'text-sm text-red';
                    }
                } finally {
                    restartBtn.disabled = false;
                }
            });
        }
    }

    function injectComfyUISettings() {
        const settingsSection = document.querySelector('#tab-settings .settings-section');
        if (!settingsSection) return false;
        if (document.getElementById('comfyuiSettingsPanel')) return true;

        const grokPanel = Array.from(settingsSection.children).find(el =>
            el.textContent && el.textContent.includes('Grok (SuperGrok OAuth)')
        );

        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildComfyUISettingsHTML();
        const panel = wrapper.firstElementChild;

        if (grokPanel && grokPanel.nextSibling) {
            settingsSection.insertBefore(panel, grokPanel.nextSibling);
        } else {
            settingsSection.appendChild(panel);
        }

        wireComfyUISettings();
        return true;
    }

    function tryInject() {
        if (injectComfyUISettings()) return;
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (injectComfyUISettings() || attempts > 6) clearInterval(interval);
        }, 500);
    }

    const observer = new MutationObserver(() => {
        const settingsTab = document.getElementById('tab-settings');
        if (settingsTab && settingsTab.classList.contains('active')) tryInject();
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-tab="tab-settings"]')) setTimeout(tryInject, 400);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(tryInject, 1000));
    } else {
        setTimeout(tryInject, 1000);
    }

    const style = document.createElement('style');
    style.textContent = `
        #tab-settings {
            max-height: calc(100vh - 120px);
            overflow-y: auto;
            padding-bottom: 40px;
        }
        #comfyuiUnetDtype,
        #comfyuiInsightfaceProvider {
            width: 100%;
            padding: 0.4rem 0.5rem;
            border-radius: 6px;
            border: 1px solid var(--border, #444);
            background: var(--panel-bg, #1a1a1a);
            color: inherit;
        }
        #comfyuiSettingsTabs .mode-btn { font-size: 0.8rem; }
    `;
    document.head.appendChild(style);

    console.log('[ComfyUI Bridge] Loaded — tabbed Image/Video settings');
})();
