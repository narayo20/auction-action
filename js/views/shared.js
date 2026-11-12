/* Shared view fragments. */

import { TYPES, typeOf, statusOf, highestBid, winnerBid, dutchState, myTopBid, summary, recentBids, activeAuctions, endedAuctions, METHODS } from "../store.js";
import { won, esc, maskName, timeLeftText, timeAgo, fmtDateTime, initials, compactWon } from "../util.js";

export function typeBadge(a, extra = "") {
  const t = typeOf(a);
  return `<span class="type-badge ${t.accent} ${extra}">${t.badge}</span>`;
}

export function statusPill(a) {
  const st = statusOf(a);
  return `<span class="status-pill ${st.cls}">${st.label}</span>`;
}

export function statusPillRaw(status) {
  const st = statusOf({ status });
  return `<span class="status-pill ${st.cls}">${st.label}</span>`;
}

export function displayPrice(a) {
  if (a.status === "active" && a.type === "dutch") return dutchState(a).price;
  if (a.type === "dutch" && a.winnerBidId) {
    const wb = winnerBid(a);
    return wb ? wb.amount : a.startPrice;
  }
  if (["won", "paid", "settled"].includes(a.status)) {
    const wb = winnerBid(a);
    return wb ? wb.amount : a.startPrice;
  }
  return a.startPrice;
}

export function auctionCard(a, profileId, nearestId = null) {
  const t = typeOf(a);
  const mine = myTopBid(a, profileId);
  const wb = winnerBid(a);
  const ended = a.status !== "active";
  const price = displayPrice(a);
  const isDutch = a.type === "dutch" && a.status === "active";
  const nearest = !ended && nearestId === a.id;
  const clock = ended ? statusOf(a).label : timeLeftText(a.endAt - Date.now());
  const urgent = !ended && a.endAt - Date.now() < 60000;

  let priceLabel = "시작가";
  if (isDutch) priceLabel = "현재가";
  if (ended) priceLabel = a.status === "failed" ? "시작가" : "낙찰가";

  let bidText;
  if (a.type === "sealed" && a.status === "active") {
    bidText = `봉인 입찰 ${a.bids.length}건`;
  } else {
    bidText = `입찰 ${a.bids.length}건`;
  }

  let subline = `${esc(a.seller)} · ${t.tag}`;
  if (ended && wb) subline = `낙찰 ${esc(maskName(wb.bidderName))} · ${esc(a.seller)}`;
  if (ended && !wb) subline = `유찰 · ${esc(a.seller)}`;

  return `
    <article class="card ${ended ? "is-ended" : ""} ${nearest ? "is-nearest" : ""}" data-card-id="${a.id}">
      <a class="card-link" href="#/a/${a.id}" aria-label="${esc(a.title)} 경매 상세">
        <div class="card-media">
          ${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.title)}" />` : `<div class="no-image">${esc(initials(a.title))}</div>`}
          <div class="card-top">
            ${typeBadge(a)}
            ${ended
              ? `<span class="status-pill ${statusOf(a).cls}">${statusOf(a).label}</span>`
              : `<span class="card-clock ${urgent ? "urgent" : ""}" data-end="${a.endAt}">${clock}</span>`}
          </div>
          ${mine && !ended ? `<span class="my-chip">내 입찰 ${won(mine.amount)}</span>` : ""}
        </div>
        <div class="card-body">
          ${nearest ? `<span class="nearest-flag"><i></i> 가장 임박한 경매</span>` : ""}
          <div class="card-kicker">${subline}</div>
          <h3 class="card-title">${esc(a.title)}</h3>
          <div class="card-meta">
            <div>
              <span class="micro">${priceLabel}</span>
              <strong class="card-price ${isDutch ? "drop-price" : ""}" ${isDutch ? `data-dutch-price="${a.id}"` : ""}>${won(price)}</strong>
            </div>
            <span class="bid-count">${bidText}</span>
          </div>
        </div>
      </a>
    </article>`;
}

export function catalogHtml(s, ui) {
  let rows = activeAuctions(s);
  if (ui.filter !== "all") rows = rows.filter((a) => a.type === ui.filter);
  const q = (ui.q || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((a) => `${a.title} ${a.seller} ${a.desc}`.toLowerCase().includes(q));
  }
  if (ui.sort === "new") rows.sort((a, b) => b.createdAt - a.createdAt);
  else if (ui.sort === "price") rows.sort((a, b) => displayPrice(a) - displayPrice(b));
  else rows.sort((a, b) => a.endAt - b.endAt);

  if (!rows.length) {
    return `
      <div class="empty-state">
        <div class="empty-mark">A</div>
        <h3>조건에 맞는 경매가 없습니다</h3>
        <p>필터를 바꾸거나 첫 경매를 직접 등록해 보세요.</p>
        <a class="btn primary" href="#/new">경매 등록하기</a>
      </div>`;
  }
  const nearest = activeAuctions(s)[0];
  return rows.map((a) => auctionCard(a, s.profile.id, nearest?.id)).join("");
}

export function statsHtml(s) {
  const sum = summary(s);
  return `
    <div class="stat"><span class="micro">LIVE AUCTIONS</span><strong>${sum.activeCount}</strong><span>진행 중</span></div>
    <div class="stat"><span class="micro">TOTAL BIDS</span><strong>${sum.bidCount}</strong><span>누적 입찰</span></div>
    <div class="stat"><span class="micro">AWARDED</span><strong>${sum.awardedCount}</strong><span>낙찰 건</span></div>
    <div class="stat"><span class="micro">SETTLED</span><strong>${compactWon(sum.settledAmount)}</strong><span>정산 완료액</span></div>`;
}

export function liveFeedHtml(s) {
  const rows = recentBids(s, 6);
  if (!rows.length) {
    return `<li class="feed-empty">아직 입찰이 없습니다. 첫 액션을 걸어보세요.</li>`;
  }
  return rows.map(({ auction, bid }) => {
    const hidden = auction.type === "sealed" && auction.status === "active" && bid.bidderId !== s.profile.id;
    return `
      <li class="live-row">
        <span class="live-avatar">${esc(initials(bid.bidderName))}</span>
        <div class="live-copy">
          <strong>${esc(maskName(bid.bidderName))}</strong>
          <span>${esc(auction.title)}</span>
        </div>
        <div class="live-amount">
          <strong>${hidden ? "•••" : won(bid.amount)}</strong>
          <span>${timeAgo(bid.createdAt)}</span>
        </div>
      </li>`;
  }).join("");
}

export function endedHtml(s, ui) {
  let rows = endedAuctions(s);
  const q = (ui.q || "").trim().toLowerCase();
  if (q) rows = rows.filter((a) => `${a.title} ${a.seller}`.toLowerCase().includes(q));
  rows = rows.slice(0, 6);
  if (!rows.length) return `<p class="muted-note">아직 종료된 경매가 없습니다.</p>`;
  return rows.map((a) => auctionCard(a, s.profile.id)).join("");
}

export function methodLabel(method) {
  return METHODS[method] || "신용카드";
}

export function bidFeedHtml(s, a) {
  if (!a.bids.length) {
    return `<li class="feed-empty">아직 입찰 기록이 없습니다.</li>`;
  }
  const ended = a.status !== "active";
  let rows = [...a.bids];
  if (ended && a.type === "sealed") rows.sort((x, y) => y.amount - x.amount);
  else rows.sort((x, y) => y.createdAt - x.createdAt);

  return rows.map((bid, index) => {
    const mine = bid.bidderId === s.profile.id;
    const revealed = !(a.type === "sealed" && !ended) || mine;
    const isWinner = a.winnerBidId === bid.id;
    return `
      <li class="feed-item ${mine ? "mine" : ""} ${isWinner ? "winner" : ""}">
        <span class="feed-rank">${ended && a.type === "sealed" ? String(index + 1).padStart(2, "0") : esc(initials(bid.bidderName))}</span>
        <div class="feed-who">
          <strong>${esc(maskName(bid.bidderName))}${mine ? ` <em class="me-tag">나</em>` : ""}</strong>
          <span>${methodLabel(bid.method)} · ${timeAgo(bid.createdAt)}${isWinner ? " · 낙찰" : ""}</span>
        </div>
        <strong class="feed-amount">${revealed ? won(bid.amount) : "•••"}</strong>
      </li>`;
  }).join("");
}

export function recentActivity(s, limit = 4) {
  return recentBids(s, limit).map(({ auction, bid }) => {
    const hidden = auction.type === "sealed" && auction.status === "active" && bid.bidderId !== s.profile.id;
    return { auction, bid, hidden };
  });
}

export function dateTime(ts) {
  return fmtDateTime(ts);
}

export function topPriceText(a) {
  if (a.type === "sealed" && a.status === "active") return `최고가 비공개`;
  const top = highestBid(a);
  return top ? won(top.amount) : "입찰 없음";
}

export { TYPES };
