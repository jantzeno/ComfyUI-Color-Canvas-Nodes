from dataclasses import dataclass


MAX_REGIONS = 16
MAX_RESOLUTION = 16384
DEFAULT_WIDTH = 512
DEFAULT_HEIGHT = 512
DEFAULT_CELL_SIZE = 64
DEFAULT_REGION_CELLS = 2
REGIONAL_COLOR_VERSION = 1

ColorMap = dict[str, str]


@dataclass(frozen=True)
class CanvasSize:
    width: int = DEFAULT_WIDTH
    height: int = DEFAULT_HEIGHT


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


@dataclass(frozen=True)
class RatioSpec:
    layout: str = "1"
    cells: str = "1"
    rotation: int = 0


@dataclass(frozen=True)
class RatioRegion:
    region_id: str
    ratio: RatioSpec


@dataclass(frozen=True)
class RectCanvasState:
    canvas: CanvasSize
    active_regions: int
    regions: tuple[RectRegion, ...]


@dataclass(frozen=True)
class RatioCanvasState:
    canvas: CanvasSize
    active_regions: int
    divide_mode: str
    regions: tuple[RatioRegion, ...]


@dataclass(frozen=True)
class RectRenderResult:
    image: object
    colors: ColorMap
    width: int
    height: int


@dataclass(frozen=True)
class RatioRenderResult:
    image: object
    numbered_image: object
    colors: ColorMap
    width: int
    height: int
