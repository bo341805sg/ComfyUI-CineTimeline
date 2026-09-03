import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch


PLUGIN_DIR = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cine_reference_router_tests", PLUGIN_DIR / "reference_router.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


class ReferenceRouterTests(unittest.TestCase):
    def test_asset_media_are_loaded_and_forwarded_to_h3(self):
        captured = {}

        def builder(*args):
            captured["args"] = args
            return ("conditioning", "latent", "audio", "prompt", "map", "report")

        plan = {"media": [
            {"media_type": "image", "reference_type": "character", "asset_id": "i.png", "ordinal": 1},
            {"media_type": "video", "reference_type": "video", "asset_id": "v.mp4", "ordinal": 1},
            {"media_type": "audio", "reference_type": "audio", "asset_id": "a.wav", "ordinal": 1},
        ]}
        with patch.object(router, "_conditioning_builder", return_value=builder), \
             patch.object(router, "_load_image", return_value="IMAGE"), \
             patch.object(router, "_load_video", return_value=("FRAMES", "SOUNDTRACK")), \
             patch.object(router, "_load_audio", return_value="AUDIO"):
            result = router.CineTimelineH3ReferenceConditioning().build(
                "clip", "vvae", "avae", "prompt", 864, 480, 124, json.dumps(plan)
            )
        self.assertEqual(result[0], "conditioning")
        self.assertEqual(captured["args"][19], {"ref_image_1": "IMAGE"})
        self.assertEqual(captured["args"][20], {"ref_video_1": "FRAMES"})
        self.assertEqual(captured["args"][21], {"ref_video_audio_1": "SOUNDTRACK"})
        self.assertEqual(captured["args"][22], {"ref_audio_1": "AUDIO"})
        report = json.loads(result[5].splitlines()[-1])
        self.assertEqual(report["videos"], 1)
        self.assertEqual(report["video_soundtracks"], 1)
        self.assertEqual(report["audios"], 1)
        self.assertEqual(
            report["loaded_media"],
            ["image1=i.png", "video1=v.mp4", "audio1=a.wav"],
        )

    def test_first_and_last_frames_use_keyframe_inputs(self):
        captured = {}
        def builder(*args):
            captured["args"] = args
            return (1, 2, 3, 4, 5, 6)
        plan = {"media": [
            {"media_type": "image", "reference_type": "first_frame", "asset_id": "first.png", "ordinal": 1},
            {"media_type": "image", "reference_type": "last_frame", "asset_id": "last.png", "ordinal": 2},
        ]}
        with patch.object(router, "_conditioning_builder", return_value=builder), \
             patch.object(router, "_load_image", side_effect=["FIRST", "LAST"]):
            router.CineTimelineH3ReferenceConditioning().build(
                "clip", "vvae", "avae", "prompt", 864, 480, 124, json.dumps(plan)
            )
        self.assertEqual(captured["args"][17:19], ("FIRST", "LAST"))
        self.assertEqual(captured["args"][19], {})


if __name__ == "__main__":
    unittest.main()
