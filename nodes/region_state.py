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
    REGIONAL_COLOR_VERSION,
    RegionalColorRegionInput,
    RegionalColorRegionsInput,
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


def region_input(x, y, width, height, grid_size=DEFAULT_GRID_SIZE) -> RegionalColorRegionInput:
    grid_size = normalize_grid_size(grid_size)
    return RegionalColorRegionInput(
        Rect(
            snap_value(clamp_dimension(x, default=0, max_value=None, min_value=0), grid_size),
            snap_value(clamp_dimension(y, default=0, max_value=None, min_value=0), grid_size),
            snap_value(clamp_dimension(width, default=grid_size, max_value=None, min_value=grid_size), grid_size),
            snap_value(clamp_dimension(height, default=grid_size, max_value=None, min_value=grid_size), grid_size),
        ),
        grid_size,
    )


def _region_slot_index(key: str) -> int | None:
    if not isinstance(key, str) or not key.startswith("region"):
        return None
    try:
        index = int(key.removeprefix("region"))
    except ValueError:
        return None
    return index if 1 <= index <= MAX_REGIONS else None


def regions_input(region_inputs: dict | None) -> RegionalColorRegionsInput:
    region_inputs = region_inputs if isinstance(region_inputs, dict) else {}
    connected_indices = [
        index
        for key, value in region_inputs.items()
        if value is not None and (index := _region_slot_index(key)) is not None
    ]
    count = max(connected_indices, default=1)
    regions = tuple(region_inputs.get(f"region{i}") for i in range(1, count + 1))
    return RegionalColorRegionsInput(count, regions)


def region_inputs_to_properties(region_data: RegionalColorRegionsInput, existing_props: dict | None = None) -> dict:
    existing_props = existing_props if isinstance(existing_props, dict) else {}
    existing_regions = existing_props.get("regions") if isinstance(existing_props.get("regions"), dict) else {}
    regions = {}
    for index, region in enumerate(region_data.regions[: region_data.active_regions], start=1):
        existing = existing_regions.get(str(index))
        values = existing.copy() if isinstance(existing, dict) else {}
        values.pop("rect", None)
        if not isinstance(region, RegionalColorRegionInput):
            regions[str(index)] = values
            continue
        rect = region.rect
        values["rect"] = {
            "x": rect.x,
            "y": rect.y,
            "width": rect.width,
            "height": rect.height,
        }
        regions[str(index)] = values
    result = {
        "activeRegions": region_data.active_regions,
        "regions": regions,
    }
    if isinstance(existing_props.get("canvas"), dict):
        result["canvas"] = existing_props["canvas"].copy()
    return result


def serialize_rect_state(state: RectCanvasState) -> dict:
    return {
        "version": REGIONAL_COLOR_VERSION,
        "activeRegions": state.active_regions,
        "selectedRegion": "1",
        "canvas": {
            "width": state.canvas.width,
            "height": state.canvas.height,
            "gridSize": state.canvas.grid_size,
        },
        "regions": {
            region.region_id: {
                "rect": {
                    "x": region.rect.x,
                    "y": region.rect.y,
                    "width": region.rect.width,
                    "height": region.rect.height,
                },
                "color": region.color,
                "enabled": region.enabled,
            }
            for region in state.regions
        },
    }


def snap_value(value: int, step: int) -> int:
    return int((value / step) + 0.5) * step


def normalize_canvas_dimension(value, default, *, exact=False) -> int:
    min_resolution = 1 if exact else MIN_RESOLUTION
    clamped = clamp_dimension(
        value,
        default=default,
        max_value=MAX_RESOLUTION,
        min_value=min_resolution,
    )
    if exact:
        return clamped
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


def normalize_canvas_size(width, height, grid_size=None, *, exact_dimensions=False) -> CanvasSize:
    return CanvasSize(
        normalize_canvas_dimension(width, DEFAULT_WIDTH, exact=exact_dimensions),
        normalize_canvas_dimension(height, DEFAULT_HEIGHT, exact=exact_dimensions),
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


def normalize_enabled(value) -> bool:
    return value if isinstance(value, bool) else True


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


def normalize_rect_state(
    props: dict,
    canvas_width=None,
    canvas_height=None,
    grid_size=None,
    active_regions=None,
    *,
    exact_dimensions=False,
) -> RectCanvasState:
    canvas_props = props.get("canvas") if isinstance(props.get("canvas"), dict) else {}
    canvas = normalize_canvas_size(
        canvas_width if canvas_width is not None else canvas_props.get("width"),
        canvas_height if canvas_height is not None else canvas_props.get("height"),
        grid_size if grid_size is not None else canvas_props.get("gridSize"),
        exact_dimensions=exact_dimensions,
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
        regions.append(
            RectRegion(
                str(region_id),
                _normalize_rect(values, canvas, region_id, tuple(region.rect for region in regions)),
                color,
                normalize_enabled(values.get("enabled")),
            )
        )

    return RectCanvasState(canvas, active_regions, tuple(regions))
