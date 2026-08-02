from __future__ import annotations

import json
from typing import Any

from .core import (
    TimelineValidationError,
    active_references,
    build_ltx_plan,
    find_shot,
    normalize_timeline,
    timeline_json as serialize_timeline,
)


DEFAULT_TIMELINE = """{
  "fps": 24,
  "total_frames": 120,
  "shots": [{
    "shot_id": "SHOT_001", "start_frame": 0, "end_frame": 120,
    "global_prompt": "cinematic scene, consistent characters and environment",
    "local_prompt": "medium shot, subtle camera movement",
    "negative_prompt": "flicker, identity drift", "camera": "slow dolly in"
  }],
  "references": [{
    "reference_id": "CHARACTER_001", "type": "character", "target_id": "CHAR_001",
    "image_index": 0, "start_frame": 0, "end_frame": 120, "strength": 1.0,
    "adapter": "auto", "priority": 100
  }],
  "audio": [], "subtitles": []
}"""


class CineTimelineEditor:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"timeline_json": ("STRING", {"default": DEFAULT_TIMELINE, "multiline": True, "dynamicPrompts": False})}}
    RETURN_TYPES = ("CINE_TIMELINE", "STRING", "STRING")
    RETURN_NAMES = ("timeline", "normalized_json", "summary")
    FUNCTION = "build"; CATEGORY = "CineTimeline"

    def build(self, timeline_json: str):
        timeline = normalize_timeline(timeline_json)
        duration = timeline["total_frames"] / timeline["fps"]
        summary = f"{len(timeline['shots'])} shot(s), {len(timeline['references'])} reference(s), {timeline['total_frames']} frames at {timeline['fps']} fps ({duration:.2f}s)"
        return (timeline, serialize_timeline(timeline), summary)


class CineTimelineShotOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"timeline": ("CINE_TIMELINE",), "shot_id": ("STRING", {"default": "SHOT_001"}), "frame": ("INT", {"default": 0, "min": 0, "max": 2**31 - 1})}}
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "INT", "INT")
    RETURN_NAMES = ("shot_json", "global_prompt", "local_prompt", "negative_prompt", "start_frame", "end_frame")
    FUNCTION = "select"; CATEGORY = "CineTimeline"

    def select(self, timeline: dict[str, Any], shot_id: str, frame: int):
        shot = find_shot(normalize_timeline(timeline), shot_id.strip(), frame)
        return (json.dumps(shot, ensure_ascii=False, indent=2), shot["global_prompt"], shot["local_prompt"], shot["negative_prompt"], shot["start_frame"], shot["end_frame"])


class CineTimelineReferenceOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"timeline": ("CINE_TIMELINE",), "start_frame": ("INT", {"default": 0, "min": 0, "max": 2**31 - 1}), "end_frame": ("INT", {"default": 120, "min": 1, "max": 2**31 - 1}), "reference_type": (["all", "character", "costume", "scene", "prop", "pose", "storyboard", "first_frame", "last_frame", "audio"],)}}
    RETURN_TYPES = ("CINE_REFERENCES", "STRING", "INT")
    RETURN_NAMES = ("references", "references_json", "count")
    FUNCTION = "select"; CATEGORY = "CineTimeline"

    def select(self, timeline: dict[str, Any], start_frame: int, end_frame: int, reference_type: str):
        refs = active_references(normalize_timeline(timeline), start_frame, end_frame)
        if reference_type != "all": refs = [ref for ref in refs if ref["type"] == reference_type]
        return (refs, json.dumps(refs, ensure_ascii=False, indent=2), len(refs))


class CineTimelineLTXAdapter:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"timeline": ("CINE_TIMELINE",), "shot_id": ("STRING", {"default": "SHOT_001"}), "frame": ("INT", {"default": 0, "min": 0, "max": 2**31 - 1})}}
    RETURN_TYPES = ("CINE_LTX_PLAN", "CINE_REFERENCES", "STRING", "STRING", "INT", "FLOAT")
    RETURN_NAMES = ("ltx_plan", "references", "ltx_plan_json", "combined_prompt", "frame_count", "fps")
    FUNCTION = "adapt"; CATEGORY = "CineTimeline/Adapters"

    def adapt(self, timeline: dict[str, Any], shot_id: str, frame: int):
        normalized = normalize_timeline(timeline); shot = find_shot(normalized, shot_id.strip(), frame)
        plan = build_ltx_plan(normalized, shot)
        combined_prompt = "\n\n".join(value for value in (shot["global_prompt"], shot["local_prompt"]) if value)
        return (plan, plan["references"], json.dumps(plan, ensure_ascii=False, indent=2), combined_prompt, plan["total_frames"], float(plan["fps"]))


class CineTimelineLTXImageBatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "ltx_plan": ("CINE_LTX_PLAN",)}, "optional": {"reference_type": (["all", "character", "costume", "scene", "prop", "pose", "storyboard", "first_frame", "last_frame"],)}}
    RETURN_TYPES = ("IMAGE", "STRING", "INT")
    RETURN_NAMES = ("reference_images", "guide_plan_json", "count")
    FUNCTION = "select"; CATEGORY = "CineTimeline/Adapters"

    def select(self, images, ltx_plan: dict[str, Any], reference_type: str = "all"):
        refs = ltx_plan.get("references", [])
        if reference_type != "all": refs = [ref for ref in refs if ref.get("type") == reference_type]
        refs = [ref for ref in refs if ref.get("image_index") is not None]
        if not refs: raise TimelineValidationError("no active references with image_index")
        batch_size = int(images.shape[0]); indices = [int(ref["image_index"]) for ref in refs]
        invalid = [index for index in indices if index < 0 or index >= batch_size]
        if invalid: raise TimelineValidationError(f"image_index outside input batch of {batch_size}: {invalid}")
        selected = images[indices]
        guide_plan = [{"batch_index": output_index, "source_image_index": source_index,
            "reference_id": ref["reference_id"], "type": ref["type"], "target_id": ref["target_id"],
            "start_frame": ref["local_start_frame"], "end_frame": ref["local_end_frame"],
            "strength": ref["strength"], "adapter": ref["adapter"]}
            for output_index, (source_index, ref) in enumerate(zip(indices, refs))]
        return (selected, json.dumps(guide_plan, ensure_ascii=False, indent=2), len(refs))


class CineTimelineLTXGuideSlot:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ltx_plan": ("CINE_LTX_PLAN",),
                "slot": ("INT", {"default": 0, "min": 0, "max": 63, "step": 1}),
            }
        }
    RETURN_TYPES = ("STRING", "STRING", "INT", "INT", "FLOAT", "INT", "STRING")
    RETURN_NAMES = (
        "reference_id", "reference_type", "start_frame", "end_frame",
        "strength", "image_index", "reference_json",
    )
    FUNCTION = "select"
    CATEGORY = "CineTimeline/Adapters"

    def select(self, ltx_plan: dict[str, Any], slot: int):
        refs = ltx_plan.get("references", [])
        if slot >= len(refs):
            raise TimelineValidationError(
                f"guide slot {slot} outside active reference count {len(refs)}"
            )
        ref = refs[slot]
        image_index = ref.get("image_index")
        if image_index is None:
            raise TimelineValidationError(
                f"reference {ref.get('reference_id', slot)} has no image_index"
            )
        return (
            ref["reference_id"], ref["type"], ref["local_start_frame"],
            ref["local_end_frame"], float(ref["strength"]), int(image_index),
            json.dumps(ref, ensure_ascii=False, indent=2),
        )


class CineTimelineTestOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"forceInput": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "display"
    CATEGORY = "CineTimeline/Testing"
    OUTPUT_NODE = True

    def display(self, text: str):
        return {"ui": {"text": [text]}, "result": (text,)}


NODE_CLASS_MAPPINGS = {"CineTimelineEditor": CineTimelineEditor, "CineTimelineShotOutput": CineTimelineShotOutput, "CineTimelineReferenceOutput": CineTimelineReferenceOutput, "CineTimelineLTXAdapter": CineTimelineLTXAdapter, "CineTimelineLTXImageBatch": CineTimelineLTXImageBatch, "CineTimelineLTXGuideSlot": CineTimelineLTXGuideSlot, "CineTimelineTestOutput": CineTimelineTestOutput}
NODE_DISPLAY_NAME_MAPPINGS = {"CineTimelineEditor": "CineTimeline Editor", "CineTimelineShotOutput": "CineTimeline Shot Output", "CineTimelineReferenceOutput": "CineTimeline Reference Output", "CineTimelineLTXAdapter": "CineTimeline LTX 2.3 Adapter", "CineTimelineLTXImageBatch": "CineTimeline LTX Reference Images", "CineTimelineLTXGuideSlot": "CineTimeline LTX Guide Slot", "CineTimelineTestOutput": "CineTimeline Test Output"}
