from comfy_api.latest import io, ui

from .utils import image_dimensions


class RegionalColorReferenceImage(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorReferenceImage",
            display_name="Regional Color Reference Image",
            category="Regional Colors",
            description="Passes through an image and outputs its exact width and height.",
            inputs=[io.Image.Input("image")],
            outputs=[
                io.Image.Output(display_name="IMAGE"),
                io.Int.Output(display_name="WIDTH"),
                io.Int.Output(display_name="HEIGHT"),
            ],
        )

    @classmethod
    def execute(cls, image: io.Image.Type) -> io.NodeOutput:
        width, height = image_dimensions(image)
        preview = ui.PreviewImage(image[:1], cls=cls).as_dict()
        preview["referenceDimensions"] = [width, height]
        return io.NodeOutput(
            image,
            width,
            height,
            ui=preview,
        )
