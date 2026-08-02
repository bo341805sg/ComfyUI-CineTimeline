from __future__ import annotations

import copy
import json
from typing import Any


SCHEMA_VERSION = "1.0"
REFERENCE_TYPES = {
    "character", "costume", "scene", "prop", "pose", "storyboard",
    "first_frame", "last_frame", "audio",
}


class TimelineValidationError(ValueError):
    pass


def _require_int(value: Any, field: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise TimelineValidationError(f"{field} must be an integer >= {minimum}")
    return value


def _require_number(value: Any, field: str, minimum: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < minimum:
        raise TimelineValidationError(f"{field} must be a number >= {minimum}")
    return float(value)


def _require_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TimelineValidationError(f"{field} must be a non-empty string")
    return value.strip()


def _validate_range(item: dict[str, Any], prefix: str, total_frames: int) -> None:
    start = _require_int(item.get("start_frame"), f"{prefix}.start_frame")
    end = _require_int(item.get("end_frame"), f"{prefix}.end_frame", 1)
    if end <= start:
        raise TimelineValidationError(f"{prefix}.end_frame must be greater than start_frame")
    if end > total_frames:
        raise TimelineValidationError(f"{prefix}.end_frame exceeds total_frames")


def normalize_timeline(source: str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(source, str):
        try:
            raw = json.loads(source)
        except json.JSONDecodeError as exc:
            raise TimelineValidationError(f"invalid timeline JSON: {exc.msg}") from exc
    elif isinstance(source, dict):
        raw = copy.deepcopy(source)
    else:
        raise TimelineValidationError("timeline must be a JSON object")
    if not isinstance(raw, dict):
        raise TimelineValidationError("timeline root must be a JSON object")

    fps = _require_number(raw.get("fps", 24), "fps", 1)
    total_frames = _require_int(raw.get("total_frames"), "total_frames", 1)
    for name in ("shots", "references", "audio", "subtitles"):
        if not isinstance(raw.get(name, []), list):
            raise TimelineValidationError(f"{name} must be an array")

    normalized: dict[str, Any] = {
        "schema": "cine_timeline", "version": SCHEMA_VERSION,
        "fps": int(fps) if fps.is_integer() else fps,
        "total_frames": total_frames, "shots": [], "references": [],
        "audio": [], "subtitles": [],
        "metadata": raw.get("metadata", {}) if isinstance(raw.get("metadata", {}), dict) else {},
    }

    seen_shots: set[str] = set()
    for index, item in enumerate(raw.get("shots", [])):
        if not isinstance(item, dict):
            raise TimelineValidationError(f"shots[{index}] must be an object")
        _validate_range(item, f"shots[{index}]", total_frames)
        shot_id = _require_id(item.get("shot_id"), f"shots[{index}].shot_id")
        if shot_id in seen_shots:
            raise TimelineValidationError(f"duplicate shot_id: {shot_id}")
        seen_shots.add(shot_id)
        normalized["shots"].append({
            "shot_id": shot_id, "start_frame": item["start_frame"],
            "end_frame": item["end_frame"],
            "global_prompt": str(item.get("global_prompt", "")),
            "local_prompt": str(item.get("local_prompt", "")),
            "negative_prompt": str(item.get("negative_prompt", "")),
            "camera": str(item.get("camera", "")),
            "transition": str(item.get("transition", "cut")),
            "metadata": item.get("metadata", {}) if isinstance(item.get("metadata", {}), dict) else {},
        })
    normalized["shots"].sort(key=lambda x: (x["start_frame"], x["end_frame"], x["shot_id"]))
    for previous, current in zip(normalized["shots"], normalized["shots"][1:]):
        if current["start_frame"] < previous["end_frame"]:
            raise TimelineValidationError(f"shots overlap: {previous['shot_id']} and {current['shot_id']}")

    seen_refs: set[str] = set()
    for index, item in enumerate(raw.get("references", [])):
        if not isinstance(item, dict):
            raise TimelineValidationError(f"references[{index}] must be an object")
        _validate_range(item, f"references[{index}]", total_frames)
        reference_id = _require_id(item.get("reference_id"), f"references[{index}].reference_id")
        if reference_id in seen_refs:
            raise TimelineValidationError(f"duplicate reference_id: {reference_id}")
        seen_refs.add(reference_id)
        reference_type = str(item.get("type", "character"))
        if reference_type not in REFERENCE_TYPES:
            raise TimelineValidationError(f"references[{index}].type must be one of {sorted(REFERENCE_TYPES)}")
        strength = _require_number(item.get("strength", 1.0), f"references[{index}].strength")
        if strength > 2.0:
            raise TimelineValidationError(f"references[{index}].strength must be <= 2.0")
        image_index = item.get("image_index")
        if image_index is not None:
            image_index = _require_int(image_index, f"references[{index}].image_index")
        normalized["references"].append({
            "reference_id": reference_id, "type": reference_type,
            "target_id": str(item.get("target_id", "")),
            "asset_id": str(item.get("asset_id", "")), "image_index": image_index,
            "start_frame": item["start_frame"], "end_frame": item["end_frame"],
            "strength": strength, "adapter": str(item.get("adapter", "auto")),
            "priority": _require_int(item.get("priority", 0), f"references[{index}].priority"),
            "metadata": item.get("metadata", {}) if isinstance(item.get("metadata", {}), dict) else {},
        })
    normalized["references"].sort(key=lambda x: (x["start_frame"], -x["priority"], x["reference_id"]))

    for collection_name, id_name in (("audio", "audio_id"), ("subtitles", "subtitle_id")):
        seen: set[str] = set()
        for index, item in enumerate(raw.get(collection_name, [])):
            if not isinstance(item, dict):
                raise TimelineValidationError(f"{collection_name}[{index}] must be an object")
            _validate_range(item, f"{collection_name}[{index}]", total_frames)
            item_id = _require_id(item.get(id_name), f"{collection_name}[{index}].{id_name}")
            if item_id in seen:
                raise TimelineValidationError(f"duplicate {id_name}: {item_id}")
            seen.add(item_id)
            entry = copy.deepcopy(item); entry[id_name] = item_id
            normalized[collection_name].append(entry)
        normalized[collection_name].sort(key=lambda x: (x["start_frame"], x["end_frame"]))
    return normalized


def timeline_json(timeline: dict[str, Any]) -> str:
    return json.dumps(timeline, ensure_ascii=False, indent=2, sort_keys=False)


def find_shot(timeline: dict[str, Any], shot_id: str = "", frame: int = 0) -> dict[str, Any]:
    if shot_id:
        for shot in timeline["shots"]:
            if shot["shot_id"] == shot_id:
                return copy.deepcopy(shot)
        raise TimelineValidationError(f"shot_id not found: {shot_id}")
    for shot in timeline["shots"]:
        if shot["start_frame"] <= frame < shot["end_frame"]:
            return copy.deepcopy(shot)
    raise TimelineValidationError(f"no shot contains frame {frame}")


def active_references(timeline: dict[str, Any], start_frame: int, end_frame: int) -> list[dict[str, Any]]:
    if end_frame <= start_frame:
        raise TimelineValidationError("end_frame must be greater than start_frame")
    refs = [copy.deepcopy(ref) for ref in timeline["references"]
            if ref["start_frame"] < end_frame and ref["end_frame"] > start_frame]
    refs.sort(key=lambda x: (-x["priority"], x["start_frame"], x["reference_id"]))
    return refs


def build_ltx_plan(timeline: dict[str, Any], shot: dict[str, Any]) -> dict[str, Any]:
    refs = active_references(timeline, shot["start_frame"], shot["end_frame"])
    return {
        "adapter": "ltx_2_3", "schema_version": SCHEMA_VERSION,
        "shot_id": shot["shot_id"], "fps": timeline["fps"],
        "total_frames": shot["end_frame"] - shot["start_frame"],
        "source_range": [shot["start_frame"], shot["end_frame"]],
        "global_prompt": shot["global_prompt"], "local_prompt": shot["local_prompt"],
        "negative_prompt": shot["negative_prompt"], "camera": shot["camera"],
        "references": [{**ref,
            "local_start_frame": max(ref["start_frame"], shot["start_frame"]) - shot["start_frame"],
            "local_end_frame": min(ref["end_frame"], shot["end_frame"]) - shot["start_frame"],
        } for ref in refs],
    }
