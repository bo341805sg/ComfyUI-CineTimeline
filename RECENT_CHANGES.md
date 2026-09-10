# September 2026 continuation updates

- Imported 24 fps videos are checked by decoded frame count, not container duration. Up to six surplus frames (0.25 seconds) are accepted and trimmed into a separate normalized copy. Originals are retained. Short clips, larger overruns and other frame rates are rejected; the importer never guesses a 22-frame overlap trim.
- Imported clips can queue a VAE-only audio/video continuation-cache build. Older imports have a build/retry action. Results are bound to the asset and version that requested them, not blindly to the currently selected shot.
- Imported AV caches reconstruct the visible tail; they are not the original sampler latent. Current H3 routing uses 22 video frames and 24 audio frames of context. Cache construction encodes the final 39 visible frames and aligned audio.
- Shot titles are editable; displayed ordinal numbers follow timeline order while stable shot IDs continue to own references and render history.
- Include exact delivered-length finalization, native/FlashVSR/H3 postprocess routing and the H3 Turbo LoRA format adapter. New graphs default to native output; existing public planner selector sockets remain compatible.
- Fix targeted editor-state routing, simultaneous reference-tag renumbering and keyframe guide offsets after the continuation head.

## Dependencies and limits

Imported AV-cache construction and visible-tail finalization require the installed H3 Motion Context plugin (`MiniMaxH3MotionContextSaveLatent`), compatible H3 video and audio VAEs, PyAV and imageio-ffmpeg. The source must contain a usable audio track. The Turbo adapter additionally requires a registered `MiniMaxH3TurboLoRA` loader; postprocessing requires the nodes/models selected by the user's graph.

The frontend cache builder currently expects one CineTimeline generation chain with `CineExactSegment`, H3 reference/keyframe conditioning and VAE/size dependencies from its explicit allowlist. Unsupported or ambiguous dependencies fail with a retryable message rather than submitting the main graph. Keep the editor open until registration completes. If resolution changes, rebuild a compatible cache; existing latents cannot be resized implicitly.

A local two-adult-dialogue test passed source generation, real MP4 normalization, reconstructed AV cache and subsequent 15-second continuation at 1152x640/24 fps. Both clips passed full audio/video decoding and delivered 360 frames each. This is backend execution evidence, not a guarantee of seamless motion, voice, lip synchronization or a browser-interaction acceptance test. No test media, model files, personal workflows or service credentials are distributed.

## Local regression commands

Run `python -m unittest discover -s tests -p 'test_*.py'` and each `tests/test_*.cjs` with Node.js. Python tests that need ComfyUI use isolated stubs or import only the tested module. Optional VAE/GPU sampling is not run by these commands.
