from __future__ import annotations

import importlib
import json


def _load_image(asset_id):
    nodes = importlib.import_module("nodes")
    return nodes.LoadImage().load_image(asset_id)[0]


def _load_video(asset_id):
    module = importlib.import_module("comfy_extras.nodes_video")
    video = module.LoadVideo.execute(asset_id).result[0]
    components = video.get_components()
    return components.images, components.audio


def _load_audio(asset_id):
    module = importlib.import_module("comfy_extras.nodes_audio")
    return module.LoadAudio.execute(asset_id).result[0]


def _conditioning_builder():
    module = importlib.import_module("custom_nodes.minimax-h3-audio-T8.conditioning")
    return module.build_conditioning


class CineTimelineH3ReferenceConditioning:
    """Load and route the current segment's image, video, and audio references."""

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
        first_frame = None
        last_frame = None
        ref_videos = {}
        ref_video_audios = {}
        ref_audios = {}
        report_media = []
        for entry in plan.get("media", []):
            media_type = str(entry.get("media_type", ""))
            reference_type = str(entry.get("reference_type", ""))
            asset_id = str(entry.get("asset_id", "") or "").strip()
            ordinal = int(entry.get("ordinal", 0))
            if not asset_id or ordinal < 1:
                raise ValueError("CineTimeline reference plan has an invalid media entry")
            if media_type == "image":
                image = _load_image(asset_id)
                if reference_type == "first_frame":
                    if first_frame is not None:
                        raise ValueError("CineTimeline segment has more than one first-frame reference")
                    first_frame = image
                elif reference_type == "last_frame":
                    if last_frame is not None:
                        raise ValueError("CineTimeline segment has more than one last-frame reference")
                    last_frame = image
                else:
                    refs[f"ref_image_{ordinal}"] = image
            elif media_type == "video":
                frames, soundtrack = _load_video(asset_id)
                ref_videos[f"ref_video_{ordinal}"] = frames
                if soundtrack is not None:
                    ref_video_audios[f"ref_video_audio_{ordinal}"] = soundtrack
            elif media_type == "audio":
                ref_audios[f"ref_audio_{ordinal}"] = _load_audio(asset_id)
            else:
                raise ValueError(f"Unsupported CineTimeline reference media type: {media_type}")
            report_media.append(f"{media_type}{ordinal}={asset_id}")
        result = _conditioning_builder()(
            clip, video_vae, audio_vae, prompt, int(width), int(height), int(length),
            "auto", "native", 0.35, True, 1, True, "match",
            "official_2_to_15s", None, None, first_frame, last_frame,
            refs, ref_videos, ref_video_audios, ref_audios,
        )
        values = list(result)
        if len(values) >= 6:
            route_report = {
                "schema": "cine_reference_route_report",
                "images": len(refs) + int(first_frame is not None) + int(last_frame is not None),
                "videos": len(ref_videos),
                "video_soundtracks": len(ref_video_audios),
                "audios": len(ref_audios),
                "loaded_media": report_media,
            }
            existing = str(values[5] or "").strip()
            serialized = json.dumps(route_report, ensure_ascii=False, separators=(",", ":"))
            values[5] = f"{existing}\n{serialized}" if existing else serialized
        return tuple(values)


NODE_CLASS_MAPPINGS = {
    "CineTimelineH3ReferenceConditioning": CineTimelineH3ReferenceConditioning,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CineTimelineH3ReferenceConditioning": "CineTimeline · H3 分段参考路由",
}
