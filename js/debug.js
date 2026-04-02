// MBsanma/js/debug_red_patch.js
// ========= debug_red_patch.js（デバッグモード赤5二枚対応パッチ） =========
// 役割：
// - 既存 debug.js の在庫表示だけ旧仕様（赤5p/赤5s 各1枚）になっているため、
//   DOM 上で赤5ボタンの残数/活性状態を補正する
// - 実際の局生成は main.js + core.js の makeWall() が担当し、赤5は各2枚ある前提
//
// 注意：
// - render.js は触らない
// - ゲーム進行状態は触らない
// - デバッグオーバーレイ DOM だけを補正する

(function(){
  const RED_LIMITS = {
    r5p: 2,
    r5s: 2
  };

  let patchScheduled = false;

  function isDebugOverlayOpen(){
    const overlay = document.getElementById('debugPresetOverlay');
    return !!(overlay && overlay.style.display === 'flex');
  }

  function getDebugOverlay(){
    return document.getElementById('debugPresetOverlay');
  }

  function getDebugPanel(){
    const overlay = getDebugOverlay();
    if (!overlay) return null;
    return overlay.firstElementChild || null;
  }

  function getDebugTargetButtons(){
    const panel = getDebugPanel();
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('button')).filter((btn)=>{
      const text = String(btn.textContent || '').trim();
      return /\d+\s*\/\s*\d+/.test(text);
    });
  }

  function getActiveTargetButton(){
    const buttons = getDebugTargetButtons();
    for (const btn of buttons){
      const borderColor = getComputedStyle(btn).borderColor || '';
      if (borderColor.includes('255, 210, 110')) return btn;
    }
    return buttons[0] || null;
  }

  function getDebugSlotsWrap(){
    const panel = getDebugPanel();
    if (!panel) return null;

    const all = Array.from(panel.querySelectorAll('div')).filter((el)=>{
      const style = getComputedStyle(el);
      return style.display === 'grid';
    });

    for (const el of all){
      const hasTileSlotButton = Array.from(el.children).some((child)=> child.tagName === 'BUTTON');
      if (!hasTileSlotButton) continue;

      const firstButton = Array.from(el.children).find((child)=> child.tagName === 'BUTTON');
      if (!firstButton) continue;

      const style = getComputedStyle(firstButton);
      if (style.width === '52px' || style.width === '40px') return el;
    }

    return null;
  }

  function getTileGrid(){
    const panel = getDebugPanel();
    if (!panel) return null;

    const all = Array.from(panel.querySelectorAll('div')).filter((el)=>{
      const style = getComputedStyle(el);
      return style.display === 'grid';
    });

    for (const el of all){
      const buttons = Array.from(el.children).filter((child)=> child.tagName === 'BUTTON');
      if (buttons.length <= 0) continue;
      const style = getComputedStyle(buttons[0]);
      if (style.width === '64px' || style.width === '48px') return el;
    }

    return null;
  }

  function getVisibleSelectedImgCodes(){
    const wrap = getDebugSlotsWrap();
    if (!wrap) return [];

    const out = [];
    const buttons = Array.from(wrap.querySelectorAll('button[title="クリックで削除"]'));
    for (const btn of buttons){
      const img = btn.querySelector('img');
      if (!img) continue;
      const src = String(img.getAttribute('src') || '');
      if (src.endsWith('/r5p.png') || src === 'img/r5p.png') out.push('r5p');
      else if (src.endsWith('/r5s.png') || src === 'img/r5s.png') out.push('r5s');
      else if (src.endsWith('/r4z.png') || src === 'img/r4z.png') out.push('r4z');
    }
    return out;
  }

  function countAllSelectedRedTiles(){
    const targetButtons = getDebugTargetButtons();
    if (targetButtons.length <= 0) return { r5p: 0, r5s: 0 };

    const activeBtn = getActiveTargetButton();
    const counts = { r5p: 0, r5s: 0 };

    for (const btn of targetButtons){
      btn.click();
      const codes = getVisibleSelectedImgCodes();
      for (const code of codes){
        if (code === 'r5p') counts.r5p++;
        if (code === 'r5s') counts.r5s++;
      }
    }

    if (activeBtn) activeBtn.click();
    return counts;
  }

  function getActiveListInfo(){
    const activeBtn = getActiveTargetButton();
    if (!activeBtn) return { count: 0, max: 0 };

    const text = String(activeBtn.textContent || '');
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return { count: 0, max: 0 };

    return {
      count: Number(match[1]) || 0,
      max: Number(match[2]) || 0
    };
  }

  function getTileButtonByTitle(title){
    const grid = getTileGrid();
    if (!grid) return null;
    return Array.from(grid.querySelectorAll('button')).find((btn)=> String(btn.title || '') === title) || null;
  }

  function patchOneRedButton(imgCode, title){
    const btn = getTileButtonByTitle(title);
    if (!btn) return;

    const totalCounts = countAllSelectedRedTiles();
    const currentTotal = totalCounts[imgCode] || 0;
    const limit = RED_LIMITS[imgCode] || 0;
    const left = Math.max(0, limit - currentTotal);
    const activeInfo = getActiveListInfo();
    const canUseSlot = activeInfo.max > 0 && activeInfo.count < activeInfo.max;
    const available = left > 0 && canUseSlot;

    btn.disabled = !available;
    btn.style.cursor = available ? 'pointer' : 'not-allowed';
    btn.style.opacity = available ? '1' : '0.72';

    const textBlocks = btn.querySelectorAll('div');
    const remainEl = textBlocks[textBlocks.length - 1] || null;
    if (remainEl){
      remainEl.textContent = `残り ${left}`;
      remainEl.style.color = available ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.28)';
    }

    const nameEl = textBlocks[textBlocks.length - 2] || null;
    if (nameEl){
      nameEl.style.color = available ? '#fff' : 'rgba(255,255,255,0.35)';
    }
  }

  function applyDebugRedPatch(){
    patchScheduled = false;
    if (!isDebugOverlayOpen()) return;

    patchOneRedButton('r5p', '赤5p を追加');
    patchOneRedButton('r5s', '赤5s を追加');
  }

  function schedulePatch(){
    if (patchScheduled) return;
    patchScheduled = true;
    requestAnimationFrame(()=>{
      requestAnimationFrame(applyDebugRedPatch);
    });
  }

  function installObservers(){
    const root = document.documentElement;
    if (!root || root.__debugRedPatchObserverInstalled) return;
    root.__debugRedPatchObserverInstalled = true;

    const observer = new MutationObserver(()=>{
      if (!isDebugOverlayOpen()) return;
      schedulePatch();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'disabled', 'title']
    });

    document.addEventListener('click', ()=>{
      if (!isDebugOverlayOpen()) return;
      schedulePatch();
    }, true);

    window.addEventListener('resize', ()=>{
      if (!isDebugOverlayOpen()) return;
      schedulePatch();
    });
  }

  function bootDebugRedPatch(){
    installObservers();
    schedulePatch();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootDebugRedPatch);
  } else {
    bootDebugRedPatch();
  }
})();
