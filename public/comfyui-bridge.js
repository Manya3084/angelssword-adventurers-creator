 (function() {
    'use strict';

    const STORAGE = {
        URL: 'comfyui_base_url',
        CKPT: 'comfyui_checkpoint',
        IPADAPTER: 'comfyui_ipadapter_model',
        CLIPVISION: 'comfyui_clip_vision_model',
        IP_WEIGHT: 'comfyui_ipadapter_weight'
    };

    const DEFAULTS = {
        URL: 'http://127.0.0.1:8188',
        CKPT: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
        IPADAPTER: 'ip-adapter-plus-face_sdxl_vit-h.safetensors',
        CLIPVISION: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        IP_WEIGHT: 0.55
    };

    function getSetting(key) {
        return localStorage.getItem(STORAGE[key]) || DEFAULTS[key];
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

                <div class="btn-group mt-2">
                    <button id="comfyuiTestBtn" class="btn btn-secondary">Test Connection</button>
                    <button id="comfyuiSaveBtn" class="btn btn-primary">Save Settings</button>
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
        const statusEl = document.getElementById('comfyuiStatus');

        if (!urlInput || !weightInput) return;

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
                const data = await resp.json();

                if (resp.ok) {
                    statusEl.innerHTML = '✅ Connected to ComfyUI';
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
                statusEl.innerHTML = '✅ Settings saved';
                statusEl.className = 'text-sm text-green';
                setTimeout(() => {
                    if (statusEl && statusEl.innerHTML.includes('saved')) {
                        statusEl.innerHTML = '';
                    }
                }, 2000);
            }
        });

        if (weightValue) weightValue.textContent = weightInput.value;
    }

    function injectComfyUISettings() {
        // Try multiple possible containers
        let container = document.querySelector('#tab-settings .settings-section');
        if (!container) container = document.getElementById('settingsContent');
        if (!container) container = document.querySelector('#tab-settings');

        if (!container) return false;
        if (document.getElementById('comfyuiSettingsPanel')) return true;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildComfyUISettingsHTML();
        container.appendChild(wrapper.firstElementChild);

        wireComfyUISettings();
        return true;
    }

    function tryInject() {
        if (injectComfyUISettings()) return;

        // Retry a few times in case the DOM is still loading
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (injectComfyUISettings() || attempts > 8) {
                clearInterval(interval);
            }
        }, 400);
    }

    // Watch for Settings tab becoming active
    const observer = new MutationObserver(() => {
        const settingsTab = document.getElementById('tab-settings');
        if (settingsTab && settingsTab.classList.contains('active')) {
            tryInject();
        }
    });

    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

    // Also try on load and when clicking Settings tab
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-tab="tab-settings"]')) {
            setTimeout(tryInject, 300);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(tryInject, 800));
    } else {
        setTimeout(tryInject, 800);
    }

    console.log('[ComfyUI Bridge] Loaded - will inject settings when Settings tab is opened');
})();