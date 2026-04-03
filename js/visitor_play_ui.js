// ========= visitor_play_ui.js（店外用プレイ画面UI） =========
// 役割：
// - 上部3ボタンを店外向けに最適化する
// - ルール確認オーバーレイを出す
// - 直近3半荘の簡易成績オーバーレイを出す
// - 既存の局進行ロジックは触らず、後付けで集計する

(function(){
  "use strict";

  const HISTORY_STORAGE_KEY = "mbsanma_visitor_recent_hanchans_v1";
  const TRACKER_STORAGE_KEY = "mbsanma_visitor_current_hanchan_v1";
  const HISTORY_LIMIT = 3;

  const tracker = loadTracker();

  injectVisitorOverlayStyles();

  function loadTracker(){
    try{
      const raw = localStorage.getItem(TRACKER_STORAGE_KEY);
      if (raw){
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object"){
          return normalizeTracker(parsed);
        }
      }
    }catch(e){}
    return normalizeTracker(null);
  }

  function normalizeTracker(src){
    const next = {
      kyokuCount: 0,
      furoKyokuCount: 0,
      riichiAgariCount: 0,
      furoAgariCount: 0,
      damaAgariCount: 0,
      lastRoundSignature: "",
      lastSavedHanchanSignature: ""
    };
    if (src && typeof src === "object"){
      if (Number.isFinite(src.kyokuCount)) next.kyokuCount = Math.max(0, src.kyokuCount | 0);
      if (Number.isFinite(src.furoKyokuCount)) next.furoKyokuCount = Math.max(0, src.furoKyokuCount | 0);
      if (Number.isFinite(src.riichiAgariCount)) next.riichiAgariCount = Math.max(0, src.riichiAgariCount | 0);
      if (Number.isFinite(src.furoAgariCount)) next.furoAgariCount = Math.max(0, src.furoAgariCount | 0);
      if (Number.isFinite(src.damaAgariCount)) next.damaAgariCount = Math.max(0, src.damaAgariCount | 0);
      if (typeof src.lastRoundSignature === "string") next.lastRoundSignature = src.lastRoundSignature;
      if (typeof src.lastSavedHanchanSignature === "string") next.lastSavedHanchanSignature = src.lastSavedHanchanSignature;
    }
    return next;
  }

  function saveTracker(){
    try{
      localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(tracker));
    }catch(e){}
  }

  function resetTrackerRoundState(clearSavedSignature){
    tracker.kyokuCount = 0;
    tracker.furoKyokuCount = 0;
    tracker.riichiAgariCount = 0;
    tracker.furoAgariCount = 0;
    tracker.damaAgariCount = 0;
    tracker.lastRoundSignature = "";
    if (clearSavedSignature) tracker.lastSavedHanchanSignature = "";
    saveTracker();
  }

  function readHistory(){
    try{
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item)=> item && typeof item === "object") : [];
    }catch(e){
      return [];
    }
  }

  function writeHistory(list){
    try{
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list.slice(0, HISTORY_LIMIT) : []));
    }catch(e){}
  }

  function injectVisitorOverlayStyles(){
    if (document.getElementById("visitorPlayUiStyle")) return;
    const style = document.createElement("style");
    style.id = "visitorPlayUiStyle";
    style.textContent = `
      .visitorOverlay{
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.58);
        z-index: 5000;
        box-sizing: border-box;
      }
      .visitorOverlay.isOpen{
        display: flex;
      }
      .visitorPanel{
        width: min(760px, 94vw);
        max-height: 88vh;
        overflow: auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.14);
        background: linear-gradient(180deg, rgba(20,32,26,0.98) 0%, rgba(12,18,15,0.98) 100%);
        box-shadow: 0 22px 56px rgba(0,0,0,0.42);
        color: #f5f7f4;
        padding: 20px;
        box-sizing: border-box;
      }
      .visitorPanelHeader{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .visitorPanelTitleWrap{
        display: grid;
        gap: 4px;
      }
      .visitorPanelTitle{
        font-size: 24px;
        font-weight: 900;
        line-height: 1.15;
      }
      .visitorPanelSub{
        font-size: 12px;
        line-height: 1.4;
        color: rgba(245,247,244,0.68);
      }
      .visitorPanelClose{
        appearance: none;
        border: 0;
        border-radius: 999px;
        min-width: 42px;
        height: 42px;
        padding: 0 14px;
        background: rgba(255,255,255,0.10);
        color: #ffffff;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }

      .visitorRuleTabs{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }
      .visitorRuleTabBtn{
        appearance: none;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 999px;
        min-height: 38px;
        padding: 0 14px;
        background: rgba(255,255,255,0.04);
        color: rgba(245,247,244,0.78);
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .visitorRuleTabBtn.isActive{
        background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06)), rgba(76, 119, 98, 0.78);
        border-color: rgba(182, 227, 201, 0.24);
        color: #ffffff;
        box-shadow: 0 10px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12);
      }
      .visitorRulePanels{
        display: grid;
        gap: 12px;
      }
      .visitorRulePanel{
        display: none;
      }
      .visitorRulePanel.isActive{
        display: block;
      }
      .visitorRulePanelHead{
        display: grid;
        gap: 4px;
        margin-bottom: 12px;
      }
      .visitorRulePanelTitle{
        font-size: 18px;
        font-weight: 900;
        line-height: 1.2;
      }
      .visitorRulePanelSub{
        font-size: 13px;
        line-height: 1.55;
        color: rgba(245,247,244,0.72);
      }
      .visitorRuleList{
        display: grid;
        gap: 10px;
      }
      .visitorRuleCard{
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.04);
        padding: 14px;
      }
      .visitorRuleCardTitle{
        font-size: 15px;
        font-weight: 800;
        margin-bottom: 8px;
      }
      .visitorRuleCardText{
        font-size: 14px;
        line-height: 1.65;
        color: rgba(245,247,244,0.92);
      }
      .visitorRuleLines{
        display: grid;
        gap: 8px;
      }
      .visitorRuleLine{
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,0.16);
        border: 1px solid rgba(255,255,255,0.06);
      }
      .visitorRuleLineStrong{
        display: block;
        font-size: 14px;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .visitorRuleLineText{
        font-size: 13px;
        line-height: 1.6;
        color: rgba(245,247,244,0.84);
      }
      .visitorRulePills{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .visitorRulePill{
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(122, 183, 153, 0.14);
        border: 1px solid rgba(182, 227, 201, 0.18);
        color: #f7fffb;
        font-size: 13px;
        font-weight: 700;
      }
      .visitorRuleNotice{
        margin-top: 10px;
        padding: 12px 13px;
        border-radius: 12px;
        background: rgba(215, 182, 109, 0.10);
        border: 1px solid rgba(215, 182, 109, 0.20);
        color: rgba(255,245,220,0.94);
        font-size: 13px;
        line-height: 1.65;
      }
      .visitorYakuGroups{
        display: grid;
        gap: 10px;
      }
      .visitorYakuGroupTitle{
        font-size: 14px;
        font-weight: 900;
        margin-bottom: 8px;
      }
      .visitorYakuList{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .visitorYakuItem{
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: rgba(245,247,244,0.92);
        font-size: 13px;
        font-weight: 700;
      }
      .visitorRuleFootnote{
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.70);
      }
      .visitorStatsSection{
        display: grid;
        gap: 14px;
      }
      .visitorStatsCards{
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .visitorStatsCard{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03));
        padding: 16px;
        min-height: 144px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .visitorStatsCardTop{
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }
      .visitorStatsCardRound{
        font-size: 12px;
        font-weight: 800;
        color: rgba(245,247,244,0.68);
      }
      .visitorStatsCardRank{
        font-size: 26px;
        font-weight: 900;
        line-height: 1;
      }
      .visitorStatsCardPoint{
        font-size: 24px;
        font-weight: 900;
        line-height: 1.05;
        margin-bottom: 8px;
      }
      .visitorStatsCardSub{
        font-size: 13px;
        color: rgba(245,247,244,0.82);
        line-height: 1.55;
      }
      .visitorStatsMain{
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
        gap: 14px;
      }
      .visitorStatsPanel{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(180deg, rgba(20,35,62,0.88), rgba(24,34,58,0.82));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
        padding: 16px;
      }
      .visitorStatsPanelHead{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }
      .visitorStatsPanelTitle{
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 0.02em;
      }
      .visitorStatsPanelSub{
        font-size: 12px;
        line-height: 1.5;
        color: rgba(245,247,244,0.70);
      }
      .visitorStatsHelpBtn{
        appearance: none;
        border: 1px solid rgba(255,212,122,0.34);
        background: rgba(255,212,122,0.12);
        color: #ffd889;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        font-size: 15px;
        font-weight: 900;
        cursor: pointer;
        flex: 0 0 auto;
      }
      .visitorStatsHelpBox{
        display: none;
        margin-top: 10px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(5,10,20,0.28);
        padding: 12px;
        font-size: 12px;
        line-height: 1.7;
        color: rgba(245,247,244,0.84);
      }
      .visitorStatsHelpBox.isOpen{
        display: block;
      }
      .visitorStyleWrap{
        display: grid;
        grid-template-columns: 178px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
      }
      .visitorStyleScoreList{
        display: grid;
        gap: 8px;
      }
      .visitorStyleScoreRow{
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 800;
      }
      .visitorStyleScoreKey{
        font-size: 15px;
      }
      .visitorStyleScoreLabel{
        color: rgba(245,247,244,0.92);
      }
      .visitorStyleScoreValue{
        color: #fff3c5;
      }
      .visitorStyleRadarBox{
        display: grid;
        place-items: center;
      }
      .visitorStyleRadarSvg{
        width: 178px;
        height: 178px;
      }
      .visitorStatsRightStack{
        display: grid;
        gap: 14px;
      }
      .visitorStatsMiniPanel{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(180deg, rgba(20,35,62,0.88), rgba(24,34,58,0.82));
        padding: 16px;
      }
      .visitorStatsMiniTitle{
        font-size: 18px;
        font-weight: 900;
        margin-bottom: 12px;
      }
      .visitorWinSplit{
        display: grid;
        grid-template-columns: 150px minmax(0, 1fr);
        gap: 16px;
        align-items: center;
      }
      .visitorDonut{
        width: 150px;
        height: 150px;
        border-radius: 50%;
        position: relative;
        margin: 0 auto;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10);
      }
      .visitorDonut::after{
        content: "";
        position: absolute;
        inset: 26px;
        border-radius: 50%;
        background: rgba(27,39,68,0.96);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
      }
      .visitorDonutCenter{
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        text-align: center;
        z-index: 1;
        font-size: 12px;
        font-weight: 700;
        color: rgba(245,247,244,0.78);
      }
      .visitorDonutCenter strong{
        display: block;
        font-size: 24px;
        color: #ffffff;
      }
      .visitorLegend{
        display: grid;
        gap: 10px;
      }
      .visitorLegendRow{
        display: grid;
        grid-template-columns: 14px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 700;
      }
      .visitorLegendDot{
        width: 14px;
        height: 14px;
        border-radius: 999px;
      }
      .visitorLegendLabel{
        color: rgba(245,247,244,0.88);
      }
      .visitorLegendValue{
        color: #ffd56f;
      }
      .visitorRankBars{
        display: grid;
        gap: 12px;
      }
      .visitorRankBarRow{
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
      }
      .visitorRankBarLabel{
        font-size: 14px;
        font-weight: 800;
        color: rgba(245,247,244,0.88);
      }
      .visitorRankBarTrack{
        position: relative;
        height: 22px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
        box-shadow: inset 0 1px 2px rgba(0,0,0,0.24);
      }
      .visitorRankBarFill{
        position: absolute;
        inset: 0 auto 0 0;
        border-radius: 999px;
      }
      .visitorRankBarValue{
        font-size: 14px;
        font-weight: 900;
        color: #ffd56f;
      }
      .visitorStatsTablePanel{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(180deg, rgba(20,35,62,0.88), rgba(24,34,58,0.82));
        padding: 16px;
      }
      .visitorStatsTableTitle{
        font-size: 18px;
        font-weight: 900;
        margin-bottom: 12px;
      }
      .visitorStatsTableGrid{
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }
      .visitorStatsTableCell{
        border-radius: 14px;
        background: rgba(0,0,0,0.16);
        border: 1px solid rgba(255,255,255,0.08);
        padding: 12px 10px;
        min-height: 82px;
        display: grid;
        align-content: start;
        gap: 8px;
      }
      .visitorStatsTableLabel{
        font-size: 12px;
        font-weight: 700;
        color: rgba(245,247,244,0.72);
      }
      .visitorStatsTableValue{
        font-size: 20px;
        font-weight: 900;
        line-height: 1.1;
        color: #ffd56f;
      }
      .visitorStatsTableHint{
        font-size: 11px;
        line-height: 1.5;
        color: rgba(245,247,244,0.48);
      }
      .visitorStatsEmpty{
        border-radius: 16px;
        border: 1px dashed rgba(255,255,255,0.18);
        background: linear-gradient(180deg, rgba(20,35,62,0.72), rgba(24,34,58,0.68));
        padding: 18px;
        font-size: 14px;
        line-height: 1.75;
        color: rgba(245,247,244,0.82);
      }
      @media (orientation: landscape) and (max-height: 520px){
        .visitorOverlay{
          padding: 10px;
        }
        .visitorPanel{
          width: min(900px, 96vw);
          max-height: 94vh;
          padding: 14px;
          border-radius: 14px;
        }
        .visitorPanelHeader{
          margin-bottom: 10px;
        }
        .visitorPanelTitle{
          font-size: 18px;
        }
        .visitorPanelSub{
          font-size: 11px;
        }
        .visitorPanelClose{
          min-width: 38px;
          height: 38px;
          font-size: 12px;
        }
        .visitorRuleList{
          gap: 8px;
        }
        .visitorRuleCard{
          padding: 10px;
        }
        .visitorRuleCardTitle{
          font-size: 13px;
          margin-bottom: 4px;
        }
        .visitorRuleCardText{
          font-size: 12px;
          line-height: 1.55;
        }
        .visitorStatsSection{
          gap: 10px;
        }
        .visitorStatsCards{
          gap: 8px;
        }
        .visitorStatsCard{
          min-height: 108px;
          padding: 10px;
        }
        .visitorStatsCardRank,
        .visitorStatsCardPoint{
          font-size: 18px;
        }
        .visitorStatsCardSub,
        .visitorStatsCardRound{
          font-size: 11px;
        }
        .visitorStatsSummary{
          padding: 12px;
        }
        .visitorStatsSummaryTitle{
          font-size: 13px;
          margin-bottom: 8px;
        }
        .visitorStatsGrid{
          gap: 8px;
        }
        .visitorStatsMetric{
          padding: 10px 8px;
        }
        .visitorStatsMetricLabel{
          font-size: 10px;
          margin-bottom: 6px;
        }
        .visitorStatsMetricValue{
          font-size: 18px;
        }
        .visitorStatsEmpty{
          padding: 12px;
          font-size: 12px;
          line-height: 1.55;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function makeOverlayShell(id, title, subtitle){
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "visitorOverlay";
    overlay.setAttribute("aria-hidden", "true");

    const panel = document.createElement("div");
    panel.className = "visitorPanel";
    panel.addEventListener("click", (ev)=> ev.stopPropagation());

    const header = document.createElement("div");
    header.className = "visitorPanelHeader";

    const titleWrap = document.createElement("div");
    titleWrap.className = "visitorPanelTitleWrap";

    const titleEl = document.createElement("div");
    titleEl.className = "visitorPanelTitle";
    titleEl.textContent = title;

    const subEl = document.createElement("div");
    subEl.className = "visitorPanelSub";
    subEl.textContent = subtitle;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "visitorPanelClose";
    closeBtn.textContent = "閉じる";

    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(subEl);
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    overlay.appendChild(panel);

    overlay.addEventListener("click", ()=> closeVisitorOverlay(overlay));
    closeBtn.addEventListener("click", ()=> closeVisitorOverlay(overlay));

    document.body.appendChild(overlay);
    return { overlay, panel };
  }

  function openVisitorOverlay(overlay){
    if (!overlay) return;
    overlay.classList.add("isOpen");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeVisitorOverlay(overlay){
    if (!overlay) return;
    overlay.classList.remove("isOpen");
    overlay.setAttribute("aria-hidden", "true");
  }


  function ensureRuleOverlay(){
    let overlay = document.getElementById("visitorRuleOverlay");
    if (overlay) return overlay;

    const shell = makeOverlayShell(
      "visitorRuleOverlay",
      "ルール確認",
      ""
    );
    overlay = shell.overlay;

    const tabData = [
      {
        key: "outline",
        label: "概要",
        title: "概要",
        subtitle: "",
        cards: [
          {
            title: "ゲームの大枠",
            lines: [
              { strong: "東南戦" },
              { strong: "35,000点持ち / 40,000点返し" },
              { strong: "箱下精算なし" },
              { strong: "80,000点以上でコールド終了" },
              { strong: "0点ちょうどは飛び扱い" },
              { strong: "1,000点ちょうどのリーチは可能" }
            ]
          },
          {
            title: "レート・祝儀",
            lines: [
              { strong: "1000点100P" },
              { strong: "一発・赤・裏 各300P" },
              { strong: "役満祝儀 ツモ2,000Pオール / ロン3,000P" }
            ]
          }
        ]
      },
      {
        key: "settlement",
        label: "点数・精算",
        title: "点数・精算",
        subtitle: "",
        cards: [
          {
            title: "順位ウマ",
            lines: [
              { strong: "通常時 1位 +15 / 2位 -5 / 3位 -10" },
              { strong: "2着が40,000点以上の場合 1位 +10 / 2位 +5 / 3位 -15" }
            ]
          },
          {
            title: "アガリ・供託まわり",
            lines: [
              { strong: "一本場 1,000点" },
              { strong: "親は聴牌連荘" },
              { strong: "形式聴牌あり" }
            ]
          },
          {
            title: "ドラ・祝儀牌",
            pills: ["赤5索 × 2", "赤5筒 × 2", "北抜きドラ", "虹北 × 1"],
            notice: "虹北のみ、鳴き祝儀が1枚つきます。"
          }
        ]
      },
      {
        key: "basic",
        label: "基本",
        title: "基本ルール",
        subtitle: "",
        cards: [
          {
            title: "進行・アガリまわり",
            lines: [
              { strong: "親は聴牌連荘" },
              { strong: "形式聴牌あり" },
              { strong: "北抜きドラ / 喰いタン / 後付け / ツモピンあり" },
              { strong: "虹北のみ鳴き祝儀1枚" },
              { strong: "ツモ損なし" },
              { strong: "符計算あり" },
              { strong: "途中流局なし" }
            ]
          },
          {
            title: "リーチ・山・終了条件",
            lines: [
              { strong: "リーチ後の見逃しあり" },
              { strong: "フリテンリーチあり" },
              { strong: "山は七トン残し" },
              { strong: "80,000点以上でコールド終了" },
              { strong: "ダブロンあり" }
            ]
          }
        ]
      },
      {
        key: "supplement",
        label: "補足",
        title: "補足ルール",
        subtitle: "",
        cards: [
          {
            title: "役・アガリ関係",
            lines: [
              { strong: "数え役満あり（祝儀なし）" },
              { strong: "ダブル役満あり" },
              { strong: "大三元・四喜和のパオなし" },
              { strong: "流し倍満あり" },
              { strong: "人和は4翻役" }
            ]
          },
          {
            title: "槓・リーチ関係",
            lines: [
              { strong: "大明槓の責任払いなし" },
              { strong: "国士無双の暗槓ロンなし" },
              { strong: "オープンリーチなし" },
              { strong: "リーチ後の暗槓は待ちが変わらなければ可能" },
              { strong: "全ての槓はドラ先めくり" }
            ]
          },
          {
            title: "符・北について",
            lines: [
              { strong: "連風牌の雀頭は2符" },
              { strong: "自摸番がなくてもリーチ可能" },
              { strong: "北は抜きドラ" },
              { strong: "北の手中利用には制限あり" }
            ]
          }
        ]
      },
      {
        key: "yaku",
        label: "採用役",
        title: "採用役一覧",
        subtitle: "",
        yakuGroups: [
          {
            title: "1翻役",
            items: ["立直", "一発", "門前清自摸和", "断么九", "平和", "一盃口", "役牌（白・發・中・場風・自風）", "海底摸月", "河底撈魚", "嶺上開花", "槍槓"]
          },
          {
            title: "2翻役",
            items: ["ダブル立直", "七対子", "対々和", "三暗刻", "混全帯么九", "純全帯么九", "一気通貫", "混老頭", "小三元", "混一色"]
          },
          {
            title: "3翻以上",
            items: ["二盃口", "清一色", "流し倍満", "人和（4翻役）"]
          },
          {
            title: "役満",
            items: ["国士無双", "四暗刻", "大三元", "字一色", "緑一色", "清老頭", "小四喜", "大四喜", "九蓮宝燈", "四槓子", "天和", "地和"]
          }
        ],
        footnote: "※ 北は役牌としては採用していません。※ 三色同順・三色同刻など、萬子が必要になる役はこのルールでは基本的に出現しません。"
      }
    ];

    const tabs = document.createElement("div");
    tabs.className = "visitorRuleTabs";

    const panels = document.createElement("div");
    panels.className = "visitorRulePanels";

    const tabButtons = [];
    const panelEls = [];

    const setActiveTab = (key)=>{
      tabButtons.forEach((btn)=>{
        const active = btn.dataset.ruleTabKey === key;
        btn.classList.toggle("isActive", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      panelEls.forEach((panel)=>{
        panel.classList.toggle("isActive", panel.dataset.rulePanelKey === key);
      });
    };

    for (const tab of tabData){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "visitorRuleTabBtn";
      btn.textContent = tab.label;
      btn.dataset.ruleTabKey = tab.key;
      btn.setAttribute("aria-selected", "false");
      btn.addEventListener("click", ()=> setActiveTab(tab.key));
      tabButtons.push(btn);
      tabs.appendChild(btn);

      const panel = document.createElement("div");
      panel.className = "visitorRulePanel";
      panel.dataset.rulePanelKey = tab.key;

      const head = document.createElement("div");
      head.className = "visitorRulePanelHead";

      const headTitle = document.createElement("div");
      headTitle.className = "visitorRulePanelTitle";
      headTitle.textContent = tab.title;

      head.appendChild(headTitle);
      if (tab.subtitle){
        const headSub = document.createElement("div");
        headSub.className = "visitorRulePanelSub";
        headSub.textContent = tab.subtitle;
        head.appendChild(headSub);
      }
      panel.appendChild(head);

      if (Array.isArray(tab.cards) && tab.cards.length > 0){
        const list = document.createElement("div");
        list.className = "visitorRuleList";

        for (const cardData of tab.cards){
          const card = document.createElement("div");
          card.className = "visitorRuleCard";

          const cardTitle = document.createElement("div");
          cardTitle.className = "visitorRuleCardTitle";
          cardTitle.textContent = cardData.title || "";
          card.appendChild(cardTitle);

          if (Array.isArray(cardData.lines) && cardData.lines.length > 0){
            const lines = document.createElement("div");
            lines.className = "visitorRuleLines";
            for (const lineData of cardData.lines){
              const line = document.createElement("div");
              line.className = "visitorRuleLine";

              const strong = document.createElement("span");
              strong.className = "visitorRuleLineStrong";
              strong.textContent = lineData.strong || "";

              line.appendChild(strong);
              if (lineData.text){
                const lineText = document.createElement("span");
                lineText.className = "visitorRuleLineText";
                lineText.textContent = lineData.text;
                line.appendChild(lineText);
              }
              lines.appendChild(line);
            }
            card.appendChild(lines);
          }

          if (Array.isArray(cardData.pills) && cardData.pills.length > 0){
            const pillWrap = document.createElement("div");
            pillWrap.className = "visitorRulePills";
            for (const pillText of cardData.pills){
              const pill = document.createElement("div");
              pill.className = "visitorRulePill";
              pill.textContent = pillText;
              pillWrap.appendChild(pill);
            }
            card.appendChild(pillWrap);
          }

          if (cardData.notice){
            const notice = document.createElement("div");
            notice.className = "visitorRuleNotice";
            notice.textContent = cardData.notice;
            card.appendChild(notice);
          }

          list.appendChild(card);
        }

        panel.appendChild(list);
      }

      if (Array.isArray(tab.yakuGroups) && tab.yakuGroups.length > 0){
        const groupWrap = document.createElement("div");
        groupWrap.className = "visitorYakuGroups";

        for (const groupData of tab.yakuGroups){
          const card = document.createElement("div");
          card.className = "visitorRuleCard";

          const groupTitle = document.createElement("div");
          groupTitle.className = "visitorYakuGroupTitle";
          groupTitle.textContent = groupData.title || "";

          const yakuList = document.createElement("div");
          yakuList.className = "visitorYakuList";
          for (const itemText of (groupData.items || [])){
            const item = document.createElement("div");
            item.className = "visitorYakuItem";
            item.textContent = itemText;
            yakuList.appendChild(item);
          }

          card.appendChild(groupTitle);
          card.appendChild(yakuList);
          groupWrap.appendChild(card);
        }

        if (tab.footnote){
          const footnote = document.createElement("div");
          footnote.className = "visitorRuleFootnote";
          footnote.textContent = tab.footnote;
          groupWrap.appendChild(footnote);
        }

        panel.appendChild(groupWrap);
      }

      panelEls.push(panel);
      panels.appendChild(panel);
    }

    shell.panel.appendChild(tabs);
    shell.panel.appendChild(panels);
    if (tabData[0]) setActiveTab(tabData[0].key);
    return overlay;
  }

  function ensureStatsOverlay(){
    let overlay = document.getElementById("visitorStatsOverlay");
    if (overlay) return overlay;

    const shell = makeOverlayShell(
      "visitorStatsOverlay",
      "成績",
      "直近3半荘の結果と、あなたの簡易成績をまとめて表示します。"
    );
    overlay = shell.overlay;

    const root = document.createElement("div");
    root.className = "visitorStatsSection";
    root.id = "visitorStatsRoot";
    shell.panel.appendChild(root);
    return overlay;
  }

  function buildSettlementSignature(settlement){
    try{
      return JSON.stringify({
        type: settlement && settlement.type ? settlement.type : "",
        before: Array.isArray(settlement && settlement.beforeScores) ? settlement.beforeScores : [],
        after: Array.isArray(settlement && settlement.afterScores) ? settlement.afterScores : [],
        wind: (typeof roundWind !== "undefined") ? roundWind : "",
        number: (typeof roundNumber !== "undefined") ? roundNumber : 0,
        honba: (typeof honba !== "undefined") ? honba : 0,
        agariType: (typeof lastAgariType !== "undefined") ? lastAgariType : ""
      });
    }catch(e){
      return String(Date.now());
    }
  }

  function buildHanchanSignature(settlement){
    try{
      return JSON.stringify({
        after: Array.isArray(settlement && settlement.afterScores) ? settlement.afterScores : [],
        reason: settlement && settlement.reason ? settlement.reason : "",
        timestamp: (typeof Date !== "undefined") ? new Date().toISOString().slice(0, 16) : ""
      });
    }catch(e){
      return String(Date.now());
    }
  }

  function getSeatStat(seatIndex, key){
    try{
      if (typeof getHanchanEndSeatStatNumber === "function"){
        const v = getHanchanEndSeatStatNumber(seatIndex, key);
        if (Number.isFinite(v)) return v | 0;
      }
    }catch(e){}

    try{
      if (window.hanchanSeatStats && window.hanchanSeatStats[seatIndex] && Number.isFinite(window.hanchanSeatStats[seatIndex][key])){
        return window.hanchanSeatStats[seatIndex][key] | 0;
      }
    }catch(e){}

    return 0;
  }

  function getPlayerRankAndRows(afterScores){
    const scoresArr = Array.isArray(afterScores) ? afterScores.slice(0, 3) : [0, 0, 0];
    const rows = [0, 1, 2].map((seat)=> ({ seat, score: Number(scoresArr[seat]) || 0 }));
    rows.sort((a, b)=> b.score - a.score || a.seat - b.seat);
    const playerIndex = rows.findIndex((row)=> row.seat === 0);
    return { rows, playerIndex };
  }

  function getPlayerRankLabel(rankIndex){
    if (rankIndex === 0) return "1着";
    if (rankIndex === 1) return "2着";
    if (rankIndex === 2) return "3着";
    return "—";
  }

  function formatSignedChipText(value){
    const n = Number(value) || 0;
    if (n > 0) return `+${n}枚`;
    if (n < 0) return `${n}枚`;
    return "0枚";
  }

  function formatPointText(value){
    const n = Number(value) || 0;
    return `${n.toLocaleString("ja-JP")}点`;
  }

  function formatRate(numerator, denominator){
    const den = Number(denominator) || 0;
    if (den <= 0) return "—";
    const num = Number(numerator) || 0;
    return `${(num / den * 100).toFixed(1)}%`;
  }

  function playerHasOpenFuroThisRound(){
    if (!Array.isArray(melds) || melds.length <= 0) return false;
    return melds.some((m)=> m && (m.type === "pon" || m.type === "minkan" || m.type === "kakan"));
  }

  function getPlayerAgariEntriesFromSettlement(settlement){
    const out = [];
    if (!settlement || settlement.type !== "agari") return out;

    if (Array.isArray(settlement.agariEntries) && settlement.agariEntries.length > 0){
      settlement.agariEntries.forEach((entry)=>{
        if (entry && entry.winnerSeatIndex === 0) out.push(entry);
      });
      return out;
    }

    if (settlement.winnerSeatIndex === 0){
      out.push({
        winnerSeatIndex: 0,
        winType: settlement.winType || lastAgariType || null
      });
    }
    return out;
  }

  function notePlayerAgariStyleFromSettlement(settlement){
    const entries = getPlayerAgariEntriesFromSettlement(settlement);
    if (!entries.length) return;

    entries.forEach(()=>{
      if (typeof isRiichi !== "undefined" && isRiichi){
        tracker.riichiAgariCount = (tracker.riichiAgariCount | 0) + 1;
        return;
      }
      if (playerHasOpenFuroThisRound()){
        tracker.furoAgariCount = (tracker.furoAgariCount | 0) + 1;
        return;
      }
      tracker.damaAgariCount = (tracker.damaAgariCount | 0) + 1;
    });
  }

  function noteRoundSettlement(settlement){
    if (!settlement) return;
    const sig = buildSettlementSignature(settlement);
    if (tracker.lastRoundSignature === sig) return;

    tracker.lastRoundSignature = sig;
    tracker.kyokuCount = (tracker.kyokuCount | 0) + 1;
    if (playerHasOpenFuroThisRound()){
      tracker.furoKyokuCount = (tracker.furoKyokuCount | 0) + 1;
    }
    notePlayerAgariStyleFromSettlement(settlement);
    saveTracker();
  }

  function recordFinishedHanchan(endInfo, settlement){
    if (!settlement || !Array.isArray(settlement.afterScores)) return;

    const sig = buildHanchanSignature(settlement);
    if (tracker.lastSavedHanchanSignature === sig) return;
    tracker.lastSavedHanchanSignature = sig;

    const { rows, playerIndex } = getPlayerRankAndRows(settlement.afterScores);
    const rankLabel = getPlayerRankLabel(playerIndex);
    const point = Number(settlement.afterScores[0]) || 0;
    const chipCount = getSeatStat(0, "chip");
    const riichi = getSeatStat(0, "riichi");
    const agari = getSeatStat(0, "agari");
    const hoju = getSeatStat(0, "hoju");
    const kyokuCount = Math.max(0, tracker.kyokuCount | 0);
    const furoKyokuCount = Math.max(0, tracker.furoKyokuCount | 0);

    let scoreValue = null;
    try{
      if (typeof calcHanchanFinalScoreValue === "function"){
        scoreValue = calcHanchanFinalScoreValue(point, playerIndex, rows);
      }
    }catch(e){
      scoreValue = null;
    }

    const entry = {
      finishedAt: new Date().toISOString(),
      rankLabel,
      rankIndex: playerIndex,
      point,
      chipCount,
      scoreValue,
      riichi,
      agari,
      hoju,
      kyokuCount,
      furoKyokuCount,
      riichiAgariCount: Math.max(0, tracker.riichiAgariCount | 0),
      furoAgariCount: Math.max(0, tracker.furoAgariCount | 0),
      damaAgariCount: Math.max(0, tracker.damaAgariCount | 0),
      reason: endInfo && endInfo.reason ? endInfo.reason : "半荘終了"
    };

    const history = readHistory();
    history.unshift(entry);
    writeHistory(history.slice(0, HISTORY_LIMIT));
    saveTracker();
    resetTrackerRoundState(false);
  }

  function clampStatScore(value){
    const n = Number(value) || 0;
    if (n < 1) return 1;
    if (n > 99) return 99;
    return Math.round(n);
  }

  function averageFromHistory(history, key){
    if (!Array.isArray(history) || history.length <= 0) return 0;
    const total = history.reduce((sum, item)=> sum + (Number(item && item[key]) || 0), 0);
    return total / history.length;
  }

  function formatAverageRank(value){
    const n = Number(value) || 0;
    if (n <= 0) return "—";
    return n.toFixed(2);
  }

  function formatSignedScoreValue(value){
    if (!Number.isFinite(value)) return "—";
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
  }

  function formatAvgPoint(value){
    const n = Number(value) || 0;
    return `${Math.round(n).toLocaleString("ja-JP")}点`;
  }

  function buildStyleScores(history, metrics){
    const avgScoreValue = averageFromHistory(history, "scoreValue");
    const avgPoint = averageFromHistory(history, "point");
    const avgChip = averageFromHistory(history, "chipCount");
    const topRate = metrics.rankRates[0] || 0;
    const hojuRate = metrics.hojuRateValue || 0;
    const agariRate = metrics.agariRateValue || 0;
    const riichiRate = metrics.riichiRateValue || 0;
    const furoRate = metrics.furoRateValue || 0;

    return {
      attack: clampStatScore(42 + (topRate * 26) + Math.max(0, avgScoreValue) * 1.25 + Math.max(0, avgChip) * 2.8),
      defense: clampStatScore(92 - (hojuRate * 260) + ((1 - topRate) * 6)),
      speed: clampStatScore(18 + (agariRate * 200) + (riichiRate * 22) + (furoRate * 10)),
      luck: clampStatScore(40 + (topRate * 22) + Math.max(0, avgChip) * 4.2 + Math.max(0, (avgPoint - 35000) / 1700))
    };
  }

  function buildRadarSvg(styleScores){
    const size = 178;
    const center = size / 2;
    const outer = 60;
    const levels = [0.25, 0.5, 0.75, 1];
    const axes = [
      { key: "attack", label: "攻", color: "#ff6f91", angle: -90 },
      { key: "luck", label: "運", color: "#f7b343", angle: 0 },
      { key: "defense", label: "防", color: "#67e28d", angle: 90 },
      { key: "speed", label: "速", color: "#55d9ff", angle: 180 }
    ];

    const toPoint = (radiusScale, angleDeg)=>{
      const rad = angleDeg * Math.PI / 180;
      return {
        x: center + Math.cos(rad) * outer * radiusScale,
        y: center + Math.sin(rad) * outer * radiusScale
      };
    };

    const levelPolygons = levels.map((scale)=>{
      const pts = axes.map((axis)=>{
        const p = toPoint(scale, axis.angle);
        return `${p.x},${p.y}`;
      }).join(" ");
      return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1" />`;
    }).join("");

    const axisLines = axes.map((axis)=>{
      const p = toPoint(1, axis.angle);
      return `<line x1="${center}" y1="${center}" x2="${p.x}" y2="${p.y}" stroke="rgba(255,255,255,0.20)" stroke-width="2" />`;
    }).join("");

    const dataPoints = axes.map((axis)=>{
      const value = clampStatScore(styleScores[axis.key] || 0) / 100;
      const p = toPoint(value, axis.angle);
      return `${p.x},${p.y}`;
    }).join(" ");

    const labels = axes.map((axis)=>{
      const p = toPoint(1.18, axis.angle);
      return `<text x="${p.x}" y="${p.y}" fill="${axis.color}" font-size="15" font-weight="900" text-anchor="middle" dominant-baseline="middle">${axis.label}</text>`;
    }).join("");

    return `
      <svg class="visitorStyleRadarSvg" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <defs>
          <linearGradient id="visitorRadarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="rgba(255,219,95,0.95)" />
            <stop offset="100%" stop-color="rgba(255,173,38,0.92)" />
          </linearGradient>
        </defs>
        ${levelPolygons}
        ${axisLines}
        <polygon points="${dataPoints}" fill="url(#visitorRadarFill)" fill-opacity="0.92" stroke="#ef6c37" stroke-width="4" stroke-linejoin="round" />
        ${labels}
      </svg>
    `;
  }

  function buildDonutStyle(metrics){
    const totalWins = metrics.totalAgari;
    if (totalWins <= 0){
      return {
        background: "conic-gradient(rgba(255,255,255,0.10) 0 100%)",
        rows: [
          { label: "立直", valueText: "—", color: "#73d9ff" },
          { label: "副露", valueText: "—", color: "#5d79f0" },
          { label: "ダマ", valueText: "—", color: "#c27cff" }
        ],
        centerValue: "0",
        centerLabel: "和了"
      };
    }

    const values = [
      { label: "立直", count: metrics.totalRiichiAgari, color: "#73d9ff" },
      { label: "副露", count: metrics.totalFuroAgari, color: "#5d79f0" },
      { label: "ダマ", count: metrics.totalDamaAgari, color: "#c27cff" }
    ];

    let current = 0;
    const slices = values.map((item)=>{
      const portion = item.count > 0 ? (item.count / totalWins) * 100 : 0;
      const start = current;
      const end = current + portion;
      current = end;
      return `${item.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });

    return {
      background: `conic-gradient(${slices.join(", ")})`,
      rows: values.map((item)=>({
        label: item.label,
        valueText: formatRate(item.count, totalWins),
        color: item.color
      })),
      centerValue: `${totalWins}`,
      centerLabel: "和了"
    };
  }

  function renderStatsOverlay(){
    ensureStatsOverlay();
    const root = document.getElementById("visitorStatsRoot");
    if (!root) return;
    root.innerHTML = "";

    const history = readHistory();

    if (!history.length){
      const empty = document.createElement("div");
      empty.className = "visitorStatsEmpty";
      empty.innerHTML = "まだ成績がありません。<br>半荘を終えると、直近3半荘ぶんの結果がここに保存されます。";
      root.appendChild(empty);
      return;
    }

    const cards = document.createElement("div");
    cards.className = "visitorStatsCards";

    history.forEach((item, index)=>{
      const card = document.createElement("div");
      card.className = "visitorStatsCard";

      const top = document.createElement("div");
      top.className = "visitorStatsCardTop";

      const round = document.createElement("div");
      round.className = "visitorStatsCardRound";
      round.textContent = `直近${index + 1}`;

      const rank = document.createElement("div");
      rank.className = "visitorStatsCardRank";
      rank.textContent = item.rankLabel || "—";

      const point = document.createElement("div");
      point.className = "visitorStatsCardPoint";
      point.textContent = formatPointText(item.point);

      const sub = document.createElement("div");
      sub.className = "visitorStatsCardSub";
      const reason = item.reason ? `${item.reason}` : "半荘終了";
      const scoreValueText = Number.isFinite(item.scoreValue)
        ? ` / ${item.scoreValue > 0 ? "+" : ""}${item.scoreValue.toFixed(1)}`
        : "";
      sub.innerHTML = `${reason}<br>${formatSignedChipText(item.chipCount)}${scoreValueText}`;

      top.appendChild(round);
      top.appendChild(rank);
      card.appendChild(top);
      card.appendChild(point);
      card.appendChild(sub);
      cards.appendChild(card);
    });

    root.appendChild(cards);

    const totalKyoku = history.reduce((sum, item)=> sum + (Number(item.kyokuCount) || 0), 0);
    const totalAgari = history.reduce((sum, item)=> sum + (Number(item.agari) || 0), 0);
    const totalRiichi = history.reduce((sum, item)=> sum + (Number(item.riichi) || 0), 0);
    const totalHoju = history.reduce((sum, item)=> sum + (Number(item.hoju) || 0), 0);
    const totalFuroKyoku = history.reduce((sum, item)=> sum + (Number(item.furoKyokuCount) || 0), 0);
    const totalRiichiAgari = history.reduce((sum, item)=> sum + (Number(item.riichiAgariCount) || 0), 0);
    const totalFuroAgari = history.reduce((sum, item)=> sum + (Number(item.furoAgariCount) || 0), 0);
    const totalDamaAgari = history.reduce((sum, item)=> sum + (Number(item.damaAgariCount) || 0), 0);
    const rankCounts = [0, 0, 0];
    history.forEach((item)=>{
      const idx = Number(item.rankIndex);
      if (idx >= 0 && idx <= 2) rankCounts[idx] += 1;
    });

    const metrics = {
      historyCount: history.length,
      totalKyoku,
      totalAgari,
      totalRiichi,
      totalHoju,
      totalFuroKyoku,
      totalRiichiAgari,
      totalFuroAgari,
      totalDamaAgari,
      rankCounts,
      rankRates: rankCounts.map((count)=> history.length > 0 ? (count / history.length) : 0),
      agariRateValue: totalKyoku > 0 ? (totalAgari / totalKyoku) : 0,
      riichiRateValue: totalKyoku > 0 ? (totalRiichi / totalKyoku) : 0,
      hojuRateValue: totalKyoku > 0 ? (totalHoju / totalKyoku) : 0,
      furoRateValue: totalKyoku > 0 ? (totalFuroKyoku / totalKyoku) : 0,
      avgRank: history.length > 0 ? history.reduce((sum, item)=> sum + ((Number(item.rankIndex) || 0) + 1), 0) / history.length : 0,
      avgPoint: averageFromHistory(history, "point"),
      avgScoreValue: averageFromHistory(history, "scoreValue"),
      avgChip: averageFromHistory(history, "chipCount")
    };

    const styleScores = buildStyleScores(history, metrics);
    const donut = buildDonutStyle(metrics);

    const main = document.createElement("div");
    main.className = "visitorStatsMain";

    const leftPanel = document.createElement("div");
    leftPanel.className = "visitorStatsPanel";

    const leftHead = document.createElement("div");
    leftHead.className = "visitorStatsPanelHead";

    const leftHeadWrap = document.createElement("div");
    const leftTitle = document.createElement("div");
    leftTitle.className = "visitorStatsPanelTitle";
    leftTitle.textContent = "スタイル";
    const leftSub = document.createElement("div");
    leftSub.className = "visitorStatsPanelSub";
    leftSub.textContent = `直近${history.length}半荘の成績から簡易算出しています。`;
    leftHeadWrap.appendChild(leftTitle);
    leftHeadWrap.appendChild(leftSub);

    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.className = "visitorStatsHelpBtn";
    helpBtn.textContent = "?";

    leftHead.appendChild(leftHeadWrap);
    leftHead.appendChild(helpBtn);
    leftPanel.appendChild(leftHead);

    const styleWrap = document.createElement("div");
    styleWrap.className = "visitorStyleWrap";

    const scoreList = document.createElement("div");
    scoreList.className = "visitorStyleScoreList";
    [
      { key: "attack", label: "攻", color: "#ff6f91" },
      { key: "defense", label: "防", color: "#67e28d" },
      { key: "speed", label: "速", color: "#55d9ff" },
      { key: "luck", label: "運", color: "#f7b343" }
    ].forEach((item)=>{
      const row = document.createElement("div");
      row.className = "visitorStyleScoreRow";
      const key = document.createElement("div");
      key.className = "visitorStyleScoreKey";
      key.style.color = item.color;
      key.textContent = item.label;
      const label = document.createElement("div");
      label.className = "visitorStyleScoreLabel";
      label.textContent = item.label === "攻" ? "打点" : item.label === "防" ? "守備" : item.label === "速" ? "和了速度" : "流れ";
      const value = document.createElement("div");
      value.className = "visitorStyleScoreValue";
      value.textContent = `${styleScores[item.key]}`;
      row.appendChild(key);
      row.appendChild(label);
      row.appendChild(value);
      scoreList.appendChild(row);
    });

    const radarBox = document.createElement("div");
    radarBox.className = "visitorStyleRadarBox";
    radarBox.innerHTML = buildRadarSvg(styleScores);

    styleWrap.appendChild(scoreList);
    styleWrap.appendChild(radarBox);
    leftPanel.appendChild(styleWrap);

    const helpBox = document.createElement("div");
    helpBox.className = "visitorStatsHelpBox";
    helpBox.innerHTML = [
      "攻：直近成績の打点感とトップ率が高いほど上がります。",
      "防：直近成績の放銃率が低いほど上がります。",
      "速：直近成績の和了率が高いほど上がります。",
      "運：直近成績の流れとプラス結果をもとに簡易表示しています。"
    ].join("<br>");
    leftPanel.appendChild(helpBox);
    helpBtn.addEventListener("click", ()=>{
      helpBox.classList.toggle("isOpen");
    });

    const rightStack = document.createElement("div");
    rightStack.className = "visitorStatsRightStack";

    const winPanel = document.createElement("div");
    winPanel.className = "visitorStatsMiniPanel";
    const winTitle = document.createElement("div");
    winTitle.className = "visitorStatsMiniTitle";
    winTitle.textContent = "和了グラフ";
    winPanel.appendChild(winTitle);

    const winSplit = document.createElement("div");
    winSplit.className = "visitorWinSplit";
    const donutEl = document.createElement("div");
    donutEl.className = "visitorDonut";
    donutEl.style.background = donut.background;
    const donutCenter = document.createElement("div");
    donutCenter.className = "visitorDonutCenter";
    donutCenter.innerHTML = `<div><strong>${donut.centerValue}</strong>${donut.centerLabel}</div>`;
    donutEl.appendChild(donutCenter);
    const legend = document.createElement("div");
    legend.className = "visitorLegend";
    donut.rows.forEach((row)=>{
      const legendRow = document.createElement("div");
      legendRow.className = "visitorLegendRow";
      const dot = document.createElement("div");
      dot.className = "visitorLegendDot";
      dot.style.background = row.color;
      const label = document.createElement("div");
      label.className = "visitorLegendLabel";
      label.textContent = row.label;
      const value = document.createElement("div");
      value.className = "visitorLegendValue";
      value.textContent = row.valueText;
      legendRow.appendChild(dot);
      legendRow.appendChild(label);
      legendRow.appendChild(value);
      legend.appendChild(legendRow);
    });
    winSplit.appendChild(donutEl);
    winSplit.appendChild(legend);
    winPanel.appendChild(winSplit);

    const rankPanel = document.createElement("div");
    rankPanel.className = "visitorStatsMiniPanel";
    const rankTitle = document.createElement("div");
    rankTitle.className = "visitorStatsMiniTitle";
    rankTitle.textContent = "順位グラフ";
    rankPanel.appendChild(rankTitle);
    const rankBars = document.createElement("div");
    rankBars.className = "visitorRankBars";
    [
      { label: "1位", rate: metrics.rankRates[0], color: "#eac75f" },
      { label: "2位", rate: metrics.rankRates[1], color: "#f2a040" },
      { label: "3位", rate: metrics.rankRates[2], color: "#e46d3f" }
    ].forEach((item)=>{
      const row = document.createElement("div");
      row.className = "visitorRankBarRow";
      const label = document.createElement("div");
      label.className = "visitorRankBarLabel";
      label.textContent = item.label;
      const track = document.createElement("div");
      track.className = "visitorRankBarTrack";
      const fill = document.createElement("div");
      fill.className = "visitorRankBarFill";
      fill.style.width = `${Math.max(0, Math.min(100, item.rate * 100))}%`;
      fill.style.background = item.color;
      track.appendChild(fill);
      const value = document.createElement("div");
      value.className = "visitorRankBarValue";
      value.textContent = formatRate(item.rate * 100, 100);
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      rankBars.appendChild(row);
    });
    rankPanel.appendChild(rankBars);

    rightStack.appendChild(winPanel);
    rightStack.appendChild(rankPanel);

    main.appendChild(leftPanel);
    main.appendChild(rightStack);
    root.appendChild(main);

    const tablePanel = document.createElement("div");
    tablePanel.className = "visitorStatsTablePanel";
    const tableTitle = document.createElement("div");
    tableTitle.className = "visitorStatsTableTitle";
    tableTitle.textContent = `直近${history.length}半荘の成績`;
    const tableGrid = document.createElement("div");
    tableGrid.className = "visitorStatsTableGrid";

    [
      { label: "一位率", value: formatRate(metrics.rankCounts[0], history.length), hint: "半荘順位" },
      { label: "二位率", value: formatRate(metrics.rankCounts[1], history.length), hint: "半荘順位" },
      { label: "三位率", value: formatRate(metrics.rankCounts[2], history.length), hint: "半荘順位" },
      { label: "対戦数", value: `${history.length}`, hint: "保存中の半荘数" },
      { label: "平均順位", value: formatAverageRank(metrics.avgRank), hint: "半荘の平均" },
      { label: "平均終了点", value: formatAvgPoint(metrics.avgPoint), hint: "最終持ち点" },
      { label: "平均スコア", value: formatSignedScoreValue(metrics.avgScoreValue), hint: "精算値ベース" },
      { label: "アガリ率", value: formatRate(metrics.totalAgari, metrics.totalKyoku), hint: "総局数基準" },
      { label: "リーチ率", value: formatRate(metrics.totalRiichi, metrics.totalKyoku), hint: "総局数基準" },
      { label: "放銃率", value: formatRate(metrics.totalHoju, metrics.totalKyoku), hint: "総局数基準" },
      { label: "副露率", value: formatRate(metrics.totalFuroKyoku, metrics.totalKyoku), hint: "総局数基準" },
      { label: "平均チップ", value: `${metrics.avgChip > 0 ? "+" : ""}${metrics.avgChip.toFixed(1)}枚`, hint: "半荘ごとの平均" }
    ].forEach((item)=>{
      const cell = document.createElement("div");
      cell.className = "visitorStatsTableCell";
      const label = document.createElement("div");
      label.className = "visitorStatsTableLabel";
      label.textContent = item.label;
      const value = document.createElement("div");
      value.className = "visitorStatsTableValue";
      value.textContent = item.value;
      const hint = document.createElement("div");
      hint.className = "visitorStatsTableHint";
      hint.textContent = item.hint;
      cell.appendChild(label);
      cell.appendChild(value);
      cell.appendChild(hint);
      tableGrid.appendChild(cell);
    });

    tablePanel.appendChild(tableTitle);
    tablePanel.appendChild(tableGrid);
    root.appendChild(tablePanel);
  }

  function replaceButtonWithClone(btn){
    if (!btn || !btn.parentNode) return btn;
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    return clone;
  }

  function installTopButtons(){
    const newBtnEl = document.getElementById("newBtn");
    if (newBtnEl) newBtnEl.textContent = "最初から";

    let ruleBtn = document.getElementById("debugOpenBtn");
    ruleBtn = replaceButtonWithClone(ruleBtn);
    if (ruleBtn){
      ruleBtn.textContent = "ルール";
      ruleBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        openVisitorOverlay(ensureRuleOverlay());
      }, true);
    }

    let statsBtn = document.getElementById("settingsBtn");
    statsBtn = replaceButtonWithClone(statsBtn);
    if (statsBtn){
      statsBtn.textContent = "成績";
      statsBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        renderStatsOverlay();
        openVisitorOverlay(ensureStatsOverlay());
      }, true);
    }
  }

  function installSettlementHooks(){
    if (typeof applyPendingRoundSettlement === "function" && !applyPendingRoundSettlement.__visitorWrapped){
      const originalApply = applyPendingRoundSettlement;
      const wrappedApply = function(){
        const settlement = originalApply.apply(this, arguments);
        try{ noteRoundSettlement(settlement); }catch(e){}
        return settlement;
      };
      wrappedApply.__visitorWrapped = true;
      applyPendingRoundSettlement = wrappedApply;
    }

    if (typeof showHanchanEndOverlay === "function" && !showHanchanEndOverlay.__visitorWrapped){
      const originalShow = showHanchanEndOverlay;
      const wrappedShow = function(endInfo, settlement){
        try{ recordFinishedHanchan(endInfo, settlement); }catch(e){}
        return originalShow.apply(this, arguments);
      };
      wrappedShow.__visitorWrapped = true;
      showHanchanEndOverlay = wrappedShow;
    }

    if (typeof resetScoreStateForNewHanchan === "function" && !resetScoreStateForNewHanchan.__visitorWrapped){
      const originalReset = resetScoreStateForNewHanchan;
      const wrappedReset = function(){
        resetTrackerRoundState(true);
        return originalReset.apply(this, arguments);
      };
      wrappedReset.__visitorWrapped = true;
      resetScoreStateForNewHanchan = wrappedReset;
    }
  }

  function installEscapeClose(){
    document.addEventListener("keydown", (ev)=>{
      if (ev.key !== "Escape") return;
      ["visitorRuleOverlay", "visitorStatsOverlay"].forEach((id)=>{
        const overlay = document.getElementById(id);
        if (overlay && overlay.classList.contains("isOpen")) closeVisitorOverlay(overlay);
      });
    });
  }

  function boot(){
    ensureRuleOverlay();
    ensureStatsOverlay();
    installTopButtons();
    installSettlementHooks();
    installEscapeClose();
    saveTracker();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }else{
    boot();
  }
})();
