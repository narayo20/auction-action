/* Create auction screen. */

import { TYPES } from "../store.js";
import { esc, won, toInputDateTime, fmtDateTime } from "../util.js";
import { typeBadge } from "./shared.js";

function typeCard(key, selected) {
  const t = TYPES[key];
  return `
    <label class="type-card ${selected === key ? "selected" : ""}" data-type-card="${key}">
      <input type="radio" name="type" value="${key}" ${selected === key ? "checked" : ""} />
      <span class="type-card-top">
        <span class="type-swatch ${t.accent}"></span>
        <span class="type-radio" aria-hidden="true"></span>
      </span>
      <strong>${t.label}</strong>
      <span>${t.blurb}</span>
    </label>`;
}

export function newView(s) {
  const endAt = toInputDateTime(Date.now() + 60 * 60 * 1000);
  return `
    <div class="new-page">
      <div class="page-head">
        <a class="back" href="#/">← 경매장으로</a>
        <span class="eyebrow">LIST YOUR ITEM</span>
        <h1>새 경매 등록</h1>
        <p>상품 정보와 입찰 방식을 정하면 즉시 경매가 열립니다. 마감 시각이 지나면 자동으로 낙찰 처리됩니다.</p>
      </div>

      <form id="newAuctionForm" class="new-layout" novalidate>
        <div class="form-main">
          <section class="panel">
            <div class="panel-head"><h2><span class="step">01</span> 상품 정보</h2><span class="micro">PRODUCT</span></div>

            <div class="upload-row">
              <label class="dropzone" id="dropzone" for="imageInput">
                <input id="imageInput" type="file" accept="image/*" hidden />
                <img id="dropImage" alt="" class="hidden" />
                <div class="dropzone-inner" id="dropzoneInner">
                  <span class="drop-icon">＋</span>
                  <strong>상품 이미지 추가</strong>
                  <span>클릭하거나 파일을 끌어다 놓으세요 · 12MB 이하</span>
                </div>
                <button type="button" class="remove-image hidden" id="removeImage" aria-label="이미지 삭제">✕</button>
              </label>
              <div class="upload-copy">
                <p><strong>첫 이미지가 대표 사진</strong>으로 사용됩니다.</p>
                <p>가로 4:3 비율을 권장합니다. 업로드한 이미지는 브라우저 안에서 자동 압축됩니다.</p>
              </div>
            </div>

            <label class="field">
              <span>상품명 <em class="required">필수</em></span>
              <input id="titleInput" name="title" type="text" maxlength="60" required placeholder="예) 빈티지 35mm 필름 카메라" />
            </label>

            <label class="field">
              <span>상품 설명</span>
              <textarea id="descInput" name="desc" rows="4" maxlength="500" placeholder="상태, 구성품, 사용감 등을 자세히 적어주세요."></textarea>
            </label>
          </section>

          <section class="panel">
            <div class="panel-head"><h2><span class="step">02</span> 가격과 시간</h2><span class="micro">PRICE &amp; TIME</span></div>

            <div class="field-grid">
              <label class="field">
                <span>시작가 <em class="required">필수</em></span>
                <div class="money-input">
                  <span class="currency">₩</span>
                  <input id="startPriceInput" name="startPrice" type="text" inputmode="numeric" required placeholder="0" data-money />
                </div>
              </label>
              <div class="field">
                <span id="endAtLabel">경매 종료 시각 <em class="required">필수</em></span>
                <div class="end-field-row">
                  <input id="endAtInput" name="endAt" type="datetime-local" required aria-labelledby="endAtLabel" value="${endAt}" min="${toInputDateTime(Date.now() + 60000)}" />
                  <button type="button" class="btn ghost end-check-btn" id="endCheckBtn" aria-controls="endCheckResult">확인</button>
                </div>
                <p class="end-check-result" id="endCheckResult" role="status" aria-live="polite" hidden></p>
              </div>
            </div>

            <div class="quick-row" aria-label="마감 시간 빠른 선택">
              <button type="button" class="chip" data-quick-end="10">+10분</button>
              <button type="button" class="chip" data-quick-end="30">+30분</button>
              <button type="button" class="chip" data-quick-end="60">+1시간</button>
              <button type="button" class="chip" data-quick-end="360">+6시간</button>
              <button type="button" class="chip" data-quick-end="1440">+1일</button>
            </div>

            <div class="field-grid">
              <label class="field">
                <span>등록자 이름 <em class="required">필수</em></span>
                <input id="sellerInput" name="seller" type="text" maxlength="20" required value="${esc(s.profile.name)}" />
              </label>
              <label class="field">
                <span>등록자 연락처</span>
                <input id="sellerContactInput" name="contact" type="tel" maxlength="20" value="${esc(s.profile.contact)}" placeholder="010-0000-0000" />
              </label>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2><span class="step">03</span> 입찰 방식</h2><span class="micro">BID TYPE</span></div>
            <div class="type-grid" role="radiogroup" aria-label="입찰 방식">
              ${typeCard("sealed", "sealed")}
              ${typeCard("first", "sealed")}
              ${typeCard("dutch", "sealed")}
            </div>

            <div id="dutchFields" class="dutch-fields hidden">
              <div class="dutch-fields-head">
                <strong>하향 경매 설정</strong>
                <span>입찰자가 없으면 시작가의 0.5%씩, 설정한 주기마다 자동으로 내려갑니다.</span>
              </div>
              <div class="field-grid three">
                <label class="field">
                  <span>하락률</span>
                  <div class="rate-lock"><strong>0.5%</strong><small>시작가 기준 · 자동</small></div>
                </label>
                <label class="field">
                  <span>하락 주기 (초)</span>
                  <input id="dropIntervalInput" name="dropInterval" type="number" min="5" step="5" value="30" />
                </label>
                <label class="field">
                  <span>최저가</span>
                  <div class="money-input"><span class="currency">₩</span><input id="floorPriceInput" name="floorPrice" type="text" inputmode="numeric" value="50,000" data-money /></div>
                </label>
              </div>
            </div>
          </section>

          <div id="formError" class="form-error" role="alert"></div>

          <div class="submit-row">
            <button type="submit" class="btn accent block lg">경매 등록하기</button>
            <p class="form-note">등록 즉시 경매가 시작되며, 마감 시각에 자동 낙찰이 처리됩니다.</p>
          </div>
        </div>

        <aside class="form-aside">
          <span class="eyebrow">LIVE PREVIEW</span>
          <article class="card preview-card">
            <div class="card-media">
              <div class="preview-image-wrap" id="previewImageWrap">
                <img id="previewImage" alt="" class="hidden" />
                <div id="previewPlaceholder" class="no-image">A</div>
              </div>
              <div class="card-top">
                <span id="previewType" class="type-badge blue">봉인 입찰</span>
                <span class="card-clock">PREVIEW</span>
              </div>
            </div>
            <div class="card-body">
              <div class="card-kicker" id="previewSeller">${esc(s.profile.name)} · SEALED BID</div>
              <h3 class="card-title" id="previewTitle">상품명을 입력하세요</h3>
              <div class="card-meta">
                <div><span class="micro">시작가</span><strong class="card-price" id="previewPrice">₩0</strong></div>
                <span class="bid-count">입찰 0건</span>
              </div>
            </div>
          </article>

          <div class="panel tips">
            <h3>등록 전 체크</h3>
            <ul>
              <li>마감 시각은 최소 1분 뒤여야 합니다.</li>
              <li>봉인 입찰은 마감 후 모든 금액이 공개됩니다.</li>
              <li>선착순은 첫 입찰 즉시 낙찰됩니다.</li>
              <li>하향 경매는 최저가에 도달하면 더 내려가지 않습니다.</li>
            </ul>
          </div>

          <div class="preview-end">
            <span class="micro">마감 예정</span>
            <strong id="previewEnd">${fmtDateTime(Date.now() + 3600000)}</strong>
          </div>
        </aside>
      </form>
    </div>`;
}

export function previewTypeHtml(key) {
  const t = TYPES[key] || TYPES.sealed;
  return `<span class="type-badge ${t.accent}">${t.badge}</span>`;
}

export function previewPriceHtml(value) {
  return won(value);
}

export { typeBadge };
