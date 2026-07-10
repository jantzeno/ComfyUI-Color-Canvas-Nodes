import assert from "node:assert/strict";
import test from "node:test";

import {
	ensureRectProperties,
	ensureRegionalColor,
	setRegionalColorState,
} from "../javascript/state.js";

function nodeWithState(regionalColor) {
	return {
		properties: { regionalColor },
		setProperty(name, value) {
			this.properties[name] = value;
		},
	};
}

test("saved key arrays are replaced with serializable canvas state", () => {
	const node = nodeWithState(["version", "activeRegions", "selectedRegion", "canvas", "regions"]);

	const state = ensureRectProperties(node);
	const saved = JSON.parse(JSON.stringify(node.properties));

	assert.equal(Array.isArray(state), false);
	assert.equal(saved.regionalColor.version, 2);
	assert.deepEqual(saved.regionalColor.canvas, { width: 512, height: 512, gridSize: 32 });
	assert.deepEqual(saved.regionalColor.regions["1"].rect, { x: 0, y: 0, width: 64, height: 64 });
});

test("in-memory fields attached to a corrupted array are recovered", () => {
	const corrupted = ["version", "activeRegions", "selectedRegion", "canvas", "regions"];
	corrupted.activeRegions = 2;
	corrupted.selectedRegion = "2";
	corrupted.canvas = { width: 640, height: 512, gridSize: 32 };
	corrupted.regions = {
		"1": { rect: { x: 0, y: 0, width: 320, height: 512 }, color: "#112233", enabled: true },
		"2": { rect: { x: 320, y: 0, width: 320, height: 512 }, color: "#445566", enabled: true },
	};
	const node = nodeWithState(corrupted);

	const state = ensureRegionalColor(node);

	assert.equal(Array.isArray(state), false);
	assert.equal(state.activeRegions, 2);
	assert.equal(state.regions["2"].rect.x, 320);
});

test("execution state accepts singleton records and rejects key arrays", () => {
	const original = {
		version: 2,
		activeRegions: 1,
		selectedRegion: "1",
		canvas: { width: 512, height: 512, gridSize: 32 },
		regions: {
			"1": { rect: { x: 64, y: 64, width: 256, height: 320 }, color: "#112233", enabled: true },
		},
	};
	const node = nodeWithState(original);
	const returned = structuredClone(original);
	returned.regions["1"].rect.width = 320;

	assert.equal(setRegionalColorState(node, [returned]), true);
	assert.equal(node.properties.regionalColor.regions["1"].rect.width, 320);
	assert.equal(setRegionalColorState(node, ["version", "canvas", "regions"]), false);
	assert.equal(node.properties.regionalColor.regions["1"].rect.width, 320);
});
