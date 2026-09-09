"""Guard the generated output roots without requiring a ComfyUI runtime."""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class OutputPathTests(unittest.TestCase):
    def test_new_outputs_share_cinetimeline_root(self):
        expected = {
            'plan_node.py': 'CineTimeline/Latents/',
            'keyframe_node.py': 'CineTimeline/Latents/',
            'normalized_save.py': 'CineTimeline/segments/segment',
            'routes.py': 'CineTimeline/final',
        }
        for filename, prefix in expected.items():
            with self.subTest(filename=filename):
                source = (ROOT / filename).read_text(encoding='utf-8')
                ast.parse(source)
                self.assertIn(prefix, source)
                self.assertNotIn('ComfyOS/CineTimeline/Latents/', source)
                self.assertNotIn('H3-CineTimeline/', source)
        self.assertIn('output_root / "CineTimeline" / "final"',
                      (ROOT / 'routes.py').read_text(encoding='utf-8'))
