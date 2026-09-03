import importlib.util
import json
import pathlib
import sys
import types
import unittest


PLUGIN_DIR = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = "cine_timeline_plan_only_tests"


def load_nodes():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(PLUGIN_DIR)]
    sys.modules[PACKAGE] = package
    for name in ("core", "plan_node"):
        spec = importlib.util.spec_from_file_location(
            f"{PACKAGE}.{name}", PLUGIN_DIR / f"{name}.py"
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{PACKAGE}.plan_node"]


nodes = load_nodes()


class PlanOnlyPluginTests(unittest.TestCase):
    def test_only_cine_timeline_plan_is_registered(self):
        self.assertEqual(
            set(nodes.NODE_CLASS_MAPPINGS),
            {"CineTimelinePlan", "CineTimelineVideoExtensionPlan"},
        )
        self.assertEqual(
            nodes.NODE_DISPLAY_NAME_MAPPINGS,
            {
                "CineTimelinePlan": "CineTimeline Plan",
                "CineTimelineVideoExtensionPlan": "CineTimeline Video Extension Plan",
            },
        )

    def test_plan_still_normalizes_and_packages_timeline(self):
        model = object()
        result = nodes.CineTimelinePlan().build(model, nodes.DEFAULT_STUDIO_TIMELINE)
        self.assertIs(result[0], model)
        self.assertEqual(result[2], 120)
        self.assertEqual(len(result), 7)
        self.assertFalse(result[3])
        self.assertIn('"schema":"cine_video_extension_plan"', result[4])
        self.assertIn('"schema":"cine_reference_plan"', result[5])
        self.assertFalse(result[6])

    def test_single_pass_is_an_explicit_route_separate_from_hq(self):
        timeline = json.loads(nodes.DEFAULT_STUDIO_TIMELINE)
        timeline["shots"][0]["metadata"]["postprocess_mode"] = "single_pass"
        result = nodes.CineTimelinePlan().build(object(), json.dumps(timeline))
        self.assertFalse(result[3])
        self.assertTrue(result[6])

    def test_segment_reference_plan_filters_and_renumbers_images(self):
        timeline = json.loads(nodes.DEFAULT_STUDIO_TIMELINE)
        timeline["total_frames"] = 240
        timeline["shots"] = [
            {"shot_id": "S1", "start_frame": 0, "end_frame": 120,
             "local_prompt": "use <Picture 1>", "camera": "", "transition": "cut",
             "metadata": {"render": {"status": "empty", "active_version": "", "versions": []}}},
            {"shot_id": "S2", "start_frame": 120, "end_frame": 240,
             "local_prompt": "use <Picture 2>", "camera": "", "transition": "cut",
             "metadata": {"render": {"status": "empty", "active_version": "", "versions": []}}},
        ]
        timeline["references"] = [
            {"reference_id": "R1", "type": "character", "media_type": "image",
             "image_index": 0, "start_frame": 0, "end_frame": 120, "strength": 1,
             "priority": 0, "asset_id": "one.png"},
            {"reference_id": "R2", "type": "character", "media_type": "image",
             "image_index": 1, "start_frame": 120, "end_frame": 240, "strength": 1,
             "priority": 0, "asset_id": "two.png"},
        ]
        result = nodes.CineTimelinePlan().build(
            object(), json.dumps(timeline), json.dumps(timeline), "S2", "run-2"
        )
        plan = json.loads(result[5])
        self.assertEqual(plan["image_slots"], [])
        self.assertEqual(plan["media"][0]["asset_id"], "two.png")
        self.assertEqual(plan["media"][0]["ordinal"], 1)
        self.assertIn("<Picture 1>", result[1])
        self.assertNotIn("<Picture 2>", result[1])

    def test_plan_carries_scoped_image_video_and_audio_assets(self):
        timeline = json.loads(nodes.DEFAULT_STUDIO_TIMELINE)
        timeline["shots"][0]["local_prompt"] = (
            "use <Picture 3>, <Video 2>, and <Audio 3>"
        )
        timeline["references"] = [
            {"reference_id": "I3", "type": "character", "media_type": "image",
             "media_order": 3, "start_frame": 0, "end_frame": 120,
             "strength": 1, "priority": 30, "asset_id": "refs/person.png"},
            {"reference_id": "V2", "type": "video", "media_type": "video",
             "media_order": 2, "start_frame": 0, "end_frame": 120,
             "strength": 1, "priority": 20, "asset_id": "refs/motion.mp4"},
            {"reference_id": "A3", "type": "audio", "media_type": "audio",
             "media_order": 3, "start_frame": 0, "end_frame": 120,
             "strength": 1, "priority": 10, "asset_id": "refs/voice.wav"},
        ]
        result = nodes.CineTimelinePlan().build(object(), json.dumps(timeline))
        plan = json.loads(result[5])
        self.assertEqual(
            [(x["media_type"], x["asset_id"], x["ordinal"]) for x in plan["media"]],
            [("image", "refs/person.png", 1),
             ("video", "refs/motion.mp4", 1),
             ("audio", "refs/voice.wav", 1)],
        )
        self.assertIn("<Picture 1>", result[1])
        self.assertIn("<Video 1>", result[1])
        self.assertIn("<Audio 1>", result[1])


if __name__ == "__main__":
    unittest.main()
