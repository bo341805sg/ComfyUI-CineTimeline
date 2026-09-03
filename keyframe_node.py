from __future__ import annotations

import json
import re

from .core import TimelineValidationError


DEFAULT_KEYFRAME_TIMELINE = json.dumps({
    "schema": "cine_keyframe_timeline",
    "version": 1,
    "fps": 24,
    "total_frames": 120,
    "global_prompt": "", "negative_prompt": "",
    "shots": [{
        "shot_id": "SEGMENT_001",
        "start_frame": 0,
        "end_frame": 120,
        "local_prompt": "", "transition": "cut",
        "metadata": {"duration_seconds": 5, "render": {"status": "empty", "active_version": "", "versions": []}},
    }],
    "references": [], "background_music": [], "audio": [], "subtitles": [],
    "metadata": {"mode": "keyframe"},
}, ensure_ascii=False, indent=2)


def _neutralize_keyframe_media_tags(prompt: str) -> str:
    return re.sub(
        r"<Picture\s+(\d+)>", r"关键帧图像\1", str(prompt or ""), flags=re.IGNORECASE,
    )


def compile_keyframe_timeline(raw: str, segment_index: int = 1) -> dict:
    try:
        timeline = json.loads(str(raw or ""))
    except json.JSONDecodeError as exc:
        raise TimelineValidationError(f"invalid keyframe timeline JSON: {exc}") from exc
    if timeline.get("schema") != "cine_keyframe_timeline":
        raise TimelineValidationError("keyframe timeline schema must be cine_keyframe_timeline")
    fps = int(timeline.get("fps", 24))
    total = int(timeline.get("total_frames", 0))
    segments = timeline.get("shots") or timeline.get("segments") or []
    if fps < 1 or total < 5 or not segments:
        raise TimelineValidationError("keyframe timeline needs fps, total_frames >= 5 and segments")
    index = int(segment_index)
    if index < 1 or index > len(segments):
        raise TimelineValidationError(f"segment_index {index} outside 1..{len(segments)}")
    segment = segments[index - 1]
    start, end = int(segment.get("start_frame", -1)), int(segment.get("end_frame", -1))
    if start < 0 or end <= start or end > total:
        raise TimelineValidationError("segment bounds must be inside the global timeline")
    if "shots" in timeline:
        keyframes = [{"keyframe_id": str(ref.get("reference_id") or ""),
                      "frame": int(ref.get("keyframe_frame", ref.get("start_frame", -1))),
                      "role": str(ref.get("keyframe_role") or "guide"),
                      "asset_id": str(ref.get("asset_id") or ""),
                      "media_order": int(ref.get("media_order", 1))}
                     for ref in timeline.get("references") or []
                     if str(ref.get("media_type") or "image") == "image"
                     and str(ref.get("scope") or "shot") == "shot"
                     and str(ref.get("shot_id") or "") == str(segment.get("shot_id") or "")]
    else:
        keyframes = list(segment.get("keyframes") or [])
    keyframes = sorted(keyframes, key=lambda item: (int(item.get("frame", -1)), int(item.get("media_order", 1))))
    frames = [int(item.get("frame", -1)) for item in keyframes]
    if len(frames) != len(set(frames)):
        raise TimelineValidationError("keyframe positions must be unique")
    if frames and frames[0] != start:
        raise TimelineValidationError("the first keyframe must match the segment start")
    if len(frames) >= 2 and frames[-1] != end - 1:
        raise TimelineValidationError("with two or more images, the last keyframe must match the segment end")
    if any(frame < start or frame >= end for frame in frames):
        raise TimelineValidationError("all keyframes must stay inside their segment")
    guides = [{**item, "global_frame": frame, "local_frame": frame - start,
               "role": "first" if frame == start else "last" if frame == end - 1 else "guide"}
              for item, frame in zip(keyframes, frames)]
    return {"schema": "cine_keyframe_segment_plan", "version": 1, "fps": fps,
            "segment_index": index, "segment_count": len(segments),
            "segment_id": str(segment.get("shot_id") or segment.get("segment_id") or f"SEGMENT_{index:03d}"),
            "start_frame": start, "end_frame": end, "frame_count": end - start,
            "conditioning_mode": "keyframe" if guides else "text_to_video",
            "prompt": "\n\n".join(filter(None, [str(timeline.get("global_prompt") or "").strip(),
                                                   str(segment.get("local_prompt") or segment.get("prompt") or "").strip()])),
            "guides": guides}


class CineTimelineKeyframePlan:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",)}, "optional": {
            "timeline_json": ("STRING", {"forceInput": True}),
            "timeline_state": ("STRING", {"default": DEFAULT_KEYFRAME_TIMELINE, "multiline": True}),
            "render_target_shot_id": ("STRING", {"default": "", "multiline": False}),
            "render_run_id": ("STRING", {"default": "", "multiline": False}),
        }}

    RETURN_TYPES = ("MODEL", "STRING", "INT", "BOOLEAN", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("model", "segment_prompt", "frame_count", "hq_refinement",
                    "video_extension_plan", "keyframe_plan_json", "single_pass")
    FUNCTION = "build"
    CATEGORY = "CineTimeline/Keyframe"

    def build(self, model, timeline_json: str = "", timeline_state: str = "",
              render_target_shot_id: str = "", render_run_id: str = ""):
        target = str(render_target_shot_id or "").strip()
        run_id = str(render_run_id or "").strip()
        # The timeline button persists its immutable render target in the
        # editor JSON before queuing.  Optional widget inputs are not always
        # serialized by partial/subgraph execution, so recover both fields
        # from that JSON instead of silently falling back to segment 1.
        try:
            editor_timeline = json.loads(str(timeline_state or ""))
        except json.JSONDecodeError:
            editor_timeline = {}
        editor_metadata = editor_timeline.get("metadata", {}) if isinstance(editor_timeline, dict) else {}
        if not target:
            target = str(editor_metadata.get("render_target_shot_id") or "").strip()
        if not run_id:
            run_id = str(editor_metadata.get("render_run_id") or "").strip()
        # A targeted render must use the editor state because it contains the
        # latest local render/version records.  The connected AIPM package is
        # authoritative only for an untargeted/full workflow run.
        source = timeline_state or timeline_json
        if not target and str(timeline_json or "").strip():
            try:
                candidate = json.loads(str(timeline_json))
            except json.JSONDecodeError:
                candidate = None
            if isinstance(candidate, dict) and candidate.get("schema") == "cine_keyframe_timeline":
                source = timeline_json
        timeline = json.loads(source)
        shots = timeline.get("shots") or []
        index = next((i for i, shot in enumerate(shots) if str(shot.get("shot_id") or "") == target), 0)
        plan = compile_keyframe_timeline(source, index + 1)
        shot = shots[index]
        extension = index > 0 and str(shot.get("transition") or "cut") == "motion_context"
        context = 22 if extension else 0
        requested = context + plan["frame_count"]
        generation = requested
        while generation % 17 != 5:
            generation += 1
        metadata = shot.get("metadata") if isinstance(shot.get("metadata"), dict) else {}
        mode = str(metadata.get("postprocess_mode") or "rtx_vsr")
        previous_shot = shots[index - 1] if extension else None
        previous_version = None
        if previous_shot is not None:
            render = previous_shot.get("metadata", {}).get("render", {})
            active_version = str(render.get("active_version", "") or "")
            previous_version = next(
                (item for item in render.get("versions", [])
                 if str(item.get("version_id", "")) == active_version),
                None,
            )
            latent_path = str((previous_version or {}).get("latent_path", "") or "").strip()
            latent_sha256 = str((previous_version or {}).get("latent_sha256", "") or "").strip()
            if not latent_path or not re.fullmatch(r"[0-9a-fA-F]{64}", latent_sha256):
                raise TimelineValidationError(
                    f"{plan['segment_id']} uses 视频延长, but the active version of "
                    f"{previous_shot.get('shot_id', 'previous segment')} has no verified AV latent"
                )
        safe_shot = re.sub(r"[^a-zA-Z0-9_-]+", "_", plan["segment_id"]).strip("_") or "segment"
        safe_run = re.sub(r"[^a-zA-Z0-9_-]+", "_", run_id).strip("_") or "run"
        extension_plan = {"schema": "cine_video_extension_plan", "enabled": extension,
                          "context_length": 22, "audio_context_length": 24,
                          "requested_frame_count": plan["frame_count"], "generation_frame_count": generation,
                          "source_shot_id": str((previous_shot or {}).get("shot_id", "")),
                          "source_version_id": str((previous_version or {}).get("version_id", "")),
                          "source_latent_path": str((previous_version or {}).get("latent_path", "")),
                          "source_latent_sha256": str((previous_version or {}).get("latent_sha256", "")).lower(),
                          "shot_id": plan["segment_id"], "render_run_id": run_id,
                          "save_prefix": f"ComfyOS/CineTimeline/Latents/{safe_shot}/{safe_run}/continuation"}
        return (model, plan["prompt"], generation, mode == "hq_latent",
                json.dumps(extension_plan, ensure_ascii=False), json.dumps(plan, ensure_ascii=False),
                mode == "single_pass")


class CineTimelineH3KeyframeConditioning:
    """Dynamically load the selected segment's keyframes and inject H3 guides."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"clip": ("CLIP",), "video_vae": ("VAE",), "audio_vae": ("VAE",),
                             "prompt": ("STRING", {"multiline": True}),
                             "width": ("INT", {"default": 864, "min": 32, "max": 16384, "step": 32}),
                             "height": ("INT", {"default": 480, "min": 32, "max": 16384, "step": 32}),
                             "length": ("INT", {"default": 124, "min": 5, "max": 3600}),
                             "keyframe_plan_json": ("STRING", {"forceInput": True})}}

    RETURN_TYPES = ("CONDITIONING", "LATENT", "AUDIO", "STRING", "STRING", "STRING", "CONDITIONING")
    RETURN_NAMES = ("positive", "av_latent", "mux_audio", "conditioned_prompt", "media_map_json", "report",
                    "refinement_conditioning")
    FUNCTION = "build"
    CATEGORY = "CineTimeline/Keyframe/internal"

    def build(self, clip, video_vae, audio_vae, prompt, width, height, length, keyframe_plan_json):
        from .reference_router import _conditioning_builder, _load_image
        from comfy_extras.nodes_minimax_h3 import MiniMaxH3AddGuide
        plan = json.loads(keyframe_plan_json or "{}")
        # Keyframe pictures are injected through MiniMaxH3AddGuide below, not
        # through Ref2VA image sockets.  AIPM caches created before v66 may
        # still mention <Picture N>; neutralize only the provider media tag so
        # the base conditioning validator does not demand nonexistent Ref2VA
        # ports while preserving the surrounding semantic description.
        routing_prompt = _neutralize_keyframe_media_tags(prompt)
        values = list(_conditioning_builder()(clip, video_vae, audio_vae, routing_prompt, int(width), int(height),
                                               int(length), "auto", "native", 0.35, True, 1, True,
                                               "match", "official_2_to_15s", None, None, None, None,
                                               {}, {}, {}, {}))
        positive, latent = values[0], values[1]
        refinement_conditioning = positive
        loaded = []
        for guide in plan.get("guides") or []:
            asset_id = str(guide.get("asset_id") or "").strip()
            if not asset_id:
                raise TimelineValidationError(f"keyframe {guide.get('keyframe_id', '')} has no image")
            image = _load_image(asset_id)
            local_frame = int(guide.get("local_frame", -1))
            positive = MiniMaxH3AddGuide.execute(positive, latent, local_frame, vae=video_vae, image=image).result[0]
            loaded.append({"asset_id": asset_id, "global_frame": int(guide.get("global_frame", -1)),
                           "local_frame": local_frame, "role": str(guide.get("role") or "guide")})
        values[0] = positive
        values[4] = json.dumps({"schema": "cine_keyframe_media_map", "keyframes": loaded}, ensure_ascii=False)
        values[5] = (
            f"已按指定帧动态加载并注入 {len(loaded)} 张关键帧图片"
            if loaded else "未设置关键帧参考，按文生视频条件生成"
        )
        return tuple(values[:6]) + (refinement_conditioning,)


class CineTimelineKeyframeApplyGuides:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"positive": ("CONDITIONING",), "latent": ("LATENT",), "vae": ("VAE",),
                             "plan_json": ("STRING", {"forceInput": True})},
                "optional": {f"image_{index}": ("IMAGE",) for index in range(1, 13)}}
    RETURN_TYPES = ("CONDITIONING", "STRING")
    RETURN_NAMES = ("positive", "guide_map")
    FUNCTION = "apply"
    CATEGORY = "CineTimeline/Keyframe"
    def apply(self, positive, latent, vae, plan_json, **kwargs):
        from comfy_extras.nodes_minimax_h3 import MiniMaxH3AddGuide
        plan, current, lines = json.loads(plan_json), positive, []
        for index, guide in enumerate(plan["guides"], 1):
            image = kwargs.get(f"image_{index}")
            if image is None:
                raise TimelineValidationError(f"keyframe image_{index} is required")
            current = MiniMaxH3AddGuide.execute(current, latent, int(guide["local_frame"]), vae=vae, image=image).result[0]
            lines.append(f"image_{index}: global {guide['global_frame']} -> local {guide['local_frame']}")
        return current, "\n".join(lines)


class CineTimelineKeyframeFinalize:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "plan_json": ("STRING", {"forceInput": True}),
                             "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0})},
                "optional": {"audio": ("AUDIO",)}}
    RETURN_TYPES = ("IMAGE", "AUDIO", "STRING")
    RETURN_NAMES = ("images", "audio", "crop_summary")
    FUNCTION = "finalize"
    CATEGORY = "CineTimeline/Keyframe"
    def finalize(self, images, plan_json, fps, audio=None):
        import torch
        plan = json.loads(plan_json); start = 0 if plan["segment_index"] == 1 else 22; count = plan["frame_count"]
        frames = images[start:start + count]
        rate = int((audio or {}).get("sample_rate", 48000)); samples = round(count / fps * rate)
        if audio is None: output_audio = {"waveform": torch.zeros((1, 2, samples)), "sample_rate": rate}
        else: output_audio = {**audio, "waveform": audio["waveform"][..., round(start/fps*rate):round(start/fps*rate)+samples]}
        return frames, output_audio, f"trim {start} + keep {count} frames"


NODE_CLASS_MAPPINGS = {"CineTimelineKeyframePlan": CineTimelineKeyframePlan,
                       "CineTimelineH3KeyframeConditioning": CineTimelineH3KeyframeConditioning,
                       "CineTimelineKeyframeApplyGuides": CineTimelineKeyframeApplyGuides,
                       "CineTimelineKeyframeFinalize": CineTimelineKeyframeFinalize}
NODE_DISPLAY_NAME_MAPPINGS = {"CineTimelineKeyframePlan": "CineTimeline Studio｜关键帧模式",
                              "CineTimelineH3KeyframeConditioning": "CineTimeline｜H3 关键帧动态路由",
                              "CineTimelineKeyframeApplyGuides": "CineTimeline｜关键帧注入",
                              "CineTimelineKeyframeFinalize": "CineTimeline｜关键帧分段裁切"}
