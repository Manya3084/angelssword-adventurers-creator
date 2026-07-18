 (function() {
    'use strict';

    // State
    let spriteImage = null;
    let spriteFileName = '';
    let selectedKeyColor = '#00FF00';
    let selectedRaceMode = 'normal';
    let selectedGenCount = 1;
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
        // Race Mode
        const raceModeContainer = document.getElementById('sgRaceMode');
        if (raceModeContainer) {
            raceModeContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.mode-btn');
                if (!btn) return;

                raceModeContainer.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                selectedRaceMode = btn.dataset.mode || 'normal';
            });

            const defaultBtn = raceModeContainer.querySelector('.mode-btn.active') || raceModeContainer.querySelector('.mode-btn');
            if (defaultBtn) {
                defaultBtn.classList.add('active');
                selectedRaceMode = defaultBtn.dataset.mode || 'normal';
            }
        }

        // Key Color
        const colorSwatches = document.getElementById('sgColorSwatches');
        if (colorSwatches) {
            colorSwatches.addEventListener('click', (e) => {
                const swatch = e.target.closest('.color-swatch');
                if (!swatch) return;

                colorSwatches.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');

                selectedKeyColor = swatch.dataset.color || '#00FF00';
            });

            const initialSwatch = colorSwatches.querySelector('.color-swatch.selected') || colorSwatches.querySelector('.color-swatch');
            if (initialSwatch) {
                initialSwatch.classList.add('selected');
                selectedKeyColor = initialSwatch.dataset.color || '#00FF00';
            }
        }

        // Simultaneous Generations Count
        const genCountContainer = document.getElementById('sgGenCount');
        if (genCountContainer) {
            genCountContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.gen-count-btn');
                if (!btn) return;

                genCountContainer.querySelectorAll('.gen-count-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                selectedGenCount = parseInt(btn.dataset.count) || 1;
            });

            const defaultCountBtn = genCountContainer.querySelector('.gen-count-btn.active') || genCountContainer.querySelector('.gen-count-btn');
            if (defaultCountBtn) {
                defaultCountBtn.classList.add('active');
                selectedGenCount = parseInt(defaultCountBtn.dataset.count) || 1;
            }
        }

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

        console.log('[Generate] Button clicked. Provider:', aiProvider);

        if (btn) btn.disabled = true;
        if (statusEl) {
            statusEl.innerHTML = '<span class="spinner"></span> Generating...';
            statusEl.style.color = '';
        }

        try {
            if (aiProvider === 'comfyui') {
                await generateComfyUI(statusEl);
            } else if (aiProvider === 'grok') {
                await generateGrok(statusEl);
            } else {
                await generateOpenAI(statusEl);
            }
        } catch (e) {
            console.error('[Generate] Error:', e);
            if (statusEl) {
                statusEl.innerHTML = '❌ Error: ' + (e.message || e);
                statusEl.style.color = 'var(--red, red)';
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function generateOpenAI(statusEl) {
        const name = document.getElementById('sgCharName')?.value || 'character';
        const desc = document.getElementById('sgCharDesc')?.value || '';

        const prompt = `Full body clean sprite of ${name}. ${desc}. White background, game asset style. Race: ${selectedRaceMode}.`;

        console.log('[Generate] Calling OpenAI with prompt:', prompt);

        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-image-2',
                prompt: prompt,
                n: selectedGenCount,
                size: '1024x1024'
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OpenAI request failed: ${res.status} - ${errText}`);
        }

        const data = await res.json();

        if (data.data && data.data.length > 0) {
            if (statusEl) statusEl.innerHTML = `✅ Generated ${data.data.length} sprite(s) with OpenAI`;
            console.log('[Generate] Success:', data);
        } else {
            throw new Error(data.error || 'No images returned from OpenAI');
        }
    }

    async function generateGrok(statusEl) {
        if (statusEl) statusEl.innerHTML = '✨ Grok generation requires full OAuth implementation (coming soon)';
        console.log('[Generate] Grok path selected (stub)');
    }

    async function generateComfyUI(statusEl) {
        if (statusEl) statusEl.innerHTML = '🖥️ ComfyUI generation requires workflow configuration';
        console.log('[Generate] ComfyUI path selected (stub)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpritePrep);
    } else {
        initSpritePrep();
    }

})();