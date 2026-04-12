// MBsanma/js/turn.js
// ========= turn.js（ターン制：進行の司令塔） =========

// 0=自分(下) / 1=右CPU / 2=左CPU
let currentTurnSeatIndex = 0;

// "DISCARD" | "CALL_DISCARD"
let turnPhase = "DISCARD";

// ★ 通常速度の基準値（高速モードON時は main.js の速度設定を参照）
const CPU_TURN_DELAY_MS = 500;
const PLAYER_TURN_DRAW_DELAY_MS = 500;
const PLAYER_AUTO_DISCARD_DELAY_MS = 650;
const PLAYER_SPECIAL_ACTION_DELAY_MS = 520;

function getTurnSpeedMs(key, fallback){
  try{
    if (typeof getGameSpeedMs === "function"){
      return getGameSpeedMs(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function getCpuTurnDelayMs(){
  return getTurnSpeedMs("cpuTurnDelayMs", CPU_TURN_DELAY_MS);
}

function getPlayerTurnDrawDelayMs(){
  return getTurnSpeedMs("playerTurnDrawDelayMs", PLAYER_TURN_DRAW_DELAY_MS);
}

function getPlayerAutoDiscardDelayMs(){
  return getTurnSpeedMs("playerAutoDiscardDelayMs", PLAYER_AUTO_DISCARD_DELAY_MS);
}

function getPlayerSpecialActionDelayMs(){
  return getTurnSpeedMs("playerSpecialActionDelayMs", PLAYER_SPECIAL_ACTION_DELAY_MS);
}

let playerDrawTimer = null;
let playerAutoDiscardTimer = null;
let playerSpecialActionTimer = null;

function clearPlayerAutoDiscardTimer(){
  if (playerAutoDiscardTimer){
    clearTimeout(playerAutoDiscardTimer);
    playerAutoDiscardTimer = null;
  }
}

function clearPlayerSpecialAiTimer(){
  if (playerSpecialActionTimer){
    clearTimeout(playerSpecialActionTimer);
    playerSpecialActionTimer = null;
  }
}


function getCpuRiichiWaitCodesForLog(concealedTiles, fixedMeldCount){
  if (!Array.isArray(concealedTiles)) return [];
  if (typeof TILE_TYPES === "undefined" || !Array.isArray(TILE_TYPES)) return [];
  if (typeof countsFromTiles !== "function" || typeof calcShanten !== "function") return [];

  const out = [];
  const seen = new Set();
  for (const code of TILE_TYPES){
    if (!code || seen.has(code)) continue;
    seen.add(code);
    try{
      const tiles14 = concealedTiles.slice();
      tiles14.push({ code });
      if (calcShanten(countsFromTiles(tiles14), fixedMeldCount) === -1){
        out.push(code);
      }
    }catch(e){}
  }
  return out;
}

function getCpuPatternPairCodeForLog(pattern){
  const src = pattern && typeof pattern === "object" ? pattern : null;
  if (!src) return null;

  const candidates = [src.pair, src.pairCode, src.head, src.janto, src.toitsu, src.eyes];
  for (const candidate of candidates){
    if (!candidate) continue;
    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object"){
      if (typeof candidate.code === "string") return candidate.code;
      if (Array.isArray(candidate.tiles) && candidate.tiles.length > 0){
        const tile0 = candidate.tiles[0];
        if (typeof tile0 === "string") return tile0;
        if (tile0 && typeof tile0.code === "string") return tile0.code;
      }
    }
    if (Array.isArray(candidate) && candidate.length > 0){
      const tile0 = candidate[0];
      if (typeof tile0 === "string") return tile0;
      if (tile0 && typeof tile0.code === "string") return tile0.code;
    }
  }

  return null;
}

function isCpuTripletMeldTypeForLog(type){
  const value = String(type || "").toLowerCase();
  return value === "koutsu" || value === "anko" || value === "pon" || value === "triplet";
}

function getCpuShuntsuSubtypeForLog(meldCode, waitCode){
  const meld = String(meldCode || "");
  const wait = String(waitCode || "");
  if (meld.length < 2 || wait.length < 2) return "";

  const suit = meld.slice(-1);
  const start = Number(meld.slice(0, -1));
  const waitNum = Number(wait.slice(0, -1));
  if (!Number.isInteger(start) || !Number.isInteger(waitNum)) return "";
  if (wait.slice(-1) !== suit) return "";

  if (waitNum === start + 1) return "kanchan";

  if (waitNum === start){
    if (start === 7) return "penchan";
    if (start >= 2 && start <= 6) return "ryanmen";
  }

  if (waitNum === start + 2){
    if (start === 1) return "penchan";
    if (start >= 2 && start <= 6) return "ryanmen";
  }

  return "";
}

function getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog(concealedTiles, waitCode){
  const out = new Set();
  if (!waitCode) return out;
  if (typeof countsFromTiles !== "function") return out;
  if (typeof findStandardAgariPatternsFromCounts !== "function") return out;

  try{
    const tiles14 = Array.isArray(concealedTiles) ? concealedTiles.slice() : [];
    tiles14.push({ code: waitCode });
    const patterns = findStandardAgariPatternsFromCounts(countsFromTiles(tiles14));

    for (const pattern of (Array.isArray(patterns) ? patterns : [])){
      const pairCode = getCpuPatternPairCodeForLog(pattern);
      if (pairCode === waitCode) out.add("tanki");

      const meldsInPattern = Array.isArray(pattern && pattern.melds) ? pattern.melds : [];
      for (const meld of meldsInPattern){
        if (!meld || !meld.code) continue;

        if (isCpuTripletMeldTypeForLog(meld.type) && meld.code === waitCode){
          out.add("shabo");
          continue;
        }

        if (meld.type !== "shuntsu") continue;
        const subtype = getCpuShuntsuSubtypeForLog(meld.code, waitCode);
        if (subtype) out.add(subtype);
      }
    }
  }catch(e){}

  return out;
}

function getCpuRyanmenCapableWaitCodesForLog(concealedTiles, fixedMeldCount, waitCodes){
  const waits = Array.isArray(waitCodes) ? waitCodes : [];
  if (!waits.length) return [];

  const out = [];
  const seen = new Set();

  for (const waitCode of waits){
    if (!waitCode || seen.has(waitCode)) continue;
    const keys = getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog(concealedTiles, waitCode);
    if (keys.has("ryanmen")){
      seen.add(waitCode);
      out.push(waitCode);
    }
  }

  return out;
}

function classifyCpuWaitTypeKeysForLog(concealedTiles, fixedMeldCount, waitCodes){
  const waits = Array.isArray(waitCodes) ? waitCodes.filter(Boolean) : [];
  if (!waits.length) return [];

  const detailKeys = new Set();
  const ryanmenWaitCodes = [];
  const seenRyanmenCodes = new Set();

  for (const waitCode of waits){
    const keys = getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog(concealedTiles, waitCode);
    keys.forEach((key)=> detailKeys.add(key));
    if (keys.has("ryanmen") && !seenRyanmenCodes.has(waitCode)){
      seenRyanmenCodes.add(waitCode);
      ryanmenWaitCodes.push(waitCode);
    }
  }

  const ryanmenCount = ryanmenWaitCodes.length;
  const totalCount = waits.length;
  const hasNonRyanmenDetail = ["tanki", "shabo", "kanchan", "penchan"].some((key)=> detailKeys.has(key));

  const out = [];
  if (ryanmenCount >= 2){
    if (!hasNonRyanmenDetail && totalCount === 2 && ryanmenCount === 2){
      out.push("ryanmen");
    } else if (!hasNonRyanmenDetail && totalCount === 3 && ryanmenCount === 3){
      out.push("sanmenchan");
    } else {
      out.push("multi_ryanmen");
    }
  }

  ["tanki", "shabo", "kanchan", "penchan"].forEach((key)=> {
    if (detailKeys.has(key)) out.push(key);
  });

  if (!out.length){
    out.push("other");
  }

  return out;
}

function isCpuRiichiRyanmenWaitForLog(concealedTiles, fixedMeldCount, waitCodes){
  const keys = classifyCpuWaitTypeKeysForLog(concealedTiles, fixedMeldCount, waitCodes);
  return keys.includes("ryanmen") || keys.includes("sanmenchan") || keys.includes("multi_ryanmen");
}

function buildCpuRiichiTenpaiDetailForLog(seatIndex, concealedTiles, fixedMeldCount){
  const tiles13 = Array.isArray(concealedTiles) ? concealedTiles.slice() : [];
  const waitCodes = getCpuRiichiWaitCodesForLog(tiles13, fixedMeldCount);

  let waitTileCount = 0;
  try{
    if (typeof countVisibleForCpuSeat === "function" && typeof TYPE_TO_IDX === "object"){
      const visibleCounts = countVisibleForCpuSeat(seatIndex, tiles13);
      for (const code of waitCodes){
        const idx = TYPE_TO_IDX[code];
        if (idx === undefined) continue;
        waitTileCount += Math.max(0, 4 - (Number(visibleCounts[idx]) || 0));
      }
    }
  }catch(e){}

  if (!Number.isFinite(waitTileCount) || waitTileCount <= 0){
    waitTileCount = waitCodes.length;
  }

  const waitTypeKeys = classifyCpuWaitTypeKeysForLog(tiles13, fixedMeldCount, waitCodes);
  const isRyanmenWait = waitTypeKeys.includes("ryanmen") || waitTypeKeys.includes("sanmenchan") || waitTypeKeys.includes("multi_ryanmen");

  return {
    waitTileCount,
    waitTypeCount: Array.isArray(waitCodes) ? waitCodes.length : 0,
    isRyanmenWait,
    waitTypeKeys,
    waitCodes: waitCodes.slice()
  };
}

function pushCpuRiichiEventForLog(seatIndex, discardedTile, concealedTiles, fixedMeldCount, riverRef){
  try{
    if (typeof window === "undefined" || !window.MBSanmaMatchLog || typeof window.MBSanmaMatchLog.pushEvent !== "function") return;

    const tenpai = buildCpuRiichiTenpaiDetailForLog(seatIndex, concealedTiles, fixedMeldCount);
    const tileLike = discardedTile && discardedTile.code
      ? (window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(discardedTile) : { code: discardedTile.code, imgCode: discardedTile.imgCode || discardedTile.code })
      : null;

    window.MBSanmaMatchLog.pushEvent("riichi", {
      seatIndex,
      junme: Array.isArray(riverRef) ? riverRef.length : 0,
      tile: tileLike,
      tenpai
    });
  }catch(e){}
}

function getPlayerDiscardAiProfileOverride(){
  try{
    if (typeof buildCpuDiscardInternalProfileFromExternalStyle === "function"){
      return buildCpuDiscardInternalProfileFromExternalStyle("balanced");
    }
  }catch(e){}
  return "balanced";
}

function getPlayerAiRiichiSeatIndexes(){
  const out = [];
  try{ if (typeof isRiichi !== "undefined" && isRiichi) out.push(0); }catch(e){}
  try{ if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(1)) out.push(1); }catch(e){}
  try{ if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(2)) out.push(2); }catch(e){}
  return out;
}

function addPlayerAiVisibleTileCounts(counts, tilesLike){
  if (!Array.isArray(counts) || !Array.isArray(tilesLike)) return;
  for (const tile of tilesLike){
    if (!tile || !tile.code || typeof TYPE_TO_IDX !== "object") continue;
    const idx = TYPE_TO_IDX[tile.code];
    if (idx === undefined) continue;
    counts[idx] += 1;
  }
}

function addPlayerAiVisibleMeldCounts(counts, meldList){
  if (!Array.isArray(counts) || !Array.isArray(meldList)) return;
  for (const meld of meldList){
    if (!meld || !meld.code || typeof TYPE_TO_IDX !== "object") continue;
    const idx = TYPE_TO_IDX[meld.code];
    if (idx === undefined) continue;
    const kind = meld.type || "pon";
    counts[idx] += (kind === "ankan" || kind === "minkan" || kind === "kakan") ? 4 : 3;
  }
}

function buildPlayerDiscardAiVisibleCounts(afterTiles){
  const counts = Array.isArray(TILE_TYPES) ? Array(TILE_TYPES.length).fill(0) : [];
  addPlayerAiVisibleTileCounts(counts, afterTiles);
  addPlayerAiVisibleTileCounts(counts, river);
  addPlayerAiVisibleTileCounts(counts, cpuRightRiver);
  addPlayerAiVisibleTileCounts(counts, cpuLeftRiver);
  addPlayerAiVisibleTileCounts(counts, peis);
  try{ if (Array.isArray(cpuRightPeis)) addPlayerAiVisibleTileCounts(counts, cpuRightPeis); }catch(e){}
  try{ if (Array.isArray(cpuLeftPeis)) addPlayerAiVisibleTileCounts(counts, cpuLeftPeis); }catch(e){}
  if (Array.isArray(doraIndicators)) addPlayerAiVisibleTileCounts(counts, doraIndicators);
  addPlayerAiVisibleMeldCounts(counts, melds);
  try{ if (Array.isArray(cpuRightMelds)) addPlayerAiVisibleMeldCounts(counts, cpuRightMelds); }catch(e){}
  try{ if (Array.isArray(cpuLeftMelds)) addPlayerAiVisibleMeldCounts(counts, cpuLeftMelds); }catch(e){}
  return counts;
}

function buildPlayerDiscardAiSnapshot(){
  const fixedMeldCount = Array.isArray(melds) ? melds.length : 0;
  const candidates = [];
  const inCallDiscard = (typeof turnPhase !== "undefined" && turnPhase === "CALL_DISCARD");
  const forbiddenCode = (typeof getPlayerForbiddenCallDiscardCode === "function") ? getPlayerForbiddenCallDiscardCode() : null;

  if (inCallDiscard){
    const baseTiles = Array.isArray(hand13) ? hand13.slice() : [];
    for (let i = 0; i < baseTiles.length; i++){
      const discardTile = baseTiles[i];
      if (!discardTile || !discardTile.code) continue;
      if (forbiddenCode && discardTile.code === forbiddenCode) continue;

      const after13 = baseTiles.slice();
      after13.splice(i, 1);
      const counts13 = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
      const shantenAfter = counts13 && typeof calcShanten === "function" ? calcShanten(counts13, fixedMeldCount) : 99;
      const visibleCounts = buildPlayerDiscardAiVisibleCounts(after13);
      const improveCount = (counts13 && typeof countCpuImproveTiles === "function")
        ? countCpuImproveTiles(0, counts13, visibleCounts, fixedMeldCount)
        : 0;

      candidates.push({
        discardTile,
        discardIndex: i,
        discardTileId: discardTile.id,
        after13,
        shantenAfter,
        improveCount,
        isDrawnDiscard: false,
        willRiichi: false
      });
    }
  } else {
    const baseTiles = Array.isArray(hand13) ? hand13.slice() : [];
    for (let i = 0; i < baseTiles.length; i++){
      const discardTile = baseTiles[i];
      if (!discardTile || !discardTile.code) continue;

      const after13 = baseTiles.slice();
      after13.splice(i, 1);
      if (drawn) after13.push(drawn);
      const counts13 = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
      const shantenAfter = counts13 && typeof calcShanten === "function" ? calcShanten(counts13, fixedMeldCount) : 99;
      const visibleCounts = buildPlayerDiscardAiVisibleCounts(after13);
      const improveCount = (counts13 && typeof countCpuImproveTiles === "function")
        ? countCpuImproveTiles(0, counts13, visibleCounts, fixedMeldCount)
        : 0;

      candidates.push({
        discardTile,
        discardIndex: i,
        discardTileId: discardTile.id,
        after13,
        shantenAfter,
        improveCount,
        isDrawnDiscard: false,
        willRiichi: false
      });
    }

    if (drawn){
      const after13 = baseTiles.slice();
      const counts13 = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
      const shantenAfter = counts13 && typeof calcShanten === "function" ? calcShanten(counts13, fixedMeldCount) : 99;
      const visibleCounts = buildPlayerDiscardAiVisibleCounts(after13);
      const improveCount = (counts13 && typeof countCpuImproveTiles === "function")
        ? countCpuImproveTiles(0, counts13, visibleCounts, fixedMeldCount)
        : 0;

      candidates.push({
        discardTile: drawn,
        discardIndex: baseTiles.length,
        discardTileId: drawn.id,
        after13,
        shantenAfter,
        improveCount,
        isDrawnDiscard: true,
        willRiichi: false
      });
    }
  }

  return {
    seatIndex: 0,
    candidates,
    round: {
      doraIndicators: Array.isArray(doraIndicators) ? doraIndicators.slice() : []
    },
    table: {
      rivers: {
        0: Array.isArray(river) ? river.slice() : [],
        1: Array.isArray(cpuRightRiver) ? cpuRightRiver.slice() : [],
        2: Array.isArray(cpuLeftRiver) ? cpuLeftRiver.slice() : []
      },
      melds: {
        0: Array.isArray(melds) ? melds.slice() : [],
        1: (typeof cpuRightMelds !== "undefined" && Array.isArray(cpuRightMelds)) ? cpuRightMelds.slice() : [],
        2: (typeof cpuLeftMelds !== "undefined" && Array.isArray(cpuLeftMelds)) ? cpuLeftMelds.slice() : []
      },
      peis: {
        0: Array.isArray(peis) ? peis.slice() : [],
        1: (typeof cpuRightPeis !== "undefined" && Array.isArray(cpuRightPeis)) ? cpuRightPeis.slice() : [],
        2: (typeof cpuLeftPeis !== "undefined" && Array.isArray(cpuLeftPeis)) ? cpuLeftPeis.slice() : []
      },
      riichiSeatIndexes: getPlayerAiRiichiSeatIndexes()
    }
  };
}

function getPlayerDiscardAiDecision(snapshot){
  if (!snapshot || !Array.isArray(snapshot.candidates) || snapshot.candidates.length <= 0) return null;

  try{
    if (typeof buildCpuDiscardShadowDecision === "function"){
      const decision = buildCpuDiscardShadowDecision(snapshot, getPlayerDiscardAiProfileOverride());
      if (decision && decision.action === "discard") return decision;
    }
  }catch(e){}

  if (typeof turnPhase !== "undefined" && turnPhase === "CALL_DISCARD"){
    try{
      if (typeof chooseCpuCallDiscardInfo === "function"){
        const info = chooseCpuCallDiscardInfo(0, hand13, Array.isArray(melds) ? melds.length : 0, {
          forbiddenDiscardCode: (typeof getPlayerForbiddenCallDiscardCode === "function") ? getPlayerForbiddenCallDiscardCode() : null
        });
        if (info && info.discardTile){
          return {
            action: "discard",
            discardTileId: info.discardTile.id,
            discardIndex: info.discardIndex,
            discardCode: info.discardTile.code
          };
        }
      }
    }catch(e){}
    return null;
  }

  try{
    if (typeof chooseCpuDiscardInfoLegacy === "function"){
      const info = chooseCpuDiscardInfoLegacy(0, hand13, drawn);
      if (info && info.discardTile){
        return {
          action: "discard",
          discardTileId: info.discardTile.id,
          discardIndex: info.discardIndex,
          discardCode: info.discardTile.code
        };
      }
    }
  }catch(e){}

  return null;
}

function executePlayerDiscardAiDecision(decision){
  if (!decision || decision.action !== "discard") return false;

  const tileId = decision.discardTileId;
  if (drawn && drawn.id === tileId){
    discardDrawn();
    return true;
  }

  if (Array.isArray(hand13)){
    const idxById = hand13.findIndex((tile)=> tile && tile.id === tileId);
    if (idxById >= 0){
      discardFromHand13(idxById);
      return true;
    }

    if (typeof decision.discardIndex === "number" && decision.discardIndex >= 0 && decision.discardIndex < hand13.length){
      discardFromHand13(decision.discardIndex);
      return true;
    }
  }

  return false;
}

function buildPlayerRiichiAiSnapshot(){
  if (typeof computeRiichiDiscardCandidates !== "function") return null;

  const allowed = computeRiichiDiscardCandidates();
  if (!(allowed instanceof Set) || allowed.size <= 0) return null;

  const snapshot = buildPlayerDiscardAiSnapshot();
  if (!snapshot || !Array.isArray(snapshot.candidates)) return null;

  snapshot.candidates = snapshot.candidates.filter((candidate)=>{
    if (!candidate || candidate.discardTileId == null) return false;
    const key = candidate.isDrawnDiscard ? `D:${candidate.discardTileId}` : `H:${candidate.discardTileId}`;
    return allowed.has(key);
  });

  return snapshot.candidates.length > 0 ? snapshot : null;
}

function getPlayerRiichiAiDecision(){
  const snapshot = buildPlayerRiichiAiSnapshot();
  if (!snapshot) return null;
  return getPlayerDiscardAiDecision(snapshot);
}

function getPlayerAiSeatWind(){
  const dealer = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  if (dealer === 0) return "東";
  if (dealer === 1) return "西";
  return "南";
}

function getPlayerAiDoraCodeFromIndicator(code){
  try{
    if (typeof getDoraCodeFromIndicatorForYaku === "function"){
      return getDoraCodeFromIndicatorForYaku(code);
    }
  }catch(e){}
  return code;
}

function isPlayerAiYakuhaiLikeCode(code){
  if (!code) return false;
  if (code === "5z" || code === "6z" || code === "7z") return true;

  const seatWind = getPlayerAiSeatWind();
  if (seatWind === "東" && code === "1z") return true;
  if (seatWind === "南" && code === "2z") return true;
  if (seatWind === "西" && code === "3z") return true;

  if (typeof roundWind !== "undefined"){
    if (roundWind === "東" && code === "1z") return true;
    if (roundWind === "南" && code === "2z") return true;
    if (roundWind === "西" && code === "3z") return true;
  }

  return false;
}

function estimatePlayerRiichiAiValueScore(candidate){
  const after13 = (candidate && Array.isArray(candidate.after13)) ? candidate.after13 : [];
  if (after13.length <= 0) return {
    doraCount: 0,
    peiCount: 0,
    yakuhaiPairCount: 0,
    score: 0
  };

  let doraCount = 0;
  const indicators = Array.isArray(doraIndicators) ? doraIndicators : [];
  for (const indicator of indicators){
    const indicatorCode = indicator && indicator.code ? indicator.code : null;
    if (!indicatorCode) continue;
    const doraCode = getPlayerAiDoraCodeFromIndicator(indicatorCode);
    for (const tile of after13){
      if (tile && tile.code === doraCode) doraCount++;
    }
  }

  const peiCount = Array.isArray(peis) ? peis.length : 0;

  const counts = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
  let yakuhaiPairCount = 0;
  if (Array.isArray(counts) && Array.isArray(TILE_TYPES)){
    for (let i = 0; i < TILE_TYPES.length; i++){
      const code = TILE_TYPES[i];
      if (!isPlayerAiYakuhaiLikeCode(code)) continue;
      if ((counts[i] | 0) >= 2) yakuhaiPairCount++;
    }
  }

  return {
    doraCount,
    peiCount,
    yakuhaiPairCount,
    score: doraCount + peiCount + yakuhaiPairCount
  };
}

function getPlayerRiichiAiDecisionDetail(){
  const snapshot = buildPlayerRiichiAiSnapshot();
  if (!snapshot) return null;

  const decision = getPlayerDiscardAiDecision(snapshot);
  if (!decision || decision.action !== "discard") return null;

  const candidate = snapshot.candidates.find((item)=>{
    if (!item) return false;
    if (decision.discardTileId != null && item.discardTileId === decision.discardTileId) return true;
    if (decision.discardIndex != null && item.discardIndex === decision.discardIndex) return true;
    return false;
  }) || null;

  return {
    snapshot,
    decision,
    candidate
  };
}

function shouldPlayerAiRiichiNow(detail){
  const info = detail && detail.candidate ? detail.candidate : null;
  if (!info) return true;

  const fixedMeldCount = Array.isArray(melds) ? melds.length : 0;
  const waitTileCount = Number(info.improveCount) || 0;
  const waitTypeCount = (typeof countTenpaiWaitTypeCount === "function")
    ? countTenpaiWaitTypeCount(info.after13, fixedMeldCount)
    : 0;
  const valueInfo = estimatePlayerRiichiAiValueScore(info);

  const veryBadWait = waitTypeCount <= 1 && waitTileCount <= 3;
  const decentValue = (valueInfo.score >= 2);

  return !(veryBadWait && decentValue);
}

function canPlayerSpecialAiActNow(){
  return (typeof isPlayerSpecialAiEnabled === "function") && isPlayerSpecialAiEnabled();
}

function hasPendingPlayerSpecialAiAction(){
  if (!canPlayerSpecialAiActNow()) return false;
  if (isEnded) return false;
  if (Array.isArray(melds) && melds.length > 0) return false;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) return false;

  try{
    if (typeof canUseTsumoButtonNow === "function" && canUseTsumoButtonNow() && typeof canTsumoAgariNow === "function" && canTsumoAgariNow()){
      return true;
    }
  }catch(e){}

  try{
    if (typeof canUsePeiButtonNow === "function" && canUsePeiButtonNow() && typeof hasNorthInHand === "function" && hasNorthInHand()){
      return true;
    }
  }catch(e){}

  try{
    if (
      !isRiichi &&
      typeof canUseRiichiButtonNow === "function" &&
      canUseRiichiButtonNow() &&
      typeof hasRiichiDiscardCandidateNow === "function" &&
      hasRiichiDiscardCandidateNow()
    ){
      return true;
    }
  }catch(e){}

  return false;
}

function tryExecutePlayerRiichiAiNow(){
  if (!canPlayerSpecialAiActNow()) return false;
  if (isEnded) return false;
  if (isRiichi) return false;
  if (Array.isArray(melds) && melds.length > 0) return false;
  if (typeof canUseRiichiButtonNow !== "function" || !canUseRiichiButtonNow()) return false;
  if (typeof hasRiichiDiscardCandidateNow !== "function" || !hasRiichiDiscardCandidateNow()) return false;

  const detail = getPlayerRiichiAiDecisionDetail();
  if (!detail || !detail.decision){
    return false;
  }

  if (!shouldPlayerAiRiichiNow(detail)){
    return false;
  }

  if (typeof doRiichi === "function"){
    doRiichi();
  }
  if (!(typeof isRiichiSelecting !== "undefined" && isRiichiSelecting)) return false;

  return executePlayerDiscardAiDecision(detail.decision);
}

function tryExecutePlayerSpecialAiNow(){
  if (!canPlayerSpecialAiActNow()) return false;
  if (isEnded) return false;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) return false;

  try{
    if (typeof canUseTsumoButtonNow === "function" && canUseTsumoButtonNow() && typeof canTsumoAgariNow === "function" && canTsumoAgariNow()){
      if (typeof setPostAgariStageToOverlay === "function"){
        setPostAgariStageToOverlay();
      }
      if (typeof openTsumo === "function"){
        openTsumo();
        return true;
      }
    }
  }catch(e){}

  try{
    if (typeof canUsePeiButtonNow === "function" && canUsePeiButtonNow() && typeof hasNorthInHand === "function" && hasNorthInHand()){
      if (typeof doPei === "function"){
        doPei();
      }else if (typeof peiBtn !== "undefined" && peiBtn && typeof peiBtn.click === "function"){
        peiBtn.click();
      }else{
        return false;
      }

      if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
      if (typeof schedulePlayerAutoDiscardIfNeeded === "function") schedulePlayerAutoDiscardIfNeeded(true);
      return true;
    }
  }catch(e){}

  const riichiActed = tryExecutePlayerRiichiAiNow();
  if (riichiActed) return true;

  return tryExecutePlayerDiscardAiNow();
}

function maybeSchedulePlayerSpecialAiAction(forceReschedule = false){
  if (forceReschedule) clearPlayerSpecialAiTimer();
  if (playerSpecialActionTimer) return;
  if (!hasPendingPlayerSpecialAiAction()) return;

  const loopEpoch = (typeof getCpuTurnLoopEpoch === "function") ? getCpuTurnLoopEpoch() : null;
  playerSpecialActionTimer = setTimeout(()=>{
    playerSpecialActionTimer = null;
    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;

    const acted = tryExecutePlayerSpecialAiNow();
    if (acted) return;

    if (typeof schedulePlayerAutoDiscardIfNeeded === "function"){
      schedulePlayerAutoDiscardIfNeeded(true);
    }
  }, getPlayerSpecialActionDelayMs());
}

function tryExecutePlayerDiscardAiNow(){
  if (isEnded) return false;
  if (typeof isPlayerDiscardAiEnabled === "function" && !isPlayerDiscardAiEnabled()) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) return false;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return false;
  if (typeof turnPhase !== "undefined" && turnPhase === "DISCARD" && !drawn) return false;

  const snapshot = buildPlayerDiscardAiSnapshot();
  const decision = getPlayerDiscardAiDecision(snapshot);
  return executePlayerDiscardAiDecision(decision);
}

function schedulePlayerAutoDiscardIfNeeded(forceReschedule = false){
  if (forceReschedule) clearPlayerAutoDiscardTimer();
  if (playerAutoDiscardTimer) return;
  if (isEnded) return;
  if (typeof pendingCall !== "undefined" && pendingCall) return;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return;
  if (typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) return;
  if (typeof turnPhase !== "undefined" && turnPhase === "DISCARD" && !drawn) return;

  if (typeof hasPendingPlayerSpecialAiAction === "function" && hasPendingPlayerSpecialAiAction()){
    if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(forceReschedule);
    return;
  }

  if (typeof isPlayerDiscardAiEnabled === "function" && !isPlayerDiscardAiEnabled()) return;

  const loopEpoch = (typeof getCpuTurnLoopEpoch === "function") ? getCpuTurnLoopEpoch() : null;
  playerAutoDiscardTimer = setTimeout(()=>{
    playerAutoDiscardTimer = null;
    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
    tryExecutePlayerDiscardAiNow();
  }, getPlayerAutoDiscardDelayMs());
}

function isPlayerSeat(seatIndex){
  return seatIndex === 0;
}
function isCpuRightSeat(seatIndex){
  return seatIndex === 1;
}
function isCpuLeftSeat(seatIndex){
  return seatIndex === 2;
}

function nextSeatIndexOf(seatIndex){
  return (seatIndex + 1) % 3;
}

function sleep(ms){
  return new Promise((resolve)=>setTimeout(resolve, ms));
}

function endRyukyokuFromTurnIfPossible(){
  if (typeof endByExhaustionRyukyoku === "function"){
    endByExhaustionRyukyoku();
    return;
  }
  if (!isEnded){
    isEnded = true;
    hoveredTileId = null;
    render();
    if (typeof openRyukyoku === "function") openRyukyoku();
  }
}

function clearPlayerDrawTimer(){
  if (playerDrawTimer){
    clearTimeout(playerDrawTimer);
    playerDrawTimer = null;
  }
  clearPlayerAutoDiscardTimer();
  clearPlayerSpecialAiTimer();
}

// ★ call.js から呼ぶ：鳴き後の「ツモ無し打牌」へ強制切替
function forceEnterPlayerCallDiscardTurn(){
  clearPlayerDrawTimer();
  currentTurnSeatIndex = 0;
  turnPhase = "CALL_DISCARD";
  drawn = null; // 鳴き直後はツモ無し
  schedulePlayerAutoDiscardIfNeeded(true);
}

function initTurnForKyokuStart(){
  clearPlayerDrawTimer();

  if (typeof resetCpuExtraState === "function"){
    resetCpuExtraState();
  }

  currentTurnSeatIndex = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  turnPhase = "DISCARD";

  // CPU親開始のときはプレイヤーの drawn は必ず空に
  if (currentTurnSeatIndex !== 0){
    drawn = null;
  }

  hoveredTileId = null;
  render();

  if (currentTurnSeatIndex === 0){
    schedulePlayerAutoDiscardIfNeeded(true);
  }

  // ★ 局開始直後にCPU親なら、確実にCPUが捨てて始まるように回す（初手だけ即時）
  if (!(typeof __suspendCpuAutoKick !== "undefined" && __suspendCpuAutoKick)){
    kickCpuTurnsIfNeeded(true);
  }
}

function isPlayerTurn(){
  if (isEnded) return false;
  return currentTurnSeatIndex === 0 && (turnPhase === "DISCARD" || turnPhase === "CALL_DISCARD");
}

// ★ ポン後の「ツモ無し打牌」か？
function isPlayerCallDiscardTurn(){
  if (isEnded) return false;
  return currentTurnSeatIndex === 0 && turnPhase === "CALL_DISCARD";
}

function ensurePlayerHasDrawnOnTurnStart(){
  // ★ 鳴き直後（ツモ無し打牌）はツモらない
  if (!isPlayerTurn()) return;
  if (isPlayerCallDiscardTurn()) return;

  const wallCount = Array.isArray(wall) ? wall.length : 0;
  if (wallCount === 0){
    endRyukyokuFromTurnIfPossible();
    return;
  }

  if (!drawn){
    drawn = drawOne();
    try{
      if (drawn && typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("draw", {
          seatIndex: 0,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawn) : { code: drawn.code, imgCode: drawn.imgCode || drawn.code },
          source: "wall"
        });
      }
    }catch(e){}
    hoveredTileId = null;
    render();
  }

  if (!isEnded && isRiichi && typeof scheduleRiichiAuto === "function"){
    scheduleRiichiAuto();
  }

  schedulePlayerAutoDiscardIfNeeded(true);
}

function schedulePlayerDrawOnTurnStart(){
  clearPlayerDrawTimer();

  // ★ 鳴き直後（ツモ無し打牌）はツモタイマー不要
  if (isPlayerCallDiscardTurn()){
    schedulePlayerAutoDiscardIfNeeded(true);
    return;
  }

  if (drawn) return;

  playerDrawTimer = setTimeout(()=>{
    playerDrawTimer = null;

    if (isEnded) return;
    if (!isPlayerTurn()) return;

    ensurePlayerHasDrawnOnTurnStart();
  }, getPlayerTurnDrawDelayMs());
}

function cpuDoOneDiscard(seatIndex){
  if (isEnded) return null;
  if (typeof isCpuSeat === "function" && !isCpuSeat(seatIndex)) return null;

  const hand13 = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
  const riverRef = (typeof getCpuRiverRefBySeat === "function") ? getCpuRiverRefBySeat(seatIndex) : null;

  if (!Array.isArray(hand13) || !Array.isArray(riverRef)) return null;

  let drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;

  if (!drawnTile){
    drawnTile = drawOne();
    if (!drawnTile) return null;

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("draw", {
          seatIndex,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawnTile) : { code: drawnTile.code, imgCode: drawnTile.imgCode || drawnTile.code },
          source: "wall"
        });
      }
    }catch(e){}

    if (typeof setCpuDrawnTileBySeat === "function"){
      setCpuDrawnTileBySeat(seatIndex, drawnTile);
    }
  }

  if (typeof tryCpuPeiSequence === "function"){
    tryCpuPeiSequence(seatIndex);
  }

  if (typeof tryCpuAnkanSequence === "function"){
    tryCpuAnkanSequence(seatIndex);
    if (isEnded) return null;
  }

  drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : drawnTile;
  if (!drawnTile) return null;

  const tiles14 = hand13.slice();
  tiles14.push(drawnTile);
  const cpuRiichiOnlyMode = (typeof isDebugCpuRiichiOnlyMode === "function") ? isDebugCpuRiichiOnlyMode() : false;

  // ★ CPUはリーチ中かどうかに関係なく、ツモ牌を持った時点で先にツモ和了判定する
  // - これで副露後ダマツモ / 明槓後の嶺上ツモ も拾える
  // - seatIndex を渡して役判定まで行う
  if (!cpuRiichiOnlyMode && typeof canCpuTsumoWithTiles === "function" && canCpuTsumoWithTiles(seatIndex, tiles14)){
    if (typeof finishCpuTsumo === "function"){
      finishCpuTsumo(seatIndex);
    }
    return null;
  }

  if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)){
    drawnTile.isNew = false;
    if (typeof maybeAdoptCpuRiichiDisplayTileBySeat === "function"){
      maybeAdoptCpuRiichiDisplayTileBySeat(seatIndex, drawnTile);
    }
    riverRef.push(drawnTile);

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("discard", {
          seatIndex,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawnTile) : { code: drawnTile.code, imgCode: drawnTile.imgCode || drawnTile.code },
          source: "drawn",
          isTsumogiri: true,
          isRiichiDeclare: false,
          turnPhase: "DISCARD"
        });
      }
    }catch(e){}

    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(seatIndex, false); }catch(e){}

    if (typeof clearCpuDrawnTileBySeat === "function"){
      clearCpuDrawnTileBySeat(seatIndex);
    }

    return drawnTile;
  }

  const best = (typeof chooseCpuDiscardInfo === "function")
    ? chooseCpuDiscardInfo(seatIndex, hand13, drawnTile)
    : null;

  if (!best || !best.discardTile){
    drawnTile.isNew = false;
    riverRef.push(drawnTile);

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("discard", {
          seatIndex,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawnTile) : { code: drawnTile.code, imgCode: drawnTile.imgCode || drawnTile.code },
          source: "drawn",
          isTsumogiri: true,
          isRiichiDeclare: false,
          turnPhase: "DISCARD"
        });
      }
    }catch(e){}

    if (typeof clearCpuDrawnTileBySeat === "function"){
      clearCpuDrawnTileBySeat(seatIndex);
    }

    return drawnTile;
  }

  const discardedTile = best.discardTile;
  discardedTile.isNew = false;

  const nextHand13 = sortHand(best.after13.slice());
  for (const t of nextHand13){
    if (t) t.isNew = false;
  }

  if (typeof setCpuHand13BySeat === "function"){
    setCpuHand13BySeat(seatIndex, nextHand13);
  }

  if (best.willRiichi && typeof setCpuRiichiBySeat === "function"){
    setCpuRiichiBySeat(seatIndex, true);
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(seatIndex, true); }catch(e){}
    try{ if (typeof setDoubleRiichiForSeat === "function" && typeof canDeclareDoubleRiichiNow === "function") setDoubleRiichiForSeat(seatIndex, canDeclareDoubleRiichiNow(seatIndex)); }catch(e){}

    if (typeof setCpuRiichiDeclareTileIdBySeat === "function"){
      setCpuRiichiDeclareTileIdBySeat(seatIndex, discardedTile.id);
    }

    if (typeof openRiichiEffect === "function"){
      try{ openRiichiEffect(seatIndex); }catch(e){}
    }
  }

  if (typeof clearCpuDrawnTileBySeat === "function"){
    clearCpuDrawnTileBySeat(seatIndex);
  }

  if (!best.willRiichi && typeof maybeAdoptCpuRiichiDisplayTileBySeat === "function"){
    maybeAdoptCpuRiichiDisplayTileBySeat(seatIndex, discardedTile);
  }

  riverRef.push(discardedTile);

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("discard", {
        seatIndex,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(discardedTile) : { code: discardedTile.code, imgCode: discardedTile.imgCode || discardedTile.code },
        source: (drawnTile && discardedTile && drawnTile.id === discardedTile.id) ? "drawn" : "hand",
        isTsumogiri: !!(drawnTile && discardedTile && drawnTile.id === discardedTile.id),
        isRiichiDeclare: !!best.willRiichi,
        turnPhase: "DISCARD"
      });
    }
  }catch(e){}


  if (best.willRiichi){
    pushCpuRiichiEventForLog(seatIndex, discardedTile, nextHand13, (typeof getCpuFixedMeldCountBySeat === "function") ? getCpuFixedMeldCountBySeat(seatIndex) : 0, riverRef);
  }

  try{
    if (best && best.snapshotId != null && typeof updateCpuDiscardDecisionForSnapshot === "function"){
      updateCpuDiscardDecisionForSnapshot(best.snapshotId, {
        status: "executed",
        finalAction: "discard",
        finalDiscardTileId: discardedTile.id,
        finalDiscardCode: discardedTile.code,
        executionSource: best.decisionSource || "unknown",
        willRiichi: !!best.willRiichi
      });
    }
  }catch(e){}

  if (!best.willRiichi && typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)){
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(seatIndex, false); }catch(e){}
  }

  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  return discardedTile;
}

function advanceTurnAfterDiscard(discardSeatIndex){
  if (isEnded) return;

  clearPlayerDrawTimer();

  currentTurnSeatIndex = nextSeatIndexOf(discardSeatIndex);
  turnPhase = "DISCARD";

  if (currentTurnSeatIndex === 0){
    schedulePlayerDrawOnTurnStart();
  }
}

// ★ 引数 immediateFirst = true のとき「最初のCPU捨て」だけ即時にする
async function kickCpuTurnsIfNeeded(immediateFirst = false){
  if (isEnded) return;

  const loopEpoch = (typeof getCpuTurnLoopEpoch === "function") ? getCpuTurnLoopEpoch() : null;
  let firstStep = true;

  while (!isEnded && currentTurnSeatIndex !== 0 && turnPhase === "DISCARD"){
    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;

    const seat = currentTurnSeatIndex;

    // ★ 局開始の最初の1手目だけ待たない
    if (!(immediateFirst && firstStep)){
      await sleep(getCpuTurnDelayMs());
    }
    firstStep = false;

    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
    if (isEnded) return;

    const wallCount = Array.isArray(wall) ? wall.length : 0;
    if (wallCount === 0){
      endRyukyokuFromTurnIfPossible();
      return;
    }

    // ===== CPUのツモ牌を一度表示してから捨てる =====
    let cpuDrawnTile =
      (typeof getCpuDrawnTileBySeat === "function")
        ? getCpuDrawnTileBySeat(seat)
        : null;

    if (!cpuDrawnTile){
      cpuDrawnTile = drawOne();
      if (!cpuDrawnTile){
        endRyukyokuFromTurnIfPossible();
        return;
      }

      try{
        if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
          window.MBSanmaMatchLog.pushEvent("draw", {
            seatIndex: seat,
            tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(cpuDrawnTile) : { code: cpuDrawnTile.code, imgCode: cpuDrawnTile.imgCode || cpuDrawnTile.code },
            source: "wall"
          });
        }
      }catch(e){}

      if (typeof setCpuDrawnTileBySeat === "function"){
        setCpuDrawnTileBySeat(seat, cpuDrawnTile);
      }

      hoveredTileId = null;
      render();

      await sleep(getCpuTurnDelayMs());

      if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
      if (isEnded) return;
    }

    // ===== CPUが1枚捨てる =====
    const discardedTile = cpuDoOneDiscard(seat);

    hoveredTileId = null;
    render();

    if (!discardedTile) return;

    // ===== CPU捨て直後に「ロン/ポン」判定 =====
    if (typeof maybePromptCallOnDiscard === "function"){
      const from = isCpuRightSeat(seat) ? "R" : "L";
      const action = await maybePromptCallOnDiscard(from, discardedTile);

      if (action === "ron"){
        // ★ ロンで局終了
        return;
      }

      if (action === "pon"){
        // ★ ここでは「call.js 側で強制切替」される想定だが、
        //    念のため保険でも自分番へ寄せる
        forceEnterPlayerCallDiscardTurn();
        render();
        return;
      }
    }

    const wallCountAfter = Array.isArray(wall) ? wall.length : 0;
    if (wallCountAfter === 0){
      endRyukyokuFromTurnIfPossible();
      return;
    }

    advanceTurnAfterDiscard(seat);

    if (currentTurnSeatIndex === 0) return;
  }
}
