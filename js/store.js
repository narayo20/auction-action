/* Auction & Action — state, rules and persistence (localStorage prototype). */

import { uid, maskName, won } from "./util.js";

const KEY = "auction_action_v1";
const SYNC_CHANNEL = "auction_action_sync_v1";

export const COMMISSION_RATE = 0.05;
export const PAYMENT_WINDOW = 24 * 60 * 60 * 1000;

export const TYPES = {
  sealed: {
    key: "sealed",
    label: "비공개 최대 금액",
    badge: "봉인 입찰",
    tag: "SEALED BID",
    accent: "blue",
    blurb: "서로의 금액을 볼 수 없습니다. 마감 후 가장 높은 금액이 낙찰됩니다.",
  },
  first: {
    key: "first",
    label: "가장 먼저 입찰",
    badge: "선착순",
    tag: "FIRST BID",
    accent: "red",
    blurb: "가장 먼저 입찰한 사람이 그 가격으로 즉시 낙찰받습니다.",
  },
  dutch: {
    key: "dutch",
    label: "하향 경매",
    badge: "하향 경매",
    tag: "DUTCH DROP",
    accent: "lime",
    blurb: "입찰자가 없으면 시작가의 0.5%씩 주기적으로 가격이 내려갑니다. 원하는 순간에 수락하세요.",
  },
};

export const STATUS = {
  active: { label: "진행 중", cls: "live" },
  won: { label: "낙찰 · 결제 대기", cls: "won" },
  paid: { label: "결제 완료 · 정산 대기", cls: "paid" },
  settled: { label: "정산 완료", cls: "done" },
  failed: { label: "유찰", cls: "failed" },
};

export const METHODS = {
  card: "신용카드",
  bank: "계좌이체",
  kakao: "카카오페이",
  point: "액션 포인트",
};

const BOT_NAMES = ["김민준", "이서연", "박도윤", "최하은", "정시우", "한지민", "오세준", "윤서아", "임도현", "강예린"];

let cache = null;
let channel = null;
try {
  channel = new BroadcastChannel(SYNC_CHANNEL);
} catch {
  channel = null;
}

/* ---------------- persistence ---------------- */

function defaults() {
  return {
    v: 1,
    seeded: false,
    bots: true,
    profile: { id: uid("user"), name: "액션러버", contact: "010-0000-0000", method: "card" },
    auctions: [],
    settlements: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return {
      ...defaults(),
      ...parsed,
      profile: { ...defaults().profile, ...(parsed.profile || {}) },
      auctions: Array.isArray(parsed.auctions) ? parsed.auctions : [],
      settlements: Array.isArray(parsed.settlements) ? parsed.settlements : [],
    };
  } catch {
    return defaults();
  }
}

function persist(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    cache = s;
  } catch {
    throw new Error("브라우저 저장 공간이 부족합니다. 이미지를 줄이거나 데모를 초기화해 주세요.");
  }
}

export function getState() {
  if (!cache) cache = read();
  return cache;
}

export function reload() {
  cache = read();
  return cache;
}

export function mutate(fn) {
  const s = read();
  const out = fn(s);
  s.updatedAt = Date.now();
  persist(s);
  broadcast({ type: "changed", at: s.updatedAt });
  return out;
}

export function broadcast(message) {
  try {
    channel?.postMessage({ ...message, at: message.at || Date.now() });
  } catch {
    /* noop */
  }
}

export function listenExternal(onMessage) {
  if (channel) channel.onmessage = (event) => onMessage(event.data);
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    reload();
    onMessage({ type: "changed", external: true });
  });
}

/* ---------------- domain helpers ---------------- */

export function typeOf(a) {
  return TYPES[a?.type] || TYPES.sealed;
}

export function statusOf(a) {
  return STATUS[a?.status] || STATUS.active;
}

export function highestBid(auction) {
  if (!auction?.bids?.length) return null;
  return [...auction.bids].sort((a, b) => b.amount - a.amount || a.createdAt - b.createdAt)[0];
}

export function winnerBid(auction) {
  if (!auction) return null;
  if (auction.winnerBidId) return auction.bids.find((b) => b.id === auction.winnerBidId) || null;
  return null;
}

export function myBids(auction, profileId) {
  return (auction?.bids || []).filter((b) => b.bidderId === profileId);
}

export function myTopBid(auction, profileId) {
  return myBids(auction, profileId).sort((a, b) => b.amount - a.amount)[0] || null;
}

export function dutchState(auction, now = Date.now()) {
  const start = auction.startAt || auction.createdAt || now;
  const intervalMs = Math.max(5, Number(auction.dropInterval) || 30) * 1000;
  // 하향 경매는 입찰자가 없을 때 시작가의 0.5%씩 주기적으로 하락합니다.
  const rate = Number(auction.dropRate) > 0 ? Number(auction.dropRate) : 0.005;
  const stepDrop = Math.max(1, Math.round(auction.startPrice * rate));
  const floor = Math.max(0, Number(auction.floorPrice) || 0);
  const elapsed = Math.max(0, now - start);
  const steps = Math.floor(elapsed / intervalMs);
  const raw = auction.startPrice - steps * stepDrop;
  const price = Math.max(floor, raw);
  const atFloor = raw <= floor;
  const nextIn = atFloor ? 0 : intervalMs - (elapsed % intervalMs);
  const totalSteps = stepDrop > 0 ? Math.ceil((auction.startPrice - floor) / stepDrop) : 0;
  return { price, atFloor, steps, totalSteps, nextIn, intervalMs, drop: stepDrop, stepDrop, rate, floor };
}

export function isMine(auction, profileId) {
  const wb = winnerBid(auction);
  return Boolean(wb && wb.bidderId === profileId);
}

/* ---------------- auction lifecycle ---------------- */

export function createAuction(input) {
  return mutate((s) => {
    const now = Date.now();
    const title = String(input.title || "").trim();
    const seller = String(input.seller || "").trim();
    const endAt = new Date(input.endAt).getTime();
    const startPrice = Math.round(Number(input.startPrice) || 0);
    const type = TYPES[input.type] ? input.type : "sealed";

    if (!title) throw new Error("상품명을 입력해 주세요.");
    if (!seller) throw new Error("등록자 이름을 입력해 주세요.");
    if (!Number.isFinite(endAt) || endAt < now + 60000) throw new Error("종료 시각은 지금부터 최소 1분 뒤로 설정해 주세요.");
    if (startPrice < 1000) throw new Error("시작가는 1,000원 이상이어야 합니다.");

    const dropRate = type === "dutch" ? 0.005 : 0;
    let dropInterval = 0;
    let floorPrice = 0;
    if (type === "dutch") {
      dropInterval = Math.round(Number(input.dropInterval) || 0);
      floorPrice = Math.round(Number(input.floorPrice) || 0);
      if (dropInterval < 5) throw new Error("하락 주기는 5초 이상이어야 합니다.");
      if (floorPrice < 1000) throw new Error("최저가는 1,000원 이상이어야 합니다.");
      if (floorPrice >= startPrice) throw new Error("최저가는 시작가보다 낮아야 합니다.");
    }

    const auction = {
      id: uid("a"),
      title,
      desc: String(input.desc || "").trim(),
      image: input.image || "",
      seller,
      sellerContact: String(input.contact || "").trim(),
      type,
      startPrice,
      endAt,
      startAt: now,
      createdAt: now,
      status: "active",
      bids: [],
      winnerBidId: null,
      awardedAt: null,
      paymentDueAt: null,
      paidAt: null,
      payment: null,
      failReason: "",
      viewCount: 1,
      dropRate,
      dropInterval,
      floorPrice,
      lot: "LOT " + String(s.auctions.length + 1).padStart(2, "0"),
    };

    s.auctions.unshift(auction);
    return auction;
  });
}

export function placeBid(auctionId, input) {
  return mutate((s) => {
    const auction = s.auctions.find((a) => a.id === auctionId);
    if (!auction) throw new Error("경매를 찾을 수 없습니다.");
    const now = Date.now();
    if (auction.status !== "active") throw new Error("이미 종료된 경매입니다.");
    if (now >= auction.endAt) throw new Error("마감 시각이 지나 입찰할 수 없습니다.");

    const name = String(input.name || "").trim();
    const contact = String(input.contact || "").trim();
    const method = METHODS[input.method] ? input.method : "card";
    if (!name) throw new Error("입찰자 이름을 입력해 주세요.");
    if (!contact) throw new Error("연락처를 입력해 주세요.");

    let amount;
    if (auction.type === "dutch") {
      amount = dutchState(auction, now).price;
    } else {
      amount = Math.round(Number(input.amount) || 0);
      if (amount < auction.startPrice) {
        throw new Error(`시작가 ${won(auction.startPrice)} 이상 입력해 주세요.`);
      }
      if (auction.type === "sealed") {
        const prev = myTopBid(auction, s.profile.id);
        if (prev && amount <= prev.amount) {
          throw new Error("이미 제시한 최고 금액보다 높아야 합니다.");
        }
      }
    }

    const bid = {
      id: uid("b"),
      bidderId: s.profile.id,
      bidderName: name,
      contact,
      method,
      amount,
      createdAt: now,
      hidden: auction.type === "sealed",
    };
    auction.bids.push(bid);

    const instant = auction.type === "first" || auction.type === "dutch";
    if (instant) {
      auction.status = "won";
      auction.winnerBidId = bid.id;
      auction.awardedAt = now;
      auction.paymentDueAt = now + PAYMENT_WINDOW;
      auction.closedReason = auction.type === "first" ? "선착순 즉시 낙찰" : "하향가 수락";
    }

    s.profile = { ...s.profile, name, contact, method };
    return { ...bid, instant, auctionTitle: auction.title, auctionType: auction.type };
  });
}

export function processExpired() {
  const s = read();
  const now = Date.now();
  const results = [];
  let changed = false;

  for (const auction of s.auctions) {
    if (auction.status === "active" && now >= auction.endAt) {
      changed = true;
      if (auction.type === "sealed") {
        const top = highestBid(auction);
        if (top) {
          auction.status = "won";
          auction.winnerBidId = top.id;
          auction.awardedAt = auction.endAt;
          auction.paymentDueAt = now + PAYMENT_WINDOW;
          results.push({ auction, bid: top, kind: "won" });
        } else {
          auction.status = "failed";
          auction.failReason = "입찰자가 없어 유찰되었습니다.";
          results.push({ auction, kind: "failed" });
        }
      } else {
        auction.status = "failed";
        auction.failReason = auction.type === "first" ? "입찰자가 없어 유찰되었습니다." : "가격을 수락한 입찰자가 없어 유찰되었습니다.";
        results.push({ auction, kind: "failed" });
      }
    }

    if (auction.status === "won" && auction.paymentDueAt && now > auction.paymentDueAt) {
      auction.status = "failed";
      auction.failReason = "결제 기한이 만료되어 거래가 취소되었습니다.";
      changed = true;
      results.push({ auction, kind: "forfeited" });
    }
  }

  if (changed) {
    s.updatedAt = now;
    persist(s);
    broadcast({ type: "changed", at: now });
  }
  return { changed, results };
}

export function payAuction(auctionId, payment) {
  return mutate((s) => {
    const auction = s.auctions.find((a) => a.id === auctionId);
    if (!auction) throw new Error("경매를 찾을 수 없습니다.");
    if (auction.status !== "won") throw new Error("결제할 수 있는 낙찰 건이 아닙니다.");
    const wb = winnerBid(auction);
    if (!wb) throw new Error("낙찰 정보를 찾을 수 없습니다.");
    if (wb.bidderId !== s.profile.id) throw new Error("낙찰자만 결제할 수 있습니다.");

    const now = Date.now();
    const method = METHODS[payment.method] ? payment.method : wb.method || "card";
    const commission = Math.round(wb.amount * COMMISSION_RATE);

    auction.status = "paid";
    auction.paidAt = now;
    auction.payment = {
      method,
      methodLabel: METHODS[method],
      payer: wb.bidderName,
      amount: wb.amount,
      detail: payment.detail || "",
      txid: "TX-" + now.toString(36).toUpperCase().slice(-6) + "-" + Math.random().toString(36).slice(2, 5).toUpperCase(),
      paidAt: now,
    };

    const settlement = {
      id: uid("s"),
      auctionId: auction.id,
      title: auction.title,
      lot: auction.lot,
      seller: auction.seller,
      buyer: wb.bidderName,
      buyerId: wb.bidderId,
      amount: wb.amount,
      method,
      commission,
      payout: wb.amount - commission,
      status: "pending",
      paidAt: now,
      settledAt: null,
      txid: auction.payment.txid,
    };
    s.settlements.unshift(settlement);
    return settlement;
  });
}

export function settleSettlement(settlementId) {
  return mutate((s) => {
    const settlement = s.settlements.find((x) => x.id === settlementId);
    if (!settlement) throw new Error("정산 건을 찾을 수 없습니다.");
    if (settlement.status === "settled") return settlement;
    const now = Date.now();
    settlement.status = "settled";
    settlement.settledAt = now;
    const auction = s.auctions.find((a) => a.id === settlement.auctionId);
    if (auction && auction.status === "paid") auction.status = "settled";
    return settlement;
  });
}

export function updateProfile(patch) {
  return mutate((s) => {
    const name = String(patch.name ?? s.profile.name).trim();
    if (!name) throw new Error("이름을 입력해 주세요.");
    s.profile = {
      ...s.profile,
      name,
      contact: String(patch.contact ?? s.profile.contact).trim(),
      method: METHODS[patch.method] ? patch.method : s.profile.method,
    };
    return s.profile;
  });
}

export function setBots(enabled) {
  return mutate((s) => {
    s.bots = Boolean(enabled);
    return s.bots;
  });
}

/* ---------------- rival bot (sealed demo) ---------------- */

export function botBid() {
  const s = read();
  if (!s.bots) return null;
  const now = Date.now();
  const pool = s.auctions.filter(
    (a) => a.status === "active" && a.type === "sealed" && a.endAt - now > 20000 && a.bids.length < 5
  );
  if (!pool.length) return null;

  const auction = pool[Math.floor(Math.random() * pool.length)];
  const top = highestBid(auction);
  const mine = myTopBid(auction, s.profile.id);
  if (mine) return null;
  const base = top ? top.amount : auction.startPrice;

  let cap = Math.round((auction.startPrice * 1.12) / 1000) * 1000;
  let amount = Math.round((base + auction.startPrice * (0.015 + Math.random() * 0.045)) / 1000) * 1000;
  if (amount > cap) amount = cap;
  if (amount < auction.startPrice || amount <= base) return null;

  const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const bid = {
    id: uid("b"),
    bidderId: "bot_" + Math.random().toString(36).slice(2, 7),
    bidderName: name,
    contact: "010-0000-0000",
    method: Math.random() < 0.5 ? "card" : "kakao",
    amount,
    createdAt: now,
    hidden: true,
    bot: true,
  };
  auction.bids.push(bid);
  s.updatedAt = now;
  persist(s);
  broadcast({ type: "bid", auctionId: auction.id, bidder: name, amount: null, mode: "sealed" });
  return { auctionId: auction.id, auctionTitle: auction.title, name, amount };
}

/* ---------------- demo seed ---------------- */

const PALETTES = [
  ["#ff5a36", "#ffd9a8", "#131417"],
  ["#c8f24a", "#131417", "#131417"],
  ["#1b46ff", "#dfe6ff", "#131417"],
  ["#f2b8c6", "#7a1f3d", "#131417"],
  ["#ffd166", "#3a2c00", "#131417"],
  ["#d7d2ff", "#2a1a7a", "#131417"],
  ["#8bd3c7", "#0d3f39", "#131417"],
  ["#ffb3a7", "#6b1f13", "#131417"],
];

function art(label, code, index = 0) {
  const [bg, shape, ink] = PALETTES[index % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700">
  <rect width="900" height="700" fill="${bg}"/>
  <circle cx="690" cy="210" r="230" fill="${shape}" opacity="0.9"/>
  <circle cx="760" cy="120" r="70" fill="none" stroke="${ink}" stroke-width="3" opacity="0.5"/>
  <path d="M-40 460 L940 390 L940 700 L-40 700 Z" fill="#131417"/>
  <text x="54" y="86" font-family="'Space Grotesk',Arial,sans-serif" font-size="20" letter-spacing="7" fill="${ink}">AUCTION &amp; ACTION</text>
  <text x="50" y="260" font-family="'Archivo Black',Arial,sans-serif" font-size="94" fill="${ink}">${code}</text>
  <text x="54" y="600" font-family="'IBM Plex Sans KR',Arial,sans-serif" font-weight="700" font-size="42" fill="#fffcf5">${label}</text>
  <text x="56" y="644" font-family="'Space Grotesk',Arial,sans-serif" font-size="17" letter-spacing="3" fill="#fffcf5" opacity="0.65">LOT ${String(index + 1).padStart(2, "0")} · SEOUL</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function seedInto(s) {
  const now = Date.now();
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;
  const me = s.profile;
  const botBid = (name, amount, minsAgo, method = "card") => ({
    id: uid("b"),
    bidderId: "bot_seed_" + Math.random().toString(36).slice(2, 7),
    bidderName: name,
    contact: "010-0000-0000",
    method,
    amount,
    createdAt: now - minsAgo * MIN,
    hidden: true,
  });

  const a1 = {
    id: uid("a"), title: "빈티지 35mm 필름 카메라", desc: "1970년대 일본제 레인지파인더 카메라. 셔터와 노출계 모두 정상 작동하며 가죽 케이스, 스트랩이 함께 포함됩니다. 미세한 사용감 외 상태 양호합니다.",
    image: art("빈티지 카메라", "CAMERA", 0), seller: "정오브제", sellerContact: "010-2345-8890", type: "sealed",
    startPrice: 120000, startAt: now - 40 * MIN, endAt: now + 3 * MIN, createdAt: now - 40 * MIN,
    status: "active", bids: [botBid("김민준", 150000, 22), botBid("이서연", 175000, 11)], winnerBidId: null,
    awardedAt: null, paymentDueAt: null, paidAt: null, payment: null, failReason: "", viewCount: 128,
    dropRate: 0, dropInterval: 0, floorPrice: 0, lot: "LOT 01",
  };
  const a2 = {
    id: uid("a"), title: "한정판 러너스 스니커즈", desc: "2024 한정 드롭 모델, 270mm. 박스와 여분 스트랩 포함. 실착 2회로 밑창 마모가 거의 없습니다.",
    image: art("러너스 스니커즈", "SNEAKERS", 1), seller: "스니커랩", sellerContact: "010-7788-1220", type: "first",
    startPrice: 89000, startAt: now - 20 * MIN, endAt: now + 12 * MIN, createdAt: now - 20 * MIN,
    status: "active", bids: [], winnerBidId: null, awardedAt: null, paymentDueAt: null, paidAt: null, payment: null,
    failReason: "", viewCount: 64, dropRate: 0, dropInterval: 0, floorPrice: 0, lot: "LOT 02",
  };
  const a3 = {
    id: uid("a"), title: "우드 북쉘프 스피커", desc: "1960년대 덴마크산 패시브 스피커 페어. 유닛 정상, 월넛 원목 케이스에 자개 로고가 남아 있습니다.",
    image: art("북쉘프 스피커", "SPEAKER", 2), seller: "사운드갤러리", sellerContact: "010-5541-7788", type: "dutch",
    startPrice: 480000, startAt: now - 90 * 1000, endAt: now + 20 * MIN, createdAt: now - 90 * 1000,
    status: "active", bids: [], winnerBidId: null, awardedAt: null, paymentDueAt: null, paidAt: null, payment: null,
    failReason: "", viewCount: 212, dropRate: 0.005, dropInterval: 30, floorPrice: 220000, lot: "LOT 03",
  };
  const a4 = {
    id: uid("a"), title: "1960s 아날로그 월클락", desc: "독일제 8일 태엽 벽시계. 정각·30분 타종 정상. 유리와 다이얼에 큰 스크래치 없이 깨끗합니다.",
    image: art("아날로그 월클락", "CLOCK", 3), seller: "모먼트빈티지", sellerContact: "010-1122-9988", type: "sealed",
    startPrice: 55000, startAt: now - 3 * HOUR, endAt: now + 60 * MIN, createdAt: now - 3 * HOUR,
    status: "active", bids: [botBid("박도윤", 61000, 55), botBid("최하은", 68000, 18)], winnerBidId: null,
    awardedAt: null, paymentDueAt: null, paidAt: null, payment: null, failReason: "", viewCount: 47,
    dropRate: 0, dropInterval: 0, floorPrice: 0, lot: "LOT 04",
  };
  const a5 = {
    id: uid("a"), title: "핸드메이드 세라믹 화병 세트", desc: "물레로 성형한 화병 3종 세트. 매트 화이트 유약, 소성 과정의 미세한 균열은 자연스러운 질감입니다.",
    image: art("세라믹 화병", "VASE", 4), seller: "도자기공방", sellerContact: "010-9988-3344", type: "dutch",
    startPrice: 120000, startAt: now - 5 * MIN, endAt: now + 45 * MIN, createdAt: now - 5 * MIN,
    status: "active", bids: [], winnerBidId: null, awardedAt: null, paymentDueAt: null, paidAt: null, payment: null,
    failReason: "", viewCount: 31, dropRate: 0.005, dropInterval: 45, floorPrice: 60000, lot: "LOT 05",
  };
  const a6 = {
    id: uid("a"), title: "빈티지 타자기", desc: "1950년대 휴대용 타자기. 키캡 마모는 있으나 타건과 캐리지 리턴이 부드럽게 작동합니다. 전용 하드 케이스 포함.",
    image: art("빈티지 타자기", "TYPEWRITER", 5), seller: "레트로룸", sellerContact: "010-4455-6677", type: "sealed",
    startPrice: 400000, startAt: now - 50 * MIN, endAt: now + 8 * MIN, createdAt: now - 50 * MIN,
    status: "active", bids: [botBid("정시우", 430000, 30)], winnerBidId: null, awardedAt: null,
    paymentDueAt: null, paidAt: null, payment: null, failReason: "", viewCount: 96,
    dropRate: 0, dropInterval: 0, floorPrice: 0, lot: "LOT 06",
  };

  const myWinningBid = {
    id: uid("b"), bidderId: me.id, bidderName: me.name, contact: me.contact, method: me.method,
    amount: 350000, createdAt: now - 20 * MIN, hidden: true,
  };
  const a7 = {
    id: uid("a"), title: "빈티지 라이카 M3 (낙찰 데모)", desc: "결제·정산 흐름을 체험할 수 있도록 준비한 데모 낙찰 건입니다. 등록된 최고 입찰자가 결제를 진행해 보세요.",
    image: art("라이카 M3", "LEICA", 6), seller: "필름마켓", sellerContact: "010-3322-1100", type: "sealed",
    startPrice: 300000, startAt: now - 2 * HOUR, endAt: now - 12 * MIN, createdAt: now - 2 * HOUR,
    status: "won", bids: [botBid("한지민", 320000, 60), myWinningBid], winnerBidId: myWinningBid.id,
    awardedAt: now - 12 * MIN, paymentDueAt: now + 23 * HOUR, paidAt: null, payment: null, failReason: "",
    viewCount: 174, dropRate: 0, dropInterval: 0, floorPrice: 0, lot: "LOT 07",
  };

  const a8Bid = {
    id: uid("b"), bidderId: "bot_park", bidderName: "박서준", contact: "010-2222-3333",
    method: "kakao", amount: 52000, createdAt: now - 30 * HOUR, hidden: false,
  };
  const a8 = {
    id: uid("a"), title: "캔버스 토트백 & 파우치 세트", desc: "두꺼운 캔버스 원단으로 제작한 토트백과 파우치 세트. 데일리로 사용하기 좋은 사이즈입니다.",
    image: art("캔버스 토트백", "TOTE", 7), seller: "아틀리에모모", sellerContact: "010-8888-7777", type: "first",
    startPrice: 45000, startAt: now - 31 * HOUR, endAt: now - 30 * HOUR, createdAt: now - 31 * HOUR,
    status: "paid", bids: [a8Bid], winnerBidId: a8Bid.id, awardedAt: now - 30 * HOUR, paymentDueAt: now - 6 * HOUR,
    paidAt: now - 29 * HOUR,
    payment: { method: "kakao", methodLabel: "카카오페이", payer: "박서준", amount: 52000, detail: "카카오페이 간편결제", txid: "TX-DEMO-0021", paidAt: now - 29 * HOUR },
    failReason: "", viewCount: 58, dropRate: 0, dropInterval: 0, floorPrice: 0, lot: "LOT 08",
  };

  const a9Bid = {
    id: uid("b"), bidderId: "bot_choi", bidderName: "최유진", contact: "010-5555-6666",
    method: "card", amount: 46000, createdAt: now - 5 * DAY, hidden: true,
  };
  const a9 = {
    id: uid("a"), title: "재즈 LP 레코드 3종", desc: "빌 에반스, 존 콜트레인, 마일스 데이비스의 오리지널 프레싱 LP 3장. 재생 상태 양호합니다.",
    image: art("재즈 LP 3종", "VINYL", 0), seller: "바이닐하우스", sellerContact: "010-1234-5678", type: "sealed",
    startPrice: 30000, startAt: now - 6 * DAY, endAt: now - 5 * DAY, createdAt: now - 6 * DAY,
    status: "settled", bids: [a9Bid], winnerBidId: a9Bid.id, awardedAt: now - 5 * DAY,
    paymentDueAt: now - 4 * DAY, paidAt: now - 4.5 * DAY,
    payment: { method: "card", methodLabel: "신용카드", payer: "최유진", amount: 46000, detail: "카드 끝자리 4821", txid: "TX-DEMO-0007", paidAt: now - 4.5 * DAY },
    failReason: "", viewCount: 203, dropRate: 0, dropInterval: 0, floorPrice: 0, lot: "LOT 09",
  };

  s.auctions = [a1, a2, a3, a4, a5, a6, a7, a8, a9];
  s.settlements = [
    {
      id: uid("s"), auctionId: a8.id, title: a8.title, lot: a8.lot, seller: a8.seller, buyer: "박서준",
      buyerId: a8Bid.bidderId, amount: 52000, method: "kakao", commission: Math.round(52000 * COMMISSION_RATE),
      payout: 52000 - Math.round(52000 * COMMISSION_RATE), status: "pending", paidAt: now - 29 * HOUR,
      settledAt: null, txid: "TX-DEMO-0021",
    },
    {
      id: uid("s"), auctionId: a9.id, title: a9.title, lot: a9.lot, seller: a9.seller, buyer: "최유진",
      buyerId: a9Bid.bidderId, amount: 46000, method: "card", commission: Math.round(46000 * COMMISSION_RATE),
      payout: 46000 - Math.round(46000 * COMMISSION_RATE), status: "settled", paidAt: now - 4.5 * DAY,
      settledAt: now - 4 * DAY, txid: "TX-DEMO-0007",
    },
  ];
  s.updatedAt = now;
}

export function ensureSeed() {
  const s = read();
  if (!s.seeded) {
    seedInto(s);
    s.seeded = true;
    persist(s);
  } else {
    cache = s;
  }
  return cache;
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  cache = null;
  const s = read();
  seedInto(s);
  s.seeded = true;
  persist(s);
  broadcast({ type: "changed" });
  return cache;
}

/* ---------------- selectors for views ---------------- */

export function activeAuctions(s) {
  return s.auctions.filter((a) => a.status === "active").sort((a, b) => a.endAt - b.endAt);
}

export function endedAuctions(s) {
  return s.auctions
    .filter((a) => a.status !== "active")
    .sort((a, b) => (b.awardedAt || b.paidAt || b.endAt) - (a.awardedAt || a.paidAt || a.endAt));
}

export function pendingPayments(s) {
  return s.auctions.filter((a) => a.status === "won").sort((a, b) => (a.paymentDueAt || 0) - (b.paymentDueAt || 0));
}

export function recentBids(s, limit = 6) {
  const rows = [];
  for (const auction of s.auctions) {
    for (const bid of auction.bids) {
      rows.push({ auction, bid });
    }
  }
  return rows.sort((a, b) => b.bid.createdAt - a.bid.createdAt).slice(0, limit);
}

export function summary(s) {
  const active = s.auctions.filter((a) => a.status === "active");
  const bids = s.auctions.reduce((sum, a) => sum + a.bids.length, 0);
  const awarded = s.auctions.filter((a) => ["won", "paid", "settled"].includes(a.status));
  const settled = s.settlements.filter((x) => x.status === "settled");
  const pending = s.settlements.filter((x) => x.status === "pending");
  return {
    activeCount: active.length,
    bidCount: bids,
    awardedCount: awarded.length,
    settledAmount: settled.reduce((sum, x) => sum + x.amount, 0),
    settledPayout: settled.reduce((sum, x) => sum + x.payout, 0),
    pendingPayout: pending.reduce((sum, x) => sum + x.payout, 0),
    commission: s.settlements.reduce((sum, x) => sum + x.commission, 0),
    paidAmount: s.settlements.reduce((sum, x) => sum + x.amount, 0),
  };
}
