from comfy_api.latest import io

from .constants import COLOR_DICT, MAX_REGIONS, MAX_RESOLUTION
from .node_outputs import ratio_canvas_output
from .region_state import get_regional_properties, normalize_ratio_state
from .renderers import render_ratio_canvas


class RegionalColorRatio(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorRatio",
            display_name="Regional Color Ratio",
            category="Regional Colors",
            description="Generate region color layouts from structured region ratios.",
            hidden=[io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            inputs=[
                io.Int.Input("width", default=512, min=1, max=MAX_RESOLUTION, step=64),
                io.Int.Input("height", default=512, min=1, max=MAX_RESOLUTION, step=64),
                io.Combo.Input("divide_mode", options=["rows", "columns"], default="rows"),
                io.Int.Input("regions", default=1, min=1, max=MAX_REGIONS, step=1),
            ],
            outputs=[
                io.Image.Output(display_name="IMAGE"),
                io.Image.Output(display_name="IMAGE (numbered)"),
                COLOR_DICT.Output(display_name="COLOR_DICT"),
                io.Int.Output(display_name="WIDTH"),
                io.Int.Output(display_name="HEIGHT"),
            ],
        )

    @classmethod
    def execute(cls, width: int, height: int, divide_mode: str, regions: int) -> io.NodeOutput:
        state = normalize_ratio_state(get_regional_properties(cls.hidden), width, height, divide_mode, regions)
        return ratio_canvas_output(render_ratio_canvas(state))
