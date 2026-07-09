from __future__ import annotations

from .region_types import (
    DEFAULT_GRID_SIZE,
    DEFAULT_HEIGHT,
    DEFAULT_REGION_CELLS,
    DEFAULT_WIDTH,
    DIMENSION_STEP,
    GRID_SIZE_VALUES,
    MAX_GRID_SIZE,
    MAX_REGIONS,
    MAX_RESOLUTION,
    MIN_GRID_SIZE,
    MIN_RESOLUTION,
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


def snap_value(value: int, step: int) -> int:
    return int((value / step) + 0.5) * step


def normalize_canvas_dimension(value, default) -> int:
    clamped = clamp_dimension(
        value,
        default=default,
        max_value=MAX_RESOLUTION,
        min_value=MIN_RESOLUTION,
    )
    snapped = snap_value(clamped, DIMENSION_STEP)
    return clamp_dimension(snapped, default=default, max_value=MAX_RESOLUTION, min_value=MIN_RESOLUTION)


def normalize_grid_size(value) -> int:
    clamped = clamp_dimension(
        value,
        default=DEFAULT_GRID_SIZE,
        max_value=MAX_GRID_SIZE,
        min_value=MIN_GRID_SIZE,
    )
    return min(GRID_SIZE_VALUES, key=lambda grid_size: (abs(grid_size - clamped), grid_size))


def normalize_canvas_size(width, height, grid_size=None) -> CanvasSize:
    return CanvasSize(
        normalize_canvas_dimension(width, DEFAULT_WIDTH),
        normalize_canvas_dimension(height, DEFAULT_HEIGHT),
        normalize_grid_size(grid_size),
    )


def _rect_is_visible(rect: Rect) -> bool:
    return rect.width > 0 and rect.height > 0


def _rects_intersect(first: Rect, second: Rect) -> bool:
    return not (
        first.x + first.width <= second.x
        or second.x + second.width <= first.x
        or first.y + first.height <= second.y
        or second.y + second.height <= first.y
    )


def _first_free_rect(canvas: CanvasSize, width: int, height: int, existing_rects: tuple[Rect, ...]) -> Rect | None:
    max_x = max(0, canvas.width - width)
    max_y = max(0, canvas.height - height)
    for y in range(0, max_y + 1, canvas.grid_size):
        for x in range(0, max_x + 1, canvas.grid_size):
            candidate = Rect(x, y, width, height)
            if not any(_rects_intersect(candidate, existing) for existing in existing_rects):
                return candidate
    return None


def default_region_rect(canvas: CanvasSize, region_id: int, existing_rects: tuple[Rect, ...] = ()) -> Rect:
    width = min(canvas.width, canvas.grid_size * DEFAULT_REGION_CELLS)
    height = min(canvas.height, canvas.grid_size * DEFAULT_REGION_CELLS)
    max_x = max(0, canvas.width - width)
    max_y = max(0, canvas.height - height)
    visible_existing = tuple(rect for rect in existing_rects if _rect_is_visible(rect))
    free_rect = _first_free_rect(canvas, width, height, visible_existing)
    if free_rect:
        return free_rect

    fallback_width = min(canvas.width, canvas.grid_size)
    fallback_height = min(canvas.height, canvas.grid_size)
    fallback_rect = _first_free_rect(canvas, fallback_width, fallback_height, visible_existing)
    if fallback_rect:
        return fallback_rect

    if visible_existing:
        return Rect(0, 0, 0, 0)

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


def _normalize_rect(values: dict, canvas: CanvasSize, region_id: int, existing_rects: tuple[Rect, ...] = ()) -> Rect:
    raw_rect = values.get("rect")
    if not isinstance(raw_rect, dict):
        raw_rect = {}

    rect = Rect(
        snap_value(clamp_dimension(raw_rect.get("x"), default=0, max_value=canvas.width, min_value=0), canvas.grid_size),
        snap_value(clamp_dimension(raw_rect.get("y"), default=0, max_value=canvas.height, min_value=0), canvas.grid_size),
        snap_value(clamp_dimension(raw_rect.get("width"), default=0, max_value=canvas.width, min_value=0), canvas.grid_size),
        snap_value(clamp_dimension(raw_rect.get("height"), default=0, max_value=canvas.height, min_value=0), canvas.grid_size),
    )
    if rect.width == 0 or rect.height == 0:
        rect = default_region_rect(canvas, region_id, existing_rects)

    max_width = max(0, canvas.width - rect.x)
    max_height = max(0, canvas.height - rect.y)
    normalized = Rect(
        min(rect.x, canvas.width),
        min(rect.y, canvas.height),
        min(rect.width, max_width),
        min(rect.height, max_height),
    )
    if _rect_is_visible(normalized) and any(_rects_intersect(normalized, existing) for existing in existing_rects):
        visible_existing = tuple(rect for rect in existing_rects if _rect_is_visible(rect))
        return _first_free_rect(canvas, normalized.width, normalized.height, visible_existing) or default_region_rect(canvas, region_id, existing_rects)
    return normalized


def normalize_rect_state(props: dict, canvas_x=None, canvas_y=None, grid_size=None, active_regions=None) -> RectCanvasState:
    canvas_props = props.get("canvas") if isinstance(props.get("canvas"), dict) else {}
    canvas = normalize_canvas_size(
        canvas_x if canvas_x is not None else canvas_props.get("width"),
        canvas_y if canvas_y is not None else canvas_props.get("height"),
        grid_size if grid_size is not None else canvas_props.get("gridSize"),
    )
    active_regions = normalize_region_count(active_regions if active_regions is not None else props.get("activeRegions"))
    raw_regions = props.get("regions")

    regions = []
    for region_id in range(1, active_regions + 1):
        values = _region_values(raw_regions, region_id)
        color = normalize_color(
            values.get("color"),
            get_draw_color(region_id * 199, "FF")[:7],
        )
        regions.append(RectRegion(str(region_id), _normalize_rect(values, canvas, region_id, tuple(region.rect for region in regions)), color))

    return RectCanvasState(canvas, active_regions, tuple(regions))
