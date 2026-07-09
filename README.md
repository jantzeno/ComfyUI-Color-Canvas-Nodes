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
`rect`/`color` data under that object. The canvas object contains `width`,
`height`, and `gridSize`; the selected row is stored as `selectedRegion`.

Controls:

- `width` and `height` set the generated image size in 64-pixel steps to match common latent presets.
- `grid size` controls grid rendering and snap precision with values `8`, `16`, `32`, or `64`.
- `regions` sets the active integer region count.
- `width`, `height`, `grid size`, and `regions` are standard connectable ComfyUI widgets.
- The compact region table shows every active region with color, id, `x`, `y`,
  `w`, and `h` columns.
- Click a table row or visible active rectangle to select it.
- Click a table numeric cell and type a value to edit that rectangle directly.
- Drag inside the selected rectangle to move it.
- Drag a selected rectangle edge or corner handle to resize it.
- Newly active regions get a recalculated default visible rectangle instead of starting hidden.
- Reducing the region count hides inactive regions; adding them again gives them fresh default placement.

Canvas dragging, resizing, and table numeric edits snap to `grid size` and clamp
to the canvas bounds. Changing `grid size` resnaps all active rectangles to the
new grid.

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
  - `RegionalColorSelector`
- Frontend extensions import ComfyUI scripts with supported relative paths such
  as `../../scripts/app.js`.
