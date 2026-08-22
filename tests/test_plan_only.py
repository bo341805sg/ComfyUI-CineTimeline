import importlib.util
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
        self.assertEqual(set(nodes.NODE_CLASS_MAPPINGS), {"CineTimelinePlan"})
        self.assertEqual(
            nodes.NODE_DISPLAY_NAME_MAPPINGS,
            {"CineTimelinePlan": "CineTimeline Plan"},
        )

    def test_plan_still_normalizes_and_packages_timeline(self):
        model = object()
        result = nodes.CineTimelinePlan().build(model, nodes.DEFAULT_STUDIO_TIMELINE)
        self.assertIs(result[0], model)
        self.assertEqual(result[2], 120)
        self.assertEqual(len(result), 5)
        self.assertIn('"schema":"cine_video_extension_plan"', result[4])


if __name__ == "__main__":
    unittest.main()
