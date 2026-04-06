// MBsanma/js/main.js
// ========= main.js（起動/イベント紐付け） =========

// ================================
// ★ 自動で次局へ（誤爆防止）
// ================================
let __autoNextTimer = null;
let __nextKyokuArmed = false;
const PLAYER_AI_POST_AGARI_DELAY_MS = 3000;

// ★ 流局（山枯れ）時の「親テンパイ」情報（actions.js がセット）
let lastRyukyokuDealerTenpai = null;

// ★ アガリ後進行段階
// "none"        : 通常局中
// "overlay"     : 演出オーバーレイ表示中
// "table"       : 卓確認中
// "result"      : 結果確認中
// "nextArmed"   : 次局クリック待ち
let __postAgariStage = "none";


// ★ デバッグ用：CPはリーチするがツモ・ロンしない
let debugCpuRiichiOnlyMode = false;

// ★ CPU自動進行の世代管理（局リセット時に古いループを止める）
let __cpuTurnLoopEpoch = 0;

// ★ デバッグシナリオ開始前の新半荘リセット中はCPU自動進行を止める
let __suspendCpuAutoKick = false;

function setDebugCpuRiichiOnlyMode(value){
  debugCpuRiichiOnlyMode = !!value;
}

function isDebugCpuRiichiOnlyMode(){
  return !!debugCpuRiichiOnlyMode;
}

function bumpCpuTurnLoopEpoch(){
  __cpuTurnLoopEpoch += 1;
  return __cpuTurnLoopEpoch;
}

function getCpuTurnLoopEpoch(){
  return __cpuTurnLoopEpoch;
}

function clearAutoNextTimer(){
  if (__autoNextTimer){
    clearTimeout(__autoNextTimer);
    __autoNextTimer = null;
  }
  __nextKyokuArmed = false;
}

function resetPostAgariStage(){
  __postAgariStage = "none";
  __nextKyokuArmed = false;
}

function setPostAgariStageToOverlay(){
  __postAgariStage = "overlay";
  __nextKyokuArmed = false;
  schedulePlayerAiPostAgariAdvance("overlay");
}

function hasResultOverlayApi(){
  return (typeof openResultOverlay === "function" && typeof closeResultOverlay === "function");
}

function isResultOverlayVisible(){
  if (typeof resultOverlay === "undefined" || !resultOverlay) return false;
  const d = resultOverlay.style && resultOverlay.style.display;
  return (d !== "none" && d !== "");
}

function hasAgariResultQueueNow(){
  try{
    return (typeof window !== "undefined" && typeof window.getCurrentAgariResultEntry === "function" && !!window.getCurrentAgariResultEntry());
  }catch(e){
    return false;
  }
}

function getHeadAgariResultEntrySafe(){
  try{
    if (typeof window !== "undefined" && typeof window.getAgariQueueHeadEntry === "function"){
      return window.getAgariQueueHeadEntry();
    }
  }catch(e){}
  return null;
}

function isPlayerPostAgariAutoAdvanceEnabled(){
  try{
    return (typeof isPlayerDiscardAiEnabled === "function") && isPlayerDiscardAiEnabled();
  }catch(e){
    return false;
  }
}

function closeCurrentAgariOverlayForAutoAdvance(){
  try{
    if (tsumoOverlay && tsumoOverlay.style && tsumoOverlay.style.display !== "none" && tsumoOverlay.style.display !== ""){
      if (typeof closeTsumo === "function") closeTsumo();
      return true;
    }
  }catch(e){}

  try{
    if (ronOverlay && ronOverlay.style && ronOverlay.style.display !== "none" && ronOverlay.style.display !== ""){
      if (typeof closeRon === "function") closeRon();
      return true;
    }
  }catch(e){}

  try{
    if (ryukyokuOverlay && ryukyokuOverlay.style && ryukyokuOverlay.style.display !== "none" && ryukyokuOverlay.style.display !== ""){
      if (typeof closeRyukyoku === "function") closeRyukyoku();
      return true;
    }
  }catch(e){}

  return false;
}

function schedulePlayerAiPostAgariAdvance(stage){
  if (!isPlayerPostAgariAutoAdvanceEnabled()) return;

  if (__autoNextTimer){
    clearTimeout(__autoNextTimer);
    __autoNextTimer = null;
  }

  __autoNextTimer = setTimeout(()=>{
    __autoNextTimer = null;

    if (!isEnded) return;

    if (stage === "overlay"){
      if (__postAgariStage !== "overlay") return;
      movePostAgariFlowFromOverlayToTable(()=>{
        closeCurrentAgariOverlayForAutoAdvance();
      });
      return;
    }

    if (stage === "result"){
      if (__postAgariStage !== "result") return;
      movePostAgariFlowFromResultToNext();
      return;
    }

    if (stage === "next"){
      if (__postAgariStage !== "nextArmed") return;
      if (isAnyOverlayVisible()) return;
      startNextKyoku();
    }
  }, PLAYER_AI_POST_AGARI_DELAY_MS);
}

function installRyukyokuOverlayStagePatch(){
  try{
    if (typeof openRyukyoku !== "function") return;
    if (openRyukyoku.__playerAiOverlayWrapped) return;

    const original = openRyukyoku;
    const wrapped = function(...args){
      try{
        setPostAgariStageToOverlay();
      }catch(e){}
      return original.apply(this, args);
    };

    wrapped.__playerAiOverlayWrapped = true;
    openRyukyoku = wrapped;
  }catch(e){}
}

// ================================
// ★ 次局へ進む（ここだけで局進行）
// ================================
function startNextKyoku(){
  if (!__nextKyokuArmed) return;
  __nextKyokuArmed = false;

  const dealer = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

  const nextSeatOf = (s)=>{
    if (typeof nextSeatIndexOf === "function") return nextSeatIndexOf(s);
    return (s + 1) % 3;
  };

  // ================================
  // ★ 親番/本場の進行ルール（このプロジェクト仕様）
  // - 親がアガった：連荘（本場+1 / 局番号は据え置き）
  // - 山枯れ流局で親テンパイ：連荘（本場+1 / 局番号は据え置き）
  // - 親がアガらない / 親ノーテン流局：親流れ（親交代 / 本場=0 / 局番号+1）
  //
  // ★ 三麻の局進行
  // - 東1 → 東2 → 東3 → 南1 → 南2 → 南3
  // - 南3で親が流れたら対局終了
  // ================================
  let dealerKeeps = false;

  try{
    const headEntry = getHeadAgariResultEntrySafe();
    if (headEntry && (headEntry.winType === "tsumo" || headEntry.winType === "ron")){
      dealerKeeps = (headEntry.winnerSeatIndex === dealer);
    } else if (lastAgariType === "tsumo" || lastAgariType === "ron"){
      dealerKeeps = (lastAgariWinnerSeatIndex === dealer);
    } else if (lastAgariType === "ryukyoku"){
      dealerKeeps = (lastRyukyokuDealerTenpai === true);
    } else {
      dealerKeeps = false;
    }
  }catch(e){
    dealerKeeps = false;
  }

  if (dealerKeeps){
    honba = (typeof honba === "number") ? (honba + 1) : 1;
    // roundNumber / roundWind は据え置き
  } else {
    // 親流れ
    eastSeatIndex = nextSeatOf(dealer);
    honba = 0;

    // 次局（表示上の局番号）
    roundNumber++;

    if (roundNumber > 3){
      if (roundWind === "東"){
        roundWind = "南";
        roundNumber = 1;
      } else {
        // 南3終了
        lastAgariWinnerSeatIndex = null;
        lastAgariDiscarderSeatIndex = null;
        lastAgariType = null;
        lastAgariRonTile = null;
        lastRyukyokuDealerTenpai = null;

        resetPostAgariStage();
        return;
      }
    }
  }

  // 次局に影響を残さない
  lastAgariWinnerSeatIndex = null;
  lastAgariDiscarderSeatIndex = null;
  lastAgariType = null;
  lastAgariRonTile = null;
  lastRyukyokuDealerTenpai = null;
  try{ if (typeof window !== "undefined" && typeof window.clearAgariResultQueue === "function") window.clearAgariResultQueue(); }catch(e){}

  resetPostAgariStage();
  startNewKyoku();
}

function armNextKyoku(){
  // ★放置で「次局に行けなくなる」原因だった 2秒自動解除をやめる
  // これで、卓確認後にしばらく放置しても、次のクリックで次局へ進める
  if (__autoNextTimer){
    clearTimeout(__autoNextTimer);
    __autoNextTimer = null;
  }
  __nextKyokuArmed = true;
  __postAgariStage = "nextArmed";
  schedulePlayerAiPostAgariAdvance("next");
}

function movePostAgariFlowFromOverlayToTable(closeFn){
  try{
    if (typeof closeFn === "function") closeFn();
  }catch(e){}

  // 演出オーバーレイを閉じたら、卓確認画面へ
  __postAgariStage = "table";

  if (isPlayerPostAgariAutoAdvanceEnabled()){
    movePostAgariFlowFromTableToResult();
  }
}

function movePostAgariFlowFromTableToResult(){
  // 結果画面APIがまだ無い間は、従来どおり次局待ちへフォールバック
  if (!hasResultOverlayApi()){
    armNextKyoku();
    return;
  }

  try{
    openResultOverlay();
  }catch(e){}

  __postAgariStage = "result";
  schedulePlayerAiPostAgariAdvance("result");
}

function movePostAgariFlowFromResultToNext(){
  if (hasAgariResultQueueNow()){
    try{
      if (typeof window.hasNextAgariResultQueueEntry === "function" && window.hasNextAgariResultQueueEntry()){
        if (typeof window.advanceAgariResultQueue === "function") window.advanceAgariResultQueue();
        if (typeof openResultOverlay === "function") openResultOverlay();
        __postAgariStage = "result";
        schedulePlayerAiPostAgariAdvance("result");
        return;
      }
    }catch(e){}
  }

  let settlement = null;

  try{
    if (typeof buildCurrentRoundSettlement === "function"){
      settlement = buildCurrentRoundSettlement();
    }
  }catch(e){}

  try{
    if (typeof applyPendingRoundSettlement === "function"){
      settlement = applyPendingRoundSettlement() || settlement;
    }
  }catch(e){}

  try{
    if (typeof closeResultOverlay === "function") closeResultOverlay();
  }catch(e){}

  try{
    if (typeof render === "function") render();
  }catch(e){}

  let endInfo = null;
  try{
    if (typeof getHanchanEndReasonAfterSettlement === "function"){
      endInfo = getHanchanEndReasonAfterSettlement(settlement);
    }
  }catch(e){}

  if (endInfo && endInfo.end){
    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.finishMatch === "function"){
        window.MBSanmaMatchLog.finishMatch(endInfo, settlement);
      }
    }catch(e){}
    try{
      if (typeof showHanchanEndOverlay === "function"){
        showHanchanEndOverlay(endInfo, settlement);
      }
    }catch(e){}
    resetPostAgariStage();
    return;
  }

  armNextKyoku();
}


function setInitialDoraAndUraFromDeadWall(){
  if (typeof resetDoraIndicatorsFromDeadWall === "function"){
    resetDoraIndicatorsFromDeadWall();
    return;
  }

  doraIndicators = [];
  uraDoraIndicators = [];
  try{ if (typeof deadWallDrawCursor !== "undefined") deadWallDrawCursor = 0; }catch(e){}

  if (!Array.isArray(deadWall) || deadWall.length <= 0) return;

  const omote = deadWall[8];
  if (omote && omote.code){
    doraIndicators.push({ code: omote.code, imgCode: omote.imgCode || omote.code, isRed: !!omote.isRed });
  }

  const ura = deadWall[12];
  if (ura && ura.code){
    uraDoraIndicators.push({ code: ura.code, imgCode: ura.imgCode || ura.code, isRed: !!ura.isRed });
  }
}

function resetKyokuRuntimeState(){
  bumpCpuTurnLoopEpoch();

  try{ if (typeof clearPlayerDrawTimer === "function") clearPlayerDrawTimer(); }catch(e){}
  try{ if (typeof clearPlayerAutoDiscardTimer === "function") clearPlayerAutoDiscardTimer(); }catch(e){}
  try{ if (typeof clearPlayerCallAiTimer === "function") clearPlayerCallAiTimer(); }catch(e){}

  isEnded = false;

  isRiichi = false;
  isRiichiSelecting = false;
  riichiCandidates = null;
  riichiWait = false;
  try{ if (typeof resetPlayerRiichiDisplayState === "function") resetPlayerRiichiDisplayState(); }catch(e){}

  pendingCall = null;
  mustDiscardAfterCall = false;

  if (typeof clearSelectedTile === "function") clearSelectedTile();

  river = [];
  cpuLeftRiver  = [];
  cpuRightRiver = [];
  melds = [];
  peis  = [];

  lastAgariWinnerSeatIndex = null;
  lastAgariDiscarderSeatIndex = null;
  lastAgariType = null;
  lastAgariRonTile = null;
  lastRyukyokuDealerTenpai = null;

  doraIndicators = [];
  uraDoraIndicators = [];

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}
  try{ if (typeof clearAllDoubleRiichiFlags === "function") clearAllDoubleRiichiFlags(); }catch(e){}
  try{ if (typeof resetOpenCallOrKanFlag === "function") resetOpenCallOrKanFlag(); }catch(e){}
  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}
  try{ if (typeof resetCpuExtraState === "function") resetCpuExtraState(); }catch(e){}

  clearAutoNextTimer();
  resetPostAgariStage();

  try{ if (typeof closeTsumo === "function") closeTsumo(); }catch(e){}
  try{ if (typeof closeRon === "function") closeRon(); }catch(e){}
  try{ if (typeof closeRyukyoku === "function") closeRyukyoku(); }catch(e){}
  try{ if (typeof closeResultOverlay === "function") closeResultOverlay(); }catch(e){}

  try{ if (typeof kanOverlay !== "undefined" && kanOverlay) kanOverlay.style.display = "none"; }catch(e){}
  try{ if (typeof riichiOverlay !== "undefined" && riichiOverlay) riichiOverlay.style.display = "none"; }catch(e){}
  try{ if (typeof drawOverlay !== "undefined" && drawOverlay) drawOverlay.style.display = "none"; }catch(e){}
}

function startDebugKyokuByCodes(selectedImgCodes){
  try{
    if (!Array.isArray(selectedImgCodes) || selectedImgCodes.length !== 13) return false;

    const normalizeCode = (imgCode)=>{
      if (imgCode === "r5p") return { code: "5p", imgCode: "r5p" };
      if (imgCode === "r5s") return { code: "5s", imgCode: "r5s" };
      if (imgCode === "r4z") return { code: "4z", imgCode: "r4z" };
      return { code: imgCode, imgCode };
    };

    const requested = selectedImgCodes.map(normalizeCode);
    const fullWall = shuffle(makeWall());

    const consumeTile = ({ code, imgCode })=>{
      const idx = fullWall.findIndex((t)=> t && t.code === code && t.imgCode === imgCode);
      if (idx < 0) return null;
      const picked = fullWall[idx];
      fullWall.splice(idx, 1);
      return picked;
    };

    const selectedTiles = [];
    for (const item of requested){
      const tile = consumeTile(item);
      if (!tile) return false;
      selectedTiles.push(tile);
    }

    if (fullWall.length < (18 + 1 + 13 + 13)) return false;

    resetKyokuRuntimeState();

    try{
      if (typeof resetScoreStateForNewHanchan === "function"){
        resetScoreStateForNewHanchan();
      }
    }catch(e){}

    nextId = 1 + fullWall.length + selectedTiles.length;
    initWallsFromShuffled(fullWall);

    setInitialDoraAndUraFromDeadWall();

    hand13 = sortHand(selectedTiles);
    drawn = null;

    cpuRightHand13 = sortHand(wall.slice(0, 13));
    wall = wall.slice(13);

    cpuLeftHand13 = sortHand(wall.slice(0, 13));
    wall = wall.slice(13);

    initialHand13 = hand13.map(t => ({...t}));
    initialDrawn  = drawn ? ({...drawn}) : null;
    initialCpuRightHand13 = cpuRightHand13.map(t => ({...t}));
    initialCpuLeftHand13  = cpuLeftHand13.map(t => ({...t}));

    clearNewFlags();
    if (drawn) drawn.isNew = true;

    try{
      if (typeof initTurnForKyokuStart === "function"){
        initTurnForKyokuStart();
      } else {
        if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
        if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
      }
    }catch(e){}

    render();
    try{
      if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex === 0 && typeof schedulePlayerAutoDiscardIfNeeded === "function"){
        schedulePlayerAutoDiscardIfNeeded(true);
      }
    }catch(e){}
    return true;
  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "startDebugKyokuByCodes()");
    return false;
  }
}

// ================================
// ================================
// ★ 新しい局（配牌〜）
// ================================


function parseDebugKyokuLabel(label){
  const text = String(label || '東1');
  if (text.startsWith('南')){
    const n = Number(text.slice(1)) || 1;
    return { roundWind: '南', roundNumber: Math.min(3, Math.max(1, n)) };
  }
  const n = Number(text.slice(1)) || 1;
  return { roundWind: '東', roundNumber: Math.min(3, Math.max(1, n)) };
}

function startDebugKyokuByScenario(opts){
  try{
    const scenario = (opts && typeof opts === 'object') ? opts : {};
    const selected = (scenario.selected && typeof scenario.selected === 'object') ? scenario.selected : {};
    const cpuRiichiOnly = !!scenario.cpuRiichiOnly;

    __suspendCpuAutoKick = true;
    try{
      if (typeof startNewHanchan === 'function') startNewHanchan();
    }finally{
      __suspendCpuAutoKick = false;
    }

    setDebugCpuRiichiOnlyMode(cpuRiichiOnly);

    const normalizeCode = (imgCode)=>{
      if (imgCode === 'r5p') return { code: '5p', imgCode: 'r5p' };
      if (imgCode === 'r5s') return { code: '5s', imgCode: 'r5s' };
      if (imgCode === 'r4z') return { code: '4z', imgCode: 'r4z' };
      return { code: imgCode, imgCode };
    };

    const kyokuInfo = parseDebugKyokuLabel(scenario.kyokuLabel);
    roundWind = kyokuInfo.roundWind;
    roundNumber = kyokuInfo.roundNumber;
    eastSeatIndex = (scenario.dealer === 1 || scenario.dealer === 2) ? scenario.dealer : 0;
    honba = (Number.isInteger(scenario.honba) && scenario.honba >= 0) ? scenario.honba : 0;

    const junme = (Number.isInteger(scenario.junme) && scenario.junme >= 0)
      ? scenario.junme
      : Math.max(0, Number(scenario.junme) || 0);

    const fullPool = shuffle(makeWall());

    const consumeTile = (spec)=>{
      if (!spec || !spec.code || !spec.imgCode) return null;
      const idx = fullPool.findIndex((t)=> t && t.code === spec.code && t.imgCode === spec.imgCode);
      if (idx < 0) return null;
      const picked = fullPool[idx];
      fullPool.splice(idx, 1);
      return picked;
    };

    const drawRandomFromPool = ()=>{
      if (!Array.isArray(fullPool) || fullPool.length <= 0) return null;
      return fullPool.pop() || null;
    };

    const buildOrderedTiles = (arr, max)=>{
      const out = [];
      const list = Array.isArray(arr) ? arr.slice(0, max) : [];
      for (const imgCode of list){
        const tile = consumeTile(normalizeCode(imgCode));
        if (!tile) return null;
        out.push(tile);
      }
      while (out.length < max){
        const tile = drawRandomFromPool();
        if (!tile) return null;
        out.push(tile);
      }
      return out;
    };

    const buildHand = (arr)=>{
      const out = buildOrderedTiles(arr, 13);
      if (!out) return null;
      return sortHand(out);
    };

    const meHand = buildHand(selected.me);
    const rightHand = buildHand(selected.right);
    const leftHand = buildHand(selected.left);
    if (!meHand || !rightHand || !leftHand) return false;

    let omote = null;
    if (Array.isArray(selected.dora) && selected.dora.length > 0){
      omote = consumeTile(normalizeCode(selected.dora[0]));
      if (!omote) return false;
    } else {
      omote = drawRandomFromPool();
      if (!omote) return false;
    }

    const ura = drawRandomFromPool();
    if (!ura) return false;

    const supplementTiles = buildOrderedTiles(selected.deadDraw, 8);
    if (!supplementTiles) return false;

    const extraOmoteTiles = [];
    while (extraOmoteTiles.length < 3){
      const tile = drawRandomFromPool();
      if (!tile) return false;
      extraOmoteTiles.push(tile);
    }

    const extraUraTiles = [];
    while (extraUraTiles.length < 3){
      const tile = drawRandomFromPool();
      if (!tile) return false;
      extraUraTiles.push(tile);
    }

    const unusedDeadTiles = [];
    while (unusedDeadTiles.length < 2){
      const tile = drawRandomFromPool();
      if (!tile) return false;
      unusedDeadTiles.push(tile);
    }

    const customDeadWall = [
      ...supplementTiles,
      omote,
      ...extraOmoteTiles,
      ura,
      ...extraUraTiles,
      ...unusedDeadTiles
    ];

    const nextSeatOf = (s)=> ((s + 1) % 3);
    const riverOrder = [eastSeatIndex, nextSeatOf(eastSeatIndex), nextSeatOf(nextSeatOf(eastSeatIndex))];
    const riverMap = { 0: [], 1: [], 2: [] };

    for (let j = 0; j < junme; j++){
      for (const seat of riverOrder){
        const tile = drawRandomFromPool();
        if (!tile) return false;
        tile.isNew = false;
        riverMap[seat].push(tile);
      }
    }

    const wallTopTiles = buildOrderedTiles(selected.wallTop, 9);
    if (!wallTopTiles) return false;

    const remainingWall = [
      ...shuffle(fullPool.slice()),
      ...wallTopTiles.slice().reverse()
    ];

    resetKyokuRuntimeState();

    wall = remainingWall;
    liveWall = wall;
    deadWall = customDeadWall;
    try{ if (typeof deadWallDrawCursor !== 'undefined') deadWallDrawCursor = 0; }catch(e){}

    setInitialDoraAndUraFromDeadWall();

    hand13 = meHand;
    cpuRightHand13 = rightHand;
    cpuLeftHand13 = leftHand;
    drawn = null;

    river = riverMap[0].slice();
    cpuRightRiver = riverMap[1].slice();
    cpuLeftRiver = riverMap[2].slice();

    initialHand13 = hand13.map(t => ({...t}));
    initialDrawn  = null;
    initialCpuRightHand13 = cpuRightHand13.map(t => ({...t}));
    initialCpuLeftHand13  = cpuLeftHand13.map(t => ({...t}));

    clearNewFlags();

    currentTurnSeatIndex = eastSeatIndex;
    turnPhase = 'DISCARD';
    if (typeof clearSelectedTile === 'function') clearSelectedTile();

    if (currentTurnSeatIndex === 0){
      drawn = drawOne();
      if (drawn) drawn.isNew = true;
      initialDrawn = drawn ? ({...drawn}) : null;
      render();
      if (!isEnded && isRiichi && typeof scheduleRiichiAuto === 'function'){
        try{ scheduleRiichiAuto(); }catch(e){}
      }
      try{
        if (typeof schedulePlayerAutoDiscardIfNeeded === 'function'){
          schedulePlayerAutoDiscardIfNeeded(true);
        }
      }catch(e){}
    } else {
      drawn = null;
      initialDrawn = null;
      render();
      if (typeof kickCpuTurnsIfNeeded === 'function'){
        kickCpuTurnsIfNeeded(true);
      }
    }

    return true;
  }catch(err){
    if (typeof showFatalError === 'function') showFatalError(err, 'startDebugKyokuByScenario()');
    return false;
  }
}

function startNewKyoku(){
  resetKyokuRuntimeState();

  nextId = 1;
  const shuffled108 = shuffle(makeWall());
  initWallsFromShuffled(shuffled108);

  setInitialDoraAndUraFromDeadWall();

  hand13 = sortHand(wall.slice(0, 13));
  wall = wall.slice(13);

  drawn = null;
  if ((typeof eastSeatIndex === "number" ? eastSeatIndex : 0) === 0 && wall.length > 0){
    drawn = wall[0];
    wall = wall.slice(1);
    if (drawn) drawn.isNew = true;
  }

  cpuRightHand13 = sortHand(wall.slice(0, 13));
  wall = wall.slice(13);

  cpuLeftHand13 = sortHand(wall.slice(0, 13));
  wall = wall.slice(13);

  initialHand13 = hand13.map(t => ({...t}));
  initialDrawn  = drawn ? ({...drawn}) : null;

  initialCpuRightHand13 = cpuRightHand13.map(t => ({...t}));
  initialCpuLeftHand13  = cpuLeftHand13.map(t => ({...t}));

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.startKyoku === "function"){
      window.MBSanmaMatchLog.startKyoku({
        roundWind,
        roundNumber,
        honba,
        eastSeatIndex,
        kyotakuCount,
        scores,
        doraIndicators,
        uraDoraIndicators,
        wall,
        deadWall,
        hand13,
        drawn,
        cpuRightHand13,
        cpuLeftHand13,
        river,
        cpuRightRiver,
        cpuLeftRiver,
        melds,
        cpuRightMelds: (typeof cpuRightMelds !== "undefined") ? cpuRightMelds : [],
        cpuLeftMelds: (typeof cpuLeftMelds !== "undefined") ? cpuLeftMelds : [],
        peis,
        cpuRightPeis: (typeof cpuRightPeis !== "undefined") ? cpuRightPeis : [],
        cpuLeftPeis: (typeof cpuLeftPeis !== "undefined") ? cpuLeftPeis : []
      });
    }
  }catch(e){}

  clearNewFlags();
  if (drawn) drawn.isNew = true;

  try{
    if (typeof initTurnForKyokuStart === "function"){
      initTurnForKyokuStart();
    } else {
      if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
      if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
    }
  }catch(e){}

  render();
}

// ================================
// ★ 新しい半荘
// ================================
function resetHanchanCarryState(){
  try{
    if (typeof clearPendingRoundSettlement === "function"){
      clearPendingRoundSettlement();
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.clearAgariResultQueue === "function"){
      window.clearAgariResultQueue();
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.resetCommittedRiichiStickState === "function"){
      window.resetCommittedRiichiStickState();
    }
  }catch(e){}
}

function startNewHanchan(){
  clearAutoNextTimer();
  setDebugCpuRiichiOnlyMode(false);

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.startMatch === "function"){
      window.MBSanmaMatchLog.startMatch({
        startedFrom: "startNewHanchan",
        appTitle: "MBサンマアプリ版"
      });
    }
  }catch(e){}

  try{
    if (typeof resetScoreStateForNewHanchan === "function"){
      resetScoreStateForNewHanchan();
    }
  }catch(e){}

  resetHanchanCarryState();

  roundWind = "東";
  roundNumber = 1;
  eastSeatIndex = Math.floor(Math.random() * 3);
  honba = 0;

  lastAgariWinnerSeatIndex = null;
  lastAgariDiscarderSeatIndex = null;
  lastAgariType = null;
  lastAgariRonTile = null;
  lastRyukyokuDealerTenpai = null;

  resetPostAgariStage();
  startNewKyoku();
}

// ================================
// ★ リセット（配牌に戻す）
// ================================
function doReset(){
  if (!initialHand13 || initialHand13.length === 0) return;

  resetKyokuRuntimeState();

  hand13 = initialHand13.map(t => ({...t}));
  drawn  = initialDrawn ? ({...initialDrawn}) : null;

  cpuRightHand13 = initialCpuRightHand13.map(t => ({...t}));
  cpuLeftHand13  = initialCpuLeftHand13.map(t => ({...t}));

  clearNewFlags();
  if (drawn) drawn.isNew = true;

  try{
    if (typeof initTurnForKyokuStart === "function"){
      initTurnForKyokuStart();
    } else {
      if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
      if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
    }
  }catch(e){}

  render();
}

// ================================

// ================================

// ================================

// ================================
// ★ オーバーレイの表示判定（卓画面に戻っているか）
// ================================
function isAnyOverlayVisible(){
  const isShown = (el)=>{
    if (!el) return false;
    // display:none だけで判定（CSS次第で opacity などもあるが、ここは安全側）
    const d = el.style && el.style.display;
    return (d !== "none" && d !== "");
  };

  // overlayは「表示時に style.display='block' などを付けてる前提」
  // もし display 指定を使っていない場合でも、卓クリック誤爆を防ぐために
  // isEnded=false の局中は進めない（下の卓クリック側で守る）
  return (
    isShown(tsumoOverlay) ||
    isShown(ronOverlay) ||
    isShown(ryukyokuOverlay) ||
    isShown(kanOverlay) ||
    isShown(riichiOverlay) ||
    isResultOverlayVisible()
  );
}

// ================================
// ★ 演出オーバーレイを閉じたら「卓確認画面」へ
// ================================
function onAgariOverlayCloseToTable(closeFn){
  movePostAgariFlowFromOverlayToTable(closeFn);
}

function canUsePeiButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

function canUseRiichiButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

function canUseClosedKanButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;

  if (typeof pendingCall !== "undefined" && pendingCall){
    return false;
  }

  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;

  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return false;
  }

  return true;
}

function canUseMinkanButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall === "undefined" || !pendingCall) return false;
  return !!pendingCall.canMinkan;
}

function canUsePonButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall === "undefined" || !pendingCall) return false;
  return !!pendingCall.canPon;
}

function canUseRonButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall === "undefined" || !pendingCall) return false;
  return !!pendingCall.canRon;
}

function canUseRiichiTsumoSkipButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isRiichi === "undefined" || !isRiichi) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  if (!drawn) return false;
  if (typeof canTsumoAgariNow === "function") return !!canTsumoAgariNow();
  return false;
}

function canUsePassButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return true;
  return canUseRiichiTsumoSkipButtonNow();
}

function canUseTsumoButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

// ================================
// ★ 卓クリック / 結果クリックの進行
// - isEnded の時だけ
// - 演出オーバーレイが出ている最中は卓クリック無効
// - ボタン類のクリックは誤爆しないよう除外
// ================================
function bindTableClickFlowAfterAgari(){
  document.addEventListener("click", (ev)=>{
    try{
      if (!isEnded) return;

      const t = ev && ev.target;

      // ボタン操作で誤爆しない
      if (t && (t.closest && t.closest("button"))) return;

      // 演出中は卓クリックで進めない（オーバーレイ側クリックのみ）
      if (__postAgariStage === "overlay"){
        return;
      }

      // 卓確認中 → 結果確認画面
      if (__postAgariStage === "table"){
        if (isAnyOverlayVisible()) return;
        movePostAgariFlowFromTableToResult();
        return;
      }

      // 結果確認中は、結果画面側クリックで処理する
      if (__postAgariStage === "result"){
        return;
      }

      // 次局待ち → 次局
      if (__postAgariStage === "nextArmed"){
        if (isAnyOverlayVisible()) return;
        startNextKyoku();
      }
    }catch(e){
      // 何もしない
    }
  }, true);
}


const GAME_SETTINGS_STORAGE_KEY = "mbsanma_game_settings_v1";


const PLAYER_CONTROL_MODE_LIBRARY = {
  manual: { key: "manual", label: "手動" },
  internal: { key: "internal", label: "内部AI" }
};

let playerDiscardControlMode = "manual";
let playerOpenControlMode = "manual";
let playerSpecialControlMode = "manual";

function normalizePlayerControlMode(mode){
  return String(mode || "manual") === "internal" ? "internal" : "manual";
}

function getPlayerDiscardControlMode(){
  return normalizePlayerControlMode(playerDiscardControlMode);
}

function setPlayerDiscardControlMode(mode){
  playerDiscardControlMode = normalizePlayerControlMode(mode);
  return playerDiscardControlMode;
}

function isPlayerDiscardAiEnabled(){
  return getPlayerDiscardControlMode() === "internal";
}

function getPlayerOpenControlMode(){
  return normalizePlayerControlMode(playerOpenControlMode);
}

function setPlayerOpenControlMode(mode){
  playerOpenControlMode = normalizePlayerControlMode(mode);
  return playerOpenControlMode;
}

function isPlayerOpenAiEnabled(){
  return getPlayerOpenControlMode() === "internal";
}

function getPlayerSpecialControlMode(){
  return normalizePlayerControlMode(playerSpecialControlMode);
}

function setPlayerSpecialControlMode(mode){
  playerSpecialControlMode = normalizePlayerControlMode(mode);
  return playerSpecialControlMode;
}

function isPlayerSpecialAiEnabled(){
  return getPlayerSpecialControlMode() === "internal";
}

try{
  if (typeof window !== "undefined"){
    window.PLAYER_CONTROL_MODE_LIBRARY = PLAYER_CONTROL_MODE_LIBRARY;
    window.getPlayerDiscardControlMode = getPlayerDiscardControlMode;
    window.setPlayerDiscardControlMode = setPlayerDiscardControlMode;
    window.isPlayerDiscardAiEnabled = isPlayerDiscardAiEnabled;
    window.getPlayerOpenControlMode = getPlayerOpenControlMode;
    window.setPlayerOpenControlMode = setPlayerOpenControlMode;
    window.isPlayerOpenAiEnabled = isPlayerOpenAiEnabled;
    window.getPlayerSpecialControlMode = getPlayerSpecialControlMode;
    window.setPlayerSpecialControlMode = setPlayerSpecialControlMode;
    window.isPlayerSpecialAiEnabled = isPlayerSpecialAiEnabled;
  }
}catch(e){}

function applyNonPersistentCpuDefaultsOnReload(){
  try{
    if (typeof setCpuHandOpen === "function") {
      setCpuHandOpen(false);
    } else {
      isCpuHandOpen = false;
    }
  }catch(e){}

  [1, 2].forEach((seatIndex)=>{
    try{
      if (typeof setCpuOpenSeatEngineMode === "function") {
        setCpuOpenSeatEngineMode(seatIndex, "internal");
      }
    }catch(e){}

    try{
      if (typeof setCpuOpenSeatProfile === "function") {
        setCpuOpenSeatProfile(seatIndex, "menzen");
      }
    }catch(e){}

    try{
      if (typeof setCpuDiscardSeatEngineMode === "function") {
        setCpuDiscardSeatEngineMode(seatIndex, "internal");
      }
    }catch(e){}

    try{
      if (typeof setCpuDiscardSeatProfile === "function") {
        setCpuDiscardSeatProfile(seatIndex, "safe");
      }
    }catch(e){}

    try{
      if (typeof setCpuDiscardSeatExternalStyle === "function") {
        setCpuDiscardSeatExternalStyle(seatIndex, "defensive");
      }
    }catch(e){}
  });

  syncQuickSettingButtons();
}

function getSettingsOverlayEl(){
  return document.getElementById("settingsOverlay");
}

function getSettingsBodyEl(){
  return document.getElementById("settingsBody");
}

function getSettingsCloseBtnEl(){
  return document.getElementById("settingsCloseBtn");
}

function getSettingsBtnEl(){
  return document.getElementById("settingsBtn");
}

let activeSettingsTab = "display";

function normalizeSettingsTab(tabKey){
  const key = String(tabKey || "display");
  if (key === "player" || key === "cpu") return key;
  return "display";
}

function getActiveSettingsTab(){
  return normalizeSettingsTab(activeSettingsTab);
}

function setActiveSettingsTab(tabKey){
  activeSettingsTab = normalizeSettingsTab(tabKey);
  return activeSettingsTab;
}

function isSettingsOverlayVisible(){
  const el = getSettingsOverlayEl();
  if (!el) return false;
  return el.style.display === "flex";
}

function syncQuickSettingButtons(){
  try{
    if (typeof cpuOpenToggleBtn !== "undefined" && cpuOpenToggleBtn && typeof getCpuHandOpenLabel === "function"){
      cpuOpenToggleBtn.textContent = getCpuHandOpenLabel();
    }
  }catch(e){}

  try{
    if (ukeireToggleBtn){
      ukeireToggleBtn.textContent = `受け入れ：${isUkeireVisible ? "ON" : "OFF"}`;
    }
  }catch(e){}
}

function getGameSettingSeatLabel(seatIndex){
  if (seatIndex === 1) return "右CP";
  if (seatIndex === 2) return "左CP";
  return "CP";
}

function getPlayerControlModeOptions(){
  const lib = (typeof PLAYER_CONTROL_MODE_LIBRARY === "object" && PLAYER_CONTROL_MODE_LIBRARY) ? PLAYER_CONTROL_MODE_LIBRARY : {};
  return Object.keys(lib).map((key)=> ({ key, label: lib[key] && lib[key].label ? lib[key].label : key }));
}

function getPlayerUnifiedControlMode(){
  const discardMode = getPlayerDiscardControlMode();
  const openMode = getPlayerOpenControlMode();
  const specialMode = getPlayerSpecialControlMode();

  if (discardMode === "internal" && openMode === "internal" && specialMode === "internal"){
    return "internal";
  }

  return "manual";
}

function setPlayerUnifiedControlMode(mode){
  const normalized = normalizePlayerControlMode(mode);
  setPlayerDiscardControlMode(normalized);
  setPlayerOpenControlMode(normalized);
  setPlayerSpecialControlMode(normalized);
  return normalized;
}

function getPlayerControlModeLabelJa(mode){
  return normalizePlayerControlMode(mode) === "internal" ? "内部AI" : "手動";
}

function buildPlayerSettingsSectionHtml(){
  const unifiedMode = getPlayerUnifiedControlMode();
  const discardMode = getPlayerDiscardControlMode();
  const openMode = getPlayerOpenControlMode();
  const specialMode = getPlayerSpecialControlMode();

  return `
    <div class="settingsSection">
      <div class="settingsSectionTitle">自分設定</div>
      <div class="settingsSeats">
        <div class="settingsSeatCard">
          <div class="settingsSeatTitle">あなた</div>

          <div class="settingsField settingsPlayerModeRow">
            <div class="settingsLabel">操作モード</div>

            <div class="settingsModeSwitch" role="group" aria-label="自分操作モード切替">
              <button
                type="button"
                class="settingsModeSwitchBtn${unifiedMode === "manual" ? " isActive" : ""}"
                data-player-mode="manual"
                aria-pressed="${unifiedMode === "manual" ? "true" : "false"}"
              >手動</button>
              <button
                type="button"
                class="settingsModeSwitchBtn${unifiedMode === "internal" ? " isActive" : ""}"
                data-player-mode="internal"
                aria-pressed="${unifiedMode === "internal" ? "true" : "false"}"
              >自動</button>
            </div>

            <div class="settingsModeSummary">
              <div class="settingsModeSummaryItem">
                <span class="settingsModeSummaryLabel">打牌操作</span>
                <span class="settingsModeSummaryValue">${escapeSettingsHtml(getPlayerControlModeLabelJa(discardMode))}</span>
              </div>
              <div class="settingsModeSummaryItem">
                <span class="settingsModeSummaryLabel">副露選択</span>
                <span class="settingsModeSummaryValue">${escapeSettingsHtml(getPlayerControlModeLabelJa(openMode))}</span>
              </div>
              <div class="settingsModeSummaryItem">
                <span class="settingsModeSummaryLabel">特殊行動</span>
                <span class="settingsModeSummaryValue">${escapeSettingsHtml(getPlayerControlModeLabelJa(specialMode))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildSettingsTabsHtml(){
  const activeTab = getActiveSettingsTab();
  const tabs = [
    { key: "display", label: "表示" },
    { key: "player", label: "自分設定" },
    { key: "cpu", label: "CP設定" }
  ];

  return `
    <div id="settingsTabs" role="tablist" aria-label="設定タブ">
      ${tabs.map((tab)=> `
        <button
          type="button"
          class="settingsTabBtn${activeTab === tab.key ? " isActive" : ""}"
          data-settings-tab="${tab.key}"
          role="tab"
          aria-selected="${activeTab === tab.key ? "true" : "false"}"
        >${tab.label}</button>
      `).join("")}
    </div>
  `;
}

function buildDisplaySettingsPaneHtml(){
  const cpuHandOpen = (typeof isCpuHandOpen !== "undefined") ? !!isCpuHandOpen : false;
  const ukeireVisible = !!isUkeireVisible;

  return `
    <div class="settingsSection">
      <div class="settingsSectionTitle">表示</div>
      <div class="settingsToggleRow">
        <label class="settingsCheck">
          <input type="checkbox" id="settingsCpuHandOpen"${cpuHandOpen ? " checked" : ""}>
          <span>CP手牌を表にする</span>
        </label>
        <label class="settingsCheck">
          <input type="checkbox" id="settingsUkeireVisible"${ukeireVisible ? " checked" : ""}>
          <span>受け入れ表示を出す</span>
        </label>
      </div>
    </div>
  `;
}

function buildPlayerSettingsPaneHtml(){
  return buildPlayerSettingsSectionHtml();
}

function buildCpuSettingsPaneHtml(){
  return `
    <div class="settingsSection">
      <div class="settingsSectionTitle">CP設定</div>
      <div class="settingsSeats">
        ${buildGameSettingsSeatSectionHtml(1)}
        ${buildGameSettingsSeatSectionHtml(2)}
      </div>
    </div>
  `;
}

function buildSettingsTabPanelsHtml(){
  const activeTab = getActiveSettingsTab();
  const panes = [
    { key: "display", html: buildDisplaySettingsPaneHtml() },
    { key: "player", html: buildPlayerSettingsPaneHtml() },
    { key: "cpu", html: buildCpuSettingsPaneHtml() }
  ];

  return `
    <div id="settingsTabPanels">
      ${panes.map((pane)=> `
        <section class="settingsTabPane${activeTab === pane.key ? " isActive" : ""}" data-settings-pane="${pane.key}" role="tabpanel" aria-hidden="${activeTab === pane.key ? "false" : "true"}">
          <div class="settingsPaneInner">
            ${pane.html}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function escapeSettingsHtml(value){
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSettingsOptionTags(list, selectedKey){
  const items = Array.isArray(list) ? list : [];
  return items.map((item)=>{
    const key = escapeSettingsHtml(item && item.key ? item.key : "");
    const label = escapeSettingsHtml(item && item.label ? item.label : key);
    const selected = (item && item.key === selectedKey) ? ' selected' : '';
    return `<option value="${key}"${selected}>${label}</option>`;
  }).join("");
}

function getCpuEngineModeLabelJa(key){
  if (key === "external") return "外部AI";
  if (key === "internal") return "内部AI";
  if (key === "legacy") return "旧ロジック";
  return key || "";
}

function getCpuOpenProfileLabelJa(key, fallback = ""){
  if (key === "safe") return "守備重視";
  if (key === "menzen") return "面前重視";
  if (key === "balanced") return "バランス";
  if (key === "speedy") return "速度重視";
  if (key === "value") return "打点重視";
  if (key === "aggressive") return "前のめり";
  return fallback || key || "";
}

function getCpuDiscardStyleLabelJa(key, fallback = ""){
  if (key === "balanced") return "バランス";
  if (key === "defensive") return "守備重視";
  if (key === "speedy") return "速度重視";
  if (key === "menzen") return "面前重視";
  if (key === "value") return "打点重視";
  if (key === "aggressive") return "前のめり";
  return fallback || key || "";
}

function getCpuOpenModeOptions(){
  const lib = (typeof CPU_OPEN_ENGINE_MODE_LIBRARY === "object" && CPU_OPEN_ENGINE_MODE_LIBRARY) ? CPU_OPEN_ENGINE_MODE_LIBRARY : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuEngineModeLabelJa(key) }));
}

function getCpuOpenProfileOptions(){
  const lib = (typeof getCpuOpenProfileLibrary === "function") ? getCpuOpenProfileLibrary() : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuOpenProfileLabelJa(key, lib[key] && lib[key].label ? lib[key].label : key) }));
}

function getCpuDiscardModeOptions(){
  const lib = (typeof CPU_DISCARD_ENGINE_MODE_LIBRARY === "object" && CPU_DISCARD_ENGINE_MODE_LIBRARY) ? CPU_DISCARD_ENGINE_MODE_LIBRARY : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuEngineModeLabelJa(key) }));
}

function getCpuDiscardStyleOptions(){
  const lib = (typeof getCpuDiscardExternalStyleLibrary === "function") ? getCpuDiscardExternalStyleLibrary() : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuDiscardStyleLabelJa(key, lib[key] && lib[key].label ? lib[key].label : key) }));
}

function getCpuOpenSeatModeSafe(seatIndex){
  if (typeof getCpuOpenSeatEngineMode === "function"){
    return getCpuOpenSeatEngineMode(seatIndex);
  }
  return "internal";
}

function getCpuOpenSeatProfileKeySafe(seatIndex){
  if (typeof getCpuOpenSeatProfileKey === "function"){
    return getCpuOpenSeatProfileKey(seatIndex);
  }
  return "balanced";
}

function getCpuDiscardSeatModeSafe(seatIndex){
  if (typeof getCpuDiscardSeatEngineMode === "function"){
    return getCpuDiscardSeatEngineMode(seatIndex);
  }
  return "internal";
}

function getCpuDiscardSeatStyleKeySafe(seatIndex){
  if (typeof getCpuDiscardSeatExternalStyleKey === "function"){
    return getCpuDiscardSeatExternalStyleKey(seatIndex);
  }
  return "balanced";
}

function buildGameSettingsSeatSectionHtml(seatIndex){
  const seatLabel = getGameSettingSeatLabel(seatIndex);
  const openMode = getCpuOpenSeatModeSafe(seatIndex);
  const openProfileKey = getCpuOpenSeatProfileKeySafe(seatIndex);
  const discardMode = getCpuDiscardSeatModeSafe(seatIndex);
  const discardStyleKey = getCpuDiscardSeatStyleKeySafe(seatIndex);

  const openProfileDisabled = openMode !== "internal" ? " disabled" : "";
  const discardStyleDisabled = discardMode === "legacy" ? " disabled" : "";

  return `
    <div class="settingsSeatCard">
      <div class="settingsSeatTitle">${escapeSettingsHtml(seatLabel)}</div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-open-engine-${seatIndex}">副露AI</label>
        <select class="settingsSelect" id="settings-open-engine-${seatIndex}" data-kind="open-engine" data-seat="${seatIndex}">
          ${buildSettingsOptionTags(getCpuOpenModeOptions(), openMode)}
        </select>
        <div class="settingsHint">内部AI・外部AI・旧ロジックを切り替えます。</div>
      </div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-open-profile-${seatIndex}">副露スタイル</label>
        <select class="settingsSelect" id="settings-open-profile-${seatIndex}" data-kind="open-profile" data-seat="${seatIndex}"${openProfileDisabled}>
          ${buildSettingsOptionTags(getCpuOpenProfileOptions(), openProfileKey)}
        </select>
        <div class="settingsHint">副露AIが内部AIのときに使います。</div>
      </div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-discard-engine-${seatIndex}">打牌AI</label>
        <select class="settingsSelect" id="settings-discard-engine-${seatIndex}" data-kind="discard-engine" data-seat="${seatIndex}">
          ${buildSettingsOptionTags(getCpuDiscardModeOptions(), discardMode)}
        </select>
        <div class="settingsHint">外部AI・内部AI・旧ロジックを切り替えます。</div>
      </div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-discard-style-${seatIndex}">打牌スタイル</label>
        <select class="settingsSelect" id="settings-discard-style-${seatIndex}" data-kind="discard-style" data-seat="${seatIndex}"${discardStyleDisabled}>
          ${buildSettingsOptionTags(getCpuDiscardStyleOptions(), discardStyleKey)}
        </select>
        <div class="settingsHint">打牌AIが旧ロジック以外のときに使います。</div>
      </div>
    </div>
  `;
}

function renderGameSettingsPanel(){
  const body = getSettingsBodyEl();
  if (!body) return;

  body.innerHTML = `
    ${buildSettingsTabsHtml()}
    ${buildSettingsTabPanelsHtml()}
  `;

  const tabButtons = body.querySelectorAll("button[data-settings-tab]");
  tabButtons.forEach((buttonEl)=>{
    buttonEl.addEventListener("click", ()=>{
      const nextTab = String(buttonEl.dataset.settingsTab || "display");
      setActiveSettingsTab(nextTab);
      renderGameSettingsPanel();
    });
  });

  const cpuHandOpenInput = document.getElementById("settingsCpuHandOpen");
  if (cpuHandOpenInput){
    cpuHandOpenInput.addEventListener("change", ()=>{
      if (typeof setCpuHandOpen === "function"){
        setCpuHandOpen(!!cpuHandOpenInput.checked);
      } else {
        isCpuHandOpen = !!cpuHandOpenInput.checked;
      }
      syncQuickSettingButtons();
      saveGameSettingsToStorage();
      if (typeof render === "function") render();
    });
  }

  const ukeireVisibleInput = document.getElementById("settingsUkeireVisible");
  if (ukeireVisibleInput){
    ukeireVisibleInput.addEventListener("change", ()=>{
      isUkeireVisible = !!ukeireVisibleInput.checked;
      syncQuickSettingButtons();
      saveGameSettingsToStorage();
      if (typeof render === "function") render();
    });
  }

  const playerModeButtons = body.querySelectorAll("button[data-player-mode]");
  playerModeButtons.forEach((buttonEl)=>{
    buttonEl.addEventListener("click", ()=>{
      const value = String(buttonEl.dataset.playerMode || "manual");

      setPlayerUnifiedControlMode(value);
      saveGameSettingsToStorage();

      if (typeof schedulePlayerAutoDiscardIfNeeded === "function") schedulePlayerAutoDiscardIfNeeded(true);
      if (typeof maybeSchedulePlayerOpenAiChoice === "function") maybeSchedulePlayerOpenAiChoice(true);
      if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
      if (typeof render === "function") render();

      renderGameSettingsPanel();
    });
  });

  const selects = body.querySelectorAll("select[data-kind][data-seat]");
  selects.forEach((selectEl)=>{
    selectEl.addEventListener("change", ()=>{
      const kind = String(selectEl.dataset.kind || "");
      const seatIndex = Number(selectEl.dataset.seat);
      const value = String(selectEl.value || "");

      if (kind === "open-engine"){
        if (typeof setCpuOpenSeatEngineMode === "function"){
          setCpuOpenSeatEngineMode(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
        return;
      }

      if (kind === "open-profile"){
        if (typeof setCpuOpenSeatProfile === "function"){
          setCpuOpenSeatProfile(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
        return;
      }

      if (kind === "discard-engine"){
        if (typeof setCpuDiscardSeatEngineMode === "function"){
          setCpuDiscardSeatEngineMode(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
        return;
      }

      if (kind === "discard-style"){
        if (typeof setCpuDiscardSeatExternalStyle === "function"){
          setCpuDiscardSeatExternalStyle(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
      }
    });
  });
}

function openSettingsOverlay(){
  const overlay = getSettingsOverlayEl();
  const closeBtn = getSettingsCloseBtnEl();
  if (!overlay) return;

  renderGameSettingsPanel();
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");

  setTimeout(()=>{
    try{
      if (closeBtn && typeof closeBtn.focus === "function") closeBtn.focus();
    }catch(e){}
  }, 0);
}

function closeSettingsOverlay(){
  const overlay = getSettingsOverlayEl();
  const openBtn = getSettingsBtnEl();
  if (!overlay) return;

  try{
    if (document && document.activeElement && typeof document.activeElement.blur === "function"){
      document.activeElement.blur();
    }
  }catch(e){}

  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");

  setTimeout(()=>{
    try{
      if (openBtn && typeof openBtn.focus === "function") openBtn.focus();
    }catch(e){}
  }, 0);
}

function collectGameSettingsForStorage(){
  return {
    ukeireVisible: !!isUkeireVisible,
    player: {
      discardControlMode: getPlayerDiscardControlMode(),
      openControlMode: getPlayerOpenControlMode(),
      specialControlMode: getPlayerSpecialControlMode()
    }
  };
}

function sanitizePersistedGameSettings(raw){
  const src = (raw && typeof raw === "object") ? raw : {};
  const next = {
    ...src,
    player: (src.player && typeof src.player === "object") ? { ...src.player } : {}
  };

  let changed = false;

  if (Object.prototype.hasOwnProperty.call(next, "cpuHandOpen")){
    delete next.cpuHandOpen;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(next, "seats")){
    delete next.seats;
    changed = true;
  }

  return { settings: next, changed };
}

function saveGameSettingsToStorage(){
  try{
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(collectGameSettingsForStorage()));
    return true;
  }catch(e){
    return false;
  }
}

function applyGameSettingsFromObject(raw){
  const src = (raw && typeof raw === "object") ? raw : {};
  const seats = (src.seats && typeof src.seats === "object") ? src.seats : {};
  const player = (src.player && typeof src.player === "object") ? src.player : {};

  try{
    if (typeof setCpuHandOpen === "function"){
      setCpuHandOpen(!!src.cpuHandOpen);
    } else {
      isCpuHandOpen = !!src.cpuHandOpen;
    }
  }catch(e){}

  try{
    if (typeof src.ukeireVisible !== "undefined"){
      isUkeireVisible = !!src.ukeireVisible;
    }
  }catch(e){}

  try{
    if (player.discardControlMode != null){
      setPlayerDiscardControlMode(player.discardControlMode);
    }
  }catch(e){}

  try{
    if (player.openControlMode != null){
      setPlayerOpenControlMode(player.openControlMode);
    }
  }catch(e){}

  try{
    if (player.specialControlMode != null){
      setPlayerSpecialControlMode(player.specialControlMode);
    }
  }catch(e){}

  [1, 2].forEach((seatIndex)=>{
    const seat = seats[String(seatIndex)] || seats[seatIndex] || {};
    try{
      if (seat.openEngineMode != null && typeof setCpuOpenSeatEngineMode === "function"){
        setCpuOpenSeatEngineMode(seatIndex, seat.openEngineMode);
      }
    }catch(e){}
    try{
      if (seat.openProfileKey != null && typeof setCpuOpenSeatProfile === "function"){
        setCpuOpenSeatProfile(seatIndex, seat.openProfileKey);
      }
    }catch(e){}
    try{
      if (seat.discardEngineMode != null && typeof setCpuDiscardSeatEngineMode === "function"){
        setCpuDiscardSeatEngineMode(seatIndex, seat.discardEngineMode);
      }
    }catch(e){}
    try{
      if (seat.discardStyleKey != null && typeof setCpuDiscardSeatExternalStyle === "function"){
        setCpuDiscardSeatExternalStyle(seatIndex, seat.discardStyleKey);
      }
    }catch(e){}
  });

  syncQuickSettingButtons();
}

function loadGameSettingsFromStorage(){
  try{
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(GAME_SETTINGS_STORAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    const sanitized = sanitizePersistedGameSettings(parsed);

    applyGameSettingsFromObject(sanitized.settings);

    if (sanitized.changed){
      try{
        localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized.settings));
      }catch(e){}
    }

    return true;
  }catch(e){
    return false;
  }
}

function installNoZoomTouchGuards(overlayEl, panelEl){
  const targets = [overlayEl, panelEl].filter(Boolean);
  if (targets.length <= 0) return;

  const addIfNeeded = (el, type, handler, options)=>{
    if (!el) return;
    const key = `__noZoomGuard_${type}`;
    if (el[key]) return;
    el.addEventListener(type, handler, options);
    el[key] = true;
  };

  const preventMultiTouch = (ev)=>{
    if (!ev) return;
    const touches = ev.touches || ev.targetTouches;
    if (touches && touches.length > 1){
      if (typeof ev.preventDefault === "function") ev.preventDefault();
    }
  };

  const preventGesture = (ev)=>{
    if (!ev) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  };

  const preventCtrlWheel = (ev)=>{
    if (!ev || !ev.ctrlKey) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  };

  for (const el of targets){
    try{
      if (el && el.style){
        el.style.touchAction = "pan-x pan-y";
        el.style.webkitTouchCallout = "none";
        el.style.webkitUserSelect = "none";
      }
    }catch(e){}

    addIfNeeded(el, "gesturestart", preventGesture, { passive: false });
    addIfNeeded(el, "gesturechange", preventGesture, { passive: false });
    addIfNeeded(el, "gestureend", preventGesture, { passive: false });
    addIfNeeded(el, "touchmove", preventMultiTouch, { passive: false });
    addIfNeeded(el, "wheel", preventCtrlWheel, { passive: false });
    addIfNeeded(el, "dblclick", preventGesture, { passive: false });
  }
}

function bindSettingsOverlayEvents(){
  const overlay = getSettingsOverlayEl();
  const closeBtn = getSettingsCloseBtnEl();
  const openBtn = getSettingsBtnEl();
  const panel = document.getElementById("settingsPanel");

  if (openBtn){
    openBtn.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      openSettingsOverlay();
    });
  }

  if (closeBtn){
    closeBtn.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      closeSettingsOverlay();
    });
  }

  if (overlay){
    overlay.addEventListener("click", (ev)=>{
      if (ev && ev.target === overlay){
        closeSettingsOverlay();
      }
    });
  }

  if (panel){
    panel.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    });
  }

  installNoZoomTouchGuards(overlay, panel);

  document.addEventListener("keydown", (ev)=>{
    if (!isSettingsOverlayVisible()) return;
    if (!ev || ev.key !== "Escape") return;
    closeSettingsOverlay();
  });

  renderGameSettingsPanel();
}

// ================================
// ★ イベント紐付け
// ================================
function isPlayerActionTurnForButtons(){
  if (isEnded) return false;

  let selfTurn = false;
  try{
    if (typeof isPlayerTurn === "function") {
      selfTurn = !!isPlayerTurn();
    } else if (typeof currentTurnSeatIndex !== "undefined") {
      selfTurn = (currentTurnSeatIndex === 0);
    }
  }catch(e){
    selfTurn = false;
  }

  if (!selfTurn) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;

  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

function canChooseMinkanFromButton(){
  if (isEnded) return false;

  let selfTurn = false;
  try{
    if (typeof isPlayerTurn === "function") {
      selfTurn = !!isPlayerTurn();
    } else if (typeof currentTurnSeatIndex !== "undefined") {
      selfTurn = (currentTurnSeatIndex === 0);
    }
  }catch(e){
    selfTurn = false;
  }

  if (selfTurn) return false;
  return !!(typeof pendingCall !== "undefined" && pendingCall);
}

function bindEvents(){
  if (newBtn){
    newBtn.addEventListener("click", ()=>{
      startNewHanchan();
    });
  }




  if (typeof cpuOpenToggleBtn !== "undefined" && cpuOpenToggleBtn){
    cpuOpenToggleBtn.addEventListener("click", ()=>{
      if (typeof toggleCpuHandOpen === "function"){
        toggleCpuHandOpen();
      } else {
        isCpuHandOpen = !isCpuHandOpen;
      }

      syncQuickSettingButtons();
      saveGameSettingsToStorage();

      if (isSettingsOverlayVisible()){
        renderGameSettingsPanel();
      }

      render();
    });

    syncQuickSettingButtons();
  }

  if (resetBtn){
    resetBtn.addEventListener("click", ()=>{
      doReset();
    });
  }

  if (ukeireToggleBtn){
    ukeireToggleBtn.addEventListener("click", ()=>{
      isUkeireVisible = !isUkeireVisible;
      syncQuickSettingButtons();
      saveGameSettingsToStorage();

      if (isSettingsOverlayVisible()){
        renderGameSettingsPanel();
      }

      render();
    });
  }

  bindSettingsOverlayEvents();

  if (peiBtn){
    peiBtn.addEventListener("click", ()=>{
      if (!isPlayerActionTurnForButtons()) return;
      if (typeof doPei === "function") doPei();
    });
  }

  if (ponBtn){
    ponBtn.addEventListener("click", ()=>{
      if (!canUsePonButtonNow()) return;
      if (typeof choosePon === "function") choosePon(true);
    });
  }

  if (passBtn){
    passBtn.addEventListener("click", ()=>{
      if (!canUsePassButtonNow()) return;

      if (typeof pendingCall !== "undefined" && pendingCall){
        if (typeof choosePass === "function") choosePass();
        return;
      }

      if (canUseRiichiTsumoSkipButtonNow()){
        if (typeof discardDrawn === "function") discardDrawn(true);
      }
    });
  }

  if (kanBtn){
    kanBtn.addEventListener("click", ()=>{
      if (isPlayerActionTurnForButtons()){
        if (typeof doKan === "function") doKan();
        return;
      }

      if (!canChooseMinkanFromButton()) return;
      if (typeof chooseMinkan === "function") chooseMinkan(true);
    });
  }

  if (riichiBtn){
    riichiBtn.addEventListener("click", ()=>{
      if (!isPlayerActionTurnForButtons()) return;
      if (typeof doRiichi === "function") doRiichi();
    });
  }

  if (ronBtn){
    ronBtn.addEventListener("click", ()=>{
      if (!canUseRonButtonNow()) return;
      if (typeof chooseRon === "function") chooseRon(true);
    });
  }

  if (tsumoBtn){
    tsumoBtn.addEventListener("click", ()=>{
      if (!canUseTsumoButtonNow()) return;
      if (typeof openTsumo === "function"){
        setPostAgariStageToOverlay();
        openTsumo();
      }
    });
  }

  // オーバーレイ：ツモ（クリックで卓確認画面へ）
  if (tsumoOverlay){
    tsumoOverlay.addEventListener("click", (ev)=>{
      // 卓クリックにバブルして即進行しないように止める
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      onAgariOverlayCloseToTable(()=>{ if (typeof closeTsumo === "function") closeTsumo(); });
    }, true);
  }

  // オーバーレイ：ロン（クリックで卓確認画面へ）
  if (ronOverlay){
    ronOverlay.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      onAgariOverlayCloseToTable(()=>{ if (typeof closeRon === "function") closeRon(); });
    }, true);
  }

  // オーバーレイ：流局（今は従来どおり卓確認へ）
  if (ryukyokuOverlay){
    ryukyokuOverlay.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      onAgariOverlayCloseToTable(()=>{ if (typeof closeRyukyoku === "function") closeRyukyoku(); });
    }, true);
  }

  // 結果確認画面（後から追加する新オーバーレイ）
  if (typeof resultOverlay !== "undefined" && resultOverlay){
    resultOverlay.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      if (__postAgariStage !== "result") return;
      movePostAgariFlowFromResultToNext();
    }, true);
  }

  // 卓クリックで進行
  bindTableClickFlowAfterAgari();
}

// ================================
// ★ 起動
// ================================
(function boot(){
  try{
    installRyukyokuOverlayStagePatch();
    applyNonPersistentCpuDefaultsOnReload();
    loadGameSettingsFromStorage();
    bindEvents();
    syncQuickSettingButtons();
    startNewHanchan();
  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "boot()");
  }
})();