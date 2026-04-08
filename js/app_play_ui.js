// ========= app_play_ui.js（アプリ版プレイ画面UI） =========
// 役割：
// - アプリ版プレイ画面の上部3ボタンとオーバーレイUIを担当する
// - ルール確認 / 成績確認の表示を行う
// - 半荘終了フックを使ってローカル保存 / クラウド同期を行う
// - 既存の局進行ロジックは触らず、後付けで集計する

(function(){
  "use strict";

  const ACTIVE_SESSION_STORAGE_KEY = "mbsanma_app_active_session_v1";
  const ACCOUNT_REGISTRY_STORAGE_KEY = "mbsanma_app_account_registry_v1";
  const LOCAL_HISTORY_STORAGE_KEY = "mbsanma_app_local_history_v1";
  const LOCAL_TRACKER_STORAGE_KEY = "mbsanma_app_local_tracker_v1";
  const ACCOUNT_KEY_PREFIX = "mbsanma_app_account_";
  const STATS_PREVIEW_MODE_STORAGE_KEY = "mbsanma_app_stats_preview_mode_v1";

  const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "mbsanma_visitor_active_session_v1";
  const LEGACY_ACCOUNT_REGISTRY_STORAGE_KEY = "mbsanma_visitor_account_registry_v1";
  const LEGACY_HISTORY_STORAGE_KEY = "mbsanma_visitor_recent_hanchans_v1";
  const LEGACY_TRACKER_STORAGE_KEY = "mbsanma_visitor_current_hanchan_v1";
  const LEGACY_LOCAL_HISTORY_STORAGE_KEY = "mbsanma_visitor_guest_history_v1";
  const LEGACY_LOCAL_TRACKER_STORAGE_KEY = "mbsanma_visitor_guest_tracker_v1";
  const LEGACY_ACCOUNT_KEY_PREFIX = "mbsanma_visitor_account_";
  const SAMPLE_HISTORY_TEMPLATE = [
    {
      finishedAt: "2026-04-03T21:40:00.000Z",
      rankLabel: "1着",
      rankIndex: 0,
      point: 46200,
      chipCount: 5,
      scoreValue: 47.2,
      totalScoreValue: 57.2,
      riichi: 4,
      agari: 6,
      hoju: 1,
      kyokuCount: 13,
      furoKyokuCount: 2,
      riichiAgariCount: 3,
      furoAgariCount: 1,
      damaAgariCount: 2,
      reason: "半荘終了"
    },
    {
      finishedAt: "2026-04-03T20:58:00.000Z",
      rankLabel: "2着",
      rankIndex: 1,
      point: 38700,
      chipCount: 1,
      scoreValue: 8.4,
      totalScoreValue: 10.4,
      riichi: 3,
      agari: 4,
      hoju: 1,
      kyokuCount: 12,
      furoKyokuCount: 3,
      riichiAgariCount: 2,
      furoAgariCount: 1,
      damaAgariCount: 1,
      reason: "半荘終了"
    },
    {
      finishedAt: "2026-04-03T20:12:00.000Z",
      rankLabel: "3着",
      rankIndex: 2,
      point: 25100,
      chipCount: -3,
      scoreValue: -24.6,
      totalScoreValue: -30.6,
      riichi: 2,
      agari: 3,
      hoju: 3,
      kyokuCount: 11,
      furoKyokuCount: 4,
      riichiAgariCount: 1,
      furoAgariCount: 1,
      damaAgariCount: 1,
      reason: "半荘終了"
    }
  ];

  migrateLegacyAppStorage();

  const currentSession = loadAppSession();

  let statsPreviewMode = loadStatsPreviewMode();
  let activeStatsTabKey = "overview";

  const tracker = loadTracker();

  injectVisitorOverlayStyles();

  function normalizeAccountId(value){
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeAppSession(src){
    const mode = src && src.mode === "account" ? "account" : (src && src.mode === "local" ? "local" : "local");
    const accountId = mode === "account" ? normalizeAccountId(src && src.accountId) : "";
    return { mode, accountId };
  }

  function buildLegacyAccountHistoryKey(accountId){
    return `${LEGACY_ACCOUNT_KEY_PREFIX}${accountId}_history_v1`;
  }

  function buildLegacyAccountTrackerKey(accountId){
    return `${LEGACY_ACCOUNT_KEY_PREFIX}${accountId}_tracker_v1`;
  }

  function copyStorageValueIfMissing(storage, nextKey, legacyKey){
    try{
      if (storage.getItem(nextKey) != null) return;
      const legacyValue = storage.getItem(legacyKey);
      if (legacyValue != null) storage.setItem(nextKey, legacyValue);
    }catch(e){}
  }

  function migrateLegacyAppStorage(){
    copyStorageValueIfMissing(localStorage, ACCOUNT_REGISTRY_STORAGE_KEY, LEGACY_ACCOUNT_REGISTRY_STORAGE_KEY);
    copyStorageValueIfMissing(localStorage, LOCAL_HISTORY_STORAGE_KEY, LEGACY_LOCAL_HISTORY_STORAGE_KEY);
    copyStorageValueIfMissing(localStorage, LOCAL_TRACKER_STORAGE_KEY, LEGACY_LOCAL_TRACKER_STORAGE_KEY);

    try{
      const raw = localStorage.getItem(LEGACY_ACCOUNT_REGISTRY_STORAGE_KEY);
      if (!raw) return;
      const registry = JSON.parse(raw);
      if (!registry || typeof registry !== "object") return;
      Object.keys(registry).forEach((accountId)=>{
        const normalized = normalizeAccountId(accountId);
        if (!normalized) return;
        copyStorageValueIfMissing(localStorage, `${ACCOUNT_KEY_PREFIX}${normalized}_history_v1`, buildLegacyAccountHistoryKey(normalized));
        copyStorageValueIfMissing(localStorage, `${ACCOUNT_KEY_PREFIX}${normalized}_tracker_v1`, buildLegacyAccountTrackerKey(normalized));
      });
    }catch(e){}
  }

  function loadAppSession(){
    const keys = [ACTIVE_SESSION_STORAGE_KEY, LEGACY_ACTIVE_SESSION_STORAGE_KEY];
    for (const key of keys){
      try{
        const raw = sessionStorage.getItem(key);
        if (raw){
          return normalizeAppSession(JSON.parse(raw));
        }
      }catch(e){}
    }
    return { mode: "local", accountId: "" };
  }

  function getScopedStorageEngine(){
    return localStorage;
  }

  function getScopedHistoryStorageKey(){
    if (currentSession.mode === "account" && currentSession.accountId){
      return `${ACCOUNT_KEY_PREFIX}${currentSession.accountId}_history_v1`;
    }
    return LOCAL_HISTORY_STORAGE_KEY;
  }

  function getScopedTrackerStorageKey(){
    if (currentSession.mode === "account" && currentSession.accountId){
      return `${ACCOUNT_KEY_PREFIX}${currentSession.accountId}_tracker_v1`;
    }
    return LOCAL_TRACKER_STORAGE_KEY;
  }

  function maybeMigrateLegacyDataToScopedAccount(){
    if (currentSession.mode !== "account" || !currentSession.accountId) return;

    const historyKey = getScopedHistoryStorageKey();
    const trackerKey = getScopedTrackerStorageKey();
    const legacyHistoryKey = buildLegacyAccountHistoryKey(currentSession.accountId);
    const legacyTrackerKey = buildLegacyAccountTrackerKey(currentSession.accountId);

    copyStorageValueIfMissing(localStorage, historyKey, legacyHistoryKey);
    copyStorageValueIfMissing(localStorage, trackerKey, legacyTrackerKey);

    try{
      if (!localStorage.getItem(historyKey)){
        const legacyHistory = localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY);
        if (legacyHistory) localStorage.setItem(historyKey, legacyHistory);
      }
    }catch(e){}

    try{
      if (!localStorage.getItem(trackerKey)){
        const legacyTracker = localStorage.getItem(LEGACY_TRACKER_STORAGE_KEY);
        if (legacyTracker) localStorage.setItem(trackerKey, legacyTracker);
      }
    }catch(e){}
  }

  function getCurrentSessionLabel(){
    if (currentSession.mode === "account" && currentSession.accountId){
      return currentSession.accountId;
    }
    return "ローカル";
  }

  function isCloudSyncReady(){
    return currentSession.mode === "account"
      && !!currentSession.accountId
      && !!(window.MBSanmaSupabase && typeof window.MBSanmaSupabase.isConfigured === "function" && window.MBSanmaSupabase.isConfigured());
  }

  let remoteSyncTimer = 0;
  let remoteSyncInFlight = false;
  let remoteSyncPending = false;

  function getCurrentSessionDescription(){
    if (currentSession.mode === "account" && currentSession.accountId){
      return isCloudSyncReady()
        ? "このアカウントの保存成績を表示しています。別端末でも同じ番号で続きが見られます。"
        : "このアカウントの保存成績を表示しています。";
    }
    return "ローカルの一時成績を表示しています。";
  }

  function scheduleRemoteSnapshotSync(){
    if (!isCloudSyncReady()) return;
    if (remoteSyncTimer) clearTimeout(remoteSyncTimer);
    remoteSyncTimer = window.setTimeout(()=>{
      remoteSyncTimer = 0;
      void pushSnapshotToRemote();
    }, 320);
  }

  async function pushSnapshotToRemote(){
    if (!isCloudSyncReady()) return;
    if (remoteSyncInFlight){
      remoteSyncPending = true;
      return;
    }

    remoteSyncInFlight = true;
    try{
      const history = readHistory();
      const trackerSnapshot = normalizeTracker(tracker);
      const result = await window.MBSanmaSupabase.saveAccountSnapshot(currentSession.accountId, history, trackerSnapshot);
      if (result && result.error){
        console.warn("[app_play_ui] remote sync failed:", result.error.message || result.error);
      }
    }catch(error){
      console.warn("[app_play_ui] remote sync failed:", error);
    }finally{
      remoteSyncInFlight = false;
      if (remoteSyncPending){
        remoteSyncPending = false;
        scheduleRemoteSnapshotSync();
      }
    }
  }

  function loadTracker(){
    try{
      maybeMigrateLegacyDataToScopedAccount();
      const raw = getScopedStorageEngine().getItem(getScopedTrackerStorageKey());
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
      getScopedStorageEngine().setItem(getScopedTrackerStorageKey(), JSON.stringify(tracker));
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
    if (clearSavedSignature) scheduleRemoteSnapshotSync();
  }

  function readHistory(){
    try{
      maybeMigrateLegacyDataToScopedAccount();
      const raw = getScopedStorageEngine().getItem(getScopedHistoryStorageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item)=> item && typeof item === "object").map(normalizeHistoryEntry)
        : [];
    }catch(e){
      return [];
    }
  }

  function writeHistory(list){
    try{
      getScopedStorageEngine().setItem(getScopedHistoryStorageKey(), JSON.stringify(Array.isArray(list) ? list : []));
    }catch(e){}
  }

  function loadStatsPreviewMode(){
    try{
      return localStorage.getItem(STATS_PREVIEW_MODE_STORAGE_KEY) === "1";
    }catch(e){
      return false;
    }
  }

  function saveStatsPreviewMode(){
    try{
      localStorage.setItem(STATS_PREVIEW_MODE_STORAGE_KEY, statsPreviewMode ? "1" : "0");
    }catch(e){}
  }

  function setStatsPreviewMode(value){
    statsPreviewMode = !!value;
    saveStatsPreviewMode();
  }

  function getSampleHistory(){
    return SAMPLE_HISTORY_TEMPLATE.map((item)=> normalizeHistoryEntry(item));
  }

  function calcVisitorTotalScoreValue(scoreValue, chipCount){
    const base = Number(scoreValue);
    const chip = (Number(chipCount) || 0) * 2;
    if (Number.isFinite(base)) return base + chip;
    return chip;
  }

  function normalizeHistoryEntry(item){
    const next = (item && typeof item === "object") ? { ...item } : {};

    const chipCount = Number(next.chipCount) || 0;
    next.chipCount = chipCount;

    if (Number.isFinite(Number(next.scoreValue))){
      next.scoreValue = Number(next.scoreValue);
    } else {
      next.scoreValue = null;
    }

    if (Number.isFinite(Number(next.totalScoreValue))){
      next.totalScoreValue = Number(next.totalScoreValue);
    } else {
      next.totalScoreValue = calcVisitorTotalScoreValue(next.scoreValue, chipCount);
    }

    return next;
  }

  function getStatsHistoryContext(){
    const realHistory = readHistory();
    const hasRealData = realHistory.length > 0;
    const usingSample = !!statsPreviewMode;
    return {
      history: usingSample ? getSampleHistory() : realHistory,
      usingSample,
      hasRealData
    };
  }

  function injectVisitorOverlayStyles(){
    if (document.getElementById("visitorPlayUiStyle")) return;
    const style = document.createElement("style");
    style.id = "appPlayUiStyle";
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

      .visitorStatsOverlayShell .visitorPanelSub{
        display: none;
      }
      .visitorStatsHeaderMeta{
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        margin-left: auto;
        flex-wrap: wrap;
      }
      .visitorStatsHeaderTabs{
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .visitorStatsHeaderTabBtn{
        appearance: none;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 999px;
        min-height: 34px;
        padding: 0 12px;
        background: rgba(255,255,255,0.04);
        color: rgba(245,247,244,0.78);
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .visitorStatsHeaderTabBtn.isActive{
        background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06)), rgba(76, 119, 98, 0.78);
        border-color: rgba(182, 227, 201, 0.24);
        color: #ffffff;
        box-shadow: 0 10px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12);
      }
      .visitorStatsAccountBadge{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(255,214,111,0.20);
        background: rgba(255,214,111,0.08);
        color: #fff3c5;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.02em;
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
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03));
        padding: 12px 12px 11px;
        min-height: 0;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .visitorStatsCard.is-rank-1{
        background: linear-gradient(180deg, rgba(26,57,124,0.96), rgba(15,28,66,0.92));
        border-color: rgba(123,168,255,0.26);
      }
      .visitorStatsCard.is-rank-2{
        background: linear-gradient(180deg, rgba(28,79,88,0.94), rgba(15,42,48,0.92));
        border-color: rgba(109,216,212,0.22);
      }
      .visitorStatsCard.is-rank-3{
        background: linear-gradient(180deg, rgba(88,47,42,0.94), rgba(56,25,22,0.92));
        border-color: rgba(238,132,116,0.22);
      }
      .visitorStatsCardTop{
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .visitorStatsCardRound{
        font-size: 11px;
        font-weight: 800;
        color: rgba(245,247,244,0.70);
      }
      .visitorStatsCardRank{
        font-size: 22px;
        font-weight: 900;
        line-height: 1;
      }
      .visitorStatsCardLabel{
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.03em;
        color: rgba(245,247,244,0.72);
        margin-bottom: 4px;
      }
      .visitorStatsCardScore{
        font-size: 28px;
        font-weight: 900;
        line-height: 1.0;
        color: #ffffff;
        margin-bottom: 6px;
      }
      .visitorStatsCardPoint{
        font-size: 14px;
        font-weight: 800;
        line-height: 1.15;
        color: rgba(245,247,244,0.90);
        margin-bottom: 4px;
      }
      .visitorStatsCardMeta{
        font-size: 11px;
        color: rgba(245,247,244,0.76);
        line-height: 1.35;
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
        border-radius: 13px;
        background: rgba(0,0,0,0.16);
        border: 1px solid rgba(255,255,255,0.08);
        padding: 10px 9px;
        min-height: 68px;
        display: grid;
        align-content: start;
        gap: 5px;
      }
      .visitorStatsTableLabel{
        font-size: 12px;
        font-weight: 700;
        color: rgba(245,247,244,0.72);
      }
      .visitorStatsTableValue{
        font-size: 18px;
        font-weight: 900;
        line-height: 1.05;
        color: #ffd56f;
      }
      .visitorStatsTableHint{
        font-size: 10px;
        line-height: 1.3;
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
      .visitorStatsSessionBar{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
      }
      .visitorStatsSessionTitle{
        font-size: 14px;
        font-weight: 900;
        color: #fff3c5;
      }
      .visitorStatsSessionText{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.76);
      }
      .visitorStatsPreviewBar{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
      }
      .visitorStatsPreviewNote{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.76);
      }
      .visitorStatsPreviewActions{
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .visitorStatsPreviewBtn{
        appearance: none;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        min-height: 38px;
        padding: 0 14px;
        background: rgba(255,255,255,0.05);
        color: #ffffff;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .visitorStatsPreviewBtn.isPrimary{
        border-color: rgba(255,214,111,0.28);
        background: linear-gradient(180deg, rgba(255,214,111,0.20), rgba(255,214,111,0.10));
        color: #fff4c9;
      }
      .visitorStatsTabs{
        margin-bottom: 0;
      }
      .visitorStatsPanels{
        display: grid;
        gap: 12px;
      }
      .visitorStatsTabPanel{
        display: none;
      }
      .visitorStatsTabPanel.isActive{
        display: grid;
        gap: 12px;
      }
      .visitorLogPanel{
        display: grid;
        gap: 12px;
      }
      .visitorLogNote{
        font-size: 12px;
        line-height: 1.7;
        color: rgba(245,247,244,0.76);
      }
      .visitorLogMatchCard{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(180deg, rgba(20,35,62,0.88), rgba(24,34,58,0.82));
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .visitorLogMatchHead{
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .visitorLogMatchTitle{
        font-size: 16px;
        font-weight: 900;
        line-height: 1.3;
      }
      .visitorLogMatchMeta{
        font-size: 12px;
        line-height: 1.7;
        color: rgba(245,247,244,0.74);
      }
      .visitorLogMatchBadge{
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(255,214,111,0.10);
        border: 1px solid rgba(255,214,111,0.18);
        color: #fff3c5;
        font-size: 11px;
        font-weight: 900;
      }
      .visitorLogKyokuList{
        display: grid;
        gap: 10px;
      }
      .visitorLogKyoku{
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.16);
        overflow: hidden;
      }
      .visitorLogKyokuSummary{
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
      }
      .visitorLogKyokuSummary::-webkit-details-marker{
        display: none;
      }
      .visitorLogKyokuTitle{
        font-size: 14px;
        font-weight: 900;
        color: #ffffff;
      }
      .visitorLogKyokuMeta{
        font-size: 11px;
        line-height: 1.6;
        color: rgba(245,247,244,0.72);
        text-align: right;
      }
      .visitorLogEventList{
        display: grid;
        gap: 8px;
        padding: 0 14px 14px;
      }
      .visitorLogEventRow{
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.07);
        background: rgba(255,255,255,0.03);
        padding: 10px 12px;
        display: grid;
        gap: 4px;
      }
      .visitorLogEventTop{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .visitorLogEventType{
        font-size: 12px;
        font-weight: 900;
        color: #fff3c5;
      }
      .visitorLogEventSeq{
        font-size: 11px;
        color: rgba(245,247,244,0.58);
      }
      .visitorLogEventText{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.88);
        word-break: break-word;
      }
      .visitorLogEventSub{
        font-size: 11px;
        line-height: 1.55;
        color: rgba(245,247,244,0.62);
        word-break: break-word;
      }

      .visitorReplayPanel{
        display: grid;
        gap: 12px;
      }
      .visitorReplayNote{
        font-size: 12px;
        line-height: 1.7;
        color: rgba(245,247,244,0.76);
      }
      .visitorReplayCard{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(180deg, rgba(20,35,62,0.88), rgba(24,34,58,0.82));
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .visitorReplayControls{
        display: grid;
        gap: 10px;
      }
      .visitorReplaySelectRow{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .visitorReplayField{
        display: grid;
        gap: 6px;
      }
      .visitorReplayLabel{
        font-size: 12px;
        font-weight: 800;
        color: rgba(245,247,244,0.76);
      }
      .visitorReplaySelect,
      .visitorReplayRange{
        width: 100%;
      }
      .visitorReplaySelect{
        min-height: 38px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.05);
        color: #f5f7f4;
        padding: 0 10px;
        box-sizing: border-box;
      }
      .visitorReplayStepRow{
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .visitorReplayBtn{
        appearance: none;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        min-height: 34px;
        padding: 0 12px;
        background: rgba(255,255,255,0.05);
        color: #ffffff;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .visitorReplayBtn:disabled{
        opacity: 0.45;
        cursor: default;
      }
      .visitorReplayStepMeta{
        font-size: 12px;
        line-height: 1.6;
        color: rgba(245,247,244,0.74);
      }
      .visitorReplayCurrent{
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.16);
        padding: 12px;
        display: grid;
        gap: 6px;
      }
      .visitorReplayCurrentTitle{
        font-size: 15px;
        font-weight: 900;
        color: #fff3c5;
      }
      .visitorReplayCurrentSub{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.72);
      }
      .visitorReplayCurrentText{
        font-size: 13px;
        line-height: 1.7;
        color: rgba(245,247,244,0.90);
      }
      .visitorReplayGrid{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .visitorReplayPanelBlock{
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.16);
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .visitorReplayPanelTitle{
        font-size: 14px;
        font-weight: 900;
        color: #ffffff;
      }
      .visitorReplayInfoList{
        display: grid;
        gap: 8px;
      }
      .visitorReplayInfoRow{
        display: grid;
        grid-template-columns: 88px minmax(0, 1fr);
        gap: 8px;
        align-items: start;
      }
      .visitorReplayInfoLabel{
        font-size: 11px;
        font-weight: 800;
        color: rgba(245,247,244,0.62);
      }
      .visitorReplayInfoValue{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.90);
        word-break: break-word;
      }
      .visitorReplayTrail{
        display: grid;
        gap: 8px;
      }
      .visitorReplayTrailRow{
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.07);
        background: rgba(255,255,255,0.03);
        padding: 10px 12px;
        display: grid;
        gap: 4px;
      }
      .visitorReplayTrailRow.isCurrent{
        border-color: rgba(255,214,111,0.24);
        background: rgba(255,214,111,0.08);
      }
      .visitorReplayTrailTop{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .visitorReplayTrailTitle{
        font-size: 12px;
        font-weight: 900;
        color: #fff3c5;
      }
      .visitorReplayTrailSeq{
        font-size: 11px;
        color: rgba(245,247,244,0.58);
      }
      .visitorReplayTrailSub{
        font-size: 11px;
        line-height: 1.55;
        color: rgba(245,247,244,0.62);
      }
      .visitorReplayTrailText{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.88);
        word-break: break-word;
      }

      @media (max-width: 640px){
        .visitorOverlay{
          padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom)) 10px;
          align-items: stretch;
        }
        .visitorPanel{
          width: 100%;
          max-height: none;
          height: 100%;
          border-radius: 16px;
          padding: 14px 12px 16px;
        }
        .visitorPanelHeader{
          position: sticky;
          top: -14px;
          z-index: 3;
          margin: -14px -12px 12px;
          padding: 12px 12px 10px;
          background: linear-gradient(180deg, rgba(20,32,26,0.98) 0%, rgba(20,32,26,0.94) 72%, rgba(20,32,26,0) 100%);
          backdrop-filter: blur(8px);
          align-items: flex-start;
        }
        .visitorPanelTitle{
          font-size: 20px;
        }
        .visitorPanelSub{
          font-size: 11px;
          line-height: 1.55;
        }
        .visitorPanelClose{
          min-width: 40px;
          height: 40px;
          padding: 0 12px;
          font-size: 12px;
        }
        .visitorRuleTabs,
        .visitorStatsTabs{
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          position: sticky;
          top: 52px;
          z-index: 2;
          padding-bottom: 4px;
          background: linear-gradient(180deg, rgba(20,32,26,0.96) 0%, rgba(20,32,26,0.92) 72%, rgba(20,32,26,0) 100%);
        }
        .visitorStatsOverlayShell .visitorPanelHeader{
          gap: 8px;
          align-items: center;
        }
        .visitorStatsHeaderMeta{
          flex: 1 1 auto;
          gap: 6px;
        }
        .visitorStatsHeaderTabs{
          gap: 5px;
        }
        .visitorStatsHeaderTabBtn{
          min-height: 30px;
          padding: 0 10px;
          font-size: 11px;
        }
        .visitorStatsAccountBadge{
          min-height: 30px;
          padding: 0 10px;
          font-size: 11px;
        }
        .visitorRuleTabBtn,
        .visitorStatsTabBtn{
          min-height: 40px;
          padding: 0 10px;
          font-size: 12px;
        }
        .visitorRulePanelTitle{
          font-size: 16px;
        }
        .visitorRulePanelSub,
        .visitorRuleCardText,
        .visitorRuleLineText,
        .visitorRuleNotice{
          font-size: 12px;
          line-height: 1.65;
        }
        .visitorRuleCard{
          padding: 12px;
          border-radius: 12px;
        }
        .visitorRuleCardTitle,
        .visitorYakuGroupTitle{
          font-size: 14px;
          margin-bottom: 6px;
        }
        .visitorRuleLine{
          padding: 9px 10px;
          border-radius: 10px;
        }
        .visitorRuleLineStrong{
          font-size: 13px;
        }
        .visitorRulePills,
        .visitorYakuList{
          gap: 6px;
        }
        .visitorRulePill,
        .visitorYakuItem{
          min-height: 30px;
          padding: 0 10px;
          font-size: 12px;
        }
        .visitorRuleFootnote{
          font-size: 11px;
          line-height: 1.65;
        }
        .visitorStatsSection{
          gap: 12px;
        }
        .visitorStatsSessionBar{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
      }
      .visitorStatsSessionTitle{
        font-size: 14px;
        font-weight: 900;
        color: #fff3c5;
      }
      .visitorStatsSessionText{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.76);
      }
      .visitorStatsPreviewBar{
          display: grid;
          gap: 10px;
          padding: 12px;
          border-radius: 14px;
        }
        .visitorStatsPreviewActions{
          justify-content: stretch;
        }
        .visitorStatsPreviewBtn{
          flex: 1 1 0;
          min-height: 40px;
          font-size: 12px;
        }
        .visitorStatsCards{
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .visitorStatsCard{
          min-height: 0;
          padding: 10px 9px 9px;
        }
        .visitorStatsCardRound{
          font-size: 9px;
        }
        .visitorStatsCardRank{
          font-size: 17px;
        }
        .visitorStatsCardLabel{
          font-size: 9px;
          margin-bottom: 3px;
        }
        .visitorStatsCardScore{
          font-size: 20px;
          margin-bottom: 4px;
        }
        .visitorStatsCardPoint{
          font-size: 11px;
          margin-bottom: 3px;
        }
        .visitorStatsCardMeta{
          font-size: 9px;
          line-height: 1.3;
        }
        .visitorStatsMain{
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .visitorStatsPanel,
        .visitorStatsMiniPanel,
        .visitorStatsTablePanel{
          padding: 14px;
          border-radius: 16px;
        }
        .visitorStatsPanelTitle,
        .visitorStatsMiniTitle,
        .visitorStatsTableTitle{
          font-size: 17px;
        }
        .visitorStatsPanelSub{
          font-size: 11px;
          line-height: 1.6;
        }
        .visitorStyleWrap{
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .visitorStyleRadarBox{
          order: -1;
        }
        .visitorStyleRadarSvg{
          width: 164px;
          height: 164px;
        }
        .visitorStyleScoreRow{
          font-size: 13px;
        }
        .visitorWinSplit{
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .visitorDonut{
          width: 138px;
          height: 138px;
        }
        .visitorDonut::after{
          inset: 24px;
        }
        .visitorLegendRow,
        .visitorRankBarLabel,
        .visitorRankBarValue{
          font-size: 13px;
        }
        .visitorRankBarTrack{
          height: 20px;
        }
        .visitorStatsTableGrid{
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
        }
        .visitorStatsTableCell{
          min-height: 62px;
          padding: 8px 8px;
          border-radius: 11px;
        }
        .visitorStatsTableLabel{
          font-size: 10px;
        }
        .visitorStatsTableValue{
          font-size: 15px;
        }
        .visitorStatsTableHint{
          font-size: 9px;
        }
        .visitorStatsEmpty{
          padding: 16px 14px;
          font-size: 13px;
          line-height: 1.7;
        }
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
        .visitorStatsCardRank{
          font-size: 16px;
        }
        .visitorStatsCardScore{
          font-size: 18px;
        }
        .visitorStatsCardPoint{
          font-size: 11px;
        }
        .visitorStatsCardMeta,
        .visitorStatsCardRound{
          font-size: 10px;
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
      ""
    );
    overlay = shell.overlay;
    overlay.classList.add("visitorStatsOverlayShell");
    shell.panel.classList.add("visitorStatsPanelShell");

    const header = shell.panel.querySelector(".visitorPanelHeader");
    const closeBtn = shell.panel.querySelector(".visitorPanelClose");

    const meta = document.createElement("div");
    meta.className = "visitorStatsHeaderMeta";

    const tabs = document.createElement("div");
    tabs.className = "visitorStatsHeaderTabs";
    tabs.id = "visitorStatsHeaderTabs";

    const account = document.createElement("div");
    account.className = "visitorStatsAccountBadge";
    account.id = "visitorStatsAccountBadge";
    account.textContent = getCurrentSessionLabel();

    meta.appendChild(tabs);
    meta.appendChild(account);

    if (header && closeBtn){
      header.insertBefore(meta, closeBtn);
    }

    const root = document.createElement("div");
    root.className = "visitorStatsSection";
    root.id = "visitorStatsRoot";
    shell.panel.appendChild(root);
    return overlay;
  }

  function updateStatsOverlayHeader(){
    const overlay = ensureStatsOverlay();
    const subEl = overlay ? overlay.querySelector(".visitorPanelSub") : null;
    const accountEl = document.getElementById("visitorStatsAccountBadge");
    if (subEl) subEl.textContent = "";
    if (accountEl) accountEl.textContent = getCurrentSessionLabel();
  }

  function buildStatsSessionBar(){
    const wrap = document.createElement("div");
    wrap.className = "visitorStatsSessionBar";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "visitorStatsSessionTitle";
    title.textContent = getCurrentSessionLabel();
    const text = document.createElement("div");
    text.className = "visitorStatsSessionText";
    text.textContent = currentSession.mode === "account"
      ? (isCloudSyncReady()
          ? "このアカウントの成績をクラウド保存しています。別端末でも同じ番号で読めます。"
          : "このアカウントの保存成績を表示しています。")
      : "ローカルの成績はこの端末内だけ保持されます。";
    left.appendChild(title);
    left.appendChild(text);
    wrap.appendChild(left);
    return wrap;
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

    let totalScoreValue = null;
    try{
      if (typeof calcHanchanTotalScoreValue === "function"){
        totalScoreValue = calcHanchanTotalScoreValue(point, playerIndex, rows, chipCount);
      }
    }catch(e){
      totalScoreValue = null;
    }
    if (!Number.isFinite(totalScoreValue)){
      totalScoreValue = calcVisitorTotalScoreValue(scoreValue, chipCount);
    }

    const entry = {
      finishedAt: new Date().toISOString(),
      rankLabel,
      rankIndex: playerIndex,
      point,
      chipCount,
      scoreValue,
      totalScoreValue,
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
    writeHistory(history);
    saveTracker();
    resetTrackerRoundState(false);
    scheduleRemoteSnapshotSync();
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

  function formatPercentValue(value){
    if (!Number.isFinite(value)) return "—";
    return `${(value * 100).toFixed(1)}%`;
  }

  function formatAveragePointValue(value){
    if (!Number.isFinite(value)) return "—";
    return `${Math.round(value).toLocaleString("ja-JP")}点`;
  }

  function getNormalizedStoredLogsForStats(logs){
    const normalizer = (typeof window !== "undefined") ? window.MBSanmaLogNormalizer : null;
    if (!normalizer || typeof normalizer.normalizeStoredLogs !== "function") return [];
    return normalizer.normalizeStoredLogs(logs);
  }

  function getLogMetricsForStats(logs){
    const normalizedLogs = getNormalizedStoredLogsForStats(logs);
    const metricsApi = (typeof window !== "undefined") ? window.MBSanmaLogMetrics : null;
    const summary = metricsApi && typeof metricsApi.summarizeLogs === "function"
      ? metricsApi.summarizeLogs(normalizedLogs)
      : null;
    return { normalizedLogs, summary };
  }

  function buildLogAnalysisMetricPanel(logSummary){
    const summary = logSummary && typeof logSummary === "object" ? logSummary : null;
    if (!summary || !(Number(summary.kyokuCount) > 0)){
      const empty = document.createElement("div");
      empty.className = "visitorStatsEmpty";
      empty.innerHTML = "まだログ分析に使える局データがありません。";
      return empty;
    }

    return buildStatsMetricPanel("ログ分析", [
      { label: "局数", value: `${Number(summary.kyokuCount) || 0}`, hint: "保存中ログの局数" },
      { label: "打牌回数", value: `${Number(summary.playerDiscardCount) || 0}`, hint: "自分の打牌" },
      { label: "アガリ率", value: formatPercentValue(summary.playerAgariRate), hint: "局数基準" },
      { label: "放銃率", value: formatPercentValue(summary.playerHojuRate), hint: "局数基準" },
      { label: "リーチ率", value: formatPercentValue(summary.playerRiichiRate), hint: "局数基準" },
      { label: "平均打点", value: formatAveragePointValue(summary.playerAverageAgariPoint), hint: "ログ和了ベース" },
      { label: "平均リーチ巡目", value: Number.isFinite(summary.playerAverageRiichiJunme) ? summary.playerAverageRiichiJunme.toFixed(2) : "—", hint: "ログリーチベース" },
      { label: "リーチアガリ率", value: formatPercentValue(summary.playerRiichiAgariRate), hint: "リーチ回数基準" },
      { label: "リーチ平均打点", value: formatAveragePointValue(summary.playerAverageRiichiAgariPoint), hint: "ログ和了ベース" },
      { label: "両面リーチ数", value: `${Number(summary.playerRyanmenRiichiCount) || 0}`, hint: "待ち形ベース" },
      { label: "両面リーチアガリ率", value: formatPercentValue(summary.playerRyanmenRiichiAgariRate), hint: "両面リーチ基準" },
      { label: "両面リーチ平均打点", value: formatAveragePointValue(summary.playerAverageRyanmenRiichiAgariPoint), hint: "ログ和了ベース" }
    ]);
  }

  function buildCpuAnalysisMetricPanel(logSummary){
    const summary = logSummary && typeof logSummary === "object" ? logSummary : null;
    if (!summary || !(Number(summary.cpuDiscardCount) > 0 || Number(summary.cpuOpenCount) > 0)){
      const empty = document.createElement("div");
      empty.className = "visitorStatsEmpty";
      empty.innerHTML = "まだCPU分析に使えるログがありません。";
      return empty;
    }

    const execCounts = summary.cpuDiscardExecutionSourceCounts || {};
    const topDiscardReason = Object.entries(summary.cpuDiscardReasonTagCounts || {}).sort((a,b)=> b[1]-a[1]).slice(0, 3);
    const topOpenReason = Object.entries(summary.cpuOpenReasonTagCounts || {}).sort((a,b)=> b[1]-a[1]).slice(0, 3);

    const panel = document.createElement("div");
    panel.className = "visitorStatsTablePanel";

    const title = document.createElement("div");
    title.className = "visitorStatsTableTitle";
    title.textContent = "CPU分析";
    panel.appendChild(title);

    panel.appendChild(buildStatsMetricPanel("CPU判断", [
      { label: "CPU打牌", value: `${Number(summary.cpuDiscardCount) || 0}`, hint: "正規化打牌判断" },
      { label: "CPU副露", value: `${Number(summary.cpuOpenCount) || 0}`, hint: "正規化副露判断" },
      { label: "shadow一致率", value: formatPercentValue(summary.cpuDiscardShadowAgreeRate), hint: "比較可能分のみ" },
      { label: "external", value: `${Number(execCounts.external) || 0}`, hint: "打牌実行元" },
      { label: "internal", value: `${Number(execCounts.internal_eval) || 0}`, hint: "打牌実行元" },
      { label: "fallback", value: `${Number(execCounts.internal_eval_fallback) || 0}`, hint: "打牌実行元" }
    ]));

    const reasonWrap = document.createElement("div");
    reasonWrap.className = "visitorStatsEmpty";
    const discardReasonText = topDiscardReason.length
      ? topDiscardReason.map(([key, count])=> `${key}:${count}`).join(" / ")
      : "なし";
    const openReasonText = topOpenReason.length
      ? topOpenReason.map(([key, count])=> `${key}:${count}`).join(" / ")
      : "なし";
    reasonWrap.innerHTML = `打牌 reasonTag 上位: ${discardReasonText}<br>副露 reasonTag 上位: ${openReasonText}`;
    panel.appendChild(reasonWrap);
    return panel;
  }

  function formatLogDateTime(value){
    if (!value) return "—";
    try{
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
    }catch(e){
      return String(value);
    }
  }

  function getStoredMatchLogsForStats(){
    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.getStoredLogs === "function"){
        const logs = window.MBSanmaMatchLog.getStoredLogs();
        return Array.isArray(logs) ? logs.filter((item)=> item && typeof item === "object") : [];
      }
    }catch(e){}
    return [];
  }

  function getLogSeatLabel(seatIndex){
    if (seatIndex === 0) return "あなた";
    if (seatIndex === 1) return "右CPU";
    if (seatIndex === 2) return "左CPU";
    return "不明";
  }

  function getLogRoundLabel(kyoku){
    const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
    const wind = start.roundWind || "?";
    const number = Number(start.roundNumber) || 0;
    const honba = Number(start.honba) || 0;
    return `${wind}${number}局 ${honba}本場`;
  }

  function summarizeLogSummary(log){
    const summary = log && log.summary && typeof log.summary === "object" ? log.summary : null;
    const endInfo = summary && summary.endInfo && typeof summary.endInfo === "object" ? summary.endInfo : null;
    if (endInfo && endInfo.reason){
      return `終了理由: ${endInfo.reason}`;
    }
    const settlement = summary && summary.settlement && typeof summary.settlement === "object" ? summary.settlement : null;
    if (settlement){
      if (settlement.type === "agari"){
        const winner = getLogSeatLabel(settlement.winnerSeatIndex);
        if (settlement.winType === "tsumo") return `終局: ${winner} ツモ`;
        if (settlement.winType === "ron") return `終局: ${winner} ロン`;
      }
      if (settlement.type === "ryukyoku") return "終局: 流局";
    }
    return "終局情報なし";
  }

  function getLogEventPayload(event){
    return event && event.payload && typeof event.payload === "object" ? event.payload : {};
  }

  function getLogEventSeqLabel(startSeq, endSeq){
    const from = Number(startSeq) || 0;
    const to = Number(endSeq) || 0;
    if (from > 0 && to > 0 && from !== to) return `#${from}-#${to}`;
    return `#${from || to || 0}`;
  }

  function getCpuDecisionStatusText(status){
    const map = {
      decided: "判断",
      selected: "選択",
      executed: "実行",
      decision_rejected: "却下",
      candidate_not_found: "候補なし"
    };
    return map[status] || status || "";
  }

  function getCpuExecutionSourceText(source){
    const map = {
      external: "external",
      internal_eval: "internal",
      internal_eval_fallback: "internal fallback",
      legacy: "legacy"
    };
    return map[source] || source || "";
  }

  function getCpuDiscardDecisionCode(payload){
    if (!payload || typeof payload !== "object") return "";
    return payload.finalDiscardCode || payload.selectedDiscardCode || payload.discardCode || payload.externalDiscardCode || payload.shadowInternalDiscardCode || "";
  }

  function getCpuOpenDecisionAction(payload){
    if (!payload || typeof payload !== "object") return "";
    return payload.finalAction || payload.action || "";
  }

  function buildDefaultLogEntryFromEvent(event){
    const payload = getLogEventPayload(event);
    const type = event && event.type ? event.type : "event";

    let title = type;
    let detail = "";
    let sub = formatLogDateTime(event && event.at);

    if (type === "draw"){
      title = `${getLogSeatLabel(payload.seatIndex)} ツモ ${payload.tile && payload.tile.code ? payload.tile.code : "?"}`;
      if (payload.source) detail = `source: ${payload.source}`;
    } else if (type === "discard"){
      const code = payload.tile && payload.tile.code ? payload.tile.code : (payload.code || "?");
      title = `${getLogSeatLabel(payload.seatIndex)} 打牌 ${code}`;
    } else if (type === "pei"){
      title = `${getLogSeatLabel(payload.seatIndex)} 北抜き`;
    } else if (type === "agari_tsumo"){
      title = `${getLogSeatLabel(payload.winnerSeatIndex)} ツモ`;
    } else if (type === "agari_ron"){
      const winners = Array.isArray(payload.winnerSeatIndexes)
        ? payload.winnerSeatIndexes.map(getLogSeatLabel).join(" / ")
        : getLogSeatLabel(payload.winnerSeatIndex);
      title = `${winners} ロン`;
    } else if (type === "ryukyoku_exhaustion"){
      title = "山枯れ流局";
    } else if (type === "settlement"){
      const settlement = payload.settlement && typeof payload.settlement === "object" ? payload.settlement : {};
      if (settlement.type === "agari"){
        title = `精算 ${settlement.winType === "tsumo" ? "ツモ" : "ロン"}`;
      } else if (settlement.type === "ryukyoku"){
        title = "精算 流局";
      } else {
        title = "精算";
      }
      if (Array.isArray(settlement.afterScores)){
        detail = `after: ${settlement.afterScores.join(" / ")}`;
      }
    } else if (type === "cpu_api_bridge_request"){
      title = `API要求 ${payload.kind || ""}`.trim();
      const bits = [];
      if (payload.mode) bits.push(`mode=${payload.mode}`);
      if (payload.endpoint) bits.push(payload.endpoint);
      detail = bits.join(" / ");
    } else if (type === "cpu_api_bridge_response"){
      title = `API応答 ${payload.ok ? "成功" : "失敗"} ${payload.kind || ""}`.trim();
      const bits = [];
      if (payload.mode) bits.push(`mode=${payload.mode}`);
      if (payload.status) bits.push(`status=${payload.status}`);
      if (payload.error) bits.push(`error=${payload.error}`);
      detail = bits.join(" / ");
    }

    return {
      kind: "default",
      title,
      sub,
      detail,
      seqLabel: getLogEventSeqLabel(event && event.seq, event && event.seq)
    };
  }

  function buildCpuDiscardLogEntry(bundle){
    const snapshotPayload = getLogEventPayload(bundle.snapshot);
    const decisions = Array.isArray(bundle.decisions) ? bundle.decisions : [];
    const lastDecisionPayload = decisions.length ? getLogEventPayload(decisions[decisions.length - 1]) : {};
    const discardPayload = bundle.discardEvent ? getLogEventPayload(bundle.discardEvent) : {};
    const apiRequestPayload = bundle.apiRequest ? getLogEventPayload(bundle.apiRequest) : {};
    const apiResponsePayload = bundle.apiResponse ? getLogEventPayload(bundle.apiResponse) : {};

    const seatLabel = getLogSeatLabel(snapshotPayload.seatIndex);
    const finalCode = discardPayload.tile && discardPayload.tile.code
      ? discardPayload.tile.code
      : getCpuDiscardDecisionCode(lastDecisionPayload) || "?";

    const title = `${seatLabel} 打牌 ${finalCode}`;
    const bits = [];
    const candidateCount = Number(snapshotPayload.candidateCount) || 0;
    if (candidateCount > 0) bits.push(`${candidateCount}候補`);

    const execText = getCpuExecutionSourceText(lastDecisionPayload.executionSource);
    if (execText) bits.push(execText);

    const statusText = getCpuDecisionStatusText(lastDecisionPayload.status);
    if (statusText) bits.push(statusText);

    if (lastDecisionPayload.shadowAgree === true){
      bits.push("shadow一致");
    } else if (lastDecisionPayload.shadowInternalDiscardCode || lastDecisionPayload.externalDiscardCode){
      bits.push("shadow差分あり");
    }

    if (bundle.discardEvent) bits.push("実打牌");

    const detailBits = [];
    if (lastDecisionPayload.selectedDiscardCode) detailBits.push(`selected=${lastDecisionPayload.selectedDiscardCode}`);
    if (lastDecisionPayload.shadowInternalDiscardCode) detailBits.push(`shadow=${lastDecisionPayload.shadowInternalDiscardCode}`);
    if (lastDecisionPayload.externalDiscardCode) detailBits.push(`external=${lastDecisionPayload.externalDiscardCode}`);
    if (lastDecisionPayload.reasonTag) detailBits.push(`reason=${lastDecisionPayload.reasonTag}`);
    if (apiRequestPayload.mode) detailBits.push(`apiReq=${apiRequestPayload.mode}`);
    if (bundle.apiResponse){
      detailBits.push(apiResponsePayload.ok ? "apiRes=ok" : `apiRes=${apiResponsePayload.error || "ng"}`);
    }

    const atSource = bundle.discardEvent || decisions[decisions.length - 1] || bundle.snapshot;

    return {
      kind: "cpu_discard",
      title,
      sub: `${formatLogDateTime(atSource && atSource.at)} / ${bits.join(" / ")}`,
      detail: detailBits.join(" / "),
      seqLabel: getLogEventSeqLabel(bundle.startSeq, bundle.endSeq)
    };
  }

  function buildCpuOpenLogEntry(bundle){
    const snapshotPayload = getLogEventPayload(bundle.snapshot);
    const decisions = Array.isArray(bundle.decisions) ? bundle.decisions : [];
    const lastDecisionPayload = decisions.length ? getLogEventPayload(decisions[decisions.length - 1]) : {};
    const seatLabel = getLogSeatLabel(snapshotPayload.candidateSeatIndex);
    const tileCode = snapshotPayload.discardedTile && snapshotPayload.discardedTile.code ? snapshotPayload.discardedTile.code : "?";
    const action = getCpuOpenDecisionAction(lastDecisionPayload) || "pass";
    const title = `${seatLabel} 副露 ${action} (${tileCode})`;

    const acts = [];
    if (snapshotPayload.legalActions && snapshotPayload.legalActions.pon) acts.push("ポン");
    if (snapshotPayload.legalActions && snapshotPayload.legalActions.minkan) acts.push("明槓");

    const bits = [];
    if (acts.length) bits.push(`候補:${acts.join("/")}`);
    const statusText = getCpuDecisionStatusText(lastDecisionPayload.status);
    if (statusText) bits.push(statusText);
    if (lastDecisionPayload.source) bits.push(lastDecisionPayload.source);

    const detailBits = [];
    if (lastDecisionPayload.reasonTag) detailBits.push(`reason=${lastDecisionPayload.reasonTag}`);
    if (lastDecisionPayload.shadowAction) detailBits.push(`shadow=${lastDecisionPayload.shadowAction}`);

    const atSource = decisions[decisions.length - 1] || bundle.snapshot;

    return {
      kind: "cpu_open",
      title,
      sub: `${formatLogDateTime(atSource && atSource.at)} / ${bits.join(" / ")}`,
      detail: detailBits.join(" / "),
      seqLabel: getLogEventSeqLabel(bundle.startSeq, bundle.endSeq)
    };
  }

  function findNextMatchingApiResponse(events, startIndex, kind){
    for (let i = startIndex; i < events.length; i++){
      const event = events[i];
      if (!event || event.type !== "cpu_api_bridge_response") continue;
      const payload = getLogEventPayload(event);
      if (payload.kind === kind) return { event, index: i };
    }
    return null;
  }

  function buildGroupedLogEntries(events){
    const list = Array.isArray(events) ? events : [];
    const out = [];
    const usedIndexes = new Set();

    for (let i = 0; i < list.length; i++){
      if (usedIndexes.has(i)) continue;

      const event = list[i];
      if (!event || typeof event !== "object"){
        continue;
      }

      const payload = getLogEventPayload(event);

      if (event.type === "cpu_discard_snapshot"){
        const snapshotId = Number(payload.snapshotId) || null;
        const seatIndex = payload.seatIndex;
        const bundle = {
          snapshot: event,
          decisions: [],
          apiRequest: null,
          apiResponse: null,
          discardEvent: null,
          startSeq: Number(event.seq) || 0,
          endSeq: Number(event.seq) || 0
        };

        for (let j = i + 1; j < list.length; j++){
          if (usedIndexes.has(j)) continue;
          const next = list[j];
          if (!next || typeof next !== "object") continue;
          const nextPayload = getLogEventPayload(next);

          if (next.type === "cpu_discard_snapshot"){
            break;
          }

          if (next.type === "cpu_discard_decision" && snapshotId != null && Number(nextPayload.snapshotId) === snapshotId){
            bundle.decisions.push(next);
            bundle.endSeq = Number(next.seq) || bundle.endSeq;
            usedIndexes.add(j);
            continue;
          }

          if (next.type === "cpu_api_bridge_request" && nextPayload.kind === "cpuDiscardCandidate" && snapshotId != null && Number(nextPayload.snapshotId) === snapshotId){
            bundle.apiRequest = next;
            bundle.endSeq = Number(next.seq) || bundle.endSeq;
            usedIndexes.add(j);

            const responseMatch = findNextMatchingApiResponse(list, j + 1, "cpuDiscardCandidate");
            if (responseMatch && !usedIndexes.has(responseMatch.index)){
              bundle.apiResponse = responseMatch.event;
              bundle.endSeq = Number(responseMatch.event.seq) || bundle.endSeq;
              usedIndexes.add(responseMatch.index);
            }
            continue;
          }

          if (next.type === "discard" && nextPayload.seatIndex === seatIndex){
            const expectedCode = bundle.decisions.length
              ? (getCpuDiscardDecisionCode(getLogEventPayload(bundle.decisions[bundle.decisions.length - 1])) || "")
              : "";
            const actualCode = nextPayload.tile && nextPayload.tile.code ? nextPayload.tile.code : (nextPayload.code || "");
            if (!expectedCode || expectedCode === actualCode){
              bundle.discardEvent = next;
              bundle.endSeq = Number(next.seq) || bundle.endSeq;
              usedIndexes.add(j);
              break;
            }
          }
        }

        out.push(buildCpuDiscardLogEntry(bundle));
        continue;
      }

      if (event.type === "cpu_open_snapshot"){
        const snapshotId = Number(payload.snapshotId) || null;
        const bundle = {
          snapshot: event,
          decisions: [],
          startSeq: Number(event.seq) || 0,
          endSeq: Number(event.seq) || 0
        };

        for (let j = i + 1; j < list.length; j++){
          if (usedIndexes.has(j)) continue;
          const next = list[j];
          if (!next || typeof next !== "object") continue;
          const nextPayload = getLogEventPayload(next);

          if (next.type === "cpu_open_snapshot"){
            break;
          }

          if (next.type === "cpu_open_decision" && snapshotId != null && Number(nextPayload.snapshotId) === snapshotId){
            bundle.decisions.push(next);
            bundle.endSeq = Number(next.seq) || bundle.endSeq;
            usedIndexes.add(j);
            continue;
          }
        }

        out.push(buildCpuOpenLogEntry(bundle));
        continue;
      }

      if (event.type === "cpu_discard_decision" || event.type === "cpu_open_decision"){
        continue;
      }

      if (event.type === "cpu_api_bridge_request" || event.type === "cpu_api_bridge_response"){
        continue;
      }

      out.push(buildDefaultLogEntryFromEvent(event));
    }

    return out;
  }

  function buildLogEntryRow(entry){
    const row = document.createElement("div");
    row.className = "visitorLogEventRow";

    const top = document.createElement("div");
    top.className = "visitorLogEventTop";

    const type = document.createElement("div");
    type.className = "visitorLogEventType";
    type.textContent = entry && entry.title ? entry.title : "event";

    const seq = document.createElement("div");
    seq.className = "visitorLogEventSeq";
    seq.textContent = entry && entry.seqLabel ? entry.seqLabel : "#0";

    top.appendChild(type);
    top.appendChild(seq);

    const sub = document.createElement("div");
    sub.className = "visitorLogEventSub";
    sub.textContent = entry && entry.sub ? entry.sub : "";

    row.appendChild(top);
    row.appendChild(sub);

    if (entry && entry.detail){
      const detail = document.createElement("div");
      detail.className = "visitorLogEventText";
      detail.textContent = entry.detail;
      row.appendChild(detail);
    }

    return row;
  }

  function buildLogKyokuBlock(kyoku, index){
    const details = document.createElement("details");
    details.className = "visitorLogKyoku";
    if (index === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.className = "visitorLogKyokuSummary";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "visitorLogKyokuTitle";
    title.textContent = getLogRoundLabel(kyoku);
    left.appendChild(title);

    const right = document.createElement("div");
    right.className = "visitorLogKyokuMeta";
    const rawEventCount = Array.isArray(kyoku && kyoku.events) ? kyoku.events.length : 0;
    const groupedEntries = buildGroupedLogEntries(Array.isArray(kyoku && kyoku.events) ? kyoku.events.slice() : []);
    const settlement = kyoku && kyoku.settlement && typeof kyoku.settlement === "object" ? kyoku.settlement : null;
    const resultText = settlement
      ? (settlement.type === "agari"
          ? `${getLogSeatLabel(settlement.winnerSeatIndex)} ${settlement.winType === "tsumo" ? "ツモ" : "ロン"}`
          : "流局")
      : "未精算";
    right.innerHTML = `${resultText}<br>${groupedEntries.length}行 / 生${rawEventCount}件`;

    summary.appendChild(left);
    summary.appendChild(right);
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "visitorLogEventList";
    const entries = groupedEntries.slice(-18);
    if (!entries.length){
      const empty = document.createElement("div");
      empty.className = "visitorLogEventSub";
      empty.textContent = "イベントなし";
      list.appendChild(empty);
    } else {
      entries.forEach((entry)=> list.appendChild(buildLogEntryRow(entry)));
    }
    details.appendChild(list);
    return details;
  }

  function buildNormalizedLogEventRow(entry){
    const row = document.createElement("div");
    row.className = "visitorLogEventRow";

    const top = document.createElement("div");
    top.className = "visitorLogEventTop";

    const type = document.createElement("div");
    type.className = "visitorLogEventType";
    type.textContent = entry && entry.title ? entry.title : "イベント";

    const seq = document.createElement("div");
    seq.className = "visitorLogEventSeq";
    seq.textContent = entry && entry.seqLabel ? entry.seqLabel : "#0";

    top.appendChild(type);
    top.appendChild(seq);

    const sub = document.createElement("div");
    sub.className = "visitorLogEventSub";
    sub.textContent = entry && entry.sub ? entry.sub : "";

    row.appendChild(top);
    row.appendChild(sub);

    if (entry && entry.detail){
      const detail = document.createElement("div");
      detail.className = "visitorLogEventText";
      detail.textContent = entry.detail;
      row.appendChild(detail);
    }

    if (entry && entry.extra){
      const extra = document.createElement("div");
      extra.className = "visitorLogEventSub";
      extra.textContent = entry.extra;
      row.appendChild(extra);
    }

    return row;
  }

  function buildNormalizedLogKyokuBlock(normalizedKyoku, index){
    const details = document.createElement("details");
    details.className = "visitorLogKyoku";
    if (index === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.className = "visitorLogKyokuSummary";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "visitorLogKyokuTitle";
    title.textContent = normalizedKyoku && normalizedKyoku.label ? normalizedKyoku.label : "局";
    left.appendChild(title);

    const right = document.createElement("div");
    right.className = "visitorLogKyokuMeta";
    const resultText = normalizedKyoku && normalizedKyoku.resultText ? normalizedKyoku.resultText : "未精算";
    const rowCount = Number(normalizedKyoku && normalizedKyoku.rowCount) || 0;
    const rawEventCount = Number(normalizedKyoku && normalizedKyoku.rawEventCount) || 0;
    right.innerHTML = `${resultText}<br>${rowCount}行 / 生${rawEventCount}件`;

    summary.appendChild(left);
    summary.appendChild(right);
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "visitorLogEventList";
    const rows = Array.isArray(normalizedKyoku && normalizedKyoku.rows) ? normalizedKyoku.rows : [];
    if (!rows.length){
      const empty = document.createElement("div");
      empty.className = "visitorLogEventSub";
      empty.textContent = "イベントなし";
      list.appendChild(empty);
    } else {
      rows.forEach((entry)=> list.appendChild(buildNormalizedLogEventRow(entry)));
    }
    details.appendChild(list);
    return details;
  }

  function buildLogsPanel(logs){
    const wrap = document.createElement("section");
    wrap.className = "visitorLogPanel";

    const note = document.createElement("div");
    note.className = "visitorLogNote";
    note.textContent = "最新の半荘ログを、1アクション1行に束ねて表示します。CPU判断は候補・選択・実打牌をまとめて確認できます。";
    wrap.appendChild(note);

    const normalizer = (typeof window !== "undefined") ? window.MBSanmaLogNormalizer : null;
    const normalizedLogs = getNormalizedStoredLogsForStats(logs);

    if (!normalizedLogs.length){
      const empty = document.createElement("div");
      empty.className = "visitorStatsEmpty";
      empty.innerHTML = "まだ対局ログがありません。<br>局が進むと、この端末に簡易ログが保存されます。";
      wrap.appendChild(empty);
      return wrap;
    }

    normalizedLogs.slice(0, 5).forEach((log, index)=>{
      const card = document.createElement("section");
      card.className = "visitorLogMatchCard";

      const head = document.createElement("div");
      head.className = "visitorLogMatchHead";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "visitorLogMatchTitle";
      const dt = normalizer && typeof normalizer.formatDateTime === "function"
        ? normalizer.formatDateTime(log && log.startedAt)
        : formatLogDateTime(log && log.startedAt);
      title.textContent = `${index === 0 ? "最新" : `${index + 1}件前`} / ${dt}`;
      const meta = document.createElement("div");
      meta.className = "visitorLogMatchMeta";
      meta.innerHTML = `matchId: ${log && log.matchId ? log.matchId : "—"}<br>局数: ${Number(log && log.kyokuCount) || 0} / 表示${Number(log && log.rowCount) || 0}行 / 生${Number(log && log.rawEventCount) || 0}件`;
      left.appendChild(title);
      left.appendChild(meta);

      const badge = document.createElement("div");
      badge.className = "visitorLogMatchBadge";
      const session = log && log.session && log.session.mode === "account" && log.session.accountId
        ? log.session.accountId
        : "ローカル";
      badge.textContent = session;

      head.appendChild(left);
      head.appendChild(badge);
      card.appendChild(head);

      const kyokuList = document.createElement("div");
      kyokuList.className = "visitorLogKyokuList";
      const kyokus = Array.isArray(log && log.kyokus) ? log.kyokus.slice().reverse() : [];
      kyokus.forEach((kyoku, kyokuIndex)=> kyokuList.appendChild(buildNormalizedLogKyokuBlock(kyoku, kyokuIndex)));
      card.appendChild(kyokuList);

      wrap.appendChild(card);
    });

    return wrap;
  }

  function buildStyleScores(history, metrics){
    const avgScoreValue = averageFromHistory(history, "scoreValue");
    const avgTotalScoreValue = averageFromHistory(history, "totalScoreValue");
    const avgPoint = averageFromHistory(history, "point");
    const avgChip = averageFromHistory(history, "chipCount");
    const topRate = metrics.rankRates[0] || 0;
    const hojuRate = metrics.hojuRateValue || 0;
    const agariRate = metrics.agariRateValue || 0;
    const riichiRate = metrics.riichiRateValue || 0;
    const furoRate = metrics.furoRateValue || 0;

    return {
      attack: clampStatScore(42 + (topRate * 26) + Math.max(0, avgTotalScoreValue) * 1.25 + Math.max(0, avgChip) * 2.8),
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

  function buildStatsPreviewBar(usingSample, hasRealData){
    const wrap = document.createElement("div");
    wrap.className = "visitorStatsPreviewBar";

    const note = document.createElement("div");
    note.className = "visitorStatsPreviewNote";
    if (usingSample){
      note.innerHTML = hasRealData
        ? "見た目確認用の<strong>サンプル成績</strong>を表示中です。"
        : "まだ実データが無いため、見た目確認用の<strong>サンプル成績</strong>を表示中です。";
    } else {
      note.textContent = "実データを表示中です。必要ならサンプル成績に切り替えてレイアウト確認できます。";
    }

    const actions = document.createElement("div");
    actions.className = "visitorStatsPreviewActions";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "visitorStatsPreviewBtn isPrimary";
    toggleBtn.textContent = usingSample
      ? (hasRealData ? "実データに戻す" : "サンプルを閉じる")
      : "サンプル表示";
    toggleBtn.addEventListener("click", ()=>{
      setStatsPreviewMode(!usingSample);
      renderStatsOverlay();
    });

    actions.appendChild(toggleBtn);
    wrap.appendChild(note);
    wrap.appendChild(actions);
    return wrap;
  }

  function buildStatsCards(history){
    const cards = document.createElement("div");
    cards.className = "visitorStatsCards";

    history.slice(0, 3).forEach((item, index)=>{
      const rankIndex = Number(item.rankIndex);
      const card = document.createElement("div");
      card.className = `visitorStatsCard is-rank-${rankIndex + 1}`;

      const top = document.createElement("div");
      top.className = "visitorStatsCardTop";

      const round = document.createElement("div");
      round.className = "visitorStatsCardRound";
      round.textContent = `最新${index + 1}`;

      const rank = document.createElement("div");
      rank.className = "visitorStatsCardRank";
      rank.textContent = item.rankLabel || "—";

      const scoreLabel = document.createElement("div");
      scoreLabel.className = "visitorStatsCardLabel";
      scoreLabel.textContent = "最終スコア";

      const score = document.createElement("div");
      score.className = "visitorStatsCardScore";
      score.textContent = Number.isFinite(item.totalScoreValue)
        ? `${item.totalScoreValue > 0 ? "+" : ""}${item.totalScoreValue.toFixed(1)}`
        : "—";

      const point = document.createElement("div");
      point.className = "visitorStatsCardPoint";
      point.textContent = formatPointText(item.point);

      const meta = document.createElement("div");
      meta.className = "visitorStatsCardMeta";
      const scoreValueText = Number.isFinite(item.scoreValue)
        ? `${item.scoreValue > 0 ? "+" : ""}${item.scoreValue.toFixed(1)}`
        : "—";
      meta.textContent = `${formatSignedChipText(item.chipCount)} / 素点 ${scoreValueText}`;

      top.appendChild(round);
      top.appendChild(rank);
      card.appendChild(top);
      card.appendChild(scoreLabel);
      card.appendChild(score);
      card.appendChild(point);
      card.appendChild(meta);
      cards.appendChild(card);
    });

    return cards;
  }

  function buildStatsMetrics(history){
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

    return {
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
      totalScoreValue: history.reduce((sum, item)=> sum + (Number(item.totalScoreValue) || 0), 0),
      totalChipCount: history.reduce((sum, item)=> sum + (Number(item.chipCount) || 0), 0),
      avgPoint: averageFromHistory(history, "point"),
      avgScoreValue: averageFromHistory(history, "scoreValue"),
      avgTotalScoreValue: averageFromHistory(history, "totalScoreValue"),
      avgChip: averageFromHistory(history, "chipCount")
    };
  }

  function buildStatsMetricPanel(title, items){
    const panel = document.createElement("div");
    panel.className = "visitorStatsTablePanel";

    const heading = document.createElement("div");
    heading.className = "visitorStatsTableTitle";
    heading.textContent = title;

    const grid = document.createElement("div");
    grid.className = "visitorStatsTableGrid";

    items.forEach((item)=>{
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
      hint.textContent = item.hint || "";

      cell.appendChild(label);
      cell.appendChild(value);
      cell.appendChild(hint);
      grid.appendChild(cell);
    });

    panel.appendChild(heading);
    panel.appendChild(grid);
    return panel;
  }

  function buildStatsGraphsPanel(history, metrics, styleScores, donut){
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
    leftSub.textContent = `保存中の${history.length}半荘ぶんから簡易算出しています。`;
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
      "攻：保存中の成績の打点感とトップ率が高いほど上がります。",
      "防：保存中の成績の放銃率が低いほど上がります。",
      "速：保存中の成績の和了率が高いほど上がります。",
      "運：保存中の成績の流れとプラス結果をもとに簡易表示しています。"
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
    return main;
  }


  function getReplayMatchLabel(match, index){
    const startedAt = match && match.startedAt ? formatLogDateTime(match.startedAt) : "—";
    return `${index === 0 ? "最新" : `${index + 1}件前`} / ${startedAt}`;
  }

  function tileToReplayText(tile){
    if (!tile || typeof tile !== "object") return "—";
    const base = tile.imgCode || tile.code || "—";
    return tile.isRed ? `${base}(赤)` : base;
  }

  function tileArrayToReplayText(list){
    if (!Array.isArray(list) || list.length <= 0) return "—";
    return list.map((tile)=> tileToReplayText(tile)).join(" ");
  }

  function scoreArrayToReplayText(list){
    if (!Array.isArray(list) || list.length <= 0) return "—";
    return list.map((value)=> Number(value || 0).toLocaleString("ja-JP")).join(" / ");
  }

  function createReplayInfoRow(labelText, valueText){
    const row = document.createElement("div");
    row.className = "visitorReplayInfoRow";

    const label = document.createElement("div");
    label.className = "visitorReplayInfoLabel";
    label.textContent = labelText;

    const value = document.createElement("div");
    value.className = "visitorReplayInfoValue";
    value.textContent = valueText || "—";

    row.appendChild(label);
    row.appendChild(value);
    return row;
  }

  function buildReplayPanel(logs){
    const wrap = document.createElement("section");
    wrap.className = "visitorReplayPanel";

    const note = document.createElement("div");
    note.className = "visitorReplayNote";
    note.textContent = "最低版の牌譜再生です。局開始情報と、1アクションずつの流れを前後移動で確認できます。";
    wrap.appendChild(note);

    const normalizedLogs = getNormalizedStoredLogsForStats(logs);
    if (!normalizedLogs.length){
      const empty = document.createElement("div");
      empty.className = "visitorStatsEmpty";
      empty.innerHTML = "まだ再生できるログがありません。<br>局が進むと、この端末にログが保存されます。";
      wrap.appendChild(empty);
      return wrap;
    }

    const card = document.createElement("div");
    card.className = "visitorReplayCard";

    const controls = document.createElement("div");
    controls.className = "visitorReplayControls";

    const selectRow = document.createElement("div");
    selectRow.className = "visitorReplaySelectRow";

    const matchField = document.createElement("div");
    matchField.className = "visitorReplayField";
    const matchLabel = document.createElement("div");
    matchLabel.className = "visitorReplayLabel";
    matchLabel.textContent = "半荘";
    const matchSelect = document.createElement("select");
    matchSelect.className = "visitorReplaySelect";
    normalizedLogs.forEach((match, index)=>{
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = getReplayMatchLabel(match, index);
      matchSelect.appendChild(option);
    });
    matchField.appendChild(matchLabel);
    matchField.appendChild(matchSelect);

    const kyokuField = document.createElement("div");
    kyokuField.className = "visitorReplayField";
    const kyokuLabel = document.createElement("div");
    kyokuLabel.className = "visitorReplayLabel";
    kyokuLabel.textContent = "局";
    const kyokuSelect = document.createElement("select");
    kyokuSelect.className = "visitorReplaySelect";
    kyokuField.appendChild(kyokuLabel);
    kyokuField.appendChild(kyokuSelect);

    selectRow.appendChild(matchField);
    selectRow.appendChild(kyokuField);

    const stepField = document.createElement("div");
    stepField.className = "visitorReplayField";
    const stepLabel = document.createElement("div");
    stepLabel.className = "visitorReplayLabel";
    stepLabel.textContent = "手順";
    const stepRange = document.createElement("input");
    stepRange.type = "range";
    stepRange.className = "visitorReplayRange";
    stepRange.min = "0";
    stepRange.max = "0";
    stepRange.step = "1";
    stepRange.value = "0";
    stepField.appendChild(stepLabel);
    stepField.appendChild(stepRange);

    const stepRow = document.createElement("div");
    stepRow.className = "visitorReplayStepRow";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "visitorReplayBtn";
    prevBtn.textContent = "1手戻る";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "visitorReplayBtn";
    nextBtn.textContent = "1手進む";
    const stepMeta = document.createElement("div");
    stepMeta.className = "visitorReplayStepMeta";
    stepRow.appendChild(prevBtn);
    stepRow.appendChild(nextBtn);
    stepRow.appendChild(stepMeta);

    controls.appendChild(selectRow);
    controls.appendChild(stepField);
    controls.appendChild(stepRow);

    const currentBox = document.createElement("div");
    currentBox.className = "visitorReplayCurrent";

    const grid = document.createElement("div");
    grid.className = "visitorReplayGrid";

    const startPanel = document.createElement("div");
    startPanel.className = "visitorReplayPanelBlock";
    const startTitle = document.createElement("div");
    startTitle.className = "visitorReplayPanelTitle";
    startTitle.textContent = "局開始情報";
    const startInfoList = document.createElement("div");
    startInfoList.className = "visitorReplayInfoList";
    startPanel.appendChild(startTitle);
    startPanel.appendChild(startInfoList);

    const trailPanel = document.createElement("div");
    trailPanel.className = "visitorReplayPanelBlock";
    const trailTitle = document.createElement("div");
    trailTitle.className = "visitorReplayPanelTitle";
    trailTitle.textContent = "前後の流れ";
    const trailList = document.createElement("div");
    trailList.className = "visitorReplayTrail";
    trailPanel.appendChild(trailTitle);
    trailPanel.appendChild(trailList);

    grid.appendChild(startPanel);
    grid.appendChild(trailPanel);

    card.appendChild(controls);
    card.appendChild(currentBox);
    card.appendChild(grid);
    wrap.appendChild(card);

    const state = {
      matchIndex: 0,
      kyokuIndex: 0,
      stepIndex: 0
    };

    function getCurrentMatch(){
      return normalizedLogs[state.matchIndex] || normalizedLogs[0] || null;
    }

    function syncKyokuOptions(preferLast){
      const match = getCurrentMatch();
      const kyokus = Array.isArray(match && match.kyokus) ? match.kyokus : [];
      kyokuSelect.innerHTML = "";
      kyokus.forEach((kyoku, index)=>{
        const option = document.createElement("option");
        option.value = String(index);
        const label = kyoku && kyoku.label ? kyoku.label : `局${index + 1}`;
        const resultText = kyoku && kyoku.resultText ? kyoku.resultText : "未精算";
        option.textContent = `${label} / ${resultText}`;
        kyokuSelect.appendChild(option);
      });

      if (!kyokus.length){
        state.kyokuIndex = 0;
        kyokuSelect.disabled = true;
        return;
      }

      kyokuSelect.disabled = false;
      if (preferLast){
        state.kyokuIndex = Math.max(0, kyokus.length - 1);
      } else if (state.kyokuIndex >= kyokus.length){
        state.kyokuIndex = Math.max(0, kyokus.length - 1);
      }
      kyokuSelect.value = String(state.kyokuIndex);
    }

    function getCurrentKyoku(){
      const match = getCurrentMatch();
      const kyokus = Array.isArray(match && match.kyokus) ? match.kyokus : [];
      return kyokus[state.kyokuIndex] || null;
    }

    function renderReplay(){
      const kyoku = getCurrentKyoku();
      const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
      const hasRows = rows.length > 0;

      if (!hasRows){
        state.stepIndex = 0;
        stepRange.min = "0";
        stepRange.max = "0";
        stepRange.value = "0";
      } else {
        if (state.stepIndex >= rows.length) state.stepIndex = rows.length - 1;
        if (state.stepIndex < 0) state.stepIndex = 0;
        stepRange.min = "0";
        stepRange.max = String(rows.length - 1);
        stepRange.value = String(state.stepIndex);
      }

      prevBtn.disabled = !hasRows || state.stepIndex <= 0;
      nextBtn.disabled = !hasRows || state.stepIndex >= rows.length - 1;

      const label = kyoku && kyoku.label ? kyoku.label : "局";
      const resultText = kyoku && kyoku.resultText ? kyoku.resultText : "未精算";
      stepMeta.textContent = hasRows
        ? `${label} / ${state.stepIndex + 1}手目 / 全${rows.length}手`
        : `${label} / イベントなし`;

      currentBox.innerHTML = "";
      if (!kyoku){
        const empty = document.createElement("div");
        empty.className = "visitorStatsEmpty";
        empty.textContent = "局データがありません。";
        currentBox.appendChild(empty);
      } else if (!hasRows){
        const title = document.createElement("div");
        title.className = "visitorReplayCurrentTitle";
        title.textContent = `${label} / ${resultText}`;
        const sub = document.createElement("div");
        sub.className = "visitorReplayCurrentSub";
        sub.textContent = "この局には再生できるイベントがありません。";
        currentBox.appendChild(title);
        currentBox.appendChild(sub);
      } else {
        const row = rows[state.stepIndex];
        const title = document.createElement("div");
        title.className = "visitorReplayCurrentTitle";
        title.textContent = row && row.title ? row.title : "イベント";
        const sub = document.createElement("div");
        sub.className = "visitorReplayCurrentSub";
        sub.textContent = `${label} / ${resultText} / ${row && row.seqLabel ? row.seqLabel : "#0"} / ${row && row.sub ? row.sub : "—"}`;
        currentBox.appendChild(title);
        currentBox.appendChild(sub);

        if (row && row.detail){
          const detail = document.createElement("div");
          detail.className = "visitorReplayCurrentText";
          detail.textContent = row.detail;
          currentBox.appendChild(detail);
        }
        if (row && row.extra){
          const extra = document.createElement("div");
          extra.className = "visitorReplayCurrentSub";
          extra.textContent = row.extra;
          currentBox.appendChild(extra);
        }
      }

      startInfoList.innerHTML = "";
      const start = kyoku && kyoku.source && kyoku.source.start && typeof kyoku.source.start === "object"
        ? kyoku.source.start
        : null;
      if (!start){
        startInfoList.appendChild(createReplayInfoRow("開始", "情報なし"));
      } else {
        startInfoList.appendChild(createReplayInfoRow("局", `${start.roundWind || "?"}${Number(start.roundNumber) || 0}局 ${Number(start.honba) || 0}本場`));
        startInfoList.appendChild(createReplayInfoRow("結果", resultText));
        startInfoList.appendChild(createReplayInfoRow("ドラ", tileArrayToReplayText(start.doraIndicators)));
        startInfoList.appendChild(createReplayInfoRow("点数", scoreArrayToReplayText(start.scores)));
        startInfoList.appendChild(createReplayInfoRow("自配牌", tileArrayToReplayText(start.hand13)));
        startInfoList.appendChild(createReplayInfoRow("自ツモ", tileToReplayText(start.drawn)));
        startInfoList.appendChild(createReplayInfoRow("右CPU", tileArrayToReplayText(start.cpuRightHand13)));
        startInfoList.appendChild(createReplayInfoRow("左CPU", tileArrayToReplayText(start.cpuLeftHand13)));
      }

      trailList.innerHTML = "";
      if (!hasRows){
        const empty = document.createElement("div");
        empty.className = "visitorLogEventSub";
        empty.textContent = "表示できるイベントがありません。";
        trailList.appendChild(empty);
      } else {
        const from = Math.max(0, state.stepIndex - 2);
        const to = Math.min(rows.length - 1, state.stepIndex + 2);
        for (let i = from; i <= to; i++){
          const row = rows[i];
          const item = document.createElement("div");
          item.className = `visitorReplayTrailRow${i === state.stepIndex ? " isCurrent" : ""}`;

          const top = document.createElement("div");
          top.className = "visitorReplayTrailTop";

          const title = document.createElement("div");
          title.className = "visitorReplayTrailTitle";
          title.textContent = row && row.title ? row.title : "イベント";

          const seq = document.createElement("div");
          seq.className = "visitorReplayTrailSeq";
          seq.textContent = row && row.seqLabel ? row.seqLabel : "#0";

          top.appendChild(title);
          top.appendChild(seq);
          item.appendChild(top);

          const sub = document.createElement("div");
          sub.className = "visitorReplayTrailSub";
          sub.textContent = row && row.sub ? row.sub : "";
          item.appendChild(sub);

          if (row && row.detail){
            const detail = document.createElement("div");
            detail.className = "visitorReplayTrailText";
            detail.textContent = row.detail;
            item.appendChild(detail);
          }

          trailList.appendChild(item);
        }
      }
    }

    matchSelect.addEventListener("change", ()=>{
      state.matchIndex = Math.max(0, Number(matchSelect.value) || 0);
      syncKyokuOptions(true);
      const kyoku = getCurrentKyoku();
      const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
      state.stepIndex = rows.length ? rows.length - 1 : 0;
      renderReplay();
    });

    kyokuSelect.addEventListener("change", ()=>{
      state.kyokuIndex = Math.max(0, Number(kyokuSelect.value) || 0);
      const kyoku = getCurrentKyoku();
      const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
      state.stepIndex = rows.length ? rows.length - 1 : 0;
      renderReplay();
    });

    stepRange.addEventListener("input", ()=>{
      state.stepIndex = Math.max(0, Number(stepRange.value) || 0);
      renderReplay();
    });

    prevBtn.addEventListener("click", ()=>{
      if (state.stepIndex <= 0) return;
      state.stepIndex -= 1;
      renderReplay();
    });

    nextBtn.addEventListener("click", ()=>{
      const kyoku = getCurrentKyoku();
      const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
      if (state.stepIndex >= rows.length - 1) return;
      state.stepIndex += 1;
      renderReplay();
    });

    matchSelect.value = "0";
    syncKyokuOptions(true);
    const initialKyoku = getCurrentKyoku();
    const initialRows = Array.isArray(initialKyoku && initialKyoku.rows) ? initialKyoku.rows : [];
    state.stepIndex = initialRows.length ? initialRows.length - 1 : 0;
    renderReplay();

    return wrap;
  }

  function renderStatsOverlay(){
    ensureStatsOverlay();
    const root = document.getElementById("visitorStatsRoot");
    const headerTabs = document.getElementById("visitorStatsHeaderTabs");
    const accountBadge = document.getElementById("visitorStatsAccountBadge");
    if (!root) return;
    root.innerHTML = "";
    if (headerTabs) headerTabs.innerHTML = "";
    if (accountBadge) accountBadge.textContent = getCurrentSessionLabel();

    const history = readHistory();
    const storedLogs = getStoredMatchLogsForStats();
    const logMetricsContext = getLogMetricsForStats(storedLogs);
    const logMetricsSummary = logMetricsContext && logMetricsContext.summary ? logMetricsContext.summary : null;

    updateStatsOverlayHeader();

    if (!history.length && !storedLogs.length){
      const empty = document.createElement("div");
      empty.className = "visitorStatsEmpty";
      empty.innerHTML = currentSession.mode === "account"
        ? (isCloudSyncReady()
            ? "まだ成績もログもありません。<br>半荘を終えると、このアカウントに保存されます。"
            : "まだ成績もログもありません。<br>半荘を終えると、このアカウントに保存されます。")
        : "まだ成績もログもありません。<br>局が進むと、この端末に保存されます。";
      root.appendChild(empty);
      return;
    }

    const panels = document.createElement("div");
    panels.className = "visitorStatsPanels";

    const tabButtons = [];
    const panelEls = [];
    const hasLogSummary = !!(logMetricsSummary && Number(logMetricsSummary.kyokuCount) > 0);
    const availableTabKeys = history.length
      ? ["overview", "graphs", "detail", "replay", "logs"]
      : (hasLogSummary ? ["overview", "detail", "replay", "logs"] : ["replay", "logs"]);
    const activeKey = availableTabKeys.includes(activeStatsTabKey) ? activeStatsTabKey : availableTabKeys[0];

    const setActiveTab = (key)=>{
      activeStatsTabKey = key;
      tabButtons.forEach((btn)=>{
        const active = btn.dataset.statsTabKey === key;
        btn.classList.toggle("isActive", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      panelEls.forEach((panel)=>{
        panel.classList.toggle("isActive", panel.dataset.statsPanelKey === key);
      });
    };

    const tabDefs = history.length
      ? [
          { key: "overview", label: "概要" },
          { key: "graphs", label: "グラフ" },
          { key: "detail", label: "詳細" },
          { key: "replay", label: "再生" },
          { key: "logs", label: "ログ" }
        ]
      : (hasLogSummary
          ? [
              { key: "overview", label: "概要" },
              { key: "detail", label: "詳細" },
              { key: "replay", label: "再生" },
              { key: "logs", label: "ログ" }
            ]
          : [
              { key: "replay", label: "再生" },
              { key: "logs", label: "ログ" }
            ]);

    tabDefs.forEach((tab)=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "visitorStatsHeaderTabBtn";
      btn.textContent = tab.label;
      btn.dataset.statsTabKey = tab.key;
      btn.setAttribute("aria-selected", "false");
      btn.addEventListener("click", ()=> setActiveTab(tab.key));
      tabButtons.push(btn);
      if (headerTabs) headerTabs.appendChild(btn);
    });

    if (history.length){
      const metrics = buildStatsMetrics(history);
      const styleScores = buildStyleScores(history, metrics);
      const donut = buildDonutStyle(metrics);

      const overviewPanel = document.createElement("section");
      overviewPanel.className = "visitorStatsTabPanel";
      overviewPanel.dataset.statsPanelKey = "overview";
      overviewPanel.appendChild(buildStatsCards(history.slice(0, 3)));
      overviewPanel.appendChild(buildStatsMetricPanel("サマリー", [
        { label: "対戦数", value: `${history.length}`, hint: "保存中の半荘数" },
        { label: "一位率", value: formatRate(metrics.rankCounts[0], history.length), hint: "半荘順位" },
        { label: "平均順位", value: formatAverageRank(metrics.avgRank), hint: "半荘の平均" },
        { label: "総合スコア", value: formatSignedScoreValue(metrics.totalScoreValue), hint: "チップ込み合計" },
        { label: "総合チップ", value: formatSignedChipText(metrics.totalChipCount), hint: "保存中の合計" },
        { label: "平均最終スコア", value: formatSignedScoreValue(metrics.avgTotalScoreValue), hint: "チップ込み" },
        { label: "平均終了点", value: formatAvgPoint(metrics.avgPoint), hint: "最終持ち点" },
        { label: "平均チップ", value: `${metrics.avgChip > 0 ? "+" : ""}${metrics.avgChip.toFixed(1)}枚`, hint: "半荘ごとの平均" }
      ]));
      if (hasLogSummary){
        overviewPanel.appendChild(buildLogAnalysisMetricPanel(logMetricsSummary));
      }

      const graphsPanel = document.createElement("section");
      graphsPanel.className = "visitorStatsTabPanel";
      graphsPanel.dataset.statsPanelKey = "graphs";
      graphsPanel.appendChild(buildStatsGraphsPanel(history, metrics, styleScores, donut));

      const detailPanel = document.createElement("section");
      detailPanel.className = "visitorStatsTabPanel";
      detailPanel.dataset.statsPanelKey = "detail";
      detailPanel.appendChild(buildStatsMetricPanel(`保存中の${history.length}半荘の成績`, [
        { label: "一位率", value: formatRate(metrics.rankCounts[0], history.length), hint: "半荘順位" },
        { label: "二位率", value: formatRate(metrics.rankCounts[1], history.length), hint: "半荘順位" },
        { label: "三位率", value: formatRate(metrics.rankCounts[2], history.length), hint: "半荘順位" },
        { label: "対戦数", value: `${history.length}`, hint: "保存中の半荘数" },
        { label: "平均順位", value: formatAverageRank(metrics.avgRank), hint: "半荘の平均" },
        { label: "平均終了点", value: formatAvgPoint(metrics.avgPoint), hint: "最終持ち点" },
        { label: "平均最終スコア", value: formatSignedScoreValue(metrics.avgTotalScoreValue), hint: "チップ込み" },
        { label: "平均素点スコア", value: formatSignedScoreValue(metrics.avgScoreValue), hint: "チップ抜き" },
        { label: "アガリ率", value: formatRate(metrics.totalAgari, metrics.totalKyoku), hint: "総局数基準" },
        { label: "リーチ率", value: formatRate(metrics.totalRiichi, metrics.totalKyoku), hint: "総局数基準" },
        { label: "放銃率", value: formatRate(metrics.totalHoju, metrics.totalKyoku), hint: "総局数基準" },
        { label: "副露率", value: formatRate(metrics.totalFuroKyoku, metrics.totalKyoku), hint: "総局数基準" },
        { label: "平均チップ", value: `${metrics.avgChip > 0 ? "+" : ""}${metrics.avgChip.toFixed(1)}枚`, hint: "半荘ごとの平均" }
      ]));
      if (hasLogSummary){
        detailPanel.appendChild(buildCpuAnalysisMetricPanel(logMetricsSummary));
      }

      const replayPanel = document.createElement("section");
      replayPanel.className = "visitorStatsTabPanel";
      replayPanel.dataset.statsPanelKey = "replay";
      replayPanel.appendChild(buildReplayPanel(storedLogs));

      panelEls.push(overviewPanel, graphsPanel, detailPanel, replayPanel);
      panels.appendChild(overviewPanel);
      panels.appendChild(graphsPanel);
      panels.appendChild(detailPanel);
      panels.appendChild(replayPanel);
    } else if (hasLogSummary){
      const overviewPanel = document.createElement("section");
      overviewPanel.className = "visitorStatsTabPanel";
      overviewPanel.dataset.statsPanelKey = "overview";
      overviewPanel.appendChild(buildLogAnalysisMetricPanel(logMetricsSummary));

      const detailPanel = document.createElement("section");
      detailPanel.className = "visitorStatsTabPanel";
      detailPanel.dataset.statsPanelKey = "detail";
      detailPanel.appendChild(buildCpuAnalysisMetricPanel(logMetricsSummary));

      const replayPanel = document.createElement("section");
      replayPanel.className = "visitorStatsTabPanel";
      replayPanel.dataset.statsPanelKey = "replay";
      replayPanel.appendChild(buildReplayPanel(storedLogs));

      panelEls.push(overviewPanel, detailPanel, replayPanel);
      panels.appendChild(overviewPanel);
      panels.appendChild(detailPanel);
      panels.appendChild(replayPanel);
    } else {
      const replayPanel = document.createElement("section");
      replayPanel.className = "visitorStatsTabPanel";
      replayPanel.dataset.statsPanelKey = "replay";
      replayPanel.appendChild(buildReplayPanel(storedLogs));
      panelEls.push(replayPanel);
      panels.appendChild(replayPanel);
    }

    const logsPanel = document.createElement("section");
    logsPanel.className = "visitorStatsTabPanel";
    logsPanel.dataset.statsPanelKey = "logs";
    logsPanel.appendChild(buildLogsPanel(storedLogs));
    panelEls.push(logsPanel);
    panels.appendChild(logsPanel);

    root.appendChild(panels);
    setActiveTab(activeKey);
  }

  function replaceButtonWithClone(btn){
    if (!btn || !btn.parentNode) return btn;
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    return clone;
  }

  function openStatsOverlayWithTab(tabKey){
    activeStatsTabKey = String(tabKey || "overview");
    renderStatsOverlay();
    openVisitorOverlay(ensureStatsOverlay());
  }

  function installTopButtons(){
    const newBtnEl = document.getElementById("newBtn");
    if (newBtnEl) newBtnEl.textContent = "最初から";

    let ruleBtn = document.getElementById("appRuleBtn") || document.getElementById("debugOpenBtn");
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

    let statsBtn = document.getElementById("appStatsBtn") || document.getElementById("settingsBtn");
    statsBtn = replaceButtonWithClone(statsBtn);
    if (statsBtn){
      statsBtn.textContent = "成績";
      statsBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        openStatsOverlayWithTab("overview");
      }, true);
    }

    let logBtn = document.getElementById("appLogBtn");
    logBtn = replaceButtonWithClone(logBtn);
    if (logBtn){
      logBtn.textContent = "ログ";
      logBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        openStatsOverlayWithTab("logs");
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
    updateStatsOverlayHeader();
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
