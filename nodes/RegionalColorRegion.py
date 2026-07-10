from comfy_api.latest import io

from .constants import REGIONAL_COLOR_REGION
from .region_types import DEFAULT_GRID_SIZE, MAX_GRID_SIZE, MIN_GRID_SIZE
from .region_state import region_input


class RegionalColorRegion(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorRegion",
            display_name="Regional Color Region",
            category="Regional Colors",
            description="Defines one rectangular region for a Regional Color Regions node.",
            inputs=[
                io.Int.Input("x", default=0, min=0, step=1),
                io.Int.Input("y", default=0, min=0, step=1),
                io.Int.Input("width", default=64, min=0, step=1),
                io.Int.Input("height", default=64, min=0, step=1),
                io.Int.Input(
                    "grid_size",
                    display_name="grid size",
                    default=DEFAULT_GRID_SIZE,
                    min=MIN_GRID_SIZE,
                    max=MAX_GRID_SIZE,
                    step=MIN_GRID_SIZE,
                    force_input=True,
                ),
            ],
            outputs=[REGIONAL_COLOR_REGION.Output(display_name="REGION")],
        )

    @classmethod
    def execute(
        cls,
        x: int,
        y: int,
        width: int,
        height: int,
        grid_size: int,
    ) -> io.NodeOutput:
        return io.NodeOutput(region_input(x, y, width, height, grid_size))
