// MBsanma/js/actions.js
// ========= actions.js（アクション共通処理） =========

// ================================
// ★ アガリオーバーレイ位置クラス制御
// - 0 = 自分     -> winner-self
// - 1 = 右CPU    -> winner-right
// - 2 = 左CPU    -> winner-left
// ================================
function clearAgariWinnerClasses(overlayEl){
  if (!overlayEl) return;
  overlayEl.classList.remove("winner-self", "winner-left", "winner-right");
}

function getAgariWinnerClassBySeatIndex(seatIndex){
  if (seatIndex === 0) return "winner-self";
  if (seatIndex === 1) return "winner-right";
  if (seatIndex === 2) return "winner-left";
  return "winner-self";
}

function applyAgariWinnerClass(overlayEl, seatIndex){
  if (!overlayEl) return;
  clearAgariWinnerClasses(overlayEl);
  overlayEl.classList.add(getAgariWinnerClassBySeatIndex(seatIndex));
}

function getExtraRonOverlayClassName(){
  return "extraRonOverlay";
}

function removeExtraRonOverlays(){
  const list = Array.from(document.querySelectorAll("." + getExtraRonOverlayClassName()));
  for (const el of list){
    try{ el.remove(); }catch(e){}
  }
}

function getCurrentRonOverlayWinnerSeatIndexes(){
  try{
    if (typeof window !== "undefined" && typeof window.getRonWinnerSeatIndexesFromQueue === "function"){
      const seats = window.getRonWinnerSeatIndexesFromQueue();
      if (Array.isArray(seats) && seats.length > 0) return seats.slice();
    }
  }catch(e){}

  if (typeof lastAgariWinnerSeatIndex === "number") return [lastAgariWinnerSeatIndex];
  return [0];
}

function makeExtraRonOverlayForSeat(seatIndex){
  if (!ronOverlay) return null;
  const clone = ronOverlay.cloneNode(true);
  clone.removeAttribute("id");
  clone.classList.add(getExtraRonOverlayClassName());
  clone.style.pointerEvents = "none";
  clone.style.display = "flex";

  const hint = clone.querySelector(".hint");
  if (hint) hint.style.display = "none";

  applyAgariWinnerClass(clone, seatIndex);
  return clone;
}

function syncRonOverlaysForWinnerSeats(seatIndexes){
  removeExtraRonOverlays();
  if (!ronOverlay) return;

  const list = Array.isArray(seatIndexes) ? seatIndexes.slice() : [];
  if (list.length <= 0) return;

  applyAgariWinnerClass(ronOverlay, list[0]);

  for (let i = 1; i < list.length; i++){
    const clone = makeExtraRonOverlayForSeat(list[i]);
    if (clone) document.body.appendChild(clone);
  }
}

// ツモオーバーレイ
function openTsumo(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("agari_tsumo", {
        winnerSeatIndex: (typeof lastAgariWinnerSeatIndex === "number") ? lastAgariWinnerSeatIndex : 0,
        winType: "tsumo"
      });
    }
  }catch(e){}

  // ★ 手動ツモでも「局終了」にしておく（卓に戻った後のクリックで次局へ進めるため）
  if (typeof isEnded !== "undefined" && !isEnded){
    isEnded = true;
  }

  // ★ 勝者情報を記録
  // - 自分ツモ時は seatIndex=0 をここで確定
  // - CPUツモ時は core2.js 側で事前に設定してから openTsumo() を呼ぶ
  try{
    if (typeof lastAgariWinnerSeatIndex !== "number"){
      lastAgariWinnerSeatIndex = 0;
    }
    lastAgariDiscarderSeatIndex = null;
    lastAgariType = "tsumo";
  }catch(e){}

  // ★ 勝者位置クラスを付与
  try{
    const seatIndex = (typeof lastAgariWinnerSeatIndex === "number")
      ? lastAgariWinnerSeatIndex
      : 0;
    applyAgariWinnerClass(tsumoOverlay, seatIndex);
  }catch(e){}

  // ★ アガリは「確認→次局」の2段階
  agariOverlayStep = 1;
  tsumoOverlay.style.display = "flex";
}

function closeTsumo(){
  clearAgariWinnerClasses(tsumoOverlay);
  tsumoOverlay.style.display = "none";
}

function openRon(){
  try{
    const seatIndexes = getCurrentRonOverlayWinnerSeatIndexes();
    syncRonOverlaysForWinnerSeats(seatIndexes);
  }catch(e){}

  agariOverlayStep = 1;
  ronOverlay.style.display = "flex";
}

function closeRon(){
  removeExtraRonOverlays();
  clearAgariWinnerClasses(ronOverlay);
  ronOverlay.style.display = "none";
}

// 流局オーバーレイ
function openRyukyoku(){
  // ★ 流局も「確認→次局」の2段階
  ryukyokuOverlayStep = 1;
  ryukyokuOverlay.style.display = "flex";
}
function closeRyukyoku(){ ryukyokuOverlay.style.display = "none"; }

// ================================
// ★ 山枯れ流局（turn.js / riichi.js から呼ばれる）
// - 親テンパイなら連荘（本場+1）
// - 親ノーテンなら親流れ（次局で親交代）
// ※ テンパイ判定は shanten.js の calcShanten を利用（0ならテンパイ）
// ================================
function endByExhaustionRyukyoku(){
  if (typeof isEnded !== "undefined" && isEnded) return;

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("ryukyoku_exhaustion", {
        reason: "exhaustion"
      });
    }
  }catch(e){}

  try{ isEnded = true; }catch(e){}

  const dealer = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

  const nextSeatOf = (s)=>{
    if (typeof nextSeatIndexOf === "function") return nextSeatIndexOf(s);
    return (s + 1) % 3;
  };

  const getTilesForSeat = (seat)=>{
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
  };

  const fixedMForSeat = (seat)=>{
    if (seat === 0){
      return Array.isArray(melds) ? melds.length : 0;
    }
    if (typeof getCpuFixedMeldCountBySeat === "function"){
      return getCpuFixedMeldCountBySeat(seat);
    }
    return 0;
  };

  const isTenpaiWith13Counts = (tiles, fixedM)=>{
    try{
      const counts = countsFromTiles(tiles);
      const s = (typeof calcShanten === "function") ? calcShanten(counts, fixedM) : 99;
      return s === 0;
    }catch(e){
      return false;
    }
  };

  const isTenpaiForSeat = (seat)=>{
    const tiles = getTilesForSeat(seat);
    const fixedM = fixedMForSeat(seat);

    // 13枚ならそのまま
    if (tiles.length === 13){
      return isTenpaiWith13Counts(tiles, fixedM);
    }

    // 14枚（drawnを持っている等）なら「1枚切ってテンパイ可能か」を見る
    if (tiles.length === 14){
      for (let i = 0; i < tiles.length; i++){
        const cand = tiles.slice();
        cand.splice(i, 1);
        if (isTenpaiWith13Counts(cand, fixedM)) return true;
      }
      return false;
    }

    // その他は安全側：テンパイ扱いしない
    return false;
  };

  const dealerTenpai = isTenpaiForSeat(dealer);

  // ★ 次局進行用に保存
  // - lastAgariType は "ryukyoku" をセット
  // - 親テンパイかどうかを lastRyukyokuDealerTenpai に保存（main.js で参照）
  try{
    lastAgariWinnerSeatIndex = null;
    lastAgariDiscarderSeatIndex = null;
    lastAgariType = "ryukyoku";
  }catch(e){}
  try{
    // どこにも宣言が無くても（非 strict なら）代入でグローバルになるが、
    // main.js 側で let 宣言しておく想定
    lastRyukyokuDealerTenpai = !!dealerTenpai;
  }catch(e){}

  try{
    if (typeof clearSelectedTile === "function") clearSelectedTile();
    if (typeof clearNewFlags === "function") clearNewFlags();
  }catch(e){}

  if (typeof render === "function") render();
  if (typeof openRyukyoku === "function") openRyukyoku();
}


// カン演出
function openKanEffect(){
  if (!kanOverlay) return;
  kanOverlay.style.display = "flex";
  setTimeout(()=>{ kanOverlay.style.display = "none"; }, 650);
}

// リーチ演出
function openRiichiEffect(){
  if (!riichiOverlay) return;
  riichiOverlay.style.display = "flex";
  setTimeout(()=>{ riichiOverlay.style.display = "none"; }, 650);
}

// ツモ文字演出
function openDrawEffect(){
  const el = document.getElementById("drawOverlay");
  if (!el) return;
  el.style.display = "flex";
  setTimeout(()=>{ el.style.display = "none"; }, 220);
}

async function openTsumoWithEffect(){
  openDrawEffect();
  await new Promise(r=>setTimeout(r, 1000)); // 1秒くらい見せる
  openTsumo();
}

// （自分の捨ての後の処理）
function afterPlayerDiscardAdvance(){
  if (typeof clearSelectedTile === "function") clearSelectedTile();
  render();

  if (typeof advanceTurnAfterDiscard === "function"){
    advanceTurnAfterDiscard(0);
  }

  if (!isEnded && typeof kickCpuTurnsIfNeeded === "function"){
    kickCpuTurnsIfNeeded();
  }
}


function pushRiichiDeclareLogSafe(seatIndex, tile, extra){
  try{
    if (typeof window === "undefined" || !window.MBSanmaMatchLog || typeof window.MBSanmaMatchLog.pushEvent !== "function") return;
    const payload = {
      seatIndex,
      declareTile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(tile) : (tile ? { code: tile.code, imgCode: tile.imgCode || tile.code } : null)
    };

    if (extra && typeof extra === "object"){
      Object.assign(payload, extra);
    }

    window.MBSanmaMatchLog.pushEvent("riichi", payload);
  }catch(e){}
}

function getPlayerForbiddenCallDiscardCode(){
  if (typeof turnPhase === "undefined" || turnPhase !== "CALL_DISCARD") return null;
  if (typeof currentTurnSeatIndex === "undefined" || currentTurnSeatIndex !== 0) return null;
  if (!Array.isArray(melds) || melds.length <= 0) return null;

  const lastMeld = melds[melds.length - 1];
  if (!lastMeld || lastMeld.type !== "pon" || !lastMeld.code) return null;
  return lastMeld.code;
}


function isPlayerRiichiTsumoChoiceLockedNow(){
  if (isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (!isRiichi) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;

  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD") return false;
  }

  if (!drawn) return false;
  if (typeof canTsumoAgariNow === "function") return !!canTsumoAgariNow();
  return false;
}


function canSelectPlayerTileForDiscard(isDrawnTile){
  if (isEnded) return false;
  if (isPlayerRiichiTsumoChoiceLockedNow()) return false;
  if (typeof isPlayerDiscardAiEnabled === "function" && isPlayerDiscardAiEnabled()) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;

  if (typeof turnPhase !== "undefined"){
    if (isDrawnTile){
      if (turnPhase !== "DISCARD") return false;
    } else {
      if (turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return false;
    }
  }

  if (isDrawnTile){
    return !!drawn;
  }

  if (typeof turnPhase === "undefined" || turnPhase === "DISCARD"){
    return !!drawn;
  }

  return true;
}

function pressPlayerHandTile(idx){
  if (!canSelectPlayerTileForDiscard(false)) return { type: "ignored" };
  if (!Array.isArray(hand13)) return { type: "ignored" };
  if (idx < 0 || idx >= hand13.length) return { type: "ignored" };

  const t = hand13[idx];
  if (!t) return { type: "ignored" };

  const forbiddenCallDiscardCode = getPlayerForbiddenCallDiscardCode();
  if (forbiddenCallDiscardCode && t.code === forbiddenCallDiscardCode){
    return { type: "ignored" };
  }

  if (isRiichiSelecting && riichiCandidates && !riichiCandidates.has("H:" + t.id)){
    return { type: "ignored" };
  }

  if (typeof isSelectedTile === "function" && isSelectedTile(t.id, false)){
    return { type: "discardHand", idx };
  }

  if (typeof setSelectedTile === "function") setSelectedTile(t.id, false);
  return { type: "selected", idx };
}

function pressPlayerDrawnTile(){
  if (!canSelectPlayerTileForDiscard(true)) return { type: "ignored" };
  if (!drawn) return { type: "ignored" };

  if (isRiichiSelecting && riichiCandidates && !riichiCandidates.has("D:" + drawn.id)){
    return { type: "ignored" };
  }

  if (typeof isSelectedTile === "function" && isSelectedTile(drawn.id, true)){
    return { type: "discardDrawn" };
  }

  if (typeof setSelectedTile === "function") setSelectedTile(drawn.id, true);
  return { type: "selected" };
}

// =========================================================
// ===== 自分の打牌（render.js から呼ばれる） =====
// - render.js 側は discardFromHand13(idx) / discardDrawn() を呼ぶ前提
// - 状態変更は actions.js で行う（プロジェクト方針）
// =========================================================
function discardFromHand13(idx){
  if (isEnded) return;
  if (isPlayerRiichiTsumoChoiceLockedNow()) return;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return;

  // CALL_DISCARD（鳴き後ツモ無し打牌）と通常DISCARDのみ許可
  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return;
  }

  // 鳴き選択待ち中は打牌させない（CPU進行が止まるのを防ぐ）
  if (typeof pendingCall !== "undefined" && pendingCall) return;

  if (!Array.isArray(hand13)) return;
  if (idx < 0 || idx >= hand13.length) return;

  // =========================================================
  // ★永久対策：ツモ番が来た直後（drawn未配布の0.5秒）に
  //            連打すると「ツモる前に切れて手牌が減る」問題を防ぐ
  //
  // turnPhase==="DISCARD" のときは、必ず drawn がある状態でのみ打牌を許可する。
  // ※ 例外：CALL_DISCARD（ポン後のツモ無し打牌）は drawn が無いのが正しいのでOK
  // =========================================================
  if ((typeof turnPhase === "undefined" || turnPhase === "DISCARD") && !drawn){
    return;
  }

  const t = hand13[idx];
  if (!t) return;

  if (typeof clearSelectedTile === "function") clearSelectedTile();

  const forbiddenCallDiscardCode = getPlayerForbiddenCallDiscardCode();
  if (forbiddenCallDiscardCode && t.code === forbiddenCallDiscardCode){
    return;
  }

  // リーチ選択中：候補以外は無視
  // ★宣言牌だけ横向き表示したいので、この打牌が「宣言打牌」かどうかを覚えておく
  let isRiichiDeclareDiscard = false;
  if (isRiichiSelecting && riichiCandidates){
    if (!riichiCandidates.has("H:" + t.id)) return;

    // この打牌でリーチ成立（今の仕様：打牌と同時に成立）
    isRiichiSelecting = false;
    riichiCandidates = null;
    isRiichi = true;
    isRiichiDeclareDiscard = true;
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, true); }catch(e){}
    try{ if (typeof setDoubleRiichiForSeat === "function" && typeof canDeclareDoubleRiichiNow === "function") setDoubleRiichiForSeat(0, canDeclareDoubleRiichiNow(0)); }catch(e){}
    if (typeof openRiichiEffect === "function") openRiichiEffect();
  }

  // 手牌から抜く
  hand13.splice(idx, 1);

  // 通常：drawn を手牌へ入れて 13枚に戻す
  if (typeof turnPhase === "undefined" || turnPhase === "DISCARD"){
    if (drawn){
      drawn.isNew = false;
      hand13.push(drawn);
      drawn = null;
      hand13 = sortHand(hand13);
    }
  }

  // 捨て牌へ
  t.isNew = false;
  t.isRiichiDeclare = !!isRiichiDeclareDiscard;
  if (isRiichiDeclareDiscard && typeof setPlayerRiichiDeclareTileId === "function"){
    setPlayerRiichiDeclareTileId(t.id);
  }
  if (!isRiichiDeclareDiscard && typeof maybeAdoptPlayerRiichiDisplayTile === "function"){
    maybeAdoptPlayerRiichiDisplayTile(t);
  }
  river.push(t);

  if (isRiichiDeclareDiscard){
    pushRiichiDeclareLogSafe(0, t, {
      source: (typeof turnPhase !== "undefined" && turnPhase === "CALL_DISCARD") ? "call_discard" : "hand",
      turnPhase: (typeof turnPhase !== "undefined") ? turnPhase : ""
    });
  }

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("discard", {
        seatIndex: 0,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(t) : { code: t.code, imgCode: t.imgCode || t.code },
        source: (typeof turnPhase !== "undefined" && turnPhase === "CALL_DISCARD") ? "call_discard" : "hand",
        isTsumogiri: false,
        isRiichiDeclare: !!isRiichiDeclareDiscard,
        turnPhase: (typeof turnPhase !== "undefined") ? turnPhase : ""
      });
    }
  }catch(e){}

  // ★ 鳴き後の強制打牌を完了
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall){
    try{
      if (typeof turnPhase === "undefined" || turnPhase === "CALL_DISCARD"){
        mustDiscardAfterCall = false;
      }
    }catch(e){}
  }

  // ★ 一発権を消すのは「一発権を持っている本人の一発ツモが終わったとき」だけ
  // 他家の通常打牌では消さない
  //
  // ここは「自分の打牌」なので、
  // - この打牌がリーチ宣言牌なら一発権は新しく付与された直後なので消さない
  // - すでにリーチ済みで、この打牌が宣言牌ではないなら
  //   自分の一発ツモが不成立で終わったということなので、自分の分だけ消す
  if (!isRiichiDeclareDiscard && isRiichi){
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, false); }catch(e){}
  }

  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  clearNewFlags();
  afterPlayerDiscardAdvance();
}

function discardDrawn(allowRiichiTsumoSkip = false){
  if (isEnded) return;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return;

  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD") return; // ツモ牌切りは通常DISCARDのみ
  }

  if (typeof pendingCall !== "undefined" && pendingCall) return;

  if (isPlayerRiichiTsumoChoiceLockedNow() && !allowRiichiTsumoSkip) return;

  if (!drawn) return;

  if (typeof clearSelectedTile === "function") clearSelectedTile();

  // リーチ選択中：候補以外は無視
  // ★宣言牌だけ横向き表示したいので、この打牌が「宣言打牌」かどうかを覚えておく
  let isRiichiDeclareDiscard = false;
  if (isRiichiSelecting && riichiCandidates){
    if (!riichiCandidates.has("D:" + drawn.id)) return;

    isRiichiSelecting = false;
    riichiCandidates = null;
    isRiichi = true;
    isRiichiDeclareDiscard = true;
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, true); }catch(e){}
    try{ if (typeof setDoubleRiichiForSeat === "function" && typeof canDeclareDoubleRiichiNow === "function") setDoubleRiichiForSeat(0, canDeclareDoubleRiichiNow(0)); }catch(e){}
    if (typeof openRiichiEffect === "function") openRiichiEffect();
  }

  drawn.isNew = false;
  drawn.isRiichiDeclare = !!isRiichiDeclareDiscard;
  if (isRiichiDeclareDiscard && typeof setPlayerRiichiDeclareTileId === "function"){
    setPlayerRiichiDeclareTileId(drawn.id);
  }
  if (!isRiichiDeclareDiscard && typeof maybeAdoptPlayerRiichiDisplayTile === "function"){
    maybeAdoptPlayerRiichiDisplayTile(drawn);
  }
  const discardedDrawnTile = drawn;
  river.push(drawn);
  drawn = null;

  if (isRiichiDeclareDiscard){
    pushRiichiDeclareLogSafe(0, discardedDrawnTile, {
      source: "drawn",
      turnPhase: (typeof turnPhase !== "undefined") ? turnPhase : ""
    });
  }

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("discard", {
        seatIndex: 0,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(discardedDrawnTile) : { code: discardedDrawnTile.code, imgCode: discardedDrawnTile.imgCode || discardedDrawnTile.code },
        source: "drawn",
        isTsumogiri: true,
        isRiichiDeclare: !!isRiichiDeclareDiscard,
        turnPhase: (typeof turnPhase !== "undefined") ? turnPhase : ""
      });
    }
  }catch(e){}

  // ★ 一発権を消すのは「一発権を持っている本人の一発ツモが終わったとき」だけ
  // 他家の通常打牌では消さない
  //
  // ここは「自分の打牌」なので、
  // - この打牌がリーチ宣言牌なら一発権は新しく付与された直後なので消さない
  // - すでにリーチ済みで、この打牌が宣言牌ではないなら
  //   自分の一発ツモが不成立で終わったということなので、自分の分だけ消す
  if (!isRiichiDeclareDiscard && isRiichi){
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, false); }catch(e){}
  }

  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  clearNewFlags();
  afterPlayerDiscardAdvance();
}