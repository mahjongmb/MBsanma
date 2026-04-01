// MBsanma/js/yaku.js
// ========= yaku.js（役判定 / 打点素材） =========
// 目的：
// - 役判定を既存進行から分離して、あとから点数計算 / CPU判断へ流用しやすくする
// - 状態変更はしない（純関数中心）
//
// この段階で扱うもの：
// - 通常役（主要役）
//   リーチ / 門前ツモ / 役牌 / 断么九 / 平和 / 一盃口 /
//   七対子 / 対々和 / 三暗刻 / 混一色 / 清一色 / 小三元 / 混老頭
// - 役満
//   国士無双（単役満のみ）
// - ボーナス集計素材
//   ドラ / 赤ドラ / 北ドラ（※北ドラは役ではなく bonus 側で返す）
//
// 注意：
// - まだ点数計算そのものはしない
// - ドラ類だけではアガリ不可なので、役判定と bonus は分けて返す
// - render.js など描画系からは呼ばない前提

const YAKU_DEFS = {
  riichi:        { key: "riichi",        name: "リーチ",       han: 1 },
  doubleRiichi:  { key: "doubleRiichi",  name: "ダブリー",     han: 2 },
  ippatsu:       { key: "ippatsu",       name: "一発",         han: 1 },
  menzenTsumo:   { key: "menzenTsumo",   name: "門前ツモ",     han: 1 },
  haitei:        { key: "haitei",        name: "海底撈月",     han: 1 },
  houtei:        { key: "houtei",        name: "河底撈魚",     han: 1 },
  rinshan:       { key: "rinshan",       name: "嶺上開花",     han: 1 },
  chankan:       { key: "chankan",       name: "槍槓",         han: 1 },
  tanyao:        { key: "tanyao",        name: "断么九",       han: 1, kuisagari: false },
  pinfu:         { key: "pinfu",         name: "平和",         han: 1 },
  iipeiko:       { key: "iipeiko",       name: "一盃口",       han: 1 },
  ryanpeiko:     { key: "ryanpeiko",     name: "二盃口",       han: 3 },
  chiitoi:       { key: "chiitoi",       name: "七対子",       han: 2 },
  yakuhaiSeat:   { key: "yakuhaiSeat",   name: "自風",         han: 1 },
  yakuhaiRound:  { key: "yakuhaiRound",  name: "場風",         han: 1 },
  yakuhaiHaku:   { key: "yakuhaiHaku",   name: "白",           han: 1 },
  yakuhaiHatsu:  { key: "yakuhaiHatsu",  name: "發",           han: 1 },
  yakuhaiChun:   { key: "yakuhaiChun",   name: "中",           han: 1 },
  toitoi:        { key: "toitoi",        name: "対々和",       han: 2 },
  sanankou:      { key: "sanankou",      name: "三暗刻",       han: 2 },
  sanshokuDokou: { key: "sanshokuDokou", name: "三色同刻",     han: 2 },
  sankantsu:     { key: "sankantsu",     name: "三槓子",       han: 2 },
  ittsuu:        { key: "ittsuu",        name: "一気通貫",     han: 2, kuisagariHan: 1 },
  chanta:        { key: "chanta",        name: "混全帯么九",   han: 2, kuisagariHan: 1 },
  junchan:       { key: "junchan",       name: "純全帯么九",   han: 3, kuisagariHan: 2 },
  honitsu:       { key: "honitsu",       name: "混一色",       han: 3, kuisagariHan: 2 },
  chinitsu:      { key: "chinitsu",       name: "清一色",       han: 6, kuisagariHan: 5 },
  shousangen:    { key: "shousangen",    name: "小三元",       han: 2 },
  honroutou:     { key: "honroutou",     name: "混老頭",       han: 2 },
  kokushi:       { key: "kokushi",       name: "国士無双",     han: 0, yakuman: 1 }
};

function yakuTileIsTerminalOrHonor(code){
  if (!code || typeof code !== "string") return false;
  const suit = code[1];
  if (suit === "z") return true;
  if (suit === "m" || suit === "p" || suit === "s"){
    return code[0] === "1" || code[0] === "9";
  }
  return false;
}

function yakuTileIsHonor(code){
  return !!code && code[1] === "z";
}

function yakuTileIsYaochu(code){
  return yakuTileIsTerminalOrHonor(code);
}

function yakuTileIsNumber(code){
  if (!code || typeof code !== "string") return false;
  const suit = code[1];
  return suit === "m" || suit === "p" || suit === "s";
}

function yakuTileSuit(code){
  if (!code || typeof code !== "string") return "";
  return code[1] || "";
}

function yakuCloneCounts(counts){
  return Array.isArray(counts) ? counts.slice() : Array(TILE_TYPES.length).fill(0);
}

function yakuSafeCountsFromTiles(tiles){
  if (typeof countsFromTiles === "function"){
    return countsFromTiles(Array.isArray(tiles) ? tiles : []);
  }
  const c = Array(TILE_TYPES.length).fill(0);
  if (!Array.isArray(tiles)) return c;
  for (const t of tiles){
    const code = t && t.code;
    const idx = TYPE_TO_IDX[code];
    if (idx !== undefined) c[idx]++;
  }
  return c;
}

function getDoraCodeFromIndicatorForYaku(code){
  if (!code || typeof code !== "string" || code.length < 2) return code;

  const num = Number(code[0]);
  const suit = code[1];

  if (suit === "p" || suit === "s"){
    if (!Number.isInteger(num) || num < 1 || num > 9) return code;
    return `${num === 9 ? 1 : num + 1}${suit}`;
  }

  if (suit === "z"){
    if (!Number.isInteger(num) || num < 1 || num > 7) return code;
    return `${num === 7 ? 1 : num + 1}z`;
  }

  if (suit === "m"){
    if (code === "1m") return "9m";
    if (code === "9m") return "1m";
  }

  return code;
}

function isMenzenByMelds(meldList){
  if (!Array.isArray(meldList) || meldList.length === 0) return true;
  for (const m of meldList){
    if (!m) continue;
    if (m.type === "ankan") continue;
    return false;
  }
  return true;
}

function normalizeExternalMeldGroups(meldList){
  const groups = [];
  if (!Array.isArray(meldList)) return groups;

  for (const m of meldList){
    if (!m || !m.code) continue;

    if (m.type === "pon" || m.type === "minkan" || m.type === "kakan" || m.type === "ankan"){
      groups.push({
        type: "koutsu",
        code: m.code,
        open: m.type !== "ankan",
        concealed: m.type === "ankan",
        source: m.type
      });
    }
  }

  return groups;
}

function getMeldTileCount(m){
  if (!m || !m.type) return 0;
  if (m.type === "pon") return 3;
  if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan") return 4;
  return 0;
}

function getAgariShapeMeldTileCount(m){
  if (!m || !m.type) return 0;
  if (m.type === "pon") return 3;
  if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan") return 3;
  return 0;
}

function getTotalTileCountFromTilesAndMelds(tiles14, meldList){
  let total = 0;

  if (Array.isArray(tiles14)){
    total += tiles14.length;
  }

  if (Array.isArray(meldList)){
    for (const m of meldList){
      total += getMeldTileCount(m);
    }
  }

  return total;
}

function getAgariShapeTileCountFromTilesAndMelds(tiles14, meldList){
  let total = 0;

  if (Array.isArray(tiles14)){
    total += tiles14.length;
  }

  if (Array.isArray(meldList)){
    for (const m of meldList){
      total += getAgariShapeMeldTileCount(m);
    }
  }

  return total;
}

function findStandardAgariPatternsFromCounts(counts){
  const results = [];
  const work = yakuCloneCounts(counts);

  function pushResult(pairCode, melds){
    results.push({
      handKind: "standard",
      pairCode,
      melds: melds.map(x => ({ ...x }))
    });
  }

  function dfs(melds){
    let first = -1;
    for (let i = 0; i < work.length; i++){
      if (work[i] > 0){
        first = i;
        break;
      }
    }

    if (first === -1){
      pushResult(dfs.pairCode, melds);
      return;
    }

    const code = TILE_TYPES[first];
    const suit = code[1];
    const n = Number(code[0]);

    if (work[first] >= 3){
      work[first] -= 3;
      melds.push({ type: "koutsu", code, open: false, concealed: true, source: "concealed" });
      dfs(melds);
      melds.pop();
      work[first] += 3;
    }

    if ((suit === "p" || suit === "s") && n >= 1 && n <= 7){
      const idx2 = TYPE_TO_IDX[`${n + 1}${suit}`];
      const idx3 = TYPE_TO_IDX[`${n + 2}${suit}`];
      if (idx2 !== undefined && idx3 !== undefined && work[first] > 0 && work[idx2] > 0 && work[idx3] > 0){
        work[first]--;
        work[idx2]--;
        work[idx3]--;
        melds.push({ type: "shuntsu", code, open: false, concealed: true, source: "concealed" });
        dfs(melds);
        melds.pop();
        work[first]++;
        work[idx2]++;
        work[idx3]++;
      }
    }
  }

  for (let i = 0; i < work.length; i++){
    if (work[i] < 2) continue;
    work[i] -= 2;
    dfs.pairCode = TILE_TYPES[i];
    dfs([]);
    work[i] += 2;
  }

  return results;
}

function isChiitoiAgariFromCounts(counts){
  let pairUnits = 0;
  let tileCount = 0;

  for (let i = 0; i < counts.length; i++){
    const n = counts[i] | 0;
    tileCount += n;
    pairUnits += Math.floor(n / 2);
  }

  return tileCount === 14 && pairUnits >= 7;
}

function getChiitoiPairsFromCounts(counts){
  const pairs = [];
  for (let i = 0; i < counts.length; i++){
    const n = counts[i] | 0;
    const code = TILE_TYPES[i];
    const unit = Math.floor(n / 2);
    for (let k = 0; k < unit; k++){
      if (pairs.length < 7) pairs.push(code);
    }
    if (pairs.length >= 7) break;
  }
  return pairs;
}

function isKokushiAgariFromCounts(counts, meldList){
  if (Array.isArray(meldList) && meldList.length > 0) return false;
  if (typeof calcShantenKokushi !== "function") return false;
  return calcShantenKokushi(counts, 0) === -1;
}

function getTileCodeListFromTilesAndMelds(tiles14, meldList){
  const codes = [];
  if (Array.isArray(tiles14)){
    for (const t of tiles14){
      if (t && t.code) codes.push(t.code);
    }
  }
  if (Array.isArray(meldList)){
    for (const m of meldList){
      if (!m || !m.code) continue;
      if (m.type === "pon"){
        codes.push(m.code, m.code, m.code);
      } else if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan"){
        codes.push(m.code, m.code, m.code, m.code);
      }
    }
  }
  return codes;
}

function countCodeInCodeList(codes, targetCode){
  let n = 0;
  for (const code of codes){
    if (code === targetCode) n++;
  }
  return n;
}

function countAkaDoraInTilesAndMelds(tiles14, meldList){
  let count = 0;

  if (Array.isArray(tiles14)){
    for (const t of tiles14){
      if (!t) continue;
      if (t.imgCode === "r5p" || t.imgCode === "r5s") count++;
    }
  }

  if (Array.isArray(meldList)){
    for (const m of meldList){
      if (!m) continue;
      if (m.redCount && Number.isFinite(m.redCount)){
        count += Math.max(0, m.redCount | 0);
      }
    }
  }

  return count;
}

function countDoraFromIndicators(tiles14, meldList, indicators){
  if (!Array.isArray(indicators) || indicators.length === 0) return 0;

  const codes = getTileCodeListFromTilesAndMelds(tiles14, meldList);
  let total = 0;

  for (const d of indicators){
    const indicatorCode = d && d.code ? d.code : null;
    if (!indicatorCode) continue;
    const doraCode = getDoraCodeFromIndicatorForYaku(indicatorCode);
    total += countCodeInCodeList(codes, doraCode);
  }

  return total;
}

function countPeiDora(peisLike){
  if (!Array.isArray(peisLike)) return 0;
  return peisLike.length;
}

function getYakuhaiTargetCodes(roundWind, seatWind){
  const map = {
    east: "1z",
    south: "2z",
    west: "3z",
    north: "4z",
    "東": "1z",
    "南": "2z",
    "西": "3z",
    "北": "4z"
  };

  return {
    roundCode: map[roundWind] || null,
    seatCode: map[seatWind] || null,
    dragonHaku: "5z",
    dragonHatsu: "6z",
    dragonChun: "7z"
  };
}

function countGroupByTypeAndCode(groups, type, code){
  let n = 0;
  if (!Array.isArray(groups)) return n;
  for (const g of groups){
    if (!g) continue;
    if (g.type === type && g.code === code) n++;
  }
  return n;
}

function allGroupsAreTriplets(groups){
  if (!Array.isArray(groups) || groups.length === 0) return false;
  for (const g of groups){
    if (!g || g.type !== "koutsu") return false;
  }
  return true;
}

function allGroupsAreSequences(groups){
  if (!Array.isArray(groups)) return false;
  for (const g of groups){
    if (!g || g.type !== "shuntsu") return false;
  }
  return true;
}

function pairCodeIsValue(pairCode, roundWind, seatWind){
  const yk = getYakuhaiTargetCodes(roundWind, seatWind);
  return (
    pairCode === yk.roundCode ||
    pairCode === yk.seatCode ||
    pairCode === yk.dragonHaku ||
    pairCode === yk.dragonHatsu ||
    pairCode === yk.dragonChun
  );
}

function isRyanmenWaitForPinfu(shuntsuCode, winTileCode){
  if (!shuntsuCode || !winTileCode) return false;
  if (shuntsuCode[1] !== winTileCode[1]) return false;

  const start = Number(shuntsuCode[0]);
  const win = Number(winTileCode[0]);
  if (!Number.isInteger(start) || !Number.isInteger(win)) return false;

  if (start < 1 || start > 7) return false;
  if (win !== start && win !== start + 1 && win !== start + 2) return false;

  if (win === start + 1) return false;
  if (win === start && start === 7) return false;
  if (win === start + 2 && start === 1) return false;

  return true;
}

function hasPinfuPattern(pattern, externalGroups, winTileCode, roundWind, seatWind){
  if (!pattern || !winTileCode) return false;
  if (pairCodeIsValue(pattern.pairCode, roundWind, seatWind)) return false;

  const allGroups = [];
  if (Array.isArray(pattern.melds)) allGroups.push(...pattern.melds);
  if (Array.isArray(externalGroups)) allGroups.push(...externalGroups);

  if (!allGroupsAreSequences(allGroups)) return false;

  for (const g of pattern.melds){
    if (!g || g.type !== "shuntsu") continue;
    if (g.code[1] !== winTileCode[1]) continue;

    const start = Number(g.code[0]);
    const win = Number(winTileCode[0]);
    if (win !== start && win !== start + 1 && win !== start + 2) continue;

    if (isRyanmenWaitForPinfu(g.code, winTileCode)) return true;
  }

  return false;
}

function countIipeikoInPattern(pattern){
  if (!pattern || !Array.isArray(pattern.melds)) return 0;
  const map = new Map();
  for (const g of pattern.melds){
    if (!g || g.type !== "shuntsu") continue;
    const key = g.code;
    map.set(key, (map.get(key) || 0) + 1);
  }

  let count = 0;
  for (const n of map.values()){
    if (n >= 2) count += Math.floor(n / 2);
  }
  return count;
}

function countConcealedTriplets(pattern, externalGroups, winType, winTileCode){
  let count = 0;

  if (Array.isArray(pattern && pattern.melds)){
    for (const g of pattern.melds){
      if (!g || g.type !== "koutsu") continue;

      if (winType === "ron" && winTileCode && g.code === winTileCode){
        continue;
      }

      count++;
    }
  }

  if (Array.isArray(externalGroups)){
    for (const g of externalGroups){
      if (!g || g.type !== "koutsu") continue;
      if (g.concealed) count++;
    }
  }

  return count;
}

function hasSanshokuDokou(groups){
  if (!Array.isArray(groups) || groups.length === 0) return false;

  const targets = ["1", "9"];
  for (const num of targets){
    let hasM = false;
    let hasP = false;
    let hasS = false;

    for (const g of groups){
      if (!g || g.type !== "koutsu" || !g.code) continue;
      if (g.code[0] !== num) continue;

      if (g.code[1] === "m") hasM = true;
      if (g.code[1] === "p") hasP = true;
      if (g.code[1] === "s") hasS = true;
    }

    if (hasM && hasP && hasS) return true;
  }

  return false;
}

function hasIttsuu(groups){
  if (!Array.isArray(groups) || groups.length === 0) return false;

  for (const suit of ["p", "s"]){
    let has123 = false;
    let has456 = false;
    let has789 = false;

    for (const g of groups){
      if (!g || g.type !== "shuntsu" || !g.code) continue;
      if (g.code[1] !== suit) continue;

      if (g.code === `1${suit}`) has123 = true;
      if (g.code === `4${suit}`) has456 = true;
      if (g.code === `7${suit}`) has789 = true;
    }

    if (has123 && has456 && has789) return true;
  }

  return false;
}

function countKanMelds(meldList){
  if (!Array.isArray(meldList)) return 0;
  let count = 0;
  for (const m of meldList){
    if (!m || !m.type) continue;
    if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan") count++;
  }
  return count;
}

function groupContainsYaochu(group){
  if (!group || !group.code) return false;
  if (group.type === "koutsu"){
    return yakuTileIsTerminalOrHonor(group.code);
  }
  if (group.type === "shuntsu"){
    const suit = group.code[1];
    const start = Number(group.code[0]);
    if (!(suit === "p" || suit === "s")) return false;
    if (!Number.isInteger(start)) return false;
    return start === 1 || start === 7;
  }
  return false;
}

function groupContainsHonor(group){
  if (!group || !group.code) return false;
  if (group.type === "koutsu"){
    return yakuTileIsHonor(group.code);
  }
  return false;
}

function groupIsSequence(group){
  return !!group && group.type === "shuntsu";
}

function isChantaLikePattern(pattern, externalGroups, pairCode){
  const allGroups = [];
  if (Array.isArray(pattern && pattern.melds)) allGroups.push(...pattern.melds);
  if (Array.isArray(externalGroups)) allGroups.push(...externalGroups);

  if (allGroups.length !== 4) return { isChanta: false, isJunchan: false };

  let hasSequence = false;
  let hasHonor = yakuTileIsHonor(pairCode);

  if (!yakuTileIsTerminalOrHonor(pairCode)){
    return { isChanta: false, isJunchan: false };
  }

  for (const g of allGroups){
    if (!groupContainsYaochu(g)){
      return { isChanta: false, isJunchan: false };
    }
    if (groupIsSequence(g)){
      hasSequence = true;
    }
    if (groupContainsHonor(g)){
      hasHonor = true;
    }
  }

  if (!hasSequence){
    return { isChanta: false, isJunchan: false };
  }

  return {
    isChanta: true,
    isJunchan: !hasHonor
  };
}

function getSuitProfile(codes){
  const suits = new Set();
  let hasHonor = false;

  for (const code of codes){
    if (!code) continue;
    const suit = yakuTileSuit(code);
    if (suit === "z"){
      hasHonor = true;
    } else if (suit){
      suits.add(suit);
    }
  }

  return { suits, hasHonor };
}

function addYaku(resultList, key, overrideName, overrideHan, overrideYakuman){
  const def = YAKU_DEFS[key] || null;
  const name = overrideName || (def ? def.name : key);
  const han = Number.isFinite(overrideHan) ? overrideHan : (def ? def.han : 0);
  const yakuman = Number.isFinite(overrideYakuman) ? overrideYakuman : ((def && Number.isFinite(def.yakuman)) ? def.yakuman : 0);

  if (!def && !overrideName && !Number.isFinite(overrideHan) && !Number.isFinite(overrideYakuman)) return;

  resultList.push({
    key,
    name,
    han,
    yakuman
  });
}

function addYakuhaiByCode(resultList, groupCode, roundWind, seatWind){
  const yk = getYakuhaiTargetCodes(roundWind, seatWind);

  if (groupCode === yk.seatCode){
    addYaku(resultList, "yakuhaiSeat", `自風（${seatWind || ""}）`);
  }
  if (groupCode === yk.roundCode){
    addYaku(resultList, "yakuhaiRound", `場風（${roundWind || ""}）`);
  }
  if (groupCode === yk.dragonHaku){
    addYaku(resultList, "yakuhaiHaku");
  }
  if (groupCode === yk.dragonHatsu){
    addYaku(resultList, "yakuhaiHatsu");
  }
  if (groupCode === yk.dragonChun){
    addYaku(resultList, "yakuhaiChun");
  }
}

function buildYakuResultBase(opts){
  const tiles14 = Array.isArray(opts.tiles14) ? opts.tiles14.slice() : [];
  const meldList = Array.isArray(opts.meldList) ? opts.meldList.slice() : [];
  const counts = yakuSafeCountsFromTiles(tiles14);
  const isMenzen = isMenzenByMelds(meldList);

  return {
    input: {
      tiles14,
      meldList,
      winTileCode: opts.winTileCode || null,
      winType: opts.winType || null,
      roundWind: opts.roundWind || null,
      seatWind: opts.seatWind || null,
      isRiichi: !!opts.isRiichi,
      isDoubleRiichi: !!opts.isDoubleRiichi,
      isIppatsu: !!opts.isIppatsu,
      isHaitei: !!opts.isHaitei,
      isHoutei: !!opts.isHoutei,
      isRinshan: !!opts.isRinshan,
      isChankan: !!opts.isChankan,
      isTenhou: !!opts.isTenhou,
      isChiihou: !!opts.isChiihou,
      doraIndicators: Array.isArray(opts.doraIndicators) ? opts.doraIndicators.slice() : [],
      uraDoraIndicators: Array.isArray(opts.uraDoraIndicators) ? opts.uraDoraIndicators.slice() : [],
      peis: Array.isArray(opts.peis) ? opts.peis.slice() : []
    },
    counts,
    isAgari: false,
    handKind: null,
    isMenzen,
    yaku: [],
    han: 0,
    totalHan: 0,
    yakuman: 0,
    bonus: {
      dora: 0,
      uraDora: 0,
      akaDora: 0,
      peiDora: 0,
      total: 0
    },
    pattern: null,
    patterns: [],
    fu: 0,
    rawFu: 0,
    roundedFu: 0,
    fuBreakdown: [],
    fuInfo: null
  };
}

function applySituationYaku(result){
  if (!result || !result.input) return;

  if (result.input.isRiichi && result.input.isIppatsu && result.isMenzen){
    addYaku(result.yaku, "ippatsu");
  }
  if (result.input.isHaitei && result.input.winType === "tsumo"){
    addYaku(result.yaku, "haitei");
  }
  if (result.input.isHoutei && result.input.winType === "ron"){
    addYaku(result.yaku, "houtei");
  }
  if (result.input.isRinshan && result.input.winType === "tsumo"){
    addYaku(result.yaku, "rinshan");
  }
  if (result.input.isChankan && result.input.winType === "ron"){
    addYaku(result.yaku, "chankan");
  }
}

function finalizeYakuResult(base){
  let han = 0;
  let yakuman = 0;

  for (const y of base.yaku){
    if (!y) continue;
    if (y.yakuman) yakuman += y.yakuman;
    else han += (y.han | 0);
  }

  base.han = han;
  base.yakuman = yakuman;
  base.bonus.total = (base.bonus.dora | 0) + (base.bonus.uraDora | 0) + (base.bonus.akaDora | 0) + (base.bonus.peiDora | 0);
  base.totalHan = (yakuman > 0) ? 0 : ((base.han | 0) + (base.bonus.total | 0));

  if (typeof calcFuInfoFromAgariInfo === "function"){
    const fuInfo = calcFuInfoFromAgariInfo(base);
    base.fuInfo = fuInfo || null;
    base.fu = fuInfo && Number.isFinite(fuInfo.fu) ? (fuInfo.fu | 0) : 0;
    base.rawFu = fuInfo && Number.isFinite(fuInfo.rawFu) ? (fuInfo.rawFu | 0) : 0;
    base.roundedFu = fuInfo && Number.isFinite(fuInfo.roundedFu) ? (fuInfo.roundedFu | 0) : 0;
    base.fuBreakdown = fuInfo && Array.isArray(fuInfo.breakdown) ? fuInfo.breakdown.slice() : [];
  } else {
    base.fuInfo = null;
    base.fu = 0;
    base.rawFu = 0;
    base.roundedFu = 0;
    base.fuBreakdown = [];
  }

  return base;
}

function getBestStandardYakuResult(base){
  const externalGroups = normalizeExternalMeldGroups(base.input.meldList);
  const concealedPatterns = findStandardAgariPatternsFromCounts(base.counts);
  const allCodeList = getTileCodeListFromTilesAndMelds(base.input.tiles14, base.input.meldList);

  let best = null;

  for (const pattern of concealedPatterns){
    const result = buildYakuResultBase(base.input);
    result.isAgari = true;
    result.handKind = "standard";
    result.pattern = pattern;
    result.patterns = concealedPatterns;

    const groups = [];
    groups.push(...pattern.melds);
    groups.push(...externalGroups);

    if (result.input.isRiichi && result.isMenzen){
      if (result.input.isDoubleRiichi){
        addYaku(result.yaku, "doubleRiichi");
      } else {
        addYaku(result.yaku, "riichi");
      }
    }

    if (result.input.winType === "tsumo" && result.isMenzen){
      addYaku(result.yaku, "menzenTsumo");
    }

    applySituationYaku(result);

    let allTanyao = true;
    for (const code of allCodeList){
      if (yakuTileIsYaochu(code)){
        allTanyao = false;
        break;
      }
    }
    if (allTanyao){
      addYaku(result.yaku, "tanyao");
    }

    if (result.isMenzen && hasPinfuPattern(pattern, externalGroups, result.input.winTileCode, result.input.roundWind, result.input.seatWind)){
      addYaku(result.yaku, "pinfu");
    }

    if (result.isMenzen){
      const peikoCount = countIipeikoInPattern(pattern);
      if (peikoCount >= 2){
        addYaku(result.yaku, "ryanpeiko");
      } else if (peikoCount >= 1){
        addYaku(result.yaku, "iipeiko");
      }
    }

    for (const g of groups){
      if (!g || g.type !== "koutsu") continue;
      addYakuhaiByCode(result.yaku, g.code, result.input.roundWind, result.input.seatWind);
    }

    if (allGroupsAreTriplets(groups)){
      addYaku(result.yaku, "toitoi");
    }

    if (countConcealedTriplets(pattern, externalGroups, result.input.winType, result.input.winTileCode) >= 3){
      addYaku(result.yaku, "sanankou");
    }

    if (hasSanshokuDokou(groups)){
      addYaku(result.yaku, "sanshokuDokou");
    }

    if (countKanMelds(result.input.meldList) >= 3){
      addYaku(result.yaku, "sankantsu");
    }

    if (hasIttsuu(groups)){
      const def = YAKU_DEFS.ittsuu;
      addYaku(result.yaku, "ittsuu", def.name, result.isMenzen ? def.han : def.kuisagariHan);
    }

    const chantaInfo = isChantaLikePattern(pattern, externalGroups, pattern.pairCode);
    if (chantaInfo.isJunchan){
      const def = YAKU_DEFS.junchan;
      addYaku(result.yaku, "junchan", def.name, result.isMenzen ? def.han : def.kuisagariHan);
    } else if (chantaInfo.isChanta){
      const def = YAKU_DEFS.chanta;
      addYaku(result.yaku, "chanta", def.name, result.isMenzen ? def.han : def.kuisagariHan);
    }

    const profile = getSuitProfile(allCodeList);
    if (profile.suits.size === 1){
      if (profile.hasHonor){
        const def = YAKU_DEFS.honitsu;
        addYaku(result.yaku, "honitsu", def.name, result.isMenzen ? def.han : def.kuisagariHan);
      } else {
        const def = YAKU_DEFS.chinitsu;
        addYaku(result.yaku, "chinitsu", def.name, result.isMenzen ? def.han : def.kuisagariHan);
      }
    }

    let dragonTriplets = 0;
    const dragonTripletCodes = ["5z", "6z", "7z"];
    for (const code of dragonTripletCodes){
      if (countGroupByTypeAndCode(groups, "koutsu", code) >= 1) dragonTriplets++;
    }
    if (dragonTriplets >= 2 && dragonTripletCodes.includes(pattern.pairCode)){
      addYaku(result.yaku, "shousangen");
    }

    let allHonroutou = true;
    for (const code of allCodeList){
      if (!yakuTileIsTerminalOrHonor(code)){
        allHonroutou = false;
        break;
      }
    }
    if (allHonroutou){
      addYaku(result.yaku, "honroutou");
    }

    result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
    result.bonus.uraDora = result.input.isRiichi
      ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
      : 0;
    result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
    result.bonus.peiDora = countPeiDora(result.input.peis);

    finalizeYakuResult(result);

    if (!best){
      best = result;
      continue;
    }

    if (result.yakuman > best.yakuman){
      best = result;
      continue;
    }
    if (result.yakuman < best.yakuman) continue;

    if (result.totalHan > best.totalHan){
      best = result;
      continue;
    }
    if (result.totalHan < best.totalHan) continue;

    if (result.han > best.han){
      best = result;
      continue;
    }
    if (result.han < best.han) continue;

    if (result.bonus.total > best.bonus.total){
      best = result;
      continue;
    }
    if (result.bonus.total < best.bonus.total) continue;

    if ((result.fu | 0) > (best.fu | 0)){
      best = result;
      continue;
    }
  }

  return best;
}

function getChiitoiYakuResult(base){
  if (!isChiitoiAgariFromCounts(base.counts)) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = "chiitoi";
  result.pattern = { handKind: "chiitoi", pairs: getChiitoiPairsFromCounts(base.counts) };
  result.patterns = [result.pattern];

  if (result.input.isRiichi && result.isMenzen){
    addYaku(result.yaku, "riichi");
  }
  if (result.input.winType === "tsumo" && result.isMenzen){
    addYaku(result.yaku, "menzenTsumo");
  }

  applySituationYaku(result);
  addYaku(result.yaku, "chiitoi");

  const allCodeList = getTileCodeListFromTilesAndMelds(result.input.tiles14, result.input.meldList);

  let allTanyao = true;
  let allHonroutou = true;
  for (const code of allCodeList){
    if (yakuTileIsYaochu(code)) allTanyao = false;
    if (!yakuTileIsTerminalOrHonor(code)) allHonroutou = false;
  }
  if (allTanyao){
    addYaku(result.yaku, "tanyao");
  }
  if (allHonroutou){
    addYaku(result.yaku, "honroutou");
  }

  const profile = getSuitProfile(allCodeList);
  if (profile.suits.size === 1){
    if (profile.hasHonor){
      const def = YAKU_DEFS.honitsu;
      addYaku(result.yaku, "honitsu", def.name, def.han);
    } else {
      const def = YAKU_DEFS.chinitsu;
      addYaku(result.yaku, "chinitsu", def.name, def.han);
    }
  }

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = result.input.isRiichi
    ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
    : 0;
  result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
  result.bonus.peiDora = countPeiDora(result.input.peis);

  return finalizeYakuResult(result);
}

function getKokushiYakuResult(base){
  if (!isKokushiAgariFromCounts(base.counts, base.input.meldList)) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = "kokushi";
  result.pattern = { handKind: "kokushi" };
  result.patterns = [result.pattern];

  applySituationYaku(result);
  addYaku(result.yaku, "kokushi");

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = result.input.isRiichi
    ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
    : 0;
  result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
  result.bonus.peiDora = countPeiDora(result.input.peis);

  return finalizeYakuResult(result);
}

function getAgariYakuInfo(opts = {}){
  const base = buildYakuResultBase(opts);

  const tiles14 = base.input.tiles14;
  const meldList = base.input.meldList;
  const totalTileCount = getAgariShapeTileCountFromTilesAndMelds(tiles14, meldList);

  if (!Array.isArray(tiles14) || totalTileCount !== 14){
    return finalizeYakuResult(base);
  }

  const fixedM = Array.isArray(meldList) ? meldList.length : 0;
  if (typeof calcShanten === "function"){
    const sh = calcShanten(base.counts, fixedM);
    if (sh !== -1){
      return finalizeYakuResult(base);
    }
  }

  const candidates = [];

  if (typeof getYakumanCandidates === "function"){
    try{
      const yakumanCandidates = getYakumanCandidates(base);
      if (Array.isArray(yakumanCandidates)){
        for (const c of yakumanCandidates){
          if (c) candidates.push(c);
        }
      }
    }catch(e){}
  } else {
    const kokushi = getKokushiYakuResult(base);
    if (kokushi) candidates.push(kokushi);
  }

  const chiitoi = getChiitoiYakuResult(base);
  if (chiitoi) candidates.push(chiitoi);

  const standard = getBestStandardYakuResult(base);
  if (standard) candidates.push(standard);

  if (candidates.length === 0){
    base.isAgari = true;
    base.handKind = "unknown";
    base.bonus.dora = countDoraFromIndicators(base.input.tiles14, base.input.meldList, base.input.doraIndicators);
    base.bonus.uraDora = base.input.isRiichi
      ? countDoraFromIndicators(base.input.tiles14, base.input.meldList, base.input.uraDoraIndicators)
      : 0;
    base.bonus.akaDora = countAkaDoraInTilesAndMelds(base.input.tiles14, base.input.meldList);
    base.bonus.peiDora = countPeiDora(base.input.peis);
    return finalizeYakuResult(base);
  }

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++){
    const cur = candidates[i];

    if (cur.yakuman > best.yakuman){
      best = cur;
      continue;
    }
    if (cur.yakuman < best.yakuman) continue;

    if (cur.totalHan > best.totalHan){
      best = cur;
      continue;
    }
    if (cur.totalHan < best.totalHan) continue;

    if (cur.han > best.han){
      best = cur;
      continue;
    }
    if (cur.han < best.han) continue;

    if (cur.bonus.total > best.bonus.total){
      best = cur;
      continue;
    }
    if (cur.bonus.total < best.bonus.total) continue;

    if ((cur.fu | 0) > (best.fu | 0)){
      best = cur;
    }
  }

  return best;
}

function canAgariByYakuInfo(opts = {}){
  const info = getAgariYakuInfo(opts);
  if (!info || !info.isAgari) return false;
  if ((info.yakuman | 0) > 0) return true;
  return (info.han | 0) > 0;
}

function getCurrentPlayerAgariYakuInfo(winType, ronTileLike){
  const tiles14 = Array.isArray(hand13) ? hand13.slice() : [];

  if (winType === "ron"){
    if (ronTileLike && ronTileLike.code) tiles14.push({ code: ronTileLike.code });
  } else if (drawn) {
    tiles14.push(drawn);
  }

  let seatWind = null;
  let roundW = (typeof roundWind !== "undefined") ? roundWind : null;

  if (typeof eastSeatIndex === "number"){
    if (eastSeatIndex === 0) seatWind = "東";
    else if (eastSeatIndex === 1) seatWind = "西";
    else if (eastSeatIndex === 2) seatWind = "南";
  }

  return getAgariYakuInfo({
    tiles14,
    meldList: Array.isArray(melds) ? melds.slice() : [],
    winType: winType || (drawn ? "tsumo" : null),
    winTileCode: (winType === "ron" && ronTileLike && ronTileLike.code)
      ? ronTileLike.code
      : (drawn ? drawn.code : null),
    isRiichi: !!isRiichi,
    roundWind: roundW,
    seatWind,
    doraIndicators: Array.isArray(doraIndicators) ? doraIndicators.slice() : [],
    uraDoraIndicators: Array.isArray(uraDoraIndicators) ? uraDoraIndicators.slice() : [],
    peis: Array.isArray(peis) ? peis.slice() : [],
    ...(typeof getWinSituationFlags === "function" ? getWinSituationFlags(winType || (drawn ? "tsumo" : null), 0) : {})
  });
}