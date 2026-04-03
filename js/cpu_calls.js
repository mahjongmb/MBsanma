// MBsanma/js/cpu_calls.js
// ========= cpu_calls.js（CPU副露実行） =========

function getRelativeFromForCallerSeat(callerSeatIndex, discarderSeatIndex){
  if (callerSeatIndex !== 0 && callerSeatIndex !== 1 && callerSeatIndex !== 2) return "R";
  if (discarderSeatIndex !== 0 && discarderSeatIndex !== 1 && discarderSeatIndex !== 2) return "R";
  return (discarderSeatIndex === ((callerSeatIndex + 1) % 3)) ? "R" : "L";
}

function getCpuCallCandidateSeats(discarderSeatIndex){
  const out = [];
  let seat = (discarderSeatIndex + 1) % 3;
  for (let i = 0; i < 3; i++){
    if (seat !== discarderSeatIndex && (seat === 1 || seat === 2) && !out.includes(seat)){
      out.push(seat);
    }
    seat = (seat + 1) % 3;
  }
  return out;
}

function getDiscardRiverRefBySeat(seatIndex){
  if (seatIndex === 0) return river;
  if (seatIndex === 1) return cpuRightRiver;
  if (seatIndex === 2) return cpuLeftRiver;
  return null;
}

function getCpuCallSeatWind(seatIndex){
  if (typeof getSeatWindBySeatIndexForCpu === "function"){
    return getSeatWindBySeatIndexForCpu(seatIndex);
  }
  return null;
}

function getCpuForbiddenCallDiscardCode(seatIndex){
  if (typeof turnPhase === "undefined" || turnPhase !== "CALL_DISCARD") return null;
  if (typeof currentTurnSeatIndex === "undefined" || currentTurnSeatIndex !== seatIndex) return null;
  if (typeof getCpuMeldRefBySeat !== "function") return null;

  const meldRef = getCpuMeldRefBySeat(seatIndex);
  if (!Array.isArray(meldRef) || meldRef.length <= 0) return null;

  const lastMeld = meldRef[meldRef.length - 1];
  if (!lastMeld || lastMeld.type !== "pon" || !lastMeld.code) return null;
  return lastMeld.code;
}


function getCpuSeatScore(seatIndex){
  if (!Array.isArray(scores)) return 0;
  return Number(scores[seatIndex]) || 0;
}

function isYakuhaiCodeForSeat(code, seatIndex){
  if (!code) return false;
  if (code === "5z" || code === "6z" || code === "7z") return true;

  const seatWind = getCpuCallSeatWind(seatIndex);
  if (seatWind === "東" && code === "1z") return true;
  if (seatWind === "南" && code === "2z") return true;
  if (seatWind === "西" && code === "3z") return true;

  if (roundWind === "東" && code === "1z") return true;
  if (roundWind === "南" && code === "2z") return true;
  if (roundWind === "西" && code === "3z") return true;

  return false;
}

function countTenpaiWaitTypeCount(tiles, fixedMeldCount){
  if (!Array.isArray(tiles) || typeof calcShanten !== "function") return 0;

  const baseCounts = countsFromTiles(tiles);
  if (calcShanten(baseCounts, fixedMeldCount) !== 0) return 0;

  let waitTypeCount = 0;

  for (let i = 0; i < TILE_TYPES.length; i++){
    if ((baseCounts[i] | 0) >= 4) continue;

    const next = baseCounts.slice();
    next[i]++;

    if (calcShanten(next, fixedMeldCount) === -1){
      waitTypeCount++;
    }
  }

  return waitTypeCount;
}

function chooseCpuCallDiscardInfo(seatIndex, concealedTiles, fixedMeldCountOverride = null, options = null){
  if (!Array.isArray(concealedTiles) || concealedTiles.length <= 0) return null;

  const fixedMeldCount = (fixedMeldCountOverride != null)
    ? fixedMeldCountOverride
    : ((typeof getCpuFixedMeldCountBySeat === "function")
        ? getCpuFixedMeldCountBySeat(seatIndex)
        : 0);

  const forbiddenDiscardCode = (options && typeof options.forbiddenDiscardCode === "string" && options.forbiddenDiscardCode)
    ? options.forbiddenDiscardCode
    : null;

  let best = null;

  for (let i = 0; i < concealedTiles.length; i++){
    const discardTile = concealedTiles[i];
    if (!discardTile || !discardTile.code) continue;
    if (forbiddenDiscardCode && discardTile.code === forbiddenDiscardCode) continue;

    const afterTiles = concealedTiles.slice();
    afterTiles.splice(i, 1);

    const counts = countsFromTiles(afterTiles);
    const shantenAfter = calcShanten(counts, fixedMeldCount);
    const visibleCounts = countVisibleForCpuSeat(seatIndex, afterTiles);
    const improveCount = (typeof countCpuImproveTiles === "function")
      ? countCpuImproveTiles(seatIndex, counts, visibleCounts, fixedMeldCount)
      : 0;

    const info = {
      discardTile,
      discardIndex: i,
      afterTiles,
      shantenAfter,
      improveCount,
      forbiddenDiscardCode
    };

    if (!best){
      best = info;
      continue;
    }

    if (info.shantenAfter < best.shantenAfter){
      best = info;
      continue;
    }
    if (info.shantenAfter > best.shantenAfter){
      continue;
    }

    if (info.improveCount > best.improveCount){
      best = info;
      continue;
    }
    if (info.improveCount < best.improveCount){
      continue;
    }

    const bestCode = best.discardTile && best.discardTile.code ? best.discardTile.code : "";
    const thisCode = info.discardTile && info.discardTile.code ? info.discardTile.code : "";
    if (thisCode > bestCode){
      best = info;
    }
  }

  return best;
}

function canCpuOpenCallByPolicy(seatIndex, discardedTile, discarderSeatIndex, removeCount, policy){
  try{
    if (isEnded) return false;
    if (!discardedTile || !discardedTile.code) return false;
    if (seatIndex !== 1 && seatIndex !== 2) return false;
    if (discarderSeatIndex === seatIndex) return false;
    if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)) return false;
    if (!policy || !policy.enabled) return false;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    if (!Array.isArray(handRef)) return false;

    const haveCount = handRef.filter((t)=> t && t.code === discardedTile.code).length;
    if (haveCount < removeCount) return false;

    if (policy.onlyYakuhai && !isYakuhaiCodeForSeat(discardedTile.code, seatIndex)){
      return false;
    }

    const fixedMeldCount = (typeof getCpuFixedMeldCountBySeat === "function")
      ? getCpuFixedMeldCountBySeat(seatIndex)
      : 0;

    const currentShanten = calcShanten(countsFromTiles(handRef), fixedMeldCount);

    const simulatedTiles = handRef.slice();
    let removed = 0;
    for (let i = simulatedTiles.length - 1; i >= 0 && removed < removeCount; i--){
      if (simulatedTiles[i] && simulatedTiles[i].code === discardedTile.code){
        simulatedTiles.splice(i, 1);
        removed++;
      }
    }
    if (removed < removeCount) return false;

    const simulatedFixedMeldCount = fixedMeldCount + 1;
    const bestDiscard = chooseCpuCallDiscardInfo(seatIndex, simulatedTiles, simulatedFixedMeldCount, {
      forbiddenDiscardCode: (removeCount === 2) ? discardedTile.code : null
    });
    if (!bestDiscard) return false;

    if (policy.requireShantenNonWorse && bestDiscard.shantenAfter > currentShanten){
      return false;
    }

    if (Number.isFinite(policy.maxShantenAfterCall) && bestDiscard.shantenAfter > policy.maxShantenAfterCall){
      return false;
    }

    if (Number.isFinite(policy.minImproveTilesAfterCall) && bestDiscard.improveCount < policy.minImproveTilesAfterCall){
      return false;
    }

    return true;
  }catch(e){
    return false;
  }
}

function canCpuPonOnDiscard(seatIndex, discardedTile, discarderSeatIndex){
  const policy = (typeof getCpuPonPolicy === "function") ? getCpuPonPolicy(seatIndex) : null;
  return canCpuOpenCallByPolicy(seatIndex, discardedTile, discarderSeatIndex, 2, policy);
}

function canCpuMinkanOnDiscard(seatIndex, discardedTile, discarderSeatIndex){
  const policy = (typeof getCpuMinkanPolicy === "function") ? getCpuMinkanPolicy(seatIndex) : null;

  try{
    if (isEnded) return false;
    if (!discardedTile || !discardedTile.code) return false;
    if (seatIndex !== 1 && seatIndex !== 2) return false;
    if (discarderSeatIndex === seatIndex) return false;
    if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)) return false;
    if (!policy || !policy.enabled) return false;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    if (!Array.isArray(handRef)) return false;

    const haveCount = handRef.filter((t)=> t && t.code === discardedTile.code).length;
    if (haveCount < 3) return false;

    if (policy.onlyYakuhai && !isYakuhaiCodeForSeat(discardedTile.code, seatIndex)){
      return false;
    }

    const fixedMeldCount = (typeof getCpuFixedMeldCountBySeat === "function")
      ? getCpuFixedMeldCountBySeat(seatIndex)
      : 0;

    const currentCounts = countsFromTiles(handRef);
    const currentShanten = calcShanten(currentCounts, fixedMeldCount);

    if (Number.isFinite(policy.maxScore) && getCpuSeatScore(seatIndex) > policy.maxScore){
      return false;
    }

    if (policy.requireExistingMeld && fixedMeldCount < 1){
      return false;
    }

    if (policy.requireTenpaiBeforeCall && currentShanten !== 0){
      return false;
    }

    if (Number.isFinite(policy.minWaitTypeCountBeforeCall)){
      const waitTypeCount = countTenpaiWaitTypeCount(handRef, fixedMeldCount);
      if (waitTypeCount < policy.minWaitTypeCountBeforeCall){
        return false;
      }
    }

    const simulatedTiles = handRef.slice();
    let removed = 0;
    for (let i = simulatedTiles.length - 1; i >= 0 && removed < 3; i--){
      if (simulatedTiles[i] && simulatedTiles[i].code === discardedTile.code){
        simulatedTiles.splice(i, 1);
        removed++;
      }
    }
    if (removed < 3) return false;

    const simulatedFixedMeldCount = fixedMeldCount + 1;
    const simulatedCounts = countsFromTiles(simulatedTiles);
    const shantenAfterKan = calcShanten(simulatedCounts, simulatedFixedMeldCount);
    const visibleCounts = countVisibleForCpuSeat(seatIndex, simulatedTiles);
    const improveCountAfterKan = (typeof countCpuImproveTiles === "function")
      ? countCpuImproveTiles(seatIndex, simulatedCounts, visibleCounts, simulatedFixedMeldCount)
      : 0;

    if (policy.requireTenpaiAfterCall && shantenAfterKan !== 0){
      return false;
    }

    if (policy.requireShantenNonWorse && shantenAfterKan > currentShanten){
      return false;
    }

    if (Number.isFinite(policy.maxShantenAfterCall) && shantenAfterKan > policy.maxShantenAfterCall){
      return false;
    }

    if (Number.isFinite(policy.minImproveTilesAfterCall) && improveCountAfterKan < policy.minImproveTilesAfterCall){
      return false;
    }

    return true;
  }catch(e){
    return false;
  }
}

function markRiichiDisplayTileCalledAwayForSeat(seatIndex, calledTile){
  if (!calledTile || calledTile.id == null) return;

  if (seatIndex === 0){
    if (typeof markPlayerRiichiDisplayTileCalledAway === "function"){
      markPlayerRiichiDisplayTileCalledAway(calledTile.id);
    }
    return;
  }

  if (typeof markCpuRiichiDisplayTileCalledAwayBySeat === "function"){
    markCpuRiichiDisplayTileCalledAwayBySeat(seatIndex, calledTile.id);
  }
}

function executeCpuMinkan(seatIndex, discarderSeatIndex, discardedTile){
  if (!discardedTile || !discardedTile.code) return false;

  const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
  const meldRef = (typeof getCpuMeldRefBySeat === "function") ? getCpuMeldRefBySeat(seatIndex) : null;
  const discardRiverRef = getDiscardRiverRefBySeat(discarderSeatIndex);

  if (!Array.isArray(handRef) || !Array.isArray(meldRef) || !Array.isArray(discardRiverRef)) return false;

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}
  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}
  try{ if (typeof clearNewFlags === "function") clearNewFlags(); }catch(e){}

  let calledTile = null;
  if (discardRiverRef.length > 0){
    calledTile = discardRiverRef.pop() || null;
  }
  if (!calledTile || !calledTile.code){
    calledTile = discardedTile;
  }

  markRiichiDisplayTileCalledAwayForSeat(discarderSeatIndex, calledTile);

  let removed = 0;
  for (let i = handRef.length - 1; i >= 0 && removed < 3; i--){
    if (handRef[i] && handRef[i].code === discardedTile.code){
      handRef.splice(i, 1);
      removed++;
    }
  }

  if (removed < 3){
    return false;
  }

  meldRef.push({
    type: "minkan",
    code: discardedTile.code,
    from: getRelativeFromForCallerSeat(seatIndex, discarderSeatIndex)
  });

  const sortedHand = (typeof sortHand === "function") ? sortHand(handRef.slice()) : handRef.slice();
  handRef.length = 0;
  handRef.push(...sortedHand);

  try{ if (typeof markOpenCallOrKanThisKyoku === "function") markOpenCallOrKanThisKyoku(); }catch(e){}
  try{ if (typeof openKanEffect === "function") openKanEffect(seatIndex); }catch(e){}

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

  if (typeof setCpuDrawnTileBySeat === "function"){
    setCpuDrawnTileBySeat(seatIndex, rinshanTile || null);
  }

  currentTurnSeatIndex = seatIndex;
  turnPhase = "DISCARD";
  hoveredTileId = null;
  if (typeof render === "function") render();
  return true;
}


function getExternalCpuCallDecisionFromSnapshot(snapshot){
  if (!snapshot || snapshot.snapshotId == null) return null;
  if (typeof consumeCpuCallDecisionForSnapshot !== "function") return null;
  const decision = consumeCpuCallDecisionForSnapshot(snapshot.snapshotId);
  if (!decision || !decision.action) return null;
  return decision;
}

function updateCpuCallDecisionLifecycle(snapshot, patch){
  if (!snapshot || snapshot.snapshotId == null) return null;
  if (typeof updateCpuCallDecisionForSnapshot !== "function") return null;
  return updateCpuCallDecisionForSnapshot(snapshot.snapshotId, patch || {});
}

function getCpuOpenSeatEngineModeSafe(seatIndex){
  if (typeof getCpuOpenSeatEngineMode === "function"){
    return getCpuOpenSeatEngineMode(seatIndex);
  }
  return "internal";
}

function recordInternalCpuCallDecisionFromSnapshot(snapshot, source = "internalEval"){
  if (!snapshot) return null;
  if (typeof buildCpuOpenShadowDecision !== "function") return null;
  if (typeof recordCpuCallDecision !== "function") return null;

  const raw = buildCpuOpenShadowDecision(snapshot);
  if (!raw || !raw.action) return null;

  raw.meta = {
    ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
    engineMode: getCpuOpenSeatEngineModeSafe(snapshot.candidateSeatIndex)
  };

  return recordCpuCallDecision(snapshot, raw, source);
}

function getCpuCallDecisionExecutionSourceLabel(decision){
  const source = decision && typeof decision.source === "string" ? decision.source : "";
  if (source === "hookReturn" || source === "externalResolve") return "external";
  if (source === "internalEval") return "internal_eval";
  if (source === "internalEvalFallback") return "internal_eval_fallback";
  if (source === "legacyPolicy") return "legacy";
  return source || "unknown";
}

function getPreferredCpuCallDecisionFromSnapshot(snapshot, seatIndex){
  if (!snapshot) return null;

  const engineMode = getCpuOpenSeatEngineModeSafe(seatIndex);

  if (engineMode === "external"){
    const externalDecision = getExternalCpuCallDecisionFromSnapshot(snapshot);
    if (externalDecision && externalDecision.action) return externalDecision;

    const internalFallback = recordInternalCpuCallDecisionFromSnapshot(snapshot, "internalEvalFallback");
    if (internalFallback && internalFallback.action) return internalFallback;
    return null;
  }

  if (engineMode === "internal"){
    const internalDecision = recordInternalCpuCallDecisionFromSnapshot(snapshot, "internalEval");
    if (internalDecision && internalDecision.action) return internalDecision;
    return null;
  }

  return null;
}

function canCpuPonLegallyOnDiscard(seatIndex, discardedTile, discarderSeatIndex){
  try{
    if (isEnded) return false;
    if (!discardedTile || !discardedTile.code) return false;
    if (seatIndex !== 1 && seatIndex !== 2) return false;
    if (discarderSeatIndex === seatIndex) return false;
    if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)) return false;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    if (!Array.isArray(handRef)) return false;

    const haveCount = handRef.filter((t)=> t && t.code === discardedTile.code).length;
    return haveCount >= 2;
  }catch(e){
    return false;
  }
}

function canCpuMinkanLegallyOnDiscard(seatIndex, discardedTile, discarderSeatIndex){
  try{
    if (isEnded) return false;
    if (!discardedTile || !discardedTile.code) return false;
    if (seatIndex !== 1 && seatIndex !== 2) return false;
    if (discarderSeatIndex === seatIndex) return false;
    if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)) return false;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    if (!Array.isArray(handRef)) return false;

    const haveCount = handRef.filter((t)=> t && t.code === discardedTile.code).length;
    return haveCount >= 3;
  }catch(e){
    return false;
  }
}

function tryExecuteCpuOpenCallByAction(action, seatIndex, discarderSeatIndex, discardedTile){
  if (action === "minkan"){
    if (canCpuMinkanLegallyOnDiscard(seatIndex, discardedTile, discarderSeatIndex)){
      return executeCpuMinkan(seatIndex, discarderSeatIndex, discardedTile);
    }
    return false;
  }

  if (action === "pon"){
    if (canCpuPonLegallyOnDiscard(seatIndex, discardedTile, discarderSeatIndex)){
      return executeCpuPon(seatIndex, discarderSeatIndex, discardedTile);
    }
    return false;
  }

  return false;
}

function executeCpuPon(seatIndex, discarderSeatIndex, discardedTile){
  if (!discardedTile || !discardedTile.code) return false;

  const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
  const meldRef = (typeof getCpuMeldRefBySeat === "function") ? getCpuMeldRefBySeat(seatIndex) : null;
  const discardRiverRef = getDiscardRiverRefBySeat(discarderSeatIndex);

  if (!Array.isArray(handRef) || !Array.isArray(meldRef) || !Array.isArray(discardRiverRef)) return false;

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}
  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  let calledTile = null;
  if (discardRiverRef.length > 0){
    calledTile = discardRiverRef.pop() || null;
  }
  if (!calledTile || !calledTile.code){
    calledTile = discardedTile;
  }

  markRiichiDisplayTileCalledAwayForSeat(discarderSeatIndex, calledTile);

  let removed = 0;
  for (let i = handRef.length - 1; i >= 0 && removed < 2; i--){
    if (handRef[i] && handRef[i].code === discardedTile.code){
      handRef.splice(i, 1);
      removed++;
    }
  }

  if (removed < 2){
    return false;
  }

  meldRef.push({
    type: "pon",
    code: discardedTile.code,
    from: getRelativeFromForCallerSeat(seatIndex, discarderSeatIndex)
  });

  const sortedHand = (typeof sortHand === "function") ? sortHand(handRef.slice()) : handRef.slice();
  handRef.length = 0;
  handRef.push(...sortedHand);

  try{ if (typeof markOpenCallOrKanThisKyoku === "function") markOpenCallOrKanThisKyoku(); }catch(e){}
  try{ if (typeof openPonEffect === "function") openPonEffect(seatIndex); }catch(e){}

  if (typeof clearCpuDrawnTileBySeat === "function"){
    clearCpuDrawnTileBySeat(seatIndex);
  }

  currentTurnSeatIndex = seatIndex;
  turnPhase = "CALL_DISCARD";
  hoveredTileId = null;
  if (typeof clearNewFlags === "function") clearNewFlags();
  if (typeof render === "function") render();
  return true;
}

function tryCpuOpenCallOnPlayerDiscard(){
  try{
    if (!Array.isArray(river) || river.length <= 0) return false;
    const discardedTile = river[river.length - 1];
    if (!discardedTile || !discardedTile.code) return false;

    const candidates = getCpuCallCandidateSeats(0);
    const snapshotBySeat = Object.create(null);

    for (const seatIndex of candidates){
      if (typeof captureCpuCallSnapshot === "function"){
        const snapshot = captureCpuCallSnapshot(seatIndex, discardedTile, 0, "playerDiscard");
        if (snapshot) snapshotBySeat[String(seatIndex)] = snapshot;
      }
    }

    for (const seatIndex of candidates){
      const snapshot = snapshotBySeat[String(seatIndex)] || null;
      const preferredDecision = getPreferredCpuCallDecisionFromSnapshot(snapshot, seatIndex);
      const preferredAction = preferredDecision && preferredDecision.action ? preferredDecision.action : null;
      const preferredExecutionSource = getCpuCallDecisionExecutionSourceLabel(preferredDecision);

      if (preferredAction === "pass"){
        updateCpuCallDecisionLifecycle(snapshot, {
          status: "passed",
          finalAction: "pass",
          executionSource: preferredExecutionSource
        });
        continue;
      }
      if (preferredAction === "minkan" || preferredAction === "pon"){
        if (tryExecuteCpuOpenCallByAction(preferredAction, seatIndex, 0, discardedTile)){
          updateCpuCallDecisionLifecycle(snapshot, {
            status: "executed",
            finalAction: preferredAction,
            executionSource: preferredExecutionSource
          });
          return true;
        }
        updateCpuCallDecisionLifecycle(snapshot, {
          status: "decision_rejected",
          note: "execute_failed"
        });
      }

      if (canCpuMinkanOnDiscard(seatIndex, discardedTile, 0)){
        const ok = executeCpuMinkan(seatIndex, 0, discardedTile);
        updateCpuCallDecisionLifecycle(snapshot, {
          status: ok ? "executed" : "internal_failed",
          finalAction: ok ? "minkan" : "pass",
          executionSource: preferredDecision ? "legacy_fallback" : "legacy"
        });
        return ok;
      }
      if (canCpuPonOnDiscard(seatIndex, discardedTile, 0)){
        const ok = executeCpuPon(seatIndex, 0, discardedTile);
        updateCpuCallDecisionLifecycle(snapshot, {
          status: ok ? "executed" : "internal_failed",
          finalAction: ok ? "pon" : "pass",
          executionSource: preferredDecision ? "legacy_fallback" : "legacy"
        });
        return ok;
      }

      if (preferredDecision){
        updateCpuCallDecisionLifecycle(snapshot, {
          status: "passed",
          finalAction: "pass",
          executionSource: preferredExecutionSource
        });
      }
    }

    return false;
  }catch(e){
    return false;
  }
}

function tryCpuOpenCallOnCpuDiscard(discardSeatIndex, discardedTile){
  try{
    if (!discardedTile || !discardedTile.code) return false;

    const candidates = getCpuCallCandidateSeats(discardSeatIndex);
    const snapshotBySeat = Object.create(null);

    for (const seatIndex of candidates){
      if (seatIndex === 0) continue;
      if (typeof captureCpuCallSnapshot === "function"){
        const snapshot = captureCpuCallSnapshot(seatIndex, discardedTile, discardSeatIndex, "cpuDiscard");
        if (snapshot) snapshotBySeat[String(seatIndex)] = snapshot;
      }
    }

    for (const seatIndex of candidates){
      if (seatIndex === 0) continue;

      const snapshot = snapshotBySeat[String(seatIndex)] || null;
      const preferredDecision = getPreferredCpuCallDecisionFromSnapshot(snapshot, seatIndex);
      const preferredAction = preferredDecision && preferredDecision.action ? preferredDecision.action : null;
      const preferredExecutionSource = getCpuCallDecisionExecutionSourceLabel(preferredDecision);

      if (preferredAction === "pass"){
        updateCpuCallDecisionLifecycle(snapshot, {
          status: "passed",
          finalAction: "pass",
          executionSource: preferredExecutionSource
        });
        continue;
      }
      if (preferredAction === "minkan" || preferredAction === "pon"){
        if (tryExecuteCpuOpenCallByAction(preferredAction, seatIndex, discardSeatIndex, discardedTile)){
          updateCpuCallDecisionLifecycle(snapshot, {
            status: "executed",
            finalAction: preferredAction,
            executionSource: preferredExecutionSource
          });
          return true;
        }
        updateCpuCallDecisionLifecycle(snapshot, {
          status: "decision_rejected",
          note: "execute_failed"
        });
      }

      if (canCpuMinkanOnDiscard(seatIndex, discardedTile, discardSeatIndex)){
        const ok = executeCpuMinkan(seatIndex, discardSeatIndex, discardedTile);
        updateCpuCallDecisionLifecycle(snapshot, {
          status: ok ? "executed" : "internal_failed",
          finalAction: ok ? "minkan" : "pass",
          executionSource: preferredDecision ? "legacy_fallback" : "legacy"
        });
        return ok;
      }
      if (canCpuPonOnDiscard(seatIndex, discardedTile, discardSeatIndex)){
        const ok = executeCpuPon(seatIndex, discardSeatIndex, discardedTile);
        updateCpuCallDecisionLifecycle(snapshot, {
          status: ok ? "executed" : "internal_failed",
          finalAction: ok ? "pon" : "pass",
          executionSource: preferredDecision ? "legacy_fallback" : "legacy"
        });
        return ok;
      }

      if (preferredDecision){
        updateCpuCallDecisionLifecycle(snapshot, {
          status: "passed",
          finalAction: "pass",
          executionSource: preferredExecutionSource
        });
      }
    }

    return false;
  }catch(e){
    return false;
  }
}

function cpuDoOneCallDiscard(seatIndex){
  if (isEnded) return null;
  if (typeof isCpuSeat === "function" && !isCpuSeat(seatIndex)) return null;

  const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
  const riverRef = (typeof getCpuRiverRefBySeat === "function") ? getCpuRiverRefBySeat(seatIndex) : null;

  if (!Array.isArray(handRef) || !Array.isArray(riverRef) || handRef.length <= 0) return null;

  const best = chooseCpuCallDiscardInfo(seatIndex, handRef, null, {
    forbiddenDiscardCode: getCpuForbiddenCallDiscardCode(seatIndex)
  });
  if (!best || !best.discardTile) return null;

  const discardedTile = best.discardTile;
  discardedTile.isNew = false;

  const nextHand = (typeof sortHand === "function") ? sortHand(best.afterTiles.slice()) : best.afterTiles.slice();
  for (const t of nextHand){
    if (t) t.isNew = false;
  }

  if (typeof setCpuHand13BySeat === "function"){
    setCpuHand13BySeat(seatIndex, nextHand);
  }

  riverRef.push(discardedTile);

  if (typeof clearCpuDrawnTileBySeat === "function"){
    clearCpuDrawnTileBySeat(seatIndex);
  }

  turnPhase = "DISCARD";
  return discardedTile;
}
