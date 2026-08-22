#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise ValueError(message)


def validate(plan: object) -> list[str]:
    if not isinstance(plan, dict):
        fail("timeline root must be an object")
    fps = plan.get("fps")
    total = plan.get("total_frames")
    if isinstance(fps, bool) or not isinstance(fps, (int, float)) or fps <= 0:
        fail("fps must be a positive number")
    if isinstance(total, bool) or not isinstance(total, int) or total <= 0:
        fail("total_frames must be a positive integer")
    shots = plan.get("shots")
    if not isinstance(shots, list) or not shots:
        fail("shots must be a non-empty array")

    warnings: list[str] = []
    cursor = 0
    seen: set[str] = set()
    for index, shot in enumerate(shots):
        if not isinstance(shot, dict):
            fail(f"shots[{index}] must be an object")
        shot_id = shot.get("shot_id")
        if not isinstance(shot_id, str) or not shot_id.strip():
            fail(f"shots[{index}].shot_id must be non-empty")
        if shot_id in seen:
            fail(f"duplicate shot_id: {shot_id}")
        seen.add(shot_id)
        start, end = shot.get("start_frame"), shot.get("end_frame")
        if not isinstance(start, int) or not isinstance(end, int) or end <= start:
            fail(f"{shot_id} has an invalid frame range")
        if start != cursor:
            fail(f"{shot_id} starts at {start}; expected contiguous frame {cursor}")
        cursor = end
        prompt = str(shot.get("local_prompt", ""))
        for field in (
            "integrated_multimodal_description:",
            "overall_soundscape:",
            "non_diegetic_music:",
        ):
            if field not in prompt:
                warnings.append(f"{shot_id} local_prompt misses {field[:-1]}")
        metadata = shot.get("metadata", {})
        if not isinstance(metadata, dict):
            fail(f"{shot_id}.metadata must be an object")
        mode = metadata.get("generation_mode")
        if mode not in {"h3_ref2va", "h3_fl2va"}:
            warnings.append(f"{shot_id} has unknown generation_mode: {mode!r}")
        for field in ("start_state", "trigger", "during_state", "end_state", "handoff"):
            if not str(metadata.get(field, "")).strip():
                warnings.append(f"{shot_id} metadata misses {field}")
        performance = metadata.get("performance")
        if performance is None:
            warnings.append(f"{shot_id} metadata misses performance")
        elif not isinstance(performance, dict):
            fail(f"{shot_id}.metadata.performance must be an object")
        else:
            for field in (
                "objective", "tactic", "stimulus", "action", "aftereffect",
                "relationship_result", "visible_cues",
            ):
                if not str(performance.get(field, "")).strip():
                    warnings.append(f"{shot_id} performance misses {field}")
        qc = metadata.get("qc")
        if qc is None:
            warnings.append(f"{shot_id} metadata misses qc")
        elif not isinstance(qc, dict):
            fail(f"{shot_id}.metadata.qc must be an object")
        else:
            criteria = (
                "dramatic_causality", "character_identity", "performance_observability",
                "spatial_action_readability", "camera_motivation",
                "visual_design_coherence", "audiovisual_timing",
                "reference_lora_correctness", "endpoint_continuity",
                "provider_schema_legality",
            )
            scores = []
            for field in criteria:
                value = qc.get(field)
                if isinstance(value, bool) or not isinstance(value, int) or value not in {0, 1, 2}:
                    warnings.append(f"{shot_id} qc has invalid {field}: {value!r}")
                else:
                    scores.append(value)
            if scores and (0 in scores or sum(scores) < 16):
                fail(f"{shot_id} does not pass the H3 prompt QC gate")
    if cursor != total:
        fail(f"shots end at {cursor}; total_frames is {total}")

    references = plan.get("references", [])
    if not isinstance(references, list):
        fail("references must be an array")
    for index, ref in enumerate(references):
        if not isinstance(ref, dict):
            fail(f"references[{index}] must be an object")
        start, end = ref.get("start_frame"), ref.get("end_frame")
        if not isinstance(start, int) or not isinstance(end, int) or not (0 <= start < end <= total):
            fail(f"references[{index}] has an invalid frame range")
    return warnings


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_plan.py <timeline.json>", file=sys.stderr)
        return 2
    try:
        plan = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        warnings = validate(plan)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        return 1
    print("PASS" if not warnings else "WARN")
    for warning in warnings:
        print(f"- {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
