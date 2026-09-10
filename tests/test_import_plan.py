"""CPU-only import duration and continuation plan regression tests."""
import ast
import copy
import importlib
import json
import pathlib
import sys
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
package = types.ModuleType('cine_import_plan_tests')
package.__path__ = [str(ROOT)]
sys.modules[package.__name__] = package
plan = importlib.import_module(package.__name__ + '.plan_node')
tree = ast.parse((ROOT / 'routes.py').read_text(encoding='utf-8'))
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_validate_import_duration')
scope = {}
exec(compile(ast.Module(body=[fn], type_ignores=[]), 'duration', 'exec'), scope)
validate_duration = scope['_validate_import_duration']


class ImportedPlanTests(unittest.TestCase):
    def test_small_surplus(self):
        for frames in (360, 362, 366):
            self.assertEqual(validate_duration(frames, 24, 15), 360)

    def test_short_excessive_or_wrong_fps_rejected(self):
        for frames, fps in ((359, 24), (367, 24), (360, 30)):
            with self.assertRaises(ValueError):
                validate_duration(frames, fps, 15)

    def make_state(self):
        state = json.loads(plan.DEFAULT_STUDIO_TIMELINE)
        first = state['shots'][0]
        first['end_frame'] = 360
        first['metadata'] = {'duration_seconds': 15, 'render': {
            'active_version': 'import1', 'versions': [{
                'version_id': 'import1', 'asset_id': 'imported.mp4',
                'imported_video': True, 'latent_path': 'imported.safetensors',
                'latent_sha256': 'a' * 64}]}}
        second = copy.deepcopy(first)
        second.update(shot_id='SEGMENT_002', start_frame=360, end_frame=720,
                      transition='motion_context', metadata={'duration_seconds': 15})
        state['shots'].append(second)
        state['total_frames'] = 720
        state['metadata'] = {'render_target_shot_id': 'SEGMENT_002'}
        return state

    def test_current_editor_import_beats_old_connected_cache(self):
        state = self.make_state()
        stale = copy.deepcopy(state)
        stale['shots'][0]['metadata']['render']['versions'][0]['latent_path'] = 'old'
        result = plan.CineTimelinePlan().build(None, json.dumps(stale), json.dumps(state))
        extension = json.loads(result[4])
        self.assertEqual(extension['source_latent_path'], 'imported.safetensors')
        self.assertEqual(extension['source_latent_sha256'], 'a' * 64)
        self.assertEqual(extension['requested_frame_count'], 360)
        self.assertGreaterEqual(extension['generation_frame_count'] - 22, 360)
        self.assertEqual(plan.CineTimelineVideoExtensionPlan().parse(result[4])[:4],
                         (True, 'imported.safetensors', '22', 24))

    def test_missing_import_cache_rejected(self):
        state = self.make_state()
        state['shots'][0]['metadata']['render']['versions'][0]['latent_path'] = ''
        with self.assertRaises(plan.TimelineValidationError):
            plan.CineTimelinePlan().build(None, timeline_state=json.dumps(state))


if __name__ == '__main__':
    unittest.main()
