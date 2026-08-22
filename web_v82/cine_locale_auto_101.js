import { app } from "../../../scripts/app.js";

const STYLE_ID = "cine-timeline-auto-locale-style";

function systemLocale() {
  const buttons = [...document.querySelectorAll("button")];
  const comfyLanguage = buttons.map(button => String(button.textContent || button.getAttribute("aria-label") || "")).find(text => /zh[-_]cn|en[-_]us|翻译开启|translation/i.test(text)) || "";
  if (/zh[-_]cn|翻译开启/i.test(comfyLanguage)) return "zh-CN";
  if (/en[-_]us/i.test(comfyLanguage)) return "en";
  const browserLanguage = String(navigator.languages?.[0] || navigator.language || "").toLowerCase();
  if (browserLanguage) return browserLanguage.startsWith("zh") ? "zh-CN" : "en";
  return String(document.documentElement.lang || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = ".cine-language-select{display:none!important}";
  document.head.append(style);
}

let syncing = false;
function syncLocale() {
  if (syncing) return;
  syncing = true;
  try {
    const locale = systemLocale();
    for (const select of document.querySelectorAll("select.cine-language-select")) {
      if (select.value === locale) continue;
      select.value = locale;
      select.dispatchEvent(new Event("change", {bubbles:true}));
    }
  } finally {
    syncing = false;
  }
}

app.registerExtension({
  name: "ComfyUI.CineTimeline.AutoLocale.V2",
  setup() {
    installStyle();
    syncLocale();
    for (const delay of [500, 1500, 3000]) window.setTimeout(() => { installStyle(); syncLocale(); }, delay);
    let scheduled = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => { installStyle(); syncLocale(); }, 50);
    });
    observer.observe(document.documentElement, {
      attributes:true, attributeFilter:["lang"], childList:true, subtree:true,
    });
  },
});
