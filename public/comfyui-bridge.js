(function() {
    'use strict';

    const STORAGE = {
        URL: 'comfyui_base_url',
        CKPT: 'comfyui_checkpoint',
        IPADAPTER: 'comfyui_ipadapter_model',
        CLIPVISION: 'comfyui_clip_vision_model',
        IP_WEIGHT: 'comfyui_ipadapter_weight'
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
        CKPT: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
        IPADAPTER: 'ip-adapter-plus-face_sdxl_vit-h.safetensors',
        CLIPVISION: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        IP_WEIGHT: 0.55
    };

    function getSetting(key) {
        const saved = localStorage.getItem(STORAGE[key]);
        if (saved !== null && saved !== '') return saved;
        return DEFAULTS[key];
    }

    function setSetting(key, value) {
        localStorage.setItem(STORAGE[key], value);
    }

    function buildComfyUISettingsHTML() {
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
                    <label>Sprite Checkpoint</label>
                    <input type="text" id="comfyuiCheckpoint" value="${getSetting('CKPT')}">
                </div>

                <div class="form-row">
                    <label>IP-Adapter Model</label>
                    <input type="text" id="comfyuiIpAdapter" value="${getSetting('IPADAPTER')}">
                </div>

                <div class="form-row">
                    <label>CLIP Vision Model</label>
                    <input type="text" id="comfyuiClipVision" value="${getSetting('CLIPVISION')}">
                </div>

                <div class="form-row">
                    <label>IP-Adapter Weight <span id="comfyuiIpWeightValue" class="text-gold">${getSetting('IP_WEIGHT')}</span></label>
                    <input type="range" id="comfyuiIpWeight" min="0" max="2" step="0.05" value="${getSetting('IP_WEIGHT')}">
                </div>

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
        const ipInput = document.getElementById('comfyuiIpAdapter');
        const clipInput = document.getElementById('comfyuiClipVision');
        const weightInput = document.getElementById('comfyuiIpWeight');
        const weightValue = document.getElementById('comfyuiIpWeightValue');
        const testBtn = document.getElementById('comfyuiTestBtn');
        const saveBtn = document.getElementById('comfyuiSaveBtn');
        const restartBtn = document.getElementById('comfyuiRestartBtn');
        const statusEl = document.getElementById('comfyuiStatus');

        if (!urlInput) return;

        weightInput.addEventListener('input', () => {
            if (weightValue) weightValue.textContent = weightInput.value;
        });

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
            setSetting('IPADAPTER', ipInput.value.trim());
            setSetting('CLIPVISION', clipInput.value.trim());
            setSetting('IP_WEIGHT', weightInput.value);

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

        if (weightValue) weightValue.textContent = weightInput.value;
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
    `;
    document.head.appendChild(style);

    console.log('[ComfyUI Bridge] Loaded — auto URL:', getAutoComfyUIUrl());
})();
