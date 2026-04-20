import type { UiHierarchy } from "./types.js";

function parseBoolean(value: string | undefined): boolean {
  return value === "true";
}

function parseBounds(bounds: string | undefined): UiHierarchy["frame"] {
  if (!bounds) {
    return undefined;
  }
  const match = bounds.match(/\[([\d.]+),([\d.]+)\]\[([\d.]+),([\d.]+)\]/);
  if (!match) {
    return undefined;
  }
  const x1 = parseFloat(match[1]);
  const y1 = parseFloat(match[2]);
  const x2 = parseFloat(match[3]);
  const y2 = parseFloat(match[4]);
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function parseNodeAttributes(rawTag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([\w-]+)="([^"]*)"/g;
  let match = attributeRegex.exec(rawTag);
  while (match !== null) {
    attributes[match[1]] = match[2];
    match = attributeRegex.exec(rawTag);
  }
  return attributes;
}

function parseAndroidXmlTree(xml: string): UiHierarchy | null {
  const tagRegex = /<\/?node\b[^>]*>/g;
  const stack: UiHierarchy[] = [];
  let root: UiHierarchy | null = null;
  let tagMatch = tagRegex.exec(xml);

  while (tagMatch !== null) {
    const tag = tagMatch[0];
    const isClosing = tag.startsWith("</");
    if (isClosing) {
      stack.pop();
      tagMatch = tagRegex.exec(xml);
      continue;
    }

    const attrs = parseNodeAttributes(tag);
    const node: UiHierarchy = {
      index: attrs.index !== undefined ? Number(attrs.index) : undefined,
      text: attrs.text || undefined,
      resourceId: attrs["resource-id"] || undefined,
      className: attrs.class || undefined,
      packageName: attrs.package || undefined,
      contentDesc: attrs["content-desc"] || undefined,
      clickable: parseBoolean(attrs.clickable),
      enabled: attrs.enabled === undefined ? true : parseBoolean(attrs.enabled),
      scrollable: parseBoolean(attrs.scrollable),
      bounds: attrs.bounds || undefined,
      frame: parseBounds(attrs.bounds),
      children: [],
      elementType: attrs.class || undefined,
      label: attrs["content-desc"] || attrs.text || undefined,
      visibleTexts: attrs.text ? [attrs.text] : undefined,
    };

    const parent = stack[stack.length - 1];
    if (parent) {
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(node);
    } else {
      root = node;
    }

    const selfClosing = tag.endsWith("/>");
    if (!selfClosing) {
      stack.push(node);
    }
    tagMatch = tagRegex.exec(xml);
  }

  return root;
}

function normalizeToUiHierarchy(node: Record<string, unknown>): UiHierarchy {
  const children = Array.isArray(node.children)
    ? node.children
        .filter((c) => typeof c === "object" && c !== null)
        .map((c) => normalizeToUiHierarchy(c as Record<string, unknown>))
    : [];

  let frame: UiHierarchy["frame"];
  if (typeof node.bounds === "string") {
    frame = parseBounds(node.bounds);
  }

  if (!frame && typeof node.AXFrame === "string") {
    const match = node.AXFrame.match(/\{\{([\d.]+),([\d.]+)\},\{([\d.]+),([\d.]+)\}\}/);
    if (match) {
      frame = {
        x: parseFloat(match[1]),
        y: parseFloat(match[2]),
        width: parseFloat(match[3]),
        height: parseFloat(match[4]),
      };
    }
  }

  if (!frame && typeof node.frame === "object" && node.frame !== null) {
    const nested = node.frame as Record<string, unknown>;
    frame = {
      x: typeof nested.x === "number" ? nested.x : 0,
      y: typeof nested.y === "number" ? nested.y : 0,
      width: typeof nested.width === "number" ? nested.width : 0,
      height: typeof nested.height === "number" ? nested.height : 0,
    };
  }

  const className =
    typeof node.className === "string" ? node.className :
    typeof node.type === "string" ? node.type :
    typeof node.role === "string" ? node.role :
    undefined;

  const text =
    typeof node.text === "string" ? node.text :
    typeof node.AXLabel === "string" ? node.AXLabel :
    typeof node.AXValue === "string" ? node.AXValue :
    undefined;

  const contentDesc =
    typeof node.contentDesc === "string" ? node.contentDesc :
    typeof node.AXUniqueId === "string" ? node.AXUniqueId :
    undefined;

  const role =
    typeof node.accessibilityRole === "string" ? node.accessibilityRole :
    typeof node.role === "string" ? node.role :
    "";

  const classNameLower = (className ?? "").toLowerCase();
  const roleLower = role.toLowerCase();
  const isButtonLike =
    classNameLower.includes("button")
    || classNameLower.includes("link")
    || classNameLower.includes("cell")
    || roleLower.includes("button")
    || roleLower.includes("link");

  const clickable =
    node.clickable === true
    || isButtonLike
    || classNameLower.includes("textfield")
    || roleLower.includes("text field");

  return {
    index: typeof node.index === "number" ? node.index : undefined,
    depth: typeof node.depth === "number" ? node.depth : undefined,
    text,
    resourceId: typeof node.resourceId === "string" ? node.resourceId : undefined,
    className,
    packageName: typeof node.packageName === "string" ? node.packageName : undefined,
    contentDesc,
    clickable,
    enabled: node.enabled !== false,
    scrollable: node.scrollable === true,
    bounds: typeof node.bounds === "string" ? node.bounds : undefined,
    frame,
    children,
    accessibilityLabel:
      typeof node.accessibilityLabel === "string" ? node.accessibilityLabel :
      typeof node.AXLabel === "string" ? node.AXLabel :
      undefined,
    accessibilityRole:
      typeof node.accessibilityRole === "string" ? node.accessibilityRole :
      typeof node.role === "string" ? node.role :
      undefined,
    visibleTexts:
      typeof node.text === "string" ? [node.text] :
      Array.isArray(node.visibleTexts) ? node.visibleTexts as string[] :
      undefined,
    AXUniqueId: typeof node.AXUniqueId === "string" ? node.AXUniqueId : undefined,
    AXValue: typeof node.AXValue === "string" ? node.AXValue : undefined,
    elementType: typeof node.elementType === "string" ? node.elementType : className,
    label: typeof node.label === "string" ? node.label : contentDesc ?? text,
  };
}

function normalizeParsedContent(content: unknown): UiHierarchy {
  if (Array.isArray(content)) {
    return {
      className: "Root",
      clickable: false,
      enabled: true,
      scrollable: false,
      children: content
        .filter((c) => typeof c === "object" && c !== null)
        .map((c) => normalizeToUiHierarchy(c as Record<string, unknown>)),
    };
  }

  if (typeof content === "object" && content !== null) {
    return normalizeToUiHierarchy(content as Record<string, unknown>);
  }

  return {
    className: "Root",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [],
  };
}

export function parseUiTreeFromInspectData(
  data: Record<string, unknown>,
  options: { fallbackToDataRoot: boolean },
): UiHierarchy | null {
  if (typeof data.content === "string") {
    const content = data.content.trim();
    if (content.startsWith("<?xml") || content.startsWith("<hierarchy")) {
      const xmlTree = parseAndroidXmlTree(content);
      if (xmlTree) {
        return xmlTree;
      }
      return options.fallbackToDataRoot
        ? {
            className: "Root",
            clickable: false,
            enabled: true,
            scrollable: false,
            children: [],
          }
        : null;
    }
    try {
      const parsed = JSON.parse(content);
      return normalizeParsedContent(parsed);
    } catch {
      return options.fallbackToDataRoot
        ? {
            className: "Root",
            clickable: false,
            enabled: true,
            scrollable: false,
            children: [],
          }
        : null;
    }
  }

  if (data.content !== undefined && data.content !== null) {
    return normalizeParsedContent(data.content);
  }

  return options.fallbackToDataRoot
    ? {
        className: "Root",
        clickable: false,
        enabled: true,
        scrollable: false,
        children: [],
        ...data,
      } as UiHierarchy
    : null;
}
