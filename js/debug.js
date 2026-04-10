// MBsanma/js/debug.js
// ========= debug.js（シナリオデバッグオーバーレイ） =========
// 役割：
// 0. 局設定を指定
// 1. 3人分の手牌13枚を指定（未指定はランダム補完）
// 2. ドラ表示牌1枚を指定（未指定はランダム補完）
// 3. 王牌補充牌8枚を指定（未指定はランダム補完）
// 4. 残り山の先頭9枚を指定（未指定はランダム補完）
// 5. 巡目を指定して、その巡目ぶん各河をランダム生成
// 6. 親のツモ番から開始
//
// 状態変更本体は main.js の startDebugKyokuByScenario() が担当。

(function(){
  const DEBUG_TILE_DEFS = [
    { key: '1m', code: '1m', imgCode: '1m', label: '1m' },
    { key: '9m', code: '9m', imgCode: '9m', label: '9m' },

    { key: '1p', code: '1p', imgCode: '1p', label: '1p' },
    { key: '2p', code: '2p', imgCode: '2p', label: '2p' },
    { key: '3p', code: '3p', imgCode: '3p', label: '3p' },
    { key: '4p', code: '4p', imgCode: '4p', label: '4p' },
    { key: '5p', code: '5p', imgCode: '5p', label: '5p' },
    { key: 'r5p', code: '5p', imgCode: 'r5p', label: '赤5p' },
    { key: '6p', code: '6p', imgCode: '6p', label: '6p' },
    { key: '7p', code: '7p', imgCode: '7p', label: '7p' },
    { key: '8p', code: '8p', imgCode: '8p', label: '8p' },
    { key: '9p', code: '9p', imgCode: '9p', label: '9p' },

    { key: '1s', code: '1s', imgCode: '1s', label: '1s' },
    { key: '2s', code: '2s', imgCode: '2s', label: '2s' },
    { key: '3s', code: '3s', imgCode: '3s', label: '3s' },
    { key: '4s', code: '4s', imgCode: '4s', label: '4s' },
    { key: '5s', code: '5s', imgCode: '5s', label: '5s' },
    { key: 'r5s', code: '5s', imgCode: 'r5s', label: '赤5s' },
    { key: '6s', code: '6s', imgCode: '6s', label: '6s' },
    { key: '7s', code: '7s', imgCode: '7s', label: '7s' },
    { key: '8s', code: '8s', imgCode: '8s', label: '8s' },
    { key: '9s', code: '9s', imgCode: '9s', label: '9s' },

    { key: '1z', code: '1z', imgCode: '1z', label: '東' },
    { key: '2z', code: '2z', imgCode: '2z', label: '南' },
    { key: '3z', code: '3z', imgCode: '3z', label: '西' },
    { key: '4z', code: '4z', imgCode: '4z', label: '北' },
    { key: 'r4z', code: '4z', imgCode: 'r4z', label: '虹北' },
    { key: '5z', code: '5z', imgCode: '5z', label: '白' },
    { key: '6z', code: '6z', imgCode: '6z', label: '發' },
    { key: '7z', code: '7z', imgCode: '7z', label: '中' }
  ];

  const DEBUG_COUNTS = {
    '1m': 4, '9m': 4,
    '1p': 4, '2p': 4, '3p': 4, '4p': 4, '5p': 2, 'r5p': 2, '6p': 4, '7p': 4, '8p': 4, '9p': 4,
    '1s': 4, '2s': 4, '3s': 4, '4s': 4, '5s': 2, 'r5s': 2, '6s': 4, '7s': 4, '8s': 4, '9s': 4,
    '1z': 4, '2z': 4, '3z': 4, '4z': 3, 'r4z': 1, '5z': 4, '6z': 4, '7z': 4
  };

  const DEBUG_HAND_MAX = 13;
  const DEBUG_DORA_MAX = 1;
  const DEBUG_DEAD_DRAW_MAX = 8;
  const DEBUG_WALL_TOP_MAX = 9;
  const DEBUG_MAX_JUNME_DEFAULT = 13;
  const DEBUG_PRESET_STORAGE_KEY = 'mbsanma_debug_scenario_v7';

  const state = {
    kyokuLabel: '東1',
    dealer: 0,
    honba: 0,
    junme: 0,
    cpuRiichiOnly: false,
    activeTarget: 'me',
    selected: {
      me: [],
      right: [],
      left: [],
      dora: [],
      deadDraw: [],
      wallTop: []
    }
  };

  let debugOpenBtn = null;
  let debugOverlay = null;
  let debugPanel = null;
  let debugSlotsWrap = null;
  let debugTileGrid = null;
  let targetTabsWrap = null;
  let actionRow = null;
  let kyokuSelect = null;
  let dealerSelect = null;
  let honbaInput = null;
  let junmeSelect = null;
  let cpuRiichiOnlyCheckbox = null;
  let debugUndoBtn = null;
  let debugClearBtn = null;
  let debugReuseBtn = null;
  let debugStartBtn = null;
  let isStartingDebugScenario = false;

  function getDebugSafeMaxJunme(){
    try{
      if (typeof window !== 'undefined' && typeof window.getDebugScenarioSafeMaxJunme === 'function'){
        const value = Number(window.getDebugScenarioSafeMaxJunme());
        if (Number.isFinite(value)) return Math.max(0, Math.floor(value));
      }
    }catch(e){}
    return DEBUG_MAX_JUNME_DEFAULT;
  }

  function cloneDebugCountsAvailability(){
    return { ...DEBUG_COUNTS };
  }

  function sanitizeSelectedListWithAvailability(list, max, availability){
    const src = Array.isArray(list) ? list : [];
    const out = [];
    for (const imgCode of src){
      if (out.length >= max) break;
      if (!Object.prototype.hasOwnProperty.call(availability, imgCode)) continue;
      if ((availability[imgCode] | 0) <= 0) continue;
      availability[imgCode] -= 1;
      out.push(imgCode);
    }
    return out;
  }

  function sanitizeSelectedState(selectedLike){
    const availability = cloneDebugCountsAvailability();
    const src = (selectedLike && typeof selectedLike === 'object') ? selectedLike : {};
    return {
      me: sanitizeSelectedListWithAvailability(src.me, DEBUG_HAND_MAX, availability),
      right: sanitizeSelectedListWithAvailability(src.right, DEBUG_HAND_MAX, availability),
      left: sanitizeSelectedListWithAvailability(src.left, DEBUG_HAND_MAX, availability),
      dora: sanitizeSelectedListWithAvailability(src.dora, DEBUG_DORA_MAX, availability),
      deadDraw: sanitizeSelectedListWithAvailability(src.deadDraw, DEBUG_DEAD_DRAW_MAX, availability),
      wallTop: sanitizeSelectedListWithAvailability(src.wallTop, DEBUG_WALL_TOP_MAX, availability)
    };
  }

  function applySanitizedSelectedState(selectedLike){
    const sanitized = sanitizeSelectedState(selectedLike);
    state.selected.me = sanitized.me.slice();
    state.selected.right = sanitized.right.slice();
    state.selected.left = sanitized.left.slice();
    state.selected.dora = sanitized.dora.slice();
    state.selected.deadDraw = sanitized.deadDraw.slice();
    state.selected.wallTop = sanitized.wallTop.slice();
  }

  function rebuildJunmeOptions(){
    if (!junmeSelect) return;
    const safeMax = getDebugSafeMaxJunme();
    const currentValue = Math.max(0, Math.min(safeMax, Number(junmeSelect.value) || Number(state.junme) || 0));
    junmeSelect.innerHTML = '';
    for (let i = 0; i <= safeMax; i++){
      const op = document.createElement('option');
      op.value = String(i);
      op.textContent = `${i}巡目`;
      junmeSelect.appendChild(op);
    }
    junmeSelect.value = String(currentValue);
    state.junme = currentValue;
  }

  function syncJunmeToSafeMax(){
    const safeMax = getDebugSafeMaxJunme();
    state.junme = Math.max(0, Math.min(safeMax, Number(state.junme) || 0));
    rebuildJunmeOptions();
    if (junmeSelect) junmeSelect.value = String(state.junme);
  }

  function isCompactLandscapePhone(){
    try{
      return window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
    }catch(e){
      return false;
    }
  }

  function makeTileImage(imgCode, alt){
    const img = document.createElement('img');
    img.src = `img/${imgCode}.png`;
    img.alt = alt || imgCode;
    img.draggable = false;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.onerror = ()=>{
      const span = document.createElement('span');
      span.textContent = alt || imgCode;
      span.style.fontSize = '12px';
      span.style.color = '#fff';
      span.style.fontWeight = '700';
      img.replaceWith(span);
    };
    return img;
  }

  function getDefByImgCode(imgCode){
    return DEBUG_TILE_DEFS.find((v)=> v.imgCode === imgCode) || null;
  }

  function getTargetMax(target){
    if (target === 'dora') return DEBUG_DORA_MAX;
    if (target === 'deadDraw') return DEBUG_DEAD_DRAW_MAX;
    if (target === 'wallTop') return DEBUG_WALL_TOP_MAX;
    return DEBUG_HAND_MAX;
  }

  function getTargetLabel(target){
    if (target === 'me') return 'あなた';
    if (target === 'right') return '右CPU';
    if (target === 'left') return '左CPU';
    if (target === 'dora') return 'ドラ';
    if (target === 'deadDraw') return '王牌補充牌';
    if (target === 'wallTop') return '次ツモ9枚';
    return target;
  }

  function getActiveList(){
    if (state.activeTarget === 'me') return state.selected.me;
    if (state.activeTarget === 'right') return state.selected.right;
    if (state.activeTarget === 'left') return state.selected.left;
    if (state.activeTarget === 'dora') return state.selected.dora;
    if (state.activeTarget === 'deadDraw') return state.selected.deadDraw;
    if (state.activeTarget === 'wallTop') return state.selected.wallTop;
    return state.selected.me;
  }

  function getAllSelectedImgCodes(){
    return [
      ...state.selected.me,
      ...state.selected.right,
      ...state.selected.left,
      ...state.selected.dora,
      ...state.selected.deadDraw,
      ...state.selected.wallTop
    ];
  }

  function getSelectedCountByImgCode(imgCode){
    let n = 0;
    for (const v of getAllSelectedImgCodes()){
      if (v === imgCode) n++;
    }
    return n;
  }

  function canAddImgCode(imgCode){
    const max = DEBUG_COUNTS[imgCode] || 0;
    return getSelectedCountByImgCode(imgCode) < max;
  }

  function syncFormToState(){
    state.kyokuLabel = kyokuSelect ? kyokuSelect.value : '東1';
    state.dealer = dealerSelect ? Number(dealerSelect.value) || 0 : 0;
    state.honba = honbaInput ? Math.max(0, Number(honbaInput.value) || 0) : 0;
    state.junme = junmeSelect ? Math.max(0, Math.min(getDebugSafeMaxJunme(), Number(junmeSelect.value) || 0)) : 0;
    state.cpuRiichiOnly = !!(cpuRiichiOnlyCheckbox && cpuRiichiOnlyCheckbox.checked);
  }

  function saveLastPreset(){
    try{
      localStorage.setItem(DEBUG_PRESET_STORAGE_KEY, JSON.stringify({
        v: 7,
        kyokuLabel: state.kyokuLabel,
        dealer: state.dealer,
        honba: state.honba,
        junme: state.junme,
        cpuRiichiOnly: !!state.cpuRiichiOnly,
        selected: {
          me: state.selected.me.slice(),
          right: state.selected.right.slice(),
          left: state.selected.left.slice(),
          dora: state.selected.dora.slice(),
          deadDraw: state.selected.deadDraw.slice(),
          wallTop: state.selected.wallTop.slice()
        }
      }));
    }catch(e){}
  }

  function loadLastPreset(){
    try{
      const raw = localStorage.getItem(DEBUG_PRESET_STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || obj.v !== 7) return null;
      return {
        kyokuLabel: String(obj.kyokuLabel || '東1'),
        dealer: (obj.dealer === 1 || obj.dealer === 2) ? obj.dealer : 0,
        honba: Math.max(0, Number(obj.honba) || 0),
        junme: Math.max(0, Math.min(getDebugSafeMaxJunme(), Number(obj.junme) || 0)),
        cpuRiichiOnly: !!obj.cpuRiichiOnly,
        selected: {
          me: Array.isArray(obj.selected && obj.selected.me) ? obj.selected.me.slice(0, DEBUG_HAND_MAX) : [],
          right: Array.isArray(obj.selected && obj.selected.right) ? obj.selected.right.slice(0, DEBUG_HAND_MAX) : [],
          left: Array.isArray(obj.selected && obj.selected.left) ? obj.selected.left.slice(0, DEBUG_HAND_MAX) : [],
          dora: Array.isArray(obj.selected && obj.selected.dora) ? obj.selected.dora.slice(0, DEBUG_DORA_MAX) : [],
          deadDraw: Array.isArray(obj.selected && obj.selected.deadDraw) ? obj.selected.deadDraw.slice(0, DEBUG_DEAD_DRAW_MAX) : [],
          wallTop: Array.isArray(obj.selected && obj.selected.wallTop) ? obj.selected.wallTop.slice(0, DEBUG_WALL_TOP_MAX) : []
        }
      };
    }catch(e){
      return null;
    }
  }

  function applyPreset(obj){
    if (!obj) return;
    state.kyokuLabel = obj.kyokuLabel;
    state.dealer = obj.dealer;
    state.honba = obj.honba;
    state.junme = Math.max(0, Math.min(getDebugSafeMaxJunme(), Number(obj.junme) || 0));
    state.cpuRiichiOnly = !!obj.cpuRiichiOnly;
    applySanitizedSelectedState(obj.selected);

    if (kyokuSelect) kyokuSelect.value = state.kyokuLabel;
    if (dealerSelect) dealerSelect.value = String(state.dealer);
    if (honbaInput) honbaInput.value = String(state.honba);
    if (junmeSelect) junmeSelect.value = String(state.junme);
    if (cpuRiichiOnlyCheckbox) cpuRiichiOnlyCheckbox.checked = !!state.cpuRiichiOnly;

    renderDebugOverlay();
  }

  function addTileToActive(imgCode){
    const list = getActiveList();
    const max = getTargetMax(state.activeTarget);
    if (!list || list.length >= max) return;
    if (!canAddImgCode(imgCode)) return;
    list.push(imgCode);
    renderDebugOverlay();
  }

  function removeLastTile(){
    const list = getActiveList();
    if (!list || list.length <= 0) return;
    list.pop();
    renderDebugOverlay();
  }

  function removeTileAt(index){
    const list = getActiveList();
    if (!list || index < 0 || index >= list.length) return;
    list.splice(index, 1);
    renderDebugOverlay();
  }

  function clearActiveTiles(){
    const list = getActiveList();
    if (!list) return;
    list.length = 0;
    renderDebugOverlay();
  }

  function applyDebugResponsiveStyles(){
    if (!debugOverlay || !debugPanel) return;
    const compact = isCompactLandscapePhone();
    debugOverlay.style.padding = compact ? '8px' : '18px';
    debugPanel.style.width = compact ? 'min(96vw, 100%)' : 'min(1180px, 100%)';
    debugPanel.style.maxHeight = compact ? 'calc(100vh - 16px)' : 'calc(100vh - 36px)';
    debugPanel.style.padding = compact ? '10px' : '18px';
    debugPanel.style.borderRadius = compact ? '14px' : '18px';
    if (actionRow){
      actionRow.style.display = compact ? 'grid' : 'flex';
      actionRow.style.gridTemplateColumns = compact ? 'repeat(4, minmax(0, 1fr))' : '';
      actionRow.style.gap = compact ? '6px' : '8px';
    }
    if (debugTileGrid){
      debugTileGrid.style.gridTemplateColumns = compact ? 'repeat(auto-fit, minmax(48px, 48px))' : 'repeat(auto-fit, minmax(64px, 64px))';
      debugTileGrid.style.gap = compact ? '6px' : '8px';
    }
  }

  function renderTargetTabs(){
    if (!targetTabsWrap) return;
    targetTabsWrap.innerHTML = '';
    const compact = isCompactLandscapePhone();
    for (const target of ['me', 'right', 'left', 'dora', 'deadDraw', 'wallTop']){
      const btn = document.createElement('button');
      btn.type = 'button';
      const max = getTargetMax(target);
      const count = (state.selected[target] || []).length;
      btn.textContent = `${getTargetLabel(target)} ${count}/${max}`;
      btn.style.minHeight = compact ? '34px' : '40px';
      btn.style.padding = compact ? '0 10px' : '0 14px';
      btn.style.borderRadius = '10px';
      btn.style.border = target === state.activeTarget ? '1px solid rgba(255,210,110,0.9)' : '1px solid rgba(255,255,255,0.16)';
      btn.style.background = target === state.activeTarget ? 'rgba(255,190,70,0.18)' : 'rgba(255,255,255,0.06)';
      btn.style.color = '#fff';
      btn.style.fontSize = compact ? '11px' : '14px';
      btn.style.fontWeight = '800';
      btn.style.cursor = 'pointer';
      btn.style.whiteSpace = 'nowrap';
      btn.addEventListener('click', ()=>{
        state.activeTarget = target;
        renderDebugOverlay();
      });
      targetTabsWrap.appendChild(btn);
    }
  }

  function renderDebugSlots(){
    if (!debugSlotsWrap) return;
    debugSlotsWrap.innerHTML = '';
    const compact = isCompactLandscapePhone();
    const slotW = compact ? 40 : 52;
    const slotH = compact ? 58 : 74;
    const list = getActiveList();
    const max = getTargetMax(state.activeTarget);
    debugSlotsWrap.style.gridTemplateColumns = `repeat(${max}, minmax(0, ${slotW}px))`;

    for (let i = 0; i < max; i++){
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.style.width = `${slotW}px`;
      slot.style.height = `${slotH}px`;
      slot.style.borderRadius = '8px';
      slot.style.border = '1px solid rgba(255,255,255,0.16)';
      slot.style.background = (i < list.length) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
      slot.style.display = 'flex';
      slot.style.alignItems = 'center';
      slot.style.justifyContent = 'center';
      slot.style.cursor = (i < list.length) ? 'pointer' : 'default';
      slot.style.padding = '0';

      if (i < list.length){
        const def = getDefByImgCode(list[i]);
        slot.appendChild(makeTileImage(list[i], def ? def.label : list[i]));
        slot.title = 'クリックで削除';
        slot.addEventListener('click', ()=> removeTileAt(i));
      } else {
        const label = document.createElement('span');
        if (state.activeTarget === 'dora') label.textContent = 'ドラ';
        else if (state.activeTarget === 'deadDraw') label.textContent = `補${i + 1}`;
        else if (state.activeTarget === 'wallTop') label.textContent = `ツ${i + 1}`;
        else label.textContent = `${i + 1}`;
        label.style.fontSize = compact ? '10px' : '12px';
        label.style.color = 'rgba(255,255,255,0.28)';
        label.style.fontWeight = '700';
        slot.appendChild(label);
        slot.disabled = true;
      }
      debugSlotsWrap.appendChild(slot);
    }
  }

  function renderTileButtons(){
    if (!debugTileGrid) return;
    debugTileGrid.innerHTML = '';
    const compact = isCompactLandscapePhone();
    const btnW = compact ? 48 : 64;
    const btnH = compact ? 78 : 104;
    const imgW = compact ? 26 : 34;
    const imgH = compact ? 38 : 50;
    const activeList = getActiveList();
    const activeMax = getTargetMax(state.activeTarget);

    for (const def of DEBUG_TILE_DEFS){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.width = `${btnW}px`;
      btn.style.minHeight = `${btnH}px`;
      btn.style.borderRadius = '10px';
      btn.style.border = '1px solid rgba(255,255,255,0.16)';
      btn.style.background = 'rgba(255,255,255,0.05)';
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.gap = compact ? '2px' : '4px';
      btn.style.padding = compact ? '4px 2px' : '6px 4px';
      btn.style.boxSizing = 'border-box';

      const available = canAddImgCode(def.imgCode) && activeList.length < activeMax;
      btn.style.cursor = available ? 'pointer' : 'not-allowed';
      btn.disabled = !available;
      btn.title = `${def.label} を追加`;

      const imgWrap = document.createElement('div');
      imgWrap.style.width = `${imgW}px`;
      imgWrap.style.height = `${imgH}px`;
      imgWrap.style.display = 'flex';
      imgWrap.style.alignItems = 'center';
      imgWrap.style.justifyContent = 'center';
      imgWrap.appendChild(makeTileImage(def.imgCode, def.label));

      const name = document.createElement('div');
      name.textContent = def.label;
      name.style.fontSize = compact ? '9px' : '11px';
      name.style.fontWeight = '700';
      name.style.color = btn.disabled ? 'rgba(255,255,255,0.35)' : '#fff';
      name.style.lineHeight = '1.1';
      name.style.textAlign = 'center';

      const remain = document.createElement('div');
      const left = (DEBUG_COUNTS[def.imgCode] || 0) - getSelectedCountByImgCode(def.imgCode);
      remain.textContent = `残り ${left}`;
      remain.style.fontSize = compact ? '8px' : '10px';
      remain.style.color = btn.disabled ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.72)';

      btn.appendChild(imgWrap);
      btn.appendChild(name);
      btn.appendChild(remain);
      btn.addEventListener('click', ()=> addTileToActive(def.imgCode));
      debugTileGrid.appendChild(btn);
    }
  }

  function renderActionButtons(){
    const compact = isCompactLandscapePhone();
    const list = getActiveList();
    const buttons = [debugUndoBtn, debugClearBtn, debugReuseBtn, debugStartBtn];

    buttons.forEach((btn)=>{
      if (!btn) return;
      btn.style.minHeight = compact ? '34px' : '40px';
      btn.style.padding = compact ? '0 8px' : '0 14px';
      btn.style.fontSize = compact ? '11px' : '14px';
      btn.style.borderRadius = compact ? '9px' : '10px';
      btn.style.whiteSpace = compact ? 'nowrap' : 'normal';
    });

    if (debugUndoBtn) debugUndoBtn.disabled = !list || list.length <= 0;
    if (debugClearBtn) debugClearBtn.disabled = !list || list.length <= 0;
    if (debugReuseBtn) debugReuseBtn.disabled = isStartingDebugScenario || !loadLastPreset();
    if (debugStartBtn){
      debugStartBtn.disabled = !!isStartingDebugScenario;
      debugStartBtn.textContent = compact ? '開始' : 'この内容で開始（未指定はランダム）';
    }
  }

  function renderDebugOverlay(){
    applyDebugResponsiveStyles();
    renderTargetTabs();
    renderDebugSlots();
    renderTileButtons();
    renderActionButtons();
  }

  function openDebugOverlay(){
    if (!debugOverlay) return;
    syncJunmeToSafeMax();
    if (kyokuSelect) kyokuSelect.value = state.kyokuLabel;
    if (dealerSelect) dealerSelect.value = String(state.dealer);
    if (honbaInput) honbaInput.value = String(state.honba);
    if (junmeSelect) junmeSelect.value = String(state.junme);
    if (cpuRiichiOnlyCheckbox) cpuRiichiOnlyCheckbox.checked = !!state.cpuRiichiOnly;
    debugOverlay.style.display = 'flex';
    renderDebugOverlay();
  }

  function closeDebugOverlay(){
    if (!debugOverlay) return;
    debugOverlay.style.display = 'none';
  }

  function startDebugScenario(){
    if (isStartingDebugScenario) return;

    syncFormToState();
    syncJunmeToSafeMax();
    applySanitizedSelectedState(state.selected);

    if (typeof startDebugKyokuByScenario !== 'function') return;

    isStartingDebugScenario = true;
    renderActionButtons();

    try{
      const ok = startDebugKyokuByScenario({
        kyokuLabel: state.kyokuLabel,
        dealer: state.dealer,
        honba: state.honba,
        junme: state.junme,
        cpuRiichiOnly: !!state.cpuRiichiOnly,
        selected: {
          me: state.selected.me.slice(),
          right: state.selected.right.slice(),
          left: state.selected.left.slice(),
          dora: state.selected.dora.slice(0, DEBUG_DORA_MAX),
          deadDraw: state.selected.deadDraw.slice(0, DEBUG_DEAD_DRAW_MAX),
          wallTop: state.selected.wallTop.slice(0, DEBUG_WALL_TOP_MAX)
        }
      });
      if (!ok) return;

      saveLastPreset();
      closeDebugOverlay();
    } finally {
      isStartingDebugScenario = false;
      renderActionButtons();
    }
  }

  function makeActionButton(label){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.minHeight = '40px';
    btn.style.padding = '0 14px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(255,255,255,0.16)';
    btn.style.background = 'rgba(255,255,255,0.08)';
    btn.style.color = '#fff';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    btn.addEventListener('mouseenter', ()=>{ if (!btn.disabled) btn.style.background = 'rgba(255,255,255,0.14)'; });
    btn.addEventListener('mouseleave', ()=>{ btn.style.background = 'rgba(255,255,255,0.08)'; });
    return btn;
  }

  function makeField(labelText, inputEl){
    const wrap = document.createElement('label');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = isCompactLandscapePhone() ? '4px' : '6px';
    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.fontSize = isCompactLandscapePhone() ? '11px' : '13px';
    label.style.fontWeight = '700';
    label.style.color = 'rgba(255,255,255,0.82)';
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function styleInput(el){
    el.style.minHeight = isCompactLandscapePhone() ? '34px' : '40px';
    el.style.borderRadius = '10px';
    el.style.border = '1px solid rgba(255,255,255,0.16)';
    el.style.background = 'rgba(255,255,255,0.06)';
    el.style.color = '#fff';
    el.style.padding = '0 10px';
    el.style.fontSize = isCompactLandscapePhone() ? '12px' : '14px';
    el.style.boxSizing = 'border-box';
    return el;
  }

  function buildDebugOverlay(){
    debugOverlay = document.createElement('div');
    debugOverlay.id = 'debugPresetOverlay';
    debugOverlay.style.position = 'fixed';
    debugOverlay.style.inset = '0';
    debugOverlay.style.zIndex = '16000';
    debugOverlay.style.display = 'none';
    debugOverlay.style.alignItems = 'center';
    debugOverlay.style.justifyContent = 'center';
    debugOverlay.style.background = 'rgba(0,0,0,0.72)';
    debugOverlay.style.padding = '18px';
    debugOverlay.style.boxSizing = 'border-box';
    debugOverlay.addEventListener('click', closeDebugOverlay);

    debugPanel = document.createElement('div');
    debugPanel.style.width = 'min(1180px, 100%)';
    debugPanel.style.maxHeight = 'calc(100vh - 36px)';
    debugPanel.style.overflow = 'auto';
    debugPanel.style.background = 'linear-gradient(180deg, rgba(20,24,32,0.98), rgba(10,14,20,0.98))';
    debugPanel.style.border = '1px solid rgba(255,255,255,0.16)';
    debugPanel.style.borderRadius = '18px';
    debugPanel.style.boxShadow = '0 24px 80px rgba(0,0,0,0.45)';
    debugPanel.style.padding = '18px';
    debugPanel.style.boxSizing = 'border-box';
    debugPanel.addEventListener('click', (ev)=>{ if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation(); });

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '12px';
    header.style.marginBottom = '14px';

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = 'デバッグシナリオ';
    title.style.fontSize = '24px';
    title.style.fontWeight = '900';
    title.style.color = '#fff';
    title.style.lineHeight = '1.2';

    const sub = document.createElement('div');
    sub.textContent = '未指定の手牌・ドラ・王牌補充牌・次ツモ9枚はランダム補完。巡目ぶんの河もランダム生成して、親のツモ番から開始。';
    sub.style.marginTop = '6px';
    sub.style.fontSize = '13px';
    sub.style.color = 'rgba(255,255,255,0.75)';

    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    const closeBtn = makeActionButton('閉じる');
    closeBtn.addEventListener('click', closeDebugOverlay);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const settingsRow = document.createElement('div');
    settingsRow.style.display = 'grid';
    settingsRow.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))';
    settingsRow.style.gap = '10px';
    settingsRow.style.marginBottom = '14px';

    kyokuSelect = styleInput(document.createElement('select'));
    ['東1','東2','東3','南1','南2','南3'].forEach((v)=>{
      const op = document.createElement('option');
      op.value = v;
      op.textContent = v;
      kyokuSelect.appendChild(op);
    });

    dealerSelect = styleInput(document.createElement('select'));
    [
      { value: '0', label: 'あなた親' },
      { value: '1', label: '右CPU親' },
      { value: '2', label: '左CPU親' }
    ].forEach((v)=>{
      const op = document.createElement('option');
      op.value = v.value;
      op.textContent = v.label;
      dealerSelect.appendChild(op);
    });

    honbaInput = styleInput(document.createElement('input'));
    honbaInput.type = 'number';
    honbaInput.min = '0';
    honbaInput.step = '1';

    junmeSelect = styleInput(document.createElement('select'));
    rebuildJunmeOptions();

    settingsRow.appendChild(makeField('局', kyokuSelect));
    settingsRow.appendChild(makeField('親', dealerSelect));
    settingsRow.appendChild(makeField('本場', honbaInput));
    settingsRow.appendChild(makeField('巡目', junmeSelect));

    const optionRow = document.createElement('label');
    optionRow.style.display = 'inline-flex';
    optionRow.style.alignItems = 'center';
    optionRow.style.gap = '10px';
    optionRow.style.marginBottom = '14px';
    optionRow.style.color = '#fff';
    optionRow.style.fontSize = '14px';
    optionRow.style.fontWeight = '700';

    cpuRiichiOnlyCheckbox = document.createElement('input');
    cpuRiichiOnlyCheckbox.type = 'checkbox';
    optionRow.appendChild(cpuRiichiOnlyCheckbox);
    optionRow.appendChild(document.createTextNode('デバッグ用：CPUはリーチするがツモ・ロンしない'));

    targetTabsWrap = document.createElement('div');
    targetTabsWrap.style.display = 'flex';
    targetTabsWrap.style.flexWrap = 'wrap';
    targetTabsWrap.style.gap = '8px';
    targetTabsWrap.style.marginBottom = '12px';

    debugSlotsWrap = document.createElement('div');
    debugSlotsWrap.style.display = 'grid';
    debugSlotsWrap.style.gap = '6px';
    debugSlotsWrap.style.marginBottom = '14px';
    debugSlotsWrap.style.alignItems = 'center';

    actionRow = document.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.flexWrap = 'wrap';
    actionRow.style.gap = '8px';
    actionRow.style.marginBottom = '14px';

    debugUndoBtn = makeActionButton('1枚戻す');
    debugUndoBtn.addEventListener('click', removeLastTile);

    debugClearBtn = makeActionButton('この列を消す');
    debugClearBtn.addEventListener('click', clearActiveTiles);

    debugReuseBtn = makeActionButton('前回を再利用');
    debugReuseBtn.addEventListener('click', ()=>{
      const preset = loadLastPreset();
      if (preset) applyPreset(preset);
    });

    debugStartBtn = makeActionButton('この内容で開始（未指定はランダム）');
    debugStartBtn.addEventListener('click', startDebugScenario);

    actionRow.appendChild(debugUndoBtn);
    actionRow.appendChild(debugClearBtn);
    actionRow.appendChild(debugReuseBtn);
    actionRow.appendChild(debugStartBtn);

    debugTileGrid = document.createElement('div');
    debugTileGrid.style.display = 'grid';
    debugTileGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(64px, 64px))';
    debugTileGrid.style.gap = '8px';
    debugTileGrid.style.justifyContent = 'flex-start';

    debugPanel.appendChild(header);
    debugPanel.appendChild(settingsRow);
    debugPanel.appendChild(optionRow);
    debugPanel.appendChild(targetTabsWrap);
    debugPanel.appendChild(debugSlotsWrap);
    debugPanel.appendChild(actionRow);
    debugPanel.appendChild(debugTileGrid);
    debugOverlay.appendChild(debugPanel);
    document.body.appendChild(debugOverlay);
  }

  function bindDebugButton(){
    debugOpenBtn = document.getElementById('debugOpenBtn');
    if (!debugOpenBtn || debugOpenBtn.__debugOverlayBound) return;
    debugOpenBtn.__debugOverlayBound = true;
    debugOpenBtn.addEventListener('click', openDebugOverlay);
  }

  function installGlobalEvents(){
    window.addEventListener('resize', ()=>{
      if (debugOverlay && debugOverlay.style.display === 'flex') renderDebugOverlay();
    });

    document.addEventListener('keydown', (ev)=>{
      if (!debugOverlay || debugOverlay.style.display !== 'flex') return;
      if (ev.key === 'Escape') closeDebugOverlay();
    });
  }

  function boot(){
    buildDebugOverlay();
    bindDebugButton();
    installGlobalEvents();
    honbaInput.value = '0';
    syncJunmeToSafeMax();
    const preset = loadLastPreset();
    if (preset) applyPreset(preset);

    try{
      window.openDebugOverlay = openDebugOverlay;
      window.closeDebugOverlay = closeDebugOverlay;
      window.renderDebugOverlay = renderDebugOverlay;
    }catch(e){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
