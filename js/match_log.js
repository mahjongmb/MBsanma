// ========= match_log.js（半荘/局ログ基盤） =========
// 役割：
// - アプリ版の半荘ログを局単位で残す
// - 後から牌譜解析・データ分析へつなげる最小ログを保持する
// - render系は触らず、状態変更後の事実だけを記録する

(function(global){
  "use strict";

  const STORAGE_VERSION = 1;
  const ACTIVE_SESSION_STORAGE_KEY = "mbsanma_app_active_session_v1";
  const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "mbsanma_visitor_active_session_v1";
  const MATCH_LOG_KEY_PREFIX = "mbsanma_app_match_logs_";
  const MAX_STORED_MATCHES = 40;

  let currentLog = null;

  function safeNowIso(){
    try{ return new Date().toISOString(); }catch(e){ return ""; }
  }

  function normalizeAccountId(value){
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function readActiveSession(){
    const keys = [ACTIVE_SESSION_STORAGE_KEY, LEGACY_ACTIVE_SESSION_STORAGE_KEY];
    for (const key of keys){
      try{
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const mode = parsed && parsed.mode === "account" ? "account" : (parsed && parsed.mode === "local" ? "local" : "");
        if (!mode) continue;
        return {
          mode,
          accountId: mode === "account" ? normalizeAccountId(parsed && parsed.accountId) : ""
        };
      }catch(e){}
    }
    return { mode: "local", accountId: "" };
  }

  function getScopedStorageKey(){
    const session = readActiveSession();
    if (session.mode === "account" && session.accountId){
      return `${MATCH_LOG_KEY_PREFIX}account_${session.accountId}_v${STORAGE_VERSION}`;
    }
    return `${MATCH_LOG_KEY_PREFIX}local_v${STORAGE_VERSION}`;
  }

  function cloneTile(tile){
    if (!tile || !tile.code) return null;
    return {
      id: Number.isFinite(tile.id) ? tile.id : null,
      code: tile.code,
      imgCode: tile.imgCode || tile.code,
      isRed: !!tile.isRed,
      isRiichiDeclare: !!tile.isRiichiDeclare
    };
  }

  function cloneTileArray(list){
    return Array.isArray(list) ? list.map(cloneTile).filter(Boolean) : [];
  }

  function cloneMeld(meld){
    if (!meld || typeof meld !== "object") return null;
    return {
      type: meld.type || "",
      code: meld.code || "",
      from: meld.from || "",
      calledIndex: Number.isInteger(meld.calledIndex) ? meld.calledIndex : null,
      tiles: cloneTileArray(meld.tiles),
      addedTile: cloneTile(meld.addedTile)
    };
  }

  function cloneMeldArray(list){
    return Array.isArray(list) ? list.map(cloneMeld).filter(Boolean) : [];
  }

  function cloneScores(list){
    return Array.isArray(list) ? list.slice(0, 3).map((v)=> Number(v) || 0) : [0, 0, 0];
  }

  function cloneScoreInfo(scoreInfo){
    if (!scoreInfo || typeof scoreInfo !== "object") return null;
    const out = {};
    Object.keys(scoreInfo).forEach((key)=>{
      const value = scoreInfo[key];
      if (Array.isArray(value)){
        out[key] = value.map((item)=> {
          if (item && typeof item === "object") return clonePlainData(item);
          return Number.isFinite(item) ? Number(item) : item;
        });
        return;
      }
      if (value && typeof value === "object"){
        out[key] = clonePlainData(value);
        return;
      }
      out[key] = Number.isFinite(value) ? Number(value) : value;
    });
    return out;
  }


  function clonePlainData(value){
    try{
      if (value == null) return value;
      return JSON.parse(JSON.stringify(value));
    }catch(e){
      return null;
    }
  }

  function cloneSettlement(settlement){
    if (!settlement || typeof settlement !== "object") return null;
    const out = {
      type: settlement.type || "",
      winType: settlement.winType || "",
      winnerSeatIndex: Number.isInteger(settlement.winnerSeatIndex) ? settlement.winnerSeatIndex : null,
      discarderSeatIndex: Number.isInteger(settlement.discarderSeatIndex) ? settlement.discarderSeatIndex : null,
      beforeScores: cloneScores(settlement.beforeScores),
      afterScores: cloneScores(settlement.afterScores),
      delta: cloneScores(settlement.delta),
      scoreInfo: cloneScoreInfo(settlement.scoreInfo),
      previousKyotakuCount: Number(settlement.previousKyotakuCount) || 0,
      currentHandKyotakuCount: Number(settlement.currentHandKyotakuCount) || 0,
      nextKyotakuCount: Number(settlement.nextKyotakuCount) || 0,
      tenpaiSeats: Array.isArray(settlement.tenpaiSeats) ? settlement.tenpaiSeats.slice() : [],
      riichiSeats: Array.isArray(settlement.riichiSeats) ? settlement.riichiSeats.slice() : []
    };

    if (Array.isArray(settlement.agariEntries)){
      out.agariEntries = settlement.agariEntries.map((entry)=> ({
        winType: entry && entry.winType || "",
        winnerSeatIndex: Number.isInteger(entry && entry.winnerSeatIndex) ? entry.winnerSeatIndex : null,
        discarderSeatIndex: Number.isInteger(entry && entry.discarderSeatIndex) ? entry.discarderSeatIndex : null,
        ronTile: cloneTile(entry && entry.ronTile),
        scoreInfo: cloneScoreInfo(entry && entry.scoreInfo),
        headWinner: !!(entry && entry.headWinner)
      }));
    }

    if (settlement.headEntry){
      out.headEntry = {
        winType: settlement.headEntry.winType || "",
        winnerSeatIndex: Number.isInteger(settlement.headEntry.winnerSeatIndex) ? settlement.headEntry.winnerSeatIndex : null,
        discarderSeatIndex: Number.isInteger(settlement.headEntry.discarderSeatIndex) ? settlement.headEntry.discarderSeatIndex : null,
        ronTile: cloneTile(settlement.headEntry.ronTile),
        scoreInfo: cloneScoreInfo(settlement.headEntry.scoreInfo),
        headWinner: !!settlement.headEntry.headWinner
      };
    }

    return out;
  }


  function __getTileCodeFromLike(tile){
    if (!tile) return "";
    if (typeof tile === "string") return tile;
    if (tile && typeof tile.code === "string") return tile.code;
    return "";
  }

  function __getTileParts(code){
    const text = String(code || "");
    const m = text.match(/^(\d)([mpsz])$/);
    if (!m) return null;
    return { rank: Number(m[1]), suit: m[2] };
  }

  function __makeCode(rank, suit){
    return `${rank}${suit}`;
  }

  function __canSequenceStart(code){
    const info = __getTileParts(code);
    if (!info) return false;
    if (info.suit === "z") return false;
    if (info.rank > 7) return false;
    if (typeof TYPE_TO_IDX !== "object") return false;
    return TYPE_TO_IDX[__makeCode(info.rank + 1, info.suit)] != null
      && TYPE_TO_IDX[__makeCode(info.rank + 2, info.suit)] != null;
  }

  function __enumerateAgariPatterns(counts, fixedM){
    const total = Array.isArray(counts) ? counts.reduce((sum, value)=> sum + (Number(value) || 0), 0) : 0;
    const needMelds = Math.max(0, 4 - (Number(fixedM) || 0));
    if (total !== (needMelds * 3 + 2)) return [];
    if (!Array.isArray(TILE_TYPES) || typeof TYPE_TO_IDX !== "object") return [];

    const memo = new Map();

    function solve(localCounts, pairCode, meldsMade){
      const key = `${pairCode || "-"}|${meldsMade}|${localCounts.join(",")}`;
      if (memo.has(key)) return memo.get(key);

      let firstIdx = -1;
      for (let i = 0; i < localCounts.length; i++){
        if ((localCounts[i] | 0) > 0){
          firstIdx = i;
          break;
        }
      }

      if (firstIdx < 0){
        const done = pairCode && meldsMade === needMelds ? [{ pairCode, melds: [] }] : [];
        memo.set(key, done);
        return done;
      }

      const out = [];
      const code = TILE_TYPES[firstIdx];

      if (!pairCode && (localCounts[firstIdx] | 0) >= 2){
        localCounts[firstIdx] -= 2;
        for (const child of solve(localCounts, code, meldsMade)){
          out.push({
            pairCode: child.pairCode,
            melds: child.melds.slice()
          });
          if (out.length >= 64) break;
        }
        localCounts[firstIdx] += 2;
      }

      if (meldsMade < needMelds && (localCounts[firstIdx] | 0) >= 3){
        localCounts[firstIdx] -= 3;
        for (const child of solve(localCounts, pairCode, meldsMade + 1)){
          out.push({
            pairCode: child.pairCode,
            melds: [{ type: "triplet", code }, ...child.melds]
          });
          if (out.length >= 64) break;
        }
        localCounts[firstIdx] += 3;
      }

      if (meldsMade < needMelds && __canSequenceStart(code)){
        const info = __getTileParts(code);
        const code2 = __makeCode(info.rank + 1, info.suit);
        const code3 = __makeCode(info.rank + 2, info.suit);
        const idx2 = TYPE_TO_IDX[code2];
        const idx3 = TYPE_TO_IDX[code3];
        if ((localCounts[idx2] | 0) > 0 && (localCounts[idx3] | 0) > 0){
          localCounts[firstIdx] -= 1;
          localCounts[idx2] -= 1;
          localCounts[idx3] -= 1;
          for (const child of solve(localCounts, pairCode, meldsMade + 1)){
            out.push({
              pairCode: child.pairCode,
              melds: [{ type: "sequence", codes: [code, code2, code3] }, ...child.melds]
            });
            if (out.length >= 64) break;
          }
          localCounts[firstIdx] += 1;
          localCounts[idx2] += 1;
          localCounts[idx3] += 1;
        }
      }

      memo.set(key, out);
      return out;
    }

    return solve(counts.slice(), null, 0);
  }

  function __isChiitoiAgari(counts, fixedM){
    if ((Number(fixedM) || 0) !== 0 || !Array.isArray(counts)) return false;
    let pairCount = 0;
    let tileCount = 0;
    for (const value of counts){
      const n = Number(value) || 0;
      tileCount += n;
      if (n === 2) pairCount += 1;
      else if (n !== 0) return false;
    }
    return tileCount === 14 && pairCount === 7;
  }

  function __classifyWaitTypesForCode(beforeCounts, waitCode, fixedM){
    const out = new Set();
    if (!Array.isArray(beforeCounts) || !waitCode || typeof TYPE_TO_IDX !== "object" || !Array.isArray(TILE_TYPES)) return [];

    const waitIdx = TYPE_TO_IDX[waitCode];
    if (waitIdx == null) return [];

    const afterCounts = beforeCounts.slice();
    afterCounts[waitIdx] = (afterCounts[waitIdx] | 0) + 1;
    const beforeCount = beforeCounts[waitIdx] | 0;

    if (__isChiitoiAgari(afterCounts, fixedM) && beforeCount === 1){
      out.add("tanki");
    }

    const patterns = __enumerateAgariPatterns(afterCounts, fixedM);
    for (const pattern of patterns){
      if (!pattern || typeof pattern !== "object") continue;

      if (pattern.pairCode === waitCode && beforeCount === 1){
        out.add("tanki");
      }

      const melds = Array.isArray(pattern.melds) ? pattern.melds : [];
      for (const meld of melds){
        if (!meld) continue;
        if (meld.type === "triplet" && meld.code === waitCode && beforeCount >= 2){
          out.add("shanpon");
          continue;
        }
        if (meld.type === "sequence" && Array.isArray(meld.codes) && meld.codes.includes(waitCode)){
          const codes = meld.codes.slice();
          const index = codes.indexOf(waitCode);
          const first = __getTileParts(codes[0]);
          if (index === 1){
            out.add("kanchan");
          }else if (index === 0 || index === 2){
            if (first && first.rank === 1){
              out.add("penchan");
            }else{
              out.add("ryanmen");
            }
          }
        }
      }
    }

    return Array.from(out);
  }

  function buildTenpaiAnalysisFromTiles(tiles, fixedM, options){
    const list = Array.isArray(tiles) ? tiles.slice() : [];
    const opts = options && typeof options === "object" ? options : {};
    if (!Array.isArray(TILE_TYPES) || typeof countsFromTiles !== "function" || typeof calcShanten !== "function"){
      return {
        handCount: list.length,
        waitCodes: [],
        waits: [],
        waitCount: 0,
        waitTileCount: 0,
        waitTypeKeys: [],
        primaryWaitTypeKey: "",
        isRyanmenWait: false
      };
    }

    const counts13 = countsFromTiles(list);
    const visibleCountsByCode = (opts.visibleCountsByCode && typeof opts.visibleCountsByCode === "object")
      ? opts.visibleCountsByCode
      : {};

    const waitPriority = ["ryanmen", "shanpon", "kanchan", "penchan", "tanki", "unknown"];
    const waits = [];

    for (const code of TILE_TYPES){
      if (!code) continue;
      const counts14 = counts13.slice();
      const idx = TYPE_TO_IDX[code];
      if (idx == null) continue;
      counts14[idx] = (counts14[idx] | 0) + 1;

      let isAgari = false;
      try{
        isAgari = calcShanten(counts14, Number(fixedM) || 0) === -1;
      }catch(e){
        isAgari = false;
      }
      if (!isAgari) continue;

      let waitTypes = __classifyWaitTypesForCode(counts13, code, Number(fixedM) || 0);
      if (!Array.isArray(waitTypes) || waitTypes.length <= 0) waitTypes = ["unknown"];
      waitTypes = waitTypes.slice().sort((a, b)=> waitPriority.indexOf(a) - waitPriority.indexOf(b));

      const visibleCount = Math.max(0, Number(visibleCountsByCode[code]) || 0);
      const remainingCount = Math.max(0, 4 - visibleCount);

      waits.push({
        code,
        types: waitTypes,
        primaryTypeKey: waitTypes[0] || "unknown",
        remainingCount
      });
    }

    const waitTypeSet = new Set();
    let waitTileCount = 0;
    waits.forEach((item)=>{
      waitTileCount += Math.max(0, Number(item.remainingCount) || 0);
      (Array.isArray(item.types) ? item.types : []).forEach((key)=> waitTypeSet.add(key));
    });

    const waitTypeKeys = Array.from(waitTypeSet).sort((a, b)=> waitPriority.indexOf(a) - waitPriority.indexOf(b));
    return {
      handCount: list.length,
      waitCodes: waits.map((item)=> item.code),
      waits,
      waitCount: waits.length,
      waitTileCount,
      waitTypeKeys,
      primaryWaitTypeKey: waitTypeKeys[0] || "",
      isRyanmenWait: waitTypeSet.has("ryanmen")
    };
  }

  function cloneKyokuSnapshot(input){
    const src = input && typeof input === "object" ? input : {};
    return {
      roundWind: src.roundWind || "",
      roundNumber: Number(src.roundNumber) || 0,
      honba: Number(src.honba) || 0,
      eastSeatIndex: Number.isInteger(src.eastSeatIndex) ? src.eastSeatIndex : 0,
      kyotakuCount: Number(src.kyotakuCount) || 0,
      scores: cloneScores(src.scores),
      doraIndicators: cloneTileArray(src.doraIndicators),
      uraDoraIndicators: cloneTileArray(src.uraDoraIndicators),
      wall: cloneTileArray(src.wall),
      deadWall: cloneTileArray(src.deadWall),
      hand13: cloneTileArray(src.hand13),
      drawn: cloneTile(src.drawn),
      cpuRightHand13: cloneTileArray(src.cpuRightHand13),
      cpuLeftHand13: cloneTileArray(src.cpuLeftHand13),
      river: cloneTileArray(src.river),
      cpuRightRiver: cloneTileArray(src.cpuRightRiver),
      cpuLeftRiver: cloneTileArray(src.cpuLeftRiver),
      melds: cloneMeldArray(src.melds),
      cpuRightMelds: cloneMeldArray(src.cpuRightMelds),
      cpuLeftMelds: cloneMeldArray(src.cpuLeftMelds),
      peis: cloneTileArray(src.peis),
      cpuRightPeis: cloneTileArray(src.cpuRightPeis),
      cpuLeftPeis: cloneTileArray(src.cpuLeftPeis)
    };
  }

  function ensureCurrentLog(){
    if (currentLog) return currentLog;
    currentLog = {
      storageVersion: STORAGE_VERSION,
      schemaVersion: 1,
      matchId: `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: safeNowIso(),
      endedAt: "",
      session: readActiveSession(),
      meta: {},
      kyokus: [],
      summary: null,
      updatedAt: safeNowIso()
    };
    persist();
    return currentLog;
  }

  function persist(){
    const log = currentLog;
    if (!log) return;
    log.updatedAt = safeNowIso();

    try{
      const key = getScopedStorageKey();
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed.filter((item)=> item && typeof item === "object") : [];
      const next = [log, ...list.filter((item)=> item.matchId !== log.matchId)].slice(0, MAX_STORED_MATCHES);
      localStorage.setItem(key, JSON.stringify(next));
    }catch(e){}
  }

  function getCurrentKyoku(){
    const log = ensureCurrentLog();
    if (!Array.isArray(log.kyokus) || log.kyokus.length <= 0) return null;
    return log.kyokus[log.kyokus.length - 1] || null;
  }

  function startMatch(meta){
    currentLog = {
      storageVersion: STORAGE_VERSION,
      schemaVersion: 1,
      matchId: `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: safeNowIso(),
      endedAt: "",
      session: readActiveSession(),
      meta: {
        appMode: "app",
        ruleSetId: "mb_sanma_default_v1",
        cpuProfileSetId: "current",
        ...(meta && typeof meta === "object" ? meta : {})
      },
      kyokus: [],
      summary: null,
      updatedAt: safeNowIso()
    };
    persist();
    return currentLog;
  }

  function startKyoku(snapshot){
    const log = ensureCurrentLog();
    const kyokuIndex = log.kyokus.length;
    const kyoku = {
      kyokuId: `${log.matchId}_kyoku_${kyokuIndex + 1}`,
      kyokuIndex,
      startedAt: safeNowIso(),
      endedAt: "",
      start: cloneKyokuSnapshot(snapshot),
      events: [],
      settlement: null,
      summary: null
    };
    log.kyokus.push(kyoku);
    persist();
    return kyoku;
  }

  function pushEvent(type, payload){
    const kyoku = getCurrentKyoku();
    if (!kyoku) return null;
    const event = {
      seq: kyoku.events.length + 1,
      at: safeNowIso(),
      type: String(type || "event"),
      payload: (payload && typeof payload === "object") ? (clonePlainData(payload) || {}) : {}
    };
    kyoku.events.push(event);
    persist();
    return event;
  }

  function compactCpuOpenSnapshot(snapshot){
    if (!snapshot || typeof snapshot !== "object") return null;
    return {
      snapshotId: Number(snapshot.snapshotId) || null,
      kind: snapshot.kind || "cpuOpenCallCandidate",
      sourceType: snapshot.sourceType || "",
      phase: snapshot.phase || "",
      createdAt: Number(snapshot.createdAt) || 0,
      turnSeatIndex: Number.isInteger(snapshot.turnSeatIndex) ? snapshot.turnSeatIndex : null,
      round: clonePlainData(snapshot.round) || null,
      candidateSeatIndex: Number.isInteger(snapshot.candidateSeatIndex) ? snapshot.candidateSeatIndex : null,
      candidateSeatLabel: snapshot.candidateSeatLabel || "",
      discarderSeatIndex: Number.isInteger(snapshot.discarderSeatIndex) ? snapshot.discarderSeatIndex : null,
      discarderSeatLabel: snapshot.discarderSeatLabel || "",
      discardedTile: cloneTile(snapshot.discardedTile),
      scores: cloneScores(snapshot.scores),
      self: clonePlainData(snapshot.self) || null,
      callAnalysis: clonePlainData(snapshot.callAnalysis) || null,
      table: clonePlainData(snapshot.table) || null,
      legalActions: clonePlainData(snapshot.legalActions) || null,
      currentPolicyDecision: clonePlainData(snapshot.currentPolicyDecision) || null,
      internalOpenEval: clonePlainData(snapshot.internalOpenEval) || null
    };
  }

  function compactCpuOpenDecision(decision){
    if (!decision || typeof decision !== "object") return null;
    return {
      decisionId: Number(decision.decisionId) || null,
      snapshotId: Number(decision.snapshotId) || null,
      seatIndex: Number.isInteger(decision.seatIndex) ? decision.seatIndex : null,
      action: decision.action || "",
      source: decision.source || "",
      createdAt: Number(decision.createdAt) || 0,
      note: decision.note || "",
      reasonTag: decision.reasonTag || "",
      reasonTags: Array.isArray(decision.reasonTags) ? decision.reasonTags.slice() : [],
      status: decision.status || "",
      consumed: !!decision.consumed,
      finalAction: decision.finalAction || "",
      executionSource: decision.executionSource || "",
      resolvedAt: Number(decision.resolvedAt) || 0,
      shadowAction: decision.shadowAction || "",
      shadowReasonTag: decision.shadowReasonTag || "",
      shadowReasonTags: Array.isArray(decision.shadowReasonTags) ? decision.shadowReasonTags.slice() : [],
      shadowProfileKey: decision.shadowProfileKey || "",
      shadowScores: clonePlainData(decision.shadowScores) || null,
      meta: clonePlainData(decision.meta) || null
    };
  }

  function compactCpuDiscardSnapshot(snapshot){
    if (!snapshot || typeof snapshot !== "object") return null;
    return {
      snapshotId: Number(snapshot.snapshotId) || null,
      kind: snapshot.kind || "cpuDiscardChoice",
      sourceType: snapshot.sourceType || "",
      createdAt: Number(snapshot.createdAt) || 0,
      seatIndex: Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : null,
      round: clonePlainData(snapshot.round) || null,
      self: clonePlainData(snapshot.self) || null,
      externalStyle: clonePlainData(snapshot.externalStyle) || null,
      table: clonePlainData(snapshot.table) || null,
      visibleCounts: clonePlainData(snapshot.visibleCounts) || null,
      candidateSummaries: clonePlainData(snapshot.candidateSummaries) || [],
      candidateCount: Array.isArray(snapshot.candidates) ? snapshot.candidates.length : (Array.isArray(snapshot.candidateSummaries) ? snapshot.candidateSummaries.length : 0)
    };
  }

  function compactCpuDiscardDecision(decision){
    if (!decision || typeof decision !== "object") return null;
    return {
      snapshotId: Number(decision.snapshotId) || null,
      seatIndex: Number.isInteger(decision.seatIndex) ? decision.seatIndex : null,
      styleKey: decision.styleKey || "",
      externalStyle: clonePlainData(decision.externalStyle) || null,
      action: decision.action || "",
      source: decision.source || "",
      note: decision.note || "",
      reasonTag: decision.reasonTag || "",
      reasonTags: Array.isArray(decision.reasonTags) ? decision.reasonTags.slice() : [],
      status: decision.status || "",
      createdAt: Number(decision.createdAt) || 0,
      updatedAt: Number(decision.updatedAt) || 0,
      discardTileId: Number.isInteger(decision.discardTileId) ? decision.discardTileId : null,
      discardIndex: Number.isInteger(decision.discardIndex) ? decision.discardIndex : null,
      discardCode: decision.discardCode || "",
      candidateSummary: clonePlainData(decision.candidateSummary) || null,
      selectedDiscardTileId: Number.isInteger(decision.selectedDiscardTileId) ? decision.selectedDiscardTileId : null,
      selectedDiscardIndex: Number.isInteger(decision.selectedDiscardIndex) ? decision.selectedDiscardIndex : null,
      selectedDiscardCode: decision.selectedDiscardCode || "",
      externalDiscardTileId: Number.isInteger(decision.externalDiscardTileId) ? decision.externalDiscardTileId : null,
      externalDiscardIndex: Number.isInteger(decision.externalDiscardIndex) ? decision.externalDiscardIndex : null,
      externalDiscardCode: decision.externalDiscardCode || "",
      shadowInternalDiscardTileId: Number.isInteger(decision.shadowInternalDiscardTileId) ? decision.shadowInternalDiscardTileId : null,
      shadowInternalDiscardIndex: Number.isInteger(decision.shadowInternalDiscardIndex) ? decision.shadowInternalDiscardIndex : null,
      shadowInternalDiscardCode: decision.shadowInternalDiscardCode || "",
      shadowInternalReasonTag: decision.shadowInternalReasonTag || "",
      shadowInternalReasonTags: Array.isArray(decision.shadowInternalReasonTags) ? decision.shadowInternalReasonTags.slice() : [],
      shadowInternalMeta: clonePlainData(decision.shadowInternalMeta) || null,
      shadowAgree: !!decision.shadowAgree,
      finalAction: decision.finalAction || "",
      finalDiscardTileId: Number.isInteger(decision.finalDiscardTileId) ? decision.finalDiscardTileId : null,
      finalDiscardCode: decision.finalDiscardCode || "",
      executionSource: decision.executionSource || "",
      selectedByEngineMode: decision.selectedByEngineMode || "",
      willRiichi: !!decision.willRiichi,
      meta: clonePlainData(decision.meta) || null
    };
  }

  function compactCpuApiBridgeRequest(info){
    if (!info || typeof info !== "object") return null;
    const payload = info.payload && typeof info.payload === "object" ? info.payload : null;
    const snapshot = payload && payload.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : null;
    return {
      mode: info.mode || "",
      endpoint: info.endpoint || "",
      kind: info.kind || (payload ? payload.kind || "" : ""),
      requestedAt: Number(info.requestedAt) || 0,
      sentAt: payload ? payload.sentAt || "" : "",
      snapshotId: snapshot && Number.isFinite(snapshot.snapshotId) ? snapshot.snapshotId : null,
      seatIndex: snapshot && (Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : (Number.isInteger(snapshot.candidateSeatIndex) ? snapshot.candidateSeatIndex : null)),
      sourceType: snapshot && snapshot.sourceType ? snapshot.sourceType : "",
      actionCandidates: snapshot && snapshot.legalActions ? clonePlainData(snapshot.legalActions) : null,
      externalStyleKey: snapshot && snapshot.externalStyle && snapshot.externalStyle.key ? snapshot.externalStyle.key : ""
    };
  }

  function compactCpuApiBridgeResponse(info){
    if (!info || typeof info !== "object") return null;
    return {
      mode: info.mode || "",
      endpoint: info.endpoint || "",
      kind: info.kind || "",
      ok: !!info.ok,
      status: Number(info.status) || 0,
      error: info.error || "",
      receivedAt: Number(info.receivedAt) || 0,
      decision: clonePlainData(info.decision) || null,
      data: clonePlainData(info.data) || null
    };
  }

  function pushCpuOpenSnapshot(snapshot){
    const compact = compactCpuOpenSnapshot(snapshot);
    if (!compact) return null;
    return pushEvent("cpu_open_snapshot", compact);
  }

  function pushCpuOpenDecision(decision){
    const compact = compactCpuOpenDecision(decision);
    if (!compact) return null;
    return pushEvent("cpu_open_decision", compact);
  }

  function pushCpuDiscardSnapshot(snapshot){
    const compact = compactCpuDiscardSnapshot(snapshot);
    if (!compact) return null;
    return pushEvent("cpu_discard_snapshot", compact);
  }

  function pushCpuDiscardDecision(decision){
    const compact = compactCpuDiscardDecision(decision);
    if (!compact) return null;
    return pushEvent("cpu_discard_decision", compact);
  }

  function pushCpuApiBridgeRequest(info){
    const compact = compactCpuApiBridgeRequest(info);
    if (!compact) return null;
    return pushEvent("cpu_api_bridge_request", compact);
  }

  function pushCpuApiBridgeResponse(info){
    const compact = compactCpuApiBridgeResponse(info);
    if (!compact) return null;
    return pushEvent("cpu_api_bridge_response", compact);
  }

  function finishKyoku(summary){
    const kyoku = getCurrentKyoku();
    if (!kyoku) return null;
    kyoku.endedAt = safeNowIso();
    kyoku.summary = summary && typeof summary === "object" ? { ...summary } : null;
    persist();
    return kyoku;
  }

  function recordSettlement(settlement){
    const kyoku = getCurrentKyoku();
    if (!kyoku) return null;
    const cloned = cloneSettlement(settlement);
    kyoku.settlement = cloned;
    pushEvent("settlement", { settlement: cloned });
    finishKyoku({
      type: cloned ? cloned.type : "",
      winType: cloned ? cloned.winType : "",
      winnerSeatIndex: cloned ? cloned.winnerSeatIndex : null,
      discarderSeatIndex: cloned ? cloned.discarderSeatIndex : null,
      afterScores: cloned ? cloneScores(cloned.afterScores) : [0, 0, 0]
    });
    persist();
    return cloned;
  }

  function finishMatch(endInfo, settlement){
    const log = ensureCurrentLog();
    log.endedAt = safeNowIso();
    log.summary = {
      endInfo: endInfo && typeof endInfo === "object" ? { ...endInfo } : null,
      settlement: cloneSettlement(settlement)
    };
    persist();
    return log;
  }

  function getCurrentLog(){
    return currentLog;
  }

  function getStoredLogs(){
    try{
      const raw = localStorage.getItem(getScopedStorageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    }catch(e){
      return [];
    }
  }

  global.MBSanmaMatchLog = {
    startMatch,
    startKyoku,
    pushEvent,
    recordSettlement,
    finishMatch,
    getCurrentLog,
    getStoredLogs,
    cloneTile,
    cloneTileArray,
    cloneMeldArray,
    cloneScores,
    clonePlainData,
    cloneScoreInfo,
    buildTenpaiAnalysisFromTiles,
    pushCpuOpenSnapshot,
    pushCpuOpenDecision,
    pushCpuDiscardSnapshot,
    pushCpuDiscardDecision,
    pushCpuApiBridgeRequest,
    pushCpuApiBridgeResponse
  };
})(window);
