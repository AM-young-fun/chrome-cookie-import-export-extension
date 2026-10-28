const domainElement = document.querySelector("#domain");
const pageUrlElement = document.querySelector("#page-url");
const exportButton = document.querySelector("#export");
const importButton = document.querySelector("#import");
const fileInput = document.querySelector("#file");
const statusElement = document.querySelector("#status");

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
      } else if (!response?.ok) {
        reject(new Error(response?.error || "操作失败。"));
      } else {
        resolve(response.data);
      }
    });
  });
}

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.className = `status ${kind}`.trim();
}

function setEnabled(enabled) {
  exportButton.disabled = !enabled;
  importButton.disabled = !enabled;
}

function safeFilePart(value) {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "") || "site";
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = objectUrl;
  anchor.download = `cookies-${safeFilePart(data.domain)}-${date}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function loadSite() {
  try {
    const site = await sendMessage({ type: "getCurrentSite" });
    domainElement.textContent = site.hostname;
    pageUrlElement.textContent = site.url;
    setEnabled(true);
    setStatus("可以开始导出或导入。", "success");
  } catch (error) {
    domainElement.textContent = "当前页面不可用";
    pageUrlElement.textContent = "请切换到普通网站页面";
    setEnabled(false);
    setStatus(error.message, "error");
  }
}

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  setStatus("正在读取 Cookie…");
  try {
    const data = await sendMessage({ type: "exportCookies" });
    downloadJson(data);
    setStatus(`已导出 ${data.cookies.length} 条 Cookie。`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    exportButton.disabled = false;
  }
});

importButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    setStatus("文件过大，最多支持 5 MB。", "error");
    return;
  }
  importButton.disabled = true;
  setStatus("正在导入 Cookie…");
  try {
    const payload = JSON.parse(await file.text());
    const result = await sendMessage({ type: "importCookies", payload });
    if (result.failed) {
      setStatus(`已导入 ${result.imported}/${result.total} 条，${result.failed} 条失败。`, "error");
    } else {
      setStatus(`导入完成，共写入 ${result.imported} 条 Cookie。`, "success");
    }
  } catch (error) {
    setStatus(error instanceof SyntaxError ? "文件不是有效的 JSON。" : error.message, "error");
  } finally {
    importButton.disabled = false;
  }
});

loadSite();
