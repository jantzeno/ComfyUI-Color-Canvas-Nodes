from comfy_api.latest import io

from .constants import COLOR_DICT
from .node_outputs import rect_canvas_output
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
            outputs=[
                io.Image.Output(display_name="IMAGE"),
                COLOR_DICT.Output(display_name="COLOR_DICT"),
                io.Int.Output(display_name="WIDTH"),
                io.Int.Output(display_name="HEIGHT"),
            ],
        )

    @classmethod
    def execute(cls) -> io.NodeOutput:
        state = normalize_rect_state(get_regional_properties(cls.hidden))
        return rect_canvas_output(render_rect_canvas(state))
