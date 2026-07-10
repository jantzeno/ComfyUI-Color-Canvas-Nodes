import { app } from "../../scripts/app.js";

const PROPERTY_KEY = "regionalColorSelector";
const DISPLAY_HEIGHT = 38;
const MINIMUM_WIDTH = 220;
const VALID_HEX = /^#[0-9a-f]{6}$/i;

function firstDisplayValue(value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            const candidate = firstDisplayValue(item);
            if (candidate !== undefined) {
                return candidate;
            }
        }
        return undefined;
    }

    return typeof value === "string" ? value : undefined;
}

function legacyDisplayValue(widgetsValues) {
    const candidate = firstDisplayValue(widgetsValues);
    return candidate === "error" || VALID_HEX.test(candidate ?? "")
        ? candidate
        : undefined;
}

function resizeForDisplay(node) {
    requestAnimationFrame(() => {
        const size = node.computeSize();
        size[0] = Math.max(size[0], node.size?.[0] ?? 0, MINIMUM_WIDTH);
        size[1] = Math.max(size[1], node.size?.[1] ?? 0);
        node.setSize?.(size);
        app.graph.setDirtyCanvas(true, false);
    });
}

function updateDisplay(node, value, persist = true) {
    const display = ensureDisplay(node);
    const color = typeof value === "string" ? value : "";
    const isValid = VALID_HEX.test(color);

    display.input.value = color;
    display.input.placeholder = "No color selected";
    display.swatch.style.backgroundColor = isValid
        ? color
        : "rgba(127, 127, 127, 0.25)";
    display.swatch.style.backgroundImage = isValid
        ? "none"
        : "linear-gradient(135deg, #555 25%, #333 25%, #333 50%, #555 50%, #555 75%, #333 75%)";
    display.swatch.style.backgroundSize = isValid ? "auto" : "8px 8px";
    display.swatch.title = isValid ? color : "No valid color selected";

    if (persist) {
        node.properties ??= {};
        node.properties[PROPERTY_KEY] = { selectedColor: color };
    }

    resizeForDisplay(node);
}

function ensureDisplay(node) {
    if (node._regionalColorSelectorDisplay) {
        return node._regionalColorSelectorDisplay;
    }

    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "8px";
    container.style.height = `${DISPLAY_HEIGHT}px`;
    container.style.padding = "4px 8px";
    container.style.boxSizing = "border-box";

    const swatch = document.createElement("div");
    swatch.setAttribute("aria-label", "Selected color swatch");
    swatch.style.width = "28px";
    swatch.style.height = "28px";
    swatch.style.flex = "0 0 28px";
    swatch.style.border = "1px solid rgba(255, 255, 255, 0.25)";
    swatch.style.borderRadius = "4px";
    swatch.style.boxSizing = "border-box";

    const input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.setAttribute("aria-label", "Selected color hex value");
    input.style.flex = "1 1 auto";
    input.style.minWidth = "0";
    input.style.height = "28px";
    input.style.padding = "4px 8px";
    input.style.boxSizing = "border-box";
    input.style.color = "inherit";
    input.style.background = "rgba(0, 0, 0, 0.2)";
    input.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    input.style.borderRadius = "4px";

    container.append(swatch, input);

    const widget = node.addDOMWidget(
        "selected_color",
        "regionalColorDisplay",
        container,
        {
            serialize: false,
            getMinHeight: () => DISPLAY_HEIGHT,
            getMaxHeight: () => DISPLAY_HEIGHT,
        },
    );

    node._regionalColorSelectorDisplay = { widget, container, swatch, input };
    updateDisplay(node, "", false);
    return node._regionalColorSelectorDisplay;
}

function valueFromExecution(message) {
    if (typeof message?.selectedColor === "string") {
        return message.selectedColor;
    }

    return firstDisplayValue(message?.text);
}

app.registerExtension({
    name: "Comfy.RegionalColorSelector",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "RegionalColorSelector") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            ensureDisplay(this);
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            updateDisplay(this, valueFromExecution(message));
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            ensureDisplay(this);

            const saved = this.properties?.[PROPERTY_KEY]?.selectedColor;
            const restored = typeof saved === "string"
                ? saved
                : legacyDisplayValue(this.widgets_values);

            updateDisplay(this, restored, false);
        };
    },
});
