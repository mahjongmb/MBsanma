// ========= log_metrics.js（ログ集計） =========
// 役割：
// - 正規化ログから最低限の件数集計を返す
// - 保存済み半荘ログから、分析ページ向けの集計を返す
// - 分析ページでは「自分固定」ではなく、全席を均等サンプルとして扱う
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

  function averageFrom(list){
    const arr = safeArray(list).map((value)=> Number(value)).filter((value)=> Number.isFinite(value));
    if (!arr.length) return null;
    return arr.reduce((sum, value)=> sum + value, 0) / arr.length;
  }

  function rate(count, total){
    const den = safeNumber(total, 0);
    if (den <= 0) return null;
    return safeNumber(count, 0) / den;
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

    summary.horizontal.count = summary.horizontal.count;
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

  global.MBSanmaLogMetrics = {
    summarizeLogs,
    normalizeAnalysisFilters,
    buildAnalysisSummary
  };
})(window);
