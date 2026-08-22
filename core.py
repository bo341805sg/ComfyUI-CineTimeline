from __future__ import annotations

import copy
import json
from typing import Any


SCHEMA_VERSION = "1.4"
REFERENCE_TYPES = {
    "character", "costume", "scene", "prop", "pose", "storyboard",
    "first_frame", "last_frame", "style", "motion", "video", "audio",
}
AUDIO_TYPES = {"dialogue", "ambience", "sfx", "music"}
RENDER_STATUSES = {"empty", "generated", "approved", "redo"}
RENDER_STORAGE_TYPES = {"input", "output", "temp"}


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


def _normalize_shot_render(metadata: dict[str, Any], prefix: str) -> None:
    raw = metadata.get("render", {})
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise TimelineValidationError(f"{prefix}.metadata.render must be an object")
    status = str(raw.get("status", "empty"))
    if status not in RENDER_STATUSES:
        raise TimelineValidationError(
            f"{prefix}.metadata.render.status must be one of {sorted(RENDER_STATUSES)}"
        )
    raw_versions = raw.get("versions", [])
    if not isinstance(raw_versions, list):
        raise TimelineValidationError(f"{prefix}.metadata.render.versions must be an array")
    versions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(raw_versions):
        if not isinstance(item, dict):
            raise TimelineValidationError(
                f"{prefix}.metadata.render.versions[{index}] must be an object"
            )
        version_id = _require_id(
            item.get("version_id"),
            f"{prefix}.metadata.render.versions[{index}].version_id",
        )
        if version_id in seen:
            raise TimelineValidationError(f"{prefix} has duplicate render version: {version_id}")
        seen.add(version_id)
        storage_type = str(item.get("storage_type", "output"))
        if storage_type not in RENDER_STORAGE_TYPES:
            raise TimelineValidationError(
                f"{prefix}.metadata.render.versions[{index}].storage_type must be one of "
                f"{sorted(RENDER_STORAGE_TYPES)}"
            )
        entry = {
            "version_id": version_id,
            "asset_id": str(item.get("asset_id", "")),
            "storage_type": storage_type,
            "created_at": str(item.get("created_at", "")),
            "note": str(item.get("note", "")),
            "approved": bool(item.get("approved", False)),
        }
        if item.get("seed") is not None:
            entry["seed"] = _require_int(
                item["seed"], f"{prefix}.metadata.render.versions[{index}].seed"
            )
        if item.get("frames") is not None:
            entry["frames"] = _require_int(
                item["frames"], f"{prefix}.metadata.render.versions[{index}].frames", 1
            )
        if item.get("clip_start_seconds") is not None:
            entry["clip_start_seconds"] = _require_number(
                item["clip_start_seconds"],
                f"{prefix}.metadata.render.versions[{index}].clip_start_seconds",
            )
        if item.get("clip_duration_seconds") is not None:
            clip_duration = _require_number(
                item["clip_duration_seconds"],
                f"{prefix}.metadata.render.versions[{index}].clip_duration_seconds",
            )
            if clip_duration <= 0:
                raise TimelineValidationError(
                    f"{prefix}.metadata.render.versions[{index}].clip_duration_seconds "
                    "must be greater than zero"
                )
            entry["clip_duration_seconds"] = clip_duration
        for field in (
            "render_run_id",
            "latent_path",
            "latent_sha256",
            "latent_source_shot_id",
            "latent_source_version_id",
            "latent_source_sha256",
            "transition",
        ):
            if item.get(field) is not None:
                entry[field] = str(item.get(field, "")).strip()
        for field in ("width", "height"):
            if item.get(field) is not None:
                entry[field] = _require_int(
                    item[field], f"{prefix}.metadata.render.versions[{index}].{field}", 1
                )
        versions.append(entry)
    active_version = str(raw.get("active_version", ""))
    if active_version and active_version not in seen:
        raise TimelineValidationError(
            f"{prefix}.metadata.render.active_version does not exist: {active_version}"
        )
    if versions and not active_version:
        active_version = versions[-1]["version_id"]
    if versions and status == "empty":
        status = "generated"
    if not versions:
        status = "empty"
        active_version = ""
    metadata["render"] = {
        "status": status,
        "active_version": active_version,
        "versions": versions,
    }


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

    raw_shots = raw.get("shots", [])
    has_shared_global_prompt = "global_prompt" in raw
    has_shared_negative_prompt = "negative_prompt" in raw
    legacy_global_prompts = [
        str(item.get("global_prompt", "")).strip()
        for item in raw_shots if isinstance(item, dict)
    ]
    unique_legacy_globals = list(dict.fromkeys(
        value for value in legacy_global_prompts if value
    ))
    if has_shared_global_prompt:
        shared_global_prompt = str(raw.get("global_prompt", ""))
    elif len(unique_legacy_globals) == 1:
        shared_global_prompt = unique_legacy_globals[0]
    else:
        # Old workflows often stored shot-specific composition text in the field
        # called global_prompt. Preserve that intent by moving it into each local
        # prompt instead of making it global across the whole film.
        shared_global_prompt = ""

    legacy_negative_prompts = [
        str(item.get("negative_prompt", "")).strip()
        for item in raw_shots if isinstance(item, dict)
    ]
    unique_legacy_negatives = list(dict.fromkeys(
        value for value in legacy_negative_prompts if value
    ))
    shared_negative_prompt = (
        str(raw.get("negative_prompt", ""))
        if has_shared_negative_prompt
        else ", ".join(unique_legacy_negatives)
    )

    normalized: dict[str, Any] = {
        "schema": "cine_timeline", "version": SCHEMA_VERSION,
        "fps": int(fps) if fps.is_integer() else fps,
        "global_prompt": shared_global_prompt,
        "negative_prompt": shared_negative_prompt,
        "total_frames": total_frames, "shots": [], "references": [],
        "audio": [], "subtitles": [],
        "background_music": [],
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
        local_prompt = str(item.get("local_prompt", ""))
        if not has_shared_global_prompt and len(unique_legacy_globals) > 1:
            legacy_global = str(item.get("global_prompt", "")).strip()
            local_prompt = "\n\n".join(
                value for value in (legacy_global, local_prompt.strip()) if value
            )
        normalized["shots"].append({
            "shot_id": shot_id, "start_frame": item["start_frame"],
            "end_frame": item["end_frame"],
            # Adapters still consume these effective fields. The editable source
            # of truth is timeline-level for global and negative prompts.
            "global_prompt": shared_global_prompt,
            "local_prompt": local_prompt,
            "negative_prompt": shared_negative_prompt,
            "camera": str(item.get("camera", "")),
            "transition": str(item.get("transition", "cut")).strip() or "cut",
            "metadata": item.get("metadata", {}) if isinstance(item.get("metadata", {}), dict) else {},
        })
    normalized["shots"].sort(key=lambda x: (x["start_frame"], x["end_frame"], x["shot_id"]))
    for index, shot in enumerate(normalized["shots"]):
        metadata = shot["metadata"]
        transition = shot["transition"]
        if transition not in {
            "cut", "dissolve", "fade", "match_cut", "tail_continuity", "motion_context",
        }:
            raise TimelineValidationError(
                f"shots[{index}].transition is unsupported: {transition}"
            )
        legacy_new_scene = metadata.pop("new_scene", False)
        if not isinstance(legacy_new_scene, bool):
            raise TimelineValidationError(
                f"shots[{index}].metadata.new_scene must be a boolean"
            )
        continue_from_previous = metadata.get("continue_from_previous", False)
        if not isinstance(continue_from_previous, bool):
            raise TimelineValidationError(
                f"shots[{index}].metadata.continue_from_previous must be a boolean"
            )
        continuity_handle_frames = metadata.get("continuity_handle_frames", 1)
        continuity_handle_frames = _require_int(
            continuity_handle_frames,
            f"shots[{index}].metadata.continuity_handle_frames",
            1,
        )
        if continuity_handle_frames > 3:
            raise TimelineValidationError(
                f"shots[{index}].metadata.continuity_handle_frames must be <= 3"
            )
        if index == 0 and continue_from_previous:
            raise TimelineValidationError(
                f"{shot['shot_id']} cannot continue from a previous shot"
            )
        if transition in {"dissolve", "fade", "match_cut", "tail_continuity"}:
            transition = "cut"
        if index == 0 and transition == "motion_context":
            raise TimelineValidationError(
                f"{shot['shot_id']} cannot use {transition} without a previous shot"
            )
        if legacy_new_scene:
            # Historical scene-boundary metadata maps to an ordinary cut. The
            # visible source of truth is now the transition field.
            transition = "cut"
            continue_from_previous = False
        elif continue_from_previous:
            # Preserve old exact-continuation workflows while migrating their
            # visible intent to the new transition option.
            transition = "motion_context"
        shot["transition"] = transition
        metadata["continue_from_previous"] = continue_from_previous
        metadata["continuity_handle_frames"] = continuity_handle_frames
        _normalize_shot_render(metadata, f"shots[{index}]")
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
        media_type = str(item.get(
            "media_type",
            "video" if reference_type == "video" else "audio" if reference_type == "audio" else "image",
        ))
        if media_type not in {"image", "video", "audio"}:
            raise TimelineValidationError(
                f"references[{index}].media_type must be image, video, or audio"
            )
        media_order = item.get("media_order")
        if media_order is not None:
            media_order = _require_int(media_order, f"references[{index}].media_order", 1)
        scope = str(item.get("scope", ""))
        if scope not in {"", "global", "shot"}:
            raise TimelineValidationError(
                f"references[{index}].scope must be global or shot"
            )
        normalized["references"].append({
            "reference_id": reference_id, "type": reference_type,
            "media_type": media_type,
            "media_order": media_order,
            "scope": scope, "shot_id": str(item.get("shot_id", "")),
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
            if collection_name == "audio":
                audio_type = str(item.get("type", "dialogue"))
                if audio_type not in AUDIO_TYPES:
                    raise TimelineValidationError(
                        f"audio[{index}].type must be one of {sorted(AUDIO_TYPES)}"
                    )
                muted = item.get("muted", False)
                if not isinstance(muted, bool):
                    raise TimelineValidationError(f"audio[{index}].muted must be a boolean")
                entry.update({
                    "type": audio_type,
                    "track_id": str(item.get("track_id", "")),
                    "speaker_id": str(item.get("speaker_id", "")),
                    "asset_id": str(item.get("asset_id", "")),
                    "offset_frames": _require_int(
                        item.get("offset_frames", 0), f"audio[{index}].offset_frames"
                    ),
                    "volume_db": _require_number(
                        item.get("volume_db", 0.0), f"audio[{index}].volume_db", -120.0
                    ),
                    "fade_in_frames": _require_int(
                        item.get("fade_in_frames", 0), f"audio[{index}].fade_in_frames"
                    ),
                    "fade_out_frames": _require_int(
                        item.get("fade_out_frames", 0), f"audio[{index}].fade_out_frames"
                    ),
                    "muted": muted,
                    "prompt": str(item.get("prompt", "")),
                    "metadata": item.get("metadata", {})
                    if isinstance(item.get("metadata", {}), dict) else {},
                })
            else:
                entry.update({
                    "speaker_id": str(item.get("speaker_id", "")),
                    "text": str(item.get("text", "")),
                    "language": str(item.get("language", "zh-CN")),
                    "style": str(item.get("style", "default")),
                    "metadata": item.get("metadata", {})
                    if isinstance(item.get("metadata", {}), dict) else {},
                })
            normalized[collection_name].append(entry)
        normalized[collection_name].sort(key=lambda x: (x["start_frame"], x["end_frame"]))

    raw_music = raw.get("background_music", [])
    if raw_music is None:
        raw_music = []
    if isinstance(raw_music, dict):
        # v1.2 stored one global BGM object. An empty legacy object means no BGM.
        raw_music = [raw_music] if str(raw_music.get("asset_id", "")).strip() else []
    if not isinstance(raw_music, list):
        raise TimelineValidationError("background_music must be an array")

    timeline_seconds = total_frames / float(fps)
    seen_music: set[str] = set()
    for index, item in enumerate(raw_music):
        prefix = f"background_music[{index}]"
        if not isinstance(item, dict):
            raise TimelineValidationError(f"{prefix} must be an object")
        asset_id = str(item.get("asset_id", "")).strip()
        if not asset_id:
            continue
        music_id = str(item.get("music_id", f"BGM_{index + 1:03d}")).strip()
        if not music_id:
            raise TimelineValidationError(f"{prefix}.music_id must be a non-empty string")
        if music_id in seen_music:
            raise TimelineValidationError(f"duplicate music_id: {music_id}")
        seen_music.add(music_id)

        legacy_start = item.get("start_frame", 0)
        legacy_end = item.get("end_frame", total_frames)
        if isinstance(legacy_start, bool) or not isinstance(legacy_start, (int, float)):
            raise TimelineValidationError(f"{prefix}.start_frame must be numeric")
        if isinstance(legacy_end, bool) or not isinstance(legacy_end, (int, float)):
            raise TimelineValidationError(f"{prefix}.end_frame must be numeric")
        start_seconds = _require_number(
            item.get("start_seconds", float(legacy_start) / float(fps)),
            f"{prefix}.start_seconds",
        )
        end_seconds = _require_number(
            item.get("end_seconds", float(legacy_end) / float(fps)),
            f"{prefix}.end_seconds", 0.1,
        )
        if end_seconds <= start_seconds or end_seconds > timeline_seconds + 1e-6:
            raise TimelineValidationError(
                f"{prefix} range must be inside the timeline and end after start"
            )
        start_seconds = round(start_seconds * 10.0) / 10.0
        end_seconds = round(end_seconds * 10.0) / 10.0
        if end_seconds <= start_seconds or start_seconds > timeline_seconds - 0.1 + 1e-6:
            raise TimelineValidationError(
                f"{prefix} must remain at least 0.1 seconds after timeline snapping"
            )
        start_frame = max(0, round(start_seconds * float(fps)))
        end_frame = min(total_frames, max(start_frame + 1, round(end_seconds * float(fps))))

        loop = item.get("loop", False)
        if not isinstance(loop, bool):
            raise TimelineValidationError(f"{prefix}.loop must be a boolean")
        kind = str(item.get("kind", "music") or "music").strip().lower()
        if kind not in {"music", "ambience"}:
            raise TimelineValidationError(f"{prefix}.kind must be music or ambience")
        fade_in_seconds = _require_number(
            item.get(
                "fade_in_seconds",
                float(item.get("fade_in_frames", 0)) / float(fps),
            ),
            f"{prefix}.fade_in_seconds",
        )
        fade_out_seconds = _require_number(
            item.get(
                "fade_out_seconds",
                float(item.get("fade_out_frames", 0)) / float(fps),
            ),
            f"{prefix}.fade_out_seconds",
        )
        normalized["background_music"].append({
            "music_id": music_id,
            "kind": kind,
            "label": str(item.get("label", "") or "").strip(),
            "asset_id": asset_id,
            "start_seconds": start_seconds,
            "end_seconds": end_seconds,
            "start_frame": start_frame,
            "end_frame": end_frame,
            "volume_db": _require_number(
                item.get("volume_db", -12.0), f"{prefix}.volume_db", -100.0
            ),
            "loop": loop,
            "fade_in_seconds": round(fade_in_seconds * 10.0) / 10.0,
            "fade_out_seconds": round(fade_out_seconds * 10.0) / 10.0,
            "fade_in_frames": max(0, round(fade_in_seconds * float(fps))),
            "fade_out_frames": max(0, round(fade_out_seconds * float(fps))),
        })
    normalized["background_music"].sort(
        key=lambda item: (item["start_seconds"], item["end_seconds"], item["music_id"])
    )
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
