import { app } from "../../scripts/app.js";
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
	nearestAllowed,
	setDirty,
	snap,
} from "./utils.js";
import {
	DEFAULT_GRID_SIZE,
	activeRectEntries,
	ensureRectProperties,
	ensureVisibleRectRegions,
	hideInactiveRectRegions,
	normalizeCanvasDimension,
	normalizeGridSize,
	rectColor,
	selectRectRegion,
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
const NUMERIC_TABLE_KEYS = new Set(["x", "y", "width", "height"]);

let activeTableNode = null;

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
	const rect = region.rect;
	rect.x = clamp(snap(rect.x ?? 0, gridSize(state)), 0, state.canvas.width);
	rect.y = clamp(snap(rect.y ?? 0, gridSize(state)), 0, state.canvas.height);
	rect.width = clamp(snap(rect.width ?? 0, gridSize(state)), 0, state.canvas.width - rect.x);
	rect.height = clamp(snap(rect.height ?? 0, gridSize(state)), 0, state.canvas.height - rect.y);
}

function clampActiveRegionRects(state) {
	for (let i = 1; i <= state.activeRegions; i++) {
		clampRegionRect(state, i);
	}
}

function gridWidget(node) {
	return getWidget(node, "grid_size") || getWidget(node, "grid size");
}

function setWidgetValue(widget, value) {
	if (widget) {
		widget.value = value;
	}
}

function configureWidget(widget, callback, options) {
	if (!widget) {
		return;
	}
	widget.callback = callback;
	widget.options = Object.assign({}, widget.options || {}, options);
}

function syncWidgetValuesToState(node) {
	const state = ensureRectProperties(node);
	const canvasXWidget = getWidget(node, "canvasX");
	const canvasYWidget = getWidget(node, "canvasY");
	const gridSizeWidget = gridWidget(node);
	const regionsWidget = getWidget(node, "regions");

	state.canvas.width = normalizeCanvasDimension(canvasXWidget?.value ?? state.canvas.width, state.canvas.width);
	state.canvas.height = normalizeCanvasDimension(canvasYWidget?.value ?? state.canvas.height, state.canvas.height);
	state.canvas.gridSize = normalizeGridSize(gridSizeWidget?.value ?? state.canvas.gridSize);
	state.activeRegions = clampInt(regionsWidget?.value ?? state.activeRegions, 1, MAX_REGIONS);
	state.selectedRegion = String(clampInt(state.selectedRegion ?? 1, 1, state.activeRegions));

	setWidgetValue(canvasXWidget, state.canvas.width);
	setWidgetValue(canvasYWidget, state.canvas.height);
	setWidgetValue(gridSizeWidget, state.canvas.gridSize);
	setWidgetValue(regionsWidget, state.activeRegions);
	ensureVisibleRectRegions(state);
	clampActiveRegionRects(state);
	return state;
}

function updateRegionValue(node, regionId, key, value) {
	const state = ensureRectProperties(node);
	const region = state.regions[String(regionId)];
	if (!region || !NUMERIC_TABLE_KEYS.has(key)) {
		return;
	}

	const rect = region.rect;
	const snapped = snap(value, gridSize(state));
	if (key === "x") {
		rect.x = clamp(snapped, 0, state.canvas.width);
		rect.width = clamp(rect.width, 0, state.canvas.width - rect.x);
	} else if (key === "y") {
		rect.y = clamp(snapped, 0, state.canvas.height);
		rect.height = clamp(rect.height, 0, state.canvas.height - rect.y);
	} else if (key === "width") {
		rect.width = clamp(snapped, 0, state.canvas.width - rect.x);
	} else if (key === "height") {
		rect.height = clamp(snapped, 0, state.canvas.height - rect.y);
	}
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

function makeTableColumns(width) {
	const fixedWidth = TABLE_COLUMNS.reduce((total, column) => total + (column.width || 0), 0);
	const flexibleColumns = TABLE_COLUMNS.filter((column) => !column.width).length;
	const flexibleWidth = Math.max(42, (width - fixedWidth) / Math.max(1, flexibleColumns));
	return TABLE_COLUMNS.map((column) => ({ ...column, width: column.width || flexibleWidth }));
}

function drawRegionTable(ctx, owner, widgetWidth, widgetY) {
	const state = ensureRectProperties(owner);
	const x = TABLE_PADDING;
	const y = widgetY + TABLE_PADDING / 2;
	const width = Math.max(180, widgetWidth - TABLE_PADDING * 2);
	const columns = makeTableColumns(width);
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
			} else if (column.key === "id") {
				ctx.fillStyle = "#f0f0f0";
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
	} else {
		clearTableEdit(node);
		selectRegion(node, Number(cell.regionId));
	}
	return true;
}

function bindCanvasWidgets(node) {
	syncWidgetValuesToState(node);

	configureWidget(getWidget(node, "canvasX"), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.width = normalizeCanvasDimension(value, nextState.canvas.width);
		this.value = nextState.canvas.width;
		clampActiveRegionRects(nextState);
		setDirty(owner);
	}, { min: MIN_RESOLUTION, max: MAX_RESOLUTION, step: DIMENSION_STEP, precision: 0 });

	configureWidget(getWidget(node, "canvasY"), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.height = normalizeCanvasDimension(value, nextState.canvas.height);
		this.value = nextState.canvas.height;
		clampActiveRegionRects(nextState);
		setDirty(owner);
	}, { min: MIN_RESOLUTION, max: MAX_RESOLUTION, step: DIMENSION_STEP, precision: 0 });

	configureWidget(gridWidget(node), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		nextState.canvas.gridSize = nearestAllowed(clamp(value, MIN_GRID_SIZE, MAX_GRID_SIZE), GRID_SIZE_VALUES);
		this.value = nextState.canvas.gridSize;
		clampActiveRegionRects(nextState);
		setDirty(owner);
	}, { min: MIN_GRID_SIZE, max: MAX_GRID_SIZE, step: MIN_GRID_SIZE, precision: 0 });

	configureWidget(getWidget(node, "regions"), function (value, _, owner) {
		const nextState = ensureRectProperties(owner);
		const previousRegions = clampInt(nextState.activeRegions ?? 1, 1, MAX_REGIONS);
		const nextRegions = clampInt(value, 1, MAX_REGIONS);
		nextState.activeRegions = nextRegions;
		nextState.selectedRegion = String(clampInt(nextState.selectedRegion ?? 1, 1, nextRegions));
		this.value = nextRegions;
		if (nextRegions < previousRegions) {
			hideInactiveRectRegions(nextState, nextRegions + 1);
		}
		ensureVisibleRectRegions(nextState);
		clampActiveRegionRects(nextState);
		computeCanvasSize(owner, owner.size);
		setDirty(owner);
	}, { min: 1, max: MAX_REGIONS, step: 1, precision: 0 });
}

function addColorCanvas(node) {
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
			const canvasGridSize = gridSize(state);
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
			for (let x = 0; x <= width / canvasGridSize; x++) {
				ctx.moveTo(canvasX + x * canvasGridSize * scale, canvasY);
				ctx.lineTo(canvasX + x * canvasGridSize * scale, canvasY + canvasHeight);
			}
			for (let y = 0; y <= height / canvasGridSize; y++) {
				ctx.moveTo(canvasX, canvasY + y * canvasGridSize * scale);
				ctx.lineTo(canvasX + canvasWidth, canvasY + y * canvasGridSize * scale);
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
	ensureRectProperties(node);
	node.serialize_widgets = true;
	node.size = node.size || [315, 640];
	node.size[0] = Math.max(node.size[0], 315);
	node.size[1] = Math.max(node.size[1], 640);
	resetRegionalWidgets(node);
	bindCanvasWidgets(node);
	addColorCanvas(node);
	addRegionTable(node);
	computeCanvasSize(node, node.size);
}

app.registerExtension({
	name: "Comfy.RegionalColorCanvas",
	setup() {
		installTableKeyboardHandler();
	},
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
