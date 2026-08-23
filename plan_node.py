from __future__ import annotations

import json
import re
from typing import Any

from .core import TimelineValidationError, active_references, normalize_timeline


DEFAULT_STUDIO_TIMELINE = """{
  "fps": 24,
  "total_frames": 120,
  "global_prompt": "",
  "negative_prompt": "",
  "shots": [{
    "shot_id": "SEGMENT_001",
    "start_frame": 0,
    "end_frame": 120,
    "local_prompt": "",
    "camera": "",
    "transition": "cut",
    "metadata": {"duration_seconds": 5.0, "render": {"status": "empty", "active_version": "", "versions": []}}
  }],
  "references": [],
  "background_music": [],
  "audio": [],
  "subtitles": [],
  "metadata": {}
}"""


class CineTimelinePlan:
    """Edit, validate and package a timeline without running generation."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
            },
            "optional": {
                # AIPM can provide this package, but the timeline editor must
                # remain executable on its own when users author shots by hand.
                "timeline_json": ("STRING", {"forceInput": True}),
                "timeline_state": (
                    "STRING",
                    {"default": DEFAULT_STUDIO_TIMELINE, "multiline": True, "dynamicPrompts": False},
                ),
                "render_target_shot_id": ("STRING", {"default": "", "multiline": False}),
                "render_run_id": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = ("MODEL", "STRING", "INT", "BOOLEAN", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = (
        "model", "segment_prompt", "frame_count", "hq_refinement",
        "video_extension_plan", "reference_plan_json", "single_pass",
    )
    FUNCTION = "build"
    CATEGORY = "CineTimeline"

    def build(
        self,
        model: Any,
        timeline_json: str = "",
        timeline_state: str = "",
        render_target_shot_id: str = "",
        render_run_id: str = "",
    ):
        # A connected AIPM package is authoritative when it contains shots.
        # The editor's hidden timeline_state can temporarily be an empty shell
        # during frontend migrations/cache recovery and must not mask it.
        target_id = str(render_target_shot_id or "").strip()
        connected = None
        try:
            connected = normalize_timeline(timeline_json)
        except (TimelineValidationError, TypeError, ValueError):
            pass
        # A targeted render originates from the editor and must use its current
        # timeline_state (new/edited shots may not exist in the upstream AIPM package).
        if target_id:
            normalized = normalize_timeline(timeline_state or timeline_json)
        elif connected and connected.get("shots"):
            normalized = connected
        else:
            normalized = normalize_timeline(timeline_state or timeline_json)
        shots = normalized.get("shots", [])
        if not shots:
            raise TimelineValidationError("timeline needs at least one shot")
        run_id = str(render_run_id or "").strip()
        metadata = normalized.setdefault("metadata", {})
        if target_id:
            if not any(str(shot.get("shot_id", "")) == target_id for shot in shots):
                raise TimelineValidationError(f"timeline target does not exist: {target_id}")
            metadata["render_target_shot_id"] = target_id
        if run_id:
            metadata["render_run_id"] = run_id

        selected = next(
            (shot for shot in shots if str(shot.get("shot_id", "")) == target_id),
            shots[0],
        )
        global_prompt = str(normalized.get("global_prompt", "") or "").strip()
        local_prompt = str(selected.get("local_prompt", "") or "").strip()
        segment_prompt = "\n\n".join(x for x in (global_prompt, local_prompt) if x)
        requested_frame_count = int(selected["end_frame"]) - int(selected["start_frame"])
        selected_index = shots.index(selected)
        extension_enabled = (
            selected_index > 0 and str(selected.get("transition", "cut")) == "motion_context"
        )
        previous_version = None
        previous_shot = shots[selected_index - 1] if extension_enabled else None
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
                    f"{selected.get('shot_id', 'current segment')} uses 视频延长, but the active "
                    f"version of {previous_shot.get('shot_id', 'previous segment')} has no verified AV latent"
                )

        frame_count = requested_frame_count
        if extension_enabled:
            target = max(5, requested_frame_count + 22)
            lower = target - ((target - 5) % 17)
            upper = lower if lower == target else lower + 17
            frame_count = lower if target - lower <= upper - target else upper
        postprocess_mode = str(selected.get("metadata", {}).get("postprocess_mode", "rtx_vsr"))
        hq_refinement = postprocess_mode == "hq_latent"
        single_pass = postprocess_mode == "single_pass"
        safe_shot = re.sub(
            r"[^a-zA-Z0-9_-]+", "_", str(selected.get("shot_id", "segment"))
        ).strip("_") or "segment"
        safe_run = re.sub(r"[^a-zA-Z0-9_-]+", "_", run_id).strip("_") or "run"
        extension_plan = {
            "schema": "cine_video_extension_plan",
            "enabled": extension_enabled,
            "context_length": 22,
            "audio_context_length": 24,
            "requested_frame_count": requested_frame_count,
            "generation_frame_count": frame_count,
            "source_shot_id": str((previous_shot or {}).get("shot_id", "")),
            "source_version_id": str((previous_version or {}).get("version_id", "")),
            "source_latent_path": str((previous_version or {}).get("latent_path", "")),
            "source_latent_sha256": str((previous_version or {}).get("latent_sha256", "")).lower(),
            "save_prefix": f"ComfyOS/CineTimeline/Latents/{safe_shot}/{safe_run}/continuation",
            "shot_id": str(selected.get("shot_id", "")),
            "render_run_id": run_id,
        }
        selected_refs = [
            ref for ref in active_references(
                normalized, int(selected["start_frame"]), int(selected["end_frame"])
            )
            if ref.get("media_type") == "image" and ref.get("image_index") is not None
        ]
        # Preserve the editor's priority order, de-duplicate physical inputs,
        # and remap the chosen images to consecutive H3 Picture ordinals.
        image_slots = []
        for ref in selected_refs:
            slot = int(ref["image_index"]) + 1
            if slot not in image_slots:
                image_slots.append(slot)
        if not image_slots:
            mentioned = [int(value) for value in re.findall(r"<Picture\s+(\d+)>", segment_prompt)]
            image_slots = sorted(set(mentioned))
        ordinal_map = {source: target for target, source in enumerate(image_slots, 1)}
        for source in sorted(ordinal_map, reverse=True):
            segment_prompt = re.sub(
                rf"<Picture\s+{source}>", f"<Picture {ordinal_map[source]}>", segment_prompt
            )
        reference_plan = {
            "schema": "cine_reference_plan",
            "shot_id": str(selected.get("shot_id", "")),
            "image_slots": image_slots,
            "ordinal_map": ordinal_map,
        }
        return (
            model, segment_prompt, frame_count, hq_refinement,
            json.dumps(extension_plan, ensure_ascii=False, separators=(",", ":")),
            json.dumps(reference_plan, ensure_ascii=False, separators=(",", ":")),
            single_pass,
        )


NODE_CLASS_MAPPINGS = {"CineTimelinePlan": CineTimelinePlan}
NODE_DISPLAY_NAME_MAPPINGS = {"CineTimelinePlan": "CineTimeline Plan"}
