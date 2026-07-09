import { app } from "../../scripts/app.js";
import {
	MAX_CELL_SIZE,
	MAX_REGIONS,
	MIN_CELL_SIZE,
	addNumberWidget,
	clamp,
	clampInt,
	computeCanvasSize,
	ensureRegionMap,
	getDrawColor,
	getWidget,
	setDirty,
	setWidgetValue,
	snap,
} from "./utils.js";

const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const DEFAULT_CELL_SIZE = 64;
const HANDLE_SIZE = 7;
const DEFAULT_REGION_CELLS = 2;

function setProperty(node, key, value) {
	if (node.setProperty) {
		node.setProperty(key, value);
	} else {
		node.properties[key] = value;
	}
}

function blankRegion(id) {
	return {
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		color: getDrawColor(id * 199, "FF").slice(0, 7),
	};
}

function defaultRegionRect(node, id) {
	const cellSize = clamp(node.properties.cellSize ?? DEFAULT_CELL_SIZE, MIN_CELL_SIZE, MAX_CELL_SIZE);
	const width = Math.min(node.properties.width, cellSize * DEFAULT_REGION_CELLS);
	const height = Math.min(node.properties.height, cellSize * DEFAULT_REGION_CELLS);
	const maxX = Math.max(0, node.properties.width - width);
	const maxY = Math.max(0, node.properties.height - height);
	const columns = Math.max(1, Math.floor(node.properties.width / Math.max(1, width)));
	const index = Math.max(0, Number(id) - 1);
	const x = Math.min(maxX, (index % columns) * width);
	const y = Math.min(maxY, Math.floor(index / columns) * height);

	return { x, y, width, height };
}

function ensureVisibleActiveRegions(node) {
	const activeRegions = clampInt(node.properties.activeRegions ?? 1, 1, MAX_REGIONS);
	for (let i = 1; i <= activeRegions; i++) {
		const region = node.properties.regions[String(i)];
		if (!region) {
			continue;
		}
		if ((Number(region.width) || 0) <= 0 || (Number(region.height) || 0) <= 0) {
			Object.assign(region, defaultRegionRect(node, i));
		}
	}
}

function hideInactiveRegions(node, firstInactiveRegion) {
	for (let i = firstInactiveRegion; i <= MAX_REGIONS; i++) {
		const region = node.properties.regions[String(i)];
		if (!region) {
			continue;
		}
		region.x = 0;
		region.y = 0;
		region.width = 0;
		region.height = 0;
	}
}

function ensureCanvasProperties(node) {
	if (!node.properties) {
		node.properties = {};
	}
	setProperty(node, "width", clamp(node.properties.width ?? DEFAULT_WIDTH, 1, 16384));
	setProperty(node, "height", clamp(node.properties.height ?? DEFAULT_HEIGHT, 1, 16384));
	setProperty(node, "activeRegions", clampInt(node.properties.activeRegions ?? 1, 1, MAX_REGIONS));
	setProperty(node, "cellSize", clamp(node.properties.cellSize ?? DEFAULT_CELL_SIZE, MIN_CELL_SIZE, MAX_CELL_SIZE));

	const regions = ensureRegionMap(node, blankRegion);
	ensureVisibleActiveRegions(node);
	for (let i = 1; i <= MAX_REGIONS; i++) {
		const region = regions[String(i)];
		region.x = clamp(region.x ?? 0, 0, node.properties.width);
		region.y = clamp(region.y ?? 0, 0, node.properties.height);
		region.width = clamp(region.width ?? 0, 0, node.properties.width - region.x);
		region.height = clamp(region.height ?? 0, 0, node.properties.height - region.y);
		if (!region.color) {
			region.color = getDrawColor(i * 199, "FF").slice(0, 7);
		}
	}
	return regions;
}

function currentRegionId(node) {
	const activeRegions = clampInt(node.properties.activeRegions ?? 1, 1, MAX_REGIONS);
	const widget = getWidget(node, "region");
	const value = widget ? widget.value : 1;
	return String(clampInt(value, 1, activeRegions));
}

function selectedRegion(node) {
	return node.properties.regions[currentRegionId(node)];
}

function syncRegionWidgets(node) {
	const region = selectedRegion(node);
	if (!region) {
		return;
	}
	setWidgetValue(node, "x", region.x);
	setWidgetValue(node, "y", region.y);
	setWidgetValue(node, "width", region.width);
	setWidgetValue(node, "height", region.height);
}

function selectRegion(node, regionId) {
	const regionWidget = getWidget(node, "region");
	if (regionWidget) {
		regionWidget.value = clampInt(regionId, 1, node.properties.activeRegions);
	}
	syncRegionWidgets(node);
	setDirty(node);
}

function clampSelectedRegion(node) {
	const region = selectedRegion(node);
	if (!region) {
		return;
	}
	region.x = clamp(region.x, 0, node.properties.width);
	region.y = clamp(region.y, 0, node.properties.height);
	region.width = clamp(region.width, 0, node.properties.width - region.x);
	region.height = clamp(region.height, 0, node.properties.height - region.y);
	syncRegionWidgets(node);
}

function updateRegionFromWidget(node, key, value) {
	const region = selectedRegion(node);
	if (!region) {
		return;
	}
	const cellSize = clamp(node.properties.cellSize, MIN_CELL_SIZE, MAX_CELL_SIZE);
	const snapped = snap(value, cellSize);

	if (key === "x") {
		region.x = clamp(snapped, 0, node.properties.width);
		region.width = clamp(region.width, 0, node.properties.width - region.x);
	} else if (key === "y") {
		region.y = clamp(snapped, 0, node.properties.height);
		region.height = clamp(region.height, 0, node.properties.height - region.y);
	} else if (key === "width") {
		region.width = clamp(snapped, 0, node.properties.width - region.x);
	} else if (key === "height") {
		region.height = clamp(snapped, 0, node.properties.height - region.y);
	}

	syncRegionWidgets(node);
	setDirty(node);
}

function updateRegionWidgetBounds(node) {
	const regionWidget = getWidget(node, "region");
	if (!regionWidget) {
		return;
	}
	const activeRegions = clampInt(node.properties.activeRegions, 1, MAX_REGIONS);
	regionWidget.options = Object.assign({}, regionWidget.options || {}, { min: 1, max: activeRegions });
	regionWidget.value = clampInt(regionWidget.value ?? 1, 1, activeRegions);
}

function addCanvasWidgets(node) {
	addNumberWidget(node, "canvasX", node.properties.width, function (value, _, owner) {
		setProperty(owner, "width", clamp(snap(value, DEFAULT_CELL_SIZE), 1, 16384));
		this.value = owner.properties.width;
		clampSelectedRegion(owner);
		setDirty(owner);
	}, { min: 1, max: 16384, step: 640, precision: 0 });

	addNumberWidget(node, "canvasY", node.properties.height, function (value, _, owner) {
		setProperty(owner, "height", clamp(snap(value, DEFAULT_CELL_SIZE), 1, 16384));
		this.value = owner.properties.height;
		clampSelectedRegion(owner);
		setDirty(owner);
	}, { min: 1, max: 16384, step: 640, precision: 0 });

	addNumberWidget(node, "regions", node.properties.activeRegions, function (value, _, owner) {
		const previousRegions = clampInt(owner.properties.activeRegions ?? 1, 1, MAX_REGIONS);
		const nextRegions = clampInt(value, 1, MAX_REGIONS);
		setProperty(owner, "activeRegions", nextRegions);
		this.value = nextRegions;
		if (nextRegions < previousRegions) {
			hideInactiveRegions(owner, nextRegions + 1);
		}
		ensureVisibleActiveRegions(owner);
		updateRegionWidgetBounds(owner);
		syncRegionWidgets(owner);
		setDirty(owner);
	}, { min: 1, max: MAX_REGIONS, step: 10, precision: 0 });

	addNumberWidget(node, "cell size", node.properties.cellSize, function (value, _, owner) {
		const current = clamp(owner.properties.cellSize, MIN_CELL_SIZE, MAX_CELL_SIZE);
		let next = value > current ? current * 2 : current / 2;
		next = clamp(next, MIN_CELL_SIZE, MAX_CELL_SIZE);
		setProperty(owner, "cellSize", next);
		this.value = next;
		for (const name of ["x", "y", "width", "height"]) {
			const widget = getWidget(owner, name);
			if (widget) {
				widget.options = Object.assign({}, widget.options || {}, { step: next * 10 });
			}
		}
		setDirty(owner);
	}, { min: MIN_CELL_SIZE, max: MAX_CELL_SIZE, step: MIN_CELL_SIZE * 10, precision: 0 });

	addNumberWidget(node, "region", 1, function (value, _, owner) {
		this.value = clampInt(value, 1, owner.properties.activeRegions);
		syncRegionWidgets(owner);
		setDirty(owner);
	}, { min: 1, max: node.properties.activeRegions, step: 10, precision: 0 });

	for (const name of ["x", "y", "width", "height"]) {
		addNumberWidget(node, name, selectedRegion(node)?.[name] ?? 0, function (value, _, owner) {
			updateRegionFromWidget(owner, name, value);
		}, { min: 0, max: 16384, step: node.properties.cellSize * 10, precision: 0 });
	}

	updateRegionWidgetBounds(node);
	syncRegionWidgets(node);
}

function canvasToNodeRect(node, region) {
	const layout = node._regionalCanvasLayout;
	if (!layout) {
		return null;
	}
	return {
		x: layout.x + region.x * layout.scale,
		y: layout.y + region.y * layout.scale,
		width: region.width * layout.scale,
		height: region.height * layout.scale,
	};
}

function activeRegionEntries(node) {
	const activeRegions = clampInt(node.properties.activeRegions, 1, MAX_REGIONS);
	const entries = [];
	for (let i = 1; i <= activeRegions; i++) {
		entries.push([String(i), node.properties.regions[String(i)]]);
	}
	return entries;
}

function drawHandles(ctx, rect) {
	const points = [
		[rect.x, rect.y],
		[rect.x + rect.width / 2, rect.y],
		[rect.x + rect.width, rect.y],
		[rect.x + rect.width, rect.y + rect.height / 2],
		[rect.x + rect.width, rect.y + rect.height],
		[rect.x + rect.width / 2, rect.y + rect.height],
		[rect.x, rect.y + rect.height],
		[rect.x, rect.y + rect.height / 2],
	];
	ctx.fillStyle = "#ffffff";
	ctx.strokeStyle = "#000000";
	ctx.lineWidth = 1;
	for (const [x, y] of points) {
		ctx.fillRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
		ctx.strokeRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
	}
}

function addColorCanvas(node) {
	if (node.widgets?.some((widget) => widget.type === "customCanvas" && widget.name === "RegionalColorCanvas")) {
		return;
	}

	node.addCustomWidget({
		type: "customCanvas",
		name: "RegionalColorCanvas",
		draw(ctx, owner, widgetWidth, widgetY) {
			ensureCanvasProperties(owner);
			computeCanvasSize(owner, owner.size);

			const margin = 10;
			const border = 2;
			const widgetHeight = owner.canvasHeight || 220;
			const width = owner.properties.width;
			const height = owner.properties.height;
			const cellSize = clamp(owner.properties.cellSize, MIN_CELL_SIZE, MAX_CELL_SIZE);
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

			for (const [id, region] of activeRegionEntries(owner)) {
				const rect = canvasToNodeRect(owner, region);
				if (!rect || rect.width <= 0 || rect.height <= 0) {
					continue;
				}
				ctx.fillStyle = id === currentRegionId(owner) ? getDrawColor(Number(id) * 199, "FF") : getDrawColor(Number(id) * 199, "80");
				region.color = ctx.fillStyle.slice(0, 7);
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
			const selectedRect = selected ? canvasToNodeRect(owner, selected) : null;
			if (selectedRect && selectedRect.width > 0 && selectedRect.height > 0) {
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.strokeRect(selectedRect.x, selectedRect.y, selectedRect.width, selectedRect.height);
				drawHandles(ctx, selectedRect);
			}
		},
	});
}

function pointToCanvas(node, pos) {
	const layout = node._regionalCanvasLayout;
	if (!layout) {
		return null;
	}
	if (pos[0] < layout.x || pos[0] > layout.x + layout.width || pos[1] < layout.y || pos[1] > layout.y + layout.height) {
		return null;
	}
	return {
		x: (pos[0] - layout.x) / layout.scale,
		y: (pos[1] - layout.y) / layout.scale,
	};
}

function hitHandle(rect, pos) {
	const handles = [
		["nw", rect.x, rect.y],
		["n", rect.x + rect.width / 2, rect.y],
		["ne", rect.x + rect.width, rect.y],
		["e", rect.x + rect.width, rect.y + rect.height / 2],
		["se", rect.x + rect.width, rect.y + rect.height],
		["s", rect.x + rect.width / 2, rect.y + rect.height],
		["sw", rect.x, rect.y + rect.height],
		["w", rect.x, rect.y + rect.height / 2],
	];
	for (const [name, x, y] of handles) {
		if (Math.abs(pos[0] - x) <= HANDLE_SIZE && Math.abs(pos[1] - y) <= HANDLE_SIZE) {
			return name;
		}
	}
	return null;
}

function hitRegion(node, pos) {
	const entries = activeRegionEntries(node).reverse();
	for (const [id, region] of entries) {
		const rect = canvasToNodeRect(node, region);
		if (!rect || rect.width <= 0 || rect.height <= 0) {
			continue;
		}
		if (pos[0] >= rect.x && pos[0] <= rect.x + rect.width && pos[1] >= rect.y && pos[1] <= rect.y + rect.height) {
			return id;
		}
	}
	return null;
}

function applyDrag(node, canvasPoint) {
	const drag = node._regionalDrag;
	const region = node.properties.regions[drag.regionId];
	const cellSize = clamp(node.properties.cellSize, MIN_CELL_SIZE, MAX_CELL_SIZE);
	const dx = canvasPoint.x - drag.start.x;
	const dy = canvasPoint.y - drag.start.y;
	const original = drag.original;
	let x = original.x;
	let y = original.y;
	let width = original.width;
	let height = original.height;

	if (drag.action === "move") {
		x = clamp(snap(original.x + dx, cellSize), 0, node.properties.width - original.width);
		y = clamp(snap(original.y + dy, cellSize), 0, node.properties.height - original.height);
	} else {
		if (drag.action.includes("w")) {
			const right = original.x + original.width;
			x = clamp(snap(original.x + dx, cellSize), 0, right);
			width = right - x;
		}
		if (drag.action.includes("e")) {
			width = clamp(snap(original.width + dx, cellSize), 0, node.properties.width - original.x);
		}
		if (drag.action.includes("n")) {
			const bottom = original.y + original.height;
			y = clamp(snap(original.y + dy, cellSize), 0, bottom);
			height = bottom - y;
		}
		if (drag.action.includes("s")) {
			height = clamp(snap(original.height + dy, cellSize), 0, node.properties.height - original.y);
		}
	}

	region.x = x;
	region.y = y;
	region.width = width;
	region.height = height;
	syncRegionWidgets(node);
	setDirty(node);
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
			ensureCanvasProperties(this);
			this.serialize_widgets = true;
			this.size = this.size || [315, 600];
			this.size[0] = Math.max(this.size[0], 315);
			this.size[1] = Math.max(this.size[1], 600);
			addCanvasWidgets(this);
			addColorCanvas(this);
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
			ensureCanvasProperties(this);
			const canvasPoint = pointToCanvas(this, pos);
			if (!canvasPoint) {
				return onMouseDown?.apply(this, arguments);
			}

			const selectedRegionId = currentRegionId(this);
			const selectedRect = canvasToNodeRect(this, selectedRegion(this));
			const handle = selectedRect ? hitHandle(selectedRect, pos) : null;
			let regionId = handle ? selectedRegionId : hitRegion(this, pos);
			if (!regionId) {
				return onMouseDown?.apply(this, arguments);
			}

			selectRegion(this, Number(regionId));
			const region = this.properties.regions[regionId];
			this._regionalDrag = {
				action: handle || "move",
				regionId,
				start: canvasPoint,
				original: { x: region.x, y: region.y, width: region.width, height: region.height },
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
			const canvasPoint = pointToCanvas(this, pos);
			if (canvasPoint) {
				applyDrag(this, canvasPoint);
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
