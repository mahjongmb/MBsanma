
// ========= log_metrics.js（ログ簡易集計） =========
// 役割：
// - 正規化ログ/生ログから最低限の件数集計を返す
// - 将来の分析画面の土台にする

(function(global){
  "use strict";

  function safeArray(value){
    return Array.isArray(value) ? value : [];
  }

  function getPayload(event){
    return (event && event.payload && typeof event.payload === "object") ? event.payload : {};
  }

  function averageFrom(list){
    const values = safeArray(list).map((value)=> Number(value)).filter((value)=> Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value)=> sum + value, 0) / values.length;
  }

  function formatPercentFromCounts(numerator, denominator){
    const den = Number(denominator) || 0;
    if (den <= 0) return null;
    return (Number(numerator) || 0) / den;
  }

  function getSettlementPlayerAgariPoint(settlement){
    if (!settlement || settlement.type !== "agari") return null;

    if (settlement.winType === "tsumo"){
      if (settlement.winnerSeatIndex !== 0) return null;
      const scoreInfo = settlement.scoreInfo && typeof settlement.scoreInfo === "object" ? settlement.scoreInfo : null;
      if (!scoreInfo) return null;
      const ko = Number(scoreInfo.tsumoPointKo) || 0;
      const oya = Number(scoreInfo.tsumoPointOya) || 0;
      return (ko * 2) + oya;
    }

    if (settlement.winType === "ron"){
      const entries = safeArray(settlement.agariEntries);
      if (entries.length){
        let total = 0;
        let hit = false;
        entries.forEach((entry)=>{
          if (!entry || entry.winnerSeatIndex !== 0) return;
          const scoreInfo = entry.scoreInfo && typeof entry.scoreInfo === "object" ? entry.scoreInfo : null;
          const ronPoint = scoreInfo ? (Number(scoreInfo.ronPoint) || 0) : 0;
          total += ronPoint;
          hit = true;
        });
        return hit ? total : null;
      }

      if (settlement.winnerSeatIndex !== 0) return null;
      const scoreInfo = settlement.scoreInfo && typeof settlement.scoreInfo === "object" ? settlement.scoreInfo : null;
      return scoreInfo ? (Number(scoreInfo.ronPoint) || 0) : null;
    }

    return null;
  }

  function getRiichiEventForPlayer(kyokuSource){
    const events = safeArray(kyokuSource && kyokuSource.events);
    return events.find((event)=> event && event.type === "riichi" && Number(getPayload(event).seatIndex) === 0) || null;
  }

  function isPlayerAgariSettlement(settlement){
    if (!settlement || settlement.type !== "agari") return false;
    if (settlement.winType === "tsumo"){
      return settlement.winnerSeatIndex === 0;
    }
    if (settlement.winType === "ron"){
      if (safeArray(settlement.agariEntries).some((entry)=> entry && entry.winnerSeatIndex === 0)) return true;
      return settlement.winnerSeatIndex === 0;
    }
    return false;
  }

  function summarizeLogs(normalizedLogs){
    const logs = safeArray(normalizedLogs);
    const out = {
      matchCount: logs.length,
      kyokuCount: 0,
      rowCount: 0,
      rawEventCount: 0,

      cpuDiscardCount: 0,
      cpuOpenCount: 0,
      cpuDiscardShadowAgreeCount: 0,
      cpuDiscardShadowComparableCount: 0,
      cpuDiscardExecutionSourceCounts: {},
      cpuDiscardReasonTagCounts: {},
      cpuOpenReasonTagCounts: {},

      playerDiscardCount: 0,
      peiCount: 0,
      drawCount: 0,
      settlementCount: 0,

      playerRiichiCount: 0,
      playerAgariCount: 0,
      playerHojuCount: 0,
      playerPonCount: 0,
      playerMinkanCount: 0,
      playerAnkanCount: 0,
      playerKakanCount: 0,
      playerCallPromptCount: 0,
      playerCallPassCount: 0,

      playerRiichiJunmes: [],
      playerRiichiAgariCount: 0,
      playerRiichiAgariPoints: [],
      playerRyanmenRiichiCount: 0,
      playerRyanmenRiichiAgariCount: 0,
      playerRyanmenRiichiAgariPoints: [],
      playerAgariPoints: []
    };

    logs.forEach((log)=>{
      const kyokus = safeArray(log && log.kyokus);
      out.kyokuCount += kyokus.length;

      kyokus.forEach((kyoku)=>{
        out.rowCount += Number(kyoku && kyoku.rowCount) || 0;
        out.rawEventCount += Number(kyoku && kyoku.rawEventCount) || 0;

        const rows = safeArray(kyoku && kyoku.rows);
        rows.forEach((row)=>{
          const kind = row && row.kind ? row.kind : "";
          if (kind === "cpu_discard"){
            out.cpuDiscardCount += 1;
            const source = row && row.executionSource ? row.executionSource : "";
            if (source) out.cpuDiscardExecutionSourceCounts[source] = (out.cpuDiscardExecutionSourceCounts[source] || 0) + 1;
            const tag = row && row.reasonTag ? row.reasonTag : "";
            if (tag) out.cpuDiscardReasonTagCounts[tag] = (out.cpuDiscardReasonTagCounts[tag] || 0) + 1;
            if (row && row.shadowAgree === true) out.cpuDiscardShadowAgreeCount += 1;
            if (row && (row.shadowAgree === true || row.shadowAgree === false)) out.cpuDiscardShadowComparableCount += 1;
            return;
          }
          if (kind === "cpu_open"){
            out.cpuOpenCount += 1;
            const tag = row && row.reasonTag ? row.reasonTag : "";
            if (tag) out.cpuOpenReasonTagCounts[tag] = (out.cpuOpenReasonTagCounts[tag] || 0) + 1;
            return;
          }

          if (kind !== "default") return;
          const eventType = row && row.eventType ? row.eventType : "";
          const seatIndex = Number(row && row.seatIndex);

          if (eventType === "draw" && seatIndex === 0) out.drawCount += 1;
          if (eventType === "discard" && seatIndex === 0) out.playerDiscardCount += 1;
          if (eventType === "pei" && seatIndex === 0) out.peiCount += 1;
          if (eventType === "settlement") out.settlementCount += 1;
          if (eventType === "riichi" && seatIndex === 0){
            out.playerRiichiCount += 1;
            if (Number(row.junme) > 0) out.playerRiichiJunmes.push(Number(row.junme));
          }
          if (eventType === "call_prompt" && seatIndex === 0) out.playerCallPromptCount += 1;
          if (eventType === "call_pass" && seatIndex === 0) out.playerCallPassCount += 1;
          if ((eventType === "call_pon" || eventType === "pon") && seatIndex === 0) out.playerPonCount += 1;
          if ((eventType === "call_minkan" || eventType === "minkan") && seatIndex === 0) out.playerMinkanCount += 1;
          if (eventType === "ankan" && seatIndex === 0) out.playerAnkanCount += 1;
          if (eventType === "kakan" && seatIndex === 0) out.playerKakanCount += 1;
          if (eventType === "agari_tsumo" && Number(row && row.seatIndex) === 0) out.playerAgariCount += 1;
          if (eventType === "agari_ron" && Number(row && row.seatIndex) === 0) out.playerAgariCount += 1;
        });

        const sourceKyoku = kyoku && kyoku.source ? kyoku.source : null;
        const settlement = sourceKyoku && sourceKyoku.settlement && typeof sourceKyoku.settlement === "object" ? sourceKyoku.settlement : null;
        if (settlement && settlement.type === "agari"){
          if (isPlayerAgariSettlement(settlement)){
            out.playerAgariCount += 1;
            const agariPoint = getSettlementPlayerAgariPoint(settlement);
            if (Number.isFinite(agariPoint)) out.playerAgariPoints.push(Number(agariPoint));
          } else if (settlement.winType === "ron" && Number(settlement.discarderSeatIndex) === 0){
            out.playerHojuCount += 1;
          }
        }

        const riichiEvent = getRiichiEventForPlayer(sourceKyoku);
        if (riichiEvent){
          const payload = getPayload(riichiEvent);
          const junme = Number(payload.junme) || 0;
          if (junme > 0 && !out.playerRiichiJunmes.includes(junme)){
            // already counted in rows if normalized, but raw fallback safe
          }

          const tenpai = payload.tenpai && typeof payload.tenpai === "object" ? payload.tenpai : null;
          const isRyanmen = !!(tenpai && tenpai.isRyanmenWait);
          const playerWon = isPlayerAgariSettlement(settlement);
          const agariPoint = getSettlementPlayerAgariPoint(settlement);

          if (playerWon){
            out.playerRiichiAgariCount += 1;
            if (Number.isFinite(agariPoint)) out.playerRiichiAgariPoints.push(Number(agariPoint));
          }

          if (isRyanmen){
            out.playerRyanmenRiichiCount += 1;
            if (playerWon){
              out.playerRyanmenRiichiAgariCount += 1;
              if (Number.isFinite(agariPoint)) out.playerRyanmenRiichiAgariPoints.push(Number(agariPoint));
            }
          }
        }
      });
    });

    out.playerRiichiRate = formatPercentFromCounts(out.playerRiichiCount, out.kyokuCount);
    out.playerAgariRate = formatPercentFromCounts(out.playerAgariCount, out.kyokuCount);
    out.playerHojuRate = formatPercentFromCounts(out.playerHojuCount, out.kyokuCount);
    out.playerCallPassRate = formatPercentFromCounts(out.playerCallPassCount, out.playerCallPromptCount);
    out.playerRiichiAgariRate = formatPercentFromCounts(out.playerRiichiAgariCount, out.playerRiichiCount);
    out.playerRyanmenRiichiAgariRate = formatPercentFromCounts(out.playerRyanmenRiichiAgariCount, out.playerRyanmenRiichiCount);
    out.cpuDiscardShadowAgreeRate = formatPercentFromCounts(out.cpuDiscardShadowAgreeCount, out.cpuDiscardShadowComparableCount);

    out.playerAverageAgariPoint = averageFrom(out.playerAgariPoints);
    out.playerAverageRiichiJunme = averageFrom(out.playerRiichiJunmes);
    out.playerAverageRiichiAgariPoint = averageFrom(out.playerRiichiAgariPoints);
    out.playerAverageRyanmenRiichiAgariPoint = averageFrom(out.playerRyanmenRiichiAgariPoints);

    return out;
  }

  global.MBSanmaLogMetrics = { summarizeLogs };
})(window);
