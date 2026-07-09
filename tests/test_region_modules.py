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
            "canvas": {"width": 100, "height": 80, "gridSize": 64},
            "regions": {
                "2": {"rect": {"x": 90, "y": 0, "width": 50, "height": 50}, "color": "#112233"},
                "1": {"rect": {"x": -10, "y": 5, "width": 64, "height": 64}, "color": "#445566"},
                "3": {"rect": {"x": 0, "y": 0, "width": 10, "height": 10}, "color": "#778899"},
            },
        })

        self.assertEqual((state.canvas.width, state.canvas.height), (128, 64))
        self.assertEqual(state.canvas.grid_size, 64)
        self.assertEqual([region.region_id for region in state.regions], ["1", "2"])
        self.assertEqual(state.regions[0].rect.x, 0)
        self.assertEqual(state.regions[1].rect.x, 64)
        self.assertEqual(state.regions[1].rect.width, 64)
        self.assertEqual(state.regions[1].rect.height, 64)

    def test_canvas_inputs_override_properties_and_snap_to_64(self):
        state = normalize_rect_state(
            {
                "activeRegions": 3,
                "canvas": {"width": 512, "height": 512, "gridSize": 8},
                "regions": {},
            },
            canvas_width=100,
            canvas_height=130,
            grid_size=999,
            active_regions=1,
        )

        self.assertEqual((state.canvas.width, state.canvas.height), (128, 128))
        self.assertEqual(state.canvas.grid_size, 64)
        self.assertEqual(state.active_regions, 1)

    def test_grid_size_clamps_and_defaults_from_regional_canvas(self):
        default_state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64},
            "regions": {},
        })
        low_state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 1},
            "regions": {},
        })
        high_state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 999},
            "regions": {},
        })
        snapped_state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 13},
            "regions": {},
        })

        self.assertEqual(default_state.canvas.grid_size, 32)
        self.assertEqual(low_state.canvas.grid_size, 8)
        self.assertEqual(high_state.canvas.grid_size, 64)
        self.assertEqual(snapped_state.canvas.grid_size, 16)

    def test_rects_resnap_to_grid_size(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 128, "height": 128, "gridSize": 32},
            "regions": {
                "1": {"rect": {"x": 20, "y": 25, "width": 39, "height": 52}, "color": "#112233"},
            },
        })

        self.assertEqual(state.regions[0].rect.x, 32)
        self.assertEqual(state.regions[0].rect.y, 32)
        self.assertEqual(state.regions[0].rect.width, 32)
        self.assertEqual(state.regions[0].rect.height, 64)

    def test_missing_rect_uses_deterministic_grid_sized_default(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 128, "height": 128, "gridSize": 16},
            "regions": {"1": {"color": "#112233"}},
        })

        self.assertEqual(state.regions[0].rect.width, 32)
        self.assertEqual(state.regions[0].rect.height, 32)

    def test_missing_rect_uses_current_canvas_state_for_placement(self):
        state = normalize_rect_state({
            "activeRegions": 2,
            "canvas": {"width": 128, "height": 64, "gridSize": 32},
            "regions": {
                "1": {"rect": {"x": 64, "y": 0, "width": 64, "height": 64}, "color": "#112233"},
                "2": {"color": "#445566"},
            },
        })

        self.assertEqual(state.regions[1].rect.x, 0)
        self.assertEqual(state.regions[1].rect.y, 0)
        self.assertEqual(state.regions[1].rect.width, 64)
        self.assertEqual(state.regions[1].rect.height, 64)

    def test_overlapping_rect_moves_to_free_grid_slot(self):
        state = normalize_rect_state({
            "activeRegions": 2,
            "canvas": {"width": 128, "height": 64, "gridSize": 32},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 64, "height": 64}, "color": "#112233"},
                "2": {"rect": {"x": 32, "y": 0, "width": 64, "height": 64}, "color": "#445566"},
            },
        })

        self.assertEqual(state.regions[1].rect.x, 64)
        self.assertEqual(state.regions[1].rect.y, 0)
        self.assertEqual(state.regions[1].rect.width, 64)
        self.assertEqual(state.regions[1].rect.height, 64)

    def test_invalid_rect_color_uses_deterministic_fallback(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 32},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 16, "height": 16}, "color": "bad"},
            },
        })

        self.assertEqual(state.regions[0].color, get_draw_color(199, "FF")[:7])

class RendererTests(unittest.TestCase):
    def test_rect_renderer_returns_size_and_color_map(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 32},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 16, "height": 12}, "color": "#123456"},
            },
        })

        result = render_rect_canvas(state)

        self.assertEqual(result.image.size, (64, 64))
        self.assertEqual(result.colors, {"1": "#123456"})
        self.assertEqual(result.image.getpixel((1, 1)), (18, 52, 86))

if __name__ == "__main__":
    unittest.main()
