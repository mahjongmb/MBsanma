// ========= riichi.js（リーチ：選択→成立→自動ツモ切り＋例外停止） =========

function openRiichiEffect(seatIndex = 0){
  if (!riichiOverlay) return;

  const inner = riichiOverlay.querySelector(".inner");
  const img = inner ? inner.querySelector("img") : null;

  riichiOverlay.style.position = "fixed";
  riichiOverlay.style.inset = "0";
  riichiOverlay.style.display = "block";
  riichiOverlay.style.pointerEvents = "none";
  riichiOverlay.style.zIndex = "2500";
  riichiOverlay.style.background = "transparent";

  if (inner){
    inner.style.position = "absolute";
    inner.style.left = "50%";
    inner.style.top = "50%";
    inner.style.transform = "translate(-50%, -50%) scale(1)";
    inner.style.transformOrigin = "center center";
    inner.style.opacity = "0";
    inner.style.filter = "drop-shadow(0 0 18px rgba(255,140,40,0.95)) drop-shadow(0 0 42px rgba(255,90,0,0.75))";
    inner.style.willChange = "transform, opacity";
    inner.style.animation = "none";
  }

  if (img){
    img.style.display = "block";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.userSelect = "none";
    img.draggable = false;
  }

  let x = "50%";
  let y = "78%";
  let w = "360px";

  if (seatIndex === 1){
    x = "82%";
    y = "58%";
    w = "300px";
  } else if (seatIndex === 2){
    x = "18%";
    y = "58%";
    w = "300px";
  }

  if (inner){
    inner.style.left = x;
    inner.style.top = y;
    inner.style.width = `min(${w}, 34vw)`;
    if (seatIndex === 0){
      inner.style.width = "min(360px, 42vw)";
    }

    void inner.offsetWidth;
    inner.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.72)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.06)", offset: 0.38 },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.00)", offset: 0.72 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.12)" }
      ],
      {
        duration: 900,
        easing: "ease-out",
        fill: "forwards"
      }
    );
  }

  setTimeout(()=>{
    if (!riichiOverlay) return;
    riichiOverlay.style.display = "none";
  }, 900);
}

function stopRiichiAuto(){
  if (riichiAutoTimer){
    clearTimeout(riichiAutoTimer);
    riichiAutoTimer = null;
  }
}

function getRiichiCancelBtnEl(){
  return document.getElementById("riichiCancelBtn");
}

function cancelRiichiSelection(){
  if (!isRiichiSelecting) return;

  isRiichiSelecting = false;
  riichiCandidates = null;
  hoveredTileId = null;

  try{
    if (typeof updateStatsDefault === "function") updateStatsDefault();
  }catch(e){}

  render();
}

function bindRiichiCancelButton(){
  const btn = getRiichiCancelBtnEl();
  if (!btn || btn.dataset.boundRiichiCancel === "1") return;

  btn.dataset.boundRiichiCancel = "1";
  btn.addEventListener("click", ()=>{
    cancelRiichiSelection();
  });
}

// 「今の14枚がテンパイ」のとき、テンパイ維持できる捨て牌を列挙
function computeRiichiDiscardCandidates(){
  const fixedM = melds.length;
  const set = new Set();

  // 手牌のどれかを切る：13枚（drawnを含める）
  for (const t of hand13){
    const after13 = hand13.filter(x => x.id !== t.id);
    if (drawn) after13.push(drawn);
    const sh = calcShanten(countsFromTiles(after13), fixedM);
    if (sh === 0) set.add("H:" + t.id);
  }

  // drawnを切る：after13=hand13 がテンパイならOK
  if (drawn){
    const sh = calcShanten(countsFromTiles(hand13), fixedM);
    if (sh === 0) set.add("D:" + drawn.id);
  }

  return set;
}

function startRiichiSelection(){
  if (isEnded || isRiichi || isRiichiSelecting) return;
  if (!isTenpaiNow14()) return;

  const cand = computeRiichiDiscardCandidates();
  if (cand.size <= 0) return;

  bindRiichiCancelButton();

  isRiichiSelecting = true;
  riichiCandidates = cand;

  hoveredTileId = null;
  updateStatsDefault();
  render();
}

// ★ リーチ中、ツモ後に「止まる」かどうか（ペー or カン）
function shouldPauseForSpecialAfterRiichiDraw(){
  if (!drawn) return false;

  // ペー：北を引いた（この仕様）
  if (drawn.code === "4z") return true;

  // カン：今の手牌+ツモで4枚そろった
  const quadCode = findQuadTargetCode();
  if (quadCode){
    // ★重要：リーチ中は「実際に暗槓できるときだけ止まる」
    // （待ち不変 + おくりカン禁止を満たさない4枚では止まらない＝自動ツモ切り継続）
    if (isRiichi){
      if (typeof canRiichiAnkanNow === "function"){
        return !!canRiichiAnkanNow(quadCode);
      }
      // 判定関数が無いなら安全側で止めない（自動ツモ切りで進める）
      return false;
    }
    // リーチ前なら従来通り止まる
    return true;
  }

  return false;
}

function scheduleRiichiAuto(){
  stopRiichiAuto();
  if (isEnded || !isRiichi) return;

  // ★ ターン制：自分の番でしか自動処理しない（CPUターン中に走ると詰む）
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return;

  // ★ すでにアガリなら「自動ツモしない」
  //   → ツモボタンを押せる状態にして、通常のツモと同じ流れにする
  //   （isEnded は立てない / overlay へ自動遷移しない）
  if (isAgariNow()){
    riichiWait = false;
    render();
    return;
  }

  // ツモが無いならツモる（ここで「止まる」判定ができるように）
  if (!drawn){
    drawn = drawOne();

    // ★ 山枯れの安全側（本来は「最後の捨て」で流局だが、ここで詰むのを避ける）
    if (!drawn){
      if (typeof endByExhaustionRyukyoku === "function"){
        endByExhaustionRyukyoku();
      } else {
        isEnded = true;
        render();
        openRyukyoku();
      }
      return;
    }

    render();
  }

  // ★ ツモ直後にアガリでも「自動ツモしない」
  //   → ツモボタンを押せる状態にして待つ
  if (isAgariNow()){
    riichiWait = false;
    render();
    return;
  }

  // ★ ここが今回の本体：ペー/（可能なら）カンが可能なら止める
  if (shouldPauseForSpecialAfterRiichiDraw()){
    riichiWait = true;
    render();
    return;
  }

  // 止まらないなら一定時間後に自動ツモ切り
  riichiWait = false;
  riichiAutoTimer = setTimeout(()=>{
    if (isEnded || !isRiichi) return;
    if (riichiWait) return;

    // ★ ターンがズレてたら、次に自分の番が来たときにやり直す
    if (typeof isPlayerTurn === "function" && !isPlayerTurn()){
      riichiAutoTimer = setTimeout(()=>scheduleRiichiAuto(), 80);
      return;
    }

    if (!drawn){
      drawn = drawOne();

      if (!drawn){
        if (typeof endByExhaustionRyukyoku === "function"){
          endByExhaustionRyukyoku();
        } else {
          isEnded = true;
          render();
          openRyukyoku();
        }
        return;
      }

      render();
    }

    if (isAgariNow()){
      // ★ 自動ツモしない：ツモボタンへ委譲
      riichiWait = false;
      render();
      return;
    }

    discardDrawn(true);
  }, 260);
}

// =========================================================
// ★ リーチボタン入口（UIから呼ばれる）
// =========================================================
function doRiichi(){
  if (isEnded) return;
  if (isRiichi) return;
  if (isRiichiSelecting) return;

  // ★ ポン後の「切るまで」中はリーチ不可
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return;

  startRiichiSelection();
}

bindRiichiCancelButton();
