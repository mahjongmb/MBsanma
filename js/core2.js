// MBsanma/js/core2.js
// ========= core2.js（core追加ぶん / CPU用補助） =========

let cpuRightRiichi = false;
let cpuLeftRiichi = false;

// ★ CPU手牌の表/裏表示切替
let isCpuHandOpen = false;

// ★ CPUリーチ宣言牌ID
// - declare : 内部上の本来の宣言牌
// - display : 河で横向きに見せる牌
// - pending : 宣言牌が副露で消えたあと、次の捨て牌へ横向き表示を引き継ぐ待機
let cpuRightRiichiDeclareTileId = null;
let cpuLeftRiichiDeclareTileId = null;
let cpuRightRiichiDisplayTileId = null;
let cpuLeftRiichiDisplayTileId = null;
let cpuRightRiichiDisplayPending = false;
let cpuLeftRiichiDisplayPending = false;

// ★ CPUの現在ツモ牌
let cpuRightDrawnTile = null;
let cpuLeftDrawnTile = null;

// ★ CPUの北抜き牌
let cpuRightPeis = [];
let cpuLeftPeis = [];

// ★ CPUの副露牌
let cpuRightMelds = [];
let cpuLeftMelds = [];

function resetCpuExtraState(){
  cpuRightRiichi = false;
  cpuLeftRiichi = false;

  cpuRightRiichiDeclareTileId = null;
  cpuLeftRiichiDeclareTileId = null;
  cpuRightRiichiDisplayTileId = null;
  cpuLeftRiichiDisplayTileId = null;
  cpuRightRiichiDisplayPending = false;
  cpuLeftRiichiDisplayPending = false;

  cpuRightDrawnTile = null;
  cpuLeftDrawnTile = null;

  cpuRightPeis = [];
  cpuLeftPeis = [];

  cpuRightMelds = [];
  cpuLeftMelds = [];
}

function isCpuSeat(seatIndex){
  return seatIndex === 1 || seatIndex === 2;
}

function getCpuHand13RefBySeat(seatIndex){
  if (seatIndex === 1) return cpuRightHand13;
  if (seatIndex === 2) return cpuLeftHand13;
  return null;
}

function setCpuHand13BySeat(seatIndex, nextHand13){
  if (!Array.isArray(nextHand13)) return;

  if (seatIndex === 1){
    cpuRightHand13 = nextHand13;
    return;
  }
  if (seatIndex === 2){
    cpuLeftHand13 = nextHand13;
  }
}

function getCpuPeiRefBySeat(seatIndex){
  if (seatIndex === 1) return cpuRightPeis;
  if (seatIndex === 2) return cpuLeftPeis;
  return null;
}

function addCpuPeiBySeat(seatIndex, tile){
  if (!tile) return;

  const ref = getCpuPeiRefBySeat(seatIndex);
  if (!Array.isArray(ref)) return;

  ref.push(tile);
}

function getCpuPeiCountBySeat(seatIndex){
  const ref = getCpuPeiRefBySeat(seatIndex);
  return Array.isArray(ref) ? ref.length : 0;
}
function getCpuMeldRefBySeat(seatIndex){
  if (seatIndex === 1) return cpuRightMelds;
  if (seatIndex === 2) return cpuLeftMelds;
  return null;
}

function addCpuMeldBySeat(seatIndex, meld){
  if (!meld) return;

  const ref = getCpuMeldRefBySeat(seatIndex);
  if (!Array.isArray(ref)) return;

  ref.push(meld);
}

function clearCpuMeldsBySeat(seatIndex){
  if (seatIndex === 1){
    cpuRightMelds = [];
    return;
  }
  if (seatIndex === 2){
    cpuLeftMelds = [];
  }
}

function getCpuFixedMeldCountBySeat(seatIndex){
  const ref = getCpuMeldRefBySeat(seatIndex);
  return Array.isArray(ref) ? ref.length : 0;
}


function getCpuRiverRefBySeat(seatIndex){
  if (seatIndex === 1) return cpuRightRiver;
  if (seatIndex === 2) return cpuLeftRiver;
  return null;
}

function isCpuRiichiSeat(seatIndex){
  if (seatIndex === 1) return !!cpuRightRiichi;
  if (seatIndex === 2) return !!cpuLeftRiichi;
  return false;
}

function setCpuRiichiBySeat(seatIndex, value){
  if (seatIndex === 1){
    cpuRightRiichi = !!value;
    return;
  }
  if (seatIndex === 2){
    cpuLeftRiichi = !!value;
  }
}

function setCpuRiichiDeclareTileIdBySeat(seatIndex, tileId){
  const nextId = tileId ?? null;

  if (seatIndex === 1){
    cpuRightRiichiDeclareTileId = nextId;
    cpuRightRiichiDisplayTileId = nextId;
    cpuRightRiichiDisplayPending = false;
    return;
  }
  if (seatIndex === 2){
    cpuLeftRiichiDeclareTileId = nextId;
    cpuLeftRiichiDisplayTileId = nextId;
    cpuLeftRiichiDisplayPending = false;
  }
}

function getCpuRiichiDeclareTileIdBySeat(seatIndex){
  if (seatIndex === 1) return cpuRightRiichiDeclareTileId;
  if (seatIndex === 2) return cpuLeftRiichiDeclareTileId;
  return null;
}

function getCpuRiichiDisplayTileIdBySeat(seatIndex){
  if (seatIndex === 1) return cpuRightRiichiDisplayTileId;
  if (seatIndex === 2) return cpuLeftRiichiDisplayTileId;
  return null;
}

function markCpuRiichiDisplayTileCalledAwayBySeat(seatIndex, tileId){
  if (tileId == null) return;

  if (seatIndex === 1){
    if (cpuRightRiichiDisplayTileId == null || cpuRightRiichiDisplayTileId !== tileId) return;
    cpuRightRiichiDisplayTileId = null;
    if (cpuRightRiichi && cpuRightRiichiDeclareTileId != null){
      cpuRightRiichiDisplayPending = true;
    }
    return;
  }

  if (seatIndex === 2){
    if (cpuLeftRiichiDisplayTileId == null || cpuLeftRiichiDisplayTileId !== tileId) return;
    cpuLeftRiichiDisplayTileId = null;
    if (cpuLeftRiichi && cpuLeftRiichiDeclareTileId != null){
      cpuLeftRiichiDisplayPending = true;
    }
  }
}

function maybeAdoptCpuRiichiDisplayTileBySeat(seatIndex, tile){
  if (!tile || tile.id == null) return;

  if (seatIndex === 1){
    if (!cpuRightRiichi || !cpuRightRiichiDisplayPending) return;
    cpuRightRiichiDisplayTileId = tile.id;
    cpuRightRiichiDisplayPending = false;
    return;
  }

  if (seatIndex === 2){
    if (!cpuLeftRiichi || !cpuLeftRiichiDisplayPending) return;
    cpuLeftRiichiDisplayTileId = tile.id;
    cpuLeftRiichiDisplayPending = false;
  }
}

function setCpuDrawnTileBySeat(seatIndex, tile){
  if (seatIndex === 1){
    cpuRightDrawnTile = tile || null;
    return;
  }
  if (seatIndex === 2){
    cpuLeftDrawnTile = tile || null;
  }
}

function getCpuDrawnTileBySeat(seatIndex){
  if (seatIndex === 1) return cpuRightDrawnTile;
  if (seatIndex === 2) return cpuLeftDrawnTile;
  return null;
}

function clearCpuDrawnTileBySeat(seatIndex){
  setCpuDrawnTileBySeat(seatIndex, null);
}

function countVisibleForCpuSeat(seatIndex, ownTiles){
  const c = Array(TILE_TYPES.length).fill(0);

  const addCode = (code, n = 1)=>{
    const idx = TYPE_TO_IDX[code];
    if (idx === undefined) return;
    c[idx] += (n | 0);
  };

  const addTiles = (arr)=>{
    if (!Array.isArray(arr)) return;
    for (const t of arr){
      if (t && t.code) addCode(t.code, 1);
    }
  };

  addTiles(ownTiles);

  addTiles(river);
  addTiles(cpuLeftRiver);
  addTiles(cpuRightRiver);
  addTiles(peis);
  addTiles(cpuLeftPeis);
  addTiles(cpuRightPeis);

  if (Array.isArray(doraIndicators)){
    for (const d of doraIndicators){
      if (d && d.code) addCode(d.code, 1);
    }
  }

  if (Array.isArray(melds)){
    for (const m of melds){
      if (!m || !m.code) continue;
      if (m.type === "pon") addCode(m.code, 3);
      else if (m.type === "minkan") addCode(m.code, 4);
      else if (m.type === "ankan") addCode(m.code, 4);
      else if (m.type === "kakan") addCode(m.code, 4);
    }
  }

  const cpuMeldSeatList = [1, 2];
  for (const seat of cpuMeldSeatList){
    const meldRef = getCpuMeldRefBySeat(seat);
    if (!Array.isArray(meldRef)) continue;
    for (const m of meldRef){
      if (!m || !m.code) continue;
      if (m.type === "pon") addCode(m.code, 3);
      else if (m.type === "minkan") addCode(m.code, 4);
      else if (m.type === "ankan") addCode(m.code, 4);
      else if (m.type === "kakan") addCode(m.code, 4);
    }
  }

  for (let i = 0; i < c.length; i++){
    if (c[i] < 0) c[i] = 0;
    if (c[i] > 4) c[i] = 4;
  }

  return c;
}


function getSeatWindBySeatIndexForCpu(seatIndex){
  const e = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

  if (e === 0){
    if (seatIndex === 0) return "東";
    if (seatIndex === 1) return "南";
    if (seatIndex === 2) return "西";
  }

  if (e === 1){
    if (seatIndex === 1) return "東";
    if (seatIndex === 2) return "南";
    if (seatIndex === 0) return "西";
  }

  if (e === 2){
    if (seatIndex === 2) return "東";
    if (seatIndex === 0) return "南";
    if (seatIndex === 1) return "西";
  }

  return null;
}

function canCpuTsumoByYaku(seatIndex, tiles14){
  if (!Array.isArray(tiles14) || tiles14.length <= 0) return false;
  if (typeof getAgariYakuInfo !== "function") return true;

  try{
    const info = getAgariYakuInfo({
      tiles14: tiles14.slice(),
      meldList: (typeof getCpuMeldRefBySeat === "function" && Array.isArray(getCpuMeldRefBySeat(seatIndex)))
        ? getCpuMeldRefBySeat(seatIndex).slice()
        : [],
      winType: "tsumo",
      winTileCode: tiles14[tiles14.length - 1] && tiles14[tiles14.length - 1].code ? tiles14[tiles14.length - 1].code : null,
      isRiichi: (typeof isCpuRiichiSeat === "function") ? isCpuRiichiSeat(seatIndex) : false,
      roundWind: (typeof roundWind !== "undefined") ? roundWind : null,
      seatWind: getSeatWindBySeatIndexForCpu(seatIndex),
      doraIndicators: Array.isArray(doraIndicators) ? doraIndicators.slice() : [],
      uraDoraIndicators: Array.isArray(uraDoraIndicators) ? uraDoraIndicators.slice() : [],
      peis: (typeof getCpuPeiRefBySeat === "function" && Array.isArray(getCpuPeiRefBySeat(seatIndex)))
        ? getCpuPeiRefBySeat(seatIndex).slice()
        : [],
      ...(typeof getWinSituationFlags === "function" ? getWinSituationFlags("tsumo", seatIndex) : {})
    });
    if (!info || !info.isAgari) return false;
    if ((info.yakuman | 0) > 0) return true;
    return (info.han | 0) > 0;
  }catch(e){
    return false;
  }
}

function canCpuTsumoWithTiles(seatIndexOrTiles14, maybeTiles14){
  try{
    let seatIndex = null;
    let tiles14 = null;

    if (Array.isArray(seatIndexOrTiles14)){
      tiles14 = seatIndexOrTiles14;
    } else {
      seatIndex = seatIndexOrTiles14;
      tiles14 = maybeTiles14;
    }

    if (!Array.isArray(tiles14) || tiles14.length <= 0) return false;

    const fixedM = (seatIndex != null && typeof getCpuFixedMeldCountBySeat === "function")
      ? getCpuFixedMeldCountBySeat(seatIndex)
      : 0;

    if (calcShanten(countsFromTiles(tiles14), fixedM) !== -1) return false;

    if (seatIndex == null) return true;
    return canCpuTsumoByYaku(seatIndex, tiles14);
  }catch(e){
    return false;
  }
}

function finishCpuTsumo(seatIndex){
  if (isEnded) return;

  isEnded = true;
  hoveredTileId = null;

  try{
    if (typeof setPostAgariStageToOverlay === "function"){
      setPostAgariStageToOverlay();
    }
  }catch(e){}

  try{
    lastAgariWinnerSeatIndex = seatIndex;
    lastAgariDiscarderSeatIndex = null;
    lastAgariType = "tsumo";
  }catch(e){}

  try{
    clearNewFlags();
  }catch(e){}

  try{
    render();
  }catch(e){}

  if (typeof openTsumo === "function"){
    openTsumo();
  }
}

function toggleCpuHandOpen(){
  isCpuHandOpen = !isCpuHandOpen;
}

function setCpuHandOpen(value){
  isCpuHandOpen = !!value;
}

function getCpuHandOpenLabel(){
  return isCpuHandOpen ? "CP手牌：表" : "CP手牌：裏";
}