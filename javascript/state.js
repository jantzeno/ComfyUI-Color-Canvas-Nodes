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
	getDrawColor,
	nearestAllowed,
	snap,
} from "./utils.js";

export const REGIONAL_COLOR_VERSION = 1;
export const DEFAULT_WIDTH = 512;
export const DEFAULT_HEIGHT = 512;
export const DEFAULT_GRID_SIZE = 32;
export const DEFAULT_REGION_CELLS = 2;

export function normalizeCanvasDimension(value, fallback) {
	return clamp(snap(clamp(value ?? fallback, MIN_RESOLUTION, MAX_RESOLUTION), DIMENSION_STEP), MIN_RESOLUTION, MAX_RESOLUTION);
}

export function normalizeGridSize(value) {
	return nearestAllowed(clamp(value ?? DEFAULT_GRID_SIZE, MIN_GRID_SIZE, MAX_GRID_SIZE), GRID_SIZE_VALUES);
}

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
	state.selectedRegion = String(clampInt(state.selectedRegion ?? 1, 1, state.activeRegions));
	return state;
}

export function rectColor(id) {
	return getDrawColor(id * 199, "FF").slice(0, 7);
}

function rectIsVisible(rect) {
	return (Number(rect?.width) || 0) > 0 && (Number(rect?.height) || 0) > 0;
}

function rectsIntersect(first, second) {
	return !(
		first.x + first.width <= second.x ||
		second.x + second.width <= first.x ||
		first.y + first.height <= second.y ||
		second.y + second.height <= first.y
	);
}

function existingVisibleRects(state, excludedId) {
	const activeRegions = clampInt(state.activeRegions ?? 1, 1, MAX_REGIONS);
	const rects = [];
	for (let i = 1; i <= activeRegions; i++) {
		const id = String(i);
		if (id === String(excludedId)) {
			continue;
		}
		const rect = state.regions[id]?.rect;
		if (rectIsVisible(rect)) {
			rects.push(rect);
		}
	}
	return rects;
}

function firstFreeRect(state, width, height, existingRects) {
	const maxX = Math.max(0, state.canvas.width - width);
	const maxY = Math.max(0, state.canvas.height - height);
	for (let y = 0; y <= maxY; y += state.canvas.gridSize) {
		for (let x = 0; x <= maxX; x += state.canvas.gridSize) {
			const candidate = { x, y, width, height };
			if (!existingRects.some((rect) => rectsIntersect(candidate, rect))) {
				return candidate;
			}
		}
	}
	return null;
}

export function defaultRegionRect(state, id) {
	const width = Math.min(state.canvas.width, state.canvas.gridSize * DEFAULT_REGION_CELLS);
	const height = Math.min(state.canvas.height, state.canvas.gridSize * DEFAULT_REGION_CELLS);
	const maxX = Math.max(0, state.canvas.width - width);
	const maxY = Math.max(0, state.canvas.height - height);
	const existingRects = existingVisibleRects(state, id);
	const freeRect = firstFreeRect(state, width, height, existingRects);
	if (freeRect) {
		return freeRect;
	}

	if (existingRects.length) {
		const latest = existingRects[existingRects.length - 1];
		let x = latest.x + state.canvas.gridSize;
		let y = latest.y;
		if (x > maxX) {
			x = 0;
			y = latest.y + state.canvas.gridSize;
		}
		if (y > maxY) {
			y = 0;
		}
		return {
			x: Math.min(maxX, x),
			y: Math.min(maxY, y),
			width,
			height,
		};
	}

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
	state.canvas.width = normalizeCanvasDimension(state.canvas.width, DEFAULT_WIDTH);
	state.canvas.height = normalizeCanvasDimension(state.canvas.height, DEFAULT_HEIGHT);
	state.canvas.gridSize = normalizeGridSize(state.canvas.gridSize);
	state.selectedRegion = String(clampInt(state.selectedRegion ?? 1, 1, state.activeRegions));

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
	const activeRegions = clampInt(state.activeRegions ?? 1, 1, MAX_REGIONS);
	const id = String(clampInt(state.selectedRegion ?? 1, 1, activeRegions));
	state.selectedRegion = id;
	return state.regions[id];
}

export function selectRectRegion(node, regionId) {
	const state = ensureRectProperties(node);
	state.selectedRegion = String(clampInt(regionId, 1, state.activeRegions));
	return state.regions[state.selectedRegion];
}
