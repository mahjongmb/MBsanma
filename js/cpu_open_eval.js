// MBsanma/js/cpu_open_eval.js
// ========= cpu_open_eval.js（CPU副露評価器 / 影武者） =========
// 役割：
// - CPU副露候補snapshotを採点して、内部AIなら何を選ぶかを返す
// - まだ実行はしない。外部AIの教師役と比較するための「影武者」
// - プロファイル差し替えで、守備寄り / 速度寄り / 打点寄り を変えられるようにする
//
// 注意：
// - ここでは render を触らない
// - 状態変更はしない

function getCpuOpenEvalProfile(snapshot, profileOverride){
  if (profileOverride && typeof profileOverride === "object"){
    return {
      key: String(profileOverride.key || "custom"),
      ...profileOverride
    };
  }

  if (typeof profileOverride === "string" && profileOverride.trim()){
    return (typeof getCpuOpenProfile === "function")
      ? getCpuOpenProfile(profileOverride.trim())
      : null;
  }

  const seatIndex = snapshot && snapshot.candidateSeatIndex;
  if (typeof getCpuOpenSeatProfile === "function"){
    return getCpuOpenSeatProfile(seatIndex);
  }

  return (typeof getCpuOpenProfile === "function")
    ? getCpuOpenProfile("balanced")
    : null;
}

function getCpuOpenEvalHints(snapshot, action){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const analysis = snapshot && snapshot.callAnalysis && typeof snapshot.callAnalysis === "object"
    ? (action === "pon" ? snapshot.callAnalysis.pon : action === "minkan" ? snapshot.callAnalysis.minkan : null)
    : null;

  const out = [];
  const push = (name)=>{
    if (typeof name !== "string" || !name) return;
    if (!out.includes(name)) out.push(name);
  };

  if (Array.isArray(selfInfo.valuePlanHints)){
    for (const hint of selfInfo.valuePlanHints) push(hint);
  }
  if (analysis && Array.isArray(analysis.valuePlanHintsAfterCall)){
    for (const hint of analysis.valuePlanHintsAfterCall) push(hint);
  }

  return out;
}

function hasCpuOpenEvalHint(hints, name){
  return Array.isArray(hints) && hints.includes(name);
}

function clampCpuOpenEval(value, min, max){
  const n = Number(value) || 0;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function pushCpuOpenEvalPart(parts, key, score, note){
  const n = Number(score) || 0;
  if (!Number.isFinite(n) || n === 0) return;
  parts.push({ key, score: n, note: note || "" });
}

function sumCpuOpenEvalParts(parts){
  if (!Array.isArray(parts)) return 0;
  let total = 0;
  for (const part of parts){
    total += Number(part && part.score) || 0;
  }
  return Math.round(total * 100) / 100;
}

function getCpuOpenEvalProfileNumber(profile, key, fallback){
  if (profile && Number.isFinite(profile[key])) return Number(profile[key]);
  return Number(fallback) || 0;
}

function hasCpuOpenPonValueReason(analysis, hints){
  return !!(analysis && (
    analysis.discardedTileIsYakuhaiForSelf ||
    analysis.keepsTenpai
  ))
    || hasCpuOpenEvalHint(hints, "honitsu_like")
    || hasCpuOpenEvalHint(hints, "toitoi_like")
    || hasCpuOpenEvalHint(hints, "tanyao_like");
}

function hasCpuOpenPonSpeedReason(analysis){
  return !!(analysis && (
    analysis.advancesShanten ||
    analysis.keepsTenpai
  ));
}

function hasCpuOpenMinkanValueReason(analysis, hints){
  return !!(analysis && (
    analysis.discardedTileIsYakuhaiForSelf ||
    analysis.keepsTenpai
  ))
    || hasCpuOpenEvalHint(hints, "honitsu_like")
    || hasCpuOpenEvalHint(hints, "toitoi_like");
}

function hasCpuOpenMinkanSpeedReason(analysis){
  return !!(analysis && (
    analysis.advancesShanten ||
    analysis.keepsTenpai
  ));
}

function inferCpuOpenEvalReasonTags(snapshot, action, hints, analysis, tableInfo){
  const out = [];
  const push = (tag)=>{
    if (typeof tag !== "string" || !tag) return;
    if (!out.includes(tag)) out.push(tag);
  };

  if (action === "pass"){
    if (tableInfo.anyRiichi && !(snapshot && snapshot.self && snapshot.self.riichi)){
      push("riichi_danger_pass");
    }
    if (!analysis || (!analysis.discardedTileIsYakuhaiForSelf && !hasCpuOpenEvalHint(hints, "honitsu_like") && !hasCpuOpenEvalHint(hints, "toitoi_like") && !hasCpuOpenEvalHint(hints, "tanyao_like") && !analysis.advancesShanten && !analysis.keepsTenpai)){
      push("no_value_pass");
    }
    if (out.length <= 0 && analysis && analysis.advancesShanten){
      push("close_call_pass");
    }
    if (out.length <= 0){
      push("pass_eval");
    }
    return out;
  }

  if (action === "pon"){
    const hasValueReason = hasCpuOpenPonValueReason(analysis, hints);
    if (analysis && analysis.discardedTileIsYakuhaiForSelf){
      push(analysis.keepsTenpai ? "yakuhai_tenpai" : "yakuhai_speed");
    }
    if (hasCpuOpenEvalHint(hints, "honitsu_like")) push("honitsu_speed");
    if (hasCpuOpenEvalHint(hints, "toitoi_like")) push("toitoi_speed");
    if (hasCpuOpenEvalHint(hints, "tanyao_like")) push("tanyao_speed");
    if (analysis && analysis.keepsTenpai) push("tenpai_keep");
    if (analysis && analysis.advancesShanten){
      push(hasValueReason ? "shanten_up_value" : "shanten_up_only");
    }
    if (analysis && Number(analysis.improveDropAfterBestDiscard) >= 4){
      push("postcall_efficiency_drop");
    }
    if (out.length <= 0) push("call_push");
    return out;
  }

  if (action === "minkan"){
    if (analysis && analysis.keepsTenpai) push("minkan_tenpai");
    if (analysis && analysis.discardedTileIsYakuhaiForSelf) push("minkan_yakuhai");
    if (hasCpuOpenEvalHint(hints, "honitsu_like") || hasCpuOpenEvalHint(hints, "toitoi_like")) push("minkan_value");
    if (out.length <= 0) push("minkan_push");
    return out;
  }

  push("eval_decision");
  return out;
}

function evaluateCpuOpenPass(snapshot, profile){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const tableInfo = snapshot && snapshot.table && typeof snapshot.table === "object" ? snapshot.table : {};
  const ponAnalysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.pon : null;
  const minkanAnalysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.minkan : null;
  const parts = [];

  pushCpuOpenEvalPart(parts, "pass_base", profile.passBase);

  if (tableInfo.anyRiichi && !selfInfo.riichi){
    pushCpuOpenEvalPart(parts, "riichi_danger_bonus", profile.riichiDangerPassBonus);
  }

  if ((selfInfo.currentShanten | 0) >= 2){
    pushCpuOpenEvalPart(parts, "far_shanten_bonus", profile.farShantenPassBonus);
  }

  const score = Number(selfInfo.score) || 0;
  const topScore = Array.isArray(snapshot && snapshot.scores)
    ? Math.max(...snapshot.scores.map((v)=> Number(v) || 0))
    : score;
  if (score >= topScore && topScore > 0){
    pushCpuOpenEvalPart(parts, "top_score_bonus", profile.topScorePassBonus);
  }

  const ponHints = getCpuOpenEvalHints(snapshot, "pon");
  const hasPonValue = hasCpuOpenPonValueReason(ponAnalysis, ponHints);

  const minkanHints = getCpuOpenEvalHints(snapshot, "minkan");
  const hasMinkanValue = hasCpuOpenMinkanValueReason(minkanAnalysis, minkanHints);

  if (!hasPonValue && !hasMinkanValue){
    pushCpuOpenEvalPart(parts, "no_value_bonus", profile.noValuePassBonus);
  }

  return {
    action: "pass",
    legal: true,
    score: sumCpuOpenEvalParts(parts),
    parts,
    reasonTags: inferCpuOpenEvalReasonTags(snapshot, "pass", [], null, tableInfo)
  };
}

function evaluateCpuOpenPon(snapshot, profile){
  const legal = !!(snapshot && snapshot.legalActions && snapshot.legalActions.pon);
  if (!legal){
    return {
      action: "pon",
      legal: false,
      score: null,
      parts: [],
      reasonTags: []
    };
  }

  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const tableInfo = snapshot && snapshot.table && typeof snapshot.table === "object" ? snapshot.table : {};
  const analysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.pon : null;
  const hints = getCpuOpenEvalHints(snapshot, "pon");
  const parts = [];

  pushCpuOpenEvalPart(parts, "pon_base", profile.ponBase);

  if (analysis && analysis.discardedTileIsYakuhaiForSelf){
    pushCpuOpenEvalPart(parts, "yakuhai_bonus", profile.ponYakuhaiBonus);
  }
  const hasValueReason = hasCpuOpenPonValueReason(analysis, hints);
  const hasSpeedReason = hasCpuOpenPonSpeedReason(analysis);

  if (analysis && analysis.keepsTenpai){
    pushCpuOpenEvalPart(parts, "tenpai_keep_bonus", profile.ponTenpaiKeepBonus);
  }
  if (analysis && analysis.advancesShanten){
    const shantenAdvanceBonus = hasValueReason
      ? profile.ponShantenAdvanceBonus
      : profile.ponShantenAdvanceBonus * 0.45;
    pushCpuOpenEvalPart(parts, "shanten_up_bonus", shantenAdvanceBonus);
  }
  if (analysis && analysis.worsensShanten){
    pushCpuOpenEvalPart(parts, "worsen_penalty", -profile.ponWorsenPenalty);
  }

  if (analysis){
    pushCpuOpenEvalPart(parts, "improve_factor", clampCpuOpenEval(analysis.improveCountAfter, 0, 20) * profile.ponImproveCountFactor);
    pushCpuOpenEvalPart(parts, "wait_factor", clampCpuOpenEval(analysis.tenpaiWaitTypeCountAfter, 0, 6) * profile.ponWaitTypeFactor);
  }

  if (hasCpuOpenEvalHint(hints, "honitsu_like")) pushCpuOpenEvalPart(parts, "honitsu_bonus", profile.ponHonitsuBonus);
  if (hasCpuOpenEvalHint(hints, "toitoi_like")) pushCpuOpenEvalPart(parts, "toitoi_bonus", profile.ponToitoiBonus);
  if (hasCpuOpenEvalHint(hints, "tanyao_like")) pushCpuOpenEvalPart(parts, "tanyao_bonus", profile.ponTanyaoBonus);
  if (hasCpuOpenEvalHint(hints, "already_open")) pushCpuOpenEvalPart(parts, "already_open_bonus", profile.ponAlreadyOpenBonus);
  if (selfInfo.isDealer) pushCpuOpenEvalPart(parts, "dealer_bonus", profile.ponDealerBonus);

  if (tableInfo.anyRiichi && !selfInfo.riichi){
    pushCpuOpenEvalPart(parts, "riichi_danger_penalty", -profile.ponRiichiDangerPenalty);
  }

  const score = Number(selfInfo.score) || 0;
  const topScore = Array.isArray(snapshot && snapshot.scores)
    ? Math.max(...snapshot.scores.map((v)=> Number(v) || 0))
    : score;
  if (score >= topScore && topScore > 0){
    pushCpuOpenEvalPart(parts, "top_score_penalty", -profile.ponTopScorePenalty);
  }

  const currentShanten = Number(selfInfo.currentShanten);

  if (!hasValueReason){
    pushCpuOpenEvalPart(parts, "no_value_penalty", -profile.ponNoValuePenalty);
  }

  if (!hasValueReason && hasSpeedReason){
    pushCpuOpenEvalPart(parts, "speed_only_penalty", -(profile.ponSpeedOnlyPenalty || 0));
  }

  if (Number.isFinite(currentShanten) && currentShanten >= 2 && !hasValueReason){
    pushCpuOpenEvalPart(parts, "far_shanten_penalty", -profile.ponFarShantenPenalty);
  }

  if (analysis && analysis.sameTileDiscardWouldBeBest){
    pushCpuOpenEvalPart(
      parts,
      "same_tile_postcall_penalty",
      -getCpuOpenEvalProfileNumber(profile, "ponSameTilePostcallPenalty", 1.25)
    );
  }

  if (analysis){
    const improveDrop = Math.max(0, Number(analysis.improveDropAfterBestDiscard) || 0);
    const keepRate = Number.isFinite(analysis.improveKeepRateAfterBestDiscard)
      ? Number(analysis.improveKeepRateAfterBestDiscard)
      : null;
    const dropThreshold = getCpuOpenEvalProfileNumber(profile, "ponEfficiencyDropThreshold", 5);
    const largeDropThreshold = getCpuOpenEvalProfileNumber(profile, "ponLargeEfficiencyDropThreshold", 8);
    const keepRateThreshold = getCpuOpenEvalProfileNumber(profile, "ponEfficiencyKeepRateThreshold", 0.55);

    if (improveDrop >= dropThreshold){
      pushCpuOpenEvalPart(
        parts,
        "efficiency_drop_penalty",
        -getCpuOpenEvalProfileNumber(profile, "ponEfficiencyDropPenalty", 1.2),
        `drop=${improveDrop}`
      );
    }

    if (improveDrop >= largeDropThreshold){
      pushCpuOpenEvalPart(
        parts,
        "large_efficiency_drop_penalty",
        -getCpuOpenEvalProfileNumber(profile, "ponLargeEfficiencyDropPenalty", 2.0),
        `drop=${improveDrop}`
      );
    }

    if (keepRate != null && keepRate <= keepRateThreshold && improveDrop >= Math.max(2, dropThreshold - 1)){
      pushCpuOpenEvalPart(
        parts,
        "low_efficiency_keep_rate_penalty",
        -getCpuOpenEvalProfileNumber(profile, "ponEfficiencyKeepRatePenalty", 0.9),
        `keepRate=${keepRate}`
      );
    }
  }

  return {
    action: "pon",
    legal: true,
    score: sumCpuOpenEvalParts(parts),
    parts,
    reasonTags: inferCpuOpenEvalReasonTags(snapshot, "pon", hints, analysis, tableInfo)
  };
}

function evaluateCpuOpenMinkan(snapshot, profile){
  const legal = !!(snapshot && snapshot.legalActions && snapshot.legalActions.minkan);
  if (!legal){
    return {
      action: "minkan",
      legal: false,
      score: null,
      parts: [],
      reasonTags: []
    };
  }

  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const tableInfo = snapshot && snapshot.table && typeof snapshot.table === "object" ? snapshot.table : {};
  const analysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.minkan : null;
  const hints = getCpuOpenEvalHints(snapshot, "minkan");
  const parts = [];

  pushCpuOpenEvalPart(parts, "minkan_base", profile.minkanBase);

  if (analysis && analysis.discardedTileIsYakuhaiForSelf){
    pushCpuOpenEvalPart(parts, "yakuhai_bonus", profile.minkanYakuhaiBonus);
  }
  const hasValueReason = hasCpuOpenMinkanValueReason(analysis, hints);
  const hasSpeedReason = hasCpuOpenMinkanSpeedReason(analysis);

  if (analysis && analysis.keepsTenpai){
    pushCpuOpenEvalPart(parts, "tenpai_keep_bonus", profile.minkanTenpaiKeepBonus);
  }
  if (analysis && analysis.advancesShanten){
    const shantenAdvanceBonus = hasValueReason
      ? profile.minkanShantenAdvanceBonus
      : profile.minkanShantenAdvanceBonus * 0.45;
    pushCpuOpenEvalPart(parts, "shanten_up_bonus", shantenAdvanceBonus);
  }
  if (analysis && analysis.worsensShanten){
    pushCpuOpenEvalPart(parts, "worsen_penalty", -profile.minkanWorsenPenalty);
  }

  if (analysis){
    pushCpuOpenEvalPart(parts, "improve_factor", clampCpuOpenEval(analysis.improveCountAfter, 0, 20) * profile.minkanImproveCountFactor);
    pushCpuOpenEvalPart(parts, "wait_factor", clampCpuOpenEval(analysis.tenpaiWaitTypeCountAfter, 0, 6) * profile.minkanWaitTypeFactor);
  }

  if (hasCpuOpenEvalHint(hints, "honitsu_like")) pushCpuOpenEvalPart(parts, "honitsu_bonus", profile.minkanHonitsuBonus);
  if (hasCpuOpenEvalHint(hints, "toitoi_like")) pushCpuOpenEvalPart(parts, "toitoi_bonus", profile.minkanToitoiBonus);
  if (!hasCpuOpenEvalHint(hints, "already_open")) pushCpuOpenEvalPart(parts, "closed_hand_penalty", -profile.minkanClosedHandPenalty);

  if (tableInfo.anyRiichi && !selfInfo.riichi){
    pushCpuOpenEvalPart(parts, "riichi_danger_penalty", -profile.minkanRiichiDangerPenalty);
  }

  const score = Number(selfInfo.score) || 0;
  const topScore = Array.isArray(snapshot && snapshot.scores)
    ? Math.max(...snapshot.scores.map((v)=> Number(v) || 0))
    : score;
  if (score >= topScore && topScore > 0){
    pushCpuOpenEvalPart(parts, "top_score_penalty", -profile.minkanTopScorePenalty);
  }

  if (!hasValueReason){
    pushCpuOpenEvalPart(parts, "no_value_penalty", -profile.minkanNoValuePenalty);
  }

  if (!hasValueReason && hasSpeedReason){
    pushCpuOpenEvalPart(parts, "speed_only_penalty", -(profile.minkanSpeedOnlyPenalty || 0));
  }

  if (!profile.allowLooseMinkan && !(analysis && analysis.keepsTenpai)){
    pushCpuOpenEvalPart(parts, "strict_minkan_penalty", -1.2);
  }

  return {
    action: "minkan",
    legal: true,
    score: sumCpuOpenEvalParts(parts),
    parts,
    reasonTags: inferCpuOpenEvalReasonTags(snapshot, "minkan", hints, analysis, tableInfo)
  };
}

function compareCpuOpenEvalEntries(a, b){
  const aScore = (a && Number.isFinite(a.score)) ? a.score : -999999;
  const bScore = (b && Number.isFinite(b.score)) ? b.score : -999999;
  if (aScore !== bScore) return bScore - aScore;

  const rank = { pass: 0, pon: 1, minkan: 2 };
  const aRank = rank[a && a.action] != null ? rank[a.action] : 99;
  const bRank = rank[b && b.action] != null ? rank[b.action] : 99;
  return aRank - bRank;
}

function evaluateCpuOpenCallSnapshot(snapshot, profileOverride = null){
  if (!snapshot || typeof snapshot !== "object") return null;

  const profile = getCpuOpenEvalProfile(snapshot, profileOverride);
  if (!profile) return null;

  const passEntry = evaluateCpuOpenPass(snapshot, profile);
  const ponEntry = evaluateCpuOpenPon(snapshot, profile);
  const minkanEntry = evaluateCpuOpenMinkan(snapshot, profile);

  const entries = [passEntry, ponEntry, minkanEntry];
  const legalEntries = entries.filter((entry)=> entry && (entry.action === "pass" || entry.legal));
  legalEntries.sort(compareCpuOpenEvalEntries);

  const best = legalEntries[0] || passEntry;
  const reasonTags = Array.isArray(best.reasonTags) ? best.reasonTags.slice() : [];

  return {
    kind: "cpuOpenShadowEval",
    engine: "cpu_open_eval_v1",
    snapshotId: snapshot.snapshotId,
    seatIndex: snapshot.candidateSeatIndex,
    profileKey: profile.key || (typeof getCpuOpenSeatProfileKey === "function" ? getCpuOpenSeatProfileKey(snapshot.candidateSeatIndex) : "balanced"),
    profileLabel: profile.label || profile.key || "Profile",
    action: best.action,
    reasonTag: reasonTags[0] || "",
    reasonTags,
    scores: {
      pass: passEntry.score,
      pon: ponEntry.legal ? ponEntry.score : null,
      minkan: minkanEntry.legal ? minkanEntry.score : null
    },
    breakdown: {
      pass: passEntry.parts,
      pon: ponEntry.parts,
      minkan: minkanEntry.parts
    },
    legalActions: {
      pon: !!(snapshot.legalActions && snapshot.legalActions.pon),
      minkan: !!(snapshot.legalActions && snapshot.legalActions.minkan)
    },
    createdAt: Date.now()
  };
}

function buildCpuOpenShadowDecision(snapshot, profileOverride = null){
  const evalResult = evaluateCpuOpenCallSnapshot(snapshot, profileOverride);
  if (!evalResult) return null;
  return {
    action: evalResult.action,
    note: "internal_shadow_eval",
    reasonTag: evalResult.reasonTag,
    reasonTags: evalResult.reasonTags,
    meta: {
      engine: evalResult.engine,
      profileKey: evalResult.profileKey,
      scores: evalResult.scores
    }
  };
}

function summarizeCpuOpenEvalForMeta(evalResult){
  if (!evalResult || typeof evalResult !== "object") return null;
  return {
    engine: evalResult.engine || "cpu_open_eval_v1",
    profileKey: evalResult.profileKey || "balanced",
    action: evalResult.action || "pass",
    reasonTag: evalResult.reasonTag || "",
    reasonTags: Array.isArray(evalResult.reasonTags) ? evalResult.reasonTags.slice() : [],
    scores: evalResult.scores ? { ...evalResult.scores } : null
  };
}

try{
  if (typeof window !== "undefined"){
    window.evaluateCpuOpenCallSnapshot = evaluateCpuOpenCallSnapshot;
    window.buildCpuOpenShadowDecision = buildCpuOpenShadowDecision;
    window.summarizeCpuOpenEvalForMeta = summarizeCpuOpenEvalForMeta;
  }
}catch(e){}
