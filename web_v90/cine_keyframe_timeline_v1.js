import { app } from "../../scripts/app.js";

const NODE = "CineTimelineKeyframePlanRetired";

function parseState(widget) {
  try { return JSON.parse(String(widget?.value || "{}")); } catch { return null; }
}

function keyframeEditor(node, stateWidget) {
  const root = document.createElement("div");
  root.style.cssText = "padding:10px;background:#17191d;color:#ddd;font:12px sans-serif;min-height:300px;overflow:auto";
  const save = (state) => {
    stateWidget.value = JSON.stringify(state, null, 2);
    node.properties ||= {};
    node.properties.cineKeyframeTimelineBackup = stateWidget.value;
    app.graph?.change?.();
    render();
  };
  const render = () => {
    const state = parseState(stateWidget);
    if (!state?.segments) { root.textContent = "关键帧时间轴数据无效"; return; }
    root.replaceChildren();
    const head = document.createElement("div");
    head.innerHTML = `<b>CineTimeline Studio｜关键帧模式</b><br>总帧数：${state.total_frames}　帧率：${state.fps}`;
    root.append(head);
    state.segments.forEach((segment, segmentIndex) => {
      const card = document.createElement("div");
      card.style.cssText = "margin-top:10px;padding:8px;border:1px solid #48505b;border-radius:6px";
      const title = document.createElement("div");
      title.textContent = `${segment.segment_id}｜${segment.start_frame}–${segment.end_frame - 1}`;
      card.append(title);
      const track = document.createElement("div");
      track.style.cssText = "position:relative;height:34px;margin:8px 2px;background:#252a31;border-radius:4px";
      for (const [index, keyframe] of segment.keyframes.entries()) {
        const marker = document.createElement("button");
        const span = Math.max(1, segment.end_frame - segment.start_frame - 1);
        marker.style.cssText = `position:absolute;left:${100 * (keyframe.frame - segment.start_frame) / span}%;transform:translateX(-50%);top:5px;height:24px`;
        marker.textContent = `${keyframe.frame}`;
        marker.title = keyframe.asset_id || keyframe.role || "关键帧";
        marker.onclick = () => {
          if (index === 0 || index === segment.keyframes.length - 1) return;
          segment.keyframes.splice(index, 1); save(state);
        };
        track.append(marker);
      }
      card.append(track);
      const controls = document.createElement("div");
      const frame = document.createElement("input");
      frame.type = "number"; frame.min = segment.start_frame + 1; frame.max = segment.end_frame - 2;
      frame.value = Math.floor((segment.start_frame + segment.end_frame - 1) / 2);
      frame.style.width = "80px";
      const asset = document.createElement("input");
      asset.placeholder = "input图片路径"; asset.style.width = "210px";
      const add = document.createElement("button"); add.textContent = "插入中间关键帧";
      add.onclick = () => {
        const value = Math.trunc(Number(frame.value));
        if (value <= segment.start_frame || value >= segment.end_frame - 1) return;
        segment.keyframes.push({keyframe_id:`KF_${Date.now()}`, frame:value, role:"guide", asset_id:asset.value});
        segment.keyframes.sort((a,b) => a.frame - b.frame); save(state);
      };
      controls.append(frame, asset, add); card.append(controls); root.append(card);
    });
  };
  render();
  return root;
}

app.registerExtension({
  name: "ComfyOS.CineTimeline.KeyframeMode",
  nodeCreated(node) {
    if (String(node.comfyClass || node.type || "") !== NODE) return;
    node.title = "CineTimeline Studio｜关键帧模式";
    const state = node.widgets?.find(widget => widget.name === "timeline_state");
    if (!state || node.cineKeyframeEditor) return;
    state.type = "converted-widget";
    state.computeSize = () => [0, -4];
    const root = keyframeEditor(node, state);
    node.cineKeyframeEditor = root;
    node.addDOMWidget("cine_keyframe_timeline", "CineKeyframeTimeline", root, {serialize:false, hideOnZoom:false});
    node.setSize?.([760, 620]);
  },
});
