from comfy_api.latest import io

from .utils import pil2tensor


def rect_canvas_output(result) -> io.NodeOutput:
    return io.NodeOutput(
        pil2tensor(result.image.convert("RGB")),
        result.colors,
        result.width,
        result.height,
    )
