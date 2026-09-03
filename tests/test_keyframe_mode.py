import importlib.util
import json
import pathlib
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = "cine_timeline_keyframe_tests"
package = types.ModuleType(PACKAGE)
package.__path__ = [str(ROOT)]
sys.modules[PACKAGE] = package
for name in ("core", "keyframe_node"):
    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.{name}", ROOT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
nodes = sys.modules[f"{PACKAGE}.keyframe_node"]


def test_default_keyframe_segment_compiles_first_and_last():
    data = json.loads(nodes.DEFAULT_KEYFRAME_TIMELINE)
    data["references"] = [
        {"reference_id": "FIRST", "media_type": "image", "scope": "shot", "shot_id": "SEGMENT_001", "keyframe_frame": 0},
        {"reference_id": "LAST", "media_type": "image", "scope": "shot", "shot_id": "SEGMENT_001", "keyframe_frame": 119},
    ]
    plan = nodes.compile_keyframe_timeline(json.dumps(data))
    assert plan["frame_count"] == 120
    assert [(x["role"], x["local_frame"]) for x in plan["guides"]] == [("first", 0), ("last", 119)]


def test_middle_keyframe_is_compiled_to_local_guide():
    data = json.loads(nodes.DEFAULT_KEYFRAME_TIMELINE)
    data["references"] = [
        {"reference_id": "FIRST", "media_type": "image", "scope": "shot", "shot_id": "SEGMENT_001", "keyframe_frame": 0},
        {"reference_id": "MID", "media_type": "image", "scope": "shot", "shot_id": "SEGMENT_001", "keyframe_frame": 48, "asset_id": "mid.png"},
        {"reference_id": "LAST", "media_type": "image", "scope": "shot", "shot_id": "SEGMENT_001", "keyframe_frame": 119},
    ]
    plan = nodes.compile_keyframe_timeline(json.dumps(data))
    assert plan["guides"][1]["role"] == "guide"
    assert plan["guides"][1]["local_frame"] == 48


def test_rejects_keyframes_without_boundary_anchors():
    data = json.loads(nodes.DEFAULT_KEYFRAME_TIMELINE)
    data["references"] = [
        {"reference_id": "FIRST", "media_type": "image", "scope": "shot", "shot_id": "SEGMENT_001", "keyframe_frame": 5},
        {"reference_id": "LAST", "media_type": "image", "scope": "shot", "shot_id": "SEGMENT_001", "keyframe_frame": 119},
    ]
    try:
        nodes.compile_keyframe_timeline(json.dumps(data))
    except nodes.TimelineValidationError as exc:
        assert "boundaries" in str(exc)
    else:
        raise AssertionError("missing first-frame anchor must fail")


def test_targeted_video_extension_uses_editor_active_latent():
    connected = json.loads(nodes.DEFAULT_KEYFRAME_TIMELINE)
    editor = json.loads(nodes.DEFAULT_KEYFRAME_TIMELINE)
    first = editor["shots"][0]
    first["metadata"]["render"] = {
        "status": "generated",
        "active_version": "V1",
        "versions": [{
            "version_id": "V1",
            "latent_path": r"G:\output\segment_1.safetensors",
            "latent_sha256": "a" * 64,
        }],
    }
    editor["shots"].append({
        "shot_id": "SEGMENT_002",
        "start_frame": 120,
        "end_frame": 240,
        "local_prompt": "continue",
        "camera": "",
        "transition": "motion_context",
        "metadata": {"postprocess_mode": "rtx_vsr"},
    })
    editor["total_frames"] = 240

    result = nodes.CineTimelineKeyframePlan().build(
        object(), json.dumps(connected), json.dumps(editor), "SEGMENT_002", "RUN2"
    )
    extension = json.loads(result[4])
    assert extension["enabled"] is True
    assert extension["source_shot_id"] == "SEGMENT_001"
    assert extension["source_version_id"] == "V1"
    assert extension["source_latent_path"] == r"G:\output\segment_1.safetensors"
    assert extension["source_latent_sha256"] == "a" * 64


def test_editor_metadata_target_selects_second_segment_when_optional_input_is_empty():
    timeline = _timeline()
    timeline["metadata"] = {
        "mode": "keyframe", "render_target_shot_id": "SEGMENT_002", "render_run_id": "RUN_META"
    }
    timeline["shots"][1]["transition"] = "motion_context"
    model = object()
    result = CineTimelineKeyframePlan().build(model, timeline_state=json.dumps(timeline))
    extension = json.loads(result[4])
    assert json.loads(result[5])["segment_id"] == "SEGMENT_002"
    assert extension["shot_id"] == "SEGMENT_002"
    assert extension["render_run_id"] == "RUN_META"
