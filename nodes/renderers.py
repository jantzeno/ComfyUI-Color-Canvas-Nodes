from __future__ import annotations

from math import isclose, sqrt

from PIL import Image, ImageDraw

from .region_types import RatioRenderResult, RectRenderResult
from .utils import get_draw_color


class DrawColor:
    def __init__(self):
        self.current_color = 1

    def getColor(self, alpha=""):
        color = get_draw_color(self.current_color * 199, alpha)
        self.current_color += 1
        return color


def render_rect_canvas(state) -> RectRenderResult:
    image = Image.new("RGB", (state.canvas.width, state.canvas.height))
    draw = ImageDraw.Draw(image)
    colors = {}

    for region in state.regions:
        colors[region.region_id] = region.color
        rect = region.rect
        if rect.width == 0 or rect.height == 0:
            continue
        draw.rectangle(
            [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
            fill=region.color,
        )

    return RectRenderResult(image, colors, state.canvas.width, state.canvas.height)


def render_ratio_canvas(state) -> RatioRenderResult:
    input_regions = {
        region.region_id: {"ratio": _ratio_to_text(region.ratio)}
        for region in state.regions
    }
    processed_regions = _process_regions(input_regions, DrawColor())
    region_layers, colors = _parse_region_data(
        processed_regions,
        state.canvas.width,
        state.canvas.height,
        state.divide_mode,
    )
    image, image_numbered = _draw_regions(
        state.canvas.width,
        state.canvas.height,
        region_layers,
        state.divide_mode,
    )
    return RatioRenderResult(
        image,
        image_numbered,
        colors,
        state.canvas.width,
        state.canvas.height,
    )


def _ratio_to_text(ratio) -> str:
    return f"{ratio.layout},{ratio.cells};{ratio.rotation}"


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _process_regions(regions, draw_color):
    layout = []
    region_data = {}
    template = {"cells": "", "cell_ratios": [], "colors": []}
    for region, data in regions.items():
        rotate = 0
        region_txt = str(data["ratio"]).strip()

        region_prep = region_txt.split(";")
        if len(region_prep) > 1:
            region_txt = region_prep[0]
            rotate = _to_int(region_prep[1])

        region_prep = region_txt.split(",")
        region_ints = [_to_int(x) for x in region_prep]
        processed = template.copy()

        if 0 in region_ints:
            region_ints = [1]
            processed["cells"] = 1
            processed["cell_ratios"] = region_ints
            processed["colors"] = ["#000000"]
            processed["rotation"] = rotate
        elif len(region_ints) == 1:
            processed["cells"] = str(region_ints[0])
            processed["cell_ratios"] = [1]
            processed["colors"] = [draw_color.getColor()]
            processed["rotation"] = rotate
        else:
            region_sum = sum(region_ints[1:])
            region_ratios = [float(i / region_sum) for i in region_ints[1:]]
            processed["cells"] = len(region_ints[1:])
            processed["cell_ratios"] = _round_to_100(region_ratios)
            processed["colors"] = [draw_color.getColor() for _ in region_ratios]
            processed["rotation"] = rotate

        layout.append(region_ints[0])
        region_data[region] = processed

    layout_sum = sum(layout)
    region_data["layout"] = _round_to_100([x / layout_sum for x in layout])
    return region_data


def _parse_region_data(region_data, width, height, divide_mode):
    colors = {}
    region_layers = {}
    color_count = 0
    for region, values in region_data.items():
        if region == "layout":
            continue

        region_percentage = region_data["layout"][int(region) - 1]
        cell_count = len(values["cell_ratios"])
        rotation = values["rotation"] if values["rotation"] else 0
        thickness = region_percentage * height if divide_mode == "columns" else region_percentage * width
        start_x = 0
        start_y = 0

        region_layers[str(region)] = []
        for i in range(cell_count):
            fill_color = values["colors"][i]
            if divide_mode == "columns":
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
            region_layers[str(region)].append(
                (int(x), int(y), int(w), int(h), color_id, fill_color, int(rotation), int(font_size))
            )

    return region_layers, colors


def _draw_regions(width, height, regions, divide_mode):
    image = Image.new("RGB", (width, height))
    image_numbered = Image.new("RGB", (width, height))
    draw_numbered = ImageDraw.Draw(image_numbered)

    cell_count = 0
    x_offset = 0
    y_offset = 0
    labels = []
    region_image_data = {}
    for region, cells in regions.items():
        region_image_data[region] = []
        for cell in cells:
            cell_count += 1
            region_image_data[region].append(
                [cell[0], cell[1], cell[2], cell[3], cell[5], cell[6], cell_count, cell[7]]
            )

        if divide_mode == "columns":
            region_width = width
            region_height = region_image_data[region][-1][3]
        else:
            region_height = height
            region_width = region_image_data[region][-1][2]

        region_image_data[region].insert(0, region_width)
        region_image_data[region].insert(1, region_height)
        region_image = _gen_region_image(region_image_data[region])

        image.paste(region_image, (x_offset, y_offset))
        image_numbered.paste(region_image, (x_offset, y_offset))

        for item in region_image_data[region]:
            if isinstance(item, list):
                labels.append([item[0] + x_offset, item[1] + y_offset, item[6], item[7]])

        if divide_mode == "columns":
            y_offset += region_image.height
            x_offset = 0
        else:
            x_offset += region_image.width
            y_offset = 0

    for label in labels:
        draw_numbered.text((label[0], label[1]), str(label[2]), fill=(0, 0, 0), font_size=label[3])

    return image, image_numbered


def _gen_region_image(region_image_data):
    width = region_image_data[0]
    height = region_image_data[1]
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for item in region_image_data[2:]:
        draw.rectangle([item[0], item[1], item[0] + item[2], item[1] + item[3]], fill=item[4])
    return image


def _error_gen(actual, rounded):
    if actual == 0:
        return 0
    divisor = sqrt(1.0 if actual < 1.0 else actual)
    return abs(rounded - actual) ** 2 / divisor


def _round_to_100(percents):
    percents = [x * 100 for x in percents]
    if not isclose(sum(percents), 100):
        raise ValueError
    rounded = [int(x) for x in percents]
    up_count = 100 - sum(rounded)
    errors = [
        (_error_gen(percents[i], rounded[i] + 1) - _error_gen(percents[i], rounded[i]), i)
        for i in range(len(percents))
    ]
    rank = sorted(errors)
    for i in range(up_count):
        rounded[rank[i][1]] += 1
    return [x / 100 for x in rounded]
