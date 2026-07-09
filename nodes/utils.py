import numpy as np
from PIL import Image

DEFAULT_MAX_DIMENSION = 16384


def tensor2pil(image):
    return Image.fromarray(np.clip(255. * image.cpu().numpy().squeeze(), 0, 255).astype(np.uint8))


def pil2tensor(image):
    import torch

    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0)


def clamp_dimension(value, default=512, max_value=DEFAULT_MAX_DIMENSION, min_value=1):
    try:
        value = int(round(float(value)))
    except (TypeError, ValueError):
        value = default

    value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def get_workflow_node_properties(hidden, defaults=None):
    props = dict(defaults or {})
    extra_pnginfo = getattr(hidden, "extra_pnginfo", None) or {}
    unique_id = getattr(hidden, "unique_id", None)

    try:
        target_id = int(unique_id)
    except (TypeError, ValueError):
        return props

    workflow = extra_pnginfo.get("workflow") or {}
    for node in workflow.get("nodes") or []:
        if node.get("id") == target_id:
            node_props = node.get("properties") or {}
            if isinstance(node_props, dict):
                props.update(node_props)
            break

    return props


def get_draw_color(hue, alpha):
    h = hue % 360
    s = 50
    l = 50
    l /= 100
    a = s * min(l, 1 - l) / 100

    def calculate_color(n, h, l, a):
        k = (n + h / 30) % 12
        color = l - a * max(min(k - 3, 9 - k, 1), -1)
        return hex(int(255 * color))[2:].zfill(2)

    red = calculate_color(0, h, l, a)
    green = calculate_color(8, h, l, a)
    blue = calculate_color(4, h, l, a)

    return "#{}{}{}{}".format(red, green, blue, alpha)
