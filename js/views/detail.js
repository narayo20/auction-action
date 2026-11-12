/* Auction detail — bid panels, live state, result & settlement panel. */

import { TYPES, METHODS, typeOf, statusOf, winnerBid, highestBid, myTopBid, dutchState, isMine } from "../store.js";
import { won, esc, maskName, timeLeftText, fmtDateTime, maskContact } from "../util.js";
import { typeBadge, statusPill, bidFeedHtml, methodLabel } from "./shared.js";

function methodOptions(selected) {
  return Object.entries(METHODS)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function fieldError(message) {
  return message ? `<p class="form-error">${esc(message)}</p>` : "";
}

function bidForm(s, a, { instant = false } = {}) {
  const top = myTopBid(a, s.profile.id);
  const amountValue = a.type === "dutch" ? "" : String(a.startPrice);
  return `
    <form class="bid-form" data-id="${a.id}" novalidate>
      <div class="field-grid">
        <label class="field">
          <span>입찰자 이름</span>
          <input name="name" type="text" maxlength="20" required value="${esc(s.profile.name)}" placeholder="이름" />
        </label>
        <label class="field">
          <span>연락처</span>
          <input name="contact" type="tel" maxlength="20" required value="${esc(s.profile.contact)}" placeholder="010-0000-0000" />
        </label>
      </div>

      ${a.type !== "dutch" ? `
        <label class="field">
          <span>${instant ? "낙찰 금액" : "입찰 금액"} <em class="micro">최소 ${won(a.startPrice)}</em></span>
          <div class="money-input">
            <span class="currency">₩</span>
            <input name="amount" type="text" inputmode="numeric" required value="${won(a.startPrice).slice(1)}" data-money autocomplete="off" />
          </div>
        </label>` : ""}

      <label class="field">
        <span>결제 방법</span>
        <select name="method">${methodOptions(s.profile.method)}</select>
      </label>

      <button type="submit" class="btn ${instant ? "accent" : "primary"} block lg">
        ${instant ? "지금 입찰하고 즉시 낙찰받기" : "봉인 입찰하기"}
      </button>
      <p class="form-note">
        ${instant
          ? "이 버튼을 누르는 순간 낙찰이 확정됩니다. 결제는 낙찰 후 24시간 안에 진행하세요."
          : "입찰 금액은 마감 전까지 다른 참가자에게 공개되지 않습니다. 마감 후 최고가가 낙찰됩니다."}
      </p>
      ${top ? `<div class="my-bid-chip">내 최고 입찰 <strong>${won(top.amount)}</strong> · ${fmtDateTime(top.createdAt)}</div>` : ""}
    </form>`;
}

function sealedPanel(s, a) {
  const top = myTopBid(a, s.profile.id);
  return `
    <div class="bid-box sealed">
      <div class="bid-box-head">
        ${typeBadge(a)}
        ${statusPill(a)}
      </div>
      <div class="price-block">
        <span class="micro">STARTING PRICE</span>
        <strong class="big-price">${won(a.startPrice)}</strong>
        <span class="price-sub">봉인 입찰 <strong data-bid-count>${a.bids.length}건</strong> 접수${top ? ` · 내 최고가 ${won(top.amount)}` : ""}</span>
      </div>
      <div class="countdown-bar">
        <span>마감까지</span>
        <strong data-end="${a.endAt}">${timeLeftText(a.endAt - Date.now())}</strong>
      </div>
      ${bidForm(s, a)}
    </div>`;
}

function firstPanel(s, a) {
  return `
    <div class="bid-box first">
      <div class="bid-box-head">
        ${typeBadge(a)}
        ${statusPill(a)}
      </div>
      <div class="price-block">
        <span class="micro">STARTING PRICE</span>
        <strong class="big-price">${won(a.startPrice)}</strong>
        <span class="price-sub">가장 먼저 입찰한 1명이 <strong>즉시 낙찰</strong>됩니다.</span>
      </div>
      <div class="countdown-bar">
        <span>마감까지</span>
        <strong data-end="${a.endAt}">${timeLeftText(a.endAt - Date.now())}</strong>
      </div>
      <div class="instant-note"><i>⚡</i> 입찰 버튼을 누르는 순간 경매가 종료됩니다.</div>
      ${bidForm(s, a, { instant: true })}
    </div>`;
}

function dutchPanel(s, a) {
  const d = dutchState(a);
  const span = Math.max(1, a.startPrice - a.floorPrice);
  const fill = Math.min(100, Math.max(0, ((a.startPrice - d.price) / span) * 100));
  return `
    <div class="bid-box dutch">
      <div class="bid-box-head">
        ${typeBadge(a)}
        ${statusPill(a)}
      </div>
      <div class="price-block">
        <span class="micro">CURRENT DROP PRICE</span>
        <strong class="big-price drop-price" data-dutch-price="${a.id}">${won(d.price)}</strong>
        <span class="price-sub"><span data-dutch-percent="${a.id}">${((d.price / a.startPrice) * 100).toFixed(1)}%</span> · 시작가 ${won(a.startPrice)}</span>
      </div>

      <div class="drop-track" aria-hidden="true"><span data-dutch-fill="${a.id}" style="width:${fill}%"></span></div>
      <div class="drop-meta">
        <span>최저가 ${won(a.floorPrice)}</span>
        <span>${d.atFloor ? "최저가 도달" : `다음 하락 <strong data-drop="${a.id}">${timeLeftText(d.nextIn)}</strong>`}</span>
      </div>
      <p class="drop-rule">입찰자가 없으면 ${a.dropInterval}초마다 시작가의 <strong>0.5% (${won(d.stepDrop)})</strong>씩 자동 하락합니다. 원하는 가격이 되면 바로 수락하세요.</p>

      <div class="countdown-bar">
        <span>경매 마감까지</span>
        <strong data-end="${a.endAt}">${timeLeftText(a.endAt - Date.now())}</strong>
      </div>

      <form class="bid-form" data-id="${a.id}" novalidate>
        <div class="field-grid">
          <label class="field"><span>입찰자 이름</span><input name="name" type="text" maxlength="20" required value="${esc(s.profile.name)}" /></label>
          <label class="field"><span>연락처</span><input name="contact" type="tel" maxlength="20" required value="${esc(s.profile.contact)}" /></label>
        </div>
        <label class="field"><span>결제 방법</span><select name="method">${methodOptions(s.profile.method)}</select></label>
        <button type="submit" class="btn accent block lg" data-dutch-accept="${a.id}">
          ${won(d.price)}에 낙찰받기
        </button>
        <p class="form-note">버튼을 누르는 순간 현재가로 낙찰이 확정됩니다.</p>
      </form>
    </div>`;
}

function receiptRows(a, st) {
  const payment = a.payment || {};
  return `
    <dl class="receipt-list">
      <div><dt>낙찰 금액</dt><dd>${won(payment.amount || st?.amount || 0)}</dd></div>
      <div><dt>결제 수단</dt><dd>${esc(payment.methodLabel || methodLabel(payment.method || st?.method))}</dd></div>
      <div><dt>결제 일시</dt><dd>${fmtDateTime(payment.paidAt || a.paidAt)}</dd></div>
      <div><dt>거래 번호</dt><dd class="mono">${esc(payment.txid || st?.txid || "—")}</dd></div>
      <div><dt>판매 수수료 (5%)</dt><dd>${won(st?.commission ?? Math.round((payment.amount || 0) * 0.05))}</dd></div>
      <div class="total"><dt>판매자 정산액</dt><dd>${won(st?.payout ?? 0)}</dd></div>
    </dl>`;
}

function resultPanel(s, a) {
  const st = statusOf(a);
  const wb = winnerBid(a);
  const mine = isMine(a, s.profile.id);
  const settlement = s.settlements.find((x) => x.auctionId === a.id);

  if (a.status === "failed") {
    return `
      <div class="bid-box failed">
        <div class="bid-box-head">${typeBadge(a)}${statusPill(a)}</div>
        <div class="result-hero failed">
          <span class="result-mark">×</span>
          <h2>유찰되었습니다</h2>
          <p>${esc(a.failReason || "낙찰자가 없습니다.")}</p>
        </div>
        <dl class="receipt-list">
          <div><dt>시작가</dt><dd>${won(a.startPrice)}</dd></div>
          <div><dt>마감</dt><dd>${fmtDateTime(a.endAt)}</dd></div>
          <div><dt>입찰 수</dt><dd>${a.bids.length}건</dd></div>
        </dl>
        <a class="btn primary block" href="#/new">새 경매 등록하기</a>
      </div>`;
  }

  const paid = a.status === "paid" || a.status === "settled";
  return `
    <div class="bid-box result">
      <div class="bid-box-head">${typeBadge(a)}${statusPill(a)}</div>
      <div class="result-hero ${paid ? "paid" : "won"}">
        <span class="result-mark">${paid ? "✓" : "!"}</span>
        <span class="eyebrow">${paid ? "PAYMENT COMPLETE" : "AUCTION CLOSED"}</span>
        <h2>${paid ? "결제가 완료되었습니다" : mine ? "축하합니다, 낙찰되었습니다" : "낙찰자가 결정되었습니다"}</h2>
        <p>${esc(maskName(wb?.bidderName))} · <strong>${won(wb?.amount || 0)}</strong></p>
      </div>

      ${!paid ? `
        <div class="payment-deadline">
          <span>결제 기한</span>
          <strong data-end="${a.paymentDueAt || 0}">${timeLeftText((a.paymentDueAt || 0) - Date.now())}</strong>
        </div>
        ${mine
          ? `<button type="button" class="btn accent block lg" data-action="open-payment" data-id="${a.id}">${won(wb?.amount || 0)} 결제하기</button>
             <p class="form-note">모의 결제입니다. 실제 금액은 청구되지 않습니다.</p>`
          : `<p class="form-note center">낙찰자에게 결제 안내가 발송되었습니다. (데모)</p>`}
      ` : `${receiptRows(a, settlement)}
          ${settlement?.status === "settled"
            ? `<div class="settled-banner">판매자 정산까지 완료되었습니다 · ${fmtDateTime(settlement.settledAt)}</div>`
            : `<a class="btn ghost block" href="#/settlements">정산 센터에서 확인하기</a>`}
      `}

      ${a.type === "sealed" ? `<p class="reveal-note">봉인 입찰 금액이 모두 공개되었습니다. 아래 입찰 기록에서 순위를 확인하세요.</p>` : ""}
    </div>`;
}

export function detailView(s, a) {
  const t = typeOf(a);
  const wb = winnerBid(a);

  let panel;
  if (a.status === "active") {
    panel = a.type === "sealed" ? sealedPanel(s, a) : a.type === "first" ? firstPanel(s, a) : dutchPanel(s, a);
  } else {
    panel = resultPanel(s, a);
  }

  return `
    <div class="detail">
      <div class="detail-top">
        <a class="back" href="#/">← 경매장으로</a>
        <span class="lot-mono">${esc(a.lot || "LOT")} / ${esc(a.id.slice(-6).toUpperCase())}</span>
      </div>

      <div class="detail-grid">
        <div class="detail-main">
          <figure class="detail-media">
            ${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.title)}" />` : `<div class="no-image xl">${esc(a.title.slice(0, 1))}</div>`}
            <figcaption>
              <div class="media-badges">${typeBadge(a)}${statusPill(a)}</div>
              <span class="media-lot">${esc(a.lot || "LOT")}</span>
            </figcaption>
          </figure>

          <section class="panel info-panel">
            <div class="info-head">
              <span class="eyebrow">${t.tag}</span>
              <h1>${esc(a.title)}</h1>
              <p class="seller-line">등록자 <strong>${esc(a.seller)}</strong> · ${fmtDateTime(a.createdAt)} 등록</p>
            </div>

            <p class="detail-desc">${esc(a.desc || "등록자가 상세 설명을 남기지 않았습니다.")}</p>

            <dl class="spec-grid">
              <div><dt>입찰 방식</dt><dd>${t.label}</dd></div>
              <div><dt>시작가</dt><dd>${won(a.startPrice)}</dd></div>
              <div><dt>마감 시각</dt><dd>${fmtDateTime(a.endAt)}</dd></div>
              <div><dt>입찰 수</dt><dd>${a.bids.length}건</dd></div>
              ${a.type === "dutch" ? `<div><dt>하락 규칙</dt><dd>0.5% · ${a.dropInterval}초</dd></div><div><dt>최저가</dt><dd>${won(a.floorPrice)}</dd></div>` : ""}
              ${wb ? `<div><dt>낙찰가</dt><dd>${won(wb.amount)}</dd></div><div><dt>낙찰자</dt><dd>${esc(maskName(wb.bidderName))}</dd></div>` : ""}
              <div><dt>연락처</dt><dd>${esc(maskContact(a.sellerContact))}</dd></div>
            </dl>

            <div class="rule-note">
              <strong>${t.badge} 규칙</strong>
              <p>${t.blurb}</p>
            </div>
          </section>
        </div>

        <aside class="detail-side">
          <div id="sidePanel">${panel}</div>

          <section class="panel feed-panel">
            <div class="panel-head">
              <h2>입찰 기록</h2>
              <span class="count" id="bidCountLabel">${a.bids.length}</span>
            </div>
            <ul id="bidFeed" class="feed-list">${bidFeedHtml(s, a)}</ul>
            <p class="feed-foot">${a.type === "sealed" && a.status === "active" ? "봉인 입찰 금액은 마감 후 공개됩니다." : "입찰 기록은 실시간으로 갱신됩니다."}</p>
          </section>

          <div class="demo-note">
            <span class="demo-tag">PROTOTYPE</span>
            <p>결제와 정산은 모의로 처리됩니다. 라이벌 봇이 켜져 있으면 봉인 입찰에 다른 참가자가 자동으로 참여합니다.</p>
          </div>
        </aside>
      </div>
    </div>`;
}

export function detailMeta(a) {
  return { status: a.status, winnerBidId: a.winnerBidId };
}
