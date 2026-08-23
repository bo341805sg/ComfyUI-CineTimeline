import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { languageSelect, localizeDom, onLocaleChange, tr } from "./cine_i18n_099.mjs?v=5";

console.info("[CineTimeline] v0.11.0 dialogue validation routing loaded");

const TIMELINE_LAYOUT_VERSION = 65;
const TIMELINE_SIZE_LAYOUT_VERSION = 7;
const TIMELINE_DEFAULT_HEIGHT = 920;
const TIMELINE_MIN_NODE_HEIGHT = 720;
const TIMELINE_MIN_NODE_WIDTH = 760;
const TIMELINE_MAX_NODE_WIDTH = 1600;
const TIMELINE_MAX_NODE_HEIGHT = 1800;
const CINE_BUTTON_ACTIONS = globalThis.__cineTimelineButtonActions ||= new Map();
let cineButtonActionSequence = Number(globalThis.__cineTimelineButtonActionSequence || 0);
const TIMELINE_MIN_HEIGHT = 420;
const FIXED_FPS = 24;
const DEFAULT_SEGMENT_SECONDS = 5.0;
const MIN_SEGMENT_SECONDS = 5.0;
const MAX_SEGMENT_SECONDS = 15.0;
const EMPTY_TIMELINE_STATE = JSON.stringify({
  fps: 24, total_frames: 120, global_prompt: "", negative_prompt: "",
  shots: [{
    shot_id: "SEGMENT_001", start_frame: 0, end_frame: 120,
    local_prompt: "", camera: "", transition: "cut",
    metadata: { duration_seconds: 5, render: { status: "empty", active_version: "", versions: [] } },
  }],
  references: [], background_music: [], audio: [], subtitles: [], metadata: {},
});

function adaptiveTimelineDefaultWidth() {
  const viewport = num(globalThis.innerWidth, 1600);
  return Math.round(clamp(viewport * 0.48, 760, 1100));
}

const MEDIA_TYPES = ["image", "video", "audio"];
const MEDIA_LABELS = { image: "图片", video: "视频", audio: "音频" };
const MEDIA_CODES = { image: "I", video: "V", audio: "A" };
const MEDIA_LIMITS = { image: 9, video: 3, audio: 3, total: 12 };
const MEDIA_ACCEPTS = {
  image: "image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif",
  video: "video/*,.mp4,.mov,.mkv,.webm,.avi",
  audio: "audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg",
};
const REFERENCE_LABELS = {
  character: "人物",
  costume: "服装",
  scene: "场景",
  prop: "道具",
  pose: "姿态",
  storyboard: "故事板",
  first_frame: "首帧",
  last_frame: "尾帧",
  style: "风格",
  motion: "运动",
  video: "视频",
  audio: "声音参考",
};
const REFERENCE_TYPES_BY_MEDIA = {
  image: ["character", "costume", "scene", "prop", "pose", "storyboard", "first_frame", "last_frame", "style"],
  video: ["motion", "video"],
  audio: ["audio"],
};
const RENDER_LABELS = { empty: "未生成", generated: "已生成", approved: "已确认", redo: "待重做" };
const RENDER_COLORS = { empty: "#526071", generated: "#3c8ed9", approved: "#32a06a", redo: "#c98632" };

function activeCineTimelineEditor() {
  return (app.graph?._nodes || [])
    .map((node) => node?.cineTimelineEditor)
    .find((editor) => editor?.root?.isConnected) || null;
}

function handleCineTimelineCtrlEnter(event) {
  if (event.key !== "Enter" || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.repeat) return;
  if (event.target?.dataset?.cinePlannerStory === "true") return;
  const editor = activeCineTimelineEditor();
  if (!editor) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  Promise.resolve(editor.queueAssembly()).catch((error) => {
    editor.stopAutoAssembly?.(`Ctrl+Enter 执行失败：${error?.message || error}`);
  });
}

if (window.__cineTimelineCtrlEnterHandler) {
  window.removeEventListener("keydown", window.__cineTimelineCtrlEnterHandler, true);
}
window.__cineTimelineCtrlEnterHandler = handleCineTimelineCtrlEnter;
window.addEventListener("keydown", handleCineTimelineCtrlEnter, true);

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = tr(text);
  return node;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundTenth(value) {
  return Math.round(num(value) * 10) / 10;
}

function secondsToFrames(seconds) {
  return Math.max(1, Math.round(roundTenth(seconds) * FIXED_FPS));
}

function framesToSeconds(frames) {
  return roundTenth(num(frames) / FIXED_FPS);
}

function upstreamModelProfile(node) {
  const input = node.inputs?.find((item) => item.name === "model");
  if (input?.link == null) return "";
  const link = app.graph?.links?.[input.link] || app.graph?.links?.get?.(input.link);
  const origin = link ? app.graph?.getNodeById?.(link.origin_id) : null;
  return String(origin?.widgets?.find((widget) => widget.name === "model_profile")?.value || "");
}

function graphLink(linkId) {
  return app.graph?.links?.[linkId] || app.graph?.links?.get?.(linkId) || null;
}

function graphNode(nodeId) {
  if (nodeId == null) return null;
  return app.graph?.getNodeById?.(nodeId) || app.graph?.getNodeById?.(num(nodeId, -1)) || null;
}

function findUpstreamTimelineNode(startNode) {
  const queue = [startNode];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    const className = current.comfyClass || current.type;
    if (current !== startNode && ["CineTimelinePlan", "CineTimelineStudio", "CineTimelineEditor"].includes(className)) {
      return current;
    }
    for (const input of current.inputs || []) {
      if (input.link == null) continue;
      const link = graphLink(input.link);
      const origin = graphNode(link?.origin_id);
      if (origin) queue.push(origin);
    }
  }
  return null;
}

function savedVideoFromOutput(output) {
  const entries = [...(Array.isArray(output?.images) ? output.images : []), ...(Array.isArray(output?.videos) ? output.videos : [])];
  return entries.find((item) => {
    const filename = String(item?.filename || item?.name || "");
    return /\.(mp4|mov|mkv|webm|avi)$/i.test(filename);
  }) || null;
}

function historyPromptGraph(entry) {
  const prompt = entry?.prompt;
  const candidates = Array.isArray(prompt)
    ? [prompt[2], prompt[1], prompt[0]]
    : [prompt?.prompt, prompt, entry?.prompt_api, entry?.workflow_api];
  return candidates.find((candidate) => (
    candidate && typeof candidate === "object" && !Array.isArray(candidate) &&
    Object.values(candidate).some((node) => node && typeof node === "object" && typeof node.class_type === "string")
  )) || null;
}

function renderContextFromHistoryEntry(entry) {
  const graph = historyPromptGraph(entry);
  if (!graph) return null;
  let manifest = null;
  for (const output of Object.values(entry?.outputs || {})) {
    manifest ||= segmentManifestFromOutput(output);
  }
  for (const node of Object.values(graph)) {
    if (node?.class_type !== "CineTimelinePlan") continue;
    const directTargetId = String(node?.inputs?.render_target_shot_id || "").trim();
    const directRunId = String(node?.inputs?.render_run_id || "").trim();
    if (directTargetId) return { targetId: directTargetId, runId: directRunId, manifest };
    const raw = node?.inputs?.timeline_json;
    try {
      const plan = typeof raw === "string" ? JSON.parse(raw) : raw;
      const targetId = String(plan?.metadata?.render_target_shot_id || "").trim();
      const runId = String(plan?.metadata?.render_run_id || "").trim();
      if (targetId) return { targetId, runId, manifest };
    } catch (error) {
      console.warn("[CineTimeline] queued timeline JSON could not be parsed", error);
    }
  }
  return null;
}

async function immutableRenderContext(promptId) {
  const id = String(promptId || "").trim();
  if (!id) return null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await api.fetchApi(`/history/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        const entry = payload?.[id] || Object.values(payload || {})[0];
        const context = renderContextFromHistoryEntry(entry);
        if (context?.targetId) return context;
      }
    } catch (error) {
      if (attempt === 29) console.warn("[CineTimeline] failed to resolve queued segment target", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

function segmentManifestFromOutput(output) {
  const candidates = Array.isArray(output?.text) ? output.text : [];
  for (const raw of candidates) {
    try {
      const value = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (value?.schema === "cine_segment_manifest") return value;
    } catch {}
  }
  return null;
}

async function handleSavedTimelineVideo({ detail }) {
  const saved = savedVideoFromOutput(detail?.output);
  if (!saved) return;
  const promptId = detail?.prompt_id;
  const renderContext = await immutableRenderContext(promptId);
  const saveNode = graphNode(detail?.display_node) || graphNode(detail?.node);
  const className = saveNode?.comfyClass || saveNode?.type || "";
  const timelineNode = saveNode ? findUpstreamTimelineNode(saveNode) : null;
  const editor = timelineNode?.cineTimelineEditor || activeCineTimelineEditor();
  if (renderContext?.targetId) {
    let normalizedSaved = saved;
    const asset = editor?.savedAsset?.(saved);
    // The normalized save node already performs loudness correction in the
    // backend. Keep this request only as a compatibility fallback for older
    // workflows that still use ComfyUI's native SaveVideo node.
    if (asset?.asset_id && className !== "CineSaveNormalizedVideo") {
      const response = await api.fetchApi("/cine_timeline/normalize_audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: asset.asset_id }),
      });
      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); }
      catch { result = { ok: false, error: raw || response.statusText }; }
      if (!response.ok || !result?.ok) {
        editor.transientMessage = `片段已生成，但声音响度归一化失败：${result?.error || response.statusText}`;
        editor.render();
        return;
      }
      normalizedSaved = result?.saved || saved;
    }
    const manifest = segmentManifestFromOutput(detail?.output) || renderContext?.manifest;
    editor?.registerSegmentVideo?.(normalizedSaved, promptId, renderContext, manifest);
    return;
  }
  if (!["CineSaveSegmentVideo", "CineSaveCompleteVideo"].includes(className)) return;
  if (className === "CineSaveSegmentVideo") {
    const manifest = segmentManifestFromOutput(detail?.output) || renderContext?.manifest;
    editor?.registerSegmentVideo?.(saved, promptId, renderContext, manifest);
  } else {
    editor?.registerAssembledVideo?.(saved, detail?.prompt_id);
  }
}

function handleTimelineExecutionFailure({ detail }) {
  const reason = String(detail?.exception_message || detail?.message || detail?.error || "执行中断");
  for (const node of app.graph?._nodes || []) {
    node?.cineTimelineEditor?.handleExecutionFailure?.(reason);
  }
}

function removeTimelineWidgets(node) {
  if (!Array.isArray(node.widgets)) return;
  node.cineTimelineEditor?.hideReferencePreview?.();
  const isTimelineWidget = (widget) => (
    widget?.name === "cine_timeline" ||
    widget?.type === "CineTimelineWidget" ||
    [widget?.element, widget?.inputEl, widget?.domElement, widget?._element]
      .some((element) => element?.matches?.(".cine-timeline-root") || element?.querySelector?.(".cine-timeline-root"))
  );
  const removed = node.widgets.filter(isTimelineWidget);
  for (const widget of removed) {
    try { widget.onRemove?.(); } catch {}
    for (const element of [widget.element, widget.inputEl, widget.domElement, widget._element]) {
      try { element?.remove?.(); } catch {}
    }
  }
  node.widgets = node.widgets.filter((widget) => !isTimelineWidget(widget));
  node.cineTimelineEditor?.root?.remove?.();
}

function exposeNodeResizeGutter(root) {
  requestAnimationFrame(() => {
    const host = root.parentElement;
    if (host?.classList?.contains("dom-widget")) host.style.pointerEvents = "none";
    root.style.pointerEvents = "auto";
    root.style.width = "calc(var(--cine-timeline-host-width, 100%) - 16px)";
    root.style.height = "calc(100% - 16px)";
  });
}

function timelinePanelHostInsets(node, root) {
  const host = root.parentElement;
  const current = node.size || [0, 0];
  if (!host) return { width: 20, height: 86 };
  const width = Math.max(0, num(current[0]) - host.clientWidth);
  const height = Math.max(0, num(current[1]) - host.clientHeight);
  return {
    width: width <= 120 ? width : 20,
    height: height <= 220 ? height : 86,
  };
}

function installTimelineResponsiveSizing(node, root, insets) {
  const original = node._cineTimelineOriginalResize ?? node.onResize;
  node._cineTimelineOriginalResize = original;
  const sync = (size) => {
    const host = root.parentElement;
    const target = Array.isArray(size) ? size : node.size || [0, 0];
    if (!host?.classList?.contains("dom-widget")) return;
    const rawWidth = num(target[0]);
    const width = Math.max(TIMELINE_MIN_NODE_WIDTH, rawWidth || adaptiveTimelineDefaultWidth());
    const hostWidth = Math.max(0, width - insets.width);
    host.style.setProperty("--cine-timeline-host-width", `${hostWidth}px`);
    root.style.width = "calc(var(--cine-timeline-host-width) - 16px)";
    root.style.height = "calc(100% - 16px)";
  };
  node.onResize = function (size) {
    const result = original?.apply(this, arguments);
    sync(size || this.size);
    requestAnimationFrame(() => sync(this.size));
    return result;
  };
  const host = root.parentElement;
  let resizeFrame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => sync(node.size));
  });
  if (host) observer.observe(host);
  sync.disconnect = () => {
    cancelAnimationFrame(resizeFrame);
    observer.disconnect();
  };
  return sync;
}

function restoreTimelineNodeSize(node, size) {
  if (!Array.isArray(size) || size.length < 2) return;
  const stable = [num(size[0]), num(size[1])];
  const apply = () => {
    const current = node.size || [0, 0];
    if (Math.abs(num(current[0]) - stable[0]) > 0.5 || Math.abs(num(current[1]) - stable[1]) > 0.5) {
      node.setSize?.([...stable]);
    }
    // ComfyUI may resize only the DOM-widget host when a native <details>
    // closes while leaving node.size unchanged. Re-run our host sizing too.
    node.cineTimelineEditor?.syncPanel?.(stable);
  };
  apply();
  requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
}

class CineTimelineWidget {
  constructor(node, sourceWidget, targetWidget = null, runWidget = null) {
    this.node = node;
    this.sourceWidget = sourceWidget;
    this.targetWidget = targetWidget;
    this.runWidget = runWidget;
    this.state = null;
    this.selected = null;
    this.activeShotId = String(node.properties?.cineTimelineActiveShotId || "");
    this.activeMusicId = String(node.properties?.cineTimelineActiveMusicId || "");
    this.globalSettingsExpanded = node.properties?.cineGlobalSettingsExpanded !== false;
    this.segmentSettingsExpanded = node.properties?.cineSegmentSettingsExpanded !== false;
    this.transientMessage = "";
    this.autoAssemblyActive = false;
    this.autoAssemblyStage = "idle";
    this.autoAssemblyShotId = "";
    this.hoverPreview = null;
    this.hoverPreviewTimer = null;

    this.root = el("div", "cine-timeline-root");
    this.root.innerHTML = "<style>" +
      ".dom-widget:has(> .cine-timeline-root){pointer-events:auto!important}" +
      ".cine-timeline-root{box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;padding:10px;color:#e8edf5;background:#171a21;font:12px Inter,system-ui,sans-serif;overflow:hidden;border-radius:8px;display:flex;flex-direction:column;container-type:inline-size;pointer-events:auto}" +
      ".cine-timeline-root *{box-sizing:border-box}" +
      ".cine-toolbar{display:flex;flex:0 0 auto;align-items:center;flex-wrap:wrap;gap:7px;min-height:34px;margin-bottom:6px}" +
      ".cine-title{font-size:14px;font-weight:700;margin-right:auto;color:#fff}" +
      ".cine-total{padding:4px 8px;border-radius:99px;background:#202a38;color:#b9c8dc;white-space:nowrap}" +
      ".cine-btn{border:1px solid #47566d;border-radius:5px;background:#273244;color:#edf4ff;padding:5px 8px;cursor:pointer}" +
      ".cine-btn:hover{background:#34445c}.cine-btn.danger{color:#ff9aa2;border-color:#684047}.cine-btn:disabled{opacity:.45;cursor:not-allowed}" +
      ".cine-main{flex:0 0 192px;height:192px;min-width:0;border:1px solid #303947;border-radius:6px;background:#11151c;overflow:hidden}" +
      ".cine-ruler,.cine-lane{display:grid;width:100%;min-width:0;grid-template-columns:minmax(86px,120px) minmax(0,1fr)}" +
      ".cine-ruler{height:28px;background:#1b202a;border-bottom:1px solid #333c49}" +
      ".cine-lane{height:96px}.cine-lane.music{height:66px;border-top:1px solid #303947}.cine-label{display:flex;align-items:center;gap:6px;padding:0 8px;background:#1a1f28;color:#aeb9c8;border-right:1px solid #303947;white-space:nowrap}.cine-label-name{min-width:0;overflow:hidden;text-overflow:ellipsis}.cine-track-add{margin-left:auto;width:24px;height:24px;padding:0;border:1px solid #596a82;border-radius:5px;background:#27364a;color:#dceaff;cursor:pointer}.cine-track-add:hover{background:#385173}.cine-track-file{display:none}" +
      ".cine-track{position:relative;min-width:0;height:100%;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:10% 100%}" +
      ".cine-tick{position:absolute;top:0;height:100%;border-left:1px solid #445064;color:#8793a5;padding:6px 0 0 3px;font-size:10px}" +
      ".cine-tick:last-child{left:auto!important;right:0;padding-right:3px;border-left:0;border-right:1px solid #445064;text-align:right}" +
      ".cine-shot{position:absolute;top:8px;height:80px;min-width:18px;padding:0;border:1px solid #52647a;border-radius:5px;background:#202a37;color:#fff;overflow:hidden;cursor:grab;box-shadow:0 1px 5px #0009;user-select:none;touch-action:none}" +
      ".cine-shot:hover{filter:brightness(1.08)}.cine-shot.selected{outline:3px solid #fff;outline-offset:1px;box-shadow:0 0 0 2px #4f8cff,0 2px 8px #000b}.cine-shot.dragging{cursor:grabbing;z-index:20;opacity:.86;filter:brightness(1.15)}.cine-shot.resizing{z-index:21;filter:brightness(1.15)}" +
      ".cine-shot-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#111820;pointer-events:none}.cine-shot-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1d2632,#263648);color:#77879a;font-size:11px}.cine-shot-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.76));pointer-events:none}" +
      ".cine-shot-mode{position:absolute;z-index:3;left:6px;top:6px;max-width:calc(100% - 18px);padding:2px 6px;border:1px solid #59789b;border-radius:10px;background:#17263bd9;color:#cfe5ff;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cine-shot-mode.boundary{border-color:#b78343;background:#3b2a18e6;color:#ffe0a8}.cine-shot-caption{position:absolute;z-index:2;left:8px;right:12px;bottom:7px;display:flex;align-items:flex-end;gap:6px;min-width:0}.cine-shot-caption strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px #000}.cine-duration{margin-left:auto;flex:0 0 auto;padding:2px 6px;border-radius:10px;background:#29496e;font-size:9px}.cine-duration-handle{position:absolute;z-index:4;top:0;right:0;width:10px;height:100%;cursor:ew-resize;touch-action:none;background:linear-gradient(90deg,transparent,rgba(132,190,255,.28))}.cine-duration-handle:before{content:'';position:absolute;right:2px;top:24px;width:2px;height:30px;border-radius:2px;background:#b9d9ff;box-shadow:-3px 0 0 #6a8bad}.cine-duration-handle:hover,.cine-duration-handle:focus{background:rgba(100,170,255,.3);outline:none}" +
      ".cine-music-clip{position:absolute;top:7px;height:52px;min-width:16px;border:1px solid #d5a145;border-radius:5px;background:linear-gradient(180deg,#684b1f,#3a2d1e);color:#fff;overflow:hidden;cursor:grab;box-shadow:0 1px 5px #0008;user-select:none;touch-action:none}.cine-music-clip.selected{outline:2px solid #ffe0a0;outline-offset:1px}.cine-music-clip.dragging,.cine-music-clip.resizing{z-index:20;filter:brightness(1.18)}.cine-music-caption{position:absolute;inset:0 10px;display:flex;align-items:center;gap:6px;min-width:0}.cine-music-caption strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cine-music-time{margin-left:auto;flex:0 0 auto;font-size:9px;color:#ffe5ac}.cine-music-handle{position:absolute;z-index:3;top:0;width:9px;height:100%;cursor:ew-resize;background:rgba(255,221,151,.12)}.cine-music-handle.left{left:0}.cine-music-handle.right{right:0}.cine-music-handle:hover{background:rgba(255,221,151,.35)}" +
      ".cine-inspector{flex:1 1 0;min-width:0;min-height:150px;margin-top:8px;padding:10px;border:1px solid #303947;border-radius:6px;background:#1b2029;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable}" +
      ".cine-settings{margin-bottom:10px;padding:0 10px 10px;border:1px solid #43536a;border-radius:7px;background:#18212d}.cine-settings.global{border-color:#4b6382;background:#182331}.cine-settings.segment{border-color:#46566c;background:#1a222d}" +
      ".cine-settings-summary{display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;list-style:none;color:#e8f0fb;font-weight:700}.cine-settings-summary::-webkit-details-marker{display:none}.cine-settings-summary:before{content:'▸';color:#8fb6e8}.cine-settings[open]>.cine-settings-summary:before{content:'▾'}.cine-settings-badge{margin-left:auto;padding:2px 7px;border-radius:10px;background:#27364a;color:#bcd0e9;font-size:10px;font-weight:500}" +
      ".cine-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:9px}.cine-field{display:flex;flex-direction:column;gap:4px;color:#98a5b7;min-width:0}.cine-field.full{grid-column:1/-1}.cine-field.wide{grid-column:span 2}.cine-field.checkbox{justify-content:flex-end}.cine-field.checkbox input{width:18px;height:18px}.cine-field textarea{min-height:76px;line-height:1.45;resize:vertical}.cine-field.prompt textarea{min-height:118px}" +
      ".cine-primary-row{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1fr) minmax(0,1.45fr);gap:9px;align-items:end}.cine-primary-row .cine-field{min-width:0}.cine-primary-row select,.cine-primary-row input{width:100%;box-sizing:border-box}" +
      ".cine-timeline-root input,.cine-timeline-root select,.cine-timeline-root textarea{width:100%;min-width:0;border:1px solid #394252;border-radius:4px;background:#202631;color:#eef3fa;padding:6px 8px;font:inherit}" +
      ".cine-note{grid-column:1/-1;padding:8px 10px;border:1px solid #394759;border-radius:5px;background:#222b38;color:#b9c7d9;line-height:1.45}.cine-note.pending{border-color:#735b2f;background:#30291d;color:#f1d49a}.cine-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px}" +
      ".cine-section-title{grid-column:1/-1;margin-top:4px;padding-top:9px;border-top:1px solid #334052;color:#d7e2f0;font-weight:700}" +
      ".cine-reference-editor{grid-column:1/-1;border:1px solid #36445a;border-radius:7px;background:#141a22;overflow:hidden}.cine-reference-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 8px;background:#202938;color:#e6edf7;font-weight:700}.cine-reference-count{color:#8fa0b6;font-weight:500}.cine-reference-spacer{flex:1}.cine-ref-add-wrap{display:inline-flex}.cine-ref-add-input{display:none}.cine-ref-usage{display:flex;gap:4px;flex-wrap:wrap;font-weight:500}.cine-usage-pill{padding:2px 6px;border:1px solid #3d4858;border-radius:10px;background:#171d26;color:#aeb9c8;font-size:10px}.cine-usage-pill.invalid{border-color:#a84b55;background:#3a2026;color:#ffadb4}" +
      ".cine-ref-body{padding:8px}.cine-ref-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:7px}.cine-ref-card{--media:#3ba6ff;position:relative;display:grid;grid-template-columns:44px minmax(0,1fr);gap:7px;min-height:84px;padding:7px;border:1px solid color-mix(in srgb,var(--media) 55%,#303947);border-left:4px solid var(--media);border-radius:7px;background:color-mix(in srgb,var(--media) 9%,#1a2029);overflow:hidden}.cine-ref-card.video{--media:#a875ff}.cine-ref-card.audio{--media:#f0aa3c}.cine-ref-card.invalid{box-shadow:inset 0 0 0 2px #c24c59}.cine-ref-thumb{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:5px;background:#0e131a;color:var(--media);font-size:21px;font-weight:800;overflow:hidden}.cine-ref-thumb img{width:100%;height:100%;object-fit:cover}.cine-ref-info{min-width:0}.cine-ref-top{display:grid;grid-template-columns:48px minmax(0,1fr);gap:5px;padding-right:21px}.cine-ref-order{padding:3px 4px!important;border-color:var(--media)!important;color:var(--media)!important;font-weight:800}.cine-ref-name{padding:3px 4px!important}.cine-ref-type{margin-top:5px;padding:3px 4px!important}.cine-ref-delete{position:absolute;right:5px;top:5px;width:22px!important;height:22px;padding:0!important;border:1px solid #623d45!important;border-radius:50%!important;background:#2c2025!important;color:#ff9ca8!important;cursor:pointer}.cine-ref-delete:hover{background:#65313c!important;color:#fff!important}" +
      ".cine-ref-empty{padding:8px;color:#738096}.cine-ref-drop{display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:7px;border:1px dashed #4a5a70;border-radius:7px;color:#8290a5;cursor:pointer;text-align:center}.cine-ref-drop.dragover{border-color:#77b5ff;background:#1c2c40;color:#d7eaff}.cine-ref-drop input{display:none}" +
      ".cine-ref-preview{position:fixed;z-index:1000000;width:min(340px,calc(100vw - 24px));padding:8px;border:1px solid #52617a;border-radius:8px;background:#111720;color:#eef4fd;box-shadow:0 14px 36px #000c;pointer-events:auto}.cine-ref-preview-title{display:flex;gap:8px;align-items:center;margin:0 2px 7px;color:#cbd6e5;font-size:11px}.cine-ref-preview img,.cine-ref-preview video{display:block;width:100%;max-height:260px;object-fit:contain;border-radius:5px;background:#090d12}.cine-ref-preview audio{display:block;width:100%;height:38px}" +
      ".cine-empty{padding:12px;color:#687487}.cine-status{flex:0 0 18px;padding:5px 2px 0;color:#8491a3}.cine-status.invalid{color:#ff9da7}" +
      "@container(max-width:620px){.cine-title{flex-basis:100%}.cine-fields{grid-template-columns:1fr}.cine-field.wide{grid-column:1/-1}.cine-ruler,.cine-lane{grid-template-columns:84px minmax(0,1fr)}}"+
      "</style>";

    this.toolbar = el("div", "cine-toolbar");
    this.localeOff = onLocaleChange(() => this.render());
    this.main = el("div", "cine-main");
    this.inspector = el("div", "cine-inspector");
    this.status = el("div", "cine-status");
    this.root.append(this.toolbar, this.main, this.inspector, this.status);

    const timelineReady = this.reloadState();
    // Queue scope is runtime-only. A browser/server restart cannot resume the
    // old callback, so persisted values would permanently block new renders.
    if (this.state?.metadata) {
      delete this.state.metadata.render_target_shot_id;
      delete this.state.metadata.render_run_id;
    }
    if (this.targetWidget) this.targetWidget.value = "";
    if (this.runWidget) this.runWidget.value = "";
    if (timelineReady) this.sync();
  }

  reloadState() {
    try {
      // Widget names and object identities can shift while ComfyUI restores an
      // older workflow. Resolve the canonical state from its content on every
      // reload so a segment/run token can never be parsed as timeline JSON.
      let canonicalSource = (this.node?.widgets || []).find((widget) => {
        try {
          const value = JSON.parse(String(widget?.value || ""));
          return value && typeof value === "object" && Array.isArray(value.shots);
        } catch {
          return false;
        }
      });
      if (!canonicalSource) {
        const backup = String(this.node?.properties?.cineTimelineStateBackup || "");
        let backupState = null;
        try {
          const candidate = JSON.parse(backup);
          if (candidate && typeof candidate === "object" && Array.isArray(candidate.shots)) {
            backupState = candidate;
          }
        } catch {}
        if (backupState) {
          canonicalSource = (this.node?.widgets || []).find((widget) => widget.name === "timeline_state") || null;
          if (!canonicalSource) {
            canonicalSource = this.node?.addWidget?.(
              "text", "timeline_state", backup, () => {}, { serialize: true },
            ) || null;
          }
          if (canonicalSource) canonicalSource.value = backup;
        }
      }
      if (!canonicalSource) {
        // ComfyUI restores widget values asynchronously. At this point the
        // saved timeline widget may not exist yet and sourceWidget can point
        // at a numeric/queue widget. Do not parse or write through that stale
        // reference; wait for the canonical JSON widget to become available.
        this.state ??= JSON.parse(EMPTY_TIMELINE_STATE);
        this.toolbar.replaceChildren(el("div", "cine-title", "CineTimeline · 正在恢复数据…"));
        this.main.replaceChildren();
        this.inspector.replaceChildren();
        this.status.replaceChildren();

        const attempt = Number(this._timelineRestoreAttempts || 0);
        if (attempt < 6 && !this._timelineRestoreRetryTimer) {
          const delays = [0, 50, 250, 1000, 2000, 4000];
          this._timelineRestoreRetryTimer = setTimeout(() => {
            this._timelineRestoreRetryTimer = 0;
            this._timelineRestoreAttempts = attempt + 1;
            this.reloadState();
          }, delays[attempt]);
        }
        return false;
      }

      if (this._timelineRestoreRetryTimer) clearTimeout(this._timelineRestoreRetryTimer);
      this._timelineRestoreRetryTimer = 0;
      this._timelineRestoreAttempts = 0;
      this.sourceWidget = canonicalSource;
      canonicalSource.name = "timeline_state";
      this.state = JSON.parse(String(canonicalSource.value));
      this.node.properties ??= {};
      this.node.properties.cineTimelineStateBackup = JSON.stringify(this.state);
      this.state.metadata = this.state.metadata && typeof this.state.metadata === "object"
        ? this.state.metadata
        : {};
      delete this.state.metadata.render_target_shot_id;
      delete this.state.metadata.render_run_id;
      if (this.targetWidget) this.targetWidget.value = "";
      if (this.runWidget) this.runWidget.value = "";
      this.state.fps = FIXED_FPS;
      for (const key of ["shots", "references", "audio", "subtitles"]) {
        this.state[key] = Array.isArray(this.state[key]) ? this.state[key] : [];
      }
      this.state.shots.sort((a, b) => num(a.start_frame) - num(b.start_frame));
      this.state.total_frames = Math.max(1, Math.round(num(this.state.total_frames, secondsToFrames(DEFAULT_SEGMENT_SECONDS))));
      const legacyMusic = this.state.background_music;
      this.state.background_music = Array.isArray(legacyMusic)
        ? legacyMusic.filter((item) => item && typeof item === "object" && String(item.asset_id || "").trim())
        : legacyMusic && typeof legacyMusic === "object" && String(legacyMusic.asset_id || "").trim()
          ? [{ ...legacyMusic, music_id: legacyMusic.music_id || "BGM_001" }]
          : [];

      this.migratePromptScopes();
      this.migrateShotCameraPrompts();
      this.migrateAutomaticContinuity();
      this.ensureReferenceMetadata();
      this.normalizeShotSchedule(false);

      if (!this.state.shots.some((shot) => shot.shot_id === this.activeShotId)) {
        this.activeShotId = this.state.shots[0]?.shot_id || "";
      }
      this.node.properties ??= {};
      this.node.properties.cineTimelineActiveShotId = this.activeShotId;
      if (!this.state.background_music.some((music) => music.music_id === this.activeMusicId)) {
        this.activeMusicId = "";
      }
      this.node.properties.cineTimelineActiveMusicId = this.activeMusicId;
      this.selected = this.activeMusic()
        ? { kind: "music", item: this.activeMusic() }
        : this.activeShot()
          ? { kind: "shot", item: this.activeShot() }
          : null;
      this.sourceWidget.value = JSON.stringify(this.state, null, 2);
      this.render();
      return true;
    } catch (error) {
      this.state = null;
      this.toolbar.replaceChildren(el("div", "cine-title", "CineTimeline · 数据解析失败"));
      this.main.replaceChildren(el("div", "cine-empty", String(error.message || error)));
      this.inspector.replaceChildren();
      this.status.replaceChildren();
      return false;
    }
  }

  migratePromptScopes() {
    const shots = this.state.shots;
    const hasGlobal = Object.prototype.hasOwnProperty.call(this.state, "global_prompt");
    const hasNegative = Object.prototype.hasOwnProperty.call(this.state, "negative_prompt");
    const globals = [...new Set(shots.map((shot) => String(shot.global_prompt || "").trim()).filter(Boolean))];
    const negatives = [...new Set(shots.map((shot) => String(shot.negative_prompt || "").trim()).filter(Boolean))];

    if (!hasGlobal) {
      if (globals.length === 1) this.state.global_prompt = globals[0];
      else {
        this.state.global_prompt = "";
        for (const shot of shots) {
          const legacy = String(shot.global_prompt || "").trim();
          if (legacy) shot.local_prompt = [legacy, String(shot.local_prompt || "").trim()].filter(Boolean).join("\n\n");
        }
      }
    } else this.state.global_prompt = String(this.state.global_prompt || "");

    if (!hasNegative) this.state.negative_prompt = negatives.join(", ");
    else this.state.negative_prompt = String(this.state.negative_prompt || "");

    for (const shot of shots) {
      delete shot.global_prompt;
      delete shot.negative_prompt;
    }
  }

  migrateShotCameraPrompts() {
    for (const shot of this.state.shots) {
      const camera = String(shot.camera || "").trim();
      if (!camera) continue;
      shot.local_prompt = [String(shot.local_prompt || "").trim(), "Camera: " + camera].filter(Boolean).join("\n");
      shot.camera = "";
    }
  }

  migrateAutomaticContinuity() {
    for (const [index, shot] of this.state.shots.entries()) {
      shot.metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
      delete shot.metadata.allow_text_only;
      const legacyNewScene = Boolean(shot.metadata.new_scene);
      const legacyContinuation = Boolean(shot.metadata.continue_from_previous);
      if (index === 0 || legacyNewScene) shot.transition = "cut";
      else if (legacyContinuation) shot.transition = "motion_context";
      if (!["cut", "motion_context"].includes(shot.transition)) shot.transition = "cut";
      delete shot.metadata.new_scene;
      delete shot.metadata.continue_from_previous;
      shot.metadata.continuity_handle_frames = Math.max(1, Math.min(3, Math.round(num(shot.metadata.continuity_handle_frames, 1))));
    }
  }

  ensureShotRenderMetadata(shot) {
    shot.metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
    const raw = shot.metadata.render && typeof shot.metadata.render === "object" ? shot.metadata.render : {};
    const versions = Array.isArray(raw.versions)
      ? raw.versions.filter((item) => item && typeof item === "object" && String(item.version_id || "").trim())
      : [];
    for (const version of versions) {
      for (const field of ["width", "height", "boundary_width", "boundary_height"]) {
        if (num(version[field], 0) < 1) delete version[field];
      }
    }
    let active = String(raw.active_version || "");
    if (!versions.some((item) => item.version_id === active)) active = versions.at(-1)?.version_id || "";
    let status = Object.prototype.hasOwnProperty.call(RENDER_LABELS, raw.status)
      ? raw.status
      : versions.length
        ? "generated"
        : "empty";
    if (!versions.length) status = "empty";
    shot.metadata.render = { status, active_version: active, versions };
    return shot.metadata.render;
  }

  savedAsset(saved) {
    const filename = String(saved?.filename || saved?.name || "").trim();
    if (!filename) return null;
    const subfolder = String(saved?.subfolder || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    return {
      asset_id: [subfolder, filename].filter(Boolean).join("/"),
      storage_type: ["input", "output", "temp"].includes(saved?.type) ? saved.type : "output",
    };
  }

  registerSegmentVideo(saved, promptId, immutableContext, manifest) {
    if (!this.state?.shots?.length) return;
    const asset = this.savedAsset(saved);
    if (!asset) return;
    const runKey = String(promptId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || String(Date.now());
    const createdAt = new Date().toISOString();
    const targetId = String(
      immutableContext?.targetId || this.state?.metadata?.render_target_shot_id || ""
    ).trim();
    const queuedRunId = String(
      immutableContext?.runId || this.state?.metadata?.render_run_id || ""
    ).trim();
    const targetShot = this.state.shots.find((shot) => shot.shot_id === targetId);
    if (!targetShot) {
      if (this.autoAssemblyActive) {
        this.stopAutoAssembly("自动补全已停止：无法从任务记录确认生成结果对应的片段");
        return;
      }
      this.transientMessage = "片段已保存，但无法从本次任务记录确认目标片段，未写入视频轨（避免误写当前查看片段）";
      this.render();
      return;
    }
    const hasManifest = manifest?.schema === "cine_segment_manifest";
    if (!queuedRunId || (hasManifest && (
      String(manifest.shot_id || "") !== targetId ||
      String(manifest.render_run_id || "") !== queuedRunId
    ))) {
      if (this.autoAssemblyActive) {
        this.stopAutoAssembly("自动补全已停止：片段视频已保存，但 AV latent 版本清单缺失或与排队任务不一致");
        return;
      }
      this.transientMessage = "片段视频已保存，但任务标识校验失败，未登记到视频轨";
      this.render();
      return;
    }
    const render = this.ensureShotRenderMetadata(targetShot);
    const clipDuration = framesToSeconds(targetShot.end_frame - targetShot.start_frame);
    const version = {
      version_id: "RUN_" + runKey,
      asset_id: asset.asset_id,
      storage_type: asset.storage_type,
      created_at: createdAt,
      note: "当前片段生成结果",
      approved: false,
      frames: Math.max(1, Math.round(targetShot.end_frame - targetShot.start_frame)),
      clip_start_seconds: 0,
      clip_duration_seconds: clipDuration,
      render_run_id: queuedRunId,
      latent_path: String(manifest?.latent_path || ""),
      latent_sha256: String(manifest?.latent_sha256 || "").toLowerCase(),
      boundary_latent_path: String(manifest?.boundary_latent_path || manifest?.latent_path || ""),
      boundary_latent_sha256: String(manifest?.boundary_latent_sha256 || manifest?.latent_sha256 || "").toLowerCase(),
      latent_source_shot_id: String(manifest?.source_shot_id || ""),
      latent_source_version_id: String(manifest?.source_version_id || ""),
      latent_source_sha256: String(manifest?.source_latent_sha256 || ""),
      transition: String(manifest?.transition || targetShot.transition || "cut"),
      width: Math.max(0, Math.round(num(manifest?.width, 0))),
      height: Math.max(0, Math.round(num(manifest?.height, 0))),
      boundary_width: Math.max(0, Math.round(num(manifest?.boundary_width, manifest?.width || 0))),
      boundary_height: Math.max(0, Math.round(num(manifest?.boundary_height, manifest?.height || 0))),
    };
    for (const field of ["width", "height", "boundary_width", "boundary_height"]) {
      if (num(version[field], 0) < 1) delete version[field];
    }
    render.status = "generated";
    render.active_version = version.version_id;
    render.versions = [...render.versions.filter((item) => item.version_id !== version.version_id), version];
    if (String(this.state.metadata?.render_target_shot_id || "").trim() === targetId) {
      delete this.state.metadata.render_target_shot_id;
    }
    if (String(this.state.metadata?.render_run_id || "").trim() === queuedRunId) {
      delete this.state.metadata.render_run_id;
    }
    if (this.targetWidget) this.targetWidget.value = "";
    if (this.runWidget) this.runWidget.value = "";
    if (this.state.metadata.complete_movie) this.state.metadata.complete_movie.stale = true;
    const continueAssembly = this.autoAssemblyActive && this.autoAssemblyStage === "segment" && this.autoAssemblyShotId === targetId;
    if (continueAssembly) {
      this.autoAssemblyStage = "checking";
      this.autoAssemblyShotId = "";
      this.transientMessage = `${targetShot.shot_id} 已补全，正在检查下一片段…`;
    } else {
      this.transientMessage = `已把 ${targetShot.shot_id} 的新结果登记到视频轨；完整影片需要重新串联`;
    }
    this.sync();
    if (continueAssembly) setTimeout(async () => {
      try {
        this.transientMessage = `${targetShot.shot_id} 已保存，正在清理上一段临时显存…`;
        this.render();
        await api.fetchApi("/free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // H3 quantized weights must remain registered between segments.
          // Full unload/reload can corrupt AIMDO HostBuffer state on Windows.
          body: JSON.stringify({ unload_models: false, free_memory: true }),
        });
        await new Promise((resolve) => setTimeout(resolve, 1200));
      } catch (error) {
        console.warn("[CineTimeline] inter-segment memory release failed", error);
      }
      this.continueAutoAssembly();
    }, 0);
  }

  registerAssembledVideo(saved, promptId) {
    if (!this.state?.shots?.length) return;
    const asset = this.savedAsset(saved);
    if (!asset) return;
    this.state.metadata ??= {};
    this.state.metadata.complete_movie = {
      ...asset,
      prompt_id: String(promptId || ""),
      created_at: new Date().toISOString(),
      stale: false,
      segment_versions: this.state.shots.map((shot) => ({
        shot_id: shot.shot_id,
        version_id: this.ensureShotRenderMetadata(shot).active_version,
      })),
    };
    this.autoAssemblyActive = false;
    this.autoAssemblyStage = "idle";
    this.autoAssemblyShotId = "";
    this.transientMessage = `已串联并保存 ${this.state.shots.length} 个片段的完整影片`;
    this.sync();
  }

  stopAutoAssembly(message) {
    const targetId = this.autoAssemblyShotId;
    this.autoAssemblyActive = false;
    this.autoAssemblyStage = "idle";
    this.autoAssemblyShotId = "";
    if (String(this.state?.metadata?.render_target_shot_id || "").trim() === targetId) {
      delete this.state.metadata.render_target_shot_id;
    }
    delete this.state?.metadata?.render_run_id;
    if (this.targetWidget) this.targetWidget.value = "";
    if (this.runWidget) this.runWidget.value = "";
    this.transientMessage = message;
    this.sync();
  }

  handleAutoAssemblyFailure(reason) {
    if (!this.autoAssemblyActive) return;
    const stageLabel = this.autoAssemblyStage === "assembling"
      ? "完整影片串联"
      : this.autoAssemblyShotId || "片段补全";
    this.stopAutoAssembly(`自动补全已停止：${stageLabel} 执行失败（${reason}）`);
  }

  handleExecutionFailure(reason) {
    if (this.autoAssemblyActive) {
      this.handleAutoAssemblyFailure(reason);
      return;
    }
    const targetId = String(this.state?.metadata?.render_target_shot_id || "").trim();
    const runId = String(this.state?.metadata?.render_run_id || "").trim();
    if (!targetId && !runId) return;
    const shot = this.state?.shots?.find((item) => item.shot_id === targetId);
    if (shot) {
      const render = this.ensureShotRenderMetadata(shot);
      render.status = render.versions.length ? "generated" : "empty";
    }
    delete this.state.metadata.render_target_shot_id;
    delete this.state.metadata.render_run_id;
    if (this.targetWidget) this.targetWidget.value = "";
    if (this.runWidget) this.runWidget.value = "";
    this.transientMessage = `${targetId || "当前片段"} 的任务已中止，运行锁已释放，可以重新生成（${reason}）`;
    this.sync();
  }

  ensureReferenceMetadata() {
    const nextByType = { image: 1, video: 1, audio: 1 };
    for (const ref of this.state.references) {
      ref.media_type = MEDIA_TYPES.includes(ref.media_type)
        ? ref.media_type
        : ref.type === "video"
          ? "video"
          : ref.type === "audio"
            ? "audio"
            : "image";
      ref.scope = this.referenceScope(ref);
      if (ref.scope === "shot" && !ref.shot_id) {
        const match = this.state.shots.find(
          (shot) => num(ref.start_frame) < num(shot.end_frame) && num(ref.end_frame) > num(shot.start_frame)
        );
        ref.shot_id = match?.shot_id || this.state.shots[0]?.shot_id || "";
      }
      if (!Number.isInteger(ref.media_order) || ref.media_order < 1) ref.media_order = nextByType[ref.media_type];
      nextByType[ref.media_type] = Math.max(nextByType[ref.media_type], ref.media_order + 1);
      ref.priority = 1000 - ref.media_order;
      ref.metadata = ref.metadata && typeof ref.metadata === "object" ? ref.metadata : {};
    }

    for (const shot of this.state.shots) {
      shot.metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
      this.ensureShotRenderMetadata(shot);
      delete shot.metadata.new_scene;
      delete shot.metadata.continue_from_previous;
      shot.metadata.continuity_handle_frames = 1;
    }
    if (["tail_continuity", "motion_context"].includes(this.state.shots[0]?.transition)) {
      this.state.shots[0].transition = "cut";
    }
  }

  normalizeShotSchedule(sortExisting = false) {
    if (!this.state) return;
    this.state.fps = FIXED_FPS;
    if (sortExisting) this.state.shots.sort((a, b) => num(a.start_frame) - num(b.start_frame));

    let cursor = 0;
    for (const shot of this.state.shots) {
      shot.metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
      const legacyFrames = Math.max(1, num(shot.end_frame) - num(shot.start_frame));
      const requested = shot.metadata.duration_seconds ?? legacyFrames / FIXED_FPS;
      const seconds = clamp(roundTenth(requested || DEFAULT_SEGMENT_SECONDS), MIN_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS);
      const frames = secondsToFrames(seconds);
      shot.metadata.duration_seconds = seconds;
      shot.start_frame = cursor;
      shot.end_frame = cursor + frames;
      cursor = shot.end_frame;
    }

    this.state.total_frames = Math.max(1, cursor);
    this.normalizeMusicSchedule();
    this.syncReferenceRanges();
  }

  normalizeMusicSchedule() {
    const totalSeconds = Math.max(0.1, framesToSeconds(this.state.total_frames));
    const seen = new Set();
    this.state.background_music = this.state.background_music
      .filter((music) => music && typeof music === "object" && String(music.asset_id || "").trim())
      .map((music, index) => {
        let id = String(music.music_id || `BGM_${String(index + 1).padStart(3, "0")}`);
        if (seen.has(id)) id = this.nextId("BGM_", seen);
        seen.add(id);
        const legacyStart = framesToSeconds(num(music.start_frame, 0));
        const legacyEnd = framesToSeconds(num(music.end_frame, this.state.total_frames));
        const start = clamp(
          roundTenth(music.start_seconds ?? legacyStart),
          0,
          Math.max(0, roundTenth(totalSeconds - 0.1))
        );
        const end = clamp(
          roundTenth(music.end_seconds ?? legacyEnd),
          roundTenth(start + 0.1),
          totalSeconds
        );
        music.music_id = id;
        music.start_seconds = start;
        music.end_seconds = end;
        music.start_frame = Math.max(0, Math.round(start * FIXED_FPS));
        music.end_frame = Math.min(this.state.total_frames, Math.max(music.start_frame + 1, Math.round(end * FIXED_FPS)));
        music.volume_db = num(music.volume_db, -12);
        music.loop = Boolean(music.loop);
        music.fade_in_seconds = clamp(
          roundTenth(music.fade_in_seconds ?? framesToSeconds(num(music.fade_in_frames, 0))), 0, 60
        );
        music.fade_out_seconds = clamp(
          roundTenth(music.fade_out_seconds ?? framesToSeconds(num(music.fade_out_frames, 0))), 0, 60
        );
        music.fade_in_frames = Math.max(0, Math.round(music.fade_in_seconds * FIXED_FPS));
        music.fade_out_frames = Math.max(0, Math.round(music.fade_out_seconds * FIXED_FPS));
        return music;
      })
      .sort((a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds);
  }

  syncReferenceRanges() {
    if (!this.state) return;
    for (const ref of this.state.references) {
      if (this.referenceScope(ref) === "global") {
        ref.scope = "global";
        ref.shot_id = "";
        ref.start_frame = 0;
        ref.end_frame = this.state.total_frames;
      } else {
        const shot = this.state.shots.find((item) => item.shot_id === ref.shot_id) || this.activeShot();
        if (shot) {
          ref.scope = "shot";
          ref.shot_id = shot.shot_id;
          ref.start_frame = shot.start_frame;
          ref.end_frame = shot.end_frame;
        }
      }
      ref.priority = 1000 - Math.max(1, Math.round(num(ref.media_order, 1)));
    }
  }

  sync(render = true) {
    this.normalizeShotSchedule(false);
    this.sourceWidget.value = JSON.stringify(this.state, null, 2);
    this.node.properties ??= {};
    this.node.properties.cineTimelineStateBackup = JSON.stringify(this.state);
    try {
      this.sourceWidget.callback?.(this.sourceWidget.value);
    } catch (error) {
      console.warn("[CineTimeline] timeline_state widget callback failed; state remains serialized", error);
    }
    if (render) this.render();
    this.node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas(true, true);
  }

  referenceScope(item) {
    if (item?.scope === "global") return "global";
    if (item?.scope === "shot") return "shot";
    return num(item?.start_frame) <= 0 && num(item?.end_frame) >= this.state.total_frames ? "global" : "shot";
  }

  referenceMatchesShot(item, shot) {
    if (!shot) return false;
    if (this.referenceScope(item) === "global") return true;
    if (item.shot_id) return item.shot_id === shot.shot_id;
    return num(item.start_frame) < num(shot.end_frame) && num(item.end_frame) > num(shot.start_frame);
  }

  globalReferences() {
    return this.state.references.filter((ref) => this.referenceScope(ref) === "global");
  }

  shotReferences(shot = this.activeShot()) {
    return this.state.references.filter(
      (ref) => this.referenceScope(ref) === "shot" && this.referenceMatchesShot(ref, shot)
    );
  }

  effectiveReferences(shot = this.activeShot()) {
    return [...this.globalReferences(), ...this.shotReferences(shot)];
  }

  automaticContinuity(shot = this.activeShot()) {
    const index = this.state.shots.indexOf(shot);
    const hasVisual = this.effectiveReferences(shot).some(
      (ref) => ["image", "video"].includes(ref.media_type) && String(ref.asset_id || "").trim()
    );
    const mode = index > 0 && shot?.transition === "motion_context" ? "motion_context" : "";
    const required = Boolean(mode);
    const previous = index > 0 ? this.state.shots[index - 1] : null;
    const previousRender = previous ? this.ensureShotRenderMetadata(previous) : null;
    const previousVersion = previousRender
      ? previousRender.versions.find((item) => item.version_id === previousRender.active_version) || null
      : null;
    const previousReady = !required || Boolean(
      previousVersion && String(previousVersion.asset_id || "").trim() && (
        mode !== "motion_context" || (
          String(previousVersion.latent_path || "").trim() &&
          /^[0-9a-f]{64}$/i.test(String(previousVersion.latent_sha256 || ""))
        )
      )
    );
    const render = shot ? this.ensureShotRenderMetadata(shot) : null;
    const currentVersion = render
      ? render.versions.find((item) => item.version_id === render.active_version) || null
      : null;
    const previousLineageStale = Boolean(
      mode === "motion_context" && previous && this.automaticContinuity(previous).lineageStale
    );
    const lineageStale = Boolean(
      mode === "motion_context" && currentVersion?.asset_id && (
        previousLineageStale || !previousVersion ||
          String(currentVersion.latent_source_shot_id || "") !== String(previous?.shot_id || "") ||
          String(currentVersion.latent_source_version_id || "") !== String(previousVersion.version_id || "") ||
          String(currentVersion.latent_source_sha256 || "").toLowerCase() !== String(previousVersion.latent_sha256 || "").toLowerCase()
        )
    );
    return {
      required,
      mode,
      hasVisual,
      previous,
      previousVersion,
      previousReady,
      currentVersion,
      lineageStale,
    };
  }

  referenceUsage(shot = this.activeShot()) {
    const effective = this.effectiveReferences(shot);
    const refs = effective.filter((ref) => String(ref.asset_id || "").trim());
    const counts = { image: 0, video: 0, audio: 0, total: refs.length };
    for (const ref of refs) counts[ref.media_type] = (counts[ref.media_type] || 0) + 1;

    const duplicates = [];
    for (const media of MEDIA_TYPES) {
      const seen = new Set();
      for (const ref of refs.filter((item) => item.media_type === media)) {
        const order = Math.round(num(ref.media_order));
        if (seen.has(order)) duplicates.push(MEDIA_CODES[media] + order);
        seen.add(order);
      }
    }

    const hasVisual = counts.image > 0 || counts.video > 0;
    const errors = [];
    const isFL2VA = upstreamModelProfile(this.node) === "MiniMax H3 FL2VA";
    const continuity = this.automaticContinuity(shot);

    if (isFL2VA) {
      const unsupported = refs.filter(
        (ref) => ref.media_type !== "image" || !["first_frame", "last_frame"].includes(ref.type)
      );
      if (unsupported.length) errors.push("FL2VA 只接受首帧/尾帧图片");
      for (const type of ["first_frame", "last_frame"]) {
        if (refs.filter((ref) => ref.type === type).length > 1) errors.push((REFERENCE_LABELS[type] || type) + "重复");
      }
      if (continuity.mode === "tail_continuity" && refs.some((ref) => ref.type === "first_frame")) {
        errors.push("尾帧续接不能同时指定首帧");
      }
    } else {
      const continuitySlots = continuity.mode === "tail_continuity" ? 1 : 0;
      if (counts.image + continuitySlots > MEDIA_LIMITS.image) errors.push("I（含续接尾帧）超过 " + MEDIA_LIMITS.image);
      if (counts.video > MEDIA_LIMITS.video) errors.push("V 超过 " + MEDIA_LIMITS.video);
      if (counts.audio > MEDIA_LIMITS.audio) errors.push("A 超过 " + MEDIA_LIMITS.audio);
      if (counts.total + continuitySlots > MEDIA_LIMITS.total) errors.push("总数（含续接尾帧）超过 " + MEDIA_LIMITS.total);
      if (duplicates.length) errors.push("编号冲突 " + [...new Set(duplicates)].join(", "));
      if (!hasVisual) {
        if (counts.audio && !continuity.required) errors.push("只有 A，缺少 I/V");
      }
    }
    if (effective.some((ref) => !String(ref.asset_id || "").trim())) {
      errors.push("存在未选择文件的参考");
    }
    return {
      counts,
      errors,
      valid: errors.length === 0,
      autoContinuity: continuity.required,
      continuityMode: continuity.mode,
      previousReady: continuity.previousReady,
    };
  }

  invalidShots() {
    return this.state.shots
      .map((shot) => ({ shot, usage: this.referenceUsage(shot) }))
      .filter((item) => !item.usage.valid);
  }

  nextMediaOrder(scope, mediaType, shot = this.activeShot()) {
    const affected = scope === "global" ? this.state.shots : [shot].filter(Boolean);
    const used = new Set();
    for (const target of affected) {
      for (const ref of this.effectiveReferences(target)) {
        if (ref.media_type === mediaType) used.add(Math.round(num(ref.media_order)));
      }
    }
    for (let index = 1; index <= MEDIA_LIMITS[mediaType]; index++) {
      if (!used.has(index)) return index;
    }
    return MEDIA_LIMITS[mediaType] + 1;
  }

  activeShot() {
    return this.state?.shots.find((shot) => shot.shot_id === this.activeShotId) || this.state?.shots[0] || null;
  }

  activeMusic() {
    return this.state?.background_music.find((music) => music.music_id === this.activeMusicId) || null;
  }

  setActiveShot(shot) {
    if (!shot) return;
    this.activeShotId = shot.shot_id;
    this.activeMusicId = "";
    this.selected = { kind: "shot", item: shot };
    this.node.properties ??= {};
    this.node.properties.cineTimelineActiveShotId = this.activeShotId;
    this.node.properties.cineTimelineActiveMusicId = "";
  }

  setActiveMusic(music) {
    if (!music) return;
    this.activeMusicId = music.music_id;
    this.selected = { kind: "music", item: music };
    this.node.properties ??= {};
    this.node.properties.cineTimelineActiveMusicId = this.activeMusicId;
  }

  removeBackgroundMusic(music) {
    const index = this.state.background_music.indexOf(music);
    if (index >= 0) this.state.background_music.splice(index, 1);
    if (this.activeMusicId === music.music_id) this.activeMusicId = "";
    this.node.properties ??= {};
    this.node.properties.cineTimelineActiveMusicId = this.activeMusicId;
    this.sync();
  }

  nextId(prefix, existing) {
    let index = 1;
    while (existing.has(prefix + String(index).padStart(3, "0"))) index += 1;
    return prefix + String(index).padStart(3, "0");
  }

  addShot() {
    const id = this.nextId("SEGMENT_", new Set(this.state.shots.map((shot) => shot.shot_id)));
    const shot = {
      shot_id: id,
      start_frame: 0,
      end_frame: secondsToFrames(DEFAULT_SEGMENT_SECONDS),
      local_prompt: "",
      camera: "",
      transition: "cut",
      metadata: {
        duration_seconds: DEFAULT_SEGMENT_SECONDS,
        postprocess_mode: "rtx_vsr",
        continuity_handle_frames: 1,
        render: { status: "empty", active_version: "", versions: [] },
      },
    };
    this.state.shots.push(shot);
    this.setActiveShot(shot);
    this.sync();
  }

  deleteCurrentShot() {
    const shot = this.activeShot();
    if (!shot) return;
    const index = this.state.shots.indexOf(shot);
    this.state.shots.splice(index, 1);
    this.state.references = this.state.references.filter(
      (ref) => !(this.referenceScope(ref) === "shot" && ref.shot_id === shot.shot_id)
    );
    const next = this.state.shots[Math.min(index, this.state.shots.length - 1)] || null;
    this.activeShotId = next?.shot_id || "";
    this.selected = next ? { kind: "shot", item: next } : null;
    if (this.state.shots[0]?.transition === "tail_continuity") this.state.shots[0].transition = "cut";
    this.sync();
  }

  addReference(scope, mediaType, assetId = "", render = true) {
    const shot = this.activeShot();
    if (scope === "shot" && !shot) return null;
    const id = this.nextId("REF_", new Set(this.state.references.map((ref) => ref.reference_id)));
    const order = this.nextMediaOrder(scope, mediaType, shot);
    const isFL2VA = upstreamModelProfile(this.node) === "MiniMax H3 FL2VA";
    const existingImageTypes = new Set(
      this.effectiveReferences(shot)
        .filter((item) => item.media_type === "image")
        .map((item) => item.type)
    );
    const type = isFL2VA && mediaType === "image"
      ? existingImageTypes.has("first_frame") ? "last_frame" : "first_frame"
      : REFERENCE_TYPES_BY_MEDIA[mediaType][0];
    const ref = {
      reference_id: id,
      type,
      media_type: mediaType,
      media_order: order,
      scope,
      shot_id: scope === "shot" ? shot.shot_id : "",
      target_id: "",
      asset_id: assetId,
      start_frame: scope === "shot" ? shot.start_frame : 0,
      end_frame: scope === "shot" ? shot.end_frame : this.state.total_frames,
      strength: 1,
      adapter: "auto",
      priority: 1000 - order,
      metadata: {},
    };
    this.state.references.push(ref);
    if (render) this.sync();
    return ref;
  }

  removeReference(ref) {
    const index = this.state.references.indexOf(ref);
    if (index >= 0) this.state.references.splice(index, 1);
    this.sync();
  }

  inferMediaType(file) {
    const type = String(file?.type || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    if (type.startsWith("video/") || /\.(mp4|mov|mkv|webm|avi)$/.test(name)) return "video";
    if (type.startsWith("audio/") || /\.(wav|mp3|flac|m4a|aac|ogg)$/.test(name)) return "audio";
    return "image";
  }

  async uploadInputFile(file, subfolder) {
    const form = new FormData();
    form.append("image", file, file.name);
    form.append("type", "input");
    form.append("subfolder", subfolder);
    form.append("overwrite", "true");
    const response = await fetch("/upload/image", { method: "POST", body: form });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const result = await response.json();
    return [result.subfolder, result.name].filter(Boolean).join("/");
  }

  async uploadReferenceFiles(scope, files, expectedMediaType = "") {
    const list = [...files];
    if (!list.length) return;
    let added = 0;
    let rejected = 0;

    for (const file of list) {
      const inferred = this.inferMediaType(file);
      if (expectedMediaType && inferred !== expectedMediaType) {
        rejected += 1;
        continue;
      }
      const mediaType = expectedMediaType || inferred;
      try {
        const assetId = await this.uploadInputFile(file, "CineTimeline/references");
        this.addReference(scope, mediaType, assetId, false);
        added += 1;
      } catch (error) {
        console.error("[CineTimeline] reference upload failed", error);
        this.transientMessage = "上传失败：" + file.name;
      }
    }

    if (added) {
      this.transientMessage = "已加入 " + added + " 个参考文件" + (rejected ? "，忽略 " + rejected + " 个类型不匹配文件" : "");
      this.sync();
    } else {
      if (rejected) this.transientMessage = "没有加入文件：请选择正确类型";
      this.render();
    }
  }

  async uploadBackgroundMusicFile(file) {
    if (!file) return;
    if (this.inferMediaType(file) !== "audio") {
      this.transientMessage = "背景音乐只支持音频文件";
      this.render();
      return;
    }
    try {
      const assetId = await this.uploadInputFile(
        file,
        "CineTimeline/background_music"
      );
      const totalSeconds = Math.max(0.1, framesToSeconds(this.state.total_frames));
      const latestEnd = this.state.background_music.reduce(
        (value, music) => Math.max(value, num(music.end_seconds, 0)), 0
      );
      const start = latestEnd < totalSeconds - 0.1 ? roundTenth(latestEnd) : 0;
      const end = roundTenth(Math.min(totalSeconds, start + Math.min(10, totalSeconds)));
      const music = {
        music_id: this.nextId(
          "BGM_", new Set(this.state.background_music.map((item) => item.music_id))
        ),
        asset_id: assetId,
        start_seconds: start,
        end_seconds: Math.max(roundTenth(start + 0.1), end),
        volume_db: -12,
        loop: false,
        fade_in_seconds: 0.5,
        fade_out_seconds: 0.5,
      };
      this.state.background_music.push(music);
      this.setActiveMusic(music);
      this.transientMessage = "已加入背景音乐片段：" + file.name;
      this.sync();
    } catch (error) {
      console.error("[CineTimeline] background music upload failed", error);
      this.transientMessage = "背景音乐上传失败：" + file.name;
      this.render();
    }
  }

  render() {
    if (!this.state) return;
    this.renderToolbar();
    this.renderTimeline();
    this.renderInspector();
    const invalid = this.invalidShots();
    this.status.classList.toggle("invalid", invalid.length > 0);
    const totalSeconds = this.state.shots.length ? framesToSeconds(this.state.total_frames).toFixed(1) : "0.0";
    this.status.textContent =
      this.transientMessage ||
      this.state.shots.length + " 个片段 · " +
      this.state.references.length + " 个参考 · " +
      totalSeconds + " 秒" +
      (invalid.length
        ? " · " + invalid.map((item) => item.shot.shot_id).join(", ") + " 未通过参考校验"
        : " · 参考校验通过");
    this.transientMessage = "";
    localizeDom(this.root);
  }

  renderToolbar() {
    this.toolbar.replaceChildren();
    this.toolbar.append(el("div", "cine-title", "CineTimeline 电影时间轴"));
    this.toolbar.append(languageSelect(() => this.render()));
    const total = this.state.shots.length ? framesToSeconds(this.state.total_frames).toFixed(1) : "0.0";
    this.toolbar.append(el("span", "cine-total", "总时长 " + total + " 秒"));
    this.toolbar.append(this.button("+ 5秒片段", () => this.addShot()));
    const globalToggleLabel = this.globalSettingsExpanded ? "收起全局设置" : "展开全局设置";
    const globalToggle = this.button(globalToggleLabel, () => {
      const nextExpanded = !this.globalSettingsExpanded;
      const stableSize = [...(this.node.size || [])];
      this.globalSettingsExpanded = nextExpanded;
      this.node.properties ??= {};
      this.node.properties.cineGlobalSettingsExpanded = nextExpanded;
      const panel = this.inspector.querySelector(".cine-settings.global");
      if (panel) {
        panel._cineSizeBeforeToggle = stableSize;
        panel.open = nextExpanded;
      }
      globalToggle.textContent = tr(nextExpanded ? "收起全局设置" : "展开全局设置");
      // Keep the timeline/ruler DOM intact. Rebuilding the whole editor here
      // makes ComfyUI's transformed DOM-widget host remeasure at canvas zoom,
      // which changes the apparent timeline dimensions after collapsing.
      this.updateTimelineGeometry();
      restoreTimelineNodeSize(this.node, stableSize);
    });
    this.toolbar.append(globalToggle);
    const readiness = this.assemblyReadiness();
    const assemble = this.button(
      this.autoAssemblyActive
        ? this.autoAssemblyStage === "assembling"
          ? `正在串联完整影片 ${readiness.ready}/${readiness.total}`
          : `正在补全片段 ${readiness.ready}/${readiness.total}`
        : `串联完整影片 ${readiness.ready}/${readiness.total}`,
      () => this.queueAssembly(),
      "primary"
    );
    assemble.disabled = !readiness.total || this.autoAssemblyActive;
    assemble.title = this.autoAssemblyActive
      ? "正在逐段补全并串联，请等待当前步骤完成"
      : readiness.ready === readiness.total
        ? "所有片段已存在：直接按时间轴顺序串联，并加入背景音乐轨"
        : "按时间轴顺序检查；跳过已有片段，逐个生成缺失片段，最后自动串联";
    this.toolbar.append(assemble);
    const completeMovie = this.state.metadata?.complete_movie;
    if (completeMovie?.asset_id) {
      const view = this.button(
        completeMovie.stale ? "查看旧完整影片（需更新）" : "查看完整影片",
        () => window.open(this.renderAssetUrl(completeMovie), "_blank")
      );
      view.title = completeMovie.stale
        ? "某个片段已更新；点击查看上一次串联结果，或重新串联"
        : "查看最近一次手动串联的完整影片";
      this.toolbar.append(view);
    }
  }

  renderTimeline() {
    this.hideReferencePreview();
    this.main.replaceChildren();

    const ruler = el("div", "cine-ruler");
    ruler.append(el("div", "cine-label", "时间"));
    const rulerTrack = el("div", "cine-track");
    const totalSeconds = this.state.shots.length ? framesToSeconds(this.state.total_frames) : 0;
    for (let index = 0; index <= 10; index++) {
      const tick = el("div", "cine-tick", roundTenth(totalSeconds * index / 10).toFixed(1) + "s");
      tick.style.left = index * 10 + "%";
      rulerTrack.append(tick);
    }
    ruler.append(rulerTrack);
    this.main.append(ruler);

    const lane = el("div", "cine-lane");
    lane.append(el("div", "cine-label", "视频轨"));
    const track = el("div", "cine-track");
    for (const shot of this.state.shots) track.append(this.renderShotBlock(shot));
    lane.append(track);
    this.main.append(lane);

    const musicLane = el("div", "cine-lane music");
    const musicLabel = el("div", "cine-label");
    musicLabel.append(el("span", "cine-label-name", "背景音乐轨"));
    const musicInput = document.createElement("input");
    musicInput.type = "file";
    musicInput.accept = MEDIA_ACCEPTS.audio;
    musicInput.className = "cine-track-file";
    musicInput.addEventListener("change", async () => {
      await this.uploadBackgroundMusicFile(musicInput.files?.[0]);
      musicInput.value = "";
    });
    const musicAdd = el("button", "cine-track-add", "+");
    musicAdd.type = "button";
    musicAdd.title = "加入一段背景音乐";
    musicAdd.addEventListener("click", (event) => {
      event.stopPropagation();
      musicInput.click();
    });
    musicLabel.append(musicAdd, musicInput);
    const musicTrack = el("div", "cine-track");
    for (const music of this.state.background_music) musicTrack.append(this.renderMusicBlock(music));
    musicLane.append(musicLabel, musicTrack);
    this.main.append(musicLane);
  }

  renderMusicBlock(music) {
    const block = el("div", "cine-music-clip");
    block.dataset.musicId = music.music_id;
    const totalSeconds = Math.max(0.1, framesToSeconds(this.state.total_frames));
    block.style.left = 100 * music.start_seconds / totalSeconds + "%";
    block.style.width = 100 * (music.end_seconds - music.start_seconds) / totalSeconds + "%";
    if (music.music_id === this.activeMusicId) block.classList.add("selected");
    const caption = el("div", "cine-music-caption");
    const filename = String(music.asset_id || "").split(/[\\/]/).pop() || music.music_id;
    caption.append(
      el("strong", "", filename),
      el("span", "cine-music-time", `${music.start_seconds.toFixed(1)}–${music.end_seconds.toFixed(1)}s`)
    );
    const leftHandle = el("span", "cine-music-handle left");
    const rightHandle = el("span", "cine-music-handle right");
    leftHandle.title = "拖动调整开始时间（0.1 秒）";
    rightHandle.title = "拖动调整结束时间（0.1 秒）";
    block.append(caption, leftHandle, rightHandle);
    block.title = "拖动片段调整位置；拖动两侧边缘调整开始/结束时间";
    block.addEventListener("click", (event) => {
      event.stopPropagation();
      if (block._skipClick) return;
      this.setActiveMusic(music);
      this.renderTimeline();
      this.renderInspector();
    });
    this.bindMusicMove(block, music);
    this.bindMusicResize(leftHandle, music, block, "left");
    this.bindMusicResize(rightHandle, music, block, "right");
    return block;
  }

  bindMusicMove(block, music) {
    block.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.classList.contains("cine-music-handle")) return;
      event.preventDefault();
      event.stopPropagation();
      this.setActiveMusic(music);
      this.renderInspector();
      const originX = event.clientX;
      const originStart = music.start_seconds;
      const duration = roundTenth(music.end_seconds - music.start_seconds);
      const totalSeconds = Math.max(0.1, framesToSeconds(this.state.total_frames));
      const trackWidth = Math.max(1, block.parentElement.getBoundingClientRect().width);
      let changed = false;
      block.classList.add("dragging");
      const move = (nextEvent) => {
        const delta = (nextEvent.clientX - originX) / trackWidth * totalSeconds;
        const start = clamp(roundTenth(originStart + delta), 0, Math.max(0, roundTenth(totalSeconds - duration)));
        if (start === music.start_seconds) return;
        music.start_seconds = start;
        music.end_seconds = roundTenth(start + duration);
        this.normalizeMusicSchedule();
        this.updateTimelineGeometry();
        changed = true;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        block.classList.remove("dragging");
        if (changed) {
          block._skipClick = true;
          setTimeout(() => { block._skipClick = false; }, 0);
          this.sync();
        } else this.renderTimeline();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
      window.addEventListener("pointercancel", up, { once: true });
    });
  }

  bindMusicResize(handle, music, block, edge) {
    handle.tabIndex = 0;
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.setActiveMusic(music);
      this.renderInspector();
      const originX = event.clientX;
      const originStart = music.start_seconds;
      const originEnd = music.end_seconds;
      const totalSeconds = Math.max(0.1, framesToSeconds(this.state.total_frames));
      const trackWidth = Math.max(1, block.parentElement.getBoundingClientRect().width);
      let changed = false;
      block.classList.add("resizing");
      const move = (nextEvent) => {
        const delta = (nextEvent.clientX - originX) / trackWidth * totalSeconds;
        if (edge === "left") {
          music.start_seconds = clamp(roundTenth(originStart + delta), 0, roundTenth(originEnd - 0.1));
        } else {
          music.end_seconds = clamp(roundTenth(originEnd + delta), roundTenth(originStart + 0.1), totalSeconds);
        }
        this.normalizeMusicSchedule();
        this.updateTimelineGeometry();
        changed = true;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        block.classList.remove("resizing");
        if (changed) this.sync();
        else this.renderTimeline();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
      window.addEventListener("pointercancel", up, { once: true });
    });
    handle.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowRight' ? 0.1 : -0.1;
      const totalSeconds = Math.max(0.1, framesToSeconds(this.state.total_frames));
      if (edge === "left") {
        music.start_seconds = clamp(roundTenth(music.start_seconds + delta), 0, roundTenth(music.end_seconds - 0.1));
      } else {
        music.end_seconds = clamp(roundTenth(music.end_seconds + delta), roundTenth(music.start_seconds + 0.1), totalSeconds);
      }
      this.setActiveMusic(music);
      this.sync();
    });
  }

  renderShotBlock(shot) {
    const block = el("div", "cine-shot");
    block.dataset.shotId = shot.shot_id;
    const total = Math.max(1, this.state.total_frames);
    block.style.left = 100 * shot.start_frame / total + "%";
    block.style.width = 100 * (shot.end_frame - shot.start_frame) / total + "%";

    const render = this.ensureShotRenderMetadata(shot);
    const version =
      render.versions.find((item) => item.version_id === render.active_version) ||
      render.versions.at(-1) ||
      null;
    if (version?.asset_id) {
      const video = document.createElement("video");
      video.className = "cine-shot-media";
      video.src = this.renderAssetUrl(version);
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.preload = "metadata";
      const clipStart = Math.max(0, num(version.clip_start_seconds, framesToSeconds(shot.start_frame)));
      const clipDuration = Math.max(0.1, num(version.clip_duration_seconds, framesToSeconds(shot.end_frame - shot.start_frame)));
      const clipEnd = clipStart + clipDuration;
      let hovering = false;
      const seekToStart = () => {
        try { video.currentTime = clipStart; } catch {}
      };
      video.addEventListener("loadedmetadata", seekToStart, { once: true });
      video.addEventListener("timeupdate", () => {
        if (video.currentTime < clipEnd - 0.04) return;
        seekToStart();
        if (hovering) video.play().catch(() => {});
      });
      block.append(video);
      block.addEventListener("pointerenter", () => {
        hovering = true;
        if (video.currentTime < clipStart || video.currentTime >= clipEnd) seekToStart();
        video.play().catch(() => {});
      });
      block.addEventListener("pointerleave", () => {
        hovering = false;
        video.pause();
        seekToStart();
      });
    } else {
      block.append(el("div", "cine-shot-placeholder", RENDER_LABELS[render.status] || "等待生成"));
    }

    block.append(el("div", "cine-shot-shade"));
    const continuity = this.automaticContinuity(shot);
    if (continuity.lineageStale) {
      block.append(el("span", "cine-shot-mode boundary", "续接源已过期"));
    } else if (continuity.required) {
      block.append(el(
        "span", "cine-shot-mode",
        "视频延长"
      ));
    } else if (!continuity.hasVisual) {
      block.append(el("span", "cine-shot-mode", "纯文生"));
    }
    const caption = el("div", "cine-shot-caption");
    caption.append(el("strong", "", shot.shot_id));
    caption.append(el("span", "cine-duration", framesToSeconds(shot.end_frame - shot.start_frame).toFixed(1) + "s"));
    block.append(caption);
    const durationHandle = el("span", "cine-duration-handle");
    durationHandle.tabIndex = 0;
    durationHandle.setAttribute("role", "separator");
    durationHandle.setAttribute("aria-orientation", "vertical");
    durationHandle.title = "拖动右边缘调整片段时长（5.0–15.0 秒）";
    block.append(durationHandle);
    block.title = continuity.lineageStale
      ? "当前视频仍可查看，但它绑定的上一片段版本已变化；重新生成本片段后才能串联"
      : "拖动片段调整顺序；拖动右边缘调整时长";
    block.tabIndex = 0;
    if (shot.shot_id === this.activeShotId) block.classList.add("selected");

    block.addEventListener("click", (event) => {
      event.stopPropagation();
      if (block._skipClick) return;
      this.setActiveShot(shot);
      this.renderTimeline();
      this.renderInspector();
    });
    block.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.setActiveShot(shot);
        this.renderTimeline();
        this.renderInspector();
      }
    });
    this.bindShotReorder(block, shot);
    this.bindShotDurationResize(durationHandle, shot, block);
    return block;
  }

  bindShotReorder(block, shot) {
    block.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.setActiveShot(shot);
      this.renderInspector();

      const order = [...this.state.shots];
      const originIndex = order.indexOf(shot);
      const remaining = order.filter((item) => item !== shot);
      const trackRect = block.parentElement.getBoundingClientRect();
      const originX = event.clientX;
      let targetIndex = originIndex;
      let moved = false;
      block.classList.add("dragging");

      const move = (nextEvent) => {
        const delta = nextEvent.clientX - originX;
        if (Math.abs(delta) > 3) moved = true;
        block.style.transform = "translateX(" + delta + "px)";
        const ratio = clamp((nextEvent.clientX - trackRect.left) / Math.max(1, trackRect.width), 0, 1);
        const pointerFrame = ratio * this.state.total_frames;
        targetIndex = remaining.reduce(
          (index, candidate) => pointerFrame > (candidate.start_frame + candidate.end_frame) / 2 ? index + 1 : index,
          0
        );
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        block.classList.remove("dragging");
        block.style.transform = "";
        if (moved) {
          block._skipClick = true;
          setTimeout(() => { block._skipClick = false; }, 0);
        }
        const reordered = [...remaining];
        reordered.splice(targetIndex, 0, shot);
        const changed = reordered.some((item, index) => item !== order[index]);
        if (changed) {
          this.state.shots = reordered;
          this.sync();
        } else {
          this.renderTimeline();
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
    });
  }

  updateTimelineGeometry() {
    const total = Math.max(1, this.state.total_frames);
    const totalSeconds = this.state.shots.length ? framesToSeconds(total) : 0;
    const totalLabel = this.toolbar.querySelector(".cine-total");
    if (totalLabel) totalLabel.textContent = "总时长 " + totalSeconds.toFixed(1) + " 秒";

    const ticks = this.main.querySelectorAll(".cine-tick");
    ticks.forEach((tick, index) => {
      tick.textContent = roundTenth(totalSeconds * index / Math.max(1, ticks.length - 1)).toFixed(1) + "s";
    });

    const byId = new Map(this.state.shots.map((item) => [String(item.shot_id), item]));
    for (const element of this.main.querySelectorAll(".cine-shot")) {
      const item = byId.get(String(element.dataset.shotId || ""));
      if (!item) continue;
      element.style.left = 100 * item.start_frame / total + "%";
      element.style.width = 100 * (item.end_frame - item.start_frame) / total + "%";
      const label = element.querySelector(".cine-duration");
      if (label) label.textContent = framesToSeconds(item.end_frame - item.start_frame).toFixed(1) + "s";
    }
    const musicById = new Map(this.state.background_music.map((item) => [String(item.music_id), item]));
    for (const element of this.main.querySelectorAll(".cine-music-clip")) {
      const item = musicById.get(String(element.dataset.musicId || ""));
      if (!item) continue;
      element.style.left = 100 * item.start_seconds / Math.max(0.1, totalSeconds) + "%";
      element.style.width = 100 * (item.end_seconds - item.start_seconds) / Math.max(0.1, totalSeconds) + "%";
      const label = element.querySelector(".cine-music-time");
      if (label) label.textContent = `${item.start_seconds.toFixed(1)}–${item.end_seconds.toFixed(1)}s`;
    }

    const durationInput = this.inspector.querySelector("[data-cine-duration-input]");
    const active = this.activeShot();
    if (durationInput && active) durationInput.value = framesToSeconds(active.end_frame - active.start_frame).toFixed(1);
    const badge = this.inspector.querySelector(".cine-settings.segment .cine-settings-badge");
    if (badge && active) badge.textContent = framesToSeconds(active.end_frame - active.start_frame).toFixed(1) + " 秒";
  }

  bindShotDurationResize(handle, shot, block) {
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.setActiveShot(shot);
      for (const candidate of this.main.querySelectorAll(".cine-shot.selected")) candidate.classList.remove("selected");
      block.classList.add("selected", "resizing");
      this.renderInspector();

      const originX = event.clientX;
      const originSeconds = roundTenth(shot.metadata?.duration_seconds ?? framesToSeconds(shot.end_frame - shot.start_frame));
      const trackWidth = Math.max(1, block.parentElement.getBoundingClientRect().width);
      const timelineSeconds = Math.max(DEFAULT_SEGMENT_SECONDS, framesToSeconds(this.state.total_frames));
      let changed = false;

      const move = (nextEvent) => {
        const deltaSeconds = (nextEvent.clientX - originX) / trackWidth * timelineSeconds;
        const seconds = clamp(roundTenth(originSeconds + deltaSeconds), MIN_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS);
        if (seconds === shot.metadata.duration_seconds) return;
        shot.metadata.duration_seconds = seconds;
        this.normalizeShotSchedule(false);
        this.updateTimelineGeometry();
        changed = true;
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        block.classList.remove("resizing");
        if (changed) this.sync();
        else {
          this.renderTimeline();
          this.renderInspector();
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
      window.addEventListener("pointercancel", up, { once: true });
    });

    handle.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === 'ArrowRight' ? 0.1 : -0.1;
      const current = roundTenth(shot.metadata?.duration_seconds ?? framesToSeconds(shot.end_frame - shot.start_frame));
      shot.metadata.duration_seconds = clamp(roundTenth(current + direction), MIN_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS);
      this.setActiveShot(shot);
      this.sync();
    });
  }

  renderAssetUrl(version) {
    const normalized = String(version?.asset_id || "").replaceAll("\\", "/");
    const parts = normalized.split("/");
    const filename = parts.pop() || "";
    const subfolder = parts.join("/");
    const type = ["input", "output", "temp"].includes(version?.storage_type) ? version.storage_type : "output";
    const params = new URLSearchParams({ filename, type });
    if (subfolder) params.set("subfolder", subfolder);
    return "/view?" + params;
  }

  renderInspector() {
    this.inspector.replaceChildren();
    this.inspector.append(this.renderGlobalSettings());
    const music = this.activeMusic();
    if (music) this.inspector.append(this.renderMusicSettings(music));
    const shot = this.activeShot();
    if (shot) this.inspector.append(this.renderSegmentSettings(shot));
    else this.inspector.append(el("div", "cine-empty", "请先添加一个 5.0 秒片段。"));
  }

  renderGlobalSettings() {
    const panel = el("details", "cine-settings global");
    panel.open = this.globalSettingsExpanded;
    panel.addEventListener("toggle", () => {
      const stableSize = panel._cineSizeBeforeToggle || [...(this.node.size || [])];
      panel._cineSizeBeforeToggle = null;
      this.globalSettingsExpanded = panel.open;
      this.node.properties ??= {};
      this.node.properties.cineGlobalSettingsExpanded = panel.open;
      this.renderToolbar();
      restoreTimelineNodeSize(this.node, stableSize);
    });

    const summary = el("summary", "cine-settings-summary");
    const rememberSize = () => { panel._cineSizeBeforeToggle = [...(this.node.size || [])]; };
    summary.addEventListener("pointerdown", rememberSize, true);
    summary.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") rememberSize();
    }, true);
    const globalRefs = this.globalReferences();
    const badges = globalRefs.length + " 参考 · " + this.state.background_music.length + " BGM";
    summary.append(el("strong", "", "全局设置"), el("span", "cine-settings-badge", badges));
    panel.append(summary);

    const fields = el("div", "cine-fields");
    this.timelineTextarea(fields, "全局提示词", "global_prompt");
    this.timelineTextarea(fields, "全局负面提示词", "negative_prompt");
    fields.append(this.renderReferenceEditor("global", null));
    panel.append(fields);
    return panel;
  }

  renderMusicSettings(music) {
    const panel = el("details", "cine-settings music");
    panel.open = true;
    const filename = String(music.asset_id || "").split(/[\\/]/).pop() || music.music_id;
    const summary = el("summary", "cine-settings-summary");
    summary.append(
      el("strong", "", "背景音乐片段 · " + music.music_id),
      el("span", "cine-settings-badge", filename)
    );
    panel.append(summary);
    const fields = el("div", "cine-fields");
    this.musicSecondsField(fields, "开始时间（秒）", music, "start_seconds");
    this.musicSecondsField(fields, "结束时间（秒）", music, "end_seconds");
    this.objectField(fields, "音量（dB）", music, "volume_db", {
      type: "number", numeric: true, min: -120, max: 24, step: 0.5,
    });
    this.objectField(fields, "循环填满片段", music, "loop", { checkbox: true });
    this.musicSecondsField(fields, "淡入（秒）", music, "fade_in_seconds", 0, 60);
    this.musicSecondsField(fields, "淡出（秒）", music, "fade_out_seconds", 0, 60);
    const actions = el("div", "cine-actions");
    actions.append(this.button("删除此音乐片段", () => this.removeBackgroundMusic(music), "danger"));
    fields.append(actions);
    panel.append(fields);
    return panel;
  }

  findOutputNode(className) {
    const queue = [this.node];
    const visited = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      if (current !== this.node && (current.comfyClass || current.type) === className) {
        return current;
      }
      for (const output of current.outputs || []) {
        for (const linkId of output.links || []) {
          const target = graphNode(graphLink(linkId)?.target_id);
          if (target) queue.push(target);
        }
      }
    }
    return null;
  }

  findDownstreamVideoBranch() {
    const queue = [this.node];
    const visited = new Set();
    let candidate = null;
    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      if (current !== this.node && (current.outputs || []).some((output) => output.type === "VIDEO")) {
        candidate = current;
      }
      for (const output of current.outputs || []) {
        for (const linkId of output.links || []) {
          const target = graphNode(graphLink(linkId)?.target_id);
          if (target) queue.push(target);
        }
      }
    }
    return candidate;
  }

  async assembleSavedSegments() {
    const assets = this.state.shots.map((shot) => {
      const render = this.ensureShotRenderMetadata(shot);
      const version = render.versions.find((item) => item.version_id === render.active_version);
      return { shot_id: shot.shot_id, asset_id: version?.asset_id || "", storage_type: version?.storage_type || "output" };
    });
    const response = await api.fetchApi("/cine_timeline/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assets }),
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) throw new Error(result?.error || `HTTP ${response.status}`);
    this.registerAssembledVideo(result.saved, `ASSEMBLY_${Date.now()}`);
    return result;
  }

  async queueOnlyOutput(className, additionalClassNames = []) {
    const classNames = [className, ...additionalClassNames];
    const outputNodes = classNames.map((name) => {
      const outputNode = this.findOutputNode(name);
      if (!outputNode) throw new Error(`工作流缺少 ${name} 节点`);
      return outputNode;
    });
    const previousModes = outputNodes.map((node) => node.mode);
    outputNodes.forEach((node) => { node.mode = 0; });
    try {
      return await app.queuePrompt(0, 1, outputNodes.map((node) => String(node.id)));
    } finally {
      outputNodes.forEach((node, index) => { node.mode = previousModes[index]; });
    }
  }

  async ensureDynamicLatentPreview() {
    const settings = app?.ui?.settings;
    if (!settings?.getSettingValue || !settings?.setSettingValue) return;
    if (settings.getSettingValue("VHS.LatentPreview") !== true) {
      await settings.setSettingValue("VHS.LatentPreview", true);
    }
    if (settings.getSettingValue("VHS.KeepIntermediate") !== false) {
      await settings.setSettingValue("VHS.KeepIntermediate", false);
    }
  }

  assemblyReadiness() {
    const ready = this.state.shots.filter((shot) => this.shotHasRenderableVersion(shot)).length;
    return { ready, total: this.state.shots.length };
  }

  shotHasRenderableVersion(shot) {
    const render = this.ensureShotRenderMetadata(shot);
    const hasVideo = Boolean(render.active_version) && render.versions.some(
      (version) => version.version_id === render.active_version && String(version.asset_id || "").trim()
    );
    return hasVideo && !this.automaticContinuity(shot).lineageStale;
  }

  async queueAssembly() {
    const readiness = this.assemblyReadiness();
    if (!readiness.total) {
      this.transientMessage = "时间轴没有片段，无法串联";
      this.render();
      return;
    }
    if (this.autoAssemblyActive) return;
    this.autoAssemblyActive = true;
    this.autoAssemblyStage = "checking";
    this.autoAssemblyShotId = "";
    this.transientMessage = readiness.ready === readiness.total
      ? "所有片段已存在，准备串联完整影片…"
      : `正在按顺序检查片段，已有 ${readiness.ready}/${readiness.total}…`;
    this.render();
    await this.continueAutoAssembly();
  }

  async continueAutoAssembly() {
    if (!this.autoAssemblyActive || this.autoAssemblyStage === "segment" || this.autoAssemblyStage === "assembling") return;
    const readiness = this.assemblyReadiness();
    const missing = this.state.shots.find((shot) => !this.shotHasRenderableVersion(shot));
    if (missing) {
      const usage = this.referenceUsage(missing);
      if (!usage.valid) {
        this.stopAutoAssembly(`自动补全已停止：${missing.shot_id} 未通过参考校验`);
        return;
      }
      this.autoAssemblyStage = "segment";
      this.autoAssemblyShotId = missing.shot_id;
      this.transientMessage = `已有 ${readiness.ready}/${readiness.total}，正在补全 ${missing.shot_id}…`;
      this.render();
      await this.queueSingleShot(missing, { fromAutoAssembly: true });
      return;
    }

    this.autoAssemblyStage = "assembling";
    this.autoAssemblyShotId = "";
    this.state.metadata ??= {};
    delete this.state.metadata.render_target_shot_id;
    delete this.state.metadata.render_run_id;
    if (this.targetWidget) this.targetWidget.value = "";
    if (this.runWidget) this.runWidget.value = "";
    this.transientMessage = `所有 ${readiness.total} 个片段已存在，正在自动串联（不会重新采样）…`;
    this.sync();
    try {
      await this.assembleSavedSegments();
    } catch (error) {
      this.stopAutoAssembly(`自动补全已停止：串联任务未排队（${error?.message || error}）`);
    }
  }

  async queueSingleShot(shot, { fromAutoAssembly = false } = {}) {
    const activeTargetId = String(this.state?.metadata?.render_target_shot_id || "").trim();
    const activeRunId = String(this.state?.metadata?.render_run_id || "").trim();
    if (activeTargetId && activeRunId) {
      // A stopped task or browser/server restart can leave the serialized
      // target/run pair behind. Only treat it as a lock while ComfyUI really
      // has work queued; otherwise release it and allow an immediate retry.
      let queueBusy = false;
      try {
        const response = await fetch("/queue", { cache: "no-store" });
        const queue = response.ok ? await response.json() : null;
        queueBusy = Boolean(queue?.queue_running?.length || queue?.queue_pending?.length);
      } catch {
        // If queue state cannot be checked, preserve the lock rather than
        // accidentally scheduling a duplicate long-running generation.
        queueBusy = true;
      }
      if (queueBusy) {
        this.transientMessage = `${activeTargetId} 已在生成队列中，请等待当前任务完成`;
        this.render();
        return false;
      }
      delete this.state.metadata.render_target_shot_id;
      delete this.state.metadata.render_run_id;
      if (this.targetWidget) this.targetWidget.value = "";
      if (this.runWidget) this.runWidget.value = "";
    }
    const usage = this.referenceUsage(shot);
    if (!usage.valid) {
      if (fromAutoAssembly) this.stopAutoAssembly(`自动补全已停止：${shot.shot_id} 未通过参考校验`);
      else {
        this.transientMessage = `${shot.shot_id} 未通过参考校验，不能单独生成`;
        this.render();
      }
      return false;
    }
    const continuity = this.automaticContinuity(shot);
    if (continuity.required && !continuity.previousReady) {
      if (fromAutoAssembly) this.stopAutoAssembly(`自动补全已停止：${shot.shot_id} 的上一片段尚未生成`);
      else {
        this.transientMessage = "请先生成上一片段，或把当前片段转场改为直接切换";
        this.render();
      }
      return false;
    }
    this.state.metadata ??= {};
    this.state.metadata.render_target_shot_id = shot.shot_id;
    const renderRunId = globalThis.crypto?.randomUUID?.()
      || `RUN_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.state.metadata.render_run_id = renderRunId;
    if (this.targetWidget) this.targetWidget.value = shot.shot_id;
    if (this.runWidget) this.runWidget.value = renderRunId;
    const render = this.ensureShotRenderMetadata(shot);
    const previousStatus = render.status;
    render.status = "redo";
    this.transientMessage = `正在把 ${shot.shot_id} 加入单片段生成队列…`;
    this.sync();
    try {
      const saveNode = this.findOutputNode("CineSaveNormalizedVideo")
        || this.findOutputNode("CineSaveSegmentVideo")
        || this.findOutputNode("SaveVideo")
        || this.findDownstreamVideoBranch();
      if (!saveNode) throw new Error("工作流缺少 SaveVideo 节点");
      const validator = this.findOutputNode("CineH3DialogueValidator");
      const targets = [saveNode, validator].filter(Boolean);
      const previousModes = targets.map((node) => node.mode);
      targets.forEach((node) => { node.mode = 0; });
      let queued;
      try {
        await this.ensureDynamicLatentPreview();
        queued = await app.queuePrompt(0, 1, targets.map((node) => String(node.id)));
      } finally {
        targets.forEach((node, index) => { node.mode = previousModes[index]; });
      }
      if (queued === false) throw new Error("ComfyUI 未接受生成任务");
      this.transientMessage = fromAutoAssembly
        ? `${shot.shot_id} 已加入队列；完成后将自动检查下一片段`
        : `${shot.shot_id} 已加入单片段生成队列`;
      this.render();
      return true;
    } catch (error) {
      delete this.state.metadata.render_target_shot_id;
      delete this.state.metadata.render_run_id;
      if (this.targetWidget) this.targetWidget.value = "";
      if (this.runWidget) this.runWidget.value = "";
      render.status = previousStatus;
      if (fromAutoAssembly) this.stopAutoAssembly(`自动补全已停止：${shot.shot_id} 未排队（${error?.message || error}）`);
      else {
        this.transientMessage = `片段生成未排队：${error?.message || error}`;
        this.sync();
      }
      return false;
    }
  }

  renderSegmentSettings(shot) {
    const panel = el("details", "cine-settings segment");
    panel.open = this.segmentSettingsExpanded;
    panel.addEventListener("toggle", () => {
      this.segmentSettingsExpanded = panel.open;
      this.node.properties ??= {};
      this.node.properties.cineSegmentSettingsExpanded = panel.open;
    });

    const duration = framesToSeconds(shot.end_frame - shot.start_frame).toFixed(1);
    const summary = el("summary", "cine-settings-summary");
    summary.append(el("strong", "", "当前片段 · " + shot.shot_id));
    summary.append(el("span", "cine-settings-badge", duration + " 秒"));
    panel.append(summary);

    const fields = el("div", "cine-fields");
    this.shotTextarea(fields, "片段提示词（可包含多个镜头）", shot, "local_prompt");
    const primary = el("div", "cine-primary-row");
    this.shotDurationField(primary, shot);
    const isFirst = this.state.shots[0] === shot;
    this.objectField(primary, "转场", shot, "transition", {
      values: isFirst ? ["cut"] : ["cut", "tail_continuity", "motion_context"],
      labels: {
        cut: "直接切换", tail_continuity: "尾帧续接", motion_context: "视频延长",
      },
    });
    shot.metadata ??= {};
    if (!shot.metadata.postprocess_mode) shot.metadata.postprocess_mode = "rtx_vsr";
    this.objectField(primary, "采样方案", shot.metadata, "postprocess_mode", {
      values: ["single_pass", "rtx_vsr", "hq_latent"],
      labels: {
        single_pass: "单次采样（不做二次采样）",
        rtx_vsr: "RTX VSR（默认 / 快速）",
        hq_latent: "潜空间 2× + H3 四步精修（高质量）",
      },
    });
    fields.append(primary);
    fields.append(this.renderReferenceEditor("shot", shot));
    const continuity = this.automaticContinuity(shot);
    if (continuity.lineageStale) {
      fields.append(el(
        "div", "cine-note pending",
        "续接源已过期：上一片段的激活版本已改变。当前旧视频仍可查看，但不会参与完整影片串联；请重新生成本片段，自动串联也会只补生成这一段。"
      ));
    }
    const actions = el("div", "cine-actions");
    const rerender = this.button("生成当前片段", () => this.queueSingleShot(shot));
    const usage = this.referenceUsage(shot);
    rerender.disabled = this.autoAssemblyActive || !usage.valid || (usage.autoContinuity && !usage.previousReady);
    rerender.title = usage.autoContinuity && !usage.previousReady
      ? (usage.continuityMode === "motion_context"
        ? "先用 CineTimeline 0.10+ 重新生成上一片段，使其登记 AV latent；也可以改用直接切换"
        : "先生成上一片段，程序才能提取其尾帧；也可以改用直接切换")
      : "只生成当前片段；续接模式会读取上一片段当前激活版本";
    actions.append(rerender);
    actions.append(this.button("删除当前片段", () => this.deleteCurrentShot(), "danger"));
    fields.append(actions);
    panel.append(fields);
    return panel;
  }

  timelineTextarea(grid, label, key) {
    const wrap = el("label", "cine-field full prompt", label);
    const input = document.createElement("textarea");
    input.value = this.state[key] || "";
    input.addEventListener("input", () => {
      this.state[key] = input.value;
    });
    input.addEventListener("change", () => {
      this.state[key] = input.value;
      this.sync();
    });
    wrap.append(input);
    grid.append(wrap);
  }

  shotTextarea(grid, label, shot, key) {
    const wrap = el("label", "cine-field full prompt", label);
    const input = document.createElement("textarea");
    input.value = shot[key] || "";
    input.addEventListener("input", () => {
      shot[key] = input.value;
    });
    input.addEventListener("change", () => {
      shot[key] = input.value;
      this.sync();
    });
    wrap.append(input);
    grid.append(wrap);
  }

  shotDurationField(grid, shot) {
    const wrap = el("label", "cine-field", "片段时长（秒）");
    const input = document.createElement("input");
    input.type = "number";
    input.min = MIN_SEGMENT_SECONDS.toFixed(1);
    input.max = MAX_SEGMENT_SECONDS.toFixed(1);
    input.step = "0.1";
    input.dataset.cineDurationInput = "true";
    input.value = roundTenth(shot.metadata?.duration_seconds ?? framesToSeconds(shot.end_frame - shot.start_frame)).toFixed(1);
    input.addEventListener("change", () => {
      const seconds = clamp(roundTenth(input.value), MIN_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS);
      shot.metadata ??= {};
      shot.metadata.duration_seconds = seconds;
      input.value = seconds.toFixed(1);
      this.sync();
    });
    wrap.append(input);
    grid.append(wrap);
  }

  objectField(grid, label, object, key, options = {}) {
    const wrap = el("label", "cine-field " + (options.className || ""), label);
    let input;
    if (options.values) {
      input = document.createElement("select");
      for (const value of options.values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = options.labels?.[value] || value;
        input.append(option);
      }
    } else {
      input = document.createElement("input");
      input.type = options.checkbox ? "checkbox" : options.type || "text";
    }

    if (options.checkbox) input.checked = Boolean(object[key]);
    else input.value = object[key] ?? "";
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.step !== undefined) input.step = String(options.step);
    input.addEventListener("change", () => {
      object[key] = options.checkbox
        ? input.checked
        : options.numeric
          ? num(input.value, options.fallback ?? 0)
          : input.value;
      this.sync();
    });
    if (options.checkbox) wrap.classList.add("checkbox");
    wrap.append(input);
    grid.append(wrap);
  }

  musicSecondsField(grid, label, music, key, minimum = 0, maximum = null) {
    const wrap = el("label", "cine-field", label);
    const input = document.createElement("input");
    const timelineMaximum = maximum ?? Math.max(0.1, framesToSeconds(this.state.total_frames));
    input.type = "number";
    input.min = Number(minimum).toFixed(1);
    input.max = Number(timelineMaximum).toFixed(1);
    input.step = "0.1";
    input.value = roundTenth(music[key] || 0).toFixed(1);
    input.addEventListener("change", () => {
      music[key] = clamp(roundTenth(input.value), minimum, timelineMaximum);
      if (key === "start_seconds" && music.start_seconds >= music.end_seconds) {
        music.start_seconds = roundTenth(Math.max(0, music.end_seconds - 0.1));
      }
      if (key === "end_seconds" && music.end_seconds <= music.start_seconds) {
        music.end_seconds = roundTenth(Math.min(timelineMaximum, music.start_seconds + 0.1));
      }
      input.value = roundTenth(music[key]).toFixed(1);
      this.sync();
    });
    wrap.append(input);
    grid.append(wrap);
  }

  renderReferenceEditor(scope, shot) {
    const refs = scope === "global" ? this.globalReferences() : this.shotReferences(shot);
    const section = el("section", "cine-reference-editor");
    const head = el("div", "cine-reference-head");
    head.append(el("span", "", scope === "global" ? "通用参考" : "片段参考"));
    head.append(el("span", "cine-reference-count", String(refs.length)));
    if (scope === "shot") head.append(this.usagePills(this.referenceUsage(shot)));
    head.append(el("span", "cine-reference-spacer"));
    for (const mediaType of MEDIA_TYPES) head.append(this.renderReferenceAdd(scope, mediaType));
    section.append(head);

    const body = el("div", "cine-ref-body");
    if (refs.length) {
      const grid = el("div", "cine-ref-grid");
      const sorted = [...refs].sort(
        (a, b) => MEDIA_TYPES.indexOf(a.media_type) - MEDIA_TYPES.indexOf(b.media_type) ||
          num(a.media_order) - num(b.media_order)
      );
      for (const ref of sorted) grid.append(this.renderReferenceCard(ref, shot));
      body.append(grid);
    } else {
      body.append(el("div", "cine-ref-empty", scope === "global" ? "暂无通用参考。" : "当前片段暂无专属参考。"));
    }
    body.append(this.renderReferenceDrop(scope));
    section.append(body);
    return section;
  }

  usagePills(usage) {
    const wrap = el("div", "cine-ref-usage");
    for (const [media, label] of [["image", "I"], ["video", "V"], ["audio", "A"]]) {
      const pill = el("span", "cine-usage-pill", label + " " + usage.counts[media] + "/" + MEDIA_LIMITS[media]);
      if (usage.counts[media] > MEDIA_LIMITS[media]) pill.classList.add("invalid");
      wrap.append(pill);
    }
    const total = el("span", "cine-usage-pill", "总 " + usage.counts.total + "/" + MEDIA_LIMITS.total);
    if (!usage.valid) total.classList.add("invalid");
    wrap.append(total);
    if (usage.autoContinuity) {
      const label = "视频延长";
      const mode = el("span", "cine-usage-pill", usage.previousReady ? label : "等待上一段 latent");
      if (!usage.previousReady) mode.classList.add("invalid");
      wrap.append(mode);
    }
    return wrap;
  }

  renderReferenceAdd(scope, mediaType) {
    const wrap = el("span", "cine-ref-add-wrap");
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = MEDIA_ACCEPTS[mediaType];
    input.className = "cine-ref-add-input";
    const button = this.button("+ " + MEDIA_CODES[mediaType], (event) => {
      event.stopPropagation();
      input.click();
    });
    button.title = "选择" + MEDIA_LABELS[mediaType] + "参考文件";
    input.addEventListener("change", async () => {
      await this.uploadReferenceFiles(scope, input.files, mediaType);
      input.value = "";
    });
    wrap.append(button, input);
    return wrap;
  }

  renderReferenceCard(ref, shot) {
    const media = MEDIA_TYPES.includes(ref.media_type) ? ref.media_type : "image";
    const card = el("div", "cine-ref-card " + media);
    const thumb = el("div", "cine-ref-thumb");

    if (media === "image" && ref.asset_id) {
      const image = document.createElement("img");
      image.src = this.referencePreviewUrl(ref.asset_id);
      image.alt = ref.reference_id;
      image.addEventListener("error", () => image.replaceWith(el("span", "", MEDIA_CODES[media])));
      thumb.append(image);
    } else {
      thumb.textContent = media === "video" ? "▶" : media === "audio" ? "♫" : "I";
    }

    const info = el("div", "cine-ref-info");
    const top = el("div", "cine-ref-top");
    const order = document.createElement("input");
    order.type = "number";
    order.className = "cine-ref-order";
    order.min = "1";
    order.max = String(MEDIA_LIMITS[media]);
    order.value = String(ref.media_order || 1);
    order.title = MEDIA_CODES[media] + " 编号";
    order.addEventListener("change", () => {
      ref.media_order = clamp(Math.round(num(order.value, 1)), 1, MEDIA_LIMITS[media]);
      ref.priority = 1000 - ref.media_order;
      this.sync();
    });

    const target = document.createElement("input");
    target.className = "cine-ref-name";
    target.value = ref.target_id || "";
    target.placeholder = ref.asset_id ? String(ref.asset_id).split(/[\\/]/).pop() : "参考名称";
    target.addEventListener("change", () => {
      ref.target_id = target.value;
      this.sync();
    });
    top.append(order, target);

    const type = document.createElement("select");
    type.className = "cine-ref-type";
    const values = [...REFERENCE_TYPES_BY_MEDIA[media]];
    if (ref.type && !values.includes(ref.type)) values.unshift(ref.type);
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = REFERENCE_LABELS[value] || value;
      type.append(option);
    }
    type.value = ref.type || values[0];
    type.addEventListener("change", () => {
      ref.type = type.value;
      this.sync();
    });
    info.append(top, type);

    const remove = el("button", "cine-ref-delete", "×");
    remove.type = "button";
    remove.title = "删除参考";
    remove.addEventListener("click", () => this.removeReference(ref));
    card.append(thumb, info, remove);
    if (this.referenceInvalid(ref)) card.classList.add("invalid");

    card.addEventListener("pointerenter", () => this.showReferencePreview(ref, card));
    card.addEventListener("pointerleave", () => this.scheduleReferencePreviewHide());
    return card;
  }

  referenceInvalid(ref) {
    const shots =
      this.referenceScope(ref) === "global"
        ? this.state.shots
        : [this.state.shots.find((shot) => shot.shot_id === ref.shot_id)].filter(Boolean);
    return shots.some((shot) => !this.referenceUsage(shot).valid);
  }

  referencePreviewUrl(assetId) {
    const normalized = String(assetId || "").replaceAll("\\", "/");
    const parts = normalized.split("/");
    const filename = parts.pop() || "";
    const subfolder = parts.join("/");
    const params = new URLSearchParams({ filename, type: "input" });
    if (subfolder) params.set("subfolder", subfolder);
    return "/view?" + params;
  }

  renderReferenceDrop(scope) {
    const drop = el("div", "cine-ref-drop", "拖入图片、视频或音频，或点击选择文件");
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*,audio/*";
    drop.append(input);
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", () => this.uploadReferenceFiles(scope, input.files));
    for (const type of ["dragenter", "dragover"]) {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add("dragover");
      });
    }
    for (const type of ["dragleave", "drop"]) {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.remove("dragover");
      });
    }
    drop.addEventListener("drop", (event) => this.uploadReferenceFiles(scope, event.dataTransfer?.files || []));
    return drop;
  }

  showReferencePreview(ref, card) {
    if (!ref.asset_id) return;
    this.hideReferencePreview();
    const media = MEDIA_TYPES.includes(ref.media_type) ? ref.media_type : "image";
    const preview = el("div", "cine-ref-preview");
    const title = el("div", "cine-ref-preview-title");
    title.append(el("strong", "", MEDIA_CODES[media] + ref.media_order), el("span", "", ref.asset_id));
    preview.append(title);
    const url = this.referencePreviewUrl(ref.asset_id);
    if (media === "image") {
      const image = document.createElement("img");
      image.src = url;
      preview.append(image);
    } else if (media === "video") {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.controls = true;
      preview.append(video);
      video.play().catch(() => {});
    } else {
      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      preview.append(audio);
    }

    preview.addEventListener("pointerenter", () => {
      if (this.hoverPreviewTimer) clearTimeout(this.hoverPreviewTimer);
    });
    preview.addEventListener("pointerleave", () => this.scheduleReferencePreviewHide());
    document.body.append(preview);
    const anchor = card.getBoundingClientRect();
    const box = preview.getBoundingClientRect();
    const left =
      anchor.right + 10 + box.width <= window.innerWidth
        ? anchor.right + 10
        : Math.max(8, anchor.left - box.width - 10);
    const top = Math.max(8, Math.min(window.innerHeight - box.height - 8, anchor.top));
    preview.style.left = left + "px";
    preview.style.top = top + "px";
    this.hoverPreview = preview;
  }

  scheduleReferencePreviewHide() {
    if (this.hoverPreviewTimer) clearTimeout(this.hoverPreviewTimer);
    this.hoverPreviewTimer = setTimeout(() => this.hideReferencePreview(), 160);
  }

  hideReferencePreview() {
    if (this.hoverPreviewTimer) {
      clearTimeout(this.hoverPreviewTimer);
      this.hoverPreviewTimer = null;
    }
    if (!this.hoverPreview) return;
    for (const media of this.hoverPreview.querySelectorAll("video,audio")) {
      try { media.pause(); } catch {}
    }
    this.hoverPreview.remove();
    this.hoverPreview = null;
  }

  button(text, action, className = "") {
    const button = el("button", "cine-btn " + className, text);
    button.type = "button";
    const actionId = `cine_action_${++cineButtonActionSequence}`;
    globalThis.__cineTimelineButtonActionSequence = cineButtonActionSequence;
    button.dataset.cineActionId = actionId;
    CINE_BUTTON_ACTIONS.set(actionId, action);
    return button;
  }
}

function isH3GenerationSubgraphNode(node) {
  const title = String(node?.title || node?.constructor?.title || "");
  return title.includes("H3 分段生成") || String(node?.type || "") === "c53aef76-a816-4c89-9f7d-88cc7fe75be8";
}

function moveH3LatentPreviewToBottom(node) {
  const widgets = Array.isArray(node?.widgets) ? node.widgets : [];
  const previewWidgets = widgets.filter((item) => item?.name === "vhslatentpreview");
  if (!previewWidgets.length) return false;
  const alreadyLast = widgets.slice(-previewWidgets.length).every((item, index) => item === previewWidgets[index]);
  if (!alreadyLast) {
    node.widgets = [
      ...widgets.filter((item) => item?.name !== "vhslatentpreview"),
      ...previewWidgets,
    ];
  }
  for (const previewWidget of previewWidgets) {
    const canvas = previewWidget?.element;
    const host = canvas?.closest?.(".dom-widget") || canvas?.parentElement;
    if (host?.parentElement && host !== host.parentElement.lastElementChild) {
      host.parentElement.appendChild(host);
    }
  }
  node._cineLatentPreviewAtBottom = true;
  return true;
}

function fitH3LatentPreview(node) {
  moveH3LatentPreviewToBottom(node);
  const previewWidgets = (node.widgets || []).filter((item) => item?.name === "vhslatentpreview");
  const widget = previewWidgets.at(-1);
  for (const staleWidget of previewWidgets.slice(0, -1)) {
    const staleCanvas = staleWidget?.element;
    const staleHost = staleCanvas?.closest?.(".dom-widget") || staleCanvas?.parentElement;
    if (staleCanvas) {
      staleCanvas.dataset.cineLatentPreviewHidden = "true";
      staleCanvas.style.setProperty("display", "none", "important");
    }
    if (staleHost) staleHost.style.setProperty("display", "none", "important");
    staleWidget.computeSize = (width) => [width, 0];
    staleWidget.computedHeight = 0;
  }
  const canvas = widget?.element;
  const ratio = num(widget?.aspectRatio || (canvas?.width && canvas?.height ? canvas.width / canvas.height : 0));
  if (!widget || !canvas || !(ratio > 0)) return false;

  // ComfyUI may also paint the same transient frame through node.imgs. On a
  // subgraph node that becomes a second 30px strip above the VHS DOM preview.
  // The VHS widget is the single canonical live preview for this node.
  if (Array.isArray(node.imgs) && node.imgs.length) node.imgs = [];
  if (node.preview) node.preview = null;

  const nodeWidth = Math.max(240, num(node.size?.[0], 360));
  const availableWidth = Math.max(180, nodeWidth - 24);
  const previewHeight = Math.round(clamp(availableWidth / ratio, 96, 360));
  const previewWidth = Math.round(previewHeight * ratio);
  const host = canvas.closest?.(".dom-widget") || canvas.parentElement;

  delete canvas.dataset.cineLatentPreviewHidden;
  canvas.style.setProperty("display", "block", "important");
  canvas.style.setProperty("width", `${Math.min(availableWidth, previewWidth)}px`, "important");
  canvas.style.setProperty("height", `${previewHeight}px`, "important");
  canvas.style.setProperty("max-width", "100%", "important");
  canvas.style.setProperty("margin", "0 auto", "important");
  canvas.style.setProperty("object-fit", "contain", "important");
  canvas.style.setProperty("background", "#090b0f", "important");
  if (host) {
    host.style.setProperty("display", "flex", "important");
    host.style.setProperty("align-items", "center", "important");
    host.style.setProperty("justify-content", "center", "important");
    host.style.setProperty("height", `${previewHeight + 8}px`, "important");
    host.style.setProperty("min-height", `${previewHeight + 8}px`, "important");
    host.style.setProperty("max-height", `${previewHeight + 8}px`, "important");
    host.style.setProperty("overflow", "hidden", "important");
  }

  widget.computeSize = (width) => [width, previewHeight + 8];
  widget.computedHeight = previewHeight + 8;
  node._cineLatentPreviewBaseHeight ??= Math.max(120, num(node.size?.[1], 304) - 30);
  const targetHeight = Math.max(
    num(node.size?.[1]),
    node._cineLatentPreviewBaseHeight + previewHeight + 12,
  );
  if (Math.abs(num(node.size?.[1]) - targetHeight) > 1) node.setSize?.([nodeWidth, targetHeight]);
  node.graph?.setDirtyCanvas?.(true, true);
  return true;
}

function fitVisibleLatentPreviewCanvases() {
  for (const canvas of document.querySelectorAll(".dom-widget > canvas.h-full.w-full")) {
    if (canvas.dataset.cineLatentPreviewHidden === "true") continue;
    const intrinsicWidth = num(canvas.width);
    const intrinsicHeight = num(canvas.height);
    const host = canvas.parentElement;
    if (!(intrinsicWidth > 0 && intrinsicHeight > 0) || !host) continue;
    // VHS latent previews are born as a 30px-tall canvas in Nodes 2.0.
    // Leave ordinary image/video canvas widgets alone.
    if (num(host.getBoundingClientRect?.().height, num(host.style.height)) > 48 && !canvas.dataset.cineLatentPreview) continue;
    const ratio = intrinsicWidth / intrinsicHeight;
    const availableWidth = Math.max(180, Number.parseFloat(host.style.width) || 340);
    const previewHeight = Math.round(clamp(availableWidth / ratio, 96, 360));
    const previewWidth = Math.round(previewHeight * ratio);
    canvas.dataset.cineLatentPreview = "true";
    canvas.style.setProperty("display", "block", "important");
    canvas.style.setProperty("width", `${Math.min(availableWidth, previewWidth)}px`, "important");
    canvas.style.setProperty("height", `${previewHeight}px`, "important");
    canvas.style.setProperty("max-width", "100%", "important");
    canvas.style.setProperty("margin", "0 auto", "important");
    canvas.style.setProperty("object-fit", "contain", "important");
    canvas.style.setProperty("background", "#090b0f", "important");
    host.style.setProperty("display", "flex", "important");
    host.style.setProperty("align-items", "center", "important");
    host.style.setProperty("justify-content", "center", "important");
    host.style.setProperty("height", `${previewHeight + 8}px`, "important");
    host.style.setProperty("min-height", `${previewHeight + 8}px`, "important");
    host.style.setProperty("max-height", `${previewHeight + 8}px`, "important");
    host.style.setProperty("overflow", "hidden", "important");
  }
}

function fitAllLatentPreviewWidgets() {
  const graphs = [app.graph, ...(app.graph?.subgraphs?.values?.() || [])];
  for (const graph of graphs) {
    for (const node of graph?._nodes || []) {
      if (node.widgets?.some((item) => item?.name === "vhslatentpreview")) fitH3LatentPreview(node);
    }
  }
}

function scheduleH3LatentPreviewFit(event) {
  const outerId = String(event?.detail?.id || "").split(":")[0];
  const candidates = new Set([
    graphNode(outerId),
    ...(app.graph?._nodes || []).filter(isH3GenerationSubgraphNode),
  ]);
  for (const node of candidates) {
    if (!isH3GenerationSubgraphNode(node)) continue;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (fitH3LatentPreview(node) || attempts >= 100) clearInterval(timer);
    }, 100);
  }
}

function stabilizeH3PreviewCanvases() {
  // VHS owns latent preview layout. CineTimeline intentionally does not
  // resize the subgraph node or its promoted widgets.
}

function installH3LatentPreviewListener() {
  if (globalThis.__cineTimelineVhsPreviewHandler) {
    api.removeEventListener?.("VHS_latentpreview", globalThis.__cineTimelineVhsPreviewHandler);
  }
  globalThis.__cineTimelineVhsPreviewHandler = null;
  if (globalThis.__cineTimelineLatentPreviewTimer) clearInterval(globalThis.__cineTimelineLatentPreviewTimer);
  globalThis.__cineTimelineLatentPreviewTimer = null;
  globalThis.__cineTimelineStablePreviewObserver?.disconnect?.();
  globalThis.__cineTimelineStablePreviewObserver = null;
}

// Register immediately as well as from setup. Some ComfyUI frontend builds
// load extension modules after their setup pass, while VHS may begin emitting
// preview events as soon as a queued prompt is accepted.
installH3LatentPreviewListener();

if (!globalThis.__cineTimelineEditorV93) {
  globalThis.__cineTimelineEditorV93 = true;
  app.registerExtension({
    name: "ComfyUI.CineTimeline.Editor.V93",
    setup() {
      // H3 two-pass workflows hold several large frame/latent tensors at once.
      // Keeping VHS intermediates across stages can exhaust host/GPU memory and
      // leave the executor waiting forever during the final decode.
      app.graph.extra ??= {};
      app.graph.extra.VHS_KeepIntermediate = false;
      if (globalThis.__cineTimelineButtonCaptureHandler) {
        document.removeEventListener("click", globalThis.__cineTimelineButtonCaptureHandler, true);
      }
      globalThis.__cineTimelineButtonCaptureHandler = (event) => {
        const button = event.target instanceof Element ? event.target.closest("button") : null;
        const actionId = String(button?.dataset?.cineActionId || "");
        const action = actionId ? CINE_BUTTON_ACTIONS.get(actionId) : null;
        if (!action) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        action(event);
      };
      document.addEventListener("click", globalThis.__cineTimelineButtonCaptureHandler, true);
      api.addEventListener("executed", handleSavedTimelineVideo);
      api.addEventListener("execution_error", handleTimelineExecutionFailure);
      api.addEventListener("execution_interrupted", handleTimelineExecutionFailure);
      installH3LatentPreviewListener();
    },
    async nodeCreated(node) {
      const className = node.comfyClass || node.type;
      if (!["CineTimelineEditor", "CineTimelineStudio", "CineTimelinePlan"].includes(className)) return;
      if (node.cineTimelineEditor?.layoutVersion === TIMELINE_LAYOUT_VERSION) return;
      removeTimelineWidgets(node);
      if (node._cineTimelineOriginalResize) node.onResize = node._cineTimelineOriginalResize;
      const widgets = node.widgets || [];
      const namedSourceWidget = widgets.find((widget) => widget.name === "timeline_state");
      const isTimelineStateWidget = (widget) => {
        try {
          const value = JSON.parse(String(widget?.value || ""));
          return value && typeof value === "object" && Array.isArray(value.shots);
        } catch {
          return false;
        }
      };
      let sourceWidget = isTimelineStateWidget(namedSourceWidget)
        ? namedSourceWidget
        : widgets.find(isTimelineStateWidget) || null;
      if (!sourceWidget) {
        const propertyBackup = String(node.properties?.cineTimelineStateBackup || "");
        let initialState = EMPTY_TIMELINE_STATE;
        try {
          const candidate = JSON.parse(propertyBackup);
          if (candidate && typeof candidate === "object" && Array.isArray(candidate.shots)) {
            initialState = propertyBackup;
          }
        } catch {}
        sourceWidget = node.addWidget?.("text", "timeline_state", initialState, () => {}, { serialize: true }) || null;
      }
      if (!sourceWidget) {
        console.warn("[CineTimeline] timeline_state widget not found");
        return;
      }
      // Repair old workflows whose optional widgets shifted position/name.
      // Preserve one canonical widget of each kind even when its value is empty;
      // older logic renamed empty canonical widgets and created duplicates.
      const otherWidgets = widgets.filter((widget) => widget !== sourceWidget);
      let targetWidget = otherWidgets.find((widget) => /^SEGMENT_\d+$/i.test(String(widget?.value || "").trim()))
        || otherWidgets.find((widget) => widget.name === "render_target_shot_id")
        || null;
      let runWidget = otherWidgets.find((widget) => /^[0-9a-f-]{24,}$/i.test(String(widget?.value || "").trim()))
        || otherWidgets.find((widget) => widget.name === "render_run_id")
        || null;
      if (targetWidget) targetWidget.name = "render_target_shot_id";
      if (runWidget) runWidget.name = "render_run_id";
      for (const widget of otherWidgets) {
        if (widget === targetWidget || widget === runWidget) continue;
        if (["timeline_state", "render_target_shot_id", "render_run_id", "cine_legacy_hidden"].includes(widget.name)) {
          widget.name = "cine_legacy_hidden";
        }
      }
      sourceWidget.name = "timeline_state";
      sourceWidget._cineOriginalComputeSize ??= sourceWidget.computeSize;
      const modelInput = node.inputs?.find((input) => input?.name === "model");
      const timelineInput = node.inputs?.find((input) => input?.name === "timeline_json");
      if (modelInput) {
        modelInput.type = "MODEL";
        delete modelInput.shape;
        delete modelInput.color;
        delete modelInput.color_on;
        delete modelInput.color_off;
      }
      if (timelineInput) {
        timelineInput.type = "STRING";
        delete timelineInput.color;
        delete timelineInput.color_on;
        delete timelineInput.color_off;
      }
      app.graph?.setDirtyCanvas?.(true, true);
      sourceWidget.hidden = true;
      sourceWidget.computeSize = () => [0, -3.3];
      sourceWidget.computedHeight = 0;
      // Old saved workflows do not automatically gain widgets added later to
      // INPUT_TYPES. Add the two internal queue-scope widgets in place so the
      // existing node can submit a single-segment target without being rebuilt.
      const ensureQueueWidget = (name) => (
        node.widgets?.find((widget) => widget.name === name)
        || node.addWidget?.("text", name, "", () => {}, { serialize: true })
        || null
      );
      targetWidget ||= ensureQueueWidget("render_target_shot_id");
      runWidget ||= ensureQueueWidget("render_run_id");
      for (const widget of node.widgets?.filter((item) => (
        item === sourceWidget || item === targetWidget || item === runWidget || item.name === "cine_legacy_hidden"
      )) || []) {
        if (!widget) continue;
        widget.hidden = true;
        widget.computeSize = () => [0, -3.3];
        widget.computedHeight = 0;
      }

      const properties = node.properties ?? (node.properties = {});
      const rawSize = node.size || [0, 0];
      const computedSize = node.computeSize?.() || rawSize;
      const rawWidth = num(rawSize[0]);
      const width = rawWidth >= TIMELINE_MIN_NODE_WIDTH && rawWidth <= TIMELINE_MAX_NODE_WIDTH
        ? rawWidth
        : adaptiveTimelineDefaultWidth();
      const height = num(rawSize[1]) < TIMELINE_MIN_NODE_HEIGHT || num(rawSize[1]) > TIMELINE_MAX_NODE_HEIGHT
        ? TIMELINE_DEFAULT_HEIGHT
        : num(rawSize[1], TIMELINE_DEFAULT_HEIGHT);
      node._cineTimelineDesiredSize = [width, height];
      if (width !== rawSize[0] || height !== rawSize[1]) node.setSize?.([width, height]);

      const editor = new CineTimelineWidget(node, sourceWidget, targetWidget, runWidget);
      editor.layoutVersion = TIMELINE_LAYOUT_VERSION;
      node.cineTimelineEditor = editor;
      node.addDOMWidget("cine_timeline", "CineTimelineWidget", editor.root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => TIMELINE_MIN_HEIGHT,
      });
      const panelInsets = timelinePanelHostInsets(node, editor.root);
      const syncPanel = installTimelineResponsiveSizing(node, editor.root, panelInsets);
      editor.syncPanel = syncPanel;
      exposeNodeResizeGutter(editor.root);
      syncPanel([width, height]);
      const restoreDesiredSize = () => {
        const desired = node._cineTimelineDesiredSize;
        if (Array.isArray(desired)) restoreTimelineNodeSize(node, desired);
      };
      requestAnimationFrame(() => {
        restoreDesiredSize();
        requestAnimationFrame(restoreDesiredSize);
      });
      for (const delay of [50, 250, 1000]) setTimeout(restoreDesiredSize, delay);
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (!["CineTimelineEditor", "CineTimelineStudio", "CineTimelinePlan"].includes(nodeData.name)) return;
      const originalConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function (info) {
        const saved = Array.isArray(info?.size) ? [...info.size] : [...(this.size || [])];
        const savedVersion = num(info?.properties?.cineDefaultSizeVersion);
        const result = originalConfigure?.apply(this, arguments);
        const invalidSavedSize = (
          num(saved?.[0]) < TIMELINE_MIN_NODE_WIDTH ||
          num(saved?.[0]) > TIMELINE_MAX_NODE_WIDTH ||
          num(saved?.[1]) < TIMELINE_MIN_NODE_HEIGHT ||
          num(saved?.[1]) > TIMELINE_MAX_NODE_HEIGHT
        );
        const needsMigration = savedVersion < TIMELINE_SIZE_LAYOUT_VERSION || invalidSavedSize;
        const restored = needsMigration
          ? [adaptiveTimelineDefaultWidth(), TIMELINE_DEFAULT_HEIGHT]
          : [num(saved?.[0]), num(saved?.[1])];
        this._cineTimelineDesiredSize = restored;
        this.properties ??= {};
        this.properties.cineDefaultSizeVersion = TIMELINE_SIZE_LAYOUT_VERSION;
        const applyConfiguredSize = () => {
          restoreTimelineNodeSize(this, restored);
          const editor = this.cineTimelineEditor;
          if (editor) {
            const widgets = this.widgets || [];
            const isTimelineState = (widget) => {
              try {
                const value = JSON.parse(String(widget?.value || ""));
                return value && typeof value === "object" && Array.isArray(value.shots);
              } catch {
                return false;
              }
            };
            // ComfyUI may apply saved widget values after nodeCreated. Rebind
            // by value instead of trusting the earlier positional widget map.
            const source = widgets.find(isTimelineState);
            const target = widgets.find((widget) => /^SEGMENT_\d+$/i.test(String(widget?.value || "").trim()));
            const run = widgets.find((widget) => /^[0-9a-f-]{24,}$/i.test(String(widget?.value || "").trim()));
            if (source) {
              editor.sourceWidget = source;
              source.name = "timeline_state";
            }
            if (target) {
              editor.targetWidget = target;
              target.name = "render_target_shot_id";
            }
            if (run) {
              editor.runWidget = run;
              run.name = "render_run_id";
            }
          }
          this.cineTimelineEditor?.reloadState();
        };
        applyConfiguredSize();
        requestAnimationFrame(applyConfiguredSize);
        for (const delay of [50, 250, 1000]) setTimeout(applyConfiguredSize, delay);
        return result;
      };
      const originalRemoved = nodeType.prototype.onRemoved;
      nodeType.prototype.onRemoved = function () {
        this.cineTimelineEditor?.hideReferencePreview?.();
        this.cineTimelineEditor?.syncPanel?.disconnect?.();
        this.cineTimelineEditor = null;
        return originalRemoved?.apply(this, arguments);
      };
    },
  });
}
