(function() {
    'use strict';

    // ==================== KEY COLORS ====================
    const KEY_COLORS = [
        { hex: '#00FF00', name: 'Green',   r: 0,   g: 255, b: 0   },
        { hex: '#FF00FF', name: 'Magenta', r: 255, g: 0,   b: 255 },
        { hex: '#0000FF', name: 'Blue',    r: 0,   g: 0,   b: 255 },
        { hex: '#FFFF00', name: 'Yellow',  r: 255, g: 255, b: 0   },
        { hex: '#00FFFF', name: 'Cyan',    r: 0,   g: 255, b: 255 }
    ];

    let spriteImage = null;
    let spriteFileName = '';
    let selectedKeyColor = '#00FF00';
    let offset = parseInt(localStorage.getItem('sp-offset')) || 0;
    let zoom = parseInt(localStorage.getItem('sp-zoom')) || 100;

    // Generative state
    let charRefBase64 = null;
    let styleRefBase64 = null;
    let aiProvider = localStorage.getItem('sg_ai_provider') || 'openai';

    function renderCanvas() {
        if (!spriteImage) return;

        const canvas = document.getElementById('spCanvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const CW = 1280, CH = 720;

        ctx.fillStyle = selectedKeyColor;
        ctx.fillRect(0, 0, CW, CH);

        const img = spriteImage;
        const scale = zoom / 100;
        const drawW = Math.round(img.naturalWidth * scale);
        const drawH = Math.round(img.naturalHeight * scale);
        const x = Math.round((CW - drawW) / 2);
        const y = CH - drawH + offset;

        ctx.drawImage(img, x, y, drawW, drawH);
    }

    const debouncedRender = (() => {
        let timeout;
        return () => {
            clearTimeout(timeout);
            timeout = setTimeout(renderCanvas, 60);
        };
    })();

    function loadSprite(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                spriteImage = img;
                spriteFileName = file.name.replace(/\.\w+$/i, '');
                document.getElementById('spManualStage2').classList.remove('disabled');
                document.getElementById('spManualStage3').classList.remove('disabled');
                renderCanvas();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function initSpritePrep() {
        // Mode switching (Manual vs Generate AI)
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

        // Update Generate button label based on provider
        function updateGenerateButtonLabel() {
            const btn = document.getElementById('sgGenerateBtn');
            if (!btn) return;

            const provider = getSelectedProvider();
            if (provider === 'comfyui') {
                btn.innerHTML = '🖥️ Generate Sprite (ComfyUI)';
                btn.title = 'Generate using local ComfyUI';
            } else if (provider === 'grok') {
                btn.innerHTML = '✨ Generate Sprite (Grok Imagine)';
            } else {
                btn.innerHTML = '✨ Generate Sprite (OpenAI)';
            }
        }

        function getSelectedProvider() {
            const container = document.getElementById('sgProvider');
            const active = container?.querySelector('.mode-btn.active');
            return active?.dataset.provider || 'openai';
        }

        // Character Reference Upload
        const charRefInput = document.getElementById('sgCharRefInput');
        const charRefPreview = document.getElementById('sgCharRefPreview');

        if (charRefInput) {
            charRefInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    charRefBase64 = ev.target.result;
                    if (charRefPreview) {
                        charRefPreview.innerHTML = `<img src="${charRefBase64}" style="max-height:120px; border-radius:8px;">`;
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // Style Reference Upload
        const styleRefInput = document.getElementById('sgStyleRefInput');
        const styleRefPreview = document.getElementById('sgStyleRefPreview');

        if (styleRefInput) {
            styleRefInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    styleRefBase64 = ev.target.result;
                    if (styleRefPreview) {
                        styleRefPreview.innerHTML = `<img src="${styleRefBase64}" style="max-height:120px; border-radius:8px;">`;
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // Generate button
        const generateBtn = document.getElementById('sgGenerateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                const provider = getSelectedProvider();
                console.log('Generate clicked with provider:', provider);
                alert('Generate clicked with provider: ' + provider + '\n(Full generation logic can be added here)');
            });
        }

        // Provider buttons
        const providerContainer = document.getElementById('sgProvider');
        if (providerContainer) {
            providerContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;

                providerContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                aiProvider = btn.dataset.provider;
                localStorage.setItem('sg_ai_provider', aiProvider);
                updateGenerateButtonLabel();
            });
        }

        // Set initial active provider
        const initialProviderBtn = providerContainer?.querySelector(`[data-provider="${aiProvider}"]`);
        if (initialProviderBtn) {
            providerContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            initialProviderBtn.classList.add('active');
        }

        updateGenerateButtonLabel();

        console.log('[SpritePrep] Initialized successfully');
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();
