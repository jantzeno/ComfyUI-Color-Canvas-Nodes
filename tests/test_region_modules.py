import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace

import numpy as np
import torch


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

comfy_api = ModuleType("comfy_api")
comfy_api_latest = ModuleType("comfy_api.latest")
comfy_api_latest.io = SimpleNamespace(NodeOutput=object)
comfy_api.latest = comfy_api_latest
sys.modules.setdefault("comfy_api", comfy_api)
sys.modules.setdefault("comfy_api.latest", comfy_api_latest)

from nodes.attention_runtime import (  # noqa: E402
    apply_ppm_attention_with_clip,
    build_hook_conditioning,
    clip_with_hooks,
    concat_base_conditioning,
    full_canvas_mask,
    numbered_input_index,
    region_mask,
    validate_numbered_inputs,
)
from nodes.node_outputs import rect_canvas_ui  # noqa: E402
from nodes.region_state import (  # noqa: E402
    normalize_rect_state,
    normalize_grid_size,
    region_input,
    region_inputs_to_properties,
    regions_input,
    serialize_rect_state,
)
from nodes.renderers import render_rect_canvas  # noqa: E402
from nodes.selector_state import (  # noqa: E402
    select_region_color,
    selector_ui_payload,
)
from nodes.utils import (  # noqa: E402
    get_draw_color,
    image_dimensions,
    prompt_input_is_linked,
    resolve_reference_dimensions,
)


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

    def test_reference_canvas_keeps_exact_image_dimensions(self):
        state = normalize_rect_state(
            {
                "activeRegions": 1,
                "regions": {},
            },
            canvas_width=101,
            canvas_height=77,
            grid_size=16,
            exact_dimensions=True,
        )

        self.assertEqual((state.canvas.width, state.canvas.height), (101, 77))

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

    def test_region_input_clamps_to_non_negative_rect_values(self):
        region = region_input(-10, 12.4, "31.9", None, grid_size=8)

        self.assertEqual(region.rect.x, 0)
        self.assertEqual(region.rect.y, 16)
        self.assertEqual(region.rect.width, 32)
        self.assertEqual(region.rect.height, 8)
        self.assertEqual(region.grid_size, 8)

    def test_region_input_clamps_width_and_height_to_grid_size(self):
        region = region_input(0, 0, 0, 31, grid_size=32)

        self.assertEqual(region.rect.width, 32)
        self.assertEqual(region.rect.height, 32)

    def test_region_input_snaps_geometry_to_grid_size(self):
        region = region_input(20, 25, 39, 52, grid_size=32)

        self.assertEqual(region.rect.x, 32)
        self.assertEqual(region.rect.y, 32)
        self.assertEqual(region.rect.width, 32)
        self.assertEqual(region.rect.height, 64)

    def test_regions_input_keeps_active_slots_and_ignores_extras(self):
        first = region_input(0, 0, 64, 64)
        second = region_input(64, 0, 64, 64)

        regions = regions_input({"region1": first, "region2": second})

        self.assertEqual(regions.active_regions, 2)
        self.assertEqual(regions.regions, (first, second))

    def test_regions_input_infers_count_from_highest_connected_slot_and_preserves_gaps(self):
        first = region_input(0, 0, 64, 64)
        third = region_input(128, 0, 64, 64)

        regions = regions_input({"region1": first, "region3": third})

        self.assertEqual(regions.active_regions, 3)
        self.assertEqual(regions.regions, (first, None, third))

    def test_regions_input_missing_active_slot_defaults_during_canvas_normalization(self):
        regions = regions_input({
            "region1": region_input(0, 0, 64, 64),
            "region3": region_input(0, 0, 64, 64),
        })
        props = region_inputs_to_properties(regions)
        state = normalize_rect_state(
            props,
            canvas_width=128,
            canvas_height=64,
            grid_size=32,
        )

        self.assertEqual(state.active_regions, 3)
        self.assertEqual(state.regions[0].rect.x, 0)
        self.assertEqual(state.regions[1].rect.x, 64)
        self.assertEqual(state.regions[1].rect.width, 64)

    def test_connected_regions_use_canvas_owned_size_and_grid(self):
        regions = regions_input({"region1": region_input(20, 20, 39, 52, grid_size=8)})
        state = normalize_rect_state(
            region_inputs_to_properties(regions),
            canvas_width=128,
            canvas_height=128,
            grid_size=32,
        )

        self.assertEqual((state.canvas.width, state.canvas.height), (128, 128))
        self.assertEqual(state.canvas.grid_size, 32)
        self.assertEqual(state.regions[0].rect.x, 32)
        self.assertEqual(state.regions[0].rect.y, 32)
        self.assertEqual(state.regions[0].rect.width, 32)
        self.assertEqual(state.regions[0].rect.height, 64)

    def test_grid_size_uses_canvas_allowed_values(self):
        self.assertEqual(normalize_grid_size(1), 8)
        self.assertEqual(normalize_grid_size(13), 16)
        self.assertEqual(normalize_grid_size(999), 64)

    def test_rect_state_serializes_for_frontend_sync(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 32},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 32, "height": 32}, "color": "#123456"},
            },
        })

        data = serialize_rect_state(state)

        self.assertEqual(data["canvas"], {"width": 64, "height": 64, "gridSize": 32})
        self.assertEqual(data["version"], 2)
        self.assertEqual(data["activeRegions"], 1)
        self.assertEqual(data["regions"]["1"]["rect"]["width"], 32)
        self.assertEqual(data["regions"]["1"]["color"], "#123456")
        self.assertTrue(data["regions"]["1"]["enabled"])

    def test_enabled_state_defaults_true_and_persists_false(self):
        default_state = normalize_rect_state({"activeRegions": 1, "regions": {"1": {}}})
        disabled_state = normalize_rect_state({
            "activeRegions": 1,
            "regions": {"1": {"enabled": False}},
        })

        self.assertTrue(default_state.regions[0].enabled)
        self.assertFalse(disabled_state.regions[0].enabled)
        self.assertFalse(serialize_rect_state(disabled_state)["regions"]["1"]["enabled"])

    def test_connected_geometry_preserves_local_color_and_enabled_state(self):
        region_data = regions_input({"region1": region_input(32, 0, 32, 32)})
        props = region_inputs_to_properties(
            region_data,
            {
                "canvas": {"width": 64, "height": 64, "gridSize": 32},
                "regions": {"1": {"color": "#123456", "enabled": False}},
            },
        )
        state = normalize_rect_state(props)

        self.assertEqual(state.regions[0].color, "#123456")
        self.assertFalse(state.regions[0].enabled)
        self.assertEqual(state.regions[0].rect.x, 32)


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

    def test_canvas_ui_wraps_state_for_comfy_ui_list_aggregation(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 32},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 32, "height": 32}},
            },
        })
        result = render_rect_canvas(state)

        payload = rect_canvas_ui(result, state)

        self.assertEqual(payload["regionalColor"], [serialize_rect_state(state)])
        self.assertIsInstance(payload["regionalColor"][0], dict)

    def test_rect_renderer_uses_exclusive_right_and_bottom_edges(self):
        state = normalize_rect_state({
            "activeRegions": 1,
            "canvas": {"width": 64, "height": 64, "gridSize": 8},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 16, "height": 8}, "color": "#123456"},
            },
        })

        result = render_rect_canvas(state)

        self.assertEqual(result.image.getpixel((15, 7)), (18, 52, 86))
        self.assertEqual(result.image.getpixel((16, 7)), (0, 0, 0))
        self.assertEqual(result.image.getpixel((15, 8)), (0, 0, 0))


class DummyPatcher:
    def __init__(self):
        self.forced_hooks = None
        self.registered = None

    def register_all_hook_patches(self, hooks, target):
        self.registered = (hooks, target)


class DummyClip:
    def __init__(self):
        self.patcher = DummyPatcher()
        self.apply_hooks_to_conds = None
        self.use_clip_schedule = False

    def clone(self, disable_dynamic=False):
        return DummyClip()

    def tokenize(self, text):
        return text

    def encode_from_tokens_scheduled(self, tokens):
        value = float(len(tokens))
        tensor = torch.full((1, 2, 4), value)
        return [[tensor, {"pooled_output": torch.full((1, 4), value)}]]


class DummyHooksModule:
    class EnumWeightTarget:
        Clip = "clip"

    @staticmethod
    def create_target_dict(target):
        return {"target": target}

    @staticmethod
    def set_conds_props(conds, strength, set_cond_area, mask=None, hooks=None):
        result = []
        for conditioning in conds:
            updated = []
            for tensor, metadata in conditioning:
                values = metadata.copy()
                if hooks is not None:
                    values["hooks"] = hooks
                if mask is not None:
                    values.update({"mask": mask, "mask_strength": strength, "set_area_to_bounds": False})
                updated.append([tensor, values])
            result.append(updated)
        return result

    @staticmethod
    def set_default_conds_and_combine(conds, new_conds):
        result = []
        for conditioning, default_conditioning in zip(conds, new_conds):
            defaults = []
            for tensor, metadata in default_conditioning:
                values = metadata.copy()
                values["default"] = True
                defaults.append([tensor, values])
            result.append(conditioning + defaults)
        return result


class DummyHookGroup:
    def __init__(self):
        self.keyframes = "unset"

    def clone(self):
        return DummyHookGroup()

    def set_keyframes_on_hooks(self, value):
        self.keyframes = value


class AttentionRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.state = normalize_rect_state({
            "activeRegions": 2,
            "canvas": {"width": 64, "height": 32, "gridSize": 8},
            "regions": {
                "1": {"rect": {"x": 0, "y": 0, "width": 16, "height": 8}, "enabled": True},
                "2": {"rect": {"x": 16, "y": 0, "width": 16, "height": 8}, "enabled": False},
            },
        })
        self.base = [[torch.ones((1, 3, 4)), {"pooled_output": torch.ones((1, 4))}]]

    def test_numbered_inputs_parse_and_reject_indices_above_count(self):
        self.assertEqual(numbered_input_index("region3_prompt", "prompt"), 3)
        self.assertIsNone(numbered_input_index("region3_hooks", "prompt"))
        self.assertIsNone(validate_numbered_inputs(2, {"region2_prompt": "ok"}, "prompt"))
        self.assertIsNone(validate_numbered_inputs(2, {"region3_prompt": None}, "prompt"))
        self.assertIn(
            "region3_prompt",
            validate_numbered_inputs(2, {"region3_prompt": "linked"}, "prompt"),
        )

    def test_region_mask_matches_exact_rectangle_and_full_mask_covers_canvas(self):
        mask = region_mask(self.state, 1)

        self.assertEqual(tuple(mask.shape), (1, 64, 64))
        self.assertEqual(mask.sum().item(), 16 * 8)
        self.assertEqual(mask[0, 7, 15].item(), 1.0)
        self.assertEqual(mask[0, 7, 16].item(), 0.0)
        self.assertEqual(full_canvas_mask(self.state).sum().item(), 64 * 64)

    def test_concat_base_conditioning_appends_base_tokens(self):
        regional = [[torch.zeros((1, 2, 4)), {"marker": True}]]

        result = concat_base_conditioning(regional, self.base)

        self.assertEqual(tuple(result[0][0].shape), (1, 5, 4))
        self.assertTrue(result[0][1]["marker"])

    def test_clip_hooks_patch_encoding_without_duplicating_conditioning_hooks(self):
        clip = DummyClip()
        hooks = DummyHookGroup()

        result = clip_with_hooks(clip, hooks, DummyHooksModule)

        self.assertIsNot(result, clip)
        self.assertIsNone(result.apply_hooks_to_conds)
        self.assertIsNotNone(result.patcher.forced_hooks)
        self.assertIsNone(result.patcher.forced_hooks.keyframes)
        self.assertEqual(result.patcher.registered[0], hooks)

    def test_hook_conditioning_masks_region_and_defaults_base_elsewhere(self):
        result = build_hook_conditioning(
            self.state,
            DummyClip(),
            self.base,
            {"region1_prompt": "person one", "region2_prompt": "disabled"},
            hooks_module=DummyHooksModule,
        )

        self.assertEqual(len(result), 2)
        regional, default = result
        self.assertEqual(tuple(regional[0].shape), (1, 5, 4))
        self.assertEqual(regional[1]["mask"].sum().item(), 16 * 8)
        self.assertEqual(regional[1]["mask_strength"], 1.0)
        self.assertTrue(default[1]["default"])
        self.assertNotIn("mask", default[1])

    def test_hook_conditioning_returns_base_when_all_regions_are_dormant(self):
        result = build_hook_conditioning(
            self.state,
            DummyClip(),
            self.base,
            {"region2_prompt": "disabled"},
            hooks_module=DummyHooksModule,
        )

        self.assertIs(result, self.base)

    def test_ppm_delegation_skips_disabled_regions_and_returns_patched_model(self):
        import nodes as package_nodes

        captured = {}
        patched_model = object()

        class FakePPM:
            @classmethod
            def execute(cls, **kwargs):
                captured.update(kwargs)
                return SimpleNamespace(result=(patched_model,))

        previous_registry = getattr(package_nodes, "NODE_CLASS_MAPPINGS", None)
        package_nodes.NODE_CLASS_MAPPINGS = {"AttentionCouplePPM": FakePPM}
        try:
            from unittest.mock import patch

            model = SimpleNamespace(model=object())
            with patch("nodes.attention_runtime._supports_ppm_attention", return_value=True):
                result = apply_ppm_attention_with_clip(
                    model,
                    DummyClip(),
                    self.base,
                    self.state,
                    {"region1_prompt": "one", "region2_prompt": "disabled"},
                )
        finally:
            if previous_registry is None:
                del package_nodes.NODE_CLASS_MAPPINGS
            else:
                package_nodes.NODE_CLASS_MAPPINGS = previous_registry

        self.assertIs(result, patched_model)
        self.assertIn("cond_1", captured)
        self.assertIn("mask_1", captured)
        self.assertNotIn("cond_2", captured)
        self.assertEqual(captured["base_mask"].sum().item(), 64 * 64)

    def test_ppm_delegation_is_noop_without_enabled_prompts(self):
        model = object()

        result = apply_ppm_attention_with_clip(
            model,
            DummyClip(),
            self.base,
            self.state,
            {"region2_prompt": "disabled"},
        )

        self.assertIs(result, model)


class RegionalColorSelectorTests(unittest.TestCase):
    def test_selects_requested_region_color(self):
        color = select_region_color({"1": "#112233", "2": "#AABBCC"}, 2)

        self.assertEqual(color, "#AABBCC")

    def test_missing_region_returns_error(self):
        self.assertEqual(select_region_color({"1": "#112233"}, 2), "error")

    def test_ui_payload_supports_new_display_and_preview_text_fallback(self):
        payload = selector_ui_payload("#123456")

        self.assertEqual(payload["selectedColor"], "#123456")
        self.assertEqual(payload["text"], ("#123456",))


class ReferenceImageTests(unittest.TestCase):
    def setUp(self):
        self.image = np.zeros((2, 77, 101, 3), dtype=np.float32)

    def test_image_dimensions_use_bhwc_height_and_width(self):
        self.assertEqual(image_dimensions(self.image), (101, 77))

    def test_unlinked_dimensions_fall_back_to_exact_image_size(self):
        hidden = SimpleNamespace(unique_id="7", prompt={"7": {"inputs": {}}})

        dimensions = resolve_reference_dimensions(hidden, self.image, 512, 512)

        self.assertEqual(dimensions, (101, 77))

    def test_each_linked_dimension_is_respected_independently(self):
        hidden = SimpleNamespace(
            unique_id="7",
            prompt={"7": {"inputs": {"width": ["3", 1], "height": 600}}},
        )

        dimensions = resolve_reference_dimensions(hidden, self.image, 640, 600)

        self.assertTrue(prompt_input_is_linked(hidden, "width"))
        self.assertFalse(prompt_input_is_linked(hidden, "height"))
        self.assertEqual(dimensions, (640, 77))

    def test_both_linked_dimensions_override_image_size(self):
        hidden = SimpleNamespace(
            unique_id=7,
            prompt={
                7: {
                    "inputs": {
                        "width": ["3", 1],
                        "height": ["3", 2],
                    }
                }
            },
        )

        dimensions = resolve_reference_dimensions(hidden, self.image, 640, 704)

        self.assertEqual(dimensions, (640, 704))


if __name__ == "__main__":
    unittest.main()
