# ComfyUI Local Integration

AS Adventurer Creator can use a **local ComfyUI** instance for sprite and video generation.

## Requirements

1. [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running locally (default `http://127.0.0.1:8188`)
2. **Animagine XL 4.0** (or any SDXL checkpoint) installed in `ComfyUI/models/checkpoints/`
3. For better video later: AnimateDiff Evolved + Video Helper Suite (optional for v1)

## Setup in AS Adventurer

1. Start ComfyUI first
2. Open **Settings → ComfyUI (Local)**
3. Set URL (usually `http://127.0.0.1:8188`)
4. Set checkpoint filename exactly as it appears in ComfyUI (e.g. `animagine-xl-4.0.safetensors`)
5. Click **Test Connection**
6. In Sprite Prep / Generate Video, choose provider **🖥️ ComfyUI**

## What works in this version

| Feature | Status |
|---------|--------|
| Sprite T2I (SDXL / Animagine) | ✅ Full |
| Custom checkpoint name | ✅ |
| Progress polling | ✅ |
| Video (img2img baseline) | ✅ Basic |
| Full AnimateDiff multi-frame | 🔜 Needs matching node pack |

## Notes for Arc A770

- 16 GB is comfortable for SDXL at 1280×720
- Prefer 20–28 steps
- Close other GPU apps while generating

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Connection failed | Is ComfyUI running? Check URL / firewall |
| Checkpoint not found | Filename must match exactly (including `.safetensors`) |
| Queue error about missing node | Install the node pack named in the error |
| Out of memory | Lower resolution or steps |
