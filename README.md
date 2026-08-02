# ComfyUI-CineTimeline

Model-neutral multi-reference timeline nodes for AI film workflows in ComfyUI.
Version 0.1 establishes a stable, testable data contract before adding a
drag-and-drop frontend editor.

## Nodes

- `CineTimeline Editor`: validates and normalizes timeline JSON.
- `CineTimeline Shot Output`: selects a shot by ID or frame.
- `CineTimeline Reference Output`: selects active references for a frame range.
- `CineTimeline LTX 2.3 Adapter`: converts one shot to an LTX-specific plan.
- `CineTimeline LTX Reference Images`: reorders an input image batch to match
  active references and emits per-image guide metadata.
- `CineTimeline LTX Guide Slot`: exposes one active reference's local frame
  range, strength, type, and image index for public LTX guide nodes.
- `CineTimeline Test Output`: terminal output used for queue/API validation.

References support `character`, `costume`, `scene`, `prop`, `pose`,
`storyboard`, `first_frame`, `last_frame`, and `audio`. Every reference has an
active frame range, strength, target identity, priority, adapter hint, and an
optional `image_index` into a connected ComfyUI image batch.

Ranges are half-open: `start_frame` is included and `end_frame` is excluded.
Shots cannot overlap. References may overlap and are ordered by priority.

## Current validation boundary

- Core schema and node unit tests: 12 passed.
- Installed in the shared formal custom-node library on 2026-08-02.
- All six nodes registered in ComfyUI 0.28.0 on port 8189.
- The API test workflow completed successfully with prompt ID
  `f15bdf2d-704c-46cd-ad33-81eb508f53fe`.
- The backend/API suite passes 13/13 tests and all seven nodes load in the shared
  8188/8189 installation.
- Real LTX 2.3 generation is validated on 8189: the T2V baseline, timed public
  Guide experiment, and distilled dual-character IC-LoRA pipeline all completed.
- The validated dual-character pipeline uses distilled LoRA 0.5, dual-character
  IC-LoRA 1.0, `LTXAddVideoICLoRAGuide`, the official 8-step sigma schedule, and
  `euler_ancestral_cfg_pp`. Its one-second 384x256 run is a wiring smoke test;
  production dialogue shots should follow the LoRA author's >=10 second guidance.

The LTX adapter and Guide Slot now drive concrete public LTX Guide nodes. Ordinary
timed guides can schedule keyframes but may morph one character into another;
simultaneous character identity should use the validated dual-character IC-LoRA
example instead.
