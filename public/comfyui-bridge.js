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
            <div class="settings-section">
                <h3>ComfyUI Local</h3>
                
                <div class="setting-item">
                    <label>ComfyUI URL</label>
                    <input type="text" id="comfyuiUrl" value="${getSetting('URL')}">
                </div>

                <div class="setting-item">
                    <label>Sprite Checkpoint</label>
                    <input type="text" id="comfyuiCheckpoint" value="${getSetting('CKPT')}">
                </div>

                <div class="setting-item">
                    <label>IP-Adapter Model</label>
                    <input type="text" id="comfyuiIpAdapter" value="${getSetting('IPADAPTER')}">
                </div>

                <div class="setting-item">
                    <label>CLIP Vision Model</label>
                    <input type="text" id="comfyuiClipVision" value="${getSetting('CLIPVISION')}">
                </div>

                <div class="setting-item">
                    <label>IP-Adapter Weight</label>
                    <input type="range" id="comfyuiIpWeight" min="0" max="2" step="0.05" value="${getSetting('IP_WEIGHT')}">
                    <span id="comfyuiIpWeightValue">${getSetting('IP_WEIGHT')}</span>
                </div>

                <div class="setting-actions">
                    <button id="comfyuiTestBtn" class="btn">Test Connection</button>
                    <button id="comfyuiSaveBtn" class="btn primary">Save</button>
                    <span id="comfyuiStatus" class="status-text"></span>
                </div>
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

        if (!urlInput) return;

        weightInput.addEventListener('input', () => {
            weightValue.textContent = weightInput.value;
        });

        testBtn.addEventListener('click', async () => {
            statusEl.textContent = 'Testing...';
            statusEl.className = 'status-text';

            try {
                const resp = await fetch('/api/comfyui/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl: urlInput.value })
                });
                const data = await resp.json();

                if (resp.ok) {
                    statusEl.textContent = '✅ Connected';
                    statusEl.className = 'status-text success';
                } else {
                    statusEl.textContent = '❌ Failed';
                    statusEl.className = 'status-text error';
                }
            } catch (e) {
                statusEl.textContent = '❌ ' + e.message;
                statusEl.className = 'status-text error';
            }
        });

        saveBtn.addEventListener('click', () => {
            setSetting('URL', urlInput.value.trim());
            setSetting('CKPT', ckptInput.value.trim());
            setSetting('IPADAPTER', ipInput.value.trim());
            setSetting('CLIPVISION', clipInput.value.trim());
            setSetting('IP_WEIGHT', weightInput.value);

            statusEl.textContent = '✅ Saved';
            statusEl.className = 'status-text success';

            setTimeout(() => { if (statusEl.textContent === '✅ Saved') statusEl.textContent = ''; }, 2000);
        });

        weightValue.textContent = weightInput.value;
    }

    function initComfyUISettings() {
        const settingsContent = document.getElementById('settingsContent');
        if (!settingsContent || document.getElementById('comfyuiUrl')) return;

        const section = document.createElement('div');
        section.innerHTML = buildComfyUISettingsHTML();
        settingsContent.appendChild(section.firstElementChild);

        wireComfyUISettings();
    }

    const observer = new MutationObserver(() => {
        if (document.getElementById('settingsModal') && !document.getElementById('comfyuiUrl')) {
            initComfyUISettings();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initComfyUISettings);
    } else {
        setTimeout(initComfyUISettings, 800);
    }

    console.log('[ComfyUI Bridge] Settings panel restored');
})();