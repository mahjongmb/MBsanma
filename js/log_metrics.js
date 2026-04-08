// ========= log_metrics.js（ログ簡易集計） =========
// 役割：
// - 正規化ログから最低限の件数集計を返す
// - 将来の分析画面の土台にする

(function(global){
  "use strict";

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

    logs.forEach((log)=>{
      const kyokus = Array.isArray(log && log.kyokus) ? log.kyokus : [];
      out.kyokuCount += kyokus.length;
      kyokus.forEach((kyoku)=>{
        out.rowCount += Number(kyoku && kyoku.rowCount) || 0;
        out.rawEventCount += Number(kyoku && kyoku.rawEventCount) || 0;
        const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
        rows.forEach((row)=>{
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

  global.MBSanmaLogMetrics = { summarizeLogs };
})(window);
