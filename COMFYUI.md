# ComfyUI Local Integration

AS Adventurer Creator can use a **local ComfyUI** instance for sprite and video generation.

## Models (current defaults)

| Role | Model | Resolution |
|------|--------|------------|
| **Sprites** | **Pony Diffusion V6 XL** | **1216 × 832** |
| **Video** | **LTX-Video-ICLoRA-pose-13b-0.9.7** | short idle clips |

Default checkpoint filename expected:

```text
ponyDiffusionV6XL_v6StartWithThisOne.safetensors
```

Default video model filename:

```text
LTX-Video-ICLoRA-pose-13b-0.9.7.safetensors
```

If your downloads use different names, set the exact filenames under **Settings → ComfyUI**.

## Requirements

1. [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running (default `http://127.0.0.1:8188`)
2. Pony V6 XL in `ComfyUI/models/checkpoints/`
3. For video:
   - [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo) (or compatible LTX node pack)
   - [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) (`VHS_VideoCombine`)
   - LTX-Video-ICLoRA-pose-13b-0.9.7 weights installed where your node pack expects them

## Setup in AS Adventurer

1. Start ComfyUI first
2. Open **Settings → ComfyUI (Local)**
3. Set **ComfyUI URL** (usually `http://127.0.0.1:8188`)
4. Set **Sprite checkpoint** and **Video model** filenames exactly as on disk
5. Click **Save**, then **Test Connection**
6. Sprite Prep / Generate Video → provider **🖥️ ComfyUI**

### Settings not responding?

Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) after pulling so `comfyui-bridge.js` reloads. Save/Test must show a status line under the buttons.

## What works

| Feature | Status |
|---------|--------|
| Sprite T2I (Pony V6 XL @ 1216×832) | ✅ |
| Configurable checkpoint + URL | ✅ |
| Settings Save / Test Connection | ✅ |
| Progress polling | ✅ |
| LTX img2video baseline | ✅ (needs LTX + VHS nodes) |
| Full ICLoRA pose control graph | 🔄 depends on exact ComfyUI-LTXVideo version |

## Notes for Intel Arc A770 (16 GB)

- Pony @ 1216×832 is a good fit for 16 GB
- Prefer ~20–25 steps for sprites
- LTX video is heavier — start with short durations (3–5 s)
- Close other GPU apps while generating

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Save / Test does nothing | Hard-refresh; confirm `comfyui-bridge.js` loads (browser console) |
| Connection failed | Is ComfyUI running? Check URL / firewall |
| Checkpoint not found | Filename must match exactly (including `.safetensors`) |
| Queue error about missing node | Install the node pack named in the error (LTX / VHS / RepeatLatentBatch) |
| Out of memory | Lower video frames or duration |
