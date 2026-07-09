import sys
import unittest
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from nodes.region_state import normalize_rect_state  # noqa: E402
from nodes.renderers import render_rect_canvas  # noqa: E402
from nodes.utils import get_draw_color  # noqa: E402


class RegionStateTests(unittest.TestCase):
    def test_rect_state_clamps_dimensions_bounds_and_orders_active_regions(self):
        state = normalize_rect_state({
            "activeRegions": 2,
            "canvas": {"width": 100, "height": 80},
            "regions": {
                "2": {"rect": {"x": 90, "y": 70, "width": 50, "height": 50}, "color": "#112233"},
                "1": {"rect": {"x": -10, "y": 5, "width": 20, "height": 30}, "color": "#445566"},
                "3": {"rect": {"x": 0, "y": 0, "width": 10, "height": 10}, "color": "#778899"},
            },
        })

        self.assertEqual((state.canvas.width, state.canvas.height), (100, 80))
        self.assertEqual([region.region_id for region in state.regions], ["1", "2"])
        self.assertEqual(state.regions[0].rect.x, 0)
        self.assertEqual(state.regions[1].rect.width, 10)
        self.assertEqual(state.regions[1].rect.height, 10)

    def test_invalid_rect_color_uses_deterministic_fallback(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 16, "height": 16}, "color": "bad"},
            },
        })

        self.assertEqual(state.regions[0].color, get_draw_color(199, "FF")[:7])

class RendererTests(unittest.TestCase):
    def test_rect_renderer_returns_size_and_color_map(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 32, "height": 24},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 16, "height": 12}, "color": "#123456"},
            },
        })

        result = render_rect_canvas(state)

        self.assertEqual(result.image.size, (32, 24))
        self.assertEqual(result.colors, {"1": "#123456"})
        self.assertEqual(result.image.getpixel((1, 1)), (18, 52, 86))

if __name__ == "__main__":
    unittest.main()
