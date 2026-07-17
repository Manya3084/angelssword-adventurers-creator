/**
 * ⚔️ ComfyUI bridge helpers used by sprite-prep.js / video-gen.js / app.js
 * Keeps provider wiring small and centralized.
 */
(function () {
    'use strict';

    function ensureClient() {
        if (!window.ComfyUIClient) {
            throw new Error('ComfyUI client not loaded (comfyui-client.js)');
        }
        return window.ComfyUIClient;
    }

    async function ensureReachable() {
        const c = ensureClient();
        try {
            await c.testConnection();
        } catch (e) {
            throw new Error(
                'Cannot reach ComfyUI at ' + c.getBaseUrl() +
                '. Start ComfyUI and check Settings → ComfyUI URL. (' + e.message + ')'
            );
        }
    }

    /**
     * Generate one sprite via local ComfyUI (Animagine XL / SDXL checkpoint).
     */
    async function generateSprite(promptText, onProgress) {
        await ensureReachable();
        const c = ensureClient();
        return c.generateSprite({
            prompt: promptText,
            width: 1280,
            height: 720,
            onProgress
        });
    }

    /**
     * Generate one video via local ComfyUI from a data URL image.
     */
    async function generateVideo(promptText, imageDataUrl, duration, onProgress) {
        await ensureReachable();
        const c = ensureClient();
        return c.generateVideo({
            prompt: promptText,
            imageDataUrl,
            duration,
            onProgress
        });
    }

    function initSettingsUI() {
        const urlInput = document.getElementById('settingsComfyUrl');
        const ckptInput = document.getElementById('settingsComfyCkpt');
        const saveBtn = document.getElementById('settingsComfySave');
        const testBtn = document.getElementById('settingsComfyTest');
        const statusEl = document.getElementById('settingsComfyStatus');

        if (!urlInput) return; // panel not in DOM yet

        const c = window.ComfyUIClient;
        if (!c) return;

        urlInput.value = c.getBaseUrl();
        if (ckptInput) ckptInput.value = c.getCheckpoint();

        saveBtn?.addEventListener('click', () => {
            c.setBaseUrl(urlInput.value.trim() || c.DEFAULT_URL);
            if (ckptInput) c.setCheckpoint(ckptInput.value.trim() || c.DEFAULT_CKPT);
            showToast('ComfyUI settings saved', 'success');
        });

        testBtn?.addEventListener('click', async () => {
            c.setBaseUrl(urlInput.value.trim() || c.DEFAULT_URL);
            if (ckptInput) c.setCheckpoint(ckptInput.value.trim() || c.DEFAULT_CKPT);
            if (statusEl) statusEl.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Testing ComfyUI…</div>';
            try {
                const stats = await c.testConnection();
                if (statusEl) {
                    statusEl.innerHTML = '<div class="status-msg success">✅ ComfyUI connected' +
                        (stats?.system?.comfyui_version ? ' · v' + stats.system.comfyui_version : '') +
                        '</div>';
                }
                showToast('ComfyUI connection OK', 'success');
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
                showToast(err.message, 'error');
            }
        });
    }

    // Hook settings after DOM ready (runs after app.js init if loaded later)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initSettingsUI, 50));
    } else {
        setTimeout(initSettingsUI, 50);
    }

    window.ComfyBridge = {
        generateSprite,
        generateVideo,
        ensureReachable,
        initSettingsUI
    };
})();
