from comfy_api.latest import io

from .constants import COLOR_DICT, REGIONAL_COLOR_REGIONS
from .node_outputs import rect_canvas_output
from .region_types import (
    DEFAULT_GRID_SIZE,
    DEFAULT_HEIGHT,
    DEFAULT_WIDTH,
    DIMENSION_STEP,
    MAX_GRID_SIZE,
    MAX_REGIONS,
    MAX_RESOLUTION,
    MIN_GRID_SIZE,
    MIN_RESOLUTION,
)
from .region_state import get_regional_properties, normalize_rect_state, region_inputs_to_properties
from .renderers import render_rect_canvas


def regional_color_canvas_inputs(*, exact_dimensions=False):
    min_resolution = 1 if exact_dimensions else MIN_RESOLUTION
    dimension_step = 1 if exact_dimensions else DIMENSION_STEP
    return [
        io.Int.Input(
            "width",
            default=DEFAULT_WIDTH,
            min=min_resolution,
            max=MAX_RESOLUTION,
            step=dimension_step,
        ),
        io.Int.Input(
            "height",
            default=DEFAULT_HEIGHT,
            min=min_resolution,
            max=MAX_RESOLUTION,
            step=dimension_step,
        ),
        io.Int.Input(
            "grid_size",
            display_name="grid size",
            default=DEFAULT_GRID_SIZE,
            min=MIN_GRID_SIZE,
            max=MAX_GRID_SIZE,
            step=MIN_GRID_SIZE,
        ),
        io.Int.Input(
            "regions",
            display_name="region count",
            default=1,
            min=1,
            max=MAX_REGIONS,
            step=1,
        ),
        REGIONAL_COLOR_REGIONS.Input(
            "region_data",
            display_name="regions",
            optional=True,
        ),
    ]


def regional_color_canvas_outputs():
    return [
        io.Image.Output(display_name="IMAGE"),
        COLOR_DICT.Output(display_name="COLOR_DICT"),
        io.Int.Output(display_name="WIDTH"),
        io.Int.Output(display_name="HEIGHT"),
    ]


class RegionalColorCanvas(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorCanvas",
            display_name="Regional Color Canvas",
            category="Regional Colors",
            description="Draw rectangular color regions from the node canvas.",
            hidden=[io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            inputs=regional_color_canvas_inputs(),
            outputs=regional_color_canvas_outputs(),
        )

    @classmethod
    def execute(
        cls,
        width: int,
        height: int,
        grid_size: int,
        regions: int,
        region_data=None,
    ) -> io.NodeOutput:
        props = get_regional_properties(cls.hidden)
        active_regions = regions
        if region_data is not None:
            props = region_inputs_to_properties(region_data, props)
            active_regions = None
        state = normalize_rect_state(
            props,
            canvas_width=width,
            canvas_height=height,
            grid_size=grid_size,
            active_regions=active_regions,
        )
        return rect_canvas_output(render_rect_canvas(state), state)
