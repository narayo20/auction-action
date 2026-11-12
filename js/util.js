/* Shared helpers: formatting, DOM, toasts, modals, image compression. */

export const won = (n) => "₩" + Math.round(Number(n) || 0).toLocaleString("ko-KR");

export function compactWon(n) {
  const v = Number(n) || 0;
  if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
  if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, "") + "만";
  return v.toLocaleString("ko-KR");
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const pad2 = (n) => String(n).padStart(2, "0");

export function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

export function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 0) return "방금";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export function timeLeftText(ms) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}일 ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

export function timeLeftLabel(ms) {
  if (ms <= 0) return "마감";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간 남음`;
  if (h > 0) return `${h}시간 ${m}분 남음`;
  const s = total % 60;
  return m > 0 ? `${m}분 ${s}초 남음` : `${s}초 남음`;
}

export function toInputDateTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseAmount(value) {
  return Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;
}

export function maskName(name) {
  const s = String(name ?? "").trim();
  if (!s) return "익명";
  if (s.length === 1) return s + "*";
  if (s.length === 2) return s[0] + "*";
  return s[0] + "*".repeat(Math.min(2, s.length - 2)) + s.slice(-1);
}

export function maskContact(contact) {
  const digits = String(contact ?? "").replace(/[^\d]/g, "");
  if (digits.length < 7) return "—";
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

export function initials(name) {
  return String(name ?? "?").trim().slice(0, 1) || "?";
}

export function toast(message, kind = "info") {
  const host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="toast-dot"></span><span class="toast-text">${esc(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => {
    el.classList.remove("in");
    el.classList.add("out");
    setTimeout(() => el.remove(), 280);
  }, 3400);
}

/* ---------------- Modal ---------------- */

let keyHandler = null;
let previousFocus = null;

export function openModal(html, { onMount } = {}) {
  const root = document.getElementById("modal");
  if (!root) return;
  previousFocus = document.activeElement;
  root.innerHTML = `<div class="modal-backdrop" data-close></div><div class="modal-panel" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => root.classList.add("show"));

  root.onclick = (event) => {
    if (event.target.closest("[data-close]")) closeModal();
  };
  keyHandler = (event) => {
    if (event.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", keyHandler);

  const panel = root.querySelector(".modal-panel");
  const focusTarget = panel?.querySelector("[autofocus], input, select, textarea, button");
  if (focusTarget) setTimeout(() => focusTarget.focus(), 80);

  if (typeof onMount === "function") onMount(root, panel);
}

export function closeModal({ immediate = false } = {}) {
  const root = document.getElementById("modal");
  if (!root || root.hidden) return;
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
  root.classList.remove("show");
  root.onclick = null;
  const finish = () => {
    root.hidden = true;
    root.innerHTML = "";
    document.body.classList.remove("modal-open");
  };
  if (immediate) finish();
  else setTimeout(finish, 200);
  if (previousFocus && typeof previousFocus.focus === "function") {
    try { previousFocus.focus({ preventScroll: true }); } catch { /* noop */ }
  }
}

export function confirmDialog({ title, message, confirmText = "확인", cancelText = "취소", danger = false }) {
  return new Promise((resolve) => {
    openModal(`
      <div class="confirm-dialog">
        <span class="eyebrow">PLEASE CONFIRM</span>
        <h2>${esc(title)}</h2>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-cancel>${esc(cancelText)}</button>
          <button type="button" class="btn ${danger ? "danger" : "primary"}" data-confirm>${esc(confirmText)}</button>
        </div>
      </div>
    `, {
      onMount(root) {
        root.querySelector("[data-confirm]").addEventListener("click", () => {
          resolve(true);
          closeModal();
        });
        root.querySelector("[data-cancel]").addEventListener("click", () => {
          resolve(false);
          closeModal();
        });
      },
    });
  });
}

/* ---------------- Image ---------------- */

export function compressImage(file, maxSize = 1100, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("이미지 파일만 등록할 수 있습니다."));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("이미지는 12MB 이하만 등록할 수 있습니다."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 열지 못했습니다."));
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fffcf5";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- Misc ---------------- */

export function debounce(fn, wait = 120) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function formatMoneyTyping(input) {
  const caretAtEnd = input.selectionStart === input.value.length;
  const raw = parseAmount(input.value);
  input.value = raw ? raw.toLocaleString("ko-KR") : "";
  if (caretAtEnd) {
    input.setSelectionRange(input.value.length, input.value.length);
  }
}
