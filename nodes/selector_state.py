from .region_types import MAX_REGIONS


def select_region_color(color_dict: dict, region_id: int) -> str:
    color = "error"
    region_key = str(region_id)

    if 1 <= int(region_id) <= MAX_REGIONS and isinstance(color_dict, dict):
        color = color_dict.get(region_key, color)

    return color


def selector_ui_payload(color: str) -> dict:
    return {
        "text": (color,),
        "selectedColor": color,
    }
