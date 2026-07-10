from __future__ import annotations

import re
import sys

import torch

from .region_types import MAX_REGIONS, RectCanvasState


PROMPT_NAMES = [f"region{i}_prompt" for i in range(1, MAX_REGIONS + 1)]
HOOK_NAMES = [f"region{i}_hooks" for i in range(1, MAX_REGIONS + 1)]


def numbered_input_index(name: str, suffix: str) -> int | None:
    match = re.fullmatch(rf"region(\d+)_{re.escape(suffix)}", str(name))
    if not match:
        return None
    index = int(match.group(1))
    return index if 1 <= index <= MAX_REGIONS else None


def validate_numbered_inputs(active_regions: int, values: dict | None, suffix: str) -> str | None:
    values = values if isinstance(values, dict) else {}
    extras = sorted(
        index
        for name, value in values.items()
        if (index := numbered_input_index(name, suffix)) is not None
        and index > active_regions
        and value is not None
    )
    if not extras:
        return None
    names = ", ".join(f"region{index}_{suffix}" for index in extras)
    return f"Connected inputs exceed region count {active_regions}: {names}. Increase the count or disconnect them."


def region_value(values: dict | None, region_id: int, suffix: str, default=None):
    if not isinstance(values, dict):
        return default
    value = values.get(f"region{region_id}_{suffix}", default)
    return default if value is None else value


def region_mask(state: RectCanvasState, region_id: int) -> torch.Tensor:
    mask = torch.zeros((1, state.canvas.height, state.canvas.width), dtype=torch.float32)
    region = state.regions[region_id - 1]
    rect = region.rect
    if rect.width > 0 and rect.height > 0:
        mask[:, rect.y : rect.y + rect.height, rect.x : rect.x + rect.width] = 1.0
    return mask


def full_canvas_mask(state: RectCanvasState) -> torch.Tensor:
    return torch.ones((1, state.canvas.height, state.canvas.width), dtype=torch.float32)


def encode_text(clip, text: str):
    if clip is None:
        raise ValueError("CLIP input is required to encode regional prompts.")
    return clip.encode_from_tokens_scheduled(clip.tokenize(text))


def concat_base_conditioning(regional, base_positive):
    if len(base_positive) != 1:
        raise ValueError(
            "The experimental hook canvas requires base positive conditioning with exactly one entry."
        )
    base_tensor = base_positive[0][0]
    result = []
    for tensor, metadata in regional:
        if tensor.shape[0] != base_tensor.shape[0] or tensor.shape[2] != base_tensor.shape[2]:
            raise ValueError(
                "Regional and base conditioning tensor shapes are incompatible for concatenation."
            )
        result.append([torch.cat((tensor, base_tensor), dim=1), metadata.copy()])
    return result


def _hooks_module():
    import comfy.hooks

    return comfy.hooks


def clip_with_hooks(clip, hooks, hooks_module=None):
    if hooks is None:
        return clip
    hooks_module = hooks_module or _hooks_module()
    hooked_clip = clip.clone(disable_dynamic=True)
    hooked_clip.patcher.forced_hooks = hooks.clone()
    hooked_clip.use_clip_schedule = False
    hooked_clip.patcher.forced_hooks.set_keyframes_on_hooks(None)
    hooked_clip.patcher.register_all_hook_patches(
        hooks,
        hooks_module.create_target_dict(hooks_module.EnumWeightTarget.Clip),
    )
    return hooked_clip


def build_hook_conditioning(
    state,
    clip,
    base_positive,
    prompt_inputs=None,
    hook_inputs=None,
    hooks_module=None,
):
    if len(base_positive) != 1:
        raise ValueError(
            "The experimental hook canvas requires base positive conditioning with exactly one entry."
        )

    hooks_module = hooks_module or _hooks_module()
    regional = []
    for region_id, region in enumerate(state.regions, start=1):
        if not region.enabled:
            continue
        prompt = str(region_value(prompt_inputs, region_id, "prompt", ""))
        hooks = region_value(hook_inputs, region_id, "hooks")
        if not prompt.strip() and hooks is None:
            continue

        encoded = encode_text(clip_with_hooks(clip, hooks, hooks_module), prompt)
        encoded = concat_base_conditioning(encoded, base_positive)
        (encoded,) = hooks_module.set_conds_props(
            conds=[encoded],
            strength=1.0,
            set_cond_area="default",
            mask=region_mask(state, region_id),
            hooks=hooks,
        )
        regional.extend(encoded)

    if not regional:
        return base_positive
    (combined,) = hooks_module.set_default_conds_and_combine(
        conds=[regional],
        new_conds=[base_positive],
    )
    return combined


def _supports_ppm_attention(model) -> bool:
    from comfy.model_base import BaseModel, SDXL, SDXLRefiner

    model_type = type(model.model)
    return model_type is BaseModel or issubclass(model_type, (SDXL, SDXLRefiner))


def _ppm_node_class():
    core_nodes = sys.modules.get("nodes")
    registry = getattr(core_nodes, "NODE_CLASS_MAPPINGS", None)
    node_class = registry.get("AttentionCouplePPM") if isinstance(registry, dict) else None
    if node_class is None:
        raise RuntimeError(
            "Regional Color Attention Canvas requires ComfyUI-ppm and its AttentionCouplePPM node."
        )
    return node_class


def apply_ppm_attention_with_clip(model, clip, base_positive, state, prompt_inputs=None):
    regional = []
    for region_id, region in enumerate(state.regions, start=1):
        prompt = str(region_value(prompt_inputs, region_id, "prompt", ""))
        if region.enabled and prompt.strip():
            regional.append((region_id, prompt))

    if not regional:
        return model
    if not _supports_ppm_attention(model):
        raise ValueError("Regional Color Attention Canvas supports SD1/SD2-style U-Nets and SDXL only.")

    kwargs = {
        "model": model,
        "base_cond": base_positive,
        "base_mask": full_canvas_mask(state),
    }
    for slot, (region_id, prompt) in enumerate(regional, start=1):
        kwargs[f"cond_{slot}"] = encode_text(clip, prompt)
        kwargs[f"mask_{slot}"] = region_mask(state, region_id)

    output = _ppm_node_class().execute(**kwargs)
    result = output.result if hasattr(output, "result") else output
    if not isinstance(result, tuple) or len(result) != 1:
        raise RuntimeError("AttentionCouplePPM returned an unexpected result.")
    return result[0]
