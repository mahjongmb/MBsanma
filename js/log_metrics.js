
// ========= log_metrics.js（ログ集計） =========
// 役割：
// - 正規化ログから最低限の件数集計を返す
// - 保存済み半荘ログから、分析ページ向けの集計を返す
// - 保存済み半荘ログから、成績管理ページ向けの自分成績集計を返す
// - 分析ページでは「自分固定」ではなく、全席を均等サンプルとして扱う
// - 成績管理ページでは seat0（あなた）固定で扱う
// - 将来の役/打点系分析を増やしやすい土台を用意する

(function(global){
  "use strict";

  function safeArray(value){
    return Array.isArray(value) ? value : [];
  }

  function safeNumber(value, fallback = 0){
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function cloneObject(value){
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(e){
      return null;
    }
  }

  function averageFrom(list){
    const arr = safeArray(list).map((value)=> Number(value)).filter((value)=> Number.isFinite(value));
    if (!arr.length) return null;
    return arr.reduce((sum, value)=> sum + value, 0) / arr.length;
  }

  function sumFrom(list){
    return safeArray(list).map((value)=> Number(value)).filter((value)=> Number.isFinite(value)).reduce((sum, value)=> sum + value, 0);
  }

  function rate(count, total){
    const den = safeNumber(total, 0);
    if (den <= 0) return null;
    return safeNumber(count, 0) / den;
  }

  function summarizeLogs(normalizedLogs){
    const logs = Array.isArray(normalizedLogs) ? normalizedLogs : [];
    const out = {
      matchCount: logs.length,
      kyokuCount: 0,
      rowCount: 0,
      rawEventCount: 0,
      cpuDiscardCount: 0,
      cpuOpenCount: 0,
      playerDiscardCount: 0,
      peiCount: 0,
      drawCount: 0,
      settlementCount: 0
    };

    logs.forEach((log)=> {
      const kyokus = Array.isArray(log && log.kyokus) ? log.kyokus : [];
      out.kyokuCount += kyokus.length;
      kyokus.forEach((kyoku)=> {
        out.rowCount += Number(kyoku && kyoku.rowCount) || 0;
        out.rawEventCount += Number(kyoku && kyoku.rawEventCount) || 0;
        const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
        rows.forEach((row)=> {
          const kind = row && row.kind ? row.kind : "";
          if (kind === "cpu_discard") out.cpuDiscardCount += 1;
          else if (kind === "cpu_open") out.cpuOpenCount += 1;
          else if (kind === "default"){
            const title = String(row && row.title || "");
            if (title.includes("あなた 打牌")) out.playerDiscardCount += 1;
            if (title.includes("北抜き")) out.peiCount += 1;
            if (title.includes("ツモ ")) out.drawCount += 1;
            if (title.startsWith("精算")) out.settlementCount += 1;
          }
        });
      });
    });

    return out;
  }

  function normalizeAnalysisFilters(src){
    const raw = src && typeof src === "object" ? src : {};
    const limit = String(raw.limit || "50");
    const matchMode = String(raw.matchMode || "batch");
    const sessionMode = String(raw.sessionMode || "all");
    const dealer = String(raw.dealer || "all");
    return {
      limit: ["20", "50", "100", "200", "all"].includes(limit) ? limit : "50",
      matchMode: ["all", "normal", "batch", "unknown"].includes(matchMode) ? matchMode : "batch",
      sessionMode: ["all", "local", "account"].includes(sessionMode) ? sessionMode : "all",
      dealer: ["all", "dealer", "nondealer"].includes(dealer) ? dealer : "all"
    };
  }

  function normalizeRecordsFilters(src){
    const raw = src && typeof src === "object" ? src : {};
    const limit = String(raw.limit || "50");
    const sessionMode = String(raw.sessionMode || "all");
    return {
      limit: ["20", "50", "100", "200", "all"].includes(limit) ? limit : "50",
      sessionMode: ["all", "local", "account"].includes(sessionMode) ? sessionMode : "all",
      matchMode: "normal"
    };
  }

  function getCompletedLogs(storedLogs){
    return safeArray(storedLogs).filter((log)=> log && typeof log === "object" && log.endedAt);
  }

  function getLimitedLogs(logs, limit){
    if (limit === "all") return logs.slice();
    const n = Math.max(1, parseInt(limit, 10) || 0);
    return logs.slice(0, n);
  }

  function getMatchMode(log){
    const meta = log && log.meta && typeof log.meta === "object" ? log.meta : {};
    const raw = String(meta.matchMode || "").toLowerCase();
    if (raw === "cpu_batch" || raw === "batch") return "batch";
    if (raw === "app_play" || raw === "normal" || raw === "play" || raw === "manual") return "normal";
    return raw ? raw : "unknown";
  }

  function getSessionMode(log){
    const session = log && log.session && typeof log.session === "object" ? log.session : {};
    return session.mode === "account" ? "account" : "local";
  }

  function getSettlement(kyoku){
    if (kyoku && kyoku.settlement && typeof kyoku.settlement === "object") return kyoku.settlement;
    const summary = kyoku && kyoku.summary && typeof kyoku.summary === "object" ? kyoku.summary : null;
    if (summary && summary.settlement && typeof summary.settlement === "object") return summary.settlement;
    return null;
  }

  function getKyokuEvents(kyoku){
    return safeArray(kyoku && kyoku.events);
  }

  function getEastSeatIndex(kyoku){
    const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
    return safeNumber(start.eastSeatIndex, 0);
  }

  function isDealerSeat(kyoku, seatIndex){
    return getEastSeatIndex(kyoku) === seatIndex;
  }

  function getIncludedSeats(kyoku, dealerFilter){
    const eastSeatIndex = getEastSeatIndex(kyoku);
    if (dealerFilter === "dealer") return [eastSeatIndex];
    if (dealerFilter === "nondealer") return [0, 1, 2].filter((seat)=> seat !== eastSeatIndex);
    return [0, 1, 2];
  }

  function findRiichiEventBySeat(kyoku, seatIndex){
    return getKyokuEvents(kyoku).find((event)=> {
      const payload = event && event.payload && typeof event.payload === "object" ? event.payload : null;
      return event && event.type === "riichi" && payload && Number(payload.seatIndex) === seatIndex;
    }) || null;
  }

  function getOpenEventCountBySeat(kyoku, seatIndex){
    let count = 0;
    getKyokuEvents(kyoku).forEach((event)=> {
      const payload = event && event.payload && typeof event.payload === "object" ? event.payload : null;
      if (!payload || Number(payload.seatIndex) !== seatIndex) return;
      if (event.type === "pon" || event.type === "minkan" || event.type === "kakan") count += 1;
    });
    return count;
  }

  function getRiichiInfoBySeat(kyoku, seatIndex){
    const event = findRiichiEventBySeat(kyoku, seatIndex);
    const payload = event && event.payload && typeof event.payload === "object" ? event.payload : {};
    const tenpai = payload.tenpai && typeof payload.tenpai === "object" ? payload.tenpai : {};
    return {
      hasRiichi: !!event,
      junme: safeNumber(payload.junme, 0),
      waitTileCount: safeNumber(tenpai.waitTileCount, 0),
      isRyanmenWait: !!tenpai.isRyanmenWait,
      hasKnownWaitShape: safeArray(tenpai.waitTypeKeys).length > 0
    };
  }

  function getAgariEntries(settlement){
    if (!settlement || settlement.type !== "agari") return [];

    const entries = [];

    safeArray(settlement.agariEntries).forEach((entry)=> {
      if (entry && typeof entry === "object") entries.push(entry);
    });

    if (!entries.length && Number.isInteger(settlement.winnerSeatIndex)){
      entries.push(settlement);
    }

    const headEntry = settlement.headEntry && typeof settlement.headEntry === "object" ? settlement.headEntry : null;
    if (headEntry){
      const exists = entries.some((entry)=> {
        return Number(entry && entry.winnerSeatIndex) === Number(headEntry.winnerSeatIndex)
          && Number(entry && entry.discarderSeatIndex) === Number(headEntry.discarderSeatIndex)
          && String(entry && entry.winType || "") === String(headEntry.winType || "");
      });
      if (!exists) entries.push(headEntry);
    }

    return entries;
  }

  function getAgariEntriesForSeat(settlement, seatIndex){
    return getAgariEntries(settlement).filter((entry)=> Number(entry && entry.winnerSeatIndex) === seatIndex);
  }

  function isSeatAgariSettlement(settlement, seatIndex){
    return getAgariEntriesForSeat(settlement, seatIndex).length > 0;
  }

  function getHojuEntriesForSeat(settlement, seatIndex){
    if (!settlement || settlement.type !== "agari") return [];
    if (settlement.winType !== "ron" && !safeArray(settlement.agariEntries).length) return [];
    return getAgariEntries(settlement).filter((entry)=> Number(entry && entry.discarderSeatIndex) === seatIndex);
  }

  function isSeatHojuSettlement(settlement, seatIndex){
    return getHojuEntriesForSeat(settlement, seatIndex).length > 0;
  }

  function isSeatHitByTsumo(settlement, seatIndex){
    if (!settlement || settlement.type !== "agari") return false;
    const agariEntries = getAgariEntries(settlement);
    const hasSeatTsumoAgari = agariEntries.some((entry)=> Number(entry && entry.winnerSeatIndex) === seatIndex && String(entry && entry.winType || settlement.winType || "") === "tsumo");
    if (hasSeatTsumoAgari) return false;
    if (String(settlement.winType || "") !== "tsumo" && !agariEntries.some((entry)=> String(entry && entry.winType || "") === "tsumo")) return false;
    return safeNumber(safeArray(settlement.delta)[seatIndex], 0) < 0;
  }

  function isSeatHorizontalMoveSettlement(settlement, seatIndex){
    if (!settlement || settlement.type !== "agari") return false;
    const hasRon = String(settlement.winType || "") === "ron" || getAgariEntries(settlement).some((entry)=> String(entry && entry.winType || "") === "ron");
    if (!hasRon) return false;
    return safeNumber(safeArray(settlement.delta)[seatIndex], 0) === 0;
  }

  function scoreInfoToPoint(scoreInfo){
    if (!scoreInfo || typeof scoreInfo !== "object") return null;
    const candidates = [
      scoreInfo.totalPoint,
      scoreInfo.point,
      scoreInfo.basicPoint,
      scoreInfo.ronPoint,
      scoreInfo.displayPoint,
      scoreInfo.finalPoint,
      scoreInfo.basePoint
    ];
    for (const value of candidates){
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const ko = Number(scoreInfo.tsumoPointKo);
    const oya = Number(scoreInfo.tsumoPointOya);
    if (Number.isFinite(ko) || Number.isFinite(oya)){
      return (Number.isFinite(ko) ? ko * 2 : 0) + (Number.isFinite(oya) ? oya : 0);
    }
    return null;
  }

  function getPointFromAgariEntry(entry){
    if (!entry || typeof entry !== "object") return null;
    const directPoint = Number(entry.pointValue);
    if (Number.isFinite(directPoint) && directPoint > 0) return directPoint;
    return scoreInfoToPoint(entry.scoreInfo);
  }

  function getSeatAgariPoint(settlement, seatIndex){
    const entries = getAgariEntriesForSeat(settlement, seatIndex);
    for (const entry of entries){
      const point = getPointFromAgariEntry(entry);
      if (Number.isFinite(point) && point > 0) return point;
    }
    if (Number(settlement && settlement.winnerSeatIndex) === seatIndex){
      const point = getPointFromAgariEntry(settlement);
      if (Number.isFinite(point) && point > 0) return point;
    }
    return null;
  }

  function getSeatHojuPoint(settlement, seatIndex){
    const entries = getHojuEntriesForSeat(settlement, seatIndex);
    let total = 0;
    let found = false;
    entries.forEach((entry)=> {
      const point = getPointFromAgariEntry(entry);
      if (Number.isFinite(point) && point > 0){
        total += point;
        found = true;
      }
    });
    if (found) return total;
    if (Number(settlement && settlement.discarderSeatIndex) === seatIndex){
      const point = getPointFromAgariEntry(settlement);
      if (Number.isFinite(point) && point > 0) return point;
    }
    return null;
  }

  function getSeatHitByTsumoPoint(settlement, seatIndex){
    if (!isSeatHitByTsumo(settlement, seatIndex)) return null;
    const tsumoEntry = getAgariEntries(settlement).find((entry)=> String(entry && entry.winType || settlement.winType || "") === "tsumo");
    const point = getPointFromAgariEntry(tsumoEntry || settlement);
    return Number.isFinite(point) && point > 0 ? point : null;
  }

  function listYakuKeys(detail){
    const src = detail && typeof detail === "object" ? detail : {};
    const yaku = safeArray(src.yakuInfo && src.yakuInfo.yaku ? src.yakuInfo.yaku : src.yaku);
    const keys = [];
    yaku.forEach((item)=> {
      const rawKey = String(item && (item.key || item.name || item.label) || "").trim().toLowerCase();
      if (rawKey) keys.push(rawKey);
    });
    return keys;
  }

  function hasAnyYakuKey(keys, candidates){
    const set = new Set(safeArray(keys));
    return safeArray(candidates).some((candidate)=> set.has(String(candidate || "").toLowerCase()));
  }

  function getObjectByPath(obj, path){
    const parts = String(path || "").split(".");
    let current = obj;
    for (const part of parts){
      if (!current || typeof current !== "object") return undefined;
      current = current[part];
    }
    return current;
  }

  function findNumericArrayFromValue(value){
    if (!Array.isArray(value)) return null;
    if (!value.length) return null;
    const arr = value.map((item)=> Number(item));
    if (arr.every((num)=> Number.isFinite(num))) return arr;
    return null;
  }

  function findArrayByCandidateKeys(obj, keys){
    const src = obj && typeof obj === "object" ? obj : null;
    if (!src) return null;
    for (const key of safeArray(keys)){
      const value = getObjectByPath(src, key);
      const arr = findNumericArrayFromValue(value);
      if (arr) return arr;
    }
    return null;
  }

  function findNumberByCandidateKeys(obj, keys){
    const src = obj && typeof obj === "object" ? obj : null;
    if (!src) return null;
    for (const key of safeArray(keys)){
      const value = getObjectByPath(src, key);
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }

  function normalizeSeatValueKey(seatIndex){
    if (seatIndex === 0) return ["0", "seat0", "player0", "self", "bottom"];
    if (seatIndex === 1) return ["1", "seat1", "player1", "right", "cpuRight"];
    if (seatIndex === 2) return ["2", "seat2", "player2", "left", "cpuLeft"];
    return [String(seatIndex)];
  }

  function findSeatDeltaFromObject(obj, seatIndex, depth){
    const src = obj && typeof obj === "object" ? obj : null;
    const level = Number(depth) || 0;
    if (!src || level > 4) return null;

    if (Array.isArray(src)){
      const arr = findNumericArrayFromValue(src);
      if (arr && seatIndex >= 0 && seatIndex < arr.length) return arr[seatIndex];
      for (const item of src){
        const nested = findSeatDeltaFromObject(item, seatIndex, level + 1);
        if (Number.isFinite(nested)) return nested;
      }
      return null;
    }

    const directSeatKeys = normalizeSeatValueKey(seatIndex);
    for (const key of directSeatKeys){
      const direct = src[key];
      const num = Number(direct);
      if (Number.isFinite(num)) return num;
      if (direct && typeof direct === "object"){
        const nestedDirect = findNumberByCandidateKeys(direct, ["delta", "chipDelta", "value", "chips", "total"]);
        if (Number.isFinite(nestedDirect)) return nestedDirect;
      }
    }

    const arrayCandidateKeys = [
      "delta",
      "deltas",
      "chipDelta",
      "chipDeltas",
      "seatDelta",
      "seatDeltas",
      "results",
      "changes",
      "change",
      "perSeat",
      "bySeat",
      "seatResults"
    ];
    const arr = findArrayByCandidateKeys(src, arrayCandidateKeys);
    if (arr && seatIndex >= 0 && seatIndex < arr.length) return arr[seatIndex];

    const nestedKeys = [
      "chipInfo",
      "resultMeta",
      "summary",
      "settlement",
      "detail",
      "payload"
    ];
    for (const key of nestedKeys){
      if (src[key] && typeof src[key] === "object"){
        const nested = findSeatDeltaFromObject(src[key], seatIndex, level + 1);
        if (Number.isFinite(nested)) return nested;
      }
    }

    for (const key of Object.keys(src)){
      const value = src[key];
      if (!value || typeof value !== "object") continue;
      const nested = findSeatDeltaFromObject(value, seatIndex, level + 1);
      if (Number.isFinite(nested)) return nested;
    }

    return null;
  }

  function getChipDeltaFromEntryHeuristic(entry, context){
    const src = entry && typeof entry === "object" ? entry : null;
    if (!src) return null;

    const objectCandidates = [
      src.chipInfo,
      src.resultMeta && src.resultMeta.chipInfo
    ].filter((value)=> value && typeof value === "object");

    for (const item of objectCandidates){
      const seatSpecific = findSeatDeltaFromObject(item, 0, 0);
      if (Number.isFinite(seatSpecific)) return seatSpecific;
    }

    const positiveKeys = [
      "total",
      "totalChips",
      "chipTotal",
      "chipDelta",
      "chipGain",
      "net",
      "gain",
      "chips",
      "value"
    ];

    const negativeKeys = [
      "loss",
      "paid",
      "dealInLoss",
      "chipLoss",
      "chipDelta",
      "chipPaid",
      "chips",
      "value"
    ];

    if (context === "winner"){
      for (const item of objectCandidates){
        const num = findNumberByCandidateKeys(item, positiveKeys);
        if (Number.isFinite(num)) return Math.abs(num);
      }
    }

    if (context === "loser"){
      for (const item of objectCandidates){
        const num = findNumberByCandidateKeys(item, negativeKeys);
        if (Number.isFinite(num)) return -Math.abs(num);
      }
    }

    return null;
  }

  function getSeatChipDelta(settlement, seatIndex){
    if (!settlement || typeof settlement !== "object") return null;

    const chipInfoSeatDelta = findSeatDeltaFromObject(settlement.chipInfo, seatIndex, 0);
    if (Number.isFinite(chipInfoSeatDelta)) return chipInfoSeatDelta;

    const settlementResultMetaChipDelta = findSeatDeltaFromObject(settlement.resultMeta && settlement.resultMeta.chipInfo, seatIndex, 0);
    if (Number.isFinite(settlementResultMetaChipDelta)) return settlementResultMetaChipDelta;

    if (isSeatAgariSettlement(settlement, seatIndex)){
      const entries = getAgariEntriesForSeat(settlement, seatIndex);
      let total = 0;
      let found = false;
      entries.forEach((entry)=> {
        const value = getChipDeltaFromEntryHeuristic(entry, "winner");
        if (Number.isFinite(value)){
          total += Math.abs(value);
          found = true;
        }
      });
      if (found) return total;
      if (Number(settlement.winnerSeatIndex) === seatIndex){
        const value = getChipDeltaFromEntryHeuristic(settlement, "winner");
        if (Number.isFinite(value)) return Math.abs(value);
      }
    }

    if (isSeatHojuSettlement(settlement, seatIndex)){
      const entries = getHojuEntriesForSeat(settlement, seatIndex);
      let total = 0;
      let found = false;
      entries.forEach((entry)=> {
        const value = getChipDeltaFromEntryHeuristic(entry, "loser");
        if (Number.isFinite(value)){
          total += -Math.abs(value);
          found = true;
        }
      });
      if (found) return total;
      if (Number(settlement.discarderSeatIndex) === seatIndex){
        const value = getChipDeltaFromEntryHeuristic(settlement, "loser");
        if (Number.isFinite(value)) return -Math.abs(value);
      }
    }

    return null;
  }

  function getRoundNumberLabel(kyoku){
    const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
    const wind = String(start.roundWind || "");
    const round = safeNumber(start.roundNumber, 0);
    const honba = safeNumber(start.honba, 0);
    const base = wind && round ? `${wind}${round}局` : "—";
    return honba > 0 ? `${base} ${honba}本場` : base;
  }

  function getLastSettlement(log){
    const kyokus = safeArray(log && log.kyokus);
    for (let i = kyokus.length - 1; i >= 0; i--){
      const settlement = getSettlement(kyokus[i]);
      if (settlement) return settlement;
    }
    return null;
  }

  function computeFallbackFinalPoints(log){
    const settlement = getLastSettlement(log);
    if (settlement && safeArray(settlement.afterScores).length >= 3){
      return safeArray(settlement.afterScores).slice(0, 3).map((value)=> safeNumber(value, 0));
    }
    return null;
  }

  function computeFallbackRankFromPoints(finalPoints, seatIndex){
    const points = safeArray(finalPoints);
    if (points.length < 3) return null;
    const selfPoint = safeNumber(points[seatIndex], null);
    if (!Number.isFinite(selfPoint)) return null;
    const higherCount = points.filter((value)=> safeNumber(value, -Infinity) > selfPoint).length;
    return higherCount + 1;
  }

  function extractSeatArrayFromUnknown(value){
    const direct = findNumericArrayFromValue(value);
    if (direct) return direct;
    if (value && typeof value === "object"){
      const arr = findArrayByCandidateKeys(value, [
        "values",
        "array",
        "list",
        "bySeat",
        "perSeat",
        "seatValues",
        "seatResult",
        "seatResults"
      ]);
      if (arr) return arr;
    }
    return null;
  }

  function extractRankArray(endInfo){
    const src = endInfo && typeof endInfo === "object" ? endInfo : null;
    if (!src) return null;
    const candidates = [
      "finalRanks",
      "ranks",
      "rankings",
      "placements",
      "placement",
      "rank",
      "resultRanks",
      "resultRankings"
    ];
    for (const key of candidates){
      const value = getObjectByPath(src, key);
      const arr = extractSeatArrayFromUnknown(value);
      if (arr && arr.length >= 3) return arr;
    }
    return null;
  }

  function extractScoreArray(endInfo){
    const src = endInfo && typeof endInfo === "object" ? endInfo : null;
    if (!src) return null;
    const candidates = [
      "finalScores",
      "scores",
      "scoreDiffs",
      "scoreDeltas",
      "scoreDelta",
      "resultScores",
      "finalScoreList"
    ];
    for (const key of candidates){
      const value = getObjectByPath(src, key);
      const arr = extractSeatArrayFromUnknown(value);
      if (arr && arr.length >= 3) return arr;
    }
    return null;
  }

  function extractChipArray(endInfo){
    const src = endInfo && typeof endInfo === "object" ? endInfo : null;
    if (!src) return null;
    const candidates = [
      "finalChips",
      "chips",
      "chipTotals",
      "chipDeltas",
      "chipDelta",
      "resultChips"
    ];
    for (const key of candidates){
      const value = getObjectByPath(src, key);
      const arr = extractSeatArrayFromUnknown(value);
      if (arr && arr.length >= 3) return arr;
    }
    return null;
  }

  function getMatchSummaryInfo(log, seatIndex){
    const summary = log && log.summary && typeof log.summary === "object" ? log.summary : {};
    const endInfo = summary.endInfo && typeof summary.endInfo === "object" ? summary.endInfo : {};
    const rankArray = extractRankArray(endInfo);
    const scoreArray = extractScoreArray(endInfo);
    const chipArray = extractChipArray(endInfo);
    const finalPoints = computeFallbackFinalPoints(log);

    const matchChipDeltas = [];
    safeArray(log && log.kyokus).forEach((kyoku)=> {
      const settlement = getSettlement(kyoku);
      if (!settlement) return;
      const chipDelta = getSeatChipDelta(settlement, seatIndex);
      if (Number.isFinite(chipDelta)) matchChipDeltas.push(chipDelta);
    });

    const rank = rankArray && Number.isFinite(Number(rankArray[seatIndex]))
      ? Number(rankArray[seatIndex])
      : computeFallbackRankFromPoints(finalPoints, seatIndex);

    const score = scoreArray && Number.isFinite(Number(scoreArray[seatIndex]))
      ? Number(scoreArray[seatIndex])
      : findNumberByCandidateKeys(endInfo, [
          `score.${seatIndex}`,
          `finalScore.${seatIndex}`,
          `seat${seatIndex}.score`,
          `player${seatIndex}.score`
        ]);

    const chips = chipArray && Number.isFinite(Number(chipArray[seatIndex]))
      ? Number(chipArray[seatIndex])
      : sumFrom(matchChipDeltas);

    const finalPoint = finalPoints && Number.isFinite(Number(finalPoints[seatIndex]))
      ? Number(finalPoints[seatIndex])
      : null;

    return {
      rank: Number.isFinite(rank) ? rank : null,
      score: Number.isFinite(score) ? score : null,
      chips: Number.isFinite(chips) ? chips : null,
      finalPoint: Number.isFinite(finalPoint) ? finalPoint : null,
      finalPoints
    };
  }

  function getRiichiEvents(kyoku){
    return getKyokuEvents(kyoku).filter((event)=> event && event.type === "riichi");
  }

  function getFirstRiichiCategoryForSeat(kyoku, seatIndex){
    const myRiichiEvent = findRiichiEventBySeat(kyoku, seatIndex);
    if (!myRiichiEvent) return "";
    const mySeq = safeNumber(myRiichiEvent.seq, 0);
    const earlierOther = getRiichiEvents(kyoku).some((event)=> {
      const payload = event && event.payload && typeof event.payload === "object" ? event.payload : {};
      return safeNumber(event.seq, 0) < mySeq && safeNumber(payload.seatIndex, -1) !== seatIndex;
    });
    if (earlierOther) return "";
    const info = getRiichiInfoBySeat(kyoku, seatIndex);
    if (!info.hasKnownWaitShape) return "";
    return info.isRyanmenWait ? "first_ryanmen_riichi" : "first_gukei_riichi";
  }

  function buildOutcomeBucket(){
    return {
      count: 0,
      agariCount: 0,
      hojuCount: 0,
      hitByTsumoCount: 0,
      horizontalCount: 0,
      ryukyokuCount: 0,
      deltaList: [],
      agariPointList: []
    };
  }

  function pushOutcomeToBucket(bucket, settlement, seatIndex, delta, agariPoint){
    if (!bucket) return;
    bucket.count += 1;
    if (Number.isFinite(delta)) bucket.deltaList.push(delta);
    if (settlement && settlement.type === "agari"){
      if (isSeatAgariSettlement(settlement, seatIndex)){
        bucket.agariCount += 1;
        if (Number.isFinite(agariPoint)) bucket.agariPointList.push(agariPoint);
      } else if (isSeatHojuSettlement(settlement, seatIndex)){
        bucket.hojuCount += 1;
      } else if (isSeatHitByTsumo(settlement, seatIndex)){
        bucket.hitByTsumoCount += 1;
      } else if (isSeatHorizontalMoveSettlement(settlement, seatIndex)){
        bucket.horizontalCount += 1;
      }
    } else if (settlement && settlement.type === "ryukyoku"){
      bucket.ryukyokuCount += 1;
    }
  }

  function finalizeOutcomeBucket(bucket){
    if (!bucket) return null;
    return {
      count: bucket.count,
      averageDelta: averageFrom(bucket.deltaList),
      agariRate: rate(bucket.agariCount, bucket.count),
      hojuRate: rate(bucket.hojuCount, bucket.count),
      hitByTsumoRate: rate(bucket.hitByTsumoCount, bucket.count),
      horizontalRate: rate(bucket.horizontalCount, bucket.count),
      ryukyokuRate: rate(bucket.ryukyokuCount, bucket.count),
      averageAgariPoint: averageFrom(bucket.agariPointList)
    };
  }

  function buildAnalysisSummary(storedLogs, filters){
    const normalizedFilters = normalizeAnalysisFilters(filters);
    const completedLogs = getCompletedLogs(storedLogs);
    const limitedLogs = getLimitedLogs(completedLogs, normalizedFilters.limit);

    const summary = {
      filters: cloneObject(normalizedFilters),
      scope: {
        completedMatchCount: completedLogs.length,
        limitedMatchCount: limitedLogs.length,
        includedMatchCount: 0
      },
      matchCounts: {
        all: completedLogs.length,
        included: 0,
        normal: 0,
        batch: 0,
        unknown: 0,
        local: 0,
        account: 0
      },
      overall: {
        kyokuCount: 0,
        sampleKyokuCount: 0,
        dealerSampleCount: 0,
        nondealerSampleCount: 0,
        plusSampleRate: null,
        minusSampleRate: null,
        evenSampleRate: null,
        horizontalRate: null,
        averageSampleDelta: null
      },
      riichi: {
        count: 0,
        rate: null,
        averageJunme: null,
        averageWaitTileCount: null,
        ryanmenCount: 0,
        ryanmenRate: null
      },
      open: {
        count: 0,
        rate: null,
        averageOpenCountWhenOpened: null
      },
      agari: {
        count: 0,
        rate: null,
        tsumoCount: 0,
        tsumoRate: null,
        ronCount: 0,
        ronRate: null,
        dealerCount: 0,
        dealerRate: null,
        riichiCount: 0,
        riichiRate: null,
        openCount: 0,
        openRate: null,
        damaCount: 0,
        damaRate: null,
        averageIncome: null,
        averagePoint: null,
        averagePointTsumo: null,
        averagePointRon: null,
        manganOrMoreCount: 0,
        manganOrMoreRate: null,
        yakuCompositeRates: {
          tanyao: null,
          pinfu: null,
          chiitoi: null,
          toitoi: null,
          honitsuOrChinitsu: null,
          yakuhaiTon: null,
          yakuhaiNan: null,
          yakuhaiSha: null,
          yakuhaiHaku: null,
          yakuhaiHatsu: null,
          yakuhaiChun: null
        },
        averageDoraCount: null
      },
      hoju: {
        count: 0,
        rate: null,
        dealerWinnerCount: 0,
        dealerWinnerRate: null,
        riichiCount: 0,
        riichiRate: null,
        openCount: 0,
        openRate: null,
        averageLoss: null,
        averagePoint: null,
        tenpaiCount: 0,
        tenpaiRate: null
      },
      hitByTsumo: {
        count: 0,
        rate: null,
        averageLoss: null,
        averagePoint: null
      },
      horizontal: {
        count: 0,
        rate: null
      },
      ryukyoku: {
        count: 0,
        rate: null,
        tenpaiCount: 0,
        tenpaiRate: null
      },
      availability: {
        pointDataCount: 0,
        yakuDataCount: 0,
        doraDataCount: 0,
        hojuPointDataCount: 0,
        hojuTenpaiDataCount: 0
      }
    };

    const sampleDeltaList = [];
    const riichiJunmes = [];
    const riichiWaitTileCounts = [];
    const openCountInOpenSamples = [];
    const agariIncomeList = [];
    const agariPointList = [];
    const agariPointTsumoList = [];
    const agariPointRonList = [];
    const agariDoraCounts = [];
    const hojuLossList = [];
    const hojuPointList = [];
    const hitByTsumoLossList = [];
    const hitByTsumoPointList = [];

    const agariYakuCompositeCounts = {
      tanyao: 0,
      pinfu: 0,
      chiitoi: 0,
      toitoi: 0,
      honitsuOrChinitsu: 0,
      yakuhaiTon: 0,
      yakuhaiNan: 0,
      yakuhaiSha: 0,
      yakuhaiHaku: 0,
      yakuhaiHatsu: 0,
      yakuhaiChun: 0
    };

    let plusSampleCount = 0;
    let minusSampleCount = 0;
    let evenSampleCount = 0;

    limitedLogs.forEach((log)=> {
      const matchMode = getMatchMode(log);
      const sessionMode = getSessionMode(log);
      if (normalizedFilters.matchMode !== "all" && matchMode !== normalizedFilters.matchMode) return;
      if (normalizedFilters.sessionMode !== "all" && sessionMode !== normalizedFilters.sessionMode) return;

      summary.scope.includedMatchCount += 1;
      summary.matchCounts.included += 1;
      summary.matchCounts[matchMode] = (summary.matchCounts[matchMode] || 0) + 1;
      summary.matchCounts[sessionMode] = (summary.matchCounts[sessionMode] || 0) + 1;

      safeArray(log && log.kyokus).forEach((kyoku)=> {
        const includedSeats = getIncludedSeats(kyoku, normalizedFilters.dealer);
        if (!includedSeats.length) return;

        const settlement = getSettlement(kyoku);
        const eastSeatIndex = getEastSeatIndex(kyoku);
        summary.overall.kyokuCount += 1;

        includedSeats.forEach((seatIndex)=> {
          const isDealer = seatIndex === eastSeatIndex;
          const playerDelta = settlement ? safeNumber(safeArray(settlement.delta)[seatIndex], 0) : 0;
          const riichiInfo = getRiichiInfoBySeat(kyoku, seatIndex);
          const openCount = getOpenEventCountBySeat(kyoku, seatIndex);
          const hasOpen = openCount > 0;

          summary.overall.sampleKyokuCount += 1;
          if (isDealer) summary.overall.dealerSampleCount += 1;
          else summary.overall.nondealerSampleCount += 1;

          sampleDeltaList.push(playerDelta);
          if (playerDelta > 0) plusSampleCount += 1;
          else if (playerDelta < 0) minusSampleCount += 1;
          else evenSampleCount += 1;

          if (riichiInfo.hasRiichi){
            summary.riichi.count += 1;
            if (riichiInfo.junme > 0) riichiJunmes.push(riichiInfo.junme);
            if (riichiInfo.waitTileCount > 0) riichiWaitTileCounts.push(riichiInfo.waitTileCount);
            if (riichiInfo.isRyanmenWait) summary.riichi.ryanmenCount += 1;
          }

          if (hasOpen){
            summary.open.count += 1;
            openCountInOpenSamples.push(openCount);
          }

          if (settlement && settlement.type === "agari"){
            if (isSeatAgariSettlement(settlement, seatIndex)){
              summary.agari.count += 1;

              const entry = getAgariEntriesForSeat(settlement, seatIndex)[0] || settlement;
              const income = playerDelta;
              if (income > 0) agariIncomeList.push(income);

              if (String(entry && entry.winType || settlement.winType || "") === "tsumo") summary.agari.tsumoCount += 1;
              if (String(entry && entry.winType || settlement.winType || "") === "ron") summary.agari.ronCount += 1;
              if (isDealer) summary.agari.dealerCount += 1;
              if (riichiInfo.hasRiichi) summary.agari.riichiCount += 1;
              if (hasOpen) summary.agari.openCount += 1;
              if (!riichiInfo.hasRiichi && !hasOpen) summary.agari.damaCount += 1;

              const point = getSeatAgariPoint(settlement, seatIndex);
              if (Number.isFinite(point) && point > 0){
                agariPointList.push(point);
                summary.availability.pointDataCount += 1;
                if (point >= 8000) summary.agari.manganOrMoreCount += 1;
                if (String(entry && entry.winType || settlement.winType || "") === "tsumo") agariPointTsumoList.push(point);
                if (String(entry && entry.winType || settlement.winType || "") === "ron") agariPointRonList.push(point);
              }

              const detailSource = entry || settlement;
              const yakuKeys = listYakuKeys(detailSource);
              if (yakuKeys.length){
                summary.availability.yakuDataCount += 1;
                if (hasAnyYakuKey(yakuKeys, ["tanyao", "断么九"])) agariYakuCompositeCounts.tanyao += 1;
                if (hasAnyYakuKey(yakuKeys, ["pinfu", "平和"])) agariYakuCompositeCounts.pinfu += 1;
                if (hasAnyYakuKey(yakuKeys, ["chiitoitsu", "chiitoi", "七対子"])) agariYakuCompositeCounts.chiitoi += 1;
                if (hasAnyYakuKey(yakuKeys, ["toitoi", "対々和"])) agariYakuCompositeCounts.toitoi += 1;
                if (hasAnyYakuKey(yakuKeys, ["honitsu", "chinitsu", "混一色", "清一色"])) agariYakuCompositeCounts.honitsuOrChinitsu += 1;
                if (hasAnyYakuKey(yakuKeys, ["yakuhai_ton", "東", "役牌 東", "役牌(東)"])) agariYakuCompositeCounts.yakuhaiTon += 1;
                if (hasAnyYakuKey(yakuKeys, ["yakuhai_nan", "南", "役牌 南", "役牌(南)"])) agariYakuCompositeCounts.yakuhaiNan += 1;
                if (hasAnyYakuKey(yakuKeys, ["yakuhai_sha", "西", "役牌 西", "役牌(西)"])) agariYakuCompositeCounts.yakuhaiSha += 1;
                if (hasAnyYakuKey(yakuKeys, ["yakuhai_haku", "白", "役牌 白", "役牌(白)"])) agariYakuCompositeCounts.yakuhaiHaku += 1;
                if (hasAnyYakuKey(yakuKeys, ["yakuhai_hatsu", "發", "発", "役牌 發", "役牌 発", "役牌(發)", "役牌(発)"])) agariYakuCompositeCounts.yakuhaiHatsu += 1;
                if (hasAnyYakuKey(yakuKeys, ["yakuhai_chun", "中", "役牌 中", "役牌(中)"])) agariYakuCompositeCounts.yakuhaiChun += 1;
              }

              const bonus = detailSource && detailSource.bonus && typeof detailSource.bonus === "object" ? detailSource.bonus : null;
              const doraCount = bonus ? (safeNumber(bonus.dora, 0) + safeNumber(bonus.uraDora, 0) + safeNumber(bonus.akaDora, 0) + safeNumber(bonus.peiDora, 0)) : null;
              if (Number.isFinite(doraCount)){
                agariDoraCounts.push(doraCount);
                summary.availability.doraDataCount += 1;
              }
            } else if (isSeatHojuSettlement(settlement, seatIndex)){
              summary.hoju.count += 1;
              if (riichiInfo.hasRiichi) summary.hoju.riichiCount += 1;
              if (hasOpen) summary.hoju.openCount += 1;
              hojuLossList.push(Math.abs(playerDelta));

              const hojuEntries = getHojuEntriesForSeat(settlement, seatIndex);
              const dealerWinnerExists = hojuEntries.some((entry)=> Number(entry && entry.winnerSeatIndex) === eastSeatIndex);
              if (dealerWinnerExists) summary.hoju.dealerWinnerCount += 1;

              const hojuPoint = getSeatHojuPoint(settlement, seatIndex);
              if (Number.isFinite(hojuPoint) && hojuPoint > 0){
                hojuPointList.push(hojuPoint);
                summary.availability.hojuPointDataCount += 1;
              }

              const tenpaiSeats = safeArray(settlement.tenpaiSeats);
              if (tenpaiSeats.length){
                summary.availability.hojuTenpaiDataCount += 1;
                if (tenpaiSeats.includes(seatIndex)) summary.hoju.tenpaiCount += 1;
              }
            } else if (isSeatHitByTsumo(settlement, seatIndex)){
              summary.hitByTsumo.count += 1;
              hitByTsumoLossList.push(Math.abs(playerDelta));
              const point = getSeatHitByTsumoPoint(settlement, seatIndex);
              if (Number.isFinite(point) && point > 0) hitByTsumoPointList.push(point);
            } else if (isSeatHorizontalMoveSettlement(settlement, seatIndex)){
              summary.horizontal.count += 1;
            }
          }

          if (settlement && settlement.type === "ryukyoku"){
            summary.ryukyoku.count += 1;
            const tenpaiSeats = safeArray(settlement.tenpaiSeats);
            if (tenpaiSeats.includes(seatIndex)) summary.ryukyoku.tenpaiCount += 1;
          }
        });
      });
    });

    const sampleKyokuCount = summary.overall.sampleKyokuCount;
    summary.riichi.rate = rate(summary.riichi.count, sampleKyokuCount);
    summary.riichi.averageJunme = averageFrom(riichiJunmes);
    summary.riichi.averageWaitTileCount = averageFrom(riichiWaitTileCounts);
    summary.riichi.ryanmenRate = rate(summary.riichi.ryanmenCount, summary.riichi.count);

    summary.open.rate = rate(summary.open.count, sampleKyokuCount);
    summary.open.averageOpenCountWhenOpened = averageFrom(openCountInOpenSamples);

    summary.agari.rate = rate(summary.agari.count, sampleKyokuCount);
    summary.agari.tsumoRate = rate(summary.agari.tsumoCount, summary.agari.count);
    summary.agari.ronRate = rate(summary.agari.ronCount, summary.agari.count);
    summary.agari.dealerRate = rate(summary.agari.dealerCount, summary.agari.count);
    summary.agari.riichiRate = rate(summary.agari.riichiCount, summary.agari.count);
    summary.agari.openRate = rate(summary.agari.openCount, summary.agari.count);
    summary.agari.damaRate = rate(summary.agari.damaCount, summary.agari.count);
    summary.agari.averageIncome = averageFrom(agariIncomeList);
    summary.agari.averagePoint = averageFrom(agariPointList);
    summary.agari.averagePointTsumo = averageFrom(agariPointTsumoList);
    summary.agari.averagePointRon = averageFrom(agariPointRonList);
    summary.agari.manganOrMoreRate = rate(summary.agari.manganOrMoreCount, agariPointList.length);
    summary.agari.averageDoraCount = averageFrom(agariDoraCounts);
    Object.keys(summary.agari.yakuCompositeRates).forEach((key)=> {
      summary.agari.yakuCompositeRates[key] = rate(agariYakuCompositeCounts[key], summary.availability.yakuDataCount);
    });

    summary.hoju.rate = rate(summary.hoju.count, sampleKyokuCount);
    summary.hoju.dealerWinnerRate = rate(summary.hoju.dealerWinnerCount, summary.hoju.count);
    summary.hoju.riichiRate = rate(summary.hoju.riichiCount, summary.hoju.count);
    summary.hoju.openRate = rate(summary.hoju.openCount, summary.hoju.count);
    summary.hoju.averageLoss = averageFrom(hojuLossList);
    summary.hoju.averagePoint = averageFrom(hojuPointList);
    summary.hoju.tenpaiRate = rate(summary.hoju.tenpaiCount, summary.availability.hojuTenpaiDataCount);

    summary.hitByTsumo.rate = rate(summary.hitByTsumo.count, sampleKyokuCount);
    summary.hitByTsumo.averageLoss = averageFrom(hitByTsumoLossList);
    summary.hitByTsumo.averagePoint = averageFrom(hitByTsumoPointList);

    summary.horizontal.rate = rate(summary.horizontal.count, sampleKyokuCount);

    summary.ryukyoku.rate = rate(summary.ryukyoku.count, sampleKyokuCount);
    summary.ryukyoku.tenpaiRate = rate(summary.ryukyoku.tenpaiCount, summary.ryukyoku.count);

    summary.overall.averageSampleDelta = averageFrom(sampleDeltaList);
    summary.overall.plusSampleRate = rate(plusSampleCount, sampleKyokuCount);
    summary.overall.minusSampleRate = rate(minusSampleCount, sampleKyokuCount);
    summary.overall.evenSampleRate = rate(evenSampleCount, sampleKyokuCount);
    summary.overall.horizontalRate = summary.horizontal.rate;

    return summary;
  }

  function buildRecordsSummary(storedLogs, filters){
    const normalizedFilters = normalizeRecordsFilters(filters);
    const completedLogs = getCompletedLogs(storedLogs);
    const limitedLogs = getLimitedLogs(completedLogs, normalizedFilters.limit);
    const seatIndex = 0;

    const summary = {
      filters: cloneObject(normalizedFilters),
      scope: {
        completedMatchCount: completedLogs.length,
        limitedMatchCount: limitedLogs.length,
        includedMatchCount: 0,
        kyokuCount: 0
      },
      matchCounts: {
        included: 0,
        normal: 0,
        batch: 0,
        unknown: 0,
        local: 0,
        account: 0
      },
      overview: {
        totalScore: null,
        averageScore: null,
        totalChip: null,
        averageChip: null,
        averageRank: null,
        rank1Rate: null,
        rank2Rate: null,
        rank3Rate: null,
        totalKyokuDelta: null,
        averageKyokuDelta: null,
        totalFinalPoint: null,
        averageFinalPoint: null
      },
      rates: {
        riichi: null,
        open: null,
        agari: null,
        hoju: null,
        hitByTsumo: null,
        horizontal: null,
        ryukyoku: null
      },
      agari: {
        count: 0,
        tsumoCount: 0,
        dealerCount: 0,
        riichiCount: 0,
        openCount: 0,
        damaCount: 0,
        averageIncome: null,
        averagePoint: null,
        averagePointTsumo: null,
        averagePointRon: null,
        manganOrMoreRate: null,
        averageDoraCount: null,
        averageChipGainPerAgari: null,
        yakuCompositeRates: {
          tanyao: null,
          pinfu: null,
          chiitoi: null,
          toitoi: null,
          honitsuOrChinitsu: null,
          yakuhaiTon: null,
          yakuhaiNan: null,
          yakuhaiSha: null,
          yakuhaiHaku: null,
          yakuhaiHatsu: null,
          yakuhaiChun: null
        }
      },
      hoju: {
        count: 0,
        dealerWinnerRate: null,
        riichiRate: null,
        openRate: null,
        averageLoss: null,
        averagePoint: null,
        averagePointWhenRiichi: null,
        tenpaiRate: null
      },
      hitByTsumo: {
        count: 0,
        averageLoss: null,
        averagePoint: null
      },
      horizontal: {
        count: 0
      },
      ryukyoku: {
        count: 0,
        tenpaiRate: null
      },
      chip: {
        total: null,
        average: null,
        averageGainPerAgari: null,
        averageLossPerNonAgari: null
      },
      firstRiichiStats: {
        ryanmen: finalizeOutcomeBucket(buildOutcomeBucket()),
        gukei: finalizeOutcomeBucket(buildOutcomeBucket())
      },
      conditions: {
        agariPointByPeiDora: {
          "0": null,
          "1": null,
          "2+": null
        },
        agariPointByRiichi: {
          riichi: null,
          nonRiichi: null
        },
        agariPointBySome: {
          honitsuMenzen: null,
          honitsuOpen: null
        },
        agariPointByKuitan: {
          kuitan: null
        },
        agariPointByToitoi: {
          toitoi: null
        }
      },
      graphs: {
        scoreTrend: [],
        cumulativeScoreTrend: [],
        chipTrend: [],
        rankDistribution: [
          { label: "1着", value: 0 },
          { label: "2着", value: 0 },
          { label: "3着", value: 0 }
        ],
        kyokuDeltaTrend: [],
        kyokuDeltaHistogram: []
      },
      latestMatch: null,
      matches: [],
      availability: {
        matchScoreCount: 0,
        matchChipCount: 0,
        matchRankCount: 0,
        pointDataCount: 0,
        yakuDataCount: 0,
        doraDataCount: 0,
        chipDeltaDataCount: 0,
        riichiPointDataCount: 0,
        openJunmeTenpaiRate: null
      },
      notes: {
        openJunmeTenpaiRate: "巡目別副露時テンパイ率は、現行ログに副露巡目の保存が足りないため未対応です。"
      }
    };

    const matchScoreList = [];
    const matchChipList = [];
    const matchRankList = [];
    const finalPointList = [];
    const kyokuDeltaList = [];

    const agariIncomeList = [];
    const agariPointList = [];
    const agariPointTsumoList = [];
    const agariPointRonList = [];
    const agariDoraList = [];
    const agariChipGainList = [];
    const nonAgariChipLossPerKyoku = [];
    const hojuLossList = [];
    const hojuPointList = [];
    const hojuPointRiichiList = [];
    const hitByTsumoLossList = [];
    const hitByTsumoPointList = [];
    const ryukyokuTenpaiFlags = [];
    const hojuTenpaiFlags = [];

    const yakuCompositeCounts = {
      tanyao: 0,
      pinfu: 0,
      chiitoi: 0,
      toitoi: 0,
      honitsuOrChinitsu: 0,
      yakuhaiTon: 0,
      yakuhaiNan: 0,
      yakuhaiSha: 0,
      yakuhaiHaku: 0,
      yakuhaiHatsu: 0,
      yakuhaiChun: 0
    };

    const firstRyanmenBucket = buildOutcomeBucket();
    const firstGukeiBucket = buildOutcomeBucket();

    const conditionAgariPointMap = {
      pei0: [],
      pei1: [],
      pei2Plus: [],
      riichi: [],
      nonRiichi: [],
      honitsuMenzen: [],
      honitsuOpen: [],
      kuitan: [],
      toitoi: []
    };

    limitedLogs.forEach((log)=> {
      const matchMode = getMatchMode(log);
      const sessionMode = getSessionMode(log);
      if (matchMode !== "normal") return;
      if (normalizedFilters.sessionMode !== "all" && sessionMode !== normalizedFilters.sessionMode) return;

      summary.scope.includedMatchCount += 1;
      summary.matchCounts.included += 1;
      summary.matchCounts[matchMode] = (summary.matchCounts[matchMode] || 0) + 1;
      summary.matchCounts[sessionMode] = (summary.matchCounts[sessionMode] || 0) + 1;

      const matchInfo = getMatchSummaryInfo(log, seatIndex);
      const matchKyokuCount = safeArray(log && log.kyokus).length;
      const matchKyokuDeltas = [];

      if (Number.isFinite(matchInfo.score)){
        matchScoreList.push(matchInfo.score);
        summary.availability.matchScoreCount += 1;
      }
      if (Number.isFinite(matchInfo.chips)){
        matchChipList.push(matchInfo.chips);
        summary.availability.matchChipCount += 1;
      }
      if (Number.isFinite(matchInfo.rank)){
        matchRankList.push(matchInfo.rank);
        summary.availability.matchRankCount += 1;
        const idx = Math.max(0, Math.min(2, matchInfo.rank - 1));
        summary.graphs.rankDistribution[idx].value += 1;
      }
      if (Number.isFinite(matchInfo.finalPoint)){
        finalPointList.push(matchInfo.finalPoint);
      }

      safeArray(log && log.kyokus).forEach((kyoku)=> {
        const settlement = getSettlement(kyoku);
        if (!settlement) return;

        const delta = safeNumber(safeArray(settlement.delta)[seatIndex], 0);
        const riichiInfo = getRiichiInfoBySeat(kyoku, seatIndex);
        const openCount = getOpenEventCountBySeat(kyoku, seatIndex);
        const hasOpen = openCount > 0;
        const isAgari = isSeatAgariSettlement(settlement, seatIndex);
        const isHoju = isSeatHojuSettlement(settlement, seatIndex);
        const isHitByTsumo = isSeatHitByTsumo(settlement, seatIndex);
        const isHorizontal = isSeatHorizontalMoveSettlement(settlement, seatIndex);
        const chipDelta = getSeatChipDelta(settlement, seatIndex);

        summary.scope.kyokuCount += 1;
        kyokuDeltaList.push(delta);
        matchKyokuDeltas.push(delta);
        summary.graphs.kyokuDeltaTrend.push({
          label: getRoundNumberLabel(kyoku),
          value: delta
        });

        if (riichiInfo.hasRiichi) summary.rates.riichi = null;
        if (hasOpen) summary.rates.open = null;

        const firstRiichiCategory = getFirstRiichiCategoryForSeat(kyoku, seatIndex);
        const agariPoint = getSeatAgariPoint(settlement, seatIndex);
        if (firstRiichiCategory === "first_ryanmen_riichi"){
          pushOutcomeToBucket(firstRyanmenBucket, settlement, seatIndex, delta, agariPoint);
        } else if (firstRiichiCategory === "first_gukei_riichi"){
          pushOutcomeToBucket(firstGukeiBucket, settlement, seatIndex, delta, agariPoint);
        }

        if (riichiInfo.hasRiichi){
          summary.matchCounts.riichiCount = safeNumber(summary.matchCounts.riichiCount, 0) + 1;
        }
        if (hasOpen){
          summary.matchCounts.openCount = safeNumber(summary.matchCounts.openCount, 0) + 1;
        }

        if (isAgari){
          summary.agari.count += 1;
          if (delta > 0) agariIncomeList.push(delta);
          if (Number.isFinite(chipDelta)){
            agariChipGainList.push(Math.max(0, chipDelta));
            summary.availability.chipDeltaDataCount += 1;
          }

          const entry = getAgariEntriesForSeat(settlement, seatIndex)[0] || settlement;
          const winType = String(entry && entry.winType || settlement.winType || "");
          if (winType === "tsumo") summary.agari.tsumoCount += 1;
          if (isDealerSeat(kyoku, seatIndex)) summary.agari.dealerCount += 1;
          if (riichiInfo.hasRiichi) summary.agari.riichiCount += 1;
          if (hasOpen) summary.agari.openCount += 1;
          if (!riichiInfo.hasRiichi && !hasOpen) summary.agari.damaCount += 1;

          if (Number.isFinite(agariPoint) && agariPoint > 0){
            agariPointList.push(agariPoint);
            summary.availability.pointDataCount += 1;
            if (winType === "tsumo") agariPointTsumoList.push(agariPoint);
            if (winType === "ron") agariPointRonList.push(agariPoint);
            if (agariPoint >= 8000) summary.agari.manganOrMoreCount = safeNumber(summary.agari.manganOrMoreCount, 0) + 1;
          }

          const detailSource = entry || settlement;
          const yakuKeys = listYakuKeys(detailSource);
          const bonus = detailSource && detailSource.bonus && typeof detailSource.bonus === "object" ? detailSource.bonus : null;
          const peiDora = bonus ? safeNumber(bonus.peiDora, 0) : 0;
          const totalDora = bonus ? (
            safeNumber(bonus.dora, 0)
            + safeNumber(bonus.uraDora, 0)
            + safeNumber(bonus.akaDora, 0)
            + safeNumber(bonus.peiDora, 0)
          ) : null;

          if (Number.isFinite(totalDora)){
            agariDoraList.push(totalDora);
            summary.availability.doraDataCount += 1;
          }

          if (yakuKeys.length){
            summary.availability.yakuDataCount += 1;
            if (hasAnyYakuKey(yakuKeys, ["tanyao", "断么九"])) yakuCompositeCounts.tanyao += 1;
            if (hasAnyYakuKey(yakuKeys, ["pinfu", "平和"])) yakuCompositeCounts.pinfu += 1;
            if (hasAnyYakuKey(yakuKeys, ["chiitoitsu", "chiitoi", "七対子"])) yakuCompositeCounts.chiitoi += 1;
            if (hasAnyYakuKey(yakuKeys, ["toitoi", "対々和"])) yakuCompositeCounts.toitoi += 1;
            if (hasAnyYakuKey(yakuKeys, ["honitsu", "chinitsu", "混一色", "清一色"])) yakuCompositeCounts.honitsuOrChinitsu += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_ton", "東", "役牌 東", "役牌(東)"])) yakuCompositeCounts.yakuhaiTon += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_nan", "南", "役牌 南", "役牌(南)"])) yakuCompositeCounts.yakuhaiNan += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_sha", "西", "役牌 西", "役牌(西)"])) yakuCompositeCounts.yakuhaiSha += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_haku", "白", "役牌 白", "役牌(白)"])) yakuCompositeCounts.yakuhaiHaku += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_hatsu", "發", "発", "役牌 發", "役牌 発", "役牌(發)", "役牌(発)"])) yakuCompositeCounts.yakuhaiHatsu += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_chun", "中", "役牌 中", "役牌(中)"])) yakuCompositeCounts.yakuhaiChun += 1;
          }

          if (Number.isFinite(agariPoint) && agariPoint > 0){
            if (peiDora <= 0) conditionAgariPointMap.pei0.push(agariPoint);
            else if (peiDora === 1) conditionAgariPointMap.pei1.push(agariPoint);
            else conditionAgariPointMap.pei2Plus.push(agariPoint);

            if (riichiInfo.hasRiichi) conditionAgariPointMap.riichi.push(agariPoint);
            else conditionAgariPointMap.nonRiichi.push(agariPoint);

            if (hasAnyYakuKey(yakuKeys, ["honitsu", "chinitsu", "混一色", "清一色"])){
              if (hasOpen) conditionAgariPointMap.honitsuOpen.push(agariPoint);
              else conditionAgariPointMap.honitsuMenzen.push(agariPoint);
            }

            if (hasOpen && hasAnyYakuKey(yakuKeys, ["tanyao", "断么九"])) conditionAgariPointMap.kuitan.push(agariPoint);
            if (hasAnyYakuKey(yakuKeys, ["toitoi", "対々和"])) conditionAgariPointMap.toitoi.push(agariPoint);
          }
        } else {
          if (Number.isFinite(chipDelta)){
            nonAgariChipLossPerKyoku.push(Math.max(0, -chipDelta));
            summary.availability.chipDeltaDataCount += 1;
          } else {
            nonAgariChipLossPerKyoku.push(0);
          }

          if (isHoju){
            summary.hoju.count += 1;
            hojuLossList.push(Math.abs(delta));
            const hojuPoint = getSeatHojuPoint(settlement, seatIndex);
            if (Number.isFinite(hojuPoint) && hojuPoint > 0) hojuPointList.push(hojuPoint);
            if (riichiInfo.hasRiichi){
              summary.hoju.riichiCount = safeNumber(summary.hoju.riichiCount, 0) + 1;
              if (Number.isFinite(hojuPoint) && hojuPoint > 0){
                hojuPointRiichiList.push(hojuPoint);
                summary.availability.riichiPointDataCount += 1;
              }
            }
            if (hasOpen) summary.hoju.openCount = safeNumber(summary.hoju.openCount, 0) + 1;

            const hojuEntries = getHojuEntriesForSeat(settlement, seatIndex);
            if (hojuEntries.some((entry)=> Number(entry && entry.winnerSeatIndex) === getEastSeatIndex(kyoku))){
              summary.hoju.dealerWinnerCount = safeNumber(summary.hoju.dealerWinnerCount, 0) + 1;
            }

            const tenpaiSeats = safeArray(settlement.tenpaiSeats);
            if (tenpaiSeats.length) hojuTenpaiFlags.push(tenpaiSeats.includes(seatIndex) ? 1 : 0);
          } else if (isHitByTsumo){
            summary.hitByTsumo.count += 1;
            hitByTsumoLossList.push(Math.abs(delta));
            const point = getSeatHitByTsumoPoint(settlement, seatIndex);
            if (Number.isFinite(point) && point > 0) hitByTsumoPointList.push(point);
          } else if (isHorizontal){
            summary.horizontal.count += 1;
          } else if (settlement.type === "ryukyoku"){
            summary.ryukyoku.count += 1;
            const tenpaiSeats = safeArray(settlement.tenpaiSeats);
            ryukyokuTenpaiFlags.push(tenpaiSeats.includes(seatIndex) ? 1 : 0);
          }
        }
      });

      const avgKyokuDelta = averageFrom(matchKyokuDeltas);
      const matchRow = {
        matchId: String(log && log.matchId || ""),
        endedAt: String(log && log.endedAt || ""),
        kyokuCount: matchKyokuCount,
        rank: matchInfo.rank,
        score: matchInfo.score,
        chips: matchInfo.chips,
        finalPoint: matchInfo.finalPoint,
        averageKyokuDelta: avgKyokuDelta
      };
      summary.matches.push(matchRow);

      if (summary.matches.length === 1){
        summary.latestMatch = cloneObject(matchRow);
      }

      summary.graphs.scoreTrend.push({
        label: matchRow.endedAt,
        value: Number.isFinite(matchRow.score) ? matchRow.score : null
      });

      summary.graphs.chipTrend.push({
        label: matchRow.endedAt,
        value: Number.isFinite(matchRow.chips) ? matchRow.chips : null
      });
    });

    let runningScore = 0;
    summary.graphs.scoreTrend.forEach((item)=> {
      if (!Number.isFinite(item.value)) return;
      runningScore += item.value;
      summary.graphs.cumulativeScoreTrend.push({
        label: item.label,
        value: runningScore
      });
    });

    const histogramBuckets = [
      { min: -Infinity, max: -4000, label: "-4000以下", count: 0 },
      { min: -4000, max: -2000, label: "-4000〜-2001", count: 0 },
      { min: -2000, max: -1000, label: "-2000〜-1001", count: 0 },
      { min: -1000, max: 0, label: "-1000〜-1", count: 0 },
      { min: 0, max: 1000, label: "0〜999", count: 0 },
      { min: 1000, max: 2000, label: "1000〜1999", count: 0 },
      { min: 2000, max: 4000, label: "2000〜3999", count: 0 },
      { min: 4000, max: Infinity, label: "4000以上", count: 0 }
    ];

    kyokuDeltaList.forEach((value)=> {
      histogramBuckets.forEach((bucket)=> {
        if (value >= bucket.min && value < bucket.max){
          bucket.count += 1;
        }
      });
    });

    summary.graphs.kyokuDeltaHistogram = histogramBuckets.map((bucket)=> ({
      label: bucket.label,
      value: bucket.count
    }));

    summary.overview.totalScore = matchScoreList.length ? sumFrom(matchScoreList) : null;
    summary.overview.averageScore = averageFrom(matchScoreList);
    summary.overview.totalChip = matchChipList.length ? sumFrom(matchChipList) : null;
    summary.overview.averageChip = averageFrom(matchChipList);
    summary.overview.averageRank = averageFrom(matchRankList);
    summary.overview.rank1Rate = rate(matchRankList.filter((value)=> value === 1).length, matchRankList.length);
    summary.overview.rank2Rate = rate(matchRankList.filter((value)=> value === 2).length, matchRankList.length);
    summary.overview.rank3Rate = rate(matchRankList.filter((value)=> value === 3).length, matchRankList.length);
    summary.overview.totalKyokuDelta = kyokuDeltaList.length ? sumFrom(kyokuDeltaList) : null;
    summary.overview.averageKyokuDelta = averageFrom(kyokuDeltaList);
    summary.overview.totalFinalPoint = finalPointList.length ? sumFrom(finalPointList) : null;
    summary.overview.averageFinalPoint = averageFrom(finalPointList);

    const kyokuCount = summary.scope.kyokuCount;
    const riichiCount = safeNumber(summary.matchCounts.riichiCount, 0);
    const openCount = safeNumber(summary.matchCounts.openCount, 0);
    summary.rates.riichi = rate(riichiCount, kyokuCount);
    summary.rates.open = rate(openCount, kyokuCount);
    summary.rates.agari = rate(summary.agari.count, kyokuCount);
    summary.rates.hoju = rate(summary.hoju.count, kyokuCount);
    summary.rates.hitByTsumo = rate(summary.hitByTsumo.count, kyokuCount);
    summary.rates.horizontal = rate(summary.horizontal.count, kyokuCount);
    summary.rates.ryukyoku = rate(summary.ryukyoku.count, kyokuCount);

    summary.agari.tsumoRate = rate(summary.agari.tsumoCount, summary.agari.count);
    summary.agari.dealerRate = rate(summary.agari.dealerCount, summary.agari.count);
    summary.agari.riichiRate = rate(summary.agari.riichiCount, summary.agari.count);
    summary.agari.openRate = rate(summary.agari.openCount, summary.agari.count);
    summary.agari.damaRate = rate(summary.agari.damaCount, summary.agari.count);
    summary.agari.averageIncome = averageFrom(agariIncomeList);
    summary.agari.averagePoint = averageFrom(agariPointList);
    summary.agari.averagePointTsumo = averageFrom(agariPointTsumoList);
    summary.agari.averagePointRon = averageFrom(agariPointRonList);
    summary.agari.manganOrMoreRate = rate(safeNumber(summary.agari.manganOrMoreCount, 0), agariPointList.length);
    summary.agari.averageDoraCount = averageFrom(agariDoraList);
    summary.agari.averageChipGainPerAgari = averageFrom(agariChipGainList);
    Object.keys(summary.agari.yakuCompositeRates).forEach((key)=> {
      summary.agari.yakuCompositeRates[key] = rate(yakuCompositeCounts[key], summary.availability.yakuDataCount);
    });

    summary.hoju.dealerWinnerRate = rate(safeNumber(summary.hoju.dealerWinnerCount, 0), summary.hoju.count);
    summary.hoju.riichiRate = rate(safeNumber(summary.hoju.riichiCount, 0), summary.hoju.count);
    summary.hoju.openRate = rate(safeNumber(summary.hoju.openCount, 0), summary.hoju.count);
    summary.hoju.averageLoss = averageFrom(hojuLossList);
    summary.hoju.averagePoint = averageFrom(hojuPointList);
    summary.hoju.averagePointWhenRiichi = averageFrom(hojuPointRiichiList);
    summary.hoju.tenpaiRate = rate(sumFrom(hojuTenpaiFlags), hojuTenpaiFlags.length);

    summary.hitByTsumo.averageLoss = averageFrom(hitByTsumoLossList);
    summary.hitByTsumo.averagePoint = averageFrom(hitByTsumoPointList);

    summary.ryukyoku.tenpaiRate = rate(sumFrom(ryukyokuTenpaiFlags), ryukyokuTenpaiFlags.length);

    summary.chip.total = summary.overview.totalChip;
    summary.chip.average = summary.overview.averageChip;
    summary.chip.averageGainPerAgari = averageFrom(agariChipGainList);
    summary.chip.averageLossPerNonAgari = averageFrom(nonAgariChipLossPerKyoku);

    summary.firstRiichiStats.ryanmen = finalizeOutcomeBucket(firstRyanmenBucket);
    summary.firstRiichiStats.gukei = finalizeOutcomeBucket(firstGukeiBucket);

    summary.conditions.agariPointByPeiDora["0"] = averageFrom(conditionAgariPointMap.pei0);
    summary.conditions.agariPointByPeiDora["1"] = averageFrom(conditionAgariPointMap.pei1);
    summary.conditions.agariPointByPeiDora["2+"] = averageFrom(conditionAgariPointMap.pei2Plus);
    summary.conditions.agariPointByRiichi.riichi = averageFrom(conditionAgariPointMap.riichi);
    summary.conditions.agariPointByRiichi.nonRiichi = averageFrom(conditionAgariPointMap.nonRiichi);
    summary.conditions.agariPointBySome.honitsuMenzen = averageFrom(conditionAgariPointMap.honitsuMenzen);
    summary.conditions.agariPointBySome.honitsuOpen = averageFrom(conditionAgariPointMap.honitsuOpen);
    summary.conditions.agariPointByKuitan.kuitan = averageFrom(conditionAgariPointMap.kuitan);
    summary.conditions.agariPointByToitoi.toitoi = averageFrom(conditionAgariPointMap.toitoi);

    return summary;
  }

  global.MBSanmaLogMetrics = {
    summarizeLogs,
    normalizeAnalysisFilters,
    normalizeRecordsFilters,
    buildAnalysisSummary,
    buildRecordsSummary
  };
})(window);
