 (function() {
    'use strict';

    // ============================================
    // KEY COLORS
    // ============================================
    const KEY_COLORS = [
        { hex: '#00FF00', name: 'Green',   r: 0,   g: 255, b: 0   },
        { hex: '#FF00FF', name: 'Magenta', r: 255, g: 0,   b: 255 },
        { hex: '#0000FF', name: 'Blue',    r: 0,   g: 0,   b: 255 },
        { hex: '#FFFF00', name: 'Yellow',  r: 255, g: 255, b: 0   },
        { hex: '#00FFFF', name: 'Cyan',    r: 0,   g: 255, b: 255 }
    ];

    // ============================================
    // STATE
    // ============================================
    let spriteImage = null;
    let spriteFileName = '';
    let selectedKeyColor = '#00FF00';
    let offset = parseInt(localStorage.getItem('sp-offset')) || 0;
    let zoom = parseInt(localStorage.getItem('sp-zoom')) || 100;

    // Generative mode state
    let generating = false;
    let genCancelled = false;
    let genResults = [];
    let selectedResult = null;
    let charRefBase64 = null;
    let styleRefBase64 = null;
    let raceMode = 'normal';
    let aiProvider = localStorage.getItem('sg_ai_provider') || 'openai';

    function renderCanvas() {
        if (!spriteImage) return;
        const canvas = document.getElementById('spCanvas');
        const ctx = canvas.getContext('2d');
        const CW = 1280, CH = 720;
        ctx.fillStyle = selectedKeyColor;
        ctx.fillRect(0, 0, CW, CH);

        const img = spriteImage;
        const sw = img.naturalWidth, sh = img.naturalHeight;

        const tc = document.createElement('canvas');
        tc.width = sw; tc.height = sh;
        const tctx = tc.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(img, 0, 0);
        const data = tctx.getImageData(0, 0, sw, sh).data;

        let bottomRow = sh - 1;
        for (let y = sh - 1; y >= 0; y--) {
            for (let x = 0; x < sw; x++) {
                if (data[(y * sw + x) * 4 + 3] > 30) {
                    bottomRow = y;
                    y = -1; break;
                }
            }
        }

        const spriteY = CH - bottomRow - 1 + offset;
        const spriteX = Math.round((CW - sw) / 2);
        const scale = zoom / 100;
        const drawW = Math.round(sw * scale);
        const drawH = Math.round(sh * scale);
        const zoomX = spriteX + Math.round((sw - drawW) / 2);
        const zoomY = spriteY + (sh - drawH);
        ctx.drawImage(img, zoomX, zoomY, drawW, drawH);
    }

    const debouncedRender = (function() {
        let timeout;
        return function() {
            clearTimeout(timeout);
            timeout = setTimeout(renderCanvas, 50);
        };
    })();

    function autoDetectKeyColor(image, swatchContainerId) {
        if (!image) return;
        // ... (simplified for now - full version can be restored later)
        selectedKeyColor = '#00FF00';
    }

    function loadSprite(file) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            spriteImage = img;
            spriteFileName = file.name.replace(/\.\w+$/i, '');
            document.getElementById('spManualStage2').classList.remove('disabled');
            document.getElementById('spManualStage3').classList.remove('disabled');
            autoDetectKeyColor(img, 'spColorSwatches');
            renderCanvas();
        };
        img.src = url;
    }

    function initSpritePrep() {
        // Mode switching
        const modeSelector = document.getElementById('spritePrepMode');
        const manualMode = document.getElementById('spriteManualMode');
        const generateMode = document.getElementById('spriteGenerateMode');

        if (modeSelector) {
            modeSelector.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;

                modeSelector.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (btn.dataset.mode === 'manual') {
                    manualMode.classList.remove('hidden');
                    generateMode.classList.add('hidden');
                } else {
                    manualMode.classList.add('hidden');
                    generateMode.classList.remove('hidden');
                }
            });
        }

        // Generate button label update for ComfyUI
        const updateGenerateButtonLabel = () => {
            const btn = document.getElementById('sgGenerateBtn');
            if (!btn) return;
            const p = getSelectedProvider();
            if (p === 'comfyui') {
                btn.innerHTML = '🖥️ Generate Sprite (ComfyUI)';
                btn.title = 'Generate sprite(s) using local ComfyUI';
            } else if (p === 'grok') {
                btn.innerHTML = '✨ Generate Sprite (Grok Imagine)';
            } else {
                btn.innerHTML = '✨ Generate Sprite (OpenAI)';
            }
        };

        // Attach generate button
        const generateBtn = document.getElementById('sgGenerateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                // Placeholder - real generate logic would go here
                console.log('Generate clicked');
            });
        }

        console.log('[SpritePrep] Initialized');
    }

    function getSelectedProvider() {
        const container = document.getElementById('sgProvider');
        const active = container?.querySelector('.mode-btn.active');
        return active?.dataset.provider || 'openai';
    }

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();