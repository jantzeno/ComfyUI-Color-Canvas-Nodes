# Regional Color Nodes for ComfyUI

Custom nodes for building color-coded regional masks and selecting region colors in
[ComfyUI](https://github.com/comfyanonymous/ComfyUI).

## Requirements

- ComfyUI v0.27.0 or newer.
- [ComfyUI-ppm](https://github.com/pamparamm/ComfyUI-ppm) for `Regional Color Attention Canvas`.

This package uses the ComfyUI V3 `comfy_api.latest` node API. Older ComfyUI
versions that only support `NODE_CLASS_MAPPINGS` are not supported.

The PPM dependency is only used when the attention canvas has at least one
enabled, non-empty regional prompt. The other nodes, including the experimental
hook canvas, do not require it.

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

It can also accept an optional `REGIONS` input from `Regional Color Regions`.
When connected, the canvas keeps using its own `width`, `height`, and
`grid size` controls, then normalizes and renders the incoming region
rectangles against those canvas settings.

The node stores editable state in a namespaced workflow property:

```text
properties.regionalColor
```

Rectangular canvas nodes store `activeRegions`, `canvas`, and per-region
`rect`/`color`/`enabled` data under that object. The canvas object contains
`width`, `height`, and `gridSize`; the selected row is stored as
`selectedRegion`. Existing workflows without `enabled` remain enabled by
default.

Controls:

- `width` and `height` set the generated image size in 64-pixel steps to match common latent presets.
- `grid size` controls grid rendering and snap precision with values `8`, `16`, `32`, or `64`.
- `region count` sets the active integer region count when no `REGIONS` input is connected.
- `width`, `height`, `grid size`, and `region count` are standard connectable ComfyUI widgets.
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

### Regional Color Attention Canvas

Combines the region editor with PPM attention coupling. It replaces the usual
per-region mask, conditioning, and combine-node chains with one canvas node.

Inputs:

- `model` and `clip`
- `base positive`, containing the general scene prompt
- `global negative`
- the standard canvas controls and optional `REGIONS`
- one connectable string socket per active region: `region1_prompt`,
  `region2_prompt`, and so on

Outputs:

- patched `MODEL`
- base `POSITIVE` and pass-through `NEGATIVE`
- `IMAGE`, `COLOR_DICT`, `WIDTH`, and `HEIGHT`

Connect the three sampling outputs directly: `MODEL` to the sampler model,
`POSITIVE` to positive, and `NEGATIVE` to negative. The base prompt establishes
the whole scene. Each numbered prompt is encoded with the connected CLIP and
coupled to its matching rectangle at equal strength. The full-canvas base mask
remains active, so uncovered areas use the base scene conditioning.

The region table adds an `on` checkbox. A disabled region remains visible and
keeps its geometry, color, and prompt connection, but it does not participate in
conditioning. Empty or unconnected prompt sockets are also skipped.

The socket list follows `region count` exactly. A manual count reduction is
refused while a higher-numbered prompt socket is connected, preventing a
workflow edit from silently dropping a regional prompt. When `REGIONS` is
connected, its highest active region determines the socket count; an incompatible
linked prompt produces an execution error instead of being ignored.

This node currently supports SD1/SD2-style U-Nets and SDXL. It intentionally has
one global negative prompt and no per-region strength controls. Because coupling
happens in attention instead of by repeatedly combining regional conditionings,
LoRA influence is not multiplied merely by adding regions; model-wide LoRAs are
still model-wide.

### Regional Color Hook Canvas (Experimental)

Uses native ComfyUI conditioning hooks instead of PPM. It has the same dynamic
regional prompt sockets and adds matching `region1_hooks`, `region2_hooks`, and
so on for native `HOOKS` connections.

Connect a regional LoRA hook chain to only the regions that should use it. Each
enabled region receives its prompt, rectangle mask, and hook set. The base
positive is appended to every regional prompt and also acts as the default
conditioning outside all rectangles. `MODEL` and the single global `NEGATIVE`
are passed through unchanged; connect the node's `POSITIVE` output to the
sampler.

The base positive must contain exactly one conditioning entry. Prompt scheduling
or upstream nodes that expand it into multiple entries are rejected with a clear
error. Hook sets may add sampling overhead, and this node is marked experimental
because native hook behavior continues to evolve in ComfyUI.

### Regional Color Canvas (Reference)

Provides the same region editor and outputs as `Regional Color Canvas`, with an
additional required `reference image` input. The connected image is stretched
behind the canvas grid, and region fills use 65% opacity so the image remains
visible while regions are edited.

Inputs:

- required `reference image` socket
- connectable `width` and `height` widgets
- `grid size`
- `region count`
- optional `REGIONS`

If `width` or `height` is not connected, that dimension is read independently
from the reference image and its widget is updated to the exact pixel value.
Unlike the original canvas, reference-canvas dimensions can use one-pixel steps
and do not have to be multiples of 64. Connected dimension values remain
authoritative, and the reference image stretches to the resulting canvas size.
While a reference image is connected, the width and height widgets are disabled
for manual editing but their sockets remain connectable. Disconnecting a
dimension restores that value from the reference image; disconnecting the image
re-enables both widgets and keeps their last resolved values.

The editor uses the first image in a batch as its background preview. The
variant still outputs a single generated region image; the reference image is
never composited into or passed through that `IMAGE` output.

### Regional Color Reference Image

Passes an image through while exposing its exact dimensions. It outputs:

- `IMAGE`, preserving the complete input batch
- `WIDTH`
- `HEIGHT`

Connect all three outputs to the reference canvas for explicit dimensions, or
connect only `IMAGE` and let the canvas populate its dimension widgets. The
node previews the first batch image so a connected canvas can reuse an existing
browser preview before its next execution.

### Regional Color Grid Size

Provides one reusable grid-size control and outputs:

- `GRID_SIZE`

Inputs:

- `grid size`

The value is normalized to the same allowed grid sizes as the canvas: `8`,
`16`, `32`, or `64`.

### Regional Color Region

Defines one rectangular region and outputs:

- `REGION`

Inputs:

- `x`
- `y`
- `width`
- `height`
- required `grid size` socket

Coordinates are interpreted in the connected canvas pixel space. The canvas
applies its own bounds clamping when rendering. Region `x`, `y`, `width`, and
`height` widget edits step and snap to the connected `grid size`, and backend
execution snaps all region geometry to that grid before output.

### Regional Color Regions

Collects numbered `REGION` inputs and outputs:

- `REGIONS`

Inputs:

- Dynamic inputs `region1` through `region16` accept `Regional Color Region`
  outputs.

The active count is inferred from the highest connected numbered slot. Missing
lower-numbered slots receive the same deterministic default placement used by
the interactive canvas.

### Regional Color Selector

Selects one color from a `COLOR_DICT` input by `region_id` and outputs:

- `COLOR_HEX`

The node is an output node and displays the selected hex value in the UI after
execution. The display includes a color swatch and a read-only, copyable hex
field. The most recently executed value is restored when the workflow is
reopened.

## Development Notes

- Backend nodes are registered by `comfy_entrypoint()`.
- Backend node wrappers delegate to shared state, renderer, and output adapter
  modules under `nodes/`.
- Frontend node setup delegates to shared `state.js` and
  `canvasInteractions.js` helpers under `javascript/`.
- Public node IDs are stable:
  - `RegionalColorCanvas`
  - `RegionalColorAttentionCanvas`
  - `RegionalColorHookCanvasExperimental`
  - `RegionalColorCanvasReference`
  - `RegionalColorGridSize`
  - `RegionalColorReferenceImage`
  - `RegionalColorRegion`
  - `RegionalColorRegions`
  - `RegionalColorSelector`
- Frontend extensions import ComfyUI scripts with supported relative paths such
  as `../../scripts/app.js`.
