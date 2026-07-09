from comfy_api.latest import io

from .utils import pil2tensor


def rect_canvas_output(result) -> io.NodeOutput:
    return io.NodeOutput(
        pil2tensor(result.image.convert("RGB")),
        result.colors,
        result.width,
        result.height,
    )


def ratio_canvas_output(result) -> io.NodeOutput:
    return io.NodeOutput(
        pil2tensor(result.image.convert("RGB")),
        pil2tensor(result.numbered_image.convert("RGB")),
        result.colors,
        result.width,
        result.height,
    )
