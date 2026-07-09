# Originally by Davemane42#0042 for ComfyUI
# Forked by jantzeno for ComfyUI

from comfy_api.latest import ComfyExtension, io

from .nodes.RegionalColorCanvas import RegionalColorCanvas
from .nodes.RegionalColorSelector import RegionalColorSelector


WEB_DIRECTORY = "./javascript"


class RegionalColorExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            RegionalColorCanvas,
            RegionalColorSelector,
        ]


async def comfy_entrypoint() -> RegionalColorExtension:
    return RegionalColorExtension()


__all__ = ["WEB_DIRECTORY", "comfy_entrypoint"]

print("\033[34mRegional Color Canvas: \033[92mLoaded\033[0m")
