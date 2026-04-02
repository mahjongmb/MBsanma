// MBsanma/js/render.js
// ========= render.js（描画/UIの司令塔） =========
// ※ render.js は描画専用（状態変更はしない）

function isAgariNow(){
  const fixedM = melds.length;
  const tiles14 = hand13.slice();
  if (drawn) tiles14.push(drawn);
  return calcShanten(countsFromTiles(tiles14), fixedM) === -1;
}

function canTsumoAgariNow(){
  if (isEnded) return false;
  if (!drawn) return false;
  if (!isAgariNow()) return false;

  if (typeof getCurrentPlayerAgariYakuInfo !== "function") return true;

  try{
    const info = getCurrentPlayerAgariYakuInfo("tsumo");
    if (!info || !info.isAgari) return false;
    if ((info.yakuman | 0) > 0) return true;
    return (info.han | 0) > 0;
  }catch(e){
    return false;
  }
}

function isTenpaiNow14(){
  const fixedM = melds.length;
  const tiles14 = hand13.slice();
  if (drawn) tiles14.push(drawn);
  const sh = calcShanten(countsFromTiles(tiles14), fixedM);
  // ★ ツモって和了形(-1)でも「テンパイ以上」として扱う（受けを広げるリーチを許可するため）
  return sh === 0 || sh === -1;
}

function hasRiichiDiscardCandidateNow(){
  // 「今の14枚（hand13+drawn）」から1枚切ってテンパイ(0)を維持できる捨て牌があるか
  // ※ アガリ(-1)でも、捨ててテンパイ維持できるならリーチ可能
  const fixedM = melds.length;

  // hand13 のどれかを切る
  for (const t of hand13){
    const after13 = hand13.filter(x => x.id !== t.id);
    if (drawn) after13.push(drawn);
    const sh = calcShanten(countsFromTiles(after13), fixedM);
    if (sh === 0) return true;
  }

  // drawn を切る
  if (drawn){
    const sh = calcShanten(countsFromTiles(hand13), fixedM);
    if (sh === 0) return true;
  }

  return false;
}

function findKakanTargetCode(){
  if (!Array.isArray(melds)) return null;

  const pool = hand13.slice();
  if (drawn) pool.push(drawn);

  for (const m of melds){
    if (!m || m.type !== "pon") continue;
    const code = m.code;
    if (!code) continue;
    if (pool.some(t => t.code === code)) return code;
  }
  return null;
}

// ★ リーチを塞ぐ「開いた副露」があるか
// - 暗槓だけならリーチ可
// - pon / minkan / kakan などが1つでもあればリーチ不可
function hasRiichiBlockingOpenMeld(){
  if (!Array.isArray(melds) || melds.length === 0) return false;

  for (const m of melds){
    if (!m) continue;
    if (m.type !== "ankan") return true;
  }

  return false;
}

function getActionbarEl(){
  return document.querySelector(".actionbar");
}

function getRiichiCancelBtnEl(){
  return document.getElementById("riichiCancelBtn");
}

function setActionButtonState(btn, visible, enabled){
  if (!btn) return;

  const isVisible = !!visible;
  const isEnabled = !!enabled && isVisible;

  btn.style.display = isVisible ? "inline-flex" : "none";
  btn.disabled = !isEnabled;
  btn.classList.toggle("isShown", isVisible);
  btn.classList.toggle("enabled", isEnabled);
  btn.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function refreshActionbarVisibility(){
  const actionbarEl = getActionbarEl();
  if (!actionbarEl) return;

  const hasVisibleButton = !!actionbarEl.querySelector(".actionBtn.isShown");
  actionbarEl.classList.toggle("isVisible", hasVisibleButton);
  actionbarEl.classList.toggle("actionbarHidden", !hasVisibleButton);
  actionbarEl.setAttribute("aria-hidden", hasVisibleButton ? "false" : "true");
}

function hideAllActionButtons(){
  const riichiCancelBtn = getRiichiCancelBtnEl();

  setActionButtonState(peiBtn, false, false);
  setActionButtonState(ponBtn, false, false);
  setActionButtonState(kanBtn, false, false);
  setActionButtonState(passBtn, false, false);
  setActionButtonState(riichiBtn, false, false);
  setActionButtonState(riichiCancelBtn, false, false);
  setActionButtonState(ronBtn, false, false);
  setActionButtonState(tsumoBtn, false, false);
  refreshActionbarVisibility();
}

function disableActionButtonsImmediately(){
  hideAllActionButtons();
}

let queuedDiscardFrameId = null;

function queueDiscardAfterImmediateButtonOff(discardFn){
  // ★ 自分の打牌AI中は手牌クリックを無効化する
  if (typeof isPlayerDiscardAiEnabled === "function" && isPlayerDiscardAiEnabled()) return;

  // ★ 鳴き待機中は手牌クリックを無効化する
  //   ポン/ロン/明槓/スキップの選択が出ている最中に discard 系へ入ると、
  //   ターン状態と pendingCall が食い違って進行不能になることがある。
  if (typeof pendingCall !== "undefined" && pendingCall) return;

  disableActionButtonsImmediately();

  try{
    if (document && document.activeElement && typeof document.activeElement.blur === "function"){
      document.activeElement.blur();
    }
  }catch(e){}

  if (queuedDiscardFrameId !== null) return;

  const runner = ()=>{
    queuedDiscardFrameId = null;

    // ★ requestAnimationFrame 待ちのあいだに鳴き待機へ入った場合も安全側で中断
    if (typeof pendingCall !== "undefined" && pendingCall) return;

    discardFn();
  };

  if (typeof requestAnimationFrame === "function"){
    queuedDiscardFrameId = requestAnimationFrame(runner);
  } else {
    queuedDiscardFrameId = setTimeout(runner, 0);
  }
}

function updateActionButtons(){
  const riichiCancelBtn = getRiichiCancelBtnEl();
  const inCall = (typeof pendingCall !== "undefined" && !!pendingCall);
  const canPon = inCall ? !!pendingCall.canPon : false;
  const canRon = inCall ? !!pendingCall.canRon : false;
  const canMinkan = inCall ? !!pendingCall.canMinkan : false;

  // 鳴き応答中：押せるものだけ1行で出す
  if (inCall){
    const callAiControlling = !!(pendingCall && pendingCall.aiControlled);

    setActionButtonState(ronBtn, !callAiControlling && canRon, !callAiControlling && canRon);
    setActionButtonState(ponBtn, !callAiControlling && canPon, !callAiControlling && canPon);
    setActionButtonState(kanBtn, !callAiControlling && canMinkan, !callAiControlling && canMinkan);
    setActionButtonState(passBtn, !callAiControlling, !callAiControlling);

    setActionButtonState(peiBtn, false, false);
    setActionButtonState(riichiBtn, false, false);
    setActionButtonState(riichiCancelBtn, false, false);
    setActionButtonState(tsumoBtn, false, false);

    refreshActionbarVisibility();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  // ★ リーチ選択中はキャンセルだけ出す
  if (isRiichiSelecting){
    setActionButtonState(riichiCancelBtn, true, true);
    setActionButtonState(peiBtn, false, false);
    setActionButtonState(ponBtn, false, false);
    setActionButtonState(kanBtn, false, false);
    setActionButtonState(passBtn, false, false);
    setActionButtonState(riichiBtn, false, false);
    setActionButtonState(ronBtn, false, false);
    setActionButtonState(tsumoBtn, false, false);

    refreshActionbarVisibility();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  // ★ 自分のターン以外は全部隠す
  const isMyTurn = (typeof isPlayerTurn === "function") && isPlayerTurn();
  if (!isMyTurn){
    hideAllActionButtons();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  // ★ ポン後の「ツモ無し打牌待ち」中は、切る以外のボタンを出さない
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall){
    hideAllActionButtons();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  const canTsumo = canTsumoAgariNow();

  // ★ 暗槓だけならリーチ可
  const hasOpenMeld = hasRiichiBlockingOpenMeld();

  // ★ アガリ形(-1)でも「捨ててテンパイ維持できる」ならリーチボタンを押せる
  const canRiichi =
    (!isEnded &&
     !isRiichi &&
     !isRiichiSelecting &&
     !hasOpenMeld &&
     hasRiichiDiscardCandidateNow());

  kanTargetCode = findQuadTargetCode();

  const allowSpecial =
    (!isEnded) &&
    (
      (!isRiichi && !isRiichiSelecting) ||
      (isRiichi && riichiWait)
    );

  const kakanTargetCode = findKakanTargetCode();

  // =========================================================
  // ★ カン可否
  // - 通常：暗槓 or 加槓 があればOK
  // - リーチ中：
  //    ・riichiWait のときのみ候補
  //    ・暗槓は「待ち不変 + おくりカン禁止（drawnが4枚目）」のみOK
  //    ・加槓は不可（そもそもリーチ後は鳴けない前提）
  // =========================================================
  let canKan = false;
  if (allowSpecial){
    // 加槓（リーチ中は不可）
    if (!isRiichi && !!kakanTargetCode){
      canKan = true;
    }

    // 暗槓
    if (!canKan && !!kanTargetCode){
      if (isRiichi){
        if (typeof canRiichiAnkanNow === "function"){
          canKan = !!canRiichiAnkanNow(kanTargetCode);
        } else {
          canKan = false;
        }
      } else {
        canKan = true;
      }
    }
  }

  const canPei = allowSpecial && hasNorthInHand();
  const specialAiControlling = (typeof isPlayerSpecialAiEnabled === "function") && isPlayerSpecialAiEnabled();

  setActionButtonState(tsumoBtn, !specialAiControlling && canTsumo, !specialAiControlling && canTsumo);
  setActionButtonState(riichiBtn, !specialAiControlling && canRiichi, !specialAiControlling && canRiichi);
  setActionButtonState(riichiCancelBtn, false, false);
  setActionButtonState(kanBtn, canKan, canKan);
  setActionButtonState(peiBtn, !specialAiControlling && canPei, !specialAiControlling && canPei);

  setActionButtonState(ronBtn, false, false);
  setActionButtonState(ponBtn, false, false);
  setActionButtonState(passBtn, false, false);

  refreshActionbarVisibility();

  if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
  if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
}

// ========= 手牌描画 =========
function renderHand(){
  if (!handEl) return;

  handEl.innerHTML = "";

  // ==================================================
  // ★ 旧方式へ復元（あなたが貼った昔のrenderの方式）
  //
  // ・基準中心は hand13（drawn除外）の枚数で固定
  // ・row の margin-left を calc(50% - 中心px) にして、
  //   drawn が来ても「13枚の中心」が動かないようにする
  // ・newTile / blink を isNew で付ける（ハイライト復活）
  // ==================================================

  // handEl 自体は flex 中央寄せ等のCSSがあっても、
  // 旧方式は handEl の中に row を1個置く運用なので、
  // 念のため左詰めにして row の margin-left が効くように寄せる。
  handEl.style.justifyContent = "flex-start";
  handEl.style.paddingRight = "0px";

  // 中央基準（drawn除外）
  const baseCount = Array.isArray(hand13) ? hand13.length : 0;

  // タイル幅を“できる範囲で”動的に取る（取れなければ昔の54）
  // ※ CSSで img の width が固定されていれば offsetWidth で取れる
  let TILE_W = 54;
  try{
    if (hand13 && hand13.length > 0){
      const tmp = makeTileImg(hand13[0]);
      tmp.style.visibility = "hidden";
      tmp.style.position = "absolute";
      tmp.style.left = "-9999px";
      tmp.style.top = "-9999px";
      handEl.appendChild(tmp);
      const w = tmp.offsetWidth;
      tmp.remove();
      if (w && w > 0) TILE_W = w;
    }
  }catch(e){}

  const GAP = 2;
  const unit = TILE_W + GAP;

  // 昔の計算を踏襲
  const leftCount = (baseCount % 2 === 1) ? Math.floor((baseCount - 1) / 2) : (baseCount / 2);
  const centerInRow = (baseCount % 2 === 1)
    ? (leftCount * unit + TILE_W / 2)
    : (leftCount * unit - GAP / 2);

  const row = document.createElement("div");
  row.className = "handRow";
  row.style.display = "flex";
  row.style.gap = `${GAP}px`;
  row.style.alignItems = "center";
  row.style.flexWrap = "nowrap";

  // ★ 中央基準は baseCount（drawn除外）で固定
  row.style.marginLeft = `calc(50% - ${centerInRow}px)`;

  // 13枚
  for (let i = 0; i < hand13.length; i++){
    const t = hand13[i];
    const img = makeTileImg(t);

    // 旧方式：isNew で点滅（800msでblink解除）
    if (t && t.isNew){
      img.classList.add("newTile", "blink");
      setTimeout(()=>{ try{ img.classList.remove("blink"); }catch(e){} }, 800);
    }

    // hover状態（既存CSSに合わせる）
    if (t && t.id === hoveredTileId){
      img.classList.add("hoverTile");
    }

    // リーチ選択中の候補ハイライト
    if (isRiichiSelecting && riichiCandidates && t){
      const key = "H:" + t.id;
      if (riichiCandidates.has(key)) img.classList.add("riichiPick");
      else img.classList.add("riichiDim");
    }

    // hover（受け入れ表示更新）
    img.addEventListener("mouseenter", ()=>{
      hoveredTileId = t.id;
      if (typeof updateStatsByHover === "function") updateStatsByHover(t.id, false);
    });
    img.addEventListener("mouseleave", ()=>{
      hoveredTileId = null;
      if (typeof updateStatsDefault === "function") updateStatsDefault();
    });

    // click（打牌）
    img.addEventListener("click", ()=>{
      queueDiscardAfterImmediateButtonOff(()=>{
        discardFromHand13(i);
      });
    });

    row.appendChild(img);
  }

  // ツモ牌（右端に付け足す：中央基準は動かさない）
  if (drawn){
    const img = makeTileImg(drawn);
    img.classList.add("drawnTile");

    if (drawn.isNew){
      img.classList.add("newTile", "blink");
      setTimeout(()=>{ try{ img.classList.remove("blink"); }catch(e){} }, 800);
    }

    if (drawn.id === hoveredTileId){
      img.classList.add("hoverTile");
    }

    if (isRiichiSelecting && riichiCandidates){
      const key = "D:" + drawn.id;
      if (riichiCandidates.has(key)) img.classList.add("riichiPick");
      else img.classList.add("riichiDim");
    }

    img.addEventListener("mouseenter", ()=>{
      hoveredTileId = drawn.id;
      if (typeof updateStatsByHover === "function") updateStatsByHover(drawn.id, true);
    });
    img.addEventListener("mouseleave", ()=>{
      hoveredTileId = null;
      if (typeof updateStatsDefault === "function") updateStatsDefault();
    });

    img.addEventListener("click", ()=>{
      queueDiscardAfterImmediateButtonOff(()=>{
        discardDrawn();
      });
    });

    row.appendChild(img);
  }

  handEl.appendChild(row);
}

// ========= 河描画 =========
function renderRiver(){
  if (!riverEl) return;

  riverEl.innerHTML = "";

  const declareId =
    (typeof getPlayerRiichiDisplayTileId === "function")
      ? getPlayerRiichiDisplayTileId()
      : null;

  for (const t of river){
    const img = makeTileImg(t);
    if (t && t.id === declareId){
      img.classList.add("riichiDeclare");
    }
    riverEl.appendChild(img);
  }
}

// ========= 全体描画 =========
function render(){
  try{
    renderHand();
    renderRiver();

    // 右エリア（副露/北）
    if (typeof renderRight === "function") renderRight();
    else {
      if (typeof renderPeis === "function") renderPeis();
      if (typeof renderMelds === "function") renderMelds();
    }

    // CPU
    if (typeof renderCpu === "function") renderCpu();
    else {
      if (typeof renderCpuHands === "function") renderCpuHands();
      if (typeof renderCpuRivers === "function") renderCpuRivers();
    }

    // 中央UI（DOM確保→更新）
    if (typeof ensureCenterUi === "function") ensureCenterUi();
    if (typeof renderCenterUi === "function") renderCenterUi();

    // ★ stats はデフォルト表示（ホバー時は内容を切り替える）
    if (typeof updateStatsDefault === "function") updateStatsDefault();

    // アクションボタン
    updateActionButtons();

  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "render()");
  }
}
