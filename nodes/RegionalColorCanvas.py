# Originally MultiAreaConditioning by Davemane42#0042 for ComfyUI
# Forked by jantzeno

from PIL import Image, ImageDraw
from comfy_api.latest import io

from .utils import clamp_dimension, get_draw_color, get_workflow_node_properties, pil2tensor


COLOR_DICT = io.Custom("COLOR_DICT")
MAX_REGIONS = 16
DEFAULT_CELL_SIZE = 64
DEFAULT_REGION_CELLS = 2


def _blank_regions():
    return {
        str(i): {"x": 0, "y": 0, "width": 0, "height": 0, "color": ""}
        for i in range(1, MAX_REGIONS + 1)
    }


def _default_region_rect(canvas_x, canvas_y, region_id):
    width = min(canvas_x, DEFAULT_CELL_SIZE * DEFAULT_REGION_CELLS)
    height = min(canvas_y, DEFAULT_CELL_SIZE * DEFAULT_REGION_CELLS)
    max_x = max(0, canvas_x - width)
    max_y = max(0, canvas_y - height)
    columns = max(1, canvas_x // max(1, width))
    index = max(0, int(region_id) - 1)
    x = min(max_x, (index % columns) * width)
    y = min(max_y, (index // columns) * height)
    return x, y, width, height


def _safe_color(value):
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        try:
            int(value[1:], 16)
            return value
        except ValueError:
            pass
    return "#000000"


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
        props = get_workflow_node_properties(
            cls.hidden,
            {
                "regions": _blank_regions(),
                "activeRegions": 1,
                "width": 512,
                "height": 512,
            },
        )

        regions = props.get("regions")
        if not isinstance(regions, dict):
            regions = _blank_regions()

        active_regions = clamp_dimension(props.get("activeRegions"), default=1, max_value=MAX_REGIONS)
        canvas_x = clamp_dimension(props.get("width"), default=512)
        canvas_y = clamp_dimension(props.get("height"), default=512)

        output_regions = []
        for region_id, values in regions.items():
            if not isinstance(values, dict):
                continue
            try:
                numeric_id = int(region_id)
            except (TypeError, ValueError):
                continue
            if 1 <= numeric_id <= active_regions:
                output_regions.append((numeric_id, str(numeric_id), values))

        output_regions.sort(key=lambda item: item[0])

        image = Image.new("RGB", (canvas_x, canvas_y))
        draw = ImageDraw.Draw(image)
        color_map = {}

        for _, region_id, values in output_regions:
            x = clamp_dimension(values.get("x"), default=0, max_value=canvas_x, min_value=0)
            y = clamp_dimension(values.get("y"), default=0, max_value=canvas_y, min_value=0)
            width = clamp_dimension(values.get("width"), default=0, max_value=canvas_x, min_value=0)
            height = clamp_dimension(values.get("height"), default=0, max_value=canvas_y, min_value=0)
            if width == 0 or height == 0:
                x, y, width, height = _default_region_rect(canvas_x, canvas_y, region_id)

            color = _safe_color(values.get("color") or get_draw_color(int(region_id) * 199, "FF")[:7])

            color_map[region_id] = color

            if x + width > canvas_x:
                width = max(0, canvas_x - x)
            if y + height > canvas_y:
                height = max(0, canvas_y - y)
            if width == 0 or height == 0:
                continue

            draw.rectangle([x, y, x + width, y + height], fill=color)

        return io.NodeOutput(pil2tensor(image.convert("RGB")), color_map, canvas_x, canvas_y)
