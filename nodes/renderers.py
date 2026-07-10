from __future__ import annotations

from PIL import Image, ImageDraw

from .region_types import RectRenderResult


def render_rect_canvas(state) -> RectRenderResult:
    image = Image.new("RGB", (state.canvas.width, state.canvas.height))
    draw = ImageDraw.Draw(image)
    colors = {}

    for region in state.regions:
        colors[region.region_id] = region.color
        rect = region.rect
        if rect.width == 0 or rect.height == 0:
            continue
        draw.rectangle(
            [rect.x, rect.y, rect.x + rect.width - 1, rect.y + rect.height - 1],
            fill=region.color,
        )

    return RectRenderResult(image, colors, state.canvas.width, state.canvas.height)
