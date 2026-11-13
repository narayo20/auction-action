/* App shell: routing, events, ticker, rival bots. */

import * as store from "./store.js";
import {
  won, esc, maskName, toast, openModal, closeModal, confirmDialog,
  compressImage, debounce, formatMoneyTyping, toInputDateTime, fmtDateTime, fmtSchedule,
  parseAmount, timeLeftText, timeLeftLabel, initials,
} from "./util.js";
import { homeView } from "./views/home.js";
import { detailView } from "./views/detail.js";
import { newView } from "./views/newAuction.js";
import { settlementsView } from "./views/settlements.js";
import { paymentModalHtml, successModalHtml, profileModalHtml } from "./views/modals.js";
import { catalogHtml, statsHtml, liveFeedHtml, endedHtml, bidFeedHtml, TYPES } from "./views/shared.js";

const viewEl = document.getElementById("view");
const ui = { filter: "all", sort: "ending", q: "", settleFilter: "all" };

let lastRouteKey = "";
let lastDetailStatus = "";
let draftImage = "";
let refreshQueued = null;

/* ---------------- routing ---------------- */

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const path = raw.split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "a" && parts[1]) return { name: "detail", id: parts[1] };
  if (parts[0] === "new") return { name: "new" };
  if (parts[0] === "settlements") return { name: "settlements" };
  return { name: "home" };
}

function routeKey(route) {
  return `${route.name}:${route.id || ""}`;
}

function render({ resetScroll = false } = {}) {
  const s = store.getState();
  const route = parseRoute();
  const key = routeKey(route);
  const isNewRoute = key !== lastRouteKey;

  if (route.name === "home") {
    viewEl.innerHTML = homeView(s, ui);
    bindHome();
  } else if (route.name === "new") {
    if (isNewRoute) draftImage = "";
    viewEl.innerHTML = newView(s);
    bindNewForm(s);
  } else if (route.name === "detail") {
    const a = s.auctions.find((x) => x.id === route.id);
    if (a) {
      viewEl.innerHTML = detailView(s, a);
      lastDetailStatus = `${a.status}:${a.winnerBidId || ""}`;
    } else {
      viewEl.innerHTML = notFound();
    }
  } else if (route.name === "settlements") {
    viewEl.innerHTML = settlementsView(s, ui);
  } else {
    viewEl.innerHTML = notFound();
  }

  lastRouteKey = key;
  updateHeader();
  updateTimeDisplays(Date.now());
  if (resetScroll) window.scrollTo({ top: 0, behavior: "instant" });
}

function notFound() {
  return `<div class="not-found"><span class="eyebrow">404</span><h1>경매를 찾을 수 없습니다</h1><p>주소가 바뀌었거나 삭제된 경매입니다.</p><a class="btn primary" href="#/">경매장으로 돌아가기</a></div>`;
}

/* ---------------- header ---------------- */

function updateHeader() {
  const s = store.getState();
  document.getElementById("profileName").textContent = s.profile.name;
  document.getElementById("profileAvatar").textContent = initials(s.profile.name);

  const botBtn = document.getElementById("botToggle");
  botBtn.classList.toggle("on", s.bots);
  botBtn.setAttribute("aria-pressed", String(s.bots));

  const route = parseRoute();
  document.querySelectorAll("[data-nav]").forEach((el) => {
    const nav = el.dataset.nav;
    el.classList.toggle("active", nav === route.name || (nav === "home" && route.name === "detail"));
  });
}

/* ---------------- home ---------------- */

function bindHome() {
  const search = document.getElementById("searchInput");
  if (search) {
    search.addEventListener("input", debounce(() => {
      ui.q = search.value;
      refreshCatalog();
    }, 120));
  }
  const sort = document.getElementById("sortSelect");
  if (sort) {
    sort.addEventListener("change", () => {
      ui.sort = sort.value;
      refreshCatalog();
    });
  }
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("active", b === btn));
      refreshCatalog();
    });
  });
}

function refreshCatalog() {
  const s = store.getState();
  const grid = document.getElementById("catalogGrid");
  if (grid) grid.innerHTML = catalogHtml(s, ui);
  const ended = document.getElementById("endedGrid");
  if (ended) ended.innerHTML = endedHtml(s, ui);
  const count = document.getElementById("activeCount");
  if (count) count.textContent = store.activeAuctions(s).length;
}

/* ---------------- refresh after data change ---------------- */

function refreshCurrent({ structural = false } = {}) {
  const route = parseRoute();
  const s = store.getState();

  if (route.name === "new") {
    updateHeader();
    return;
  }

  if (route.name === "home") {
    refreshCatalog();
    const stats = document.getElementById("statStrip");
    if (stats) stats.innerHTML = statsHtml(s);
    const feed = document.querySelector(".live-list");
    if (feed) feed.innerHTML = liveFeedHtml(s);
    updateHeader();
    updateTimeDisplays(Date.now());
    return;
  }

  if (route.name === "detail") {
    const a = s.auctions.find((x) => x.id === route.id);
    if (!a) {
      render({ resetScroll: false });
      return;
    }
    const sig = `${a.status}:${a.winnerBidId || ""}`;
    if (structural || sig !== lastDetailStatus) {
      render({ resetScroll: false });
      return;
    }
    const feed = document.getElementById("bidFeed");
    if (feed) feed.innerHTML = bidFeedHtml(s, a);
    const feedMobile = document.getElementById("bidFeedMobile");
    if (feedMobile) feedMobile.innerHTML = bidFeedHtml(s, a);
    document.querySelectorAll("[data-bid-count]").forEach((el) => {
      el.textContent = `${a.bids.length}건`;
    });
    const count = document.getElementById("bidCountLabel");
    if (count) count.textContent = a.bids.length;
    const countMobile = document.getElementById("bidCountLabelMobile");
    if (countMobile) countMobile.textContent = a.bids.length;
    updateHeader();
    updateTimeDisplays(Date.now());
    return;
  }

  render({ resetScroll: false });
}

/* ---------------- time displays ---------------- */

function updateTimeDisplays(now) {
  document.querySelectorAll("[data-end]").forEach((el) => {
    const end = Number(el.dataset.end);
    if (!end) {
      el.textContent = "—";
      return;
    }
    const ms = end - now;
    el.textContent = timeLeftText(ms);
    el.classList.toggle("urgent", ms > 0 && ms < 60000);
  });

  const s = store.getState();
  document.querySelectorAll("[data-dutch-price]").forEach((el) => {
    const a = s.auctions.find((x) => x.id === el.dataset.dutchPrice);
    if (!a || a.status !== "active") return;
    const d = store.dutchState(a, now);
    el.textContent = won(d.price);
  });

  document.querySelectorAll("[data-dutch-fill]").forEach((el) => {
    const a = s.auctions.find((x) => x.id === el.dataset.dutchFill);
    if (!a || a.status !== "active") return;
    const d = store.dutchState(a, now);
    const span = Math.max(1, a.startPrice - a.floorPrice);
    el.style.width = `${Math.min(100, Math.max(0, ((a.startPrice - d.price) / span) * 100))}%`;
  });

  document.querySelectorAll("[data-dutch-percent]").forEach((el) => {
    const a = s.auctions.find((x) => x.id === el.dataset.dutchPercent);
    if (!a || a.status !== "active") return;
    el.textContent = `${((store.dutchState(a, now).price / a.startPrice) * 100).toFixed(1)}%`;
  });

  document.querySelectorAll("[data-drop]").forEach((el) => {
    const a = s.auctions.find((x) => x.id === el.dataset.drop);
    if (!a || a.status !== "active") return;
    const d = store.dutchState(a, now);
    el.textContent = d.atFloor ? "최저가 도달" : timeLeftText(d.nextIn);
  });

  document.querySelectorAll("[data-dutch-accept]").forEach((el) => {
    const a = s.auctions.find((x) => x.id === el.dataset.dutchAccept);
    if (!a || a.status !== "active") return;
    el.textContent = `${won(store.dutchState(a, now).price)}에 낙찰받기`;
  });

  const clock = document.getElementById("liveClock");
  if (clock) {
    const d = new Date(now);
    clock.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }
}

/* ---------------- ticker ---------------- */

function startTicker() {
  setInterval(() => {
    const now = Date.now();
    const s = store.getState();
    const needsExpiry = s.auctions.some((a) =>
      (a.status === "active" && now >= a.endAt) ||
      (a.status === "won" && a.paymentDueAt && now > a.paymentDueAt)
    );
    if (needsExpiry) {
      try {
        const { changed, results } = store.processExpired();
        if (changed) {
          for (const r of results) {
            if (r.kind === "won") {
              toast(`「${r.auction.title}」 낙찰 — ${maskName(r.bid.bidderName)} · ${won(r.bid.amount)}`, "success");
            } else if (r.kind === "failed") {
              toast(`「${r.auction.title}」 유찰되었습니다`, "info");
            } else {
              toast(`「${r.auction.title}」 결제 기한이 만료되었습니다`, "error");
            }
          }
          refreshCurrent({ structural: true });
        }
      } catch (err) {
        console.error(err);
      }
    }
    updateTimeDisplays(now);
  }, 1000);
}

/* ---------------- rival bots ---------------- */

function startBots() {
  setInterval(() => {
    const s = store.getState();
    if (!s.bots || document.visibilityState !== "visible" || !document.hasFocus()) return;
    if (parseRoute().name === "new") return;
    if (Math.random() < 0.4) return;
    try {
      const result = store.botBid();
      if (result) {
        if (Math.random() < 0.6) toast("라이벌 봇이 봉인 입찰에 참여했습니다", "live");
        refreshCurrent();
      }
    } catch (err) {
      console.error(err);
    }
  }, 9000);
}

/* ---------------- external sync ---------------- */

function onExternal(message) {
  store.reload();
  if (message?.type === "bid" && message.bidder) {
    toast(`${maskName(message.bidder)}님이 입찰에 참여했습니다`, "live");
  }
  if (refreshQueued) clearTimeout(refreshQueued);
  refreshQueued = setTimeout(() => {
    refreshQueued = null;
    refreshCurrent({ structural: false });
  }, 80);
}

/* ---------------- bid ---------------- */

function handleBid(form) {
  const fd = new FormData(form);
  try {
    const result = store.placeBid(form.dataset.id, {
      name: fd.get("name"),
      contact: fd.get("contact"),
      method: fd.get("method"),
      amount: parseAmount(fd.get("amount")),
    });
    if (result.instant) {
      toast(`낙찰되었습니다! ${won(result.amount)} 결제를 진행해 주세요.`, "success");
    } else {
      toast(`봉인 입찰 ${won(result.amount)}이 접수되었습니다`, "success");
    }
    store.broadcast({
      type: "bid",
      auctionId: form.dataset.id,
      bidder: result.bidderName,
      amount: result.instant ? result.amount : null,
    });
    render({ resetScroll: false });
  } catch (err) {
    toast(err.message, "error");
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
  }
}

/* ---------------- new auction ---------------- */

function bindNewForm(s) {
  const form = document.getElementById("newAuctionForm");
  if (!form) return;

  const imageInput = document.getElementById("imageInput");
  const dropImage = document.getElementById("dropImage");
  const dropInner = document.getElementById("dropzoneInner");
  const removeBtn = document.getElementById("removeImage");
  const dropzone = document.getElementById("dropzone");
  const titleInput = document.getElementById("titleInput");
  const sellerInput = document.getElementById("sellerInput");
  const startPriceInput = document.getElementById("startPriceInput");
  const endAtInput = document.getElementById("endAtInput");
  const dutchFields = document.getElementById("dutchFields");
  const errorEl = document.getElementById("formError");
  const submitBtn = form.querySelector(".submit-row button[type=submit]");

  const previewImage = document.getElementById("previewImage");
  const previewPlaceholder = document.getElementById("previewPlaceholder");
  const previewType = document.getElementById("previewType");
  const previewSeller = document.getElementById("previewSeller");
  const previewPrice = document.getElementById("previewPrice");
  const previewTitle = document.getElementById("previewTitle");
  const previewEnd = document.getElementById("previewEnd");

  function currentType() {
    return form.querySelector("input[name=type]:checked")?.value || "sealed";
  }

  function syncTypeCards() {
    const type = currentType();
    form.querySelectorAll("[data-type-card]").forEach((card) => {
      card.classList.toggle("selected", card.dataset.typeCard === type);
    });
    dutchFields.classList.toggle("hidden", type !== "dutch");
    const t = TYPES[type];
    previewType.className = `type-badge ${t.accent}`;
    previewType.textContent = t.badge;
    updatePreview();
  }

  function updatePreview() {
    const t = TYPES[currentType()];
    previewTitle.textContent = titleInput.value.trim() || "상품명을 입력하세요";
    previewSeller.textContent = `${sellerInput.value.trim() || "등록자"} · ${t.tag}`;
    previewPrice.textContent = won(parseAmount(startPriceInput.value));
    if (endAtInput.value) previewEnd.textContent = fmtDateTime(new Date(endAtInput.value).getTime());
  }

  /* ---------------- 종료 일정 확인 ---------------- */

  const endCheckBtn = document.getElementById("endCheckBtn");
  const endCheckResult = document.getElementById("endCheckResult");
  let confirmedEndAt = 0;

  function renderEndCheck(state, icon, html) {
    endCheckResult.hidden = !html;
    endCheckResult.className = `end-check-result ${state}`;
    endCheckResult.innerHTML = html
      ? `<span class="end-check-icon" aria-hidden="true">${icon}</span><span class="end-check-copy">${html}</span>`
      : "";
    endCheckBtn.classList.toggle("is-checked", state === "ok");
  }

  function endScheduleError(message) {
    confirmedEndAt = 0;
    renderEndCheck("error", "!", `<strong>마감 일정을 확인할 수 없습니다.</strong><small>${esc(message)}</small>`);
    toast(message, "error");
    endAtInput.focus();
    return false;
  }

  function checkEndSchedule({ quiet = false } = {}) {
    const raw = endAtInput.value;
    if (!raw) return endScheduleError("경매 종료 시각을 먼저 지정해 주세요.");
    const ts = new Date(raw).getTime();
    if (!Number.isFinite(ts)) return endScheduleError("날짜 형식이 올바르지 않습니다. 다시 지정해 주세요.");
    const left = ts - Date.now();
    if (left < 60 * 1000) return endScheduleError("마감 시각은 지금부터 최소 1분 뒤로 지정해야 합니다.");

    confirmedEndAt = ts;
    renderEndCheck("ok", "✓",
      `<strong>${fmtSchedule(ts)}</strong><small>${timeLeftLabel(left)} · 이 일정으로 경매가 마감됩니다.</small>`);
    if (!quiet) toast("마감 일정을 확인했습니다.", "success");
    return true;
  }

  function ensureEndConfirmed() {
    const ts = new Date(endAtInput.value || 0).getTime();
    if (confirmedEndAt && confirmedEndAt === ts) return true;
    return checkEndSchedule({ quiet: true });
  }

  function markEndDirty() {
    if (!confirmedEndAt) return;
    confirmedEndAt = 0;
    renderEndCheck("stale", "!",
      "<strong>마감 일정이 변경되었습니다.</strong><small>확인 버튼을 눌러 다시 확인해 주세요.</small>");
  }

  function showImage() {
    if (draftImage) {
      dropImage.src = draftImage;
      dropImage.classList.remove("hidden");
      dropInner.classList.add("hidden");
      removeBtn.classList.remove("hidden");
      previewImage.src = draftImage;
      previewImage.classList.remove("hidden");
      previewPlaceholder.classList.add("hidden");
    } else {
      dropImage.removeAttribute("src");
      dropImage.classList.add("hidden");
      dropInner.classList.remove("hidden");
      removeBtn.classList.add("hidden");
      previewImage.removeAttribute("src");
      previewImage.classList.add("hidden");
      previewPlaceholder.classList.remove("hidden");
    }
  }

  async function acceptFile(file) {
    try {
      draftImage = await compressImage(file);
      showImage();
      toast("상품 이미지가 추가되었습니다", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  imageInput.addEventListener("change", () => {
    if (imageInput.files?.[0]) acceptFile(imageInput.files[0]);
    imageInput.value = "";
  });

  removeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    draftImage = "";
    showImage();
  });

  ["dragover", "dragenter"].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "dragend"].forEach((type) => {
    dropzone.addEventListener(type, () => dropzone.classList.remove("dragging"));
  });
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) acceptFile(file);
  });

  form.querySelectorAll("input[name=type]").forEach((radio) => {
    radio.addEventListener("change", syncTypeCards);
  });

  form.querySelectorAll("[data-quick-end]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const minutes = Number(btn.dataset.quickEnd);
      endAtInput.value = toInputDateTime(Date.now() + minutes * 60000);
      updatePreview();
      markEndDirty();
    });
  });

  form.querySelectorAll("[data-money]").forEach((input) => {
    input.addEventListener("input", () => {
      formatMoneyTyping(input);
      updatePreview();
    });
  });

  titleInput.addEventListener("input", updatePreview);
  sellerInput.addEventListener("input", updatePreview);
  endAtInput.addEventListener("input", () => {
    updatePreview();
    markEndDirty();
  });
  endAtInput.addEventListener("change", () => {
    updatePreview();
    markEndDirty();
  });
  endCheckBtn.addEventListener("click", () => checkEndSchedule());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    if (!ensureEndConfirmed()) {
      errorEl.textContent = "경매 종료 시각을 확인해 주세요.";
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "등록 중...";
    const fd = new FormData(form);
    try {
      const auction = store.createAuction({
        title: fd.get("title"),
        desc: fd.get("desc"),
        image: draftImage,
        seller: fd.get("seller"),
        contact: fd.get("contact"),
        type: fd.get("type"),
        startPrice: parseAmount(fd.get("startPrice")),
        endAt: fd.get("endAt"),
        dropInterval: Number(fd.get("dropInterval")),
        floorPrice: parseAmount(fd.get("floorPrice")),
      });
      toast("경매가 등록되었습니다. 지금부터 입찰할 수 있어요.", "success");
      draftImage = "";
      location.hash = `#/a/${auction.id}`;
    } catch (err) {
      errorEl.textContent = err.message;
      toast(err.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "경매 등록하기";
    }
  });

  showImage();
  syncTypeCards();
  updatePreview();
}

/* ---------------- payment ---------------- */

function openPayment(auctionId) {
  const s = store.getState();
  const auction = s.auctions.find((x) => x.id === auctionId);
  if (!auction) return;
  const wb = store.winnerBid(auction);
  if (!wb) return;

  openModal(paymentModalHtml(auction, wb, s.profile), {
    onMount(root) {
      const form = root.querySelector("#payForm");
      const fieldBlocks = root.querySelectorAll("[data-pay-fields]");
      let method = wb.method || s.profile.method || "card";

      function syncMethods() {
        fieldBlocks.forEach((block) => block.classList.toggle("hidden", block.dataset.payFields !== method));
        root.querySelectorAll("[data-pay-method]").forEach((label) => {
          label.classList.toggle("selected", label.dataset.payMethod === method);
        });
      }
      syncMethods();

      root.querySelectorAll("input[name=payMethod]").forEach((radio) => {
        radio.addEventListener("change", () => {
          method = radio.value;
          syncMethods();
        });
      });

      const cardNumber = root.querySelector("[data-card-number]");
      cardNumber?.addEventListener("input", () => {
        const digits = cardNumber.value.replace(/\D/g, "").slice(0, 16);
        cardNumber.value = digits.replace(/(.{4})/g, "$1 ").trim();
      });

      const expiry = root.querySelector("input[name=cardExpiry]");
      expiry?.addEventListener("input", () => {
        const digits = expiry.value.replace(/\D/g, "").slice(0, 4);
        expiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        let detail = "";
        try {
          if (method === "card") {
            const digits = String(fd.get("cardNumber") || "").replace(/\D/g, "");
            if (digits.length !== 16) throw new Error("카드 번호 16자리를 입력해 주세요.");
            if (!/^\d{2}\/\d{2}$/.test(String(fd.get("cardExpiry") || ""))) throw new Error("유효기간을 MM/YY 형식으로 입력해 주세요.");
            if (!/^\d{3,4}$/.test(String(fd.get("cardCvc") || ""))) throw new Error("CVC 3~4자리를 입력해 주세요.");
            detail = `카드 끝자리 ${digits.slice(-4)}`;
          } else if (method === "bank") {
            const account = String(fd.get("accountNumber") || "").replace(/\D/g, "");
            if (account.length < 6) throw new Error("계좌번호를 입력해 주세요.");
            detail = `${fd.get("bank")} · 계좌 끝자리 ${account.slice(-4)}`;
          } else if (method === "kakao") {
            if (!String(fd.get("kakaoPhone") || "").trim()) throw new Error("카카오페이 연결 번호를 입력해 주세요.");
            detail = "카카오페이 간편결제";
          } else {
            detail = "액션 포인트 결제";
          }
        } catch (err) {
          toast(err.message, "error");
          return;
        }

        const submit = form.querySelector("button[type=submit]");
        const original = submit.textContent;
        submit.disabled = true;
        submit.innerHTML = `<span class="spinner"></span> 결제 승인 중...`;

        setTimeout(() => {
          try {
            const settlement = store.payAuction(auctionId, { method, detail });
            closeModal({ immediate: true });
            render({ resetScroll: false });
            openModal(successModalHtml(settlement));
            toast("결제가 완료되었습니다", "success");
          } catch (err) {
            toast(err.message, "error");
            submit.disabled = false;
            submit.textContent = original;
          }
        }, 1100);
      });
    },
  });
}

/* ---------------- profile ---------------- */

function openProfile() {
  const s = store.getState();
  const myBidCount = s.auctions.reduce(
    (sum, a) => sum + a.bids.filter((b) => b.bidderId === s.profile.id).length,
    0
  );
  const wins = s.auctions.filter((a) => store.winnerBid(a)?.bidderId === s.profile.id).length;

  openModal(profileModalHtml({ ...s.profile, createdAt: s.profile.createdAt || s.createdAt }, { bids: myBidCount, wins }), {
    onMount(root) {
      root.querySelector("#profileForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const fd = new FormData(event.target);
        try {
          store.updateProfile({ name: fd.get("name"), contact: fd.get("contact"), method: fd.get("method") });
          closeModal();
          updateHeader();
          refreshCurrent();
          toast("프로필이 저장되었습니다", "success");
        } catch (err) {
          toast(err.message, "error");
        }
      });
    },
  });
}

/* ---------------- global events ---------------- */

function bindGlobalEvents() {
  window.addEventListener("hashchange", () => render({ resetScroll: true }));

  document.addEventListener("submit", (event) => {
    if (event.target.classList.contains("bid-form")) {
      event.preventDefault();
      handleBid(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("#searchInput")) {
      event.preventDefault();
    }
  });

  document.getElementById("profileChip").addEventListener("click", openProfile);
  document.getElementById("botToggle").addEventListener("click", () => {
    const s = store.getState();
    store.setBots(!s.bots);
    updateHeader();
    toast(s.bots ? "라이벌 봇을 껐습니다" : "라이벌 봇을 켰습니다", "info");
  });

  document.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      const { action, id } = actionEl.dataset;

      if (action === "reset-demo") {
        const ok = await confirmDialog({
          title: "데모를 초기화할까요?",
          message: "이 브라우저에 저장된 모든 경매·입찰·정산 기록이 삭제되고 데모 데이터로 다시 시작합니다.",
          confirmText: "초기화",
          danger: true,
        });
        if (!ok) return;
        store.resetDemo();
        ui.filter = "all";
        ui.q = "";
        ui.sort = "ending";
        ui.settleFilter = "all";
        location.hash = "#/";
        render({ resetScroll: true });
        toast("데모가 초기화되었습니다", "success");
        return;
      }

      if (action === "open-payment") {
        openPayment(id);
        return;
      }

      if (action === "settle") {
        const ok = await confirmDialog({
          title: "정산을 완료 처리할까요?",
          message: "판매자에게 정산액이 지급된 것으로 기록됩니다. 데모 운영자 액션입니다.",
          confirmText: "정산 완료",
        });
        if (!ok) return;
        try {
          const st = store.settleSettlement(id);
          toast(`${won(st.payout)} 정산 완료로 기록했습니다`, "success");
          render({ resetScroll: false });
        } catch (err) {
          toast(err.message, "error");
        }
      }
    }

    const settleFilter = event.target.closest("[data-settle-filter]");
    if (settleFilter) {
      ui.settleFilter = settleFilter.dataset.settleFilter;
      render({ resetScroll: false });
    }
  });
}

/* ---------------- boot ---------------- */

store.ensureSeed();
if (!location.hash) history.replaceState(null, "", "#/");
bindGlobalEvents();
store.listenExternal(onExternal);
render({ resetScroll: true });
startTicker();
startBots();
