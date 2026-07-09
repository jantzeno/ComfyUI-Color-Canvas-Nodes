import {
	MAX_GRID_SIZE,
	MIN_GRID_SIZE,
	clamp,
	snap,
} from "./utils.js";
import {
	normalizeRectToCanvas,
	rectOverlapsActive,
} from "./state.js";

export const HANDLE_SIZE = 7;

export function canvasToNodeRect(layout, region) {
	if (!layout || !region?.rect) {
		return null;
	}
	return {
		x: layout.x + region.rect.x * layout.scale,
		y: layout.y + region.rect.y * layout.scale,
		width: region.rect.width * layout.scale,
		height: region.rect.height * layout.scale,
	};
}

export function pointToCanvas(layout, pos) {
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

export function hitHandle(rect, pos) {
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

export function hitRegion(layout, entries, pos) {
	for (const [id, region] of entries.slice().reverse()) {
		const rect = canvasToNodeRect(layout, region);
		if (!rect || rect.width <= 0 || rect.height <= 0) {
			continue;
		}
		if (pos[0] >= rect.x && pos[0] <= rect.x + rect.width && pos[1] >= rect.y && pos[1] <= rect.y + rect.height) {
			return id;
		}
	}
	return null;
}

export function drawHandles(ctx, rect) {
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

export function applyRectDrag(state, drag, canvasPoint) {
	const region = state.regions[drag.regionId];
	const rect = region.rect;
	const gridSize = clamp(state.canvas.gridSize, MIN_GRID_SIZE, MAX_GRID_SIZE);
	const dx = canvasPoint.x - drag.start.x;
	const dy = canvasPoint.y - drag.start.y;
	const original = drag.original;
	let x = original.x;
	let y = original.y;
	let width = original.width;
	let height = original.height;

	if (drag.action === "move") {
		x = clamp(snap(original.x + dx, gridSize), 0, state.canvas.width - original.width);
		y = clamp(snap(original.y + dy, gridSize), 0, state.canvas.height - original.height);
	} else {
		if (drag.action.includes("w")) {
			const right = original.x + original.width;
			x = clamp(snap(original.x + dx, gridSize), 0, right);
			width = right - x;
		}
		if (drag.action.includes("e")) {
			width = clamp(snap(original.width + dx, gridSize), 0, state.canvas.width - original.x);
		}
		if (drag.action.includes("n")) {
			const bottom = original.y + original.height;
			y = clamp(snap(original.y + dy, gridSize), 0, bottom);
			height = bottom - y;
		}
		if (drag.action.includes("s")) {
			height = clamp(snap(original.height + dy, gridSize), 0, state.canvas.height - original.y);
		}
	}

	const candidate = normalizeRectToCanvas(state, { x, y, width, height });
	if (rectOverlapsActive(state, drag.regionId, candidate)) {
		return;
	}

	rect.x = candidate.x;
	rect.y = candidate.y;
	rect.width = candidate.width;
	rect.height = candidate.height;
}
