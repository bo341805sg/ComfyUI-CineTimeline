from __future__ import annotations

import importlib
import json


def _conditioning_builder():
    module = importlib.import_module("custom_nodes.minimax-h3-audio-T8.conditioning")
    return module.build_conditioning


class CineTimelineH3ReferenceConditioning:
    """Route only the current segment's image references into the installed T8 conditioner."""

    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            f"image{index}": ("IMAGE",) for index in range(1, 10)
        }
        return {
            "required": {
                "clip": ("CLIP",),
                "video_vae": ("VAE",),
                "audio_vae": ("VAE",),
                "prompt": ("STRING", {"multiline": True}),
                "width": ("INT", {"default": 864, "min": 32, "max": 16384, "step": 32}),
                "height": ("INT", {"default": 480, "min": 32, "max": 16384, "step": 32}),
                "length": ("INT", {"default": 124, "min": 5, "max": 3600}),
                "reference_plan_json": ("STRING", {"forceInput": True}),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT", "AUDIO", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "positive", "av_latent", "mux_audio", "conditioned_prompt",
        "media_map_json", "report",
    )
    FUNCTION = "build"
    CATEGORY = "CineTimeline/internal"

    def build(self, clip, video_vae, audio_vae, prompt, width, height, length,
              reference_plan_json, **images):
        try:
            plan = json.loads(reference_plan_json or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError("CineTimeline reference plan is invalid JSON") from exc
        slots = [int(value) for value in plan.get("image_slots", [])]
        refs = {}
        for ordinal, slot in enumerate(slots):
            image = images.get(f"image{slot}")
            if image is None:
                raise ValueError(
                    f"CineTimeline segment requests image{slot}, but that workflow input is not connected"
                )
            refs[f"ref_image_{ordinal}"] = image
        return _conditioning_builder()(
            clip, video_vae, audio_vae, prompt, int(width), int(height), int(length),
            "auto", "native", 0.35, True, 1, True, "match",
            "official_2_to_15s", None, None, None, None, refs, None, None, None,
        )


NODE_CLASS_MAPPINGS = {
    "CineTimelineH3ReferenceConditioning": CineTimelineH3ReferenceConditioning,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CineTimelineH3ReferenceConditioning": "CineTimeline · H3 分段参考路由",
}
