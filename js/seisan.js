// MBsanma/js/seisan.js
// ========= seisan.js（点数移動・供託・終局判定） =========
// 役割：
// - 和了 / 流局時の点数移動内容を作る
// - result閉じ時に1回だけ scores へ反映する
// - 供託 / 聴牌料 / 本場 / 飛び / オーラス終了を扱う
//
// 注意：
// - render系では状態変更しない
// - 実際の score 変更は applyPendingRoundSettlement() だけで行う

function normalizeScoreState(){
  if (!Array.isArray(scores) || scores.length !== 3){
    scores = [35000, 35000, 35000];
  }

  for (let i = 0; i < 3; i++){
    if (!Number.isFinite(scores[i])) scores[i] = 35000;
    scores[i] = scores[i] | 0;
  }

  if (!Number.isFinite(kyotakuCount)) kyotakuCount = 0;
  kyotakuCount = Math.max(0, kyotakuCount | 0);

  if (typeof pendingRoundSettlement === "undefined"){
    pendingRoundSettlement = null;
  }
}

function resetScoreStateForNewHanchan(){
  scores = [35000, 35000, 35000];
  kyotakuCount = 0;
  pendingRoundSettlement = null;

  try{
    if (typeof resetHanchanSeatStats === "function"){
      resetHanchanSeatStats();
    }
  }catch(e){}
}

function cloneScoreArray(src){
  if (!Array.isArray(src)) return [0, 0, 0];
  return [
    Number.isFinite(src[0]) ? (src[0] | 0) : 0,
    Number.isFinite(src[1]) ? (src[1] | 0) : 0,
    Number.isFinite(src[2]) ? (src[2] | 0) : 0
  ];
}

function getCurrentRiichiDepositorSeats(){
  try{
    if (typeof window !== "undefined" && typeof window.getCommittedRiichiStickSeats === "function"){
      const seats = window.getCommittedRiichiStickSeats();
      if (Array.isArray(seats)){
        return seats.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
      }
    }
  }catch(e){}

  const seats = [];
  for (let seat = 0; seat < 3; seat++){
    try{
      if (typeof window !== "undefined" && typeof window.hasCommittedRiichiStickForSeat === "function"){
        if (window.hasCommittedRiichiStickForSeat(seat)) seats.push(seat);
      }
    }catch(e){}
  }
  return seats;
}

function getTilesForSettlementSeat(seat){
  if (seat === 0){
    const arr = [];
    if (Array.isArray(hand13)) arr.push(...hand13);
    if (drawn) arr.push(drawn);
    return arr;
  }

  if (seat === 1){
    return Array.isArray(cpuRightHand13) ? cpuRightHand13.slice() : [];
  }

  if (seat === 2){
    return Array.isArray(cpuLeftHand13) ? cpuLeftHand13.slice() : [];
  }

  return [];
}

function getFixedMForSettlementSeat(seat){
  if (seat === 0){
    return Array.isArray(melds) ? melds.length : 0;
  }
  if (typeof getCpuFixedMeldCountBySeat === "function"){
    return getCpuFixedMeldCountBySeat(seat);
  }
  return 0;
}

function isTenpaiWithSettlementTiles(tiles, fixedM){
  try{
    const counts = countsFromTiles(tiles);
    const sh = (typeof calcShanten === "function") ? calcShanten(counts, fixedM) : 99;
    return sh === 0;
  }catch(e){
    return false;
  }
}

function isSeatTenpaiAtRyukyoku(seat){
  const tiles = getTilesForSettlementSeat(seat);
  const fixedM = getFixedMForSettlementSeat(seat);

  if (tiles.length === 13){
    return isTenpaiWithSettlementTiles(tiles, fixedM);
  }

  if (tiles.length === 14){
    for (let i = 0; i < tiles.length; i++){
      const cand = tiles.slice();
      cand.splice(i, 1);
      if (isTenpaiWithSettlementTiles(cand, fixedM)) return true;
    }
    return false;
  }

  return false;
}

function getRyukyokuTenpaiSeats(){
  const seats = [];
  for (let seat = 0; seat < 3; seat++){
    if (isSeatTenpaiAtRyukyoku(seat)) seats.push(seat);
  }
  return seats;
}

function getOtherSeatIndexes(baseSeat){
  const list = [];
  for (let seat = 0; seat < 3; seat++){
    if (seat !== baseSeat) list.push(seat);
  }
  return list;
}

function addDelta(delta, seatIndex, amount){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
  if (!Number.isFinite(amount) || amount === 0) return;
  delta[seatIndex] = (delta[seatIndex] | 0) + (amount | 0);
}

function buildAgariSettlement(){
  const winner = (typeof lastAgariWinnerSeatIndex === "number") ? lastAgariWinnerSeatIndex : null;
  const winType = lastAgariType;
  if (winner == null) return null;
  if (winType !== "tsumo" && winType !== "ron") return null;

  const info = (typeof getResultYakuInfo === "function") ? getResultYakuInfo() : null;
  const scoreInfo = (typeof calcSanmaScoreFromInfo === "function")
    ? calcSanmaScoreFromInfo(info, winner, winType)
    : null;

  if (!scoreInfo) return null;

  normalizeScoreState();

  const beforeScores = cloneScoreArray(scores);
  const delta = [0, 0, 0];
  const riichiSeats = getCurrentRiichiDepositorSeats();
  const previousKyotakuCount = kyotakuCount | 0;
  const currentHandKyotakuCount = riichiSeats.length | 0;
  const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const honbaBonusPerPayer = Number.isFinite(scoreInfo.honbaBonusPerPayer) ? (scoreInfo.honbaBonusPerPayer | 0) : 0;

  if (winType === "tsumo"){
    const payAll = Number.isFinite(scoreInfo.payAll) ? (scoreInfo.payAll | 0) : 0;
    const payChild = Number.isFinite(scoreInfo.payChild) ? (scoreInfo.payChild | 0) : 0;
    const payDealer = Number.isFinite(scoreInfo.payDealer) ? (scoreInfo.payDealer | 0) : 0;
    const loserSeats = getOtherSeatIndexes(winner);

    for (const seat of loserSeats){
      let total = 0;
      if (scoreInfo.isDealer){
        total = payAll + honbaBonusPerPayer;
      } else {
        total = ((seat === dealerSeat) ? payDealer : payChild) + honbaBonusPerPayer;
      }

      addDelta(delta, seat, -total);
      addDelta(delta, winner, total);
    }
  } else {
    const discarder = (typeof lastAgariDiscarderSeatIndex === "number") ? lastAgariDiscarderSeatIndex : null;
    if (discarder == null) return null;

    const total = (Number.isFinite(scoreInfo.ronPoint) ? (scoreInfo.ronPoint | 0) : 0) + honbaBonusPerPayer;
    addDelta(delta, discarder, -total);
    addDelta(delta, winner, total);
  }


  const kyotakuPoint = (previousKyotakuCount + currentHandKyotakuCount) * 1000;
  if (kyotakuPoint > 0){
    addDelta(delta, winner, kyotakuPoint);
  }

  const afterScores = [
    beforeScores[0] + delta[0],
    beforeScores[1] + delta[1],
    beforeScores[2] + delta[2]
  ];

  return {
    type: "agari",
    winType,
    winnerSeatIndex: winner,
    discarderSeatIndex: (typeof lastAgariDiscarderSeatIndex === "number") ? lastAgariDiscarderSeatIndex : null,
    scoreInfo,
    beforeScores,
    delta,
    afterScores,
    riichiSeats: riichiSeats.slice(),
    previousKyotakuCount,
    currentHandKyotakuCount,
    nextKyotakuCount: 0
  };
}

function getAgariQueueForSettlement(){
  try{
    if (typeof window !== "undefined" && typeof window.getAgariResultQueue === "function"){
      const queue = window.getAgariResultQueue();
      return Array.isArray(queue) ? queue.slice() : [];
    }
  }catch(e){}
  return [];
}

function hasAgariResultQueueForSettlement(){
  return getAgariQueueForSettlement().length > 0;
}

function getHeadAgariQueueEntryForSettlement(queue){
  const list = Array.isArray(queue) ? queue : [];
  return list.find((entry)=> entry && entry.headWinner) || list[0] || null;
}

function getResultYakuInfoFromEntryForSettlement(entry){
  try{
    if (!entry) return null;
    if (typeof getResultYakuInfoByEntry === "function"){
      return getResultYakuInfoByEntry(entry);
    }
  }catch(e){}
  return null;
}

function buildCombinedSettlementFromAgariQueue(){
  const queue = getAgariQueueForSettlement();
  if (queue.length <= 0) return null;

  normalizeScoreState();

  const beforeScores = cloneScoreArray(scores);
  const delta = [0, 0, 0];
  const riichiSeats = getCurrentRiichiDepositorSeats();
  const previousKyotakuCount = kyotakuCount | 0;
  const currentHandKyotakuCount = riichiSeats.length | 0;
  const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const headEntry = getHeadAgariQueueEntryForSettlement(queue);

  for (const entry of queue){
    if (!entry || entry.winType !== "ron") continue;
    const winner = entry.winnerSeatIndex;
    const discarder = entry.discarderSeatIndex;
    if (winner == null || discarder == null) continue;

    const info = getResultYakuInfoFromEntryForSettlement(entry);
    const scoreInfo = (typeof calcSanmaScoreFromInfo === "function")
      ? calcSanmaScoreFromInfo(info, winner, "ron")
      : null;
    if (!scoreInfo) continue;

    entry.scoreInfo = scoreInfo;

    const honbaBonusPerPayer = Number.isFinite(scoreInfo.honbaBonusPerPayer) ? (scoreInfo.honbaBonusPerPayer | 0) : 0;
    const total = (Number.isFinite(scoreInfo.ronPoint) ? (scoreInfo.ronPoint | 0) : 0) + honbaBonusPerPayer;
    addDelta(delta, discarder, -total);
    addDelta(delta, winner, total);
  }


  const kyotakuWinner = headEntry ? headEntry.winnerSeatIndex : null;
  const kyotakuPoint = (previousKyotakuCount + currentHandKyotakuCount) * 1000;
  if (kyotakuWinner != null && kyotakuPoint > 0){
    addDelta(delta, kyotakuWinner, kyotakuPoint);
  }

  const afterScores = [
    beforeScores[0] + delta[0],
    beforeScores[1] + delta[1],
    beforeScores[2] + delta[2]
  ];

  return {
    type: "agari",
    winType: "ron",
    winnerSeatIndex: headEntry ? headEntry.winnerSeatIndex : null,
    discarderSeatIndex: headEntry ? headEntry.discarderSeatIndex : null,
    beforeScores,
    delta,
    afterScores,
    riichiSeats: riichiSeats.slice(),
    previousKyotakuCount,
    currentHandKyotakuCount,
    nextKyotakuCount: 0,
    agariEntries: queue.slice(),
    headEntry
  };
}

function buildRyukyokuSettlement(){
  normalizeScoreState();

  const beforeScores = cloneScoreArray(scores);
  const delta = [0, 0, 0];
  const tenpaiSeats = getRyukyokuTenpaiSeats();
  const riichiSeats = getCurrentRiichiDepositorSeats();
  const previousKyotakuCount = kyotakuCount | 0;
  const currentHandKyotakuCount = riichiSeats.length | 0;

  if (tenpaiSeats.length === 1){
    const winner = tenpaiSeats[0];
    const losers = getOtherSeatIndexes(winner);
    for (const seat of losers){
      addDelta(delta, seat, -1000);
      addDelta(delta, winner, 1000);
    }
  } else if (tenpaiSeats.length === 2){
    const loser = [0, 1, 2].find((seat)=> !tenpaiSeats.includes(seat));
    if (typeof loser === "number"){
      addDelta(delta, loser, -2000);
      for (const seat of tenpaiSeats){
        addDelta(delta, seat, 1000);
      }
    }
  }


  const afterScores = [
    beforeScores[0] + delta[0],
    beforeScores[1] + delta[1],
    beforeScores[2] + delta[2]
  ];

  return {
    type: "ryukyoku",
    winType: "ryukyoku",
    winnerSeatIndex: null,
    discarderSeatIndex: null,
    beforeScores,
    delta,
    afterScores,
    tenpaiSeats: tenpaiSeats.slice(),
    riichiSeats: riichiSeats.slice(),
    previousKyotakuCount,
    currentHandKyotakuCount,
    nextKyotakuCount: previousKyotakuCount + currentHandKyotakuCount
  };
}

function buildCurrentRoundSettlement(){
  let settlement = null;

  // ここではキャッシュしない。
  // result描画中に先に精算を確定してしまうと、
  // その後に参照したい最新の供託本数や状態が反映されず、
  // 「流局表示では4本なのに次局で2本へ戻る」ようなズレが起きる。
  // 実際の確定は applyPendingRoundSettlement() 側で行う。
  if (hasAgariResultQueueForSettlement()){
    settlement = buildCombinedSettlementFromAgariQueue();
  } else if (lastAgariType === "tsumo" || lastAgariType === "ron"){
    settlement = buildAgariSettlement();
  } else if (lastAgariType === "ryukyoku"){
    settlement = buildRyukyokuSettlement();
  }

  return settlement;
}

function clearPendingRoundSettlement(){
  pendingRoundSettlement = null;
}

function addHanchanEndSeatStatSafe(seatIndex, key, amount = 1){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
  if (!Number.isFinite(amount) || amount === 0) return;

  try{
    if (typeof incrementHanchanSeatStat === "function"){
      incrementHanchanSeatStat(seatIndex, key, amount);
      return;
    }
  }catch(e){}

  try{
    if (key === "riichi" && Array.isArray(hanchanRiichiCounts)){
      hanchanRiichiCounts[seatIndex] = (Number(hanchanRiichiCounts[seatIndex]) || 0) + (amount | 0);
    }
    if (key === "agari" && Array.isArray(hanchanAgariCounts)){
      hanchanAgariCounts[seatIndex] = (Number(hanchanAgariCounts[seatIndex]) || 0) + (amount | 0);
    }
    if ((key === "hoju" || key === "houju") && Array.isArray(hanchanHojuCounts)){
      hanchanHojuCounts[seatIndex] = (Number(hanchanHojuCounts[seatIndex]) || 0) + (amount | 0);
    }
    if ((key === "chip" || key === "chips") && Array.isArray(hanchanChipCounts)){
      hanchanChipCounts[seatIndex] = (Number(hanchanChipCounts[seatIndex]) || 0) + (amount | 0);
    }
  }catch(e){}
}

function applyHanchanChipStatsFromEntry(entry){
  if (!entry) return;
  if (typeof buildResultChipInfoByEntry !== "function") return;

  let chipInfo = null;
  try{
    chipInfo = buildResultChipInfoByEntry(entry);
  }catch(e){
    chipInfo = null;
  }

  if (!chipInfo || !Array.isArray(chipInfo.delta)) return;

  for (let seat = 0; seat < 3; seat++){
    const amount = Number.isFinite(chipInfo.delta[seat]) ? (chipInfo.delta[seat] | 0) : 0;
    if (amount !== 0){
      addHanchanEndSeatStatSafe(seat, "chip", amount);
    }
  }
}

function applyHanchanSeatStatsFromSettlement(settlement){
  if (!settlement) return;

  const riichiSeatSet = new Set();
  if (Array.isArray(settlement.riichiSeats)){
    for (const seat of settlement.riichiSeats){
      if (seat === 0 || seat === 1 || seat === 2){
        riichiSeatSet.add(seat);
      }
    }
  }

  for (const seat of riichiSeatSet){
    addHanchanEndSeatStatSafe(seat, "riichi", 1);
  }

  if (settlement.type !== "agari") return;

  const agariSeatSet = new Set();

  if (Array.isArray(settlement.agariEntries) && settlement.agariEntries.length > 0){
    for (const entry of settlement.agariEntries){
      if (!entry) continue;
      const seat = entry.winnerSeatIndex;
      if (seat === 0 || seat === 1 || seat === 2){
        agariSeatSet.add(seat);
      }
    }
  } else if (settlement.winnerSeatIndex === 0 || settlement.winnerSeatIndex === 1 || settlement.winnerSeatIndex === 2){
    agariSeatSet.add(settlement.winnerSeatIndex);
  }

  for (const seat of agariSeatSet){
    addHanchanEndSeatStatSafe(seat, "agari", 1);
  }

  if (settlement.winType === "ron"){
    const discarderSeat = (settlement.headEntry && (settlement.headEntry.discarderSeatIndex === 0 || settlement.headEntry.discarderSeatIndex === 1 || settlement.headEntry.discarderSeatIndex === 2))
      ? settlement.headEntry.discarderSeatIndex
      : settlement.discarderSeatIndex;

    if (discarderSeat === 0 || discarderSeat === 1 || discarderSeat === 2){
      addHanchanEndSeatStatSafe(discarderSeat, "hoju", 1);
    }
  }

  if (Array.isArray(settlement.agariEntries) && settlement.agariEntries.length > 0){
    for (const entry of settlement.agariEntries){
      applyHanchanChipStatsFromEntry(entry);
    }
    return;
  }

  if (settlement.type === "agari" && (settlement.winType === "tsumo" || settlement.winType === "ron")){
    applyHanchanChipStatsFromEntry({
      winType: settlement.winType,
      winnerSeatIndex: settlement.winnerSeatIndex,
      discarderSeatIndex: settlement.discarderSeatIndex,
      ronTile: (settlement.headEntry && settlement.headEntry.ronTile) ? settlement.headEntry.ronTile : null
    });
  }
}

function applyPendingRoundSettlement(){
  const settlement = pendingRoundSettlement || buildCurrentRoundSettlement();
  if (!settlement) return null;

  normalizeScoreState();

  try{
    applyHanchanSeatStatsFromSettlement(settlement);
  }catch(e){}

  scores = settlement.afterScores.slice();
  kyotakuCount = Math.max(0, settlement.nextKyotakuCount | 0);
  pendingRoundSettlement = null;

  try{
    if (typeof window !== "undefined" && typeof window.resetCommittedRiichiStickState === "function"){
      window.resetCommittedRiichiStickState();
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.clearAgariResultQueue === "function"){
      window.clearAgariResultQueue();
    }
  }catch(e){}

  return settlement;
}

function isSeatTopOrTiedForTop(scoreList, seatIndex){
  if (!Array.isArray(scoreList)) return false;
  const me = Number(scoreList[seatIndex]) || 0;
  for (let i = 0; i < scoreList.length; i++){
    if (i === seatIndex) continue;
    const other = Number(scoreList[i]) || 0;
    if (other > me) return false;
  }
  return true;
}

function getHanchanEndReasonAfterSettlement(settlement){
  if (!settlement || !Array.isArray(settlement.afterScores)) return null;

  const afterScores = settlement.afterScores.slice();

  for (let seat = 0; seat < afterScores.length; seat++){
    if ((afterScores[seat] | 0) <= 0){
      return {
        end: true,
        reason: `${typeof resultSeatName === "function" ? resultSeatName(seat) : ("席" + seat)}がトビ`
      };
    }
  }

  if (roundWind === "南" && (roundNumber | 0) === 3){
    const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
    let dealerKeeps = false;

    const headEntry = getHeadAgariQueueEntryForSettlement(getAgariQueueForSettlement());
    if (headEntry && (headEntry.winType === "tsumo" || headEntry.winType === "ron")){
      dealerKeeps = (headEntry.winnerSeatIndex === dealerSeat);
    } else if (lastAgariType === "tsumo" || lastAgariType === "ron"){
      dealerKeeps = (lastAgariWinnerSeatIndex === dealerSeat);
    } else if (lastAgariType === "ryukyoku"){
      dealerKeeps = (lastRyukyokuDealerTenpai === true);
    }

    if (!dealerKeeps){
      return {
        end: true,
        reason: "南3 親流れ終了"
      };
    }

    if (isSeatTopOrTiedForTop(afterScores, dealerSeat)){
      return {
        end: true,
        reason: "南3 親トップ終了"
      };
    }
  }

  return null;
}

function getHanchanEndSeatStatNumber(seatIndex, key){
  try{
    if (typeof window !== "undefined"){
      if (window.hanchanSeatStats && window.hanchanSeatStats[seatIndex] && Number.isFinite(window.hanchanSeatStats[seatIndex][key])){
        return window.hanchanSeatStats[seatIndex][key] | 0;
      }
      if (window.hanchanStats && window.hanchanStats[seatIndex] && Number.isFinite(window.hanchanStats[seatIndex][key])){
        return window.hanchanStats[seatIndex][key] | 0;
      }
      if (window.hanchanStatsBySeat && window.hanchanStatsBySeat[seatIndex] && Number.isFinite(window.hanchanStatsBySeat[seatIndex][key])){
        return window.hanchanStatsBySeat[seatIndex][key] | 0;
      }
    }
  }catch(e){}

  try{
    if (key === "riichi" && Array.isArray(hanchanRiichiCounts) && Number.isFinite(hanchanRiichiCounts[seatIndex])){
      return hanchanRiichiCounts[seatIndex] | 0;
    }
  }catch(e){}

  try{
    if (key === "agari" && Array.isArray(hanchanAgariCounts) && Number.isFinite(hanchanAgariCounts[seatIndex])){
      return hanchanAgariCounts[seatIndex] | 0;
    }
  }catch(e){}

  try{
    if ((key === "hoju" || key === "houju") && Array.isArray(hanchanHojuCounts) && Number.isFinite(hanchanHojuCounts[seatIndex])){
      return hanchanHojuCounts[seatIndex] | 0;
    }
  }catch(e){}

  try{
    if ((key === "chip" || key === "chips") && Array.isArray(hanchanChipCounts) && Number.isFinite(hanchanChipCounts[seatIndex])){
      return hanchanChipCounts[seatIndex] | 0;
    }
  }catch(e){}

  return null;
}

function formatHanchanEndCountText(value){
  if (!Number.isFinite(value)) return "—";
  return `${value | 0}回`;
}

function formatHanchanChipCountText(value){
  if (!Number.isFinite(value)) return "—";
  const n = value | 0;
  if (n > 0) return `+${n}枚`;
  if (n < 0) return `${n}枚`;
  return "0枚";
}

function getHanchanUmaByRank(rows){
  const secondScore = rows && rows[1] ? (Number(rows[1].score) || 0) : 0;
  if (secondScore >= 40000){
    return [25, 5, -15];
  }
  return [30, -5, -10];
}

function calcHanchanFinalScoreValue(point, rankIndex, rows, chipCount = 0){
  const base = ((Number(point) || 0) - 40000) / 1000;
  const umaByRank = getHanchanUmaByRank(rows);
  const chipValue = (Number(chipCount) || 0) * 2;
  return base + (Number(umaByRank[rankIndex]) || 0) + chipValue;
}

function formatHanchanFinalScoreText(value){
  const n = Number.isFinite(value) ? value : 0;
  const sign = n > 0 ? "+" : "";
  return `(${sign}${n.toFixed(1)})`;
}

function makeHanchanEndHeaderCell(text, align = "center"){
  const cell = document.createElement("div");
  cell.textContent = text;
  cell.style.fontSize = "15px";
  cell.style.fontWeight = "800";
  cell.style.color = "rgba(235,244,255,0.92)";
  cell.style.letterSpacing = "0.04em";
  cell.style.textAlign = align;
  cell.style.whiteSpace = "nowrap";
  return cell;
}

function makeHanchanEndCountCell(text){
  const cell = document.createElement("div");
  cell.textContent = text;
  cell.style.fontSize = "28px";
  cell.style.fontWeight = "900";
  cell.style.lineHeight = "1";
  cell.style.color = "#ffffff";
  cell.style.textAlign = "center";
  cell.style.whiteSpace = "nowrap";
  return cell;
}

function getHanchanEndGridTemplateColumns(){
  return "92px minmax(132px, 0.95fr) minmax(220px, 1.55fr) repeat(4, minmax(90px, 0.62fr))";
}

function getHanchanEndRowBackground(item, rankIndex){
  if (!item) return "rgba(255,255,255,0.07)";

  if (item.seat === 0 && rankIndex === 0){
    return "linear-gradient(90deg, rgba(104,176,255,0.22), rgba(255,214,100,0.15), rgba(255,255,255,0.08))";
  }

  if (item.seat === 0){
    return "linear-gradient(90deg, rgba(104,176,255,0.22), rgba(255,255,255,0.08))";
  }

  if (rankIndex === 0){
    return "linear-gradient(90deg, rgba(255,214,100,0.12), rgba(255,255,255,0.08))";
  }

  if (rankIndex === 2){
    return "linear-gradient(90deg, rgba(255,132,132,0.08), rgba(255,255,255,0.06))";
  }

  return "rgba(255,255,255,0.07)";
}

function getHanchanEndRowBorder(item, rankIndex){
  if (!item) return "1px solid rgba(255,255,255,0.06)";

  if (item.seat === 0){
    return "1px solid rgba(126,194,255,0.44)";
  }

  if (rankIndex === 0){
    return "1px solid rgba(255,220,138,0.24)";
  }

  if (rankIndex === 2){
    return "1px solid rgba(255,158,158,0.16)";
  }

  return "1px solid rgba(255,255,255,0.06)";
}

function getHanchanEndRowShadow(item){
  if (!item) return "0 10px 24px rgba(0,0,0,0.16)";

  if (item.seat === 0){
    return "0 0 0 1px rgba(104,176,255,0.14), 0 16px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)";
  }

  return "0 10px 24px rgba(0,0,0,0.16)";
}

function makeHanchanEndNameCell(item){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "10px";
  wrap.style.minWidth = "0";

  const name = document.createElement("div");
  name.textContent = item && item.name ? item.name : "";
  name.style.fontSize = "26px";
  name.style.fontWeight = "800";
  name.style.color = "#ffffff";
  name.style.minWidth = "0";
  name.style.whiteSpace = "nowrap";

  wrap.appendChild(name);

  if (item && item.seat === 0){
    const badge = document.createElement("div");
    badge.textContent = "YOU";
    badge.style.flex = "0 0 auto";
    badge.style.padding = "4px 9px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "12px";
    badge.style.fontWeight = "900";
    badge.style.letterSpacing = "0.08em";
    badge.style.lineHeight = "1";
    badge.style.color = "#eef8ff";
    badge.style.border = "1px solid rgba(148,212,255,0.52)";
    badge.style.background = "linear-gradient(180deg, rgba(112,184,255,0.28), rgba(49,101,170,0.28))";
    badge.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)";
    wrap.appendChild(badge);
  }

  return wrap;
}

function ensureHanchanEndOverlay(){
  let overlay = document.getElementById("hanchanEndOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "hanchanEndOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.72)";
  overlay.style.backdropFilter = "blur(5px)";
  overlay.style.zIndex = "2800";
  overlay.style.padding = "22px";
  overlay.style.boxSizing = "border-box";

  const panel = document.createElement("div");
  panel.id = "hanchanEndPanel";
  panel.style.width = "min(1140px, 96vw)";
  panel.style.maxHeight = "92vh";
  panel.style.overflowY = "auto";
  panel.style.overflowX = "hidden";
  panel.style.background = "linear-gradient(180deg, rgba(18,31,55,0.97), rgba(6,15,29,0.97))";
  panel.style.border = "1px solid rgba(255,255,255,0.13)";
  panel.style.borderRadius = "28px";
  panel.style.boxShadow = "0 24px 72px rgba(0,0,0,0.44)";
  panel.style.padding = "34px 30px 24px";
  panel.style.color = "#fff";
  panel.style.textAlign = "center";
  panel.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.id = "hanchanEndTitle";
  title.style.fontSize = "48px";
  title.style.fontWeight = "900";
  title.style.letterSpacing = "0.08em";
  title.style.lineHeight = "1.1";
  title.style.marginBottom = "12px";
  title.textContent = "対局終了";

  const reason = document.createElement("div");
  reason.id = "hanchanEndReason";
  reason.style.fontSize = "22px";
  reason.style.fontWeight = "700";
  reason.style.opacity = "0.92";
  reason.style.marginBottom = "22px";

  const scoresBox = document.createElement("div");
  scoresBox.id = "hanchanEndScores";
  scoresBox.style.display = "grid";
  scoresBox.style.gridTemplateColumns = "1fr";
  scoresBox.style.gap = "10px";
  scoresBox.style.textAlign = "left";
  scoresBox.style.marginBottom = "18px";
  scoresBox.style.width = "100%";
  scoresBox.style.minWidth = "0";

  const hint = document.createElement("div");
  hint.style.fontSize = "18px";
  hint.style.fontWeight = "700";
  hint.style.opacity = "0.84";
  hint.textContent = "クリックで閉じる";

  panel.appendChild(title);
  panel.appendChild(reason);
  panel.appendChild(scoresBox);
  panel.appendChild(hint);
  overlay.appendChild(panel);

  overlay.addEventListener("click", (ev)=>{
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    overlay.style.display = "none";
  }, true);

  document.body.appendChild(overlay);
  return overlay;
}

function showHanchanEndOverlay(endInfo, settlement){
  const overlay = ensureHanchanEndOverlay();
  const reasonEl = document.getElementById("hanchanEndReason");
  const scoresEl = document.getElementById("hanchanEndScores");

  if (reasonEl){
    reasonEl.textContent = endInfo && endInfo.reason ? endInfo.reason : "";
  }

  if (scoresEl){
    scoresEl.innerHTML = "";
    const finalScores = Array.isArray(scores) ? scores : (settlement && settlement.afterScores ? settlement.afterScores : [0,0,0]);
    const seatNames = [
      "あなた",
      "右CPU",
      "左CPU"
    ];
    const rankLabels = ["トップ", "2着", "ラス"];

    const rows = [];
    for (let seat = 0; seat < 3; seat++){
      rows.push({
        seat,
        name: seatNames[seat],
        score: Number(finalScores[seat]) || 0
      });
    }

    rows.sort((a, b)=>{
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });

    for (let i = 0; i < rows.length; i++){
      rows[i].rankIndex = i;
      rows[i].chipCount = Number(getHanchanEndSeatStatNumber(rows[i].seat, "chip")) || 0;
      rows[i].scoreValue = calcHanchanFinalScoreValue(rows[i].score, i, rows, rows[i].chipCount);
    }

    const gridTemplateColumns = getHanchanEndGridTemplateColumns();

    const header = document.createElement("div");
    header.style.display = "grid";
    header.style.gridTemplateColumns = gridTemplateColumns;
    header.style.alignItems = "center";
    header.style.columnGap = "10px";
    header.style.padding = "0 12px 2px";
    header.style.boxSizing = "border-box";
    header.style.minWidth = "0";

    header.appendChild(makeHanchanEndHeaderCell("順位", "left"));
    header.appendChild(makeHanchanEndHeaderCell("名前", "left"));
    header.appendChild(makeHanchanEndHeaderCell("最終持ち点", "left"));
    header.appendChild(makeHanchanEndHeaderCell("チップ"));
    header.appendChild(makeHanchanEndHeaderCell("リーチ回数"));
    header.appendChild(makeHanchanEndHeaderCell("和了回数"));
    header.appendChild(makeHanchanEndHeaderCell("放銃回数"));
    scoresEl.appendChild(header);

    for (let i = 0; i < rows.length; i++){
      const item = rows[i];
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = gridTemplateColumns;
      row.style.alignItems = "center";
      row.style.columnGap = "10px";
      row.style.padding = "18px 12px";
      row.style.borderRadius = "18px";
      row.style.background = getHanchanEndRowBackground(item, i);
      row.style.border = getHanchanEndRowBorder(item, i);
      row.style.boxShadow = getHanchanEndRowShadow(item);
      row.style.boxSizing = "border-box";
      row.style.minWidth = "0";

      const rank = document.createElement("div");
      rank.textContent = rankLabels[i] || "";
      rank.style.fontSize = "23px";
      rank.style.fontWeight = "900";
      rank.style.color = (i === 0) ? "#ffe082" : (item.seat === 0 ? "#bfe3ff" : "#d7ecff");
      rank.style.letterSpacing = "0.04em";
      rank.style.whiteSpace = "nowrap";

      const name = makeHanchanEndNameCell(item);

      const pointWrap = document.createElement("div");
      pointWrap.style.display = "flex";
      pointWrap.style.flexDirection = "column";
      pointWrap.style.alignItems = "flex-start";
      pointWrap.style.justifyContent = "center";
      pointWrap.style.gap = "4px";
      pointWrap.style.minWidth = "0";

      const point = document.createElement("div");
      point.textContent = item.score.toLocaleString("ja-JP");
      point.style.fontSize = "clamp(42px, 4.4vw, 54px)";
      point.style.fontWeight = "900";
      point.style.lineHeight = "0.92";
      point.style.color = "#ffffff";
      point.style.letterSpacing = "0.01em";
      point.style.whiteSpace = "nowrap";

      const scoreValue = document.createElement("div");
      scoreValue.textContent = formatHanchanFinalScoreText(item.scoreValue);
      scoreValue.style.fontSize = "24px";
      scoreValue.style.fontWeight = "800";
      scoreValue.style.lineHeight = "1";
      scoreValue.style.color = item.scoreValue >= 0 ? "#f7fbff" : "rgba(255,255,255,0.78)";
      scoreValue.style.whiteSpace = "nowrap";

      pointWrap.appendChild(point);
      pointWrap.appendChild(scoreValue);

      const chip = makeHanchanEndCountCell(formatHanchanChipCountText(item.chipCount));
      chip.style.color = item.chipCount > 0
        ? "#9ef7e9"
        : (item.chipCount < 0 ? "#ffd2d2" : "#ffffff");
      const riichi = makeHanchanEndCountCell(formatHanchanEndCountText(getHanchanEndSeatStatNumber(item.seat, "riichi")));
      const agari = makeHanchanEndCountCell(formatHanchanEndCountText(getHanchanEndSeatStatNumber(item.seat, "agari")));
      const hoju = makeHanchanEndCountCell(formatHanchanEndCountText(getHanchanEndSeatStatNumber(item.seat, "hoju")));

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(pointWrap);
      row.appendChild(chip);
      row.appendChild(riichi);
      row.appendChild(agari);
      row.appendChild(hoju);
      scoresEl.appendChild(row);
    }
  }

  overlay.style.display = "flex";
}
