// ========= log_metrics.js（ログ簡易集計） =========
// 役割：
// - 正規化ログから最低限の件数集計を返す
// - 将来の分析画面の土台にする

(function(global){
  "use strict";

  function bumpCount(map, key){
    const nextKey = String(key || "");
    if (!nextKey) return;
    map[nextKey] = (Number(map[nextKey]) || 0) + 1;
  }

  function summarizeLogs(normalizedLogs){
    const logs = Array.isArray(normalizedLogs) ? normalizedLogs : [];
    let explicitPlayerRiichiCount = 0;
    let discardRiichiFallbackCount = 0;

    const out = {
      matchCount: logs.length,
      kyokuCount: 0,
      rowCount: 0,
      rawEventCount: 0,

      cpuDiscardCount: 0,
      cpuOpenCount: 0,

      playerDiscardCount: 0,
      playerDrawCount: 0,
      playerPeiCount: 0,
      playerRiichiCount: 0,

      playerPonCount: 0,
      playerMinkanCount: 0,
      playerAnkanCount: 0,
      playerKakanCount: 0,
      playerOpenCallCount: 0,

      playerTsumoAgariCount: 0,
      playerRonAgariCount: 0,
      playerAgariCount: 0,
      playerHojuCount: 0,

      callPromptCount: 0,
      callPassCount: 0,

      drawCount: 0,
      settlementCount: 0,
      ryukyokuCount: 0,

      shadowComparableCount: 0,
      shadowAgreeCount: 0,
      shadowDisagreeCount: 0,

      executionSourceCounts: {
        external: 0,
        internal: 0,
        legacy: 0,
        other: 0
      },

      reasonTagCounts: {}
    };

    logs.forEach((log)=>{
      const kyokus = Array.isArray(log && log.kyokus) ? log.kyokus : [];
      out.kyokuCount += kyokus.length;

      kyokus.forEach((kyoku)=>{
        out.rowCount += Number(kyoku && kyoku.rowCount) || 0;
        out.rawEventCount += Number(kyoku && kyoku.rawEventCount) || 0;

        const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
        rows.forEach((row)=>{
          const kind = row && row.kind ? row.kind : "";
          const eventType = row && row.eventType ? row.eventType : "";
          const seatIndex = Number.isInteger(row && row.seatIndex) ? row.seatIndex : null;

          if (kind === "cpu_discard"){
            out.cpuDiscardCount += 1;

            if (row && row.shadowAgree === true){
              out.shadowComparableCount += 1;
              out.shadowAgreeCount += 1;
            }else if (row && row.shadowAgree === false){
              out.shadowComparableCount += 1;
              out.shadowDisagreeCount += 1;
            }

            const source = String(row && row.executionSource || "");
            if (source === "external"){
              out.executionSourceCounts.external += 1;
            }else if (source === "legacy"){
              out.executionSourceCounts.legacy += 1;
            }else if (source === "internal_eval" || source === "internal_eval_fallback"){
              out.executionSourceCounts.internal += 1;
            }else if (source){
              out.executionSourceCounts.other += 1;
            }

            if (row && row.reasonTag){
              bumpCount(out.reasonTagCounts, row.reasonTag);
            }
            return;
          }

          if (kind === "cpu_open"){
            out.cpuOpenCount += 1;
            if (row && row.reasonTag){
              bumpCount(out.reasonTagCounts, row.reasonTag);
            }
            return;
          }

          if (eventType === "draw"){
            out.drawCount += 1;
            if (seatIndex === 0) out.playerDrawCount += 1;
            return;
          }

          if (eventType === "discard"){
            if (seatIndex === 0) out.playerDiscardCount += 1;
            if (seatIndex === 0 && row && row.isRiichiDeclare){
              discardRiichiFallbackCount += 1;
            }
            return;
          }

          if (eventType === "riichi"){
            if (seatIndex === 0) explicitPlayerRiichiCount += 1;
            return;
          }

          if (eventType === "pei"){
            if (seatIndex === 0) out.playerPeiCount += 1;
            return;
          }

          if (eventType === "pon"){
            if (seatIndex === 0){
              out.playerPonCount += 1;
              out.playerOpenCallCount += 1;
            }
            return;
          }

          if (eventType === "minkan"){
            if (seatIndex === 0){
              out.playerMinkanCount += 1;
              out.playerOpenCallCount += 1;
            }
            return;
          }

          if (eventType === "ankan"){
            if (seatIndex === 0){
              out.playerAnkanCount += 1;
            }
            return;
          }

          if (eventType === "kakan"){
            if (seatIndex === 0){
              out.playerKakanCount += 1;
              out.playerOpenCallCount += 1;
            }
            return;
          }

          if (eventType === "agari_tsumo"){
            if (row && row.winnerSeatIndex === 0){
              out.playerTsumoAgariCount += 1;
              out.playerAgariCount += 1;
            }
            return;
          }

          if (eventType === "agari_ron"){
            if (row && row.winnerSeatIndex === 0){
              out.playerRonAgariCount += 1;
              out.playerAgariCount += 1;
            }
            if (row && row.discarderSeatIndex === 0 && row.winnerSeatIndex !== 0){
              out.playerHojuCount += 1;
            }
            return;
          }

          if (eventType === "ryukyoku_exhaustion"){
            out.ryukyokuCount += 1;
            return;
          }

          if (eventType === "call_prompt"){
            out.callPromptCount += 1;
            return;
          }

          if (eventType === "call_pass"){
            out.callPassCount += 1;
            return;
          }

          if (eventType === "settlement"){
            out.settlementCount += 1;
          }
        });
      });
    });

    out.playerRiichiCount = explicitPlayerRiichiCount > 0 ? explicitPlayerRiichiCount : discardRiichiFallbackCount;
    return out;
  }

  global.MBSanmaLogMetrics = { summarizeLogs };
})(window);
