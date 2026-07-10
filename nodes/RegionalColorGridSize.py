from comfy_api.latest import io

from .region_types import DEFAULT_GRID_SIZE, MAX_GRID_SIZE, MIN_GRID_SIZE
from .region_state import normalize_grid_size


class RegionalColorGridSize(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorGridSize",
            display_name="Regional Color Grid Size",
            category="Regional Colors",
            description="Provides a reusable grid size for Regional Color Region nodes.",
            inputs=[
                io.Int.Input(
                    "grid_size",
                    display_name="grid size",
                    default=DEFAULT_GRID_SIZE,
                    min=MIN_GRID_SIZE,
                    max=MAX_GRID_SIZE,
                    step=MIN_GRID_SIZE,
                ),
            ],
            outputs=[io.Int.Output(display_name="GRID_SIZE")],
        )

    @classmethod
    def execute(cls, grid_size: int) -> io.NodeOutput:
        return io.NodeOutput(normalize_grid_size(grid_size))
