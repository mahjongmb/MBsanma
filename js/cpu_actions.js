// MBsanma/js/cpu_actions.js
// ========= cpu_actions.js（CPU特殊行動） =========

const CPU_ANKAN_POLICY = {
  sameShantenImproveKeepRate: 0.7,
  sameShantenMaxImproveLoss: 3,
  allowImproveGainOnlyWhenWorseRate: false
};

function tryCpuPeiSequence(seatIndex){
  try{
    if (isEnded) return false;
    if (typeof isCpuSeat === "function" && !isCpuSeat(seatIndex)) return false;

    const hand13Ref = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    const peiRef = (typeof getCpuPeiRefBySeat === "function") ? getCpuPeiRefBySeat(seatIndex) : null;

    if (!Array.isArray(hand13Ref) || !Array.isArray(peiRef)) return false;

    let acted = false;

    while (!isEnded){
      let drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;

      if (drawnTile && drawnTile.code === "4z"){
        if (!acted && typeof clearNewFlags === "function") clearNewFlags();

        peiRef.push(drawnTile);
        try{
          if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
            window.MBSanmaMatchLog.pushEvent("pei", {
              seatIndex,
              tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawnTile) : { code: drawnTile.code, imgCode: drawnTile.imgCode || drawnTile.code }
            });
          }
        }catch(e){}
        acted = true;

        const add = (typeof drawFromDeadWallForPei === "function") ? drawFromDeadWallForPei() : null;
        if (add) add.isNew = true;

        if (add){
          try{
            if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
              window.MBSanmaMatchLog.pushEvent("draw", {
                seatIndex,
                tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(add) : { code: add.code, imgCode: add.imgCode || add.code },
                source: "deadwall_pei"
              });
            }
          }catch(e){}
        }
        if (typeof setCpuDrawnTileBySeat === "function") setCpuDrawnTileBySeat(seatIndex, add || null);
        continue;
      }

      const idx = hand13Ref.findIndex((t)=> t && t.code === "4z");
      if (idx < 0) break;

      if (!acted && typeof clearNewFlags === "function") clearNewFlags();

      const north = hand13Ref.splice(idx, 1)[0];
      if (north) peiRef.push(north);
      try{
        if (north && typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
          window.MBSanmaMatchLog.pushEvent("pei", {
            seatIndex,
            tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(north) : { code: north.code, imgCode: north.imgCode || north.code }
          });
        }
      }catch(e){}
      acted = true;

      const add = (typeof drawFromDeadWallForPei === "function") ? drawFromDeadWallForPei() : null;
      if (add){
        add.isNew = true;
        hand13Ref.push(add);
        try{
          if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
            window.MBSanmaMatchLog.pushEvent("draw", {
              seatIndex,
              tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(add) : { code: add.code, imgCode: add.imgCode || add.code },
              source: "deadwall_pei"
            });
          }
        }catch(e){}
      }

      const sorted = (typeof sortHand === "function") ? sortHand(hand13Ref.slice()) : hand13Ref.slice();
      hand13Ref.length = 0;
      hand13Ref.push(...sorted);
    }

    return acted;
  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "tryCpuPeiSequence()");
    return false;
  }
}

function collectCpuAnkanCandidateCodes(seatIndex){
  try{
    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    const drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;
    if (!Array.isArray(handRef)) return [];

    const pool = handRef.slice();
    if (drawnTile) pool.push(drawnTile);
    if (pool.length <= 0) return [];

    const map = new Map();
    for (const t of pool){
      if (!t || !t.code) continue;
      map.set(t.code, (map.get(t.code) || 0) + 1);
    }

    const out = [];
    for (const [code, count] of map.entries()){
      if (count >= 4) out.push(code);
    }

    return out.sort();
  }catch(e){
    return [];
  }
}

function buildCpuAnkanRemainTiles(seatIndex, code){
  const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
  const drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;
  if (!Array.isArray(handRef) || !code) return null;

  const pool = handRef.slice();
  if (drawnTile) pool.push(drawnTile);

  let picked = 0;
  const remain = [];
  for (const t of pool){
    if (t && t.code === code && picked < 4){
      picked++;
    }else{
      remain.push(t);
    }
  }

  if (picked < 4) return null;
  return remain;
}

function canCpuRiichiAnkanNow(seatIndex, ankanCode){
  try{
    if (!ankanCode) return false;
    if (typeof isCpuRiichiSeat !== "function" || !isCpuRiichiSeat(seatIndex)) return true;

    const drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;
    if (!drawnTile || drawnTile.code !== ankanCode) return false;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    if (!Array.isArray(handRef)) return false;

    const fixedM = (typeof getCpuFixedMeldCountBySeat === "function")
      ? getCpuFixedMeldCountBySeat(seatIndex)
      : 0;

    if (typeof _calcWaitCodesFromTiles !== "function") return false;

    const beforeWait = _calcWaitCodesFromTiles(handRef, fixedM);
    if (!Array.isArray(beforeWait) || beforeWait.length <= 0) return false;

    const remain = buildCpuAnkanRemainTiles(seatIndex, ankanCode);
    if (!Array.isArray(remain)) return false;

    const afterWait = _calcWaitCodesFromTiles(remain, fixedM + 1);
    if (!Array.isArray(afterWait) || afterWait.length <= 0) return false;

    if (typeof _setEqualsArray === "function"){
      return _setEqualsArray(beforeWait, afterWait);
    }

    if (beforeWait.length !== afterWait.length) return false;
    for (let i = 0; i < beforeWait.length; i++){
      if (beforeWait[i] !== afterWait[i]) return false;
    }
    return true;
  }catch(e){
    return false;
  }
}

function buildCpuAnkanEval(seatIndex, code){
  try{
    if (!code) return null;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    const drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;
    if (!Array.isArray(handRef) || !drawnTile) return null;

    const fixedM = (typeof getCpuFixedMeldCountBySeat === "function")
      ? getCpuFixedMeldCountBySeat(seatIndex)
      : 0;

    const beforeBest = (typeof chooseCpuDiscardInfo === "function")
      ? chooseCpuDiscardInfo(seatIndex, handRef, drawnTile)
      : null;
    if (!beforeBest) return null;

    const remain = buildCpuAnkanRemainTiles(seatIndex, code);
    if (!Array.isArray(remain)) return null;

    const countsAfter = (typeof countsFromTiles === "function") ? countsFromTiles(remain) : null;
    if (!Array.isArray(countsAfter)) return null;

    const afterFixedM = fixedM + 1;
    const afterShanten = (typeof calcShanten === "function") ? calcShanten(countsAfter, afterFixedM) : 99;

    let afterVisible = (typeof countVisibleForCpuSeat === "function")
      ? countVisibleForCpuSeat(seatIndex, remain)
      : null;
    if (Array.isArray(afterVisible) && typeof TYPE_TO_IDX === "object" && TYPE_TO_IDX){
      const idx = TYPE_TO_IDX[code];
      if (idx !== undefined){
        afterVisible[idx] = 4;
      }
    }

    const afterImprove = (Array.isArray(afterVisible) && typeof countCpuImproveTiles === "function")
      ? countCpuImproveTiles(seatIndex, countsAfter, afterVisible, afterFixedM)
      : 0;

    const beforeShanten = Number.isFinite(beforeBest.shantenAfter) ? beforeBest.shantenAfter : 99;
    const beforeImprove = Number.isFinite(beforeBest.improveCount) ? beforeBest.improveCount : 0;
    const keepRate = beforeImprove > 0 ? (afterImprove / beforeImprove) : 1;
    const improveLoss = beforeImprove - afterImprove;
    const isRiichiSeat = (typeof isCpuRiichiSeat === "function") ? isCpuRiichiSeat(seatIndex) : false;
    const riichiLegal = !isRiichiSeat || canCpuRiichiAnkanNow(seatIndex, code);

    let shouldKan = false;
    let reason = "reject";

    if (isRiichiSeat){
      shouldKan = !!riichiLegal;
      reason = shouldKan ? "riichi_wait_same" : "riichi_illegal";
    }else if (afterShanten < beforeShanten){
      shouldKan = true;
      reason = "shanten_down";
    }else if (afterShanten > beforeShanten){
      shouldKan = false;
      reason = "shanten_up";
    }else if (afterImprove >= beforeImprove){
      shouldKan = true;
      reason = "same_shanten_better_or_equal_improve";
    }else if (
      improveLoss <= CPU_ANKAN_POLICY.sameShantenMaxImproveLoss
      || keepRate >= CPU_ANKAN_POLICY.sameShantenImproveKeepRate
    ){
      shouldKan = true;
      reason = "same_shanten_small_improve_loss";
    }else if (CPU_ANKAN_POLICY.allowImproveGainOnlyWhenWorseRate && afterImprove > 0){
      shouldKan = true;
      reason = "same_shanten_positive_improve_left";
    }

    return {
      seatIndex,
      code,
      beforeShanten,
      beforeImprove,
      afterShanten,
      afterImprove,
      improveLoss,
      keepRate,
      isRiichiSeat,
      riichiLegal,
      shouldKan,
      reason,
      remain
    };
  }catch(e){
    return null;
  }
}

function chooseCpuAnkanDecision(seatIndex){
  try{
    const candidates = collectCpuAnkanCandidateCodes(seatIndex);
    if (!Array.isArray(candidates) || candidates.length <= 0) return null;

    let best = null;
    for (const code of candidates){
      const info = buildCpuAnkanEval(seatIndex, code);
      if (!info || !info.shouldKan) continue;

      if (!best){
        best = info;
        continue;
      }

      if (info.afterShanten < best.afterShanten){
        best = info;
        continue;
      }
      if (info.afterShanten > best.afterShanten) continue;

      if (info.afterImprove > best.afterImprove){
        best = info;
        continue;
      }
      if (info.afterImprove < best.afterImprove) continue;

      if (info.keepRate > best.keepRate){
        best = info;
        continue;
      }
      if (info.keepRate < best.keepRate) continue;

      if (info.code > best.code){
        best = info;
      }
    }

    return best;
  }catch(e){
    return null;
  }
}

function executeCpuAnkan(seatIndex, code){
  try{
    if (!code) return false;
    if (isEnded) return false;
    if (typeof isCpuSeat === "function" && !isCpuSeat(seatIndex)) return false;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    const meldRef = (typeof getCpuMeldRefBySeat === "function") ? getCpuMeldRefBySeat(seatIndex) : null;
    const drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;

    if (!Array.isArray(handRef) || !Array.isArray(meldRef) || !drawnTile) return false;

    const remain = buildCpuAnkanRemainTiles(seatIndex, code);
    if (!Array.isArray(remain)) return false;

    try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}
    try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}
    try{ if (typeof clearNewFlags === "function") clearNewFlags(); }catch(e){}

    meldRef.push({ type: "ankan", code });
    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("ankan", {
          seatIndex,
          code
        });
      }
    }catch(e){}
    try{ if (typeof markOpenCallOrKanThisKyoku === "function") markOpenCallOrKanThisKyoku(); }catch(e){}
    try{ if (typeof openKanEffect === "function") openKanEffect(seatIndex); }catch(e){}

    const nextHand = (typeof sortHand === "function") ? sortHand(remain.slice()) : remain.slice();
    handRef.length = 0;
    handRef.push(...nextHand);

    if (typeof clearCpuDrawnTileBySeat === "function"){
      clearCpuDrawnTileBySeat(seatIndex);
    }

    if (typeof addKanDora === "function"){
      addKanDora();
    }else if (typeof pushNextKanDoraIndicatorsFromDeadWall === "function"){
      pushNextKanDoraIndicatorsFromDeadWall();
    }

    let rinshanTile = null;
    if (typeof drawFromDeadWallForKan === "function"){
      rinshanTile = drawFromDeadWallForKan();
    }

    if (rinshanTile){
      rinshanTile.isNew = true;
      try{ if (typeof markCurrentWinContextRinshan === "function") markCurrentWinContextRinshan(); }catch(e){}
    }

    if (rinshanTile){
      try{
        if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
          window.MBSanmaMatchLog.pushEvent("draw", {
            seatIndex,
            tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(rinshanTile) : { code: rinshanTile.code, imgCode: rinshanTile.imgCode || rinshanTile.code },
            source: "deadwall_kan"
          });
        }
      }catch(e){}
    }
    if (typeof setCpuDrawnTileBySeat === "function"){
      setCpuDrawnTileBySeat(seatIndex, rinshanTile || null);
    }

    currentTurnSeatIndex = seatIndex;
    turnPhase = "DISCARD";
    hoveredTileId = null;

    if (typeof render === "function") render();
    return true;
  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "executeCpuAnkan()");
    return false;
  }
}

function tryCpuAnkanSequence(seatIndex){
  try{
    if (isEnded) return false;
    if (turnPhase !== "DISCARD") return false;
    if (typeof isCpuSeat === "function" && !isCpuSeat(seatIndex)) return false;

    let acted = false;
    let guard = 0;

    while (!isEnded && guard < 4){
      guard++;

      const decision = chooseCpuAnkanDecision(seatIndex);
      if (!decision || !decision.code || !decision.shouldKan) break;

      const ok = executeCpuAnkan(seatIndex, decision.code);
      if (!ok) break;
      acted = true;

      const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
      const drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;
      if (!Array.isArray(handRef) || !drawnTile) break;

      const tiles14 = handRef.slice();
      tiles14.push(drawnTile);

      if (typeof canCpuTsumoWithTiles === "function" && canCpuTsumoWithTiles(seatIndex, tiles14)){
        if (typeof finishCpuTsumo === "function"){
          finishCpuTsumo(seatIndex);
        }
        return true;
      }
    }

    return acted;
  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "tryCpuAnkanSequence()");
    return false;
  }
}
