# ComfyUI Local Integration

AS Adventurer Creator can use a **local ComfyUI** instance for sprite and video generation.

## Models (current defaults)

| Role | Model | Notes |
|------|--------|-------|
| **Sprites** | **Pony Diffusion V6 XL** | 1216 × 832 |
| **Character identity** | **IP-Adapter Plus Face SDXL** | Used when Character Reference is uploaded |
| **Video** | **LTX-Video-ICLoRA-pose-13b-0.9.7** | Short idle clips |

### Default filenames

```text
ponyDiffusionV6XL_v6StartWithThisOne.safetensors
ip-adapter-plus-face_sdxl_vit-h.safetensors
CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors
LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors
```

Change exact names under **Settings → ComfyUI** if yours differ.

## Requirements

1. [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running (`http://127.0.0.1:8188`)
2. Pony V6 XL in `ComfyUI/models/checkpoints/`
3. **Character Reference (IP-Adapter)** — optional but recommended:
   - [ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
   - `models/ipadapter/ip-adapter-plus-face_sdxl_vit-h.safetensors`
     (or `ip-adapter-plus_sdxl_vit-h.safetensors`)
   - `models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`
4. **Video:**
   - [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo)
   - [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)

## Character Reference behaviour

| Situation | Workflow |
|-----------|----------|
| No Character Reference uploaded | Plain T2I (Pony prompt only) |
| Character Reference uploaded | Upload image → **IP-Adapter Advanced** + Pony T2I |

IP-Adapter weight defaults to **0.75** (adjustable in Settings, ~0.6–0.85 recommended).

## Setup in AS Adventurer

1. Start ComfyUI
2. **Settings → ComfyUI**
   - URL, sprite checkpoint, video model
   - IP-Adapter model, CLIP Vision, weight
3. **Save** → green ✅ status + toast
4. **Test Connection**
5. Sprite Prep → upload **Character Reference** (optional) → provider **ComfyUI** → Generate

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Save / Test does nothing | Hard-refresh; confirm `comfyui-bridge.js` loads |
| Connection failed | Is ComfyUI running? Check URL |
| Checkpoint / IP-Adapter not found | Filename must match exactly |
| `IPAdapterAdvanced` / `CLIPVisionLoader` missing | Install ComfyUI_IPAdapter_plus |
| Weak likeness | Raise IP-Adapter weight; use face-plus weights; clear face crop in ref |
| Too locked / artifacts | Lower weight to ~0.55–0.65 |
