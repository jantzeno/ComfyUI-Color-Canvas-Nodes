import { app } from "../../scripts/app.js";
import {
	MAX_REGIONS,
	addNumberWidget,
	addTextWidget,
	clampInt,
	getWidget,
	setDirty,
} from "./utils.js";
import { ensureRatioProperties } from "./state.js";

function activeRegionCount(node) {
	const widget = getWidget(node, "regions");
	return clampInt(widget?.value ?? 1, 1, MAX_REGIONS);
}

function removeRatioRowWidgets(node) {
	if (!node.widgets) {
		return;
	}
	for (const widget of node.widgets) {
		if (widget._regionalRatioWidget) {
			widget.onRemove?.();
		}
	}
	node.widgets = node.widgets.filter((widget) => !widget._regionalRatioWidget);
}

function setRegionRatio(node, regionId) {
	const state = ensureRatioProperties(node, activeRegionCount(node));
	const layout = getWidget(node, `region_${regionId}_layout`)?.value;
	const cells = getWidget(node, `region_${regionId}_cells`)?.value;
	const rotation = getWidget(node, `region_${regionId}_rotation`)?.value;
	state.regions[String(regionId)].ratio = {
		layout: String(layout || "1").trim() || "1",
		cells: String(cells || "1").trim() || "1",
		rotation: Number.isFinite(Number(rotation)) ? Math.round(Number(rotation)) : 0,
	};
	setDirty(node);
}

function addRatioRows(node) {
	removeRatioRowWidgets(node);
	const state = ensureRatioProperties(node, activeRegionCount(node));

	const count = activeRegionCount(node);
	for (let i = 1; i <= count; i++) {
		const parsed = state.regions[String(i)].ratio;

		const layout = addTextWidget(node, `region_${i}_layout`, parsed.layout, function (_, __, owner) {
			setRegionRatio(owner, i);
		});
		layout._regionalRatioWidget = true;

		const cells = addTextWidget(node, `region_${i}_cells`, parsed.cells, function (_, __, owner) {
			setRegionRatio(owner, i);
		});
		cells._regionalRatioWidget = true;

		const rotation = addNumberWidget(node, `region_${i}_rotation`, parsed.rotation, function (_, __, owner) {
			this.value = Math.round(Number(this.value) || 0);
			setRegionRatio(owner, i);
		}, { min: -360, max: 360, step: 10, precision: 0 });
		rotation._regionalRatioWidget = true;

		state.regions[String(i)].ratio = {
			layout: parsed.layout,
			cells: parsed.cells,
			rotation: parsed.rotation,
		};
	}

	const baseHeight = 155;
	node.size = [Math.max(node.size?.[0] || 0, 340), baseHeight + count * 72];
	setDirty(node);
}

app.registerExtension({
	name: "Comfy.RegionalColorRatio",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "RegionalColorRatio") {
			return;
		}

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			this.serialize_widgets = true;
			ensureRatioProperties(this, activeRegionCount(this));

			const regionCountWidget = getWidget(this, "regions");
			if (regionCountWidget) {
				const originalCallback = regionCountWidget.callback;
				regionCountWidget.callback = (value, canvas, owner, pos, event) => {
					originalCallback?.call(regionCountWidget, value, canvas, owner, pos, event);
					regionCountWidget.value = clampInt(value, 1, MAX_REGIONS);
					ensureRatioProperties(this, regionCountWidget.value);
					addRatioRows(this);
				};
			}

			addRatioRows(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			ensureRatioProperties(this, activeRegionCount(this));
			addRatioRows(this);
			return result;
		};
	},
});
