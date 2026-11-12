/* Settlement center — pending deals, ledger, seller payouts. */

import { summary, pendingPayments, winnerBid, isMine, METHODS } from "../store.js";
import { won, esc, maskName, fmtDateTime, timeLeftText } from "../util.js";
import { methodLabel } from "./shared.js";

function pendingRow(s, a) {
  const wb = winnerBid(a);
  const mine = isMine(a, s.profile.id);
  return `
    <article class="deal-row">
      <a class="deal-thumb" href="#/a/${a.id}">
        ${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.title)}" />` : `<span>${esc(a.title.slice(0, 1))}</span>`}
      </a>
      <div class="deal-main">
        <a class="deal-title" href="#/a/${a.id}">${esc(a.title)}</a>
        <span class="deal-sub">${esc(a.lot || "LOT")} · 낙찰자 ${esc(maskName(wb?.bidderName))}${mine ? " (나)" : ""} · ${esc(methodLabel(wb?.method))}</span>
      </div>
      <div class="deal-amount">
        <span class="micro">낙찰가</span>
        <strong>${won(wb?.amount || 0)}</strong>
      </div>
      <div class="deal-deadline">
        <span class="micro">결제 기한</span>
        <strong data-end="${a.paymentDueAt || 0}">${timeLeftText((a.paymentDueAt || 0) - Date.now())}</strong>
      </div>
      <div class="deal-action">
        ${mine
          ? `<button type="button" class="btn accent sm" data-action="open-payment" data-id="${a.id}">결제하기</button>`
          : `<span class="wait-pill">낙찰자 결제 대기</span>`}
      </div>
    </article>`;
}

function ledgerRows(s, filter) {
  let rows = [...s.settlements].sort((a, b) => b.paidAt - a.paidAt);
  if (filter === "pending") rows = rows.filter((x) => x.status === "pending");
  if (filter === "settled") rows = rows.filter((x) => x.status === "settled");

  if (!rows.length) {
    return `<tr><td colspan="9" class="table-empty">해당하는 정산 내역이 없습니다.</td></tr>`;
  }

  return rows.map((x) => `
    <tr>
      <td class="mono nowrap">${fmtDateTime(x.paidAt)}</td>
      <td class="ledger-title">
        <a href="#/a/${x.auctionId}">${esc(x.title)}</a>
        <span class="mono">${esc(x.lot || "LOT")} · ${esc(x.txid || "")}</span>
      </td>
      <td>${esc(x.seller)}</td>
      <td>${esc(maskName(x.buyer))}</td>
      <td>${esc(methodLabel(x.method))}</td>
      <td class="num">${won(x.amount)}</td>
      <td class="num muted">−${won(x.commission)}</td>
      <td class="num strong">${won(x.payout)}</td>
      <td>
        ${x.status === "settled"
          ? `<span class="status-pill done">정산 완료</span>`
          : `<button type="button" class="btn ghost sm" data-action="settle" data-id="${x.id}">정산 완료 처리</button>`}
      </td>
    </tr>`).join("");
}

export function settlementsView(s, ui) {
  const sum = summary(s);
  const pending = pendingPayments(s);
  const filter = ui.settleFilter || "all";

  return `
    <div class="settlements-page">
      <div class="page-head">
        <a class="back" href="#/">← 경매장으로</a>
        <span class="eyebrow">SETTLEMENT CENTER</span>
        <h1>정산 센터</h1>
        <p>낙찰된 거래의 결제 상태와 판매자 정산 장부를 한 곳에서 확인합니다. 판매 수수료는 낙찰가의 5%입니다.</p>
      </div>

      <section class="summary-grid" aria-label="정산 요약">
        <div class="summary-card">
          <span class="micro">GROSS VOLUME</span>
          <strong>${won(sum.paidAmount)}</strong>
          <span>누적 결제 금액</span>
        </div>
        <div class="summary-card accent">
          <span class="micro">COMMISSION 5%</span>
          <strong>${won(sum.commission)}</strong>
          <span>플랫폼 수수료</span>
        </div>
        <div class="summary-card">
          <span class="micro">PENDING PAYOUT</span>
          <strong>${won(sum.pendingPayout)}</strong>
          <span>판매자 정산 대기</span>
        </div>
        <div class="summary-card">
          <span class="micro">SETTLED PAYOUT</span>
          <strong>${won(sum.settledPayout)}</strong>
          <span>정산 완료 금액</span>
        </div>
      </section>

      <section class="panel deals-panel">
        <div class="panel-head">
          <div>
            <h2>진행 중 거래 <span class="count">${pending.length}</span></h2>
            <p class="panel-sub">낙찰 후 24시간 안에 결제를 완료해야 합니다.</p>
          </div>
          <span class="status-pill won">낙찰 · 결제 대기</span>
        </div>
        <div class="deal-list">
          ${pending.length ? pending.map((a) => pendingRow(s, a)).join("") : `<div class="empty-line">결제를 기다리는 낙찰 건이 없습니다.</div>`}
        </div>
      </section>

      <section class="panel ledger-panel">
        <div class="panel-head">
          <div>
            <h2>정산 장부</h2>
            <p class="panel-sub">결제 완료된 거래의 정산 내역입니다.</p>
          </div>
          <div class="filter-group small" role="group" aria-label="정산 필터">
            <button type="button" class="filter-btn ${filter === "all" ? "active" : ""}" data-settle-filter="all">전체</button>
            <button type="button" class="filter-btn ${filter === "pending" ? "active" : ""}" data-settle-filter="pending">정산 대기</button>
            <button type="button" class="filter-btn ${filter === "settled" ? "active" : ""}" data-settle-filter="settled">정산 완료</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>결제 일시</th>
                <th>경매</th>
                <th>판매자</th>
                <th>구매자</th>
                <th>결제 수단</th>
                <th class="num">낙찰가</th>
                <th class="num">수수료</th>
                <th class="num">정산액</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerRows(s, filter)}
            </tbody>
          </table>
        </div>
        <p class="table-note"><span class="scroll-hint">← 장부를 좌우로 밀어 전체 항목을 확인하세요. </span>결제 → 정산 대기 → 정산 완료 순서로 상태가 바뀝니다. 정산 완료 처리 버튼은 플랫폼 운영자 역할의 데모 액션입니다.</p>
      </section>

      <section class="settle-info">
        <div><span class="micro">METHODS</span><strong>${Object.values(METHODS).join(" · ")}</strong></div>
        <div><span class="micro">ESCROW FLOW</span><strong>구매자 결제 → 수수료 차감 → 판매자 정산</strong></div>
        <div><span class="micro">PAYMENT WINDOW</span><strong>낙찰 후 24시간</strong></div>
      </section>
    </div>`;
}
