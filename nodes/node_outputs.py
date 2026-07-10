from comfy_api.latest import io

from .region_state import serialize_rect_state
from .utils import pil2tensor


def rect_canvas_values(result):
    return (
        pil2tensor(result.image.convert("RGB")),
        result.colors,
        result.width,
        result.height,
    )


def rect_canvas_ui(result, state=None, extra_ui=None):
    ui = {"dims": [result.width, result.height]}
    if state is not None:
        ui["regionalColor"] = [serialize_rect_state(state)]
    if extra_ui:
        ui.update(extra_ui)
    return ui


def rect_canvas_output(result, state=None, extra_ui=None) -> io.NodeOutput:
    return io.NodeOutput(
        *rect_canvas_values(result),
        ui=rect_canvas_ui(result, state, extra_ui),
    )
