from comfy_api.latest import io, ui


COLOR_DICT = io.Custom("COLOR_DICT")
MAX_REGIONS = 16


class RegionalColorSelector(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorSelector",
            display_name="Regional Color Selector",
            category="Regional Colors",
            description="Select a region color from a Regional Colors dictionary.",
            is_output_node=True,
            inputs=[
                COLOR_DICT.Input("color_dict"),
                io.Int.Input("region_id", default=1, min=1, max=MAX_REGIONS),
            ],
            outputs=[
                io.String.Output(display_name="COLOR_HEX"),
            ],
        )

    @classmethod
    def execute(cls, color_dict: dict, region_id: int) -> io.NodeOutput:
        color = "error"
        region_key = str(region_id)

        if 1 <= int(region_id) <= MAX_REGIONS and isinstance(color_dict, dict):
            color = color_dict.get(region_key, color)

        return io.NodeOutput(color, ui=ui.PreviewText(color))
