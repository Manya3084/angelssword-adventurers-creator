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
        UNET_DTYPE: 'comfyui_unet_dtype',
        PULID_FILE: 'comfyui_pulid_file',
        PULID_WEIGHT: 'comfyui_pulid_weight',
        INSIGHTFACE_PROVIDER: 'comfyui_insightface_provider',
        WAN_UNET: 'comfyui_wan_unet',
        WAN_VAE: 'comfyui_wan_vae',
        WAN_TEXT_ENCODER: 'comfyui_wan_text_encoder',
        WAN_CLIP_VISION: 'comfyui_wan_clip_vision',
        WAN_WIDTH: 'comfyui_wan_width',
        WAN_HEIGHT: 'comfyui_wan_height',
        WAN_FRAMES: 'comfyui_wan_frames',
        WAN_STEPS: 'comfyui_wan_steps',
        WAN_CFG: 'comfyui_wan_cfg',
        WAN_USE_GGUF: 'comfyui_wan_use_gguf'
    };

    console.log('[ComfyUI Bridge] partial restore - copy full file from artifacts');
})();
