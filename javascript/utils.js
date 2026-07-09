export const MAX_REGIONS = 16;
export const MIN_RESOLUTION = 64;
export const MAX_RESOLUTION = 16384;
export const DIMENSION_STEP = 64;
export const MIN_GRID_SIZE = 8;
export const MAX_GRID_SIZE = 64;
export const GRID_SIZE_VALUES = [8, 16, 32, 64];

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

export function nearestAllowed(value, allowedValues) {
	const numeric = Number(value);
	const fallback = allowedValues[0];
	const target = Number.isFinite(numeric) ? numeric : fallback;
	return allowedValues.reduce((best, candidate) => {
		const bestDistance = Math.abs(best - target);
		const candidateDistance = Math.abs(candidate - target);
		return candidateDistance < bestDistance ? candidate : best;
	}, fallback);
}

export function getWidget(node, name) {
	return node.widgets?.find((widget) => widget.name === name);
}

export function setDirty(node) {
	node.graph?.setDirtyCanvas(true, true);
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
