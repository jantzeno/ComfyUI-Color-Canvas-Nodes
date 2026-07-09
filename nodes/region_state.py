from __future__ import annotations

from .region_types import (
    DEFAULT_CELL_SIZE,
    DEFAULT_HEIGHT,
    DEFAULT_REGION_CELLS,
    DEFAULT_WIDTH,
    MAX_REGIONS,
    MAX_RESOLUTION,
    CanvasSize,
    Rect,
    RectCanvasState,
    RectRegion,
)
from .utils import clamp_dimension, get_draw_color, get_workflow_node_properties


def get_regional_properties(hidden) -> dict:
    props = get_workflow_node_properties(hidden, {})
    regional = props.get("regionalColor")
    if isinstance(regional, dict):
        return regional
    return {}


def normalize_region_count(value, default=1) -> int:
    return clamp_dimension(value, default=default, max_value=MAX_REGIONS)


def normalize_canvas_size(width, height) -> CanvasSize:
    return CanvasSize(
        clamp_dimension(width, default=DEFAULT_WIDTH, max_value=MAX_RESOLUTION),
        clamp_dimension(height, default=DEFAULT_HEIGHT, max_value=MAX_RESOLUTION),
    )


def default_region_rect(canvas: CanvasSize, region_id: int) -> Rect:
    width = min(canvas.width, DEFAULT_CELL_SIZE * DEFAULT_REGION_CELLS)
    height = min(canvas.height, DEFAULT_CELL_SIZE * DEFAULT_REGION_CELLS)
    max_x = max(0, canvas.width - width)
    max_y = max(0, canvas.height - height)
    columns = max(1, canvas.width // max(1, width))
    index = max(0, int(region_id) - 1)
    x = min(max_x, (index % columns) * width)
    y = min(max_y, (index // columns) * height)
    return Rect(x, y, width, height)


def normalize_color(value, fallback="#000000") -> str:
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        try:
            int(value[1:], 16)
            return value
        except ValueError:
            pass
    return fallback


def _region_values(raw_regions, region_id: int) -> dict:
    if not isinstance(raw_regions, dict):
        return {}
    values = raw_regions.get(str(region_id))
    return values if isinstance(values, dict) else {}


def _normalize_rect(values: dict, canvas: CanvasSize, region_id: int) -> Rect:
    raw_rect = values.get("rect")
    if not isinstance(raw_rect, dict):
        raw_rect = {}

    rect = Rect(
        clamp_dimension(raw_rect.get("x"), default=0, max_value=canvas.width, min_value=0),
        clamp_dimension(raw_rect.get("y"), default=0, max_value=canvas.height, min_value=0),
        clamp_dimension(raw_rect.get("width"), default=0, max_value=canvas.width, min_value=0),
        clamp_dimension(raw_rect.get("height"), default=0, max_value=canvas.height, min_value=0),
    )
    if rect.width == 0 or rect.height == 0:
        rect = default_region_rect(canvas, region_id)

    max_width = max(0, canvas.width - rect.x)
    max_height = max(0, canvas.height - rect.y)
    return Rect(rect.x, rect.y, min(rect.width, max_width), min(rect.height, max_height))


def normalize_rect_state(props: dict) -> RectCanvasState:
    canvas_props = props.get("canvas") if isinstance(props.get("canvas"), dict) else {}
    canvas = normalize_canvas_size(canvas_props.get("width"), canvas_props.get("height"))
    active_regions = normalize_region_count(props.get("activeRegions"))
    raw_regions = props.get("regions")

    regions = []
    for region_id in range(1, active_regions + 1):
        values = _region_values(raw_regions, region_id)
        color = normalize_color(
            values.get("color"),
            get_draw_color(region_id * 199, "FF")[:7],
        )
        regions.append(RectRegion(str(region_id), _normalize_rect(values, canvas, region_id), color))

    return RectCanvasState(canvas, active_regions, tuple(regions))
