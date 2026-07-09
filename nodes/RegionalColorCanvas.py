from comfy_api.latest import io

from .constants import COLOR_DICT
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
from .region_state import get_regional_properties, normalize_rect_state
from .renderers import render_rect_canvas


class RegionalColorCanvas(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorCanvas",
            display_name="Regional Color Canvas",
            category="Regional Colors",
            description="Draw rectangular color regions from the node canvas.",
            hidden=[io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            inputs=[
                io.Int.Input(
                    "canvasX",
                    default=DEFAULT_WIDTH,
                    min=MIN_RESOLUTION,
                    max=MAX_RESOLUTION,
                    step=DIMENSION_STEP,
                ),
                io.Int.Input(
                    "canvasY",
                    default=DEFAULT_HEIGHT,
                    min=MIN_RESOLUTION,
                    max=MAX_RESOLUTION,
                    step=DIMENSION_STEP,
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
                    default=1,
                    min=1,
                    max=MAX_REGIONS,
                    step=1,
                ),
            ],
            outputs=[
                io.Image.Output(display_name="IMAGE"),
                COLOR_DICT.Output(display_name="COLOR_DICT"),
                io.Int.Output(display_name="WIDTH"),
                io.Int.Output(display_name="HEIGHT"),
            ],
        )

    @classmethod
    def execute(cls, canvasX: int, canvasY: int, grid_size: int, regions: int) -> io.NodeOutput:
        state = normalize_rect_state(
            get_regional_properties(cls.hidden),
            canvas_x=canvasX,
            canvas_y=canvasY,
            grid_size=grid_size,
            active_regions=regions,
        )
        return rect_canvas_output(render_rect_canvas(state))
