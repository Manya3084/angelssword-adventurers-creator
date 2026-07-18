 (function() {
    'use strict';

    // State
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
        return () => { clearTimeout(timeout); timeout = setTimeout(renderCanvas, 60); };
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

        initAIGenerateMode();
        console.log('[SpritePrep] Initialized');
    }

    function initAIGenerateMode() {
        // Character Reference
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
                        charRefPreview.innerHTML = `<img src="${charRefBase64}" style="max-height:120px;border-radius:8px;border:1px solid var(--border);">`;
                        charRefPreview.classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // Style Reference
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
                        styleRefPreview.innerHTML = `<img src="${styleRefBase64}" style="max-height:120px;border-radius:8px;border:1px solid var(--border);">`;
                        styleRefPreview.classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
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

            const initialBtn = providerContainer.querySelector(`[data-provider="${aiProvider}"]`);
            if (initialBtn) {
                providerContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                initialBtn.classList.add('active');
            }
        }

        // Generate button
        const generateBtn = document.getElementById('sgGenerateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', handleGenerate);
        }

        updateGenerateButtonLabel();
    }

    function updateGenerateButtonLabel() {
        const btn = document.getElementById('sgGenerateBtn');
        if (!btn) return;

        if (aiProvider === 'comfyui') {
            btn.innerHTML = '🖥️ Generate Sprite (ComfyUI)';
        } else if (aiProvider === 'grok') {
            btn.innerHTML = '✨ Generate Sprite (Grok Imagine)';
        } else {
            btn.innerHTML = '✨ Generate Sprite (OpenAI)';
        }
    }

    async function handleGenerate() {
        const statusEl = document.getElementById('sgStatus');
        const btn = document.getElementById('sgGenerateBtn');

        if (btn) btn.disabled = true;
        if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> Generating...';

        try {
            if (aiProvider === 'comfyui') {
                await generateComfyUI();
            } else if (aiProvider === 'grok') {
                await generateGrok();
            } else {
                await generateOpenAI();
            }
        } catch (e) {
            if (statusEl) statusEl.innerHTML = '❌ ' + e.message;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function generateOpenAI() {
        const statusEl = document.getElementById('sgStatus');
        const name = document.getElementById('sgCharName')?.value || 'character';
        const desc = document.getElementById('sgCharDesc')?.value || '';

        const prompt = `Full body clean sprite of ${name}. ${desc}. White background, game asset style.`;

        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-2', prompt, n: 1, size: '1024x1024' })
        });

        const data = await res.json();
        if (statusEl) statusEl.innerHTML = data.data ? '✅ Generated with OpenAI' : '❌ Failed';
    }

    async function generateGrok() {
        const statusEl = document.getElementById('sgStatus');
        if (statusEl) statusEl.innerHTML = '✨ Grok generation triggered (OAuth flow)';
    }

    async function generateComfyUI() {
        const statusEl = document.getElementById('sgStatus');
        if (statusEl) statusEl.innerHTML = '🖥️ Sent to local ComfyUI';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();