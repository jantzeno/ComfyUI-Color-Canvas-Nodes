export const MAX_REGIONS = 16;
export const MIN_CELL_SIZE = 8;
export const MAX_CELL_SIZE = 64;

export function clamp(value, min, max) {
	const numeric = Number.isFinite(Number(value)) ? Number(value) : min;
	return Math.min(max, Math.max(min, numeric));
}

export function clampInt(value, min, max) {
	return Math.round(clamp(value, min, max));
}

export function snap(value, step) {
	const snapStep = Math.max(1, Number(step) || 1);
	return Math.round(value / snapStep) * snapStep;
}

export function getWidget(node, name) {
	return node.widgets?.find((widget) => widget.name === name);
}

export function setWidgetValue(node, name, value) {
	const widget = getWidget(node, name);
	if (widget) {
		widget.value = value;
	}
}

export function setDirty(node) {
	node.graph?.setDirtyCanvas(true, true);
}

export function addNumberWidget(node, name, value, callback, config = {}) {
	let widget = getWidget(node, name);
	if (!widget) {
		widget = node.addWidget(
			"number",
			name,
			value,
			callback,
			Object.assign({ min: 0, max: 4096, step: 10, precision: 0 }, config)
		);
	} else {
		widget.callback = callback;
		widget.options = Object.assign({}, widget.options || {}, config);
		if (widget.value == null) {
			widget.value = value;
		}
	}
	return widget;
}

export function addTextWidget(node, name, value, callback, config = {}) {
	let widget = getWidget(node, name);
	if (!widget) {
		widget = node.addWidget(
			"text",
			name,
			value,
			callback,
			Object.assign({ multiline: false }, config)
		);
	} else {
		widget.callback = callback;
		if (widget.value == null) {
			widget.value = value;
		}
	}
	return widget;
}

export function getDrawColor(hue, alpha) {
	const h = hue % 360;
	const s = 50;
	let l = 50;
	l /= 100;
	const a = s * Math.min(l, 1 - l) / 100;
	const f = (n) => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color).toString(16).padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}${alpha}`;
}

export function ensureRegionMap(node, factory) {
	if (!node.properties) {
		node.properties = {};
	}
	if (!node.properties.regions || typeof node.properties.regions !== "object") {
		node.properties.regions = {};
	}
	for (let i = 1; i <= MAX_REGIONS; i++) {
		const id = String(i);
		if (!node.properties.regions[id]) {
			node.properties.regions[id] = factory(i);
		}
	}
	return node.properties.regions;
}

export function computeCanvasSize(node, size) {
	const MIN_SIZE = 220;
	const outputRows = Math.max(node.outputs?.length || 0, node.inputs?.length || 0);
	let y = LiteGraph.NODE_WIDGET_HEIGHT * outputRows + 8;
	let freeSpace = size[1] - y;
	let widgetHeight = 0;

	for (const widget of node.widgets || []) {
		if (widget.type === "customCanvas") {
			continue;
		}
		if (widget.computeSize) {
			widgetHeight += widget.computeSize()[1] + 4;
		} else {
			widgetHeight += LiteGraph.NODE_WIDGET_HEIGHT + 4;
		}
	}

	freeSpace -= widgetHeight;
	if (freeSpace < MIN_SIZE) {
		freeSpace = MIN_SIZE;
		node.size[1] = y + widgetHeight + freeSpace;
		setDirty(node);
	}

	for (const widget of node.widgets || []) {
		widget.y = y;
		if (widget.type === "customCanvas") {
			y += freeSpace;
		} else if (widget.computeSize) {
			y += widget.computeSize()[1] + 4;
		} else {
			y += LiteGraph.NODE_WIDGET_HEIGHT + 4;
		}
	}

	node.canvasHeight = freeSpace;
}
