function updateGenerateButtonLabel() {
    const btn = document.getElementById('sgGenerateBtn');
    if (!btn) return;
    const p = getSelectedProvider();
    if (p === 'comfyui') {
        btn.innerHTML = '🖥️ Generate Sprite (ComfyUI)';
        btn.title = 'Generate sprite(s) using local ComfyUI (Pony Diffusion V6 XL + optional IP-Adapter)';
    } else if (p === 'grok') {
        btn.innerHTML = '✨ Generate Sprite (Grok Imagine)';
        btn.title = 'Generate sprite(s) using Grok Imagine (SuperGrok)';
    } else {
        btn.innerHTML = '✨ Generate Sprite (OpenAI)';
        btn.title = 'Generate sprite(s) using GPT Image 2';
    }
}