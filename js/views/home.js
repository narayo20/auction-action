/* Home — hero, live board, stats, active catalog, past auctions. */

import { activeAuctions } from "../store.js";
import { esc, timeLeftText, won } from "../util.js";
import { catalogHtml, statsHtml, liveFeedHtml, endedHtml, recentActivity } from "./shared.js";

function filterBtn(value, label, ui) {
  const active = ui.filter === value ? "active" : "";
  return `<button type="button" class="filter-btn ${active}" data-filter="${value}">${label}</button>`;
}

function liveBoard(s) {
  const rows = recentActivity(s, 5);
  return `
    <aside class="liveboard" aria-label="실시간 입찰 피드">
      <div class="liveboard-head">
        <span class="live-tag"><i class="live-dot"></i> LIVE BOARD</span>
        <span class="liveboard-clock" id="liveClock">${timeLeftText(0)}</span>
      </div>
      <div class="liveboard-label">실시간 입찰 피드</div>
      <ul class="live-list">
        ${rows.map(({ auction, bid, hidden }) => `
          <li class="live-row">
            <span class="live-avatar">${esc(bid.bidderName.slice(0, 1))}</span>
            <div class="live-copy">
              <strong>${esc(bid.bidderName.slice(0, 1))}${"*".repeat(Math.max(1, bid.bidderName.length - 1))}</strong>
              <span>${esc(auction.title)}</span>
            </div>
            <div class="live-amount">
              <strong>${hidden ? "•••" : won(bid.amount)}</strong>
              <span>${bid.bot ? "라이벌 봇" : "실시간"}</span>
            </div>
          </li>`).join("") || `<li class="feed-empty">입찰을 기다리는 중입니다.</li>`}
      </ul>
      <div class="liveboard-foot">
        <span>등록부터 낙찰·정산까지</span>
        <strong>ONE FLOW</strong>
      </div>
    </aside>`;
}

export function homeView(s, ui) {
  const active = activeAuctions(s);
  const nearest = active[0];
  return `
    <div class="home">
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow"><i class="live-dot"></i> LIVE AUCTION HOUSE · SEOUL</span>
          <h1>원하는 순간,<br /><em>액션</em>을 걸어라.</h1>
          <p class="hero-lead">
            서로의 금액을 숨기는 봉인 입찰부터, 먼저 누르는 사람이 가져가는 선착순,
            시간이 흐르면 가격이 내려가는 하향 경매까지. <strong>옥션&액션</strong>은
            등록 → 입찰 → 자동 낙찰 → 결제 → 정산을 하나의 흐름으로 연결합니다.
          </p>
          <div class="hero-actions">
            <a class="btn primary lg" href="#/new">내 물건 등록하기</a>
            ${nearest ? `<a class="btn urgent-cta lg" href="#/a/${nearest.id}">
              <span class="heartbeat-dot" aria-hidden="true"></span>
              <span>가장 임박한 경매 보기</span>
              <span class="nearest-count" data-end="${nearest.endAt}">${timeLeftText(nearest.endAt - Date.now())}</span>
            </a>` : `<a class="btn ghost lg" href="#/settlements">정산 장부 보기</a>`}
          </div>
          <div class="hero-meta">
            <div><span class="micro">NEXT CLOSE</span><strong class="nearest-clock" data-end="${nearest ? nearest.endAt : 0}">${nearest ? timeLeftText(nearest.endAt - Date.now()) : "—"}</strong></div>
            <div><span class="micro">BID TYPES</span><strong>SEALED · FIRST · DUTCH</strong></div>
            <div><span class="micro">COMMISSION</span><strong>5%</strong></div>
          </div>
        </div>
        ${liveBoard(s)}
      </section>

      <section class="stat-strip" id="statStrip" aria-label="경매 현황">
        ${statsHtml(s)}
      </section>

      <section class="catalog" aria-labelledby="catalogTitle">
        <div class="section-head">
          <div>
            <span class="eyebrow">LIVE NOW</span>
            <h2 id="catalogTitle">진행 중인 경매 <span class="count" id="activeCount">${active.length}</span></h2>
          </div>
          <div class="catalog-tools">
            <label class="search">
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <input id="searchInput" data-keep="search" type="search" placeholder="상품, 판매자 검색" value="${esc(ui.q)}" autocomplete="off" />
            </label>
            <select id="sortSelect" data-keep="sort" class="select" aria-label="정렬">
              <option value="ending" ${ui.sort === "ending" ? "selected" : ""}>마감 임박순</option>
              <option value="new" ${ui.sort === "new" ? "selected" : ""}>최신 등록순</option>
              <option value="price" ${ui.sort === "price" ? "selected" : ""}>낮은 가격순</option>
            </select>
          </div>
        </div>

        <div class="filter-row">
          <div class="filter-group" role="group" aria-label="입찰 방식 필터">
            ${filterBtn("all", "전체", ui)}
            ${filterBtn("sealed", "봉인 입찰", ui)}
            ${filterBtn("first", "선착순", ui)}
            ${filterBtn("dutch", "하향 경매", ui)}
          </div>
          <span class="filter-hint">마감 시각이 지나면 자동으로 낙찰 처리됩니다</span>
        </div>

        <div id="catalogGrid" class="catalog-grid">
          ${catalogHtml(s, ui)}
        </div>
      </section>

      <section class="past" aria-labelledby="pastTitle">
        <div class="section-head">
          <div>
            <span class="eyebrow">RESULTS</span>
            <h2 id="pastTitle">지난 경매 결과</h2>
          </div>
          <a class="text-link" href="#/settlements">정산 장부에서 전체 내역 보기 →</a>
        </div>
        <div id="endedGrid" class="catalog-grid compact">
          ${endedHtml(s, ui)}
        </div>
      </section>

      <section class="how" aria-labelledby="howTitle">
        <div class="how-head">
          <span class="eyebrow">STATE MACHINE</span>
          <h2 id="howTitle">경매는 이렇게 흘러갑니다</h2>
        </div>
        <ol class="flow">
          <li><span>01</span><h3>등록</h3><p>이미지·시작가·마감 시각·입찰 방식을 정해 경매를 엽니다.</p></li>
          <li><span>02</span><h3>실시간 입찰</h3><p>방식에 따라 봉인·선착순·하향 가격으로 입찰이 쌓입니다.</p></li>
          <li><span>03</span><h3>자동 낙찰</h3><p>마감 시각이 지나면 최고가 또는 첫 입찰자가 자동으로 낙찰됩니다.</p></li>
          <li><span>04</span><h3>결제 · 정산</h3><p>낙찰자가 모의 결제를 완료하면 5% 수수료를 뺀 정산 장부가 생성됩니다.</p></li>
        </ol>
      </section>
    </div>`;
}

export function endedSectionHtml(s, ui) {
  return endedHtml(s, ui);
}
