import { app } from "../../scripts/app.js";

const H3_RENDER_SUBGRAPH = "c53aef76-a816-4c89-9f7d-88cc7fe75be8";
const DEFAULT_PREVIEW_HEIGHT = 620;
const PREVIEW_WIDGET_NAME = "vhslatentpreview";

function isH3RenderNode(node) {
  return String(node?.type || node?.comfyClass || "") === H3_RENDER_SUBGRAPH
    || String(node?.title || "") === "H3 分段生成与保存";
}

function installPreviewSizeGuard(node) {
  if (!isH3RenderNode(node) || node.__cinePreviewSizeGuard) return;
  node.__cinePreviewSizeGuard = true;
  node.properties ??= {};

  // The DOM/VHS canvas below is the sole preview. Discard ComfyUI's parallel
  // node.imgs channel, which otherwise paints the same frame as a thin strip.
  try {
    Object.defineProperty(node, "imgs", {
      configurable: true,
      get: () => [],
      set: () => {},
    });
    Object.defineProperty(node, "preview", {
      configurable: true,
      get: () => null,
      set: () => {},
    });
  } catch {
    node.imgs = [];
    node.preview = null;
  }

  const configuredMinimum = Number(node.properties.cine_preview_min_height);
  const minimum = Number.isFinite(configuredMinimum) && configuredMinimum > 0
    ? configuredMinimum
    : DEFAULT_PREVIEW_HEIGHT;
  const savedHeight = Number(node.properties.cine_preview_height);
  let desiredHeight = Math.max(
    minimum,
    Number.isFinite(savedHeight) ? savedHeight : 0,
    Number(node.size?.[1]) || 0,
  );

  const originalSetSize = node.setSize?.bind(node);
  if (originalSetSize) {
    node.setSize = (size) => {
      const requested = Array.isArray(size) ? [...size] : [...(node.size || [360, desiredHeight])];
      const requestedHeight = Number(requested[1]);
      if (Number.isFinite(requestedHeight) && requestedHeight >= minimum) {
        desiredHeight = requestedHeight;
      }
      requested[1] = Math.max(minimum, desiredHeight);
      node.properties.cine_preview_height = requested[1];
      return originalSetSize(requested);
    };
  }

  const restore = () => {
    const width = Number(node.size?.[0]) || 360;
    node.setSize?.([width, desiredHeight]);
    app.graph?.setDirtyCanvas?.(true, true);
  };
  restore();
  requestAnimationFrame(() => requestAnimationFrame(restore));
  for (const delay of [50, 250, 1000, 2500]) setTimeout(restore, delay);
}

function positionPreviewHost(host, previewHeight) {
  const transform = String(host.style.transform || "");
  const scaleMatch = transform.match(/scale\(([-+\d.]+)\)/);
  const scale = Math.max(0.05, Number(scaleMatch?.[1]) || 1);
  const currentTop = Number.parseFloat(host.style.top) || 0;
  const appliedTop = Number(host.dataset.cineAppliedTop);
  let baseTop = Number(host.dataset.cineBaseTop);
  if (!Number.isFinite(baseTop) || !Number.isFinite(appliedTop) || Math.abs(currentTop - appliedTop) > 1) {
    baseTop = currentTop;
    host.dataset.cineBaseTop = String(baseTop);
  }
  const targetGraphY = DEFAULT_PREVIEW_HEIGHT - 118 - previewHeight - 8;
  const targetTop = baseTop + (targetGraphY - 30) * scale;
  host.style.setProperty("top", `${targetTop}px`, "important");
  host.dataset.cineAppliedTop = String(targetTop);
}

function fitLatestPreview(node) {
  if (!isH3RenderNode(node)) return false;
  // ComfyUI also paints execution frames through node.imgs. VHS already owns
  // the canonical live preview, so leaving node.imgs enabled creates a second
  // narrow strip above it.
  if (Array.isArray(node.imgs) && node.imgs.length) node.imgs = [];
  if (node.preview) node.preview = null;
  const widgets = Array.isArray(node.widgets) ? node.widgets : [];
  const previews = widgets.filter((widget) => widget?.name === PREVIEW_WIDGET_NAME);
  if (!previews.length) return false;

  const latest = previews.at(-1);
  for (const stale of previews.slice(0, -1)) {
    const canvas = stale?.element;
    const host = canvas?.closest?.(".dom-widget") || canvas?.parentElement;
    if (canvas) canvas.style.setProperty("display", "none", "important");
    if (host) host.style.setProperty("display", "none", "important");
    stale.computeSize = (width) => [width, 0];
    stale.computedHeight = 0;
  }

  node.widgets = [
    ...widgets.filter((widget) => widget?.name !== PREVIEW_WIDGET_NAME),
    latest,
  ];

  const canvas = latest?.element;
  const host = canvas?.closest?.(".dom-widget") || canvas?.parentElement;
  if (!canvas || !host) return false;
  const ratio = Number(latest.aspectRatio)
    || (Number(canvas.width) > 0 && Number(canvas.height) > 0
      ? Number(canvas.width) / Number(canvas.height)
      : 16 / 9);
  const nodeWidth = Math.max(240, Number(node.size?.[0]) || 360);
  const availableWidth = Math.max(180, nodeWidth - 24);
  const previewHeight = Math.max(120, Math.min(360, Math.round(availableWidth / ratio)));

  canvas.dataset.cineLatentPreview = "true";
  canvas.style.setProperty("display", "block", "important");
  canvas.style.setProperty("width", `${availableWidth}px`, "important");
  canvas.style.setProperty("height", `${previewHeight}px`, "important");
  canvas.style.setProperty("object-fit", "contain", "important");
  canvas.style.setProperty("background", "#090b0f", "important");
  host.style.setProperty("display", "flex", "important");
  host.style.setProperty("align-items", "center", "important");
  host.style.setProperty("justify-content", "center", "important");
  host.style.setProperty("height", `${previewHeight + 8}px`, "important");
  host.style.setProperty("min-height", `${previewHeight + 8}px`, "important");
  host.style.setProperty("max-height", `${previewHeight + 8}px`, "important");
  host.style.setProperty("overflow", "hidden", "important");
  positionPreviewHost(host, previewHeight);
  latest.computeSize = (width) => [width, previewHeight + 8];
  latest.computedHeight = previewHeight + 8;

  node.graph?.setDirtyCanvas?.(true, true);
  return true;
}

function fitAllH3Previews() {
  let foundH3 = false;
  for (const node of app.graph?._nodes || []) {
    // Subgraph nodes may receive their final title/type after nodeCreated.
    // Install the native-preview suppression as soon as recognition becomes
    // possible, rather than relying on creation-time metadata.
    installPreviewSizeGuard(node);
    if (!isH3RenderNode(node)) continue;
    foundH3 = true;
    try {
      node.imgs = [];
      node.preview = null;
    } catch {}
  }
  if (foundH3) fitOrphanPreviewCanvases();
}

function fitOrphanPreviewCanvases() {
  const candidates = [];
  for (const canvas of document.querySelectorAll(".dom-widget canvas.h-full.w-full")) {
    const host = canvas.closest?.(".dom-widget") || canvas.parentElement;
    if (!host) continue;
    const width = Number.parseFloat(host.style.width) || host.getBoundingClientRect?.().width || 0;
    const height = Number.parseFloat(host.style.height) || host.getBoundingClientRect?.().height || 0;
    if (width < 240 || height > 64 || Number(canvas.width) <= 0 || Number(canvas.height) <= 0) continue;
    candidates.push({ canvas, host, width });
  }
  let canonical = globalThis.__cineH3CanonicalPreview;
  if (!canonical?.canvas?.isConnected || !canonical?.host?.isConnected) canonical = null;
  if (!canonical && !candidates.length) return;

  if (!canonical) {
    canonical = candidates.at(-1);
    globalThis.__cineH3CanonicalPreview = canonical;
  }

  // Never swap the visible DOM element again. VHS may create a temporary
  // 30px canvas for every frame; copy its pixels into the stable canonical
  // canvas, then hide the temporary host before the browser can paint it.
  for (const incoming of candidates) {
    if (incoming.canvas === canonical.canvas) continue;
    incoming.host.style.setProperty("display", "none", "important");
    incoming.canvas.style.setProperty("display", "none", "important");
    try {
      const sourceWidth = Number(incoming.canvas.width);
      const sourceHeight = Number(incoming.canvas.height);
      if (sourceWidth > 0 && sourceHeight > 0) {
        if (canonical.canvas.width !== sourceWidth) canonical.canvas.width = sourceWidth;
        if (canonical.canvas.height !== sourceHeight) canonical.canvas.height = sourceHeight;
        canonical.canvas.getContext("2d")?.drawImage(incoming.canvas, 0, 0, sourceWidth, sourceHeight);
      }
    } catch {}
  }
  const latest = canonical;
    const ratio = Number(latest.canvas.width) / Number(latest.canvas.height) || 16 / 9;
    const previewHeight = Math.max(120, Math.min(360, Math.round(latest.width / ratio)));
    // The original widget anchor is directly below the title. Move the live
    // preview into the unused body area immediately above the five bottom
    // parameter rows. Values are graph-space pixels and therefore scale with
    // the canvas zoom.
    latest.host.dataset.cineH3PreviewHost = "true";
    latest.canvas.dataset.cineLatentPreview = "true";
    latest.host.style.setProperty("display", "flex", "important");
    latest.host.style.setProperty("height", `${previewHeight}px`, "important");
    latest.host.style.setProperty("min-height", `${previewHeight}px`, "important");
    latest.host.style.setProperty("max-height", `${previewHeight}px`, "important");
    latest.host.style.setProperty("align-items", "center", "important");
    latest.host.style.setProperty("justify-content", "center", "important");
    latest.host.style.setProperty("overflow", "hidden", "important");
    positionPreviewHost(latest.host, previewHeight);
    latest.canvas.style.setProperty("display", "block", "important");
    latest.canvas.style.setProperty("width", "100%", "important");
    latest.canvas.style.setProperty("height", `${previewHeight}px`, "important");
    latest.canvas.style.setProperty("object-fit", "contain", "important");
    latest.canvas.style.setProperty("background", "#090b0f", "important");
}

function startPreviewGuard() {
  if (globalThis.__cineH3PreviewGuardTimer) clearInterval(globalThis.__cineH3PreviewGuardTimer);
  globalThis.__cineH3PreviewGuardTimer = setInterval(fitAllH3Previews, 250);
  globalThis.__cineH3PreviewMutationObserver?.disconnect?.();
  let scheduled = false;
  globalThis.__cineH3PreviewMutationObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    // Mutation callbacks run before paint, so temporary VHS canvases never
    // become visible even when this module loads after ComfyUI's setup pass.
    fitAllH3Previews();
    scheduled = false;
  });
  globalThis.__cineH3PreviewMutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  fitAllH3Previews();
}

// Some ComfyUI builds discover custom extension modules after their setup
// lifecycle has already completed. Start immediately as the primary path.
startPreviewGuard();

app.registerExtension({
  name: "ComfyUI.CineTimeline.H3PreviewSizeGuard.V118",
  async nodeCreated(node) {
    installPreviewSizeGuard(node);
    fitLatestPreview(node);
  },
  setup() {
    startPreviewGuard();
  },
});
