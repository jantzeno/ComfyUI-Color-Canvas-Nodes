from comfy_api.latest import io, ui

from .RegionalColorCanvas import regional_color_canvas_inputs, regional_color_canvas_outputs
from .node_outputs import rect_canvas_output
from .region_state import get_regional_properties, normalize_rect_state, region_inputs_to_properties
from .renderers import render_rect_canvas
from .utils import image_dimensions, resolve_reference_dimensions


class RegionalColorCanvasReference(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorCanvasReference",
            display_name="Regional Color Canvas (Reference)",
            category="Regional Colors",
            description="Draw rectangular color regions over a reference image preview.",
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            inputs=[
                io.Image.Input("reference_image", display_name="reference image"),
                *regional_color_canvas_inputs(exact_dimensions=True),
            ],
            outputs=regional_color_canvas_outputs(),
        )

    @classmethod
    def execute(
        cls,
        reference_image: io.Image.Type,
        width: int,
        height: int,
        grid_size: int,
        regions: int,
        region_data=None,
    ) -> io.NodeOutput:
        reference_width, reference_height = image_dimensions(reference_image)
        width, height = resolve_reference_dimensions(cls.hidden, reference_image, width, height)
        props = get_regional_properties(cls.hidden)
        active_regions = regions
        if region_data is not None:
            props = region_inputs_to_properties(region_data, props)
            active_regions = None
        state = normalize_rect_state(
            props,
            canvas_width=width,
            canvas_height=height,
            grid_size=grid_size,
            active_regions=active_regions,
            exact_dimensions=True,
        )
        preview = ui.PreviewImage(reference_image[:1], cls=cls).as_dict()
        return rect_canvas_output(
            render_rect_canvas(state),
            state,
            extra_ui={
                "referenceImage": preview.get("images", []),
                "referenceDimensions": [reference_width, reference_height],
            },
        )
