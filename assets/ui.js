/* 通用 UI 小工具 */
(function () {
  const QZ = (window.QZ = window.QZ || {});

  const escapeHtml = (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours) return `${hours} 小时 ${String(minutes).padStart(2, "0")} 分`;
    if (minutes) return `${minutes} 分 ${String(rest).padStart(2, "0")} 秒`;
    return `${rest} 秒`;
  }

  function clock(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function percent(value, digits = 0) {
    if (!Number.isFinite(value)) return "—";
    return `${(value * 100).toFixed(digits)}%`;
  }

  function typeLabel(type) {
    return (
      {
        single: "单选题",
        multiple: "多选题",
        judge: "判断题",
        fill: "填空题",
        short: "简答题"
      }[type] || "单选题"
    );
  }

  function letters(count) {
    return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  let toastTimer = null;
  function toast(message, kind = "info") {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.dataset.kind = kind;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2400);
  }

  function confirmDialog({ title = "请确认", body = "", okLabel = "确定", cancelLabel = "取消", danger = false } = {}) {
    return new Promise(resolve => {
      const dialog = document.getElementById("confirmDialog");
      if (!dialog) {
        resolve(window.confirm(`${title}\n\n${body}`));
        return;
      }
      dialog.querySelector("[data-confirm-title]").textContent = title;
      dialog.querySelector("[data-confirm-body]").textContent = body;
      const ok = dialog.querySelector("[data-confirm-ok]");
      const cancel = dialog.querySelector("[data-confirm-cancel]");
      ok.textContent = okLabel;
      cancel.textContent = cancelLabel;
      ok.classList.toggle("btn-danger", danger);
      ok.classList.toggle("btn-primary", !danger);
      const close = result => {
        dialog.close();
        resolve(result);
      };
      ok.onclick = () => close(true);
      cancel.onclick = () => close(false);
      dialog.oncancel = event => {
        event.preventDefault();
        close(false);
      };
      dialog.showModal();
    });
  }

  function download(filename, text, mime = "application/json") {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pickFile(accept = "application/json") {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.position = "fixed";
      input.style.left = "-9999px";
      input.style.width = "1px";
      input.style.height = "1px";
      document.body.appendChild(input);
      const cleanup = () => input.remove();
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          cleanup();
          resolve({ name: file.name, text: String(reader.result || "") });
        };
        reader.onerror = () => {
          cleanup();
          resolve(null);
        };
        reader.readAsText(file, "utf-8");
      });
      input.addEventListener("cancel", () => {
        cleanup();
        resolve(null);
      }, { once: true });
      input.click();
    });
  }

  QZ.ui = {
    escapeHtml,
    formatTime,
    clock,
    percent,
    typeLabel,
    letters,
    formatDate,
    formatDateTime,
    toast,
    confirm: confirmDialog,
    download,
    pickFile
  };
})();
