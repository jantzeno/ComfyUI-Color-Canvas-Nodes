import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
	DIMENSION_STEP,
	GRID_SIZE_VALUES,
	MAX_GRID_SIZE,
	MAX_REGIONS,
	MAX_RESOLUTION,
	MIN_GRID_SIZE,
	MIN_RESOLUTION,
	clamp,
	clampInt,
	computeCanvasSize,
	getWidget,
	setDirty,
	snap,
} from "./utils.js";
import {
	DEFAULT_GRID_SIZE,
	activeRectEntries,
	ensureRectProperties,
	ensureVisibleRectRegions,
	hideInactiveRectRegions,
	normalizeRectToCanvas,
	normalizeCanvasDimension,
	normalizeGridSize,
	rectColor,
	rectOverlapsActive,
	resolveActiveRectOverlaps,
	selectRectRegion,
	selectedRectRegion,
	setRegionalColorState,
} from "./state.js";
import {
	applyRectDrag,
	canvasToNodeRect,
	drawHandles,
	hitHandle,
	hitRegion,
	pointToCanvas,
} from "./canvasInteractions.js";

const TABLE_HEADER_HEIGHT = 20;
const TABLE_ROW_HEIGHT = 22;
const TABLE_PADDING = 10;
const TABLE_COLUMNS = [
	{ key: "swatch", label: "", width: 26 },
	{ key: "id", label: "id", width: 34 },
	{ key: "x", label: "x" },
	{ key: "y", label: "y" },
	{ key: "width", label: "w" },
	{ key: "height", label: "h" },
];
const ENABLED_TABLE_COLUMN = { key: "enabled", label: "on", width: 30 };
const NUMERIC_TABLE_KEYS = new Set(["x", "y", "width", "height"]);
const REGION_GEOMETRY_WIDGET_NAMES = ["x", "y", "width", "height"];
const WIDTH_WIDGET_NAMES = ["width", "Width", "WIDTH", "canvas_width", "image_width"];
const HEIGHT_WIDGET_NAMES = ["height", "Height", "HEIGHT", "canvas_height", "image_height"];
const REFERENCE_REGION_ALPHA = 0.65;
const ATTENTION_CANVAS_NODE_NAMES = new Set([
	"RegionalColorAttentionCanvas",
	"RegionalColorHookCanvasExperimental",
]);
const CANVAS_NODE_NAMES = new Set([
	"RegionalColorCanvas",
	"RegionalColorCanvasReference",
	...ATTENTION_CANVAS_NODE_NAMES,
]);

let activeTableNode = null;

const NODE_CLASS_ALIASES = {
	RegionalColorCanvas: new Set([
		"RegionalColorCanvas",
		"Regional Color Canvas",
		"RegionalColorCanvasReference",
		"Regional Color Canvas (Reference)",
	]),
	RegionalColorCanvasReference: new Set(["RegionalColorCanvasReference", "Regional Color Canvas (Reference)"]),
	RegionalColorAttentionCanvas: new Set(["RegionalColorAttentionCanvas", "Regional Color Attention Canvas"]),
	RegionalColorHookCanvasExperimental: new Set([
		"RegionalColorHookCanvasExperimental",
		"Regional Color Hook Canvas (Experimental)",
	]),
	RegionalColorGridSize: new Set(["RegionalColorGridSize", "Regional Color Grid Size"]),
	RegionalColorReferenceImage: new Set(["RegionalColorReferenceImage", "Regional Color Reference Image"]),
	RegionalColorRegion: new Set(["RegionalColorRegion", "Regional Color Region"]),
	RegionalColorRegions: new Set(["RegionalColorRegions", "Regional Color Regions"]),
};

function currentRegionId(node) {
	const state = ensureRectProperties(node);
	return String(clampInt(state.selectedRegion ?? 1, 1, state.activeRegions));
}

function selectedRegion(node) {
	return selectedRectRegion(node);
}

function selectRegion(node, regionId) {
	selectRectRegion(node, regionId);
	setDirty(node);
}

function gridSize(state) {
	return normalizeGridSize(state.canvas.gridSize ?? DEFAULT_GRID_SIZE);
}

function clampRegionRect(state, regionId) {
	const region = state.regions[String(regionId)];
	if (!region?.rect) {
		return;
	}
	region.rect = normalizeRectToCanvas(state, region.rect);
}

function clampActiveRegionRects(state) {
	for (let i = 1; i <= state.activeRegions; i++) {
		clampRegionRect(state, i);
	}
	resolveActiveRectOverlaps(state);
}

function gridWidget(node) {
	return getWidget(node, "grid_size") || getWidget(node, "grid size");
}

function regionCountWidget(node) {
	return getWidget(node, "regions") || getWidget(node, "region count");
}

function setWidgetValue(widget, value) {
	if (widget) {
		widget.value = value;
	}
}

function setWidgetDisabled(widget, disabled) {
	if (!widget) {
		return;
	}
	widget.disabled = disabled;
	widget.readOnly = disabled;
	widget.options = Object.assign({}, widget.options || {}, { disabled });
	if (widget.inputEl) {
		widget.inputEl.disabled = disabled;
		widget.inputEl.readOnly = disabled;
	}
}

function configureWidget(widget, callback, options) {
	if (!widget) {
		return;
	}
	widget.callback = callback;
	widget.options = Object.assign({}, widget.options || {}, options);
}

function setNumberWidgetStep(widget, step) {
	if (!widget) {
		return;
	}
	widget.options = Object.assign({}, widget.options || {}, { step, step2: step });
	widget.step = step;
	widget.step2 = step;
}

function inputLink(node, inputName) {
	const names = Array.isArray(inputName) ? inputName : [inputName];
	const input = node.inputs?.find((entry) => {
		return names.includes(entry.name) ||
			names.includes(entry.label) ||
			names.includes(entry.widget?.name);
	});
	if (!input || input.link == null) {
		return null;
	}
	if (typeof input.link === "object") {
		return input.link;
	}
	const links = node.graph?.links;
	return links?.get?.(input.link) ?? links?.[input.link] ?? null;
}

function hasRegionDataLink(node) {
	return regionDataLink(node) !== null;
}

function regionDataLink(node) {
	return inputLink(node, ["region_data", "regions"]);
}

function graphLink(graph, linkId) {
	const links = graph?.links;
	return links?.get?.(linkId) ?? links?.[linkId] ?? null;
}

function isNodeClass(node, className) {
	const aliases = NODE_CLASS_ALIASES[className] || new Set([className]);
	return aliases.has(node?.comfyClass) || aliases.has(node?.type) || aliases.has(node?.title);
}

function isReferenceCanvas(node) {
	return isNodeClass(node, "RegionalColorCanvasReference");
}

function isAttentionCanvas(node) {
	return isNodeClass(node, "RegionalColorAttentionCanvas") || isNodeClass(node, "RegionalColorHookCanvasExperimental");
}

function isHookCanvas(node) {
	return isNodeClass(node, "RegionalColorHookCanvasExperimental");
}

function attentionInputInfo(input) {
	const match = String(input?.name ?? "").match(/^(prompt_inputs|hook_inputs)\.region(\d+)_(prompt|hooks)$/);
	if (!match) {
		return null;
	}
	return { group: match[1], index: Number(match[2]), suffix: match[3] };
}

function linkedAttentionInputAbove(node, count) {
	return (node.inputs || []).some((input) => {
		const info = attentionInputInfo(input);
		return info && info.index > count && input.link != null;
	});
}

function addAttentionInput(node, group, index) {
	const suffix = group === "prompt_inputs" ? "prompt" : "hooks";
	const name = `${group}.region${index}_${suffix}`;
	if ((node.inputs || []).some((input) => input.name === name)) {
		return;
	}
	const type = suffix === "prompt" ? "STRING" : "HOOKS";
	node.addInput(name, type, { optional: true, label: `region${index}_${suffix}` });
}

function syncAttentionInputSockets(node, count) {
	if (!isAttentionCanvas(node) || node._regionalSyncingAttentionInputs) {
		return;
	}
	node._regionalSyncingAttentionInputs = true;
	try {
		const groups = isHookCanvas(node) ? ["prompt_inputs", "hook_inputs"] : ["prompt_inputs"];
		for (const group of groups) {
			for (let index = 1; index <= count; index++) {
				addAttentionInput(node, group, index);
			}
		}

		for (let slot = (node.inputs?.length || 0) - 1; slot >= 0; slot--) {
			const input = node.inputs[slot];
			const info = attentionInputInfo(input);
			if (!info || !groups.includes(info.group) || info.index <= count || input.link != null) {
				continue;
			}
			node.removeInput(slot);
		}
	} finally {
		node._regionalSyncingAttentionInputs = false;
	}
}

function normalizeNodeCanvasDimension(node, value, fallback) {
	return normalizeCanvasDimension(value, fallback, isReferenceCanvas(node));
}

function sourceNodeForInput(node, inputName) {
	const link = inputLink(node, inputName);
	return sourceNodeForLink(node, link);
}

function normalizeReferenceDimensions(value) {
	const width = Number(Array.isArray(value) ? value[0] : value?.width);
	const height = Number(Array.isArray(value) ? value[1] : value?.height);
	if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
		return null;
	}
	return { width: Math.round(width), height: Math.round(height) };
}

function referenceDimensionsFromImage(image) {
	return normalizeReferenceDimensions({
		width: image?.naturalWidth || image?.width,
		height: image?.naturalHeight || image?.height,
	});
}

function setReferenceOutputValues(node, dimensions) {
	if (!isNodeClass(node, "RegionalColorReferenceImage")) {
		return;
	}
	for (const output of node.outputs || []) {
		const name = String(output.name || output.label || "").toLowerCase();
		if (name.includes("width")) {
			output.value = dimensions?.width ?? null;
			output._value = dimensions?.width ?? null;
		} else if (name.includes("height")) {
			output.value = dimensions?.height ?? null;
			output._value = dimensions?.height ?? null;
		}
	}
}

function syncReferenceDimensionWidgetState(node) {
	if (!isReferenceCanvas(node)) {
		return;
	}
	const disabled = inputLink(node, "reference_image") !== null;
	setWidgetDisabled(getWidget(node, "width"), disabled);
	setWidgetDisabled(getWidget(node, "height"), disabled);
}

function applyStoredReferenceDimensions(node) {
	if (!isReferenceCanvas(node) || !node._regionalReferenceDimensions) {
		syncReferenceDimensionWidgetState(node);
		return;
	}
	const state = ensureRectProperties(node);
	const dimensions = node._regionalReferenceDimensions;
	if (inputLink(node, "width") === null) {
		state.canvas.width = normalizeNodeCanvasDimension(node, dimensions.width, state.canvas.width);
		setWidgetValue(getWidget(node, "width"), state.canvas.width);
	}
	if (inputLink(node, "height") === null) {
		state.canvas.height = normalizeNodeCanvasDimension(node, dimensions.height, state.canvas.height);
		setWidgetValue(getWidget(node, "height"), state.canvas.height);
	}
	clampActiveRegionRects(state);
	syncReferenceDimensionWidgetState(node);
	setDirty(node);
}

function setStoredReferenceDimensions(node, value, authoritative = false) {
	const dimensions = normalizeReferenceDimensions(value);
	if (!dimensions) {
		return false;
	}
	node._regionalReferenceDimensions = dimensions;
	node._regionalReferenceDimensionsAuthoritative = authoritative;
	setReferenceOutputValues(node, dimensions);
	applyStoredReferenceDimensions(node);
	return true;
}

function clearStoredReferenceDimensions(node) {
	node._regionalReferenceDimensions = null;
	node._regionalReferenceDimensionsAuthoritative = false;
	setReferenceOutputValues(node, null);
	syncReferenceDimensionWidgetState(node);
}

function updateReferenceDimensionsFromImage(node, image) {
	if (!image || node._regionalReferenceDimensionsAuthoritative) {
		return;
	}
	if (setStoredReferenceDimensions(node, referenceDimensionsFromImage(image), false) && isNodeClass(node, "RegionalColorReferenceImage")) {
		refreshReferenceCanvasTargets(node);
	}
}

function setReferenceImage(node, image, useImageDimensions = true) {
	node._regionalReferenceImage = image || null;
	if (image) {
		if (useImageDimensions) {
			updateReferenceDimensionsFromImage(node, image);
		}
		if (image.complete === false && image.addEventListener) {
			const loadId = node._regionalReferenceImageLoad;
			image.addEventListener("load", () => {
				if (node._regionalReferenceImage === image && node._regionalReferenceImageLoad === loadId) {
					if (useImageDimensions) {
						updateReferenceDimensionsFromImage(node, image);
					}
					setDirty(node);
				}
			}, { once: true });
		}
	}
	setDirty(node);
}

function referenceImageIsDrawable(image) {
	if (!image || image.complete === false) {
		return false;
	}
	return Number(image.naturalWidth || image.width) > 0 && Number(image.naturalHeight || image.height) > 0;
}

function referencePreviewForSource(sourceNode, visited = new Set()) {
	if (!sourceNode || visited.has(sourceNode)) {
		return null;
	}
	visited.add(sourceNode);
	const image = sourceNode.imgs?.[0] || sourceNode._regionalReferenceImage || null;
	if (image) {
		return image;
	}
	if (isNodeClass(sourceNode, "RegionalColorReferenceImage")) {
		return referencePreviewForSource(sourceNodeForInput(sourceNode, "image"), visited);
	}
	return null;
}

function referenceDimensionsForSource(sourceNode, image, visited = new Set()) {
	if (!sourceNode || visited.has(sourceNode)) {
		return referenceDimensionsFromImage(image);
	}
	visited.add(sourceNode);
	if (sourceNode._regionalReferenceDimensions) {
		return sourceNode._regionalReferenceDimensions;
	}
	if (isNodeClass(sourceNode, "RegionalColorReferenceImage")) {
		const upstream = sourceNodeForInput(sourceNode, "image");
		return referenceDimensionsForSource(upstream, referencePreviewForSource(upstream), visited);
	}
	return referenceDimensionsFromImage(image);
}

function syncUpstreamReferencePreview(node) {
	if (!isReferenceCanvas(node)) {
		return;
	}
	const sourceNode = sourceNodeForInput(node, "reference_image");
	if (node._regionalReferenceSourceNode !== sourceNode) {
		node._regionalReferenceSourceNode = sourceNode;
		node._regionalReferenceImageLoad = (node._regionalReferenceImageLoad || 0) + 1;
		clearStoredReferenceDimensions(node);
	}
	if (!sourceNode) {
		setReferenceImage(node, null, false);
		syncReferenceDimensionWidgetState(node);
		return;
	}

	const image = referencePreviewForSource(sourceNode);
	if (node._regionalReferenceUpstreamPreview && node._regionalReferenceUpstreamPreview !== image) {
		node._regionalReferenceDimensionsAuthoritative = false;
	}
	node._regionalReferenceUpstreamPreview = image;
	const sourceDimensions = referenceDimensionsForSource(sourceNode, image);
	const sourceIsAuthoritative = Boolean(sourceNode._regionalReferenceDimensionsAuthoritative);
	const keepExecutedDimensions = !sourceIsAuthoritative && node._regionalReferenceDimensionsAuthoritative && node._regionalReferenceDimensions;
	const dimensions = sourceIsAuthoritative ? sourceDimensions : (keepExecutedDimensions || sourceDimensions);
	const hasDimensions = setStoredReferenceDimensions(
		node,
		dimensions,
		Boolean(keepExecutedDimensions || sourceIsAuthoritative),
	);
	setReferenceImage(node, image, !hasDimensions);
	syncReferenceDimensionWidgetState(node);
}

function referenceImageUrl(descriptor) {
	if (!descriptor?.filename) {
		return null;
	}
	const params = new URLSearchParams({
		filename: descriptor.filename,
		type: descriptor.type || "temp",
		subfolder: descriptor.subfolder || "",
	});
	return api.apiURL(`/view?${params.toString()}`) + (app.getPreviewFormatParam?.() || "");
}

function loadExecutedReferencePreview(node, descriptors) {
	if (!isReferenceCanvas(node)) {
		return;
	}
	const descriptor = Array.isArray(descriptors) ? descriptors[0] : descriptors;
	const url = referenceImageUrl(descriptor);
	if (!url) {
		return;
	}
	const loadId = (node._regionalReferenceImageLoad || 0) + 1;
	node._regionalReferenceImageLoad = loadId;
	const image = new Image();
	image.onload = () => {
		if (node._regionalReferenceImageLoad === loadId) {
			setReferenceImage(node, image, !node._regionalReferenceDimensionsAuthoritative);
		}
	};
	image.src = url;
}

function regionDataSourceNode(node) {
	return sourceNodeForLink(node, regionDataLink(node));
}

function sourceNodeForLink(node, link) {
	if (!link || link.origin_id < 0) {
		return null;
	}
	return node.graph?.getNodeById?.(link.origin_id) ?? null;
}

function targetNodesForOutput(node, outputSlot = 0) {
	const output = node.outputs?.[outputSlot];
	const graph = node.graph;
	const result = [];
	for (const linkRef of output?.links || []) {
		const link = typeof linkRef === "object" ? linkRef : graphLink(graph, linkRef);
		const target = link ? graph?.getNodeById?.(link.target_id) : null;
		if (target) {
			result.push(target);
		}
	}
	return result;
}

function graphNodes(node) {
	const nodes = node.graph?._nodes ?? node.graph?.nodes ?? [];
	return Array.isArray(nodes) ? nodes : [];
}

function linkedReferenceCanvasNodes(node) {
	const directTargets = [];
	for (let slot = 0; slot < (node.outputs?.length || 0); slot++) {
		directTargets.push(...targetNodesForOutput(node, slot));
	}
	const graphTargets = graphNodes(node).filter((target) => {
		if (!isReferenceCanvas(target)) {
			return false;
		}
		return ["reference_image", "width", "height"].some((inputName) => sourceNodeForInput(target, inputName) === node);
	});
	return [...new Set([...directTargets, ...graphTargets])].filter(isReferenceCanvas);
}

function refreshReferenceCanvasTargets(node) {
	for (const canvasNode of linkedReferenceCanvasNodes(node)) {
		scheduleCanvasConnectionSync(canvasNode);
	}
}

function syncReferenceImageNode(node) {
	if (!isNodeClass(node, "RegionalColorReferenceImage")) {
		return;
	}
	const sourceNode = sourceNodeForInput(node, "image");
	if (node._regionalReferenceSourceNode !== sourceNode) {
		node._regionalReferenceSourceNode = sourceNode;
		node._regionalReferenceImageLoad = (node._regionalReferenceImageLoad || 0) + 1;
		clearStoredReferenceDimensions(node);
	}
	if (!sourceNode) {
		setReferenceImage(node, null, false);
		refreshReferenceCanvasTargets(node);
		return;
	}

	const image = referencePreviewForSource(sourceNode);
	if (node._regionalReferenceUpstreamPreview && node._regionalReferenceUpstreamPreview !== image) {
		node._regionalReferenceDimensionsAuthoritative = false;
	}
	node._regionalReferenceUpstreamPreview = image;
	const sourceDimensions = referenceDimensionsForSource(sourceNode, image);
	const sourceIsAuthoritative = Boolean(sourceNode._regionalReferenceDimensionsAuthoritative);
	const keepExecutedDimensions = !sourceIsAuthoritative && node._regionalReferenceDimensionsAuthoritative && node._regionalReferenceDimensions;
	const dimensions = sourceIsAuthoritative ? sourceDimensions : (keepExecutedDimensions || sourceDimensions);
	const hasDimensions = setStoredReferenceDimensions(
		node,
		dimensions,
		Boolean(keepExecutedDimensions || sourceIsAuthoritative),
	);
	setReferenceImage(node, image, !hasDimensions);
	refreshReferenceCanvasTargets(node);
}

function scheduleReferenceImageNodeSync(node) {
	const syncId = (node._regionalConnectionSync || 0) + 1;
	node._regionalConnectionSync = syncId;
	setTimeout(() => {
		if (node._regionalConnectionSync === syncId) {
			syncReferenceImageNode(node);
		}
	}, 0);
}

function scheduleCanvasConnectionSync(node) {
	const syncId = (node._regionalConnectionSync || 0) + 1;
	node._regionalConnectionSync = syncId;
	setTimeout(() => {
		if (node._regionalConnectionSync !== syncId) {
			return;
		}
		syncUpstreamReferencePreview(node);
		applyCanvasControlValues(node, true);
		syncReferenceDimensionWidgetState(node);
	}, 0);
}

function widgetValue(node, names) {
	for (const name of names) {
		const widget = getWidget(node, name);
		if (widget?.value != null && Number.isFinite(Number(widget.value))) {
			return Number(widget.value);
		}
	}
	return null;
}

function parseDimensionPreset(sourceNode) {
	const rawDimensions = getWidget(sourceNode, "dimensions")?.value;
	const dimensions = typeof rawDimensions === "string" ? rawDimensions.split(" - ").pop() : null;
	if (typeof dimensions !== "string") {
		return null;
	}
	const match = dimensions.match(/(\d+)\s*x\s*(\d+)/i);
	if (!match) {
		return null;
	}
	const invert = Boolean(getWidget(sourceNode, "invert")?.value);
	const width = Number(match[invert ? 2 : 1]);
	const height = Number(match[invert ? 1 : 2]);
	return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
}

function outputLinkedValue(node, inputName, dimension) {
	const link = inputLink(node, inputName);
	if (!link || link.origin_id < 0) {
		return null;
	}
	const sourceNode = node.graph?.getNodeById?.(link.origin_id);
	if (!sourceNode) {
		return null;
	}

	const output = sourceNode.outputs?.[link.origin_slot];
	const outputName = String(output?.name ?? "").toLowerCase();
	const preset = parseDimensionPreset(sourceNode);
	if (preset && ((dimension === "width" && outputName.includes("width")) || (dimension === "height" && outputName.includes("height")))) {
		return preset[dimension];
	}
	const referenceDimensions = sourceNode._regionalReferenceDimensions;
	if (
		referenceDimensions &&
		((dimension === "width" && outputName.includes("width")) || (dimension === "height" && outputName.includes("height")))
	) {
		return referenceDimensions[dimension];
	}

	const candidates = dimension === "width" ? WIDTH_WIDGET_NAMES : HEIGHT_WIDGET_NAMES;
	const directWidgetValue = widgetValue(sourceNode, candidates);
	if (directWidgetValue != null) {
		return directWidgetValue;
	}

	const outputValue = output?.value ?? output?._value;
	return Number.isFinite(Number(outputValue)) ? Number(outputValue) : null;
}

function resolveControlValue(node, widgetName, dimension, fallback) {
	const linkedValue = outputLinkedValue(node, widgetName, dimension);
	if (linkedValue != null) {
		return linkedValue;
	}
	return getWidget(node, widgetName)?.value ?? fallback;
}

function linkedGridSizeValue(node) {
	const link = inputLink(node, "grid_size");
	if (!link || link.origin_id < 0) {
		return normalizeGridSize(gridWidget(node)?.value ?? DEFAULT_GRID_SIZE);
	}
	const sourceNode = node.graph?.getNodeById?.(link.origin_id);
	if (!sourceNode) {
		return normalizeGridSize(gridWidget(node)?.value ?? DEFAULT_GRID_SIZE);
	}
	const widget = getWidget(sourceNode, "grid_size") || getWidget(sourceNode, "grid size");
	if (Number.isFinite(Number(widget?.value))) {
		return normalizeGridSize(widget.value);
	}
	const output = sourceNode.outputs?.[link.origin_slot];
	const outputValue = output?.value ?? output?._value;
	if (Number.isFinite(Number(outputValue))) {
		return normalizeGridSize(Number(outputValue));
	}
	return normalizeGridSize(widget?.value ?? DEFAULT_GRID_SIZE);
}

function setRegionWidgetStep(widget, grid) {
	setNumberWidgetStep(widget, grid);
}

function snapRegionGeometryWidget(node, widget, grid = linkedGridSizeValue(node)) {
	if (!widget) {
		return;
	}
	setRegionWidgetStep(widget, grid);
	const min = widget.name === "width" || widget.name === "height" ? grid : 0;
	widget.options = Object.assign({}, widget.options || {}, { min });
	widget.value = snap(clamp(widget.value, min, MAX_RESOLUTION), grid);
}

function snapRegionGeometryWidgets(node) {
	const grid = linkedGridSizeValue(node);
	for (const name of REGION_GEOMETRY_WIDGET_NAMES) {
		snapRegionGeometryWidget(node, getWidget(node, name), grid);
	}
	refreshCanvasNodesForRegionNode(node);
	setDirty(node);
}

function linkedRegionNodes(node, outputSlot = 0) {
	const directTargets = targetNodesForOutput(node, outputSlot).filter((target) => isNodeClass(target, "RegionalColorRegion"));
	const graphTargets = graphNodes(node).filter((target) => {
		return isNodeClass(target, "RegionalColorRegion") && sourceNodeForInput(target, "grid_size") === node;
	});
	return [...new Set([...directTargets, ...graphTargets])];
}

function linkedRegionsNodesForRegionNode(node) {
	return targetNodesForOutput(node, 0).filter((target) => isNodeClass(target, "RegionalColorRegions"));
}

function linkedCanvasNodesForRegionsNode(node) {
	return targetNodesForOutput(node, 0).filter((target) => isNodeClass(target, "RegionalColorCanvas"));
}

function refreshCanvasNodesForRegionsNode(node) {
	const directTargets = linkedCanvasNodesForRegionsNode(node);
	const graphTargets = graphNodes(node).filter((target) => {
		return isNodeClass(target, "RegionalColorCanvas") && regionDataSourceNode(target) === node;
	});
	for (const canvasNode of new Set([...directTargets, ...graphTargets])) {
		applyCanvasControlValues(canvasNode, true);
	}
}

function refreshCanvasNodesForRegionNode(node) {
	const directTargets = linkedRegionsNodesForRegionNode(node);
	const graphTargets = graphNodes(node).filter((target) => {
		if (!isNodeClass(target, "RegionalColorRegions")) {
			return false;
		}
		return (target.inputs || []).some((input) => sourceNodeForLink(target, typeof input.link === "object" ? input.link : graphLink(target.graph, input.link)) === node);
	});
	for (const regionsNode of new Set([...directTargets, ...graphTargets])) {
		refreshCanvasNodesForRegionsNode(regionsNode);
	}
}

function refreshCanvasNodesForGridSizeNode(node) {
	for (const canvasNode of graphNodes(node)) {
		if (isNodeClass(canvasNode, "RegionalColorCanvas") && sourceNodeForInput(canvasNode, "grid_size") === node) {
			applyCanvasControlValues(canvasNode, true);
		}
	}
}

function stepGridSizeValue(widget, value) {
	const previous = normalizeGridSize(widget?._regionalLastGridSize ?? widget?.value ?? DEFAULT_GRID_SIZE);
	const numeric = Number(value);
	const raw = Number.isFinite(numeric) ? clamp(numeric, MIN_GRID_SIZE, MAX_GRID_SIZE) : previous;
	let next = normalizeGridSize(raw);

	if (!GRID_SIZE_VALUES.includes(raw) && next === previous) {
		const index = GRID_SIZE_VALUES.indexOf(previous);
		if (raw > previous && index < GRID_SIZE_VALUES.length - 1) {
			next = GRID_SIZE_VALUES[index + 1];
		} else if (raw < previous && index > 0) {
			next = GRID_SIZE_VALUES[index - 1];
		}
	}

	widget._regionalLastGridSize = next;
	return next;
}

function regionSlotIndex(inputName) {
	const match = String(inputName ?? "").match(/^region(\d+)$/);
	if (!match) {
		return null;
	}
	const index = Number(match[1]);
	return Number.isInteger(index) && index >= 1 && index <= MAX_REGIONS ? index : null;
}

function regionSlotIndexForInput(input, fallbackIndex) {
	for (const name of [input.name, input.label, input.localized_name, input.widget?.name]) {
		const index = regionSlotIndex(name);
		if (index != null) {
			return index;
		}
	}
	const type = String(input.type ?? input.input_type ?? "");
	if (input.name === "region" || type === "REGIONAL_COLOR_REGION") {
		return fallbackIndex;
	}
	return null;
}

function regionNodeRect(node) {
	const grid = linkedGridSizeValue(node);
	return {
		x: snap(clamp(getWidget(node, "x")?.value ?? 0, 0, MAX_RESOLUTION), grid),
		y: snap(clamp(getWidget(node, "y")?.value ?? 0, 0, MAX_RESOLUTION), grid),
		width: snap(clamp(getWidget(node, "width")?.value ?? grid, grid, MAX_RESOLUTION), grid),
		height: snap(clamp(getWidget(node, "height")?.value ?? grid, grid, MAX_RESOLUTION), grid),
	};
}

function syncLinkedRegionData(node, state) {
	const regionsNode = regionDataSourceNode(node);
	if (!isNodeClass(regionsNode, "RegionalColorRegions")) {
		return false;
	}

	const linkedRegions = new Map();
	for (const [inputOffset, input] of (regionsNode.inputs || []).entries()) {
		if (input.link == null) {
			continue;
		}
		const index = regionSlotIndexForInput(input, inputOffset + 1);
		if (index == null) {
			continue;
		}
		const sourceNode = sourceNodeForLink(regionsNode, typeof input.link === "object" ? input.link : graphLink(regionsNode.graph, input.link));
		if (isNodeClass(sourceNode, "RegionalColorRegion")) {
			linkedRegions.set(index, sourceNode);
		}
	}

	const activeRegions = Math.max(1, ...linkedRegions.keys());
	state.activeRegions = clampInt(activeRegions, 1, MAX_REGIONS);
	state.selectedRegion = String(clampInt(state.selectedRegion ?? 1, 1, state.activeRegions));

	for (let i = 1; i <= state.activeRegions; i++) {
		const id = String(i);
		if (!state.regions[id]) {
			state.regions[id] = { rect: { x: 0, y: 0, width: 0, height: 0 }, color: rectColor(i), enabled: true };
		}
		const sourceNode = linkedRegions.get(i);
		state.regions[id].color = state.regions[id].color || rectColor(i);
		state.regions[id].enabled = typeof state.regions[id].enabled === "boolean" ? state.regions[id].enabled : true;
		state.regions[id].rect = sourceNode ? normalizeRectToCanvas(state, regionNodeRect(sourceNode)) : { x: 0, y: 0, width: 0, height: 0 };
	}
	hideInactiveRectRegions(state, state.activeRegions + 1);
	return true;
}

function applyCanvasControlValues(node, markDirty = false) {
	const state = ensureRectProperties(node);
	const widthWidget = getWidget(node, "width");
	const heightWidget = getWidget(node, "height");
	const gridSizeWidget = gridWidget(node);
	const regionsWidget = regionCountWidget(node);
	const regionsLinked = hasRegionDataLink(node);
	const previousRegions = state.activeRegions;
	const previousCanvas = {
		width: state.canvas.width,
		height: state.canvas.height,
		gridSize: state.canvas.gridSize,
		activeRegions: state.activeRegions,
	};

	const nextWidth = normalizeNodeCanvasDimension(node, resolveControlValue(node, "width", "width", state.canvas.width), state.canvas.width);
	const nextHeight = normalizeNodeCanvasDimension(node, resolveControlValue(node, "height", "height", state.canvas.height), state.canvas.height);
	const nextGridSize = linkedGridSizeValue(node);
	const widgetRegions = clampInt(regionsWidget?.value ?? state.activeRegions, 1, MAX_REGIONS);

	state.canvas.width = nextWidth;
	state.canvas.height = nextHeight;
	state.canvas.gridSize = nextGridSize;
	const linkedRegionDataChanged = regionsLinked ? syncLinkedRegionData(node, state) : false;
	if (!regionsLinked) {
		state.activeRegions = widgetRegions;
	}
	state.selectedRegion = String(clampInt(state.selectedRegion ?? 1, 1, state.activeRegions));
	const changed = (
		previousCanvas.width !== state.canvas.width ||
		previousCanvas.height !== state.canvas.height ||
		previousCanvas.gridSize !== state.canvas.gridSize ||
		previousCanvas.activeRegions !== state.activeRegions ||
		linkedRegionDataChanged
	);

	setWidgetValue(widthWidget, state.canvas.width);
	setWidgetValue(heightWidget, state.canvas.height);
	setWidgetValue(gridSizeWidget, state.canvas.gridSize);
	setWidgetValue(regionsWidget, state.activeRegions);
	setWidgetDisabled(regionsWidget, regionsLinked);
	syncAttentionInputSockets(node, state.activeRegions);
	syncReferenceDimensionWidgetState(node);
	if (!regionsLinked && state.activeRegions < previousRegions) {
		hideInactiveRectRegions(state, state.activeRegions + 1);
	}
	ensureVisibleRectRegions(state);
	clampActiveRegionRects(state);
	if (changed && markDirty) {
		computeCanvasSize(node, node.size);
		setDirty(node);
	}
	return state;
}

function syncWidgetValuesToState(node) {
	return applyCanvasControlValues(node);
}

function updateRegionValue(node, regionId, key, value) {
	const state = ensureRectProperties(node);
	const region = state.regions[String(regionId)];
	if (!region || !NUMERIC_TABLE_KEYS.has(key)) {
		return;
	}

	const rect = region.rect;
	const candidate = { ...rect };
	const snapped = snap(value, gridSize(state));
	if (key === "x") {
		candidate.x = clamp(snapped, 0, state.canvas.width);
		candidate.width = clamp(candidate.width, 0, state.canvas.width - candidate.x);
	} else if (key === "y") {
		candidate.y = clamp(snapped, 0, state.canvas.height);
		candidate.height = clamp(candidate.height, 0, state.canvas.height - candidate.y);
	} else if (key === "width") {
		candidate.width = clamp(snapped, 0, state.canvas.width - candidate.x);
	} else if (key === "height") {
		candidate.height = clamp(snapped, 0, state.canvas.height - candidate.y);
	}
	const normalized = normalizeRectToCanvas(state, candidate);
	if (rectOverlapsActive(state, regionId, normalized)) {
		setDirty(node);
		return;
	}
	Object.assign(rect, normalized);
	setDirty(node);
}

function clearTableEdit(node) {
	if (node?._regionalTableEdit) {
		node._regionalTableEdit = null;
	}
	if (activeTableNode === node) {
		activeTableNode = null;
	}
}

function restoreTableEdit(node) {
	const edit = node?._regionalTableEdit;
	if (!edit) {
		return;
	}
	const region = ensureRectProperties(node).regions[edit.regionId];
	if (region?.rect) {
		Object.assign(region.rect, edit.original);
	}
	clearTableEdit(node);
	setDirty(node);
}

function startTableEdit(node, cell) {
	const state = ensureRectProperties(node);
	const region = state.regions[cell.regionId];
	if (!region?.rect) {
		return;
	}
	selectRegion(node, Number(cell.regionId));
	node._regionalTableEdit = {
		regionId: cell.regionId,
		key: cell.key,
		text: String(region.rect[cell.key] ?? 0),
		original: { ...region.rect },
		replace: true,
	};
	activeTableNode = node;
	setDirty(node);
}

function applyTableEditText(node) {
	const edit = node?._regionalTableEdit;
	if (!edit) {
		return;
	}
	const value = edit.text === "" ? 0 : Number(edit.text);
	updateRegionValue(node, edit.regionId, edit.key, Number.isFinite(value) ? value : 0);
}

function installTableKeyboardHandler() {
	if (globalThis.__regionalColorTableKeyboardInstalled) {
		return;
	}
	globalThis.__regionalColorTableKeyboardInstalled = true;
	window.addEventListener("keydown", (event) => {
		const node = activeTableNode;
		const edit = node?._regionalTableEdit;
		if (!edit) {
			return;
		}

		if (/^\d$/.test(event.key)) {
			edit.text = edit.replace ? event.key : `${edit.text}${event.key}`;
			edit.replace = false;
			applyTableEditText(node);
			event.preventDefault();
			return;
		}
		if (event.key === "Backspace") {
			edit.text = edit.replace ? "" : edit.text.slice(0, -1);
			edit.replace = false;
			applyTableEditText(node);
			event.preventDefault();
			return;
		}
		if (event.key === "Delete") {
			edit.text = "";
			edit.replace = false;
			applyTableEditText(node);
			event.preventDefault();
			return;
		}
		if (event.key === "Enter" || event.key === "Tab") {
			applyTableEditText(node);
			clearTableEdit(node);
			setDirty(node);
			event.preventDefault();
			return;
		}
		if (event.key === "Escape") {
			restoreTableEdit(node);
			event.preventDefault();
		}
	});
}

function tableHeight(node) {
	const state = ensureRectProperties(node);
	return TABLE_PADDING + TABLE_HEADER_HEIGHT + state.activeRegions * TABLE_ROW_HEIGHT + TABLE_PADDING;
}

function tableColumnsFor(node) {
	return isAttentionCanvas(node) ? [TABLE_COLUMNS[0], ENABLED_TABLE_COLUMN, ...TABLE_COLUMNS.slice(1)] : TABLE_COLUMNS;
}

function makeTableColumns(node, width) {
	const tableColumns = tableColumnsFor(node);
	const fixedWidth = tableColumns.reduce((total, column) => total + (column.width || 0), 0);
	const flexibleColumns = tableColumns.filter((column) => !column.width).length;
	const flexibleWidth = Math.max(42, (width - fixedWidth) / Math.max(1, flexibleColumns));
	return tableColumns.map((column) => ({ ...column, width: column.width || flexibleWidth }));
}

function drawRegionTable(ctx, owner, widgetWidth, widgetY) {
	const state = ensureRectProperties(owner);
	const x = TABLE_PADDING;
	const y = widgetY + TABLE_PADDING / 2;
	const width = Math.max(180, widgetWidth - TABLE_PADDING * 2);
	const columns = makeTableColumns(owner, width);
	const cells = [];

	owner._regionalTableLayout = { x, y, width, columns, cells };

	ctx.save();
	ctx.font = "12px sans-serif";
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#171717";
	ctx.fillRect(x, y, width, TABLE_HEADER_HEIGHT + state.activeRegions * TABLE_ROW_HEIGHT);

	let columnX = x;
	ctx.fillStyle = "#252525";
	ctx.fillRect(x, y, width, TABLE_HEADER_HEIGHT);
	for (const column of columns) {
		ctx.fillStyle = "#c8c8c8";
		if (column.label) {
			ctx.fillText(column.label, columnX + 6, y + TABLE_HEADER_HEIGHT / 2);
		}
		columnX += column.width;
	}

	for (let rowIndex = 0; rowIndex < state.activeRegions; rowIndex++) {
		const id = String(rowIndex + 1);
		const region = state.regions[id];
		const rowY = y + TABLE_HEADER_HEIGHT + rowIndex * TABLE_ROW_HEIGHT;
		const selected = id === currentRegionId(owner);

		ctx.fillStyle = selected ? "#323845" : rowIndex % 2 ? "#202020" : "#1b1b1b";
		ctx.fillRect(x, rowY, width, TABLE_ROW_HEIGHT);

		columnX = x;
		for (const column of columns) {
			const cell = { x: columnX, y: rowY, width: column.width, height: TABLE_ROW_HEIGHT, regionId: id, key: column.key };
			cells.push(cell);

			if (column.key === "swatch") {
				ctx.fillStyle = region.color || rectColor(Number(id));
				ctx.fillRect(columnX + 7, rowY + 5, 12, 12);
				ctx.strokeStyle = "#000000";
				ctx.strokeRect(columnX + 7, rowY + 5, 12, 12);
			} else if (column.key === "enabled") {
				ctx.strokeStyle = "#b8b8b8";
				ctx.strokeRect(columnX + 8, rowY + 5, 12, 12);
				if (region.enabled !== false) {
					ctx.beginPath();
					ctx.moveTo(columnX + 10, rowY + 11);
					ctx.lineTo(columnX + 13, rowY + 14);
					ctx.lineTo(columnX + 18, rowY + 7);
					ctx.strokeStyle = "#f0f0f0";
					ctx.stroke();
				}
			} else if (column.key === "id") {
				ctx.fillStyle = region.enabled === false ? "#888888" : "#f0f0f0";
				ctx.fillText(id, columnX + 6, rowY + TABLE_ROW_HEIGHT / 2);
			} else {
				const edit = owner._regionalTableEdit;
				const editing = edit?.regionId === id && edit.key === column.key;
				ctx.fillStyle = editing ? "#3f4f66" : "#00000020";
				ctx.fillRect(columnX + 2, rowY + 3, column.width - 4, TABLE_ROW_HEIGHT - 6);
				ctx.fillStyle = "#f0f0f0";
				const text = editing ? edit.text : String(region.rect[column.key] ?? 0);
				ctx.fillText(text, columnX + 6, rowY + TABLE_ROW_HEIGHT / 2);
			}

			ctx.strokeStyle = "#00000070";
			ctx.beginPath();
			ctx.moveTo(columnX, rowY);
			ctx.lineTo(columnX, rowY + TABLE_ROW_HEIGHT);
			ctx.stroke();
			columnX += column.width;
		}
	}

	ctx.strokeStyle = "#000000";
	ctx.strokeRect(x, y, width, TABLE_HEADER_HEIGHT + state.activeRegions * TABLE_ROW_HEIGHT);
	ctx.restore();
}

function tableCellAt(node, pos) {
	const layout = node._regionalTableLayout;
	if (!layout) {
		return null;
	}
	for (const cell of layout.cells || []) {
		if (pos[0] >= cell.x && pos[0] <= cell.x + cell.width && pos[1] >= cell.y && pos[1] <= cell.y + cell.height) {
			return cell;
		}
	}
	return null;
}

function handleTableMouseDown(node, pos) {
	const cell = tableCellAt(node, pos);
	if (!cell) {
		return false;
	}
	if (NUMERIC_TABLE_KEYS.has(cell.key)) {
		startTableEdit(node, cell);
	} else if (cell.key === "enabled") {
		clearTableEdit(node);
		const state = ensureRectProperties(node);
		const region = state.regions[cell.regionId];
		if (region) {
			region.enabled = region.enabled === false;
			selectRegion(node, Number(cell.regionId));
			setDirty(node);
		}
	} else {
		clearTableEdit(node);
		selectRegion(node, Number(cell.regionId));
	}
	return true;
}

function bindCanvasWidgets(node) {
	syncWidgetValuesToState(node);
	const exactDimensions = isReferenceCanvas(node);
	const dimensionMin = exactDimensions ? 1 : MIN_RESOLUTION;
	const dimensionStep = exactDimensions ? 1 : DIMENSION_STEP;

	configureWidget(getWidget(node, "width"), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.width = normalizeNodeCanvasDimension(owner, value, nextState.canvas.width);
		this.value = nextState.canvas.width;
		clampActiveRegionRects(nextState);
		setDirty(owner);
	}, { min: dimensionMin, max: MAX_RESOLUTION, step: dimensionStep, precision: 0 });
	setNumberWidgetStep(getWidget(node, "width"), dimensionStep);

	configureWidget(getWidget(node, "height"), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.height = normalizeNodeCanvasDimension(owner, value, nextState.canvas.height);
		this.value = nextState.canvas.height;
		clampActiveRegionRects(nextState);
		setDirty(owner);
	}, { min: dimensionMin, max: MAX_RESOLUTION, step: dimensionStep, precision: 0 });
	setNumberWidgetStep(getWidget(node, "height"), dimensionStep);

	configureWidget(gridWidget(node), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.gridSize = stepGridSizeValue(this, value);
		this.value = nextState.canvas.gridSize;
		clampActiveRegionRects(nextState);
		setDirty(owner);
	}, { min: MIN_GRID_SIZE, max: MAX_GRID_SIZE, step: MIN_GRID_SIZE, precision: 0 });
	setNumberWidgetStep(gridWidget(node), MIN_GRID_SIZE);

	configureWidget(regionCountWidget(node), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		if (hasRegionDataLink(owner)) {
			this.value = clampInt(nextState.activeRegions ?? 1, 1, MAX_REGIONS);
			setWidgetDisabled(this, true);
			setDirty(owner);
			return;
		}
		const previousRegions = clampInt(nextState.activeRegions ?? 1, 1, MAX_REGIONS);
		const nextRegions = clampInt(value, 1, MAX_REGIONS);
		if (isAttentionCanvas(owner) && nextRegions < previousRegions && linkedAttentionInputAbove(owner, nextRegions)) {
			this.value = previousRegions;
			setDirty(owner);
			return;
		}
		nextState.activeRegions = nextRegions;
		nextState.selectedRegion = String(clampInt(nextState.selectedRegion ?? 1, 1, nextRegions));
		this.value = nextRegions;
		if (nextRegions < previousRegions) {
			hideInactiveRectRegions(nextState, nextRegions + 1);
		}
		ensureVisibleRectRegions(nextState);
		clampActiveRegionRects(nextState);
		syncAttentionInputSockets(owner, nextRegions);
		computeCanvasSize(owner, owner.size);
		setDirty(owner);
	}, { min: 1, max: MAX_REGIONS, step: 1, precision: 0 });

	setWidgetDisabled(regionCountWidget(node), hasRegionDataLink(node));
}

function addColorCanvas(node) {
	node.addCustomWidget({
		type: "customCanvas",
		name: "RegionalColorCanvas",
		draw(ctx, owner, widgetWidth, widgetY) {
			const state = applyCanvasControlValues(owner);
			computeCanvasSize(owner, owner.size);

			const margin = 10;
			const border = 2;
			const widgetHeight = owner.canvasHeight || 220;
			const width = state.canvas.width;
			const height = state.canvas.height;
			const canvasGridSize = gridSize(state);
			const scale = Math.min((widgetWidth - margin * 2) / width, (widgetHeight - margin * 2) / height);
			const canvasWidth = width * scale;
			const canvasHeight = height * scale;
			const canvasLeft = margin + Math.max(0, (widgetWidth - canvasWidth) / 2 - margin);
			const canvasTop = widgetY + margin + Math.max(0, (widgetHeight - canvasHeight) / 2 - margin);

			owner._regionalCanvasLayout = { x: canvasLeft, y: canvasTop, width: canvasWidth, height: canvasHeight, scale };

			ctx.fillStyle = "#000000";
			ctx.fillRect(canvasLeft - border, canvasTop - border, canvasWidth + border * 2, canvasHeight + border * 2);
			ctx.fillStyle = globalThis.LiteGraph.NODE_DEFAULT_BGCOLOR;
			ctx.fillRect(canvasLeft, canvasTop, canvasWidth, canvasHeight);
			if (isReferenceCanvas(owner) && referenceImageIsDrawable(owner._regionalReferenceImage)) {
				ctx.save();
				ctx.beginPath();
				ctx.rect(canvasLeft, canvasTop, canvasWidth, canvasHeight);
				ctx.clip();
				ctx.drawImage(owner._regionalReferenceImage, canvasLeft, canvasTop, canvasWidth, canvasHeight);
				ctx.restore();
			}

			for (const [id, region] of activeRectEntries(state)) {
				const rect = canvasToNodeRect(owner._regionalCanvasLayout, region);
				if (!rect || rect.width <= 0 || rect.height <= 0) {
					continue;
				}
				const color = region.color || rectColor(Number(id));
				ctx.fillStyle = isReferenceCanvas(owner) ? color : (id === currentRegionId(owner) ? color : `${color}80`);
				const baseAlpha = isReferenceCanvas(owner) ? REFERENCE_REGION_ALPHA : 1;
				ctx.globalAlpha = isAttentionCanvas(owner) && region.enabled === false ? baseAlpha * 0.25 : baseAlpha;
				ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
				ctx.globalAlpha = 1;
			}

			ctx.beginPath();
			for (let x = 0; x <= width / canvasGridSize; x++) {
				ctx.moveTo(canvasLeft + x * canvasGridSize * scale, canvasTop);
				ctx.lineTo(canvasLeft + x * canvasGridSize * scale, canvasTop + canvasHeight);
			}
			for (let y = 0; y <= height / canvasGridSize; y++) {
				ctx.moveTo(canvasLeft, canvasTop + y * canvasGridSize * scale);
				ctx.lineTo(canvasLeft + canvasWidth, canvasTop + y * canvasGridSize * scale);
			}
			ctx.strokeStyle = "#00000050";
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.closePath();

			const selected = selectedRegion(owner);
			const selectedRect = selected ? canvasToNodeRect(owner._regionalCanvasLayout, selected) : null;
			if (selectedRect && selectedRect.width > 0 && selectedRect.height > 0) {
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.strokeRect(selectedRect.x, selectedRect.y, selectedRect.width, selectedRect.height);
				drawHandles(ctx, selectedRect);
			}
		},
	});
}

function addRegionTable(node) {
	node.addCustomWidget({
		type: "customRegionTable",
		name: "RegionalColorTable",
		computeSize() {
			return [node.size?.[0] || 315, tableHeight(node)];
		},
		draw(ctx, owner, widgetWidth, widgetY) {
			drawRegionTable(ctx, owner, widgetWidth, widgetY);
		},
	});
}

function resetRegionalWidgets(node) {
	node.widgets = (node.widgets || []).filter((widget) => {
		return widget.type !== "customCanvas" && widget.type !== "customRegionTable";
	});
}

function configureCanvasNode(node) {
	node._regionalExactDimensions = isReferenceCanvas(node);
	const state = ensureRectProperties(node);
	syncAttentionInputSockets(node, state.activeRegions);
	node.serialize_widgets = true;
	node.size = node.size || [315, 640];
	node.size[0] = Math.max(node.size[0], 315);
	node.size[1] = Math.max(node.size[1], 640);
	resetRegionalWidgets(node);
	bindCanvasWidgets(node);
	addColorCanvas(node);
	addRegionTable(node);
	computeCanvasSize(node, node.size);
	scheduleCanvasConnectionSync(node);
}

function configureRegionNode(node) {
	const grid = linkedGridSizeValue(node);
	for (const name of REGION_GEOMETRY_WIDGET_NAMES) {
		const min = name === "width" || name === "height" ? grid : 0;
		configureWidget(getWidget(node, name), function (value, _, owner) {
			this.value = value;
			snapRegionGeometryWidgets(owner || node);
		}, { min, max: MAX_RESOLUTION, step: grid, precision: 0 });
	}

	snapRegionGeometryWidgets(node);
}

function configureGridSizeNode(node) {
	const widget = gridWidget(node);
	if (widget) {
		widget.value = normalizeGridSize(widget.value);
		widget._regionalLastGridSize = widget.value;
	}
	configureWidget(widget, function (value, _, owner) {
		const ownerNode = owner || node;
		this.value = stepGridSizeValue(this, value);
		for (const target of linkedRegionNodes(ownerNode)) {
			snapRegionGeometryWidgets(target);
		}
		refreshCanvasNodesForGridSizeNode(ownerNode);
		setDirty(ownerNode);
	}, { min: MIN_GRID_SIZE, max: MAX_GRID_SIZE, step: MIN_GRID_SIZE, precision: 0 });
	setNumberWidgetStep(widget, MIN_GRID_SIZE);
}

app.registerExtension({
	name: "Comfy.RegionalColorCanvas",
	setup() {
		installTableKeyboardHandler();
	},
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name === "RegionalColorReferenceImage") {
			const onNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function () {
				const result = onNodeCreated?.apply(this, arguments);
				scheduleReferenceImageNodeSync(this);
				return result;
			};

			const onConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function () {
				const result = onConfigure?.apply(this, arguments);
				scheduleReferenceImageNodeSync(this);
				return result;
			};

			const onConnectionsChange = nodeType.prototype.onConnectionsChange;
			nodeType.prototype.onConnectionsChange = function () {
				const result = onConnectionsChange?.apply(this, arguments);
				scheduleReferenceImageNodeSync(this);
				return result;
			};

			const onExecuted = nodeType.prototype.onExecuted;
			nodeType.prototype.onExecuted = function (message) {
				const result = onExecuted?.apply(this, arguments);
				if (message?.referenceDimensions) {
					setStoredReferenceDimensions(this, message.referenceDimensions, true);
				}
				refreshReferenceCanvasTargets(this);
				return result;
			};
			return;
		}

		if (nodeData.name === "RegionalColorGridSize") {
			const onNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function () {
				const result = onNodeCreated?.apply(this, arguments);
				configureGridSizeNode(this);
				return result;
			};

			const onConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function () {
				const result = onConfigure?.apply(this, arguments);
				configureGridSizeNode(this);
				return result;
			};
			return;
		}

		if (nodeData.name === "RegionalColorRegion") {
			const onNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function () {
				const result = onNodeCreated?.apply(this, arguments);
				configureRegionNode(this);
				return result;
			};

			const onConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function () {
				const result = onConfigure?.apply(this, arguments);
				configureRegionNode(this);
				return result;
			};

			const onConnectionsChange = nodeType.prototype.onConnectionsChange;
			nodeType.prototype.onConnectionsChange = function () {
				const result = onConnectionsChange?.apply(this, arguments);
				snapRegionGeometryWidgets(this);
				return result;
			};
			return;
		}

		if (nodeData.name === "RegionalColorRegions") {
			const onConnectionsChange = nodeType.prototype.onConnectionsChange;
			nodeType.prototype.onConnectionsChange = function () {
				const result = onConnectionsChange?.apply(this, arguments);
				refreshCanvasNodesForRegionsNode(this);
				return result;
			};
			return;
		}

		if (!CANVAS_NODE_NAMES.has(nodeData.name)) {
			return;
		}

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			configureCanvasNode(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			configureCanvasNode(this);
			return result;
		};

		const onResize = nodeType.prototype.onResize;
		nodeType.prototype.onResize = function (size) {
			onResize?.apply(this, arguments);
			computeCanvasSize(this, size);
		};

		const onConnectionsChange = nodeType.prototype.onConnectionsChange;
		nodeType.prototype.onConnectionsChange = function () {
			const result = onConnectionsChange?.apply(this, arguments);
			scheduleCanvasConnectionSync(this);
			return result;
		};

		const onExecuted = nodeType.prototype.onExecuted;
		nodeType.prototype.onExecuted = function (message) {
			const result = onExecuted?.apply(this, arguments);
			if (hasRegionDataLink(this) && message?.regionalColor) {
				setRegionalColorState(this, message.regionalColor);
			}
			if (message?.referenceDimensions) {
				setStoredReferenceDimensions(this, message.referenceDimensions, true);
			}
			if (message?.referenceImage) {
				loadExecutedReferencePreview(this, message.referenceImage);
			}
			if (message?.dims) {
				const [width, height] = message.dims;
				const state = ensureRectProperties(this);
				state.canvas.width = normalizeNodeCanvasDimension(this, width, state.canvas.width);
				state.canvas.height = normalizeNodeCanvasDimension(this, height, state.canvas.height);
				setWidgetValue(getWidget(this, "width"), state.canvas.width);
				setWidgetValue(getWidget(this, "height"), state.canvas.height);
				setWidgetValue(gridWidget(this), state.canvas.gridSize);
				setWidgetValue(regionCountWidget(this), state.activeRegions);
				setWidgetDisabled(regionCountWidget(this), hasRegionDataLink(this));
				syncAttentionInputSockets(this, state.activeRegions);
				syncReferenceDimensionWidgetState(this);
				clampActiveRegionRects(state);
				computeCanvasSize(this, this.size);
				setDirty(this);
			} else if (message?.regionalColor) {
				const state = ensureRectProperties(this);
				setWidgetValue(getWidget(this, "width"), state.canvas.width);
				setWidgetValue(getWidget(this, "height"), state.canvas.height);
				setWidgetValue(gridWidget(this), state.canvas.gridSize);
				setWidgetValue(regionCountWidget(this), state.activeRegions);
				setWidgetDisabled(regionCountWidget(this), hasRegionDataLink(this));
				syncAttentionInputSockets(this, state.activeRegions);
				syncReferenceDimensionWidgetState(this);
				computeCanvasSize(this, this.size);
				setDirty(this);
			}
			return result;
		};

		const onMouseDown = nodeType.prototype.onMouseDown;
		nodeType.prototype.onMouseDown = function (event, pos) {
			this._regionalDrag = null;
			if (handleTableMouseDown(this, pos)) {
				return true;
			}

			clearTableEdit(this);
			const state = ensureRectProperties(this);
			const canvasPoint = pointToCanvas(this._regionalCanvasLayout, pos);
			if (!canvasPoint) {
				return onMouseDown?.apply(this, arguments);
			}

			const selectedRegionId = currentRegionId(this);
			const selectedRect = canvasToNodeRect(this._regionalCanvasLayout, selectedRegion(this));
			const handle = selectedRect ? hitHandle(selectedRect, pos) : null;
			const regionId = handle ? selectedRegionId : hitRegion(this._regionalCanvasLayout, activeRectEntries(state), pos);
			if (!regionId) {
				return onMouseDown?.apply(this, arguments);
			}

			selectRegion(this, Number(regionId));
			const region = state.regions[regionId];
			this._regionalDrag = {
				action: handle || "move",
				regionId,
				start: canvasPoint,
				original: { ...region.rect },
			};
			setDirty(this);
			return true;
		};

		const onMouseMove = nodeType.prototype.onMouseMove;
		nodeType.prototype.onMouseMove = function (event, pos) {
			if (!this._regionalDrag) {
				return onMouseMove?.apply(this, arguments);
			}
			if (event?.buttons === 0) {
				this._regionalDrag = null;
				return true;
			}
			const canvasPoint = pointToCanvas(this._regionalCanvasLayout, pos);
			if (canvasPoint) {
				applyRectDrag(ensureRectProperties(this), this._regionalDrag, canvasPoint);
				setDirty(this);
			}
			return true;
		};

		const onMouseUp = nodeType.prototype.onMouseUp;
		nodeType.prototype.onMouseUp = function () {
			if (this._regionalDrag) {
				this._regionalDrag = null;
				return true;
			}
			return onMouseUp?.apply(this, arguments);
		};
	},
});
