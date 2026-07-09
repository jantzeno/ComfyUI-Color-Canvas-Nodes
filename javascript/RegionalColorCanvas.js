import { app } from "../../scripts/app.js";
import {
	MAX_CELL_SIZE,
	MAX_REGIONS,
	MIN_CELL_SIZE,
	addNumberWidget,
	clamp,
	clampInt,
	computeCanvasSize,
	getWidget,
	setDirty,
	setWidgetValue,
	snap,
} from "./utils.js";
import {
	DEFAULT_CELL_SIZE,
	MAX_RESOLUTION,
	activeRectEntries,
	ensureRectProperties,
	ensureVisibleRectRegions,
	hideInactiveRectRegions,
	rectColor,
	selectedRectRegion,
} from "./state.js";
import {
	applyRectDrag,
	canvasToNodeRect,
	drawHandles,
	hitHandle,
	hitRegion,
	pointToCanvas,
} from "./canvasInteractions.js";

function currentRegionId(node) {
	const state = ensureRectProperties(node);
	const widget = getWidget(node, "region");
	return String(clampInt(widget?.value ?? 1, 1, state.activeRegions));
}

function selectedRegion(node) {
	return selectedRectRegion(node);
}

function syncRegionWidgets(node) {
	const region = selectedRegion(node);
	if (!region) {
		return;
	}
	setWidgetValue(node, "x", region.rect.x);
	setWidgetValue(node, "y", region.rect.y);
	setWidgetValue(node, "width", region.rect.width);
	setWidgetValue(node, "height", region.rect.height);
}

function selectRegion(node, regionId) {
	const state = ensureRectProperties(node);
	const regionWidget = getWidget(node, "region");
	if (regionWidget) {
		regionWidget.value = clampInt(regionId, 1, state.activeRegions);
	}
	syncRegionWidgets(node);
	setDirty(node);
}

function clampSelectedRegion(node) {
	const state = ensureRectProperties(node);
	const region = selectedRegion(node);
	if (!region) {
		return;
	}
	region.rect.x = clamp(region.rect.x, 0, state.canvas.width);
	region.rect.y = clamp(region.rect.y, 0, state.canvas.height);
	region.rect.width = clamp(region.rect.width, 0, state.canvas.width - region.rect.x);
	region.rect.height = clamp(region.rect.height, 0, state.canvas.height - region.rect.y);
	syncRegionWidgets(node);
}

function updateRegionFromWidget(node, key, value) {
	const state = ensureRectProperties(node);
	const region = selectedRegion(node);
	if (!region) {
		return;
	}
	const cellSize = clamp(state.canvas.cellSize, MIN_CELL_SIZE, MAX_CELL_SIZE);
	const snapped = snap(value, cellSize);

	if (key === "x") {
		region.rect.x = clamp(snapped, 0, state.canvas.width);
		region.rect.width = clamp(region.rect.width, 0, state.canvas.width - region.rect.x);
	} else if (key === "y") {
		region.rect.y = clamp(snapped, 0, state.canvas.height);
		region.rect.height = clamp(region.rect.height, 0, state.canvas.height - region.rect.y);
	} else if (key === "width") {
		region.rect.width = clamp(snapped, 0, state.canvas.width - region.rect.x);
	} else if (key === "height") {
		region.rect.height = clamp(snapped, 0, state.canvas.height - region.rect.y);
	}

	syncRegionWidgets(node);
	setDirty(node);
}

function updateRegionWidgetBounds(node) {
	const state = ensureRectProperties(node);
	const regionWidget = getWidget(node, "region");
	if (!regionWidget) {
		return;
	}
	regionWidget.options = Object.assign({}, regionWidget.options || {}, { min: 1, max: state.activeRegions });
	regionWidget.value = clampInt(regionWidget.value ?? 1, 1, state.activeRegions);
}

function addCanvasWidgets(node) {
	const state = ensureRectProperties(node);

	addNumberWidget(node, "canvasX", state.canvas.width, function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.width = clamp(snap(value, DEFAULT_CELL_SIZE), 1, MAX_RESOLUTION);
		this.value = nextState.canvas.width;
		clampSelectedRegion(owner);
		setDirty(owner);
	}, { min: 1, max: MAX_RESOLUTION, step: 640, precision: 0 });

	addNumberWidget(node, "canvasY", state.canvas.height, function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.height = clamp(snap(value, DEFAULT_CELL_SIZE), 1, MAX_RESOLUTION);
		this.value = nextState.canvas.height;
		clampSelectedRegion(owner);
		setDirty(owner);
	}, { min: 1, max: MAX_RESOLUTION, step: 640, precision: 0 });

	addNumberWidget(node, "regions", state.activeRegions, function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		const previousRegions = clampInt(nextState.activeRegions ?? 1, 1, MAX_REGIONS);
		const nextRegions = clampInt(value, 1, MAX_REGIONS);
		nextState.activeRegions = nextRegions;
		this.value = nextRegions;
		if (nextRegions < previousRegions) {
			hideInactiveRectRegions(nextState, nextRegions + 1);
		}
		ensureVisibleRectRegions(nextState);
		updateRegionWidgetBounds(owner);
		syncRegionWidgets(owner);
		setDirty(owner);
	}, { min: 1, max: MAX_REGIONS, step: 10, precision: 0 });

	addNumberWidget(node, "cell size", state.canvas.cellSize, function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		const current = clamp(nextState.canvas.cellSize, MIN_CELL_SIZE, MAX_CELL_SIZE);
		const cellSize = clamp(value > current ? current * 2 : current / 2, MIN_CELL_SIZE, MAX_CELL_SIZE);
		nextState.canvas.cellSize = cellSize;
		this.value = cellSize;
		for (const name of ["x", "y", "width", "height"]) {
			const widget = getWidget(owner, name);
			if (widget) {
				widget.options = Object.assign({}, widget.options || {}, { step: cellSize * 10 });
			}
		}
		setDirty(owner);
	}, { min: MIN_CELL_SIZE, max: MAX_CELL_SIZE, step: MIN_CELL_SIZE * 10, precision: 0 });

	addNumberWidget(node, "region", 1, function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		this.value = clampInt(value, 1, nextState.activeRegions);
		syncRegionWidgets(owner);
		setDirty(owner);
	}, { min: 1, max: state.activeRegions, step: 10, precision: 0 });

	for (const name of ["x", "y", "width", "height"]) {
		addNumberWidget(node, name, selectedRegion(node)?.rect?.[name] ?? 0, function (value, _, owner) {
			updateRegionFromWidget(owner, name, value);
		}, { min: 0, max: MAX_RESOLUTION, step: state.canvas.cellSize * 10, precision: 0 });
	}

	updateRegionWidgetBounds(node);
	syncRegionWidgets(node);
}

function addColorCanvas(node) {
	if (node.widgets?.some((widget) => widget.type === "customCanvas" && widget.name === "RegionalColorCanvas")) {
		return;
	}

	node.addCustomWidget({
		type: "customCanvas",
		name: "RegionalColorCanvas",
		draw(ctx, owner, widgetWidth, widgetY) {
			const state = ensureRectProperties(owner);
			computeCanvasSize(owner, owner.size);

			const margin = 10;
			const border = 2;
			const widgetHeight = owner.canvasHeight || 220;
			const width = state.canvas.width;
			const height = state.canvas.height;
			const cellSize = clamp(state.canvas.cellSize, MIN_CELL_SIZE, MAX_CELL_SIZE);
			const scale = Math.min((widgetWidth - margin * 2) / width, (widgetHeight - margin * 2) / height);
			const canvasWidth = width * scale;
			const canvasHeight = height * scale;
			const canvasX = margin + Math.max(0, (widgetWidth - canvasWidth) / 2 - margin);
			const canvasY = widgetY + margin + Math.max(0, (widgetHeight - canvasHeight) / 2 - margin);

			owner._regionalCanvasLayout = { x: canvasX, y: canvasY, width: canvasWidth, height: canvasHeight, scale };

			ctx.fillStyle = "#000000";
			ctx.fillRect(canvasX - border, canvasY - border, canvasWidth + border * 2, canvasHeight + border * 2);
			ctx.fillStyle = globalThis.LiteGraph.NODE_DEFAULT_BGCOLOR;
			ctx.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);

			for (const [id, region] of activeRectEntries(state)) {
				const rect = canvasToNodeRect(owner._regionalCanvasLayout, region);
				if (!rect || rect.width <= 0 || rect.height <= 0) {
					continue;
				}
				const color = region.color || rectColor(Number(id));
				ctx.fillStyle = id === currentRegionId(owner) ? color : `${color}80`;
				ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
			}

			ctx.beginPath();
			for (let x = 0; x <= width / cellSize; x++) {
				ctx.moveTo(canvasX + x * cellSize * scale, canvasY);
				ctx.lineTo(canvasX + x * cellSize * scale, canvasY + canvasHeight);
			}
			for (let y = 0; y <= height / cellSize; y++) {
				ctx.moveTo(canvasX, canvasY + y * cellSize * scale);
				ctx.lineTo(canvasX + canvasWidth, canvasY + y * cellSize * scale);
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

function configureCanvasNode(node) {
	ensureRectProperties(node);
	node.serialize_widgets = true;
	node.size = node.size || [315, 600];
	node.size[0] = Math.max(node.size[0], 315);
	node.size[1] = Math.max(node.size[1], 600);
	addCanvasWidgets(node);
	addColorCanvas(node);
}

app.registerExtension({
	name: "Comfy.RegionalColorCanvas",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "RegionalColorCanvas") {
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
			syncRegionWidgets(this);
			return result;
		};

		const onResize = nodeType.prototype.onResize;
		nodeType.prototype.onResize = function (size) {
			onResize?.apply(this, arguments);
			computeCanvasSize(this, size);
		};

		const onMouseDown = nodeType.prototype.onMouseDown;
		nodeType.prototype.onMouseDown = function (event, pos) {
			this._regionalDrag = null;
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
				syncRegionWidgets(this);
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
