from dataclasses import dataclass
from typing import Optional


MAX_REGIONS = 16
MAX_RESOLUTION = 16384
MIN_RESOLUTION = 64
DIMENSION_STEP = 64
DEFAULT_WIDTH = 512
DEFAULT_HEIGHT = 512
DEFAULT_GRID_SIZE = 32
MIN_GRID_SIZE = 8
MAX_GRID_SIZE = 64
GRID_SIZE_VALUES = (8, 16, 32, 64)
DEFAULT_REGION_CELLS = 2
REGIONAL_COLOR_VERSION = 2

ColorMap = dict[str, str]


@dataclass(frozen=True)
class CanvasSize:
    width: int = DEFAULT_WIDTH
    height: int = DEFAULT_HEIGHT
    grid_size: int = DEFAULT_GRID_SIZE


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class RectRegion:
    region_id: str
    rect: Rect
    color: str
    enabled: bool = True


@dataclass(frozen=True)
class RegionalColorRegionInput:
    rect: Rect
    grid_size: int = DEFAULT_GRID_SIZE


@dataclass(frozen=True)
class RegionalColorRegionsInput:
    active_regions: int
    regions: tuple[Optional[RegionalColorRegionInput], ...]


@dataclass(frozen=True)
class RectCanvasState:
    canvas: CanvasSize
    active_regions: int
    regions: tuple[RectRegion, ...]


@dataclass(frozen=True)
class RectRenderResult:
    image: object
    colors: ColorMap
    width: int
    height: int
