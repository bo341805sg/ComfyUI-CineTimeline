from __future__ import annotations
import importlib.util, json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cinetimeline_core_test", ROOT / "core.py")
core = importlib.util.module_from_spec(spec); sys.modules[spec.name] = core; spec.loader.exec_module(core)

class TimelineCoreTests(unittest.TestCase):
    def setUp(self): self.source = json.loads((ROOT / "examples" / "multi_reference_timeline.json").read_text(encoding="utf-8"))
    def test_example_normalizes(self):
        timeline = core.normalize_timeline(self.source); self.assertEqual(timeline["version"], "1.4"); self.assertEqual(len(timeline["shots"]), 2); self.assertEqual(len(timeline["references"]), 4)
    def test_legacy_shared_prompts_are_promoted_to_timeline_scope(self):
        timeline = core.normalize_timeline(self.source)
        self.assertEqual(timeline["global_prompt"], self.source["shots"][0]["global_prompt"])
        self.assertEqual(timeline["negative_prompt"], self.source["shots"][0]["negative_prompt"])
        self.assertTrue(all(
            shot["global_prompt"] == timeline["global_prompt"]
            and shot["negative_prompt"] == timeline["negative_prompt"]
            for shot in timeline["shots"]
        ))
    def test_legacy_shot_specific_global_text_moves_to_local_prompt(self):
        self.source["shots"][1]["global_prompt"] = "different composition for segment two"
        timeline = core.normalize_timeline(self.source)
        self.assertEqual(timeline["global_prompt"], "")
        self.assertTrue(timeline["shots"][0]["local_prompt"].startswith(
            self.source["shots"][0]["global_prompt"]
        ))
        self.assertTrue(timeline["shots"][1]["local_prompt"].startswith(
            "different composition for segment two"
        ))
    def test_explicit_timeline_prompts_override_legacy_shot_fields(self):
        self.source["global_prompt"] = "shared visual bible"
        self.source["negative_prompt"] = "shared exclusions"
        timeline = core.normalize_timeline(self.source)
        self.assertTrue(all(shot["global_prompt"] == "shared visual bible" for shot in timeline["shots"]))
        self.assertTrue(all(shot["negative_prompt"] == "shared exclusions" for shot in timeline["shots"]))
    def test_shot_selection_by_id_and_frame(self):
        timeline = core.normalize_timeline(self.source); self.assertEqual(core.find_shot(timeline, "SHOT_002", 0)["start_frame"], 96); self.assertEqual(core.find_shot(timeline, "", 100)["shot_id"], "SHOT_002")
    def test_active_references(self):
        timeline = core.normalize_timeline(self.source); refs = core.active_references(timeline, 96, 192); self.assertEqual({r["reference_id"] for r in refs}, {"CHAR_A", "CHAR_B", "PLATFORM_SCENE", "SHOT_002_STORYBOARD"})
    def test_ltx_local_ranges(self):
        timeline = core.normalize_timeline(self.source); plan = core.build_ltx_plan(timeline, core.find_shot(timeline, "SHOT_002")); storyboard = next(r for r in plan["references"] if r["reference_id"] == "SHOT_002_STORYBOARD"); self.assertEqual(plan["total_frames"], 96); self.assertEqual((storyboard["local_start_frame"], storyboard["local_end_frame"]), (0, 96))
    def test_overlapping_shots_are_rejected(self):
        self.source["shots"][1]["start_frame"] = 80
        with self.assertRaises(core.TimelineValidationError): core.normalize_timeline(self.source)
    def test_continuity_metadata_is_normalized_without_timeline_overlap(self):
        self.source["shots"][1]["metadata"] = {
            "continue_from_previous": True, "continuity_handle_frames": 3,
        }
        timeline = core.normalize_timeline(self.source)
        self.assertEqual(timeline["shots"][1]["start_frame"], timeline["shots"][0]["end_frame"])
        self.assertTrue(timeline["shots"][1]["metadata"]["continue_from_previous"])
        self.assertEqual(timeline["shots"][1]["transition"], "motion_context")
        self.assertEqual(timeline["shots"][1]["metadata"]["continuity_handle_frames"], 3)
    def test_legacy_new_scene_migrates_to_direct_cut(self):
        self.source["shots"][1]["metadata"] = {
            "new_scene": True, "continue_from_previous": True,
        }
        timeline = core.normalize_timeline(self.source)
        shot = timeline["shots"][1]
        metadata = timeline["shots"][1]["metadata"]
        self.assertNotIn("new_scene", metadata)
        self.assertFalse(metadata["continue_from_previous"])
        self.assertEqual(shot["transition"], "cut")
    def test_first_shot_and_invalid_handle_counts_are_rejected(self):
        self.source["shots"][0]["metadata"] = {"continue_from_previous": True}
        with self.assertRaisesRegex(core.TimelineValidationError, "cannot continue"):
            core.normalize_timeline(self.source)
        self.source["shots"][0]["metadata"] = {"continuity_handle_frames": 4}
        with self.assertRaisesRegex(core.TimelineValidationError, "must be <= 3"):
            core.normalize_timeline(self.source)
    def test_negative_image_index_is_rejected(self):
        self.source["references"][0]["image_index"] = -1
        with self.assertRaises(core.TimelineValidationError): core.normalize_timeline(self.source)
    def test_audio_and_subtitle_tracks_normalize(self):
        self.source["audio"] = [{
            "audio_id": "DIALOGUE_001", "type": "dialogue", "track_id": "DIALOGUE_1",
            "speaker_id": "CHAR_A", "asset_id": "voice/a.wav", "start_frame": 12,
            "end_frame": 60, "offset_frames": 3, "volume_db": -2.5,
            "fade_in_frames": 4, "fade_out_frames": 6, "muted": False,
            "prompt": "你好",
        }]
        self.source["subtitles"] = [{
            "subtitle_id": "SUB_001", "speaker_id": "CHAR_A", "text": "你好",
            "language": "zh-CN", "style": "dialogue", "start_frame": 12, "end_frame": 60,
        }]
        timeline = core.normalize_timeline(self.source)
        self.assertEqual(timeline["audio"][0]["type"], "dialogue")
        self.assertEqual(timeline["audio"][0]["volume_db"], -2.5)
        self.assertEqual(timeline["subtitles"][0]["text"], "你好")
    def test_unknown_audio_type_is_rejected(self):
        self.source["audio"] = [{
            "audio_id": "AUDIO_001", "type": "unknown", "start_frame": 0, "end_frame": 24,
        }]
        with self.assertRaises(core.TimelineValidationError): core.normalize_timeline(self.source)
    def test_reference_media_type_and_background_music_normalize(self):
        self.source["references"][0].update({
            "media_type": "image", "media_order": 2,
            "scope": "shot", "shot_id": "SHOT_001",
        })
        self.source["background_music"] = {
            "asset_id": "music/theme.wav", "start_frame": 0, "end_frame": 192,
            "volume_db": -15, "loop": True, "fade_in_frames": 24,
            "fade_out_frames": 48,
        }
        timeline = core.normalize_timeline(self.source)
        self.assertEqual(timeline["references"][0]["media_type"], "image")
        normalized_reference = next(
            ref for ref in timeline["references"] if ref["reference_id"] == self.source["references"][0]["reference_id"]
        )
        self.assertEqual(normalized_reference["media_order"], 2)
        self.assertEqual((normalized_reference["scope"], normalized_reference["shot_id"]), ("shot", "SHOT_001"))
        self.assertEqual(len(timeline["background_music"]), 1)
        self.assertEqual(timeline["background_music"][0]["volume_db"], -15.0)
        self.assertTrue(timeline["background_music"][0]["loop"])
        self.assertEqual(timeline["background_music"][0]["music_id"], "BGM_001")

    def test_multiple_background_music_segments_keep_tenth_second_timing(self):
        self.source["background_music"] = [
            {
                "music_id": "BGM_001", "asset_id": "music/intro.wav",
                "start_seconds": 0.0, "end_seconds": 3.7, "volume_db": -12,
                "loop": False, "fade_in_seconds": 0.2, "fade_out_seconds": 0.4,
            },
            {
                "music_id": "BGM_002", "asset_id": "music/outro.wav",
                "start_seconds": 4.1, "end_seconds": 8.0, "volume_db": -9,
                "loop": True, "fade_in_seconds": 0.1, "fade_out_seconds": 0.3,
            },
        ]
        timeline = core.normalize_timeline(self.source)
        self.assertEqual([item["music_id"] for item in timeline["background_music"]], ["BGM_001", "BGM_002"])
        self.assertEqual(timeline["background_music"][0]["end_seconds"], 3.7)
        self.assertEqual(timeline["background_music"][1]["start_seconds"], 4.1)
        self.assertEqual(timeline["background_music"][1]["start_frame"], 98)

    def test_shot_render_versions_normalize_and_select_latest(self):
        self.source["shots"][0].setdefault("metadata", {})["render"] = {
            "status": "generated",
            "versions": [
                {"version_id": "V001", "asset_id": "shots/a.mp4", "storage_type": "output"},
                {
                    "version_id": "V002", "asset_id": "shots/b.mp4",
                    "storage_type": "output", "frames": 96,
                    "clip_start_seconds": 5.0, "clip_duration_seconds": 4.0,
                    "render_run_id": "RUN_002",
                    "latent_path": "ComfyOS/CineTimeline/Latents/S1/RUN_002/latent_00001.safetensors",
                    "latent_sha256": "a" * 64,
                    "latent_source_shot_id": "SHOT_000",
                    "latent_source_version_id": "V000",
                    "latent_source_sha256": "b" * 64,
                    "transition": "motion_context", "width": 1312, "height": 736,
                },
            ],
        }
        timeline = core.normalize_timeline(self.source)
        render = timeline["shots"][0]["metadata"]["render"]
        self.assertEqual(render["active_version"], "V002")
        self.assertEqual(render["versions"][1]["frames"], 96)
        self.assertEqual(render["versions"][1]["clip_start_seconds"], 5.0)
        self.assertEqual(render["versions"][1]["clip_duration_seconds"], 4.0)
        self.assertEqual(render["versions"][1]["latent_sha256"], "a" * 64)
        self.assertEqual(render["versions"][1]["width"], 1312)
        self.assertEqual(render["status"], "generated")

    def test_motion_context_is_explicit_and_requires_a_previous_segment(self):
        self.source["shots"][1]["transition"] = "motion_context"
        timeline = core.normalize_timeline(self.source)
        self.assertEqual(timeline["shots"][1]["transition"], "motion_context")
        self.source["shots"][0]["transition"] = "motion_context"
        with self.assertRaisesRegex(core.TimelineValidationError, "without a previous shot"):
            core.normalize_timeline(self.source)

    def test_shot_render_rejects_unknown_active_or_duplicate_version(self):
        metadata = self.source["shots"][0].setdefault("metadata", {})
        metadata["render"] = {
            "status": "generated", "active_version": "V999",
            "versions": [{"version_id": "V001", "asset_id": "shots/a.mp4"}],
        }
        with self.assertRaisesRegex(core.TimelineValidationError, "active_version"):
            core.normalize_timeline(self.source)
        metadata["render"] = {
            "status": "generated",
            "versions": [
                {"version_id": "V001", "asset_id": "shots/a.mp4"},
                {"version_id": "V001", "asset_id": "shots/b.mp4"},
            ],
        }
        with self.assertRaisesRegex(core.TimelineValidationError, "duplicate render version"):
            core.normalize_timeline(self.source)
        metadata["render"] = {
            "status": "generated",
            "versions": [{
                "version_id": "V001", "asset_id": "shots/a.mp4",
                "clip_duration_seconds": 0,
            }],
        }
        with self.assertRaisesRegex(core.TimelineValidationError, "greater than zero"):
            core.normalize_timeline(self.source)

if __name__ == "__main__": unittest.main()
