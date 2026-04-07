// MBsanma/js/cpu_discard_eval.js
// ========= cpu_discard_eval.js（CPU打牌評価器 / 影武者） =========
// 役割：
// - CPU打牌候補snapshotを採点して、内部AIなら何を切るかを返す
// - 旧来ロジック（シャンテン / improveCount / ツモ切り / 牌コード）を土台に、
//   プロファイルで重みを変えられるようにする
//
// 注意：
// - render を触らない
// - 状態変更はしない

function getCpuDiscardEvalProfile(snapshot, profileOverride){
  if (profileOverride && typeof profileOverride === "object"){
    return {
      key: String(profileOverride.key || "custom"),
      ...profileOverride
    };
  }

  if (typeof profileOverride === "string" && profileOverride.trim()){
    const key = profileOverride.trim();

    if (typeof getCpuDiscardExternalStyleLibrary === "function" && typeof buildCpuDiscardInternalProfileFromExternalStyle === "function"){
      const styleLibrary = getCpuDiscardExternalStyleLibrary();
      if (styleLibrary && styleLibrary[key]){
        return buildCpuDiscardInternalProfileFromExternalStyle(styleLibrary[key]);
      }
    }

    return (typeof getCpuDiscardProfile === "function")
      ? getCpuDiscardProfile(key)
      : null;
  }

  const seatIndex = snapshot && snapshot.seatIndex;

  if (typeof getCpuDiscardSeatInternalStyleProfile === "function"){
    const dynamicProfile = getCpuDiscardSeatInternalStyleProfile(seatIndex);
    if (dynamicProfile) return dynamicProfile;
  }

  if (typeof getCpuDiscardSeatProfile === "function"){
    return getCpuDiscardSeatProfile(seatIndex);
  }

  return (typeof getCpuDiscardProfile === "function")
    ? getCpuDiscardProfile("balanced")
    : null;
}

function pushCpuDiscardEvalPart(parts, key, score, note){
  const n = Number(score) || 0;
  if (!Number.isFinite(n) || n === 0) return;
  parts.push({ key, score: n, note: note || "" });
}

function sumCpuDiscardEvalParts(parts){
  if (!Array.isArray(parts)) return 0;
  let total = 0;
  for (const part of parts){
    total += Number(part && part.score) || 0;
  }
  return Math.round(total * 100) / 100;
}

function countTileCodeInList(tilesLike, code){
  if (!Array.isArray(tilesLike) || !code) return 0;
  let n = 0;
  for (const tile of tilesLike){
    if (tile && tile.code === code) n++;
  }
  return n;
}

function getDoraCodeFromIndicatorForDiscardEval(code){
  if (typeof getDoraCodeFromIndicatorForYaku === "function"){
    return getDoraCodeFromIndicatorForYaku(code);
  }
  return code;
}

function countCandidateDoraTiles(snapshot, candidate){
  const indicators = snapshot && snapshot.round && Array.isArray(snapshot.round.doraIndicators)
    ? snapshot.round.doraIndicators
    : [];
  const tiles = candidate && Array.isArray(candidate.after13) ? candidate.after13 : [];
  if (indicators.length <= 0 || tiles.length <= 0) return 0;

  let total = 0;
  for (const dora of indicators){
    const indicatorCode = dora && dora.code ? dora.code : null;
    if (!indicatorCode) continue;
    const doraCode = getDoraCodeFromIndicatorForDiscardEval(indicatorCode);
    total += countTileCodeInList(tiles, doraCode);
  }
  return total;
}

function isHonorCode(code){
  return !!code && code[1] === "z";
}

function isTerminalCode(code){
  if (!code || typeof code !== "string" || code.length < 2) return false;
  const suit = code[1];
  if (suit === "z") return false;
  return code[0] === "1" || code[0] === "9";
}

function isYakuhaiLikeCodeForSeat(code, seatIndex){
  if (!code) return false;
  if (code === "5z" || code === "6z" || code === "7z") return true;

  const seatWind = (typeof getSeatWindBySeatIndexForCpu === "function")
    ? getSeatWindBySeatIndexForCpu(seatIndex)
    : null;

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

function getCpuDiscardEvalProfileNumber(profile, key, fallback){
  if (profile && Number.isFinite(profile[key])) return Number(profile[key]);
  return Number(fallback) || 0;
}

function getCpuDiscardTableRiver(snapshot, seatIndex){
  if (!snapshot || !snapshot.table || typeof snapshot.table !== "object") return [];
  const rivers = snapshot.table.rivers && typeof snapshot.table.rivers === "object" ? snapshot.table.rivers : null;
  if (!rivers) return [];
  const ref = rivers[seatIndex];
  return Array.isArray(ref) ? ref : [];
}

function getCpuDiscardTableMelds(snapshot, seatIndex){
  if (!snapshot || !snapshot.table || typeof snapshot.table !== "object") return [];
  const meldsMap = snapshot.table.melds && typeof snapshot.table.melds === "object" ? snapshot.table.melds : null;
  if (!meldsMap) return [];
  const ref = meldsMap[seatIndex];
  return Array.isArray(ref) ? ref : [];
}

function getCpuDiscardTablePeis(snapshot, seatIndex){
  if (!snapshot || !snapshot.table || typeof snapshot.table !== "object") return [];
  const peisMap = snapshot.table.peis && typeof snapshot.table.peis === "object" ? snapshot.table.peis : null;
  if (!peisMap) return [];
  const ref = peisMap[seatIndex];
  return Array.isArray(ref) ? ref : [];
}

function getCpuDiscardVisibleCountMap(snapshot, candidate){
  const out = Object.create(null);
  const addCode = (code, n = 1)=>{
    if (!code) return;
    out[code] = (out[code] | 0) + (n | 0);
  };
  const addTiles = (tilesLike)=>{
    if (!Array.isArray(tilesLike)) return;
    for (const item of tilesLike){
      if (item && item.code) addCode(item.code, 1);
    }
  };
  const addMelds = (meldsLike)=>{
    if (!Array.isArray(meldsLike)) return;
    for (const meld of meldsLike){
      if (!meld || !meld.code) continue;
      const type = meld.type || "pon";
      const count = (type === "ankan" || type === "minkan" || type === "kakan") ? 4 : 3;
      addCode(meld.code, count);
    }
  };

  if (candidate && Array.isArray(candidate.after13)) addTiles(candidate.after13);
  if (snapshot && snapshot.self && typeof snapshot.self === "object"){
    addMelds(snapshot.self.melds);
    addTiles(snapshot.self.peis);
    addTiles(snapshot.self.river);
  }

  for (const seatIndex of [0, 1, 2]){
    addTiles(getCpuDiscardTableRiver(snapshot, seatIndex));
    addMelds(getCpuDiscardTableMelds(snapshot, seatIndex));
    addTiles(getCpuDiscardTablePeis(snapshot, seatIndex));
  }

  const indicators = snapshot && snapshot.round && Array.isArray(snapshot.round.doraIndicators)
    ? snapshot.round.doraIndicators
    : [];
  addTiles(indicators);
  return out;
}

function getCpuDiscardSujiPartnerCodes(code){
  if (!code || typeof code !== "string" || code.length < 2) return [];
  const suit = code[1];
  if (suit === "z") return [];
  const n = Number(code[0]);
  if (!Number.isFinite(n)) return [];
  const out = [];
  if (n - 3 >= 1) out.push(`${n - 3}${suit}`);
  if (n + 3 <= 9) out.push(`${n + 3}${suit}`);
  return out;
}

function isCpuDiscardGenbutsuToSeat(snapshot, seatIndex, code){
  if (!code) return false;
  const river = getCpuDiscardTableRiver(snapshot, seatIndex);
  return river.some((tile)=> tile && tile.code === code);
}

function isCpuDiscardSujiToSeat(snapshot, seatIndex, code){
  const partners = getCpuDiscardSujiPartnerCodes(code);
  if (partners.length <= 0) return false;
  const river = getCpuDiscardTableRiver(snapshot, seatIndex);
  for (const tile of river){
    if (tile && partners.includes(tile.code)) return true;
  }
  return false;
}

function isCpuDiscardOneChanceToSeat(snapshot, candidate, seatIndex, code){
  const partners = getCpuDiscardSujiPartnerCodes(code);
  if (partners.length <= 0) return false;
  const visibleMap = getCpuDiscardVisibleCountMap(snapshot, candidate);
  for (const partner of partners){
    if ((visibleMap[partner] | 0) >= 4) return true;
  }
  return false;
}

function getCpuDiscardRiichiThreatSeatIndexes(snapshot){
  const selfSeat = snapshot && Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : -1;
  const seats = snapshot && snapshot.table && Array.isArray(snapshot.table.riichiSeatIndexes)
    ? snapshot.table.riichiSeatIndexes
    : [];
  return seats.filter((seatIndex)=> seatIndex !== selfSeat && (seatIndex === 0 || seatIndex === 1 || seatIndex === 2));
}

function getCpuDiscardOpenThreatSeatIndexes(snapshot){
  const selfSeat = snapshot && Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : -1;
  const riichiSeats = new Set(getCpuDiscardRiichiThreatSeatIndexes(snapshot));
  const out = [];
  for (const seatIndex of [0, 1, 2]){
    if (seatIndex === selfSeat) continue;
    if (riichiSeats.has(seatIndex)) continue;
    const meldsLike = getCpuDiscardTableMelds(snapshot, seatIndex);
    if (Array.isArray(meldsLike) && meldsLike.length > 0) out.push(seatIndex);
  }
  return out;
}

function evaluateCpuDiscardDefense(snapshot, candidate, profile){
  const parts = [];
  if (!snapshot || !candidate || !candidate.discardTile || !candidate.discardTile.code) return parts;

  const discardCode = candidate.discardTile.code;
  const riichiThreatSeats = getCpuDiscardRiichiThreatSeatIndexes(snapshot);
  const openThreatSeats = getCpuDiscardOpenThreatSeatIndexes(snapshot);

  const genbutsuBonus = getCpuDiscardEvalProfileNumber(profile, "riichiGenbutsuBonus", 32);
  const sujiBonus = getCpuDiscardEvalProfileNumber(profile, "riichiSujiBonus", 16);
  const oneChanceBonus = getCpuDiscardEvalProfileNumber(profile, "riichiOneChanceBonus", 7);
  const dangerPenalty = getCpuDiscardEvalProfileNumber(profile, "riichiDangerPenalty", 18);
  const openYakuhaiPenalty = getCpuDiscardEvalProfileNumber(profile, "openYakuhaiDangerPenalty", 9);

  for (const seatIndex of riichiThreatSeats){
    if (isCpuDiscardGenbutsuToSeat(snapshot, seatIndex, discardCode)){
      pushCpuDiscardEvalPart(parts, "riichi_genbutsu_bonus", genbutsuBonus, `seat:${seatIndex}`);
      continue;
    }

    if (isCpuDiscardSujiToSeat(snapshot, seatIndex, discardCode)){
      pushCpuDiscardEvalPart(parts, "riichi_suji_bonus", sujiBonus, `seat:${seatIndex}`);
      continue;
    }

    if (isCpuDiscardOneChanceToSeat(snapshot, candidate, seatIndex, discardCode)){
      pushCpuDiscardEvalPart(parts, "riichi_one_chance_bonus", oneChanceBonus, `seat:${seatIndex}`);
      continue;
    }

    pushCpuDiscardEvalPart(parts, "riichi_danger_penalty", -dangerPenalty, `seat:${seatIndex}`);
  }

  if (isHonorCode(discardCode) && openThreatSeats.length > 0){
    for (const seatIndex of openThreatSeats){
      if (isCpuDiscardGenbutsuToSeat(snapshot, seatIndex, discardCode)) continue;
      if (!isYakuhaiLikeCodeForSeat(discardCode, seatIndex)) continue;
      pushCpuDiscardEvalPart(parts, "open_yakuhai_danger_penalty", -openYakuhaiPenalty, `seat:${seatIndex}`);
    }
  }

  return parts;
}

function buildCpuDiscardReasonTags(candidate, profile){
  const tags = [];
  const push = (tag)=>{
    if (typeof tag !== "string" || !tag) return;
    if (!tags.includes(tag)) tags.push(tag);
  };

  if (candidate && candidate.willRiichi) push("riichi_ready");
  if (candidate && Number(candidate.shantenAfter) <= 0) push("tenpai_keep");
  if (candidate && Number(candidate.improveCount) >= 18) push("wide_improve");
  if (candidate && candidate.discardTile && isHonorCode(candidate.discardTile.code)) push("honor_cut");
  if (candidate && candidate.discardTile && isTerminalCode(candidate.discardTile.code)) push("terminal_cut");
  if (tags.length <= 0) push(profile && profile.key ? `${profile.key}_eval` : "discard_eval");

  return tags;
}

function evaluateCpuDiscardCandidate(snapshot, candidate, profile){
  const parts = [];
  if (!candidate || !candidate.discardTile) return null;

  pushCpuDiscardEvalPart(parts, "shanten", -(Number(candidate.shantenAfter) || 0) * (Number(profile.shantenWeight) || 0));
  pushCpuDiscardEvalPart(parts, "improve", (Number(candidate.improveCount) || 0) * (Number(profile.improveCountFactor) || 0));

  if (candidate.isDrawnDiscard){
    pushCpuDiscardEvalPart(parts, "drawn_discard_bonus", profile.drawnDiscardBonus);
  }

  const defenseParts = evaluateCpuDiscardDefense(snapshot, candidate, profile);
  if (Array.isArray(defenseParts) && defenseParts.length > 0){
    for (const part of defenseParts){
      if (part && part.key) parts.push(part);
    }
  }

  if (candidate.willRiichi){
    pushCpuDiscardEvalPart(parts, "riichi_ready_bonus", profile.riichiReadyBonus);
  }

  const afterDoraCount = countCandidateDoraTiles(snapshot, candidate);
  pushCpuDiscardEvalPart(parts, "dora_keep_bonus", afterDoraCount * (Number(profile.doraKeepBonus) || 0));

  const discardCode = candidate.discardTile && candidate.discardTile.code ? candidate.discardTile.code : "";
  const remainSameCode = countTileCodeInList(candidate.after13, discardCode);
  if (remainSameCode >= 2 && isYakuhaiLikeCodeForSeat(discardCode, snapshot && snapshot.seatIndex)){
    pushCpuDiscardEvalPart(parts, "yakuhai_pair_keep_bonus", profile.honorPairKeepBonus);
  }

  if (isHonorCode(discardCode) && remainSameCode === 0){
    pushCpuDiscardEvalPart(parts, "isolated_honor_discard_bonus", profile.isolatedHonorDiscardBonus);
  }

  if (isTerminalCode(discardCode)){
    pushCpuDiscardEvalPart(parts, "terminal_discard_bonus", profile.terminalDiscardBonus);
  }

  const score = sumCpuDiscardEvalParts(parts);
  const reasonTags = buildCpuDiscardReasonTags(candidate, profile);
  if (parts.some((part)=> part && part.key === "riichi_genbutsu_bonus")) reasonTags.push("riichi_genbutsu");
  if (parts.some((part)=> part && part.key === "riichi_suji_bonus")) reasonTags.push("riichi_suji");
  if (parts.some((part)=> part && part.key === "riichi_one_chance_bonus")) reasonTags.push("riichi_one_chance");
  if (parts.some((part)=> part && part.key === "riichi_danger_penalty")) reasonTags.push("riichi_danger");
  if (parts.some((part)=> part && part.key === "open_yakuhai_danger_penalty")) reasonTags.push("open_yakuhai_danger");

  return {
    discardTileId: candidate.discardTile.id,
    discardIndex: candidate.discardIndex,
    discardCode,
    isDrawnDiscard: !!candidate.isDrawnDiscard,
    shantenAfter: Number(candidate.shantenAfter) || 0,
    improveCount: Number(candidate.improveCount) || 0,
    willRiichi: !!candidate.willRiichi,
    score,
    parts,
    reasonTags,
    candidate
  };
}

function compareCpuDiscardEvalEntries(a, b){
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  if (a.score > b.score) return -1;
  if (a.score < b.score) return 1;

  if (a.shantenAfter < b.shantenAfter) return -1;
  if (a.shantenAfter > b.shantenAfter) return 1;

  if (a.improveCount > b.improveCount) return -1;
  if (a.improveCount < b.improveCount) return 1;

  const aCode = a.discardCode || "";
  const bCode = b.discardCode || "";
  if (aCode < bCode) return -1;
  if (aCode > bCode) return 1;

  return 0;
}

function evaluateCpuDiscardSnapshot(snapshot, profileOverride = null){
  if (!snapshot || !Array.isArray(snapshot.candidates) || snapshot.candidates.length <= 0) return null;

  const profile = getCpuDiscardEvalProfile(snapshot, profileOverride);
  if (!profile) return null;

  const entries = [];
  for (const candidate of snapshot.candidates){
    const entry = evaluateCpuDiscardCandidate(snapshot, candidate, profile);
    if (entry) entries.push(entry);
  }

  if (entries.length <= 0) return null;
  entries.sort(compareCpuDiscardEvalEntries);

  const best = entries[0];
  const reasonTags = Array.isArray(best.reasonTags) ? best.reasonTags.slice() : [];

  return {
    kind: "cpuDiscardShadowEval",
    engine: "cpu_discard_eval_v1",
    snapshotId: snapshot.snapshotId,
    seatIndex: snapshot.seatIndex,
    profileKey: profile.key || (typeof getCpuDiscardSeatProfileKey === "function" ? getCpuDiscardSeatProfileKey(snapshot.seatIndex) : "balanced"),
    profileLabel: profile.label || profile.key || "Profile",
    profileBaseKey: profile.baseProfileKey || "",
    externalStyleKey: profile.externalStyleKey || (snapshot && snapshot.externalStyle && snapshot.externalStyle.key ? snapshot.externalStyle.key : ""),
    styleScale: Number.isFinite(profile.styleScale) ? profile.styleScale : null,
    mappingVersion: profile.mappingVersion || "",
    profileMeta: (typeof cloneCpuDiscardInternalStyleProfileMeta === "function")
      ? cloneCpuDiscardInternalStyleProfileMeta(profile)
      : null,
    discardTileId: best.discardTileId,
    discardIndex: best.discardIndex,
    discardCode: best.discardCode,
    action: "discard",
    reasonTag: reasonTags[0] || "",
    reasonTags,
    bestScore: best.score,
    entries: entries.map((entry)=>(
      {
        discardTileId: entry.discardTileId,
        discardIndex: entry.discardIndex,
        discardCode: entry.discardCode,
        score: entry.score,
        shantenAfter: entry.shantenAfter,
        improveCount: entry.improveCount,
        isDrawnDiscard: entry.isDrawnDiscard,
        willRiichi: entry.willRiichi,
        parts: entry.parts,
        reasonTags: entry.reasonTags
      }
    )),
    createdAt: Date.now()
  };
}

function buildCpuDiscardShadowDecision(snapshot, profileOverride = null){
  const evalResult = evaluateCpuDiscardSnapshot(snapshot, profileOverride);
  if (!evalResult) return null;

  return {
    action: "discard",
    discardTileId: evalResult.discardTileId,
    discardIndex: evalResult.discardIndex,
    discardCode: evalResult.discardCode,
    note: "internal_shadow_eval",
    reasonTag: evalResult.reasonTag,
    reasonTags: evalResult.reasonTags,
    meta: {
      engine: evalResult.engine,
      profileKey: evalResult.profileKey,
      profileBaseKey: evalResult.profileBaseKey,
      externalStyleKey: evalResult.externalStyleKey,
      styleScale: evalResult.styleScale,
      mappingVersion: evalResult.mappingVersion,
      profileMeta: evalResult.profileMeta,
      bestScore: evalResult.bestScore,
      topEntries: evalResult.entries.slice(0, 3)
    }
  };
}

function summarizeCpuDiscardEvalForMeta(evalResult){
  if (!evalResult || typeof evalResult !== "object") return null;
  return {
    engine: evalResult.engine || "cpu_discard_eval_v1",
    profileKey: evalResult.profileKey || "balanced",
    discardTileId: evalResult.discardTileId,
    discardIndex: evalResult.discardIndex,
    discardCode: evalResult.discardCode,
    bestScore: Number(evalResult.bestScore) || 0,
    reasonTag: evalResult.reasonTag || "",
    reasonTags: Array.isArray(evalResult.reasonTags) ? evalResult.reasonTags.slice() : []
  };
}

try{
  if (typeof window !== "undefined"){
    window.evaluateCpuDiscardSnapshot = evaluateCpuDiscardSnapshot;
    window.buildCpuDiscardShadowDecision = buildCpuDiscardShadowDecision;
    window.summarizeCpuDiscardEvalForMeta = summarizeCpuDiscardEvalForMeta;
  }
}catch(e){}
