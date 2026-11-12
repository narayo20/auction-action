/* Modal markup: mock checkout, success receipt, profile. */

import { METHODS } from "../store.js";
import { won, esc, fmtDateTime, maskName } from "../util.js";
import { methodLabel } from "./shared.js";

function methodChoices(selected) {
  return Object.entries(METHODS).map(([key, label]) => `
    <label class="pay-method ${selected === key ? "selected" : ""}" data-pay-method="${key}">
      <input type="radio" name="payMethod" value="${key}" ${selected === key ? "checked" : ""} />
      <span class="pay-icon">${key === "card" ? "▭" : key === "bank" ? "⌂" : key === "kakao" ? "●" : "P"}</span>
      <span>${label}</span>
    </label>`).join("");
}

export function paymentModalHtml(a, wb, profile) {
  return `
    <div class="modal-head">
      <div>
        <span class="eyebrow">MOCK CHECKOUT</span>
        <h2>낙찰 대금 결제</h2>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="닫기">✕</button>
    </div>

    <div class="checkout-summary">
      ${a.image ? `<img src="${esc(a.image)}" alt="" />` : `<span class="checkout-thumb">${esc(a.title.slice(0, 1))}</span>`}
      <div>
        <span class="micro">${esc(a.lot || "LOT")} · ${esc(methodLabel(wb.method))} 희망</span>
        <h3>${esc(a.title)}</h3>
        <p>낙찰자 ${esc(maskName(wb.bidderName))} · 판매자 ${esc(a.seller)}</p>
      </div>
      <strong class="checkout-price">${won(wb.amount)}</strong>
    </div>

    <form id="payForm" novalidate>
      <div class="field">
        <span class="field-label">결제 수단</span>
        <div class="pay-methods" role="radiogroup" aria-label="결제 수단">${methodChoices(wb.method || profile.method)}</div>
      </div>

      <div class="pay-fields" data-pay-fields="card">
        <label class="field"><span>카드 번호</span><input name="cardNumber" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" data-card-number /></label>
        <div class="field-grid">
          <label class="field"><span>유효기간</span><input name="cardExpiry" inputmode="numeric" maxlength="5" placeholder="MM/YY" /></label>
          <label class="field"><span>CVC</span><input name="cardCvc" inputmode="numeric" maxlength="4" placeholder="000" /></label>
        </div>
        <label class="field"><span>카드 소유자</span><input name="cardOwner" value="${esc(profile.name)}" /></label>
      </div>

      <div class="pay-fields hidden" data-pay-fields="bank">
        <label class="field"><span>은행</span>
          <select name="bank">
            <option>국민은행</option><option>신한은행</option><option>하나은행</option><option>카카오뱅크</option><option>토스뱅크</option>
          </select>
        </label>
        <label class="field"><span>계좌번호</span><input name="accountNumber" inputmode="numeric" placeholder="숫자만 입력" /></label>
        <label class="field"><span>입금자명</span><input name="depositor" value="${esc(profile.name)}" /></label>
      </div>

      <div class="pay-fields hidden" data-pay-fields="kakao">
        <label class="field"><span>카카오페이 연결 번호</span><input name="kakaoPhone" inputmode="numeric" value="${esc(profile.contact)}" placeholder="010-0000-0000" /></label>
        <div class="pay-hint">결제 버튼을 누르면 카카오페이 승인 화면을 시뮬레이션합니다.</div>
      </div>

      <div class="pay-fields hidden" data-pay-fields="point">
        <div class="point-balance">
          <span>보유 액션 포인트</span>
          <strong>1,250,000 P</strong>
          <small>데모 포인트입니다. 실제 잔액이 아닙니다.</small>
        </div>
      </div>

      <div class="checkout-line">
        <div><span>낙찰가</span><strong>${won(wb.amount)}</strong></div>
        <div><span>구매자 수수료</span><strong>₩0</strong></div>
      </div>
      <div class="checkout-total">
        <span>총 결제 금액</span>
        <strong>${won(wb.amount)}</strong>
      </div>

      <p class="form-note center">데모 결제입니다. 실제 금액이 청구되지 않습니다.</p>
      <button type="submit" class="btn accent block lg">${won(wb.amount)} 결제하기</button>
    </form>`;
}

export function successModalHtml(st) {
  return `
    <div class="success-modal">
      <span class="success-check">✓</span>
      <span class="eyebrow">PAYMENT APPROVED</span>
      <h2>결제가 완료되었습니다</h2>
      <p class="success-lead">${esc(st.title)}</p>

      <dl class="receipt-list">
        <div><dt>결제 금액</dt><dd>${won(st.amount)}</dd></div>
        <div><dt>결제 수단</dt><dd>${esc(methodLabel(st.method))}</dd></div>
        <div><dt>거래 번호</dt><dd class="mono">${esc(st.txid)}</dd></div>
        <div><dt>판매 수수료 (5%)</dt><dd>${won(st.commission)}</dd></div>
        <div class="total"><dt>판매자 정산 예정</dt><dd>${won(st.payout)}</dd></div>
      </dl>

      <p class="success-note">정산 센터에서 판매자 정산을 완료 처리할 수 있습니다.</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-close>확인</button>
        <a class="btn primary" href="#/settlements" data-close>정산 센터로 이동</a>
      </div>
    </div>`;
}

export function profileModalHtml(profile, stats) {
  return `
    <div class="modal-head">
      <div>
        <span class="eyebrow">MY ACCOUNT</span>
        <h2>내 프로필</h2>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="닫기">✕</button>
    </div>

    <div class="profile-hero">
      <span class="avatar xl">${esc(profile.name.slice(0, 1) || "?")}</span>
      <div>
        <strong>${esc(profile.name)}</strong>
        <span class="mono">ID ${esc(profile.id.slice(-8))}</span>
      </div>
      <div class="profile-stats">
        <div><strong>${stats.bids}</strong><span>내 입찰</span></div>
        <div><strong>${stats.wins}</strong><span>낙찰</span></div>
      </div>
    </div>

    <form id="profileForm" novalidate>
      <label class="field"><span>이름</span><input name="name" maxlength="20" value="${esc(profile.name)}" required /></label>
      <label class="field"><span>연락처</span><input name="contact" type="tel" maxlength="20" value="${esc(profile.contact)}" placeholder="010-0000-0000" /></label>
      <label class="field"><span>기본 결제 수단</span>
        <select name="method">
          ${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${profile.method === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
        </select>
      </label>
      <p class="form-note">입찰 시 이 정보가 기본값으로 채워집니다. 변경한 이름은 이후 입찰부터 적용됩니다.</p>
      <button type="submit" class="btn primary block">프로필 저장</button>
    </form>

    <div class="profile-foot">
      <span class="micro">MEMBER SINCE</span>
      <span>${fmtDateTime(profile.createdAt || Date.now())}</span>
    </div>`;
}
