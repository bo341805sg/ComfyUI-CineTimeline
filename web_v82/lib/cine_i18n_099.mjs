const ZH_EN = {
  "中文": "Chinese", "英文": "English", "语言": "Language",
  "CineTimeline 电影时间轴": "CineTimeline Film Timeline",
  "CineTimeline · 数据解析失败": "CineTimeline · Data parsing failed",
  "上一段": "Previous", "下一段": "Next", "复制本段": "Copy segment",
  "片段提示词": "Segment prompt", "表演设计": "Performance design",
  "参考与交接": "References & handoff", "运行节点后在这里逐段浏览 AI 规划结果": "Run the node to browse the AI plan segment by segment.",
  "H3 模型组件": "H3 Model Components", "LTX 2.3 模型组件": "LTX 2.3 Model Components",
  "模型就绪": "Model ready", "缺少模型": "Missing models", "旧工作流兼容": "Legacy workflow compatibility",
  "H3 生成模式": "H3 Generation Mode", "GPU 分配": "GPU Allocation",
  "单个 / 多参考 Ref2VA": "Single / Multi-reference Ref2VA", "单图 / 首尾帧 I2VA·FL2VA": "Single Image / First-Last Frame I2VA·FL2VA",
  "扩散模型 / UNET": "Diffusion Model / UNET", "文本编码器": "Text Encoder", "文本投影编码器": "Text Projection Encoder",
  "视频 VAE": "Video VAE", "音频 VAE": "Audio VAE", "蒸馏 LoRA": "Distilled LoRA", "参考 LoRA": "Reference LoRA",
  "LoRA 管理 · 有序模型链": "LoRA Manager · Ordered Model Chain", "+ LoRA": "+ LoRA",
  "未添加可选 LoRA": "No optional LoRA added", "向上": "Move up", "向下": "Move down", "删除": "Remove",
  "MiniMax H3 生成参数": "MiniMax H3 Generation Settings", "LTX 2.3 生成参数": "LTX 2.3 Generation Settings",
  "清晰度": "Resolution", "宽高比": "Aspect Ratio", "自定义宽度": "Custom Width", "自定义高度": "Custom Height",
  "采样步数": "Sampling Steps", "种子": "Seed", "逐片段种子": "Per-segment Seed", "递增": "Increment", "固定": "Fixed",
  "参考尺寸": "Reference Size", "匹配输出": "Match Output", "保留最大尺寸": "Keep Maximum Size",
  "允许超出训练时长": "Allow Length Outside Training Range", "引导强度": "Guidance Strength", "最多参考面板": "Maximum Reference Panels",
  "成片输出": "Final Output", "原片": "Original", "保真高清": "Fidelity Enhance", "快速高清": "Fast Enhance", "最终成片": "Final Master",
  "成片增强": "Final Enhancement", "交付尺寸": "Delivery Size", "后处理设备": "Post-process Device",
  "关闭（保留生成结果）": "Off (keep generated result)", "LTX 保真高清（实验）": "LTX Fidelity Enhance (Experimental)",
  "LTX 快速高清（临时）": "LTX Fast Enhance (Temporary)", "SeedVR2 7B 最终成片": "SeedVR2 7B Final Master",
  "保持内部尺寸": "Keep Internal Size", "统一成片响度": "Normalize Master Loudness", "目标响度 (LUFS)": "Target Loudness (LUFS)", "真峰值 (dBTP)": "True Peak (dBTP)",
  "总时长": "Total Duration", "+ 5秒片段": "+ 5s Segment", "收起全局设置": "Collapse Global Settings", "展开全局设置": "Expand Global Settings",
  "串联完整影片": "Assemble Full Film", "查看完整影片": "View Full Film", "时间": "Time", "视频轨": "Video Track", "背景音乐轨": "Background Music Track",
  "全局设置": "Global Settings", "全局提示词": "Global Prompt", "全局负面提示词": "Global Negative Prompt", "通用参考": "Global References",
  "当前片段": "Current Segment", "片段提示词（可包含多个镜头）": "Segment Prompt (may contain multiple shots)", "片段时长（秒）": "Segment Duration (seconds)",
  "转场": "Transition", "直接切换": "Cut", "叠化": "Dissolve", "淡入淡出": "Fade", "匹配剪辑": "Match Cut",
  "片段参考": "Segment References", "当前片段暂无专属参考。": "No segment-specific references.", "生成当前片段": "Generate Current Segment", "删除当前片段": "Delete Current Segment",
  "人物": "Character", "服装": "Costume", "场景": "Scene", "道具": "Prop", "姿态": "Pose", "故事板": "Storyboard", "首帧": "First Frame", "尾帧": "Last Frame", "风格": "Style",
  "运动": "Motion", "视频": "Video", "音频": "Audio", "声音参考": "Audio Reference", "图片": "Image",
  "纯文生": "Text-to-video", "尾帧续接": "Last-frame Continuity", "运动上下文续接": "Motion-context Continuity", "续接源已过期": "Continuity Source Stale",
  "未生成": "Not Generated", "已生成": "Generated", "已确认": "Approved", "待重做": "Redo",
  "拖入图片、视频或音频，或点击选择文件": "Drop image, video or audio here, or click to choose files",
};

const EN_ZH = Object.fromEntries(Object.entries(ZH_EN).map(([zh, en]) => [en, zh]));
Object.assign(EN_ZH, {
  "Off": "关闭", "Source": "源尺寸", "Previous": "上一段", "Next": "下一段", "Copy segment": "复制本段",
  "unknown": "未知", "performance": "表演", "start_state": "起始状态", "end_state": "结束状态",
  "handoff": "交接", "continuity_risks": "连续性风险", "reference_image_indices": "参考图片序号",
  "story": "剧情描述", "service_url": "服务地址", "service_model": "服务模型", "enable_vision": "启用多模态参考分析（关闭仍保留绑定）",
  "total_duration_seconds": "总时长（秒）", "target_segment_seconds": "目标片段时长（秒）",
  "reference_manifest_json": "参考素材清单 JSON", "extra_direction": "附加导演要求", "images": "参考图片",
});

const listeners = new Set();
let activeLocale = null;
function normalize(value) { return String(value || "").toLowerCase().startsWith("en") ? "en" : "zh-CN"; }
export function getLocale() {
  if (activeLocale) return activeLocale;
  const declared = String(document.documentElement.lang || "").trim();
  const system = declared || navigator.languages?.[0] || navigator.language || "zh-CN";
  return normalize(system);
}
export function setLocale(value) {
  const locale = normalize(value);
  activeLocale = locale;
  window.dispatchEvent(new CustomEvent("cine-timeline-locale", {detail:{locale}}));
  for (const listener of listeners) listener(locale);
}
export function onLocaleChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function tr(value, locale=getLocale()) {
  const text = String(value ?? ""); const table = locale === "en" ? ZH_EN : EN_ZH;
  if (table[text] != null) return table[text];
  // Chinese mode must never replace English substrings inside stable technical
  // names such as CineTimeline, LightX2V, model filenames or provider enums.
  if (locale !== "en") return text;
  let result = text;
  const entries = Object.entries(table).sort((a,b)=>b[0].length-a[0].length);
  for (const [from,to] of entries) if (from.length >= 2 && result.includes(from)) result = result.replaceAll(from,to);
  return result;
}
export function localizeDom(root, locale=getLocale()) {
  if (!root) return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let node;
  while((node=walker.nextNode())) { const parent=node.parentElement; if(!parent||["SCRIPT","STYLE","PRE","TEXTAREA"].includes(parent.tagName))continue; const original=node.__cineOriginalText??node.nodeValue; node.__cineOriginalText=original; node.nodeValue=tr(original,locale); }
  for(const element of root.querySelectorAll("[title],[placeholder],[aria-label]")) for(const attr of ["title","placeholder","aria-label"]) if(element.hasAttribute(attr)){const key=`cineOriginal${attr}`; const original=element.dataset[key]??element.getAttribute(attr); element.dataset[key]=original;element.setAttribute(attr,tr(original,locale));}
}
export function languageSelect(onChange) {
  // This internal control is hidden by AutoLocale. Keeping it in the DOM lets
  // the bridge synchronize panels after ComfyUI's translator finishes loading.
  const select=document.createElement("select"); select.className="cine-language-select"; select.setAttribute("aria-hidden","true");
  for(const [value,label] of [["zh-CN","中文"],["en","English"]]){const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);}
  select.value=getLocale(); select.addEventListener("change",()=>{setLocale(select.value);onChange?.();}); return select;
}
