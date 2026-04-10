// MBsanma/js/tensukeisan.js
// ========= tensukeisan.js（点数計算専用） =========
// 役割：
// - 三人麻雀の点数表に従って、結果画面用の点数を返す
// - 将来の持ち点増減処理でも使える形で返す
//
// 注意：
// - 状態変更はしない
// - 点数表はユーザー提供PDFの内容をそのまま lookup 化している
// - ツモの「a/b」は、a=子払い / b=親払い
// - 「オール」は残り2人が同額支払い

const SANMA_TSUMO_REGULAR_TABLE = {
  "20": {
    "1": { ko: 1000, oya: 1000, dealerAll: 1000 },
    "2": { ko: 1000, oya: 2000, dealerAll: 2000 },
    "3": { ko: 2000, oya: 4000, dealerAll: 4000 },
    "4": { ko: 2000, oya: 4000, dealerAll: 4000 }
  },
  "25": {
    "3": { ko: 1000, oya: 3000, dealerAll: 3000 },
    "4": { ko: 2000, oya: 5000, dealerAll: 5000 }
  },
  "30": {
    "1": { ko: 1000, oya: 1000, dealerAll: 1000 },
    "2": { ko: 1000, oya: 1000, dealerAll: 2000 },
    "3": { ko: 1000, oya: 3000, dealerAll: 3000 }
  },
  "40": {
    "1": { ko: 1000, oya: 1000, dealerAll: 1000 },
    "2": { ko: 1000, oya: 2000, dealerAll: 2000 },
    "3": { ko: 2000, oya: 4000, dealerAll: 4000 }
  },
  "50": {
    "1": { ko: 1000, oya: 1000, dealerAll: 1000 },
    "2": { ko: 1000, oya: 3000, dealerAll: 3000 },
    "3": { ko: 2000, oya: 5000, dealerAll: 5000 }
  },
  "60": {
    "1": { ko: 1000, oya: 1000, dealerAll: 2000 },
    "2": { ko: 1000, oya: 3000, dealerAll: 3000 }
  },
  "70": {
    "1": { ko: 1000, oya: 2000, dealerAll: 2000 },
    "2": { ko: 2000, oya: 3000, dealerAll: 4000 }
  }
};

const SANMA_RON_REGULAR_TABLE = {
  "25": {
    "2": { koRon: 2000, oyaRon: 3000 },
    "3": { koRon: 4000, oyaRon: 5000 },
    "4": { koRon: 7000, oyaRon: 10000 }
  },
  "30": {
    "1": { koRon: 1000, oyaRon: 2000 },
    "2": { koRon: 2000, oyaRon: 3000 },
    "3": { koRon: 4000, oyaRon: 6000 }
  },
  "40": {
    "1": { koRon: 2000, oyaRon: 2000 },
    "2": { koRon: 3000, oyaRon: 4000 },
    "3": { koRon: 6000, oyaRon: 8000 }
  },
  "50": {
    "1": { koRon: 2000, oyaRon: 3000 },
    "2": { koRon: 4000, oyaRon: 5000 },
    "3": { koRon: 7000, oyaRon: 10000 }
  },
  "60": {
    "1": { koRon: 2000, oyaRon: 3000 },
    "2": { koRon: 4000, oyaRon: 6000 }
  },
  "70": {
    "1": { koRon: 3000, oyaRon: 4000 },
    "2": { koRon: 5000, oyaRon: 7000 }
  }
};

const SANMA_TSUMO_LIMIT_TABLE = {
  mangan:     { ko: 3000,  oya: 5000,  dealerAll: 6000 },
  haneman:    { ko: 4000,  oya: 8000,  dealerAll: 9000 },
  baiman:     { ko: 6000,  oya: 10000, dealerAll: 12000 },
  sanbaiman:  { ko: 8000,  oya: 16000, dealerAll: 18000 },
  yakuman:    { ko: 12000, oya: 20000, dealerAll: 24000 }
};

const SANMA_RON_LIMIT_TABLE = {
  mangan:     { koRon: 8000,  oyaRon: 12000 },
  haneman:    { koRon: 12000, oyaRon: 18000 },
  baiman:     { koRon: 16000, oyaRon: 24000 },
  sanbaiman:  { koRon: 24000, oyaRon: 36000 },
  yakuman:    { koRon: 32000, oyaRon: 48000 }
};

function formatSanmaPoint(value){
  const n = Number(value) || 0;
  return n.toLocaleString("ja-JP");
}

function getSanmaScoreLimitName(totalHan, yakumanCount){
  const ym = Number.isFinite(yakumanCount) ? (yakumanCount | 0) : 0;
  const han = Number.isFinite(totalHan) ? (totalHan | 0) : 0;

  if (ym > 0) return "yakuman";
  if (han >= 13) return "yakuman";
  if (han >= 11) return "sanbaiman";
  if (han >= 8) return "baiman";
  if (han >= 6) return "haneman";
  if (han >= 5) return "mangan";
  return null;
}

function getRegularSanmaTsumoEntry(fu, han){
  const fuKey = String(fu | 0);
  const hanKey = String(han | 0);
  return (SANMA_TSUMO_REGULAR_TABLE[fuKey] && SANMA_TSUMO_REGULAR_TABLE[fuKey][hanKey]) || null;
}

function getRegularSanmaRonEntry(fu, han){
  const fuKey = String(fu | 0);
  const hanKey = String(han | 0);
  return (SANMA_RON_REGULAR_TABLE[fuKey] && SANMA_RON_REGULAR_TABLE[fuKey][hanKey]) || null;
}

function buildSanmaTsumoScoreResult(entry, isDealer, limitName = null, yakumanCount = 0){
  if (!entry) return null;

  if (isDealer){
    return {
      winType: "tsumo",
      isDealer: true,
      limitName,
      yakumanCount: yakumanCount | 0,
      payChild: entry.dealerAll | 0,
      payDealer: 0,
      payAll: entry.dealerAll | 0,
      ronPoint: 0,
      totalGain: (entry.dealerAll | 0) * 2,
      displayText: `${formatSanmaPoint(entry.dealerAll)}オール`
    };
  }

  return {
    winType: "tsumo",
    isDealer: false,
    limitName,
    yakumanCount: yakumanCount | 0,
    payChild: entry.ko | 0,
    payDealer: entry.oya | 0,
    payAll: 0,
    ronPoint: 0,
    totalGain: (entry.ko | 0) + (entry.oya | 0),
    displayText: `${formatSanmaPoint(entry.ko)}/${formatSanmaPoint(entry.oya)}`
  };
}

function buildSanmaRonScoreResult(entry, isDealer, limitName = null, yakumanCount = 0){
  if (!entry) return null;

  const ronPoint = isDealer ? (entry.oyaRon | 0) : (entry.koRon | 0);

  return {
    winType: "ron",
    isDealer: !!isDealer,
    limitName,
    yakumanCount: yakumanCount | 0,
    payChild: 0,
    payDealer: 0,
    payAll: 0,
    ronPoint,
    totalGain: ronPoint,
    displayText: formatSanmaPoint(ronPoint)
  };
}

function getSanmaLimitEntry(limitName, winType, yakumanCount = 0){
  if (!limitName) return null;

  if (winType === "tsumo"){
    const base = SANMA_TSUMO_LIMIT_TABLE[limitName];
    if (!base) return null;

    if (limitName === "yakuman" && yakumanCount > 1){
      return {
        ko: base.ko * yakumanCount,
        oya: base.oya * yakumanCount,
        dealerAll: base.dealerAll * yakumanCount
      };
    }
    return { ...base };
  }

  const base = SANMA_RON_LIMIT_TABLE[limitName];
  if (!base) return null;

  if (limitName === "yakuman" && yakumanCount > 1){
    return {
      koRon: base.koRon * yakumanCount,
      oyaRon: base.oyaRon * yakumanCount
    };
  }
  return { ...base };
}


function getSanmaHonbaCount(){
  if (typeof honba === "number" && Number.isFinite(honba) && honba > 0){
    return honba | 0;
  }
  return 0;
}

function attachSanmaHonbaInfo(scoreResult, honbaCount){
  if (!scoreResult) return null;

  const hb = Number.isFinite(honbaCount) ? (honbaCount | 0) : 0;
  const bonusPerPayer = hb * 1000;
  const next = { ...scoreResult };

  next.honba = hb;
  next.honbaBonusPerPayer = bonusPerPayer;
  next.honbaBonusTotal = 0;
  next.honbaDisplayText = "";

  if (hb <= 0) return next;

  if (next.winType === "tsumo"){
    if (next.isDealer){
      next.honbaBonusTotal = bonusPerPayer * 2;
      next.totalGain = (next.totalGain | 0) + next.honbaBonusTotal;
      next.honbaDisplayText = `(+${formatSanmaPoint(bonusPerPayer)}オール)`;
      return next;
    }

    next.honbaBonusTotal = bonusPerPayer * 2;
    next.totalGain = (next.totalGain | 0) + next.honbaBonusTotal;
    next.honbaDisplayText = `(+${formatSanmaPoint(bonusPerPayer)}/+${formatSanmaPoint(bonusPerPayer)})`;
    return next;
  }

  if (next.winType === "ron"){
    next.honbaBonusTotal = bonusPerPayer;
    next.totalGain = (next.totalGain | 0) + next.honbaBonusTotal;
    next.honbaDisplayText = `(+${formatSanmaPoint(bonusPerPayer)})`;
    return next;
  }

  return next;
}

function normalizeSanmaTotalHanFromInfo(info){
  if (!info) return 0;
  if (typeof info.totalHan === "number") return info.totalHan | 0;

  const baseHan = Number.isFinite(info.han) ? (info.han | 0) : 0;
  const bonusHan = (info.bonus && Number.isFinite(info.bonus.total)) ? (info.bonus.total | 0) : 0;
  return (baseHan + bonusHan) | 0;
}

function isSanmaNagashiBaimanInfo(info){
  if (!info || typeof info !== "object") return false;

  if (info.handKind === "nagashi") return true;

  const yakuList = Array.isArray(info.yaku) ? info.yaku : [];
  return yakuList.some((y)=> y && (y.key === "nagashiBaiman" || y.name === "流し倍満"));
}

function getSanmaIsDealerFromSeatIndex(seatIndex){
  if (typeof resultSeatWindBySeatIndex === "function"){
    return resultSeatWindBySeatIndex(seatIndex) === "東";
  }

  const east = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  return seatIndex === east;
}

function calcSanmaScoreFromInfo(info, seatIndex, winType){
  if (!info) return null;
  if (winType !== "tsumo" && winType !== "ron") return null;

  const isDealer = getSanmaIsDealerFromSeatIndex(seatIndex);
  const totalHan = normalizeSanmaTotalHanFromInfo(info);
  const fu = Number.isFinite(info.fu) ? (info.fu | 0) : 0;
  const yakumanCount = Number.isFinite(info.yakuman) ? (info.yakuman | 0) : 0;
  const honbaCount = getSanmaHonbaCount();

  const forcedLimitName = isSanmaNagashiBaimanInfo(info) ? "baiman" : null;
  const limitName = forcedLimitName || getSanmaScoreLimitName(totalHan, yakumanCount);

  if (limitName){
    const limitEntry = getSanmaLimitEntry(limitName, winType, yakumanCount);
    if (winType === "tsumo"){
      return attachSanmaHonbaInfo(buildSanmaTsumoScoreResult(limitEntry, isDealer, limitName, yakumanCount), honbaCount);
    }
    return attachSanmaHonbaInfo(buildSanmaRonScoreResult(limitEntry, isDealer, limitName, yakumanCount), honbaCount);
  }

  if (winType === "tsumo"){
    const regular = getRegularSanmaTsumoEntry(fu, totalHan);
    if (regular){
      return attachSanmaHonbaInfo(buildSanmaTsumoScoreResult(regular, isDealer, null, yakumanCount), honbaCount);
    }

    const fallbackLimit = getSanmaLimitEntry("mangan", "tsumo", yakumanCount);
    return attachSanmaHonbaInfo(buildSanmaTsumoScoreResult(fallbackLimit, isDealer, "mangan", yakumanCount), honbaCount);
  }

  const regular = getRegularSanmaRonEntry(fu, totalHan);
  if (regular){
    return attachSanmaHonbaInfo(buildSanmaRonScoreResult(regular, isDealer, null, yakumanCount), honbaCount);
  }

  const fallbackLimit = getSanmaLimitEntry("mangan", "ron", yakumanCount);
  return attachSanmaHonbaInfo(buildSanmaRonScoreResult(fallbackLimit, isDealer, "mangan", yakumanCount), honbaCount);
}
