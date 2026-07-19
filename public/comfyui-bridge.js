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
        UNET_DTYPE: 'comfyui_unet_dtype'
    };

    const LORA_PRESETS = {
        none: [],
        chibi: [{ name: 'flux_icLora_chibi.safetensors', strength: 0.85 }],
        anime: [{ name: 'flux_dev_anime.safetensors', strength: 0.80 }],
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

    // fp8-optimized defaults for Arc 16GB / Flux Dev
    const DEFAULTS = {
        URL: getAutoComfyUIUrl(),
        CKPT: 'FLUX.1-dev-fp8.safetensors',
        IPADAPTER: 'ip-adapter-plus-face_sdxl_vit-h.safetensors',
        CLIPVISION: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        IP_WEIGHT: 0.55,
        CFG: 3.5,
        STEPS: 24,
        FLUX_CLIP_L: 'clip_l.safetensors',
        FLUX_T5: 't5xxl_fp8_e4m3fn.safetensors',
        FLUX_VAE: 'ae.safetensors',
        // auto = pick from filename; fp8_e4m3fn keeps weights in fp8 (saves VRAM)
        UNET_DTYPE: 'auto'
    };

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

    function buildComfyUISettingsHTML() {
        const loras = loadLoras();
        const dtype = getSetting('UNET_DTYPE');
        let loraRows = '';
        for (let i = 0; i < 3; i++) {
            const L = loras[i] || { name: '', strength: 0.8 };
            loraRows += `
                <div class="form-row" style="margin-bottom:0.75rem">
                    <label>LoRA ${i + 1}</label>
                    <input type="text" id="comfyuiLora${i}" value="${(L.name || '').replace(/"/g, '"')}" placeholder="e.g. flux_icLora_chibi.safetensors">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.35rem">
                        <span class="text-dim" style="font-size:0.7rem;min-width:3.5rem">Strength</span>
                        <input type="range" id="comfyuiLoraStr${i}" min="0" max="1.5" step="0.05" value="${L.strength}" style="flex:1">
                        <span id="comfyuiLoraStrVal${i}" class="text-gold" style="min-width:2rem;font-size:0.8rem">${L.strength}</span>
                    </div>
                </div>`;
        }

        const dtypeOpts = [
            ['auto', 'Auto (fp8 file → fp8_e4m3fn)'],
            ['fp8_e4m3fn', 'fp8_e4m3fn — keep in fp8 (recommended)'],
            ['fp8_e4m3fn_fast', 'fp8_e4m3fn_fast — faster kernels if supported'],
            ['fp8_e5m2', 'fp8_e5m2 — alternate format'],
            ['default', 'default — may upcast (more VRAM)']
        ].map(([v, label]) =>
            `<option value="${v}"${dtype === v ? ' selected' : ''}>${label}</option>`
        ).join('');

        return `
            <div class="glass-panel" id="comfyuiSettingsPanel">
                <div class="panel-title"><span class="title-icon">🖥️</span> ComfyUI Local</div>
                
                <div class="form-row">
                    <label>ComfyUI URL</label>
                    <input type="text" id="comfyuiUrl" value="${getSetting('URL')}">
                    <div class="text-dim mt-1" style="font-size:0.7rem">
                        Auto-detects when empty. Prefer setting COMFYUI_URL in docker-compose.
                    </div>
                </div>

                <div class="form-row">
                    <label>Model / UNET</label>
                    <input type="text" id="comfyuiCheckpoint" value="${getSetting('CKPT')}">
                    <div class="text-dim mt-1" style="font-size:0.7rem">
                        Default: <code>FLUX.1-dev-fp8.safetensors</code>. Names containing "flux" use the Flux workflow.
                    </div>
                </div>

                <div class="form-row">
                    <label>UNET weight_dtype (fp8)</label>
                    <select id="comfyuiUnetDtype">${dtypeOpts}</select>
                    <div class="text-dim mt-1" style="font-size:0.7rem">
                        For pre-quantized <code>*fp8*</code> models, <b>fp8_e4m3fn</b> avoids upcasting and saves VRAM on 16GB Arc.
                        Try <b>fp8_e4m3fn_fast</b> if your ComfyUI build supports it. Use <b>default</b> only if loads fail.
                    </div>
                </div>

                <div class="form-row">
                    <label>Flux CLIP-L</label>
                    <input type="text" id="comfyuiFluxClipL" value="${getSetting('FLUX_CLIP_L')}">
                </div>

                <div class="form-row">
                    <label>Flux T5 (text encoder)</label>
                    <input type="text" id="comfyuiFluxT5" value="${getSetting('FLUX_T5')}">
                    <div class="text-dim mt-1" style="font-size:0.7rem">Default: <code>t5xxl_fp8_e4m3fn.safetensors</code> — required for 16GB with Flux</div>
                </div>

                <div class="form-row">
                    <label>Flux VAE</label>
                    <input type="text" id="comfyuiFluxVae" value="${getSetting('FLUX_VAE')}">
                </div>

                <div class="form-row">
                    <label>IP-Adapter Model <span class="text-dim">(Pony/SDXL only)</span></label>
                    <input type="text" id="comfyuiIpAdapter" value="${getSetting('IPADAPTER')}">
                </div>

                <div class="form-row">
                    <label>CLIP Vision Model <span class="text-dim">(Pony/SDXL only)</span></label>
                    <input type="text" id="comfyuiClipVision" value="${getSetting('CLIPVISION')}">
                </div>

                <div class="form-row">
                    <label>IP-Adapter Weight <span id="comfyuiIpWeightValue" class="text-gold">${getSetting('IP_WEIGHT')}</span></label>
                    <input type="range" id="comfyuiIpWeight" min="0" max="2" step="0.05" value="${getSetting('IP_WEIGHT')}">
                </div>

                <div class="form-row">
                    <label>Guidance / CFG <span id="comfyuiCfgValue" class="text-gold">${getSetting('CFG')}</span></label>
                    <input type="range" id="comfyuiCfg" min="1" max="12" step="0.5" value="${getSetting('CFG')}">
                    <div class="text-dim mt-1" style="font-size:0.7rem">Flux fp8 sweet spot: <b>3.0–3.5</b> · Pony CFG ~4–7</div>
                </div>

                <div class="form-row">
                    <label>Steps <span id="comfyuiStepsValue" class="text-gold">${getSetting('STEPS')}</span></label>
                    <input type="range" id="comfyuiSteps" min="10" max="50" step="1" value="${getSetting('STEPS')}">
                    <div class="text-dim mt-1" style="font-size:0.7rem">Flux fp8: <b>20–28</b> is enough (default 24)</div>
                </div>

                <hr class="gold-divider">

                <div class="panel-title" style="font-size:0.95rem"><span class="title-icon">🎨</span> LoRAs</div>
                <div class="text-dim" style="font-size:0.7rem;margin-bottom:0.5rem">
                    Files in <code>models/loras/</code>. Prefer one strong LoRA at 0.7–0.9 on fp8 to limit VRAM spikes.
                </div>

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

                <div class="btn-group mt-2" style="flex-wrap:wrap; gap:0.5rem;">
                    <button id="comfyuiTestBtn" class="btn btn-secondary">Test Connection</button>
                    <button id="comfyuiSaveBtn" class="btn btn-primary">Save Settings</button>
                    <button id="comfyuiRestartBtn" class="btn btn-danger" title="Restart ComfyUI process/container">🔄 Restart ComfyUI</button>
                </div>
                <div id="comfyuiStatus" class="mt-1 text-sm"></div>
            </div>
        `;
    }

    function wireComfyUISettings() {
        const urlInput = document.getElementById('comfyuiUrl');
        const ckptInput = document.getElementById('comfyuiCheckpoint');
        const dtypeSelect = document.getElementById('comfyuiUnetDtype');
        const fluxClipL = document.getElementById('comfyuiFluxClipL');
        const fluxT5 = document.getElementById('comfyuiFluxT5');
        const fluxVae = document.getElementById('comfyuiFluxVae');
        const ipInput = document.getElementById('comfyuiIpAdapter');
        const clipInput = document.getElementById('comfyuiClipVision');
        const weightInput = document.getElementById('comfyuiIpWeight');
        const weightValue = document.getElementById('comfyuiIpWeightValue');
        const cfgInput = document.getElementById('comfyuiCfg');
        const cfgValue = document.getElementById('comfyuiCfgValue');
        const stepsInput = document.getElementById('comfyuiSteps');
        const stepsValue = document.getElementById('comfyuiStepsValue');
        const testBtn = document.getElementById('comfyuiTestBtn');
        const saveBtn = document.getElementById('comfyuiSaveBtn');
        const restartBtn = document.getElementById('comfyuiRestartBtn');
        const statusEl = document.getElementById('comfyuiStatus');

        if (!urlInput) return;

        if (weightInput) {
            weightInput.addEventListener('input', () => {
                if (weightValue) weightValue.textContent = weightInput.value;
            });
        }
        if (cfgInput) {
            cfgInput.addEventListener('input', () => {
                if (cfgValue) cfgValue.textContent = cfgInput.value;
            });
        }
        if (stepsInput) {
            stepsInput.addEventListener('input', () => {
                if (stepsValue) stepsValue.textContent = stepsInput.value;
            });
        }

        for (let i = 0; i < 3; i++) {
            const strEl = document.getElementById('comfyuiLoraStr' + i);
            const valEl = document.getElementById('comfyuiLoraStrVal' + i);
            if (strEl && valEl) {
                strEl.addEventListener('input', () => { valEl.textContent = strEl.value; });
            }
        }

        const presetBox = document.getElementById('comfyuiLoraPresets');
        if (presetBox) {
            presetBox.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-lora-preset]');
                if (!btn) return;
                const key = btn.dataset.loraPreset;
                const preset = LORA_PRESETS[key] || [];
                const filled = [
                    preset[0] || { name: '', strength: 0.8 },
                    preset[1] || { name: '', strength: 0.8 },
                    preset[2] || { name: '', strength: 0.8 }
                ];
                writeLorasToUI(filled);
                if (statusEl) {
                    statusEl.innerHTML = key === 'none'
                        ? 'LoRAs cleared (click Save)'
                        : `Preset “${key}” applied (click Save)`;
                    statusEl.className = 'text-sm text-dim';
                }
            });
        }

        testBtn.addEventListener('click', async () => {
            if (!statusEl) return;
            statusEl.innerHTML = '<span class="spinner"></span> Testing...';
            statusEl.className = 'text-sm text-dim';

            try {
                const resp = await fetch('/api/comfyui/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl: urlInput.value })
                });

                let data;
                const text = await resp.text();

                try {
                    data = JSON.parse(text);
                } catch {
                    data = { error: text.substring(0, 200) };
                }

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

        saveBtn.addEventListener('click', () => {
            setSetting('URL', urlInput.value.trim());
            setSetting('CKPT', ckptInput.value.trim());
            if (dtypeSelect) setSetting('UNET_DTYPE', dtypeSelect.value);
            if (fluxClipL) setSetting('FLUX_CLIP_L', fluxClipL.value.trim());
            if (fluxT5) setSetting('FLUX_T5', fluxT5.value.trim());
            if (fluxVae) setSetting('FLUX_VAE', fluxVae.value.trim());
            setSetting('IPADAPTER', ipInput.value.trim());
            setSetting('CLIPVISION', clipInput.value.trim());
            if (weightInput) setSetting('IP_WEIGHT', weightInput.value);
            if (cfgInput) setSetting('CFG', cfgInput.value);
            if (stepsInput) setSetting('STEPS', stepsInput.value);
            saveLoras(readLorasFromUI());

            if (statusEl) {
                statusEl.innerHTML = '✅ Saved';
                statusEl.className = 'text-sm text-green';
                setTimeout(() => {
                    if (statusEl) statusEl.innerHTML = '';
                }, 2000);
            }
        });

        if (restartBtn) {
            restartBtn.addEventListener('click', async () => {
                if (!confirm('Restart ComfyUI? Any running generations will be cancelled.')) return;

                if (statusEl) {
                    statusEl.innerHTML = '<span class="spinner"></span> Restarting ComfyUI…';
                    statusEl.className = 'text-sm text-dim';
                }
                restartBtn.disabled = true;

                try {
                    const resp = await fetch('/api/comfyui/restart', { method: 'POST' });
                    const data = await resp.json().catch(() => ({}));

                    if (resp.ok && data.ok) {
                        if (statusEl) {
                            statusEl.innerHTML = '✅ Restart command sent. Wait ~15–30s then Test Connection.';
                            statusEl.className = 'text-sm text-green';
                        }
                    } else {
                        if (statusEl) {
                            statusEl.innerHTML = '❌ ' + (data.error || 'Restart failed');
                            statusEl.className = 'text-sm text-red';
                        }
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

        if (weightValue && weightInput) weightValue.textContent = weightInput.value;
        if (cfgValue && cfgInput) cfgValue.textContent = cfgInput.value;
        if (stepsValue && stepsInput) stepsValue.textContent = stepsInput.value;
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
            if (injectComfyUISettings() || attempts > 6) {
                clearInterval(interval);
            }
        }, 500);
    }

    const observer = new MutationObserver(() => {
        const settingsTab = document.getElementById('tab-settings');
        if (settingsTab && settingsTab.classList.contains('active')) {
            tryInject();
        }
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-tab="tab-settings"]')) {
            setTimeout(tryInject, 400);
        }
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
        #comfyuiUnetDtype {
            width: 100%;
            padding: 0.4rem 0.5rem;
            border-radius: 6px;
            border: 1px solid var(--border, #444);
            background: var(--panel-bg, #1a1a1a);
            color: inherit;
        }
    `;
    document.head.appendChild(style);

    console.log('[ComfyUI Bridge] Loaded — auto URL:', getAutoComfyUIUrl());
})();
