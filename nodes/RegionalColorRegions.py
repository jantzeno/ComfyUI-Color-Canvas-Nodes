from comfy_api.latest import io

from .constants import MAX_REGIONS, REGIONAL_COLOR_REGION, REGIONAL_COLOR_REGIONS
from .region_state import regions_input


class RegionalColorRegions(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        region_template = io.Autogrow.TemplateNames(
            input=REGIONAL_COLOR_REGION.Input("region", optional=True),
            names=[f"region{i}" for i in range(1, MAX_REGIONS + 1)],
            min=0,
        )
        return io.Schema(
            node_id="RegionalColorRegions",
            display_name="Regional Color Regions",
            category="Regional Colors",
            description="Collects numbered Regional Color Region inputs for a Regional Color Canvas.",
            inputs=[
                io.Autogrow.Input("region_inputs", template=region_template, optional=True),
            ],
            outputs=[REGIONAL_COLOR_REGIONS.Output(display_name="REGIONS")],
        )

    @classmethod
    def execute(cls, region_inputs: io.Autogrow.Type | None = None) -> io.NodeOutput:
        return io.NodeOutput(regions_input(region_inputs))
