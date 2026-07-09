import {
	MAX_CELL_SIZE,
	MAX_REGIONS,
	MIN_CELL_SIZE,
	clamp,
	clampInt,
	getDrawColor,
} from "./utils.js";

export const REGIONAL_COLOR_VERSION = 1;
export const DEFAULT_WIDTH = 512;
export const DEFAULT_HEIGHT = 512;
export const DEFAULT_CELL_SIZE = 64;
export const DEFAULT_REGION_CELLS = 2;
export const MAX_RESOLUTION = 16384;

export function setProperty(node, key, value) {
	if (node.setProperty) {
		node.setProperty(key, value);
	} else {
		node.properties[key] = value;
	}
}

export function ensureRegionalColor(node) {
	if (!node.properties) {
		node.properties = {};
	}
	if (!node.properties.regionalColor || typeof node.properties.regionalColor !== "object") {
		setProperty(node, "regionalColor", {});
	}

	const state = node.properties.regionalColor;
	state.version = REGIONAL_COLOR_VERSION;
	if (!state.canvas || typeof state.canvas !== "object") {
		state.canvas = {};
	}
	if (!state.regions || typeof state.regions !== "object") {
		state.regions = {};
	}
	state.activeRegions = clampInt(state.activeRegions ?? 1, 1, MAX_REGIONS);
	return state;
}

export function rectColor(id) {
	return getDrawColor(id * 199, "FF").slice(0, 7);
}

export function defaultRegionRect(state, id) {
	const width = Math.min(state.canvas.width, state.canvas.cellSize * DEFAULT_REGION_CELLS);
	const height = Math.min(state.canvas.height, state.canvas.cellSize * DEFAULT_REGION_CELLS);
	const maxX = Math.max(0, state.canvas.width - width);
	const maxY = Math.max(0, state.canvas.height - height);
	const columns = Math.max(1, Math.floor(state.canvas.width / Math.max(1, width)));
	const index = Math.max(0, Number(id) - 1);
	return {
		x: Math.min(maxX, (index % columns) * width),
		y: Math.min(maxY, Math.floor(index / columns) * height),
		width,
		height,
	};
}

export function blankRectRegion(id) {
	return {
		rect: { x: 0, y: 0, width: 0, height: 0 },
		color: rectColor(id),
	};
}

export function ensureRectProperties(node) {
	const state = ensureRegionalColor(node);
	state.canvas.width = clamp(state.canvas.width ?? DEFAULT_WIDTH, 1, MAX_RESOLUTION);
	state.canvas.height = clamp(state.canvas.height ?? DEFAULT_HEIGHT, 1, MAX_RESOLUTION);
	state.canvas.cellSize = clamp(state.canvas.cellSize ?? DEFAULT_CELL_SIZE, MIN_CELL_SIZE, MAX_CELL_SIZE);

	for (let i = 1; i <= MAX_REGIONS; i++) {
		const id = String(i);
		if (!state.regions[id] || typeof state.regions[id] !== "object") {
			state.regions[id] = blankRectRegion(i);
		}
		if (!state.regions[id].rect || typeof state.regions[id].rect !== "object") {
			state.regions[id].rect = { x: 0, y: 0, width: 0, height: 0 };
		}
		if (!state.regions[id].color) {
			state.regions[id].color = rectColor(i);
		}
	}

	ensureVisibleRectRegions(state);
	for (let i = 1; i <= MAX_REGIONS; i++) {
		const rect = state.regions[String(i)].rect;
		rect.x = clamp(rect.x ?? 0, 0, state.canvas.width);
		rect.y = clamp(rect.y ?? 0, 0, state.canvas.height);
		rect.width = clamp(rect.width ?? 0, 0, state.canvas.width - rect.x);
		rect.height = clamp(rect.height ?? 0, 0, state.canvas.height - rect.y);
	}
	return state;
}

export function ensureVisibleRectRegions(state) {
	const activeRegions = clampInt(state.activeRegions ?? 1, 1, MAX_REGIONS);
	for (let i = 1; i <= activeRegions; i++) {
		const region = state.regions[String(i)];
		if (!region) {
			continue;
		}
		const rect = region.rect;
		if ((Number(rect.width) || 0) <= 0 || (Number(rect.height) || 0) <= 0) {
			region.rect = defaultRegionRect(state, i);
		}
	}
}

export function hideInactiveRectRegions(state, firstInactiveRegion) {
	for (let i = firstInactiveRegion; i <= MAX_REGIONS; i++) {
		const region = state.regions[String(i)];
		if (!region) {
			continue;
		}
		region.rect = { x: 0, y: 0, width: 0, height: 0 };
	}
}

export function activeRectEntries(state) {
	const entries = [];
	const activeRegions = clampInt(state.activeRegions ?? 1, 1, MAX_REGIONS);
	for (let i = 1; i <= activeRegions; i++) {
		entries.push([String(i), state.regions[String(i)]]);
	}
	return entries;
}

export function selectedRectRegion(node) {
	const state = ensureRectProperties(node);
	const widgetValue = node.widgets?.find((widget) => widget.name === "region")?.value;
	const activeRegions = clampInt(state.activeRegions ?? 1, 1, MAX_REGIONS);
	const id = String(clampInt(widgetValue ?? 1, 1, activeRegions));
	return state.regions[id];
}
