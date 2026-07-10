from comfy_api.latest import io

from .RegionalColorCanvas import regional_color_canvas_inputs, regional_color_canvas_outputs
from .attention_runtime import (
    HOOK_NAMES,
    PROMPT_NAMES,
    apply_ppm_attention_with_clip,
    build_hook_conditioning,
    validate_numbered_inputs,
)
from .constants import REGIONAL_COLOR_HOOKS
from .node_outputs import rect_canvas_ui, rect_canvas_values
from .region_state import get_regional_properties, normalize_rect_state, region_inputs_to_properties
from .renderers import render_rect_canvas


def prompt_autogrow_input():
    template = io.Autogrow.TemplateNames(
        input=io.String.Input(
            "prompt",
            optional=True,
            multiline=True,
            dynamic_prompts=True,
            placeholder="regional prompt",
        ),
        names=PROMPT_NAMES,
        min=0,
    )
    return io.Autogrow.Input("prompt_inputs", template=template, optional=True)


def hook_autogrow_input():
    template = io.Autogrow.TemplateNames(
        input=REGIONAL_COLOR_HOOKS.Input("hooks", optional=True),
        names=HOOK_NAMES,
        min=0,
    )
    return io.Autogrow.Input("hook_inputs", template=template, optional=True)


def attention_canvas_inputs(*, include_hooks=False):
    inputs = [
        io.Model.Input("model"),
        io.Clip.Input("clip"),
        io.Conditioning.Input("positive", display_name="base positive"),
        io.Conditioning.Input("negative", display_name="global negative"),
        *regional_color_canvas_inputs(),
        prompt_autogrow_input(),
    ]
    if include_hooks:
        inputs.append(hook_autogrow_input())
    return inputs


def attention_canvas_outputs():
    return [
        io.Model.Output(display_name="MODEL"),
        io.Conditioning.Output(display_name="POSITIVE"),
        io.Conditioning.Output(display_name="NEGATIVE"),
        *regional_color_canvas_outputs(),
    ]


def resolve_attention_canvas_state(hidden, width, height, grid_size, regions, region_data):
    props = get_regional_properties(hidden)
    active_regions = regions
    if region_data is not None:
        props = region_inputs_to_properties(region_data, props)
        active_regions = None
    return normalize_rect_state(
        props,
        canvas_width=width,
        canvas_height=height,
        grid_size=grid_size,
        active_regions=active_regions,
    )


def validate_attention_inputs(active_regions, prompt_inputs=None, hook_inputs=None):
    error = validate_numbered_inputs(active_regions, prompt_inputs, "prompt")
    if error:
        raise ValueError(error)
    error = validate_numbered_inputs(active_regions, hook_inputs, "hooks")
    if error:
        raise ValueError(error)


def attention_canvas_output(model, positive, negative, state):
    rendered = render_rect_canvas(state)
    return io.NodeOutput(
        model,
        positive,
        negative,
        *rect_canvas_values(rendered),
        ui=rect_canvas_ui(rendered, state),
    )


class RegionalColorAttentionCanvas(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorAttentionCanvas",
            display_name="Regional Color Attention Canvas",
            category="Regional Colors/Conditioning",
            description="Applies numbered regional prompts with Attention Couple (PPM).",
            hidden=[io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            inputs=attention_canvas_inputs(),
            outputs=attention_canvas_outputs(),
        )

    @classmethod
    def execute(
        cls,
        model,
        clip,
        positive,
        negative,
        width,
        height,
        grid_size,
        regions,
        region_data=None,
        prompt_inputs=None,
    ) -> io.NodeOutput:
        state = resolve_attention_canvas_state(
            cls.hidden, width, height, grid_size, regions, region_data
        )
        validate_attention_inputs(state.active_regions, prompt_inputs)
        model = apply_ppm_attention_with_clip(model, clip, positive, state, prompt_inputs)
        return attention_canvas_output(model, positive, negative, state)


class RegionalColorHookCanvasExperimental(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="RegionalColorHookCanvasExperimental",
            display_name="Regional Color Hook Canvas (Experimental)",
            category="Regional Colors/Conditioning",
            description="Applies regional prompts and native ComfyUI LoRA hooks by canvas mask.",
            is_experimental=True,
            hidden=[io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            inputs=attention_canvas_inputs(include_hooks=True),
            outputs=attention_canvas_outputs(),
        )

    @classmethod
    def execute(
        cls,
        model,
        clip,
        positive,
        negative,
        width,
        height,
        grid_size,
        regions,
        region_data=None,
        prompt_inputs=None,
        hook_inputs=None,
    ) -> io.NodeOutput:
        state = resolve_attention_canvas_state(
            cls.hidden, width, height, grid_size, regions, region_data
        )
        validate_attention_inputs(state.active_regions, prompt_inputs, hook_inputs)
        positive = build_hook_conditioning(state, clip, positive, prompt_inputs, hook_inputs)
        return attention_canvas_output(model, positive, negative, state)
