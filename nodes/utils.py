# From Comfyroll
from math import ceil, isclose, sqrt
import math
import numpy as np
import torch
from PIL import Image, ImageDraw

DEFAULT_MAX_DIMENSION = 16384


def tensor2pil(image):
    return Image.fromarray(np.clip(255. * image.cpu().numpy().squeeze(), 0, 255).astype(np.uint8))


def pil2tensor(image):
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


def toInt(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


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


class DrawColor:

    current_color = 1

    def __init__(self):
        self.current_color = 1

    def getColor(self, hue=""):
        color = get_draw_color(self.current_color * 199, hue)
        self.current_color += 1
        return color


def process_regions(regions, drawColor):
    alphabet = "abcdefghijklmnopqrstuvwxyz"
    # does not include comma or semicolon
    # comma separates region rations
    # semicolon denotes rotation in degrees for that region
    special_characters = " !\"#$%&'()*+-./:<=>?@[\\]^_`{|}~"

    layout = []
    region_data = {}
    template = {"cells": "", "cell_ratios": [], "colors": []}
    for r, d in regions.items():
        rotate = 0
        region_txt = d["ratio"]
        region_txt = region_txt.strip(alphabet)
        region_txt = region_txt.strip(special_characters)
        region_txt = region_txt.strip()

        # split ratios from rotation data
        region_prep = region_txt.split(";")
        if len(region_prep) > 1:
            region_txt = region_prep[0]
            rotate = int(region_prep[1])
        # process ratios
        region_prep = region_txt.split(",")
        if isinstance(region_prep, list):
            region_ints = [toInt(x) for x in region_prep]
            data = template.copy()

            if 0 in region_ints:
                region_ints = [1]
                data["cells"] = 1
                data["cell_ratios"] = region_ints
                data["colors"] = ["#000000"]
                data["rotation"] = rotate
            elif len(region_ints) == 1:
                data["cells"] = str(region_ints[0])
                data["cell_ratios"] = [1]
                data["colors"] = [drawColor.getColor()]
                data["rotation"] = rotate

            else:
                region_sum = sum(region_ints[1:])
                region_ratios = []
                for i in region_ints[1:]:
                    region_ratios.append(float(i / region_sum))
                data["cells"] = len(region_ints[1:])
                data["cell_ratios"] = round_to_100(region_ratios)
                data["colors"] = [drawColor.getColor() for x in region_ratios]
                data["rotation"] = rotate

            layout.append(region_ints[0])
            region_data[r] = data

    layout_sum = sum(layout)
    region_data["layout"] = round_to_100(
        [x / layout_sum for x in layout])

    return region_data


def flip_cells(region_data, divide_mode):
    if divide_mode == "columns":
        # reverse divide mode and reverse colors for each cell
        divide_mode = "rows"
        for r, d in region_data.items():
            # ignore layout data
            if r == "layout":
                continue
            d["cell_ratios"] = list(reversed(d["cell_ratios"]))
    else:  # rows
        # reverse divide mode and reverse color data
        divide_mode = "columns"
        region_data = dict(reversed(region_data.items()))

    return region_data


def rotate_cells(cell_data, rotation, divide_mode):
    if divide_mode == "columns":
        return cell_data
    else:
        return list(reversed(cell_data))


def toggle_divide_mode(divide_mode):
    if divide_mode == "columns":
        return "rows"
    else:
        return "columns"


def parse_region_data(region_data, width, height, divide_mode):
    start_x = 0
    start_y = 0
    region_count = 0
    color_count = 0
    colors = {}
    region_layers = {}
    for region, values in region_data.items():
        # ignore layout data
        if region == "layout":
            continue
        region_percentage = region_data["layout"][int(region) - 1]
        cell_count = len(values["cell_ratios"])

        region_divide_mode = divide_mode

        if values["rotation"]:
            rotation = values["rotation"]
        else:
            rotation = 0

        if region_divide_mode == "columns":
            thickness = region_percentage * height
        else:
            thickness = region_percentage * width

        region_layers[str(region)] = []
        for i in range(cell_count):
            fill_color = values["colors"][i]

            if region_divide_mode == "columns":
                x = start_x
                y = start_y
                w = width * values["cell_ratios"][i]
                h = thickness
                start_x += w
            else:
                x = start_x
                y = start_y
                w = thickness
                h = height * values["cell_ratios"][i]
                start_y += h

            font_size = min(w, h) * 0.7
            color_id = str(color_count + 1)
            colors[color_id] = fill_color
            color_count += 1
            region_layers[str(region)].append((int(x), int(y), int(
                w), int(h), color_id, fill_color, int(rotation), int(font_size)))

        start_x = 0
        start_y = 0
        region_count += 1

    return (region_layers, colors)


def draw_regions(width, height, regions, divide_mode):
    black = (0, 0, 0)
    image = Image.new("RGB", (width, height))
    image_numbered = Image.new("RGB", (width, height))
    # draw = ImageDraw.Draw(image)
    draw_numbered = ImageDraw.Draw(image_numbered)

    cell_count = 0
    x_offset = 0
    y_offset = 0
    labels = []
    region_image_data = {}
    for region, cells in regions.items():
        region_image_data[region] = []
        for cell in cells:
            x = cell[0]
            y = cell[1]
            w = cell[2]
            h = cell[3]
            color_id = cell[4]
            fill_color = cell[5]
            rotation = cell[6]
            font_size = cell[7]

            cell_count += 1
            region_image_data[region].append(
                [x, y, w, h, fill_color, rotation, cell_count, font_size])
            # Rotation on hold until sampling solution is found
            # if rotation > 0 and len(region_image_data[2:]) > 1:
            #     bbx, bby, bbw, bbh = getBoundingBox(x, y, w, h, rotation)
            #     labels.append((bbx, bby, font_size, str(count + 1)))
            # else:

        if divide_mode == "columns":
            region_width = width
            region_height = region_image_data[region][-1][3]
        else:
            region_height = height
            region_width = region_image_data[region][-1][2]

        region_image_data[region].insert(
            0, region_width
        )
        region_image_data[region].insert(
            1, region_height
        )
        region_image = gen_region_image(region_image_data[region])

        image.paste(region_image, (x_offset, y_offset))
        image_numbered.paste(region_image, (x_offset, y_offset))

        for i in region_image_data[region]:
            if type(i) == list:
                x = i[0] + x_offset
                y = i[1] + y_offset
                labels.append([x, y, i[6], i[7]])

        if divide_mode == "columns":
            y_offset += region_image.height
            x_offset = 0
        else:
            x_offset += region_image.width
            y_offset = 0

    for label in labels:
        draw_numbered.text((label[0], label[1]), str(label[2]),
                           fill=black, font_size=label[3])

    return (image, image_numbered)


def gen_region_image(region_image_data):
    width = region_image_data[0]
    height = region_image_data[1]
    # rotation value should be the same for all cells in a region
    rotation = region_image_data[2][5]
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for i in region_image_data[2:]:
        x = i[0]
        y = i[1]
        w = i[2]
        h = i[3]
        fill_color = i[4]
        draw.rectangle([x, y, x + w, y + h], fill=fill_color)

    # PIL sampling on rotation causes color artifacts
    # Need to find a very simple sampling solution
    # if rotation > 0 and len(region_image_data[2:]) > 1:
    #     size = image.size
    #     scalar = ceil(sqrt(size[0]**2 + size[1]**2))
    #     w_ratio = scalar / size[0]
    #     h_ratio = scalar / size[1]
    #     w_resize = ceil(size[0] * w_ratio)
    #     h_resize = ceil(size[1] * h_ratio)
    #     resized_image = image.resize((w_resize, h_resize))
    #     rotated_image = resized_image.rotate(rotation)
    #     image_center = (rotated_image.size[0]//2, rotated_image.size[1]//2)
    #     # left upper coordinate
    #     lu = (image_center[0] - size[0] // 2, image_center[1] - size[1] // 2)
    #     # right lower coordinate
    #     rl = (image_center[0] + size[0] // 2, image_center[1] + size[1] // 2)
    #     image = rotated_image.crop(lu+rl)

    return image


# def getBoundingBox(rX, rY, rW, rH, rA):
#     absCosRA = abs(math.cos(rA))
#     absSinRA = abs(math.sin(rA))

#     bbW = rW * absCosRA + rH * absSinRA
#     bbH = rW * absSinRA + rH * absCosRA

#     bbX = rX - (bbW - rW) / 2
#     bbY = rY - (bbH - rH) / 2

#     return (bbX, bbY, bbW, bbH)


def error_gen(actual, rounded):
    if actual == 0:
        return 0
    divisor = sqrt(1.0 if actual < 1.0 else actual)
    return abs(rounded - actual) ** 2 / divisor


def round_to_100(percents):
    percents = [x * 100 for x in percents]
    if not isclose(sum(percents), 100):
        raise ValueError
    n = len(percents)
    rounded = [int(x) for x in percents]
    up_count = 100 - sum(rounded)
    errors = [(error_gen(percents[i], rounded[i] + 1) -
               error_gen(percents[i], rounded[i]), i) for i in range(n)]
    rank = sorted(errors)
    for i in range(up_count):
        rounded[rank[i][1]] += 1
    return ([x / 100 for x in rounded])
