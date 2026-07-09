# Regional Color Nodes for ComfyUI

Custom nodes for building color-coded regional masks and selecting region colors in
[ComfyUI](https://github.com/comfyanonymous/ComfyUI).

## Requirements

- ComfyUI v0.27.0 or newer.
- No additional Python dependencies.

This package uses the ComfyUI V3 `comfy_api.latest` node API. Older ComfyUI
versions that only support `NODE_CLASS_MAPPINGS` are not supported.

## Installation

Clone this repository into `ComfyUI/custom_nodes/` and restart ComfyUI:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/jantzeno/ComfyUI_Color_Canvas_Nodes
```

The JavaScript extension is served through `WEB_DIRECTORY = "./javascript"`.
There is no manual JavaScript copy step, and the plugin does not write files into
ComfyUI's core `web/extensions` directory.

## Nodes

### Regional Color Canvas

Draws rectangular color regions and outputs:

- `IMAGE`
- `COLOR_DICT`
- `WIDTH`
- `HEIGHT`

The node stores editable state in a namespaced workflow property:

```text
properties.regionalColor
```

Rectangular canvas nodes store `activeRegions`, `canvas`, and per-region
`rect`/`color` data under that object.

Controls:

- `canvasX` and `canvasY` set the generated image size.
- `regions` sets the active integer region count.
- `cell size` controls grid snapping.
- `region` selects the active region for precision edits.
- `x`, `y`, `width`, and `height` mirror the selected rectangle.
- Click a visible active rectangle to select it.
- Drag inside the selected rectangle to move it.
- Drag a selected rectangle edge or corner handle to resize it.
- Newly active regions get a recalculated default visible rectangle instead of starting hidden.
- Reducing the region count hides inactive regions; adding them again gives them fresh default placement.

All direct canvas edits snap to `cell size`, clamp to the canvas bounds, and keep
the numeric widgets synchronized.

### Regional Color Ratio

Builds color layouts from structured ratio rows and outputs:

- `IMAGE`
- `IMAGE (numbered)`
- `COLOR_DICT`
- `WIDTH`
- `HEIGHT`

For each active region, the frontend exposes:

- `region_N_layout`
- `region_N_cells`
- `region_N_rotation`

The serialized workflow property is `properties.regionalColor`. Ratio nodes
store each region as structured data:

```json
{
  "ratio": {
    "layout": "1",
    "cells": "1,1",
    "rotation": 0
  }
}
```

Examples:

```text
1,1;0
1,1,1;0
2,1,1;0
4,6;0
```

Rotation is stored for compatibility, but visual rotation rendering is still
disabled in the backend.

### Regional Color Selector

Selects one color from a `COLOR_DICT` input by `region_id` and outputs:

- `COLOR_HEX`

The node is an output node and displays the selected hex value in the UI after
execution.

## Development Notes

- Backend nodes are registered by `comfy_entrypoint()`.
- Backend node wrappers delegate to shared state, renderer, and output adapter
  modules under `nodes/`.
- Frontend node setup delegates to shared `state.js` and
  `canvasInteractions.js` helpers under `javascript/`.
- Public node IDs are stable:
  - `RegionalColorCanvas`
  - `RegionalColorRatio`
  - `RegionalColorSelector`
- Frontend extensions import ComfyUI scripts with supported relative paths such
  as `../../scripts/app.js`.
