from comfy_api.latest import io

from .utils import (
    DrawColor,
    clamp_dimension,
    draw_regions,
    get_workflow_node_properties,
    parse_region_data,
    pil2tensor,
    process_regions,
)


COLOR_DICT = io.Custom("COLOR_DICT")
MAX_REGIONS = 16
MAX_RESOLUTION = 16384


def _blank_regions():
    return {str(i): {"ratio": "1"} for i in range(1, MAX_REGIONS + 1)}


class RegionalColorRatio(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorRatio",
            display_name="Regional Color Ratio",
            category="Regional Colors",
            description="Generate region color layouts from structured region ratios.",
            hidden=[io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            inputs=[
                io.Int.Input("width", default=512, min=1, max=MAX_RESOLUTION, step=64),
                io.Int.Input("height", default=512, min=1, max=MAX_RESOLUTION, step=64),
                io.Combo.Input("divide_mode", options=["rows", "columns"], default="rows"),
                io.Int.Input("regions", default=1, min=1, max=MAX_REGIONS, step=1),
            ],
            outputs=[
                io.Image.Output(display_name="IMAGE"),
                io.Image.Output(display_name="IMAGE (numbered)"),
                COLOR_DICT.Output(display_name="COLOR_DICT"),
                io.Int.Output(display_name="WIDTH"),
                io.Int.Output(display_name="HEIGHT"),
            ],
        )

    @classmethod
    def execute(cls, width: int, height: int, divide_mode: str, regions: int) -> io.NodeOutput:
        width = clamp_dimension(width, default=512, max_value=MAX_RESOLUTION)
        height = clamp_dimension(height, default=512, max_value=MAX_RESOLUTION)
        active_regions = clamp_dimension(regions, default=1, max_value=MAX_REGIONS)
        if divide_mode not in {"rows", "columns"}:
            divide_mode = "rows"

        props = get_workflow_node_properties(cls.hidden, {"regions": _blank_regions()})
        region_data = props.get("regions")
        if not isinstance(region_data, dict):
            region_data = _blank_regions()

        input_regions = {}
        for region_id, values in region_data.items():
            if not isinstance(values, dict):
                continue
            try:
                numeric_id = int(region_id)
            except (TypeError, ValueError):
                continue
            if 1 <= numeric_id <= active_regions:
                input_regions[str(numeric_id)] = {"ratio": str(values.get("ratio", "1"))}

        if not input_regions:
            input_regions = {"1": {"ratio": "1"}}

        input_regions = dict(sorted(input_regions.items(), key=lambda item: int(item[0])))
        processed_regions = process_regions(input_regions, DrawColor())
        region_layers, colors = parse_region_data(processed_regions, width, height, divide_mode)
        image, image_numbered = draw_regions(width, height, region_layers, divide_mode)

        return io.NodeOutput(
            pil2tensor(image.convert("RGB")),
            pil2tensor(image_numbered.convert("RGB")),
            colors,
            width,
            height,
        )
