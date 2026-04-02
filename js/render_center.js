// ========= render_center.js（中央UI描画専用） =========
// 役割：中央UIのDOM確保と内容更新だけを行う（状態変更はしない）
// 依存：roundWind, roundNumber, honba, doraIndicators, wall, deadWall, eastSeatIndex
// 依存：ukeireToggleBtn, isUkeireVisible
// 依存：makeImgByCode()

function ensureCenterUi(){
  const root = document.getElementById("centerUi");
  if (!root) return;

  // すでに主要パーツがあるなら何もしない
  const hasRound = !!document.getElementById("roundInfo");
  const hasDora  = !!document.getElementById("doraIndicator");
  const hasWall  = !!document.getElementById("wallInfo");
  const hasScoreB = !!document.getElementById("scoreBottom");
  const hasScoreL = !!document.getElementById("scoreLeft");
  const hasScoreR = !!document.getElementById("scoreRight");
  const hasChipB = !!document.getElementById("scoreBottomChip");
  const hasChipL = !!document.getElementById("scoreLeftChip");
  const hasChipR = !!document.getElementById("scoreRightChip");

  if (hasRound && hasDora && hasWall && hasScoreB && hasScoreL && hasScoreR && hasChipB && hasChipL && hasChipR){
    return;
  }

  root.innerHTML = "";

  // 局情報
  const roundInfo = document.createElement("div");
  roundInfo.id = "roundInfo";
  root.appendChild(roundInfo);

  // ドラ
  const dora = document.createElement("div");
  dora.id = "doraIndicator";

  const doraLabel = document.createElement("span");
  doraLabel.className = "doraLabel";
  doraLabel.textContent = "ドラ";

  const doraTile = document.createElement("div");
  doraTile.id = "doraTile";

  dora.appendChild(doraLabel);
  dora.appendChild(doraTile);
  root.appendChild(dora);

  // 山/王牌
  const wallInfo = document.createElement("div");
  wallInfo.id = "wallInfo";
  root.appendChild(wallInfo);

  // 点数+チップ表示（正方形の内側3辺）
  function makeScoreArea(scoreId, areaId, chipId){
    const area = document.createElement("div");
    area.id = areaId;
    area.className = "scoreArea";

    const box = document.createElement("div");
    box.id = scoreId;
    box.className = "scoreBox";

    const wind = document.createElement("span");
    wind.className = "windMark";
    wind.textContent = "";

    const num = document.createElement("span");
    num.className = "scoreNum";
    num.textContent = "35000";

    box.appendChild(wind);
    box.appendChild(num);

    const chip = document.createElement("div");
    chip.id = chipId;
    chip.className = "scoreChipArea";

    const chipIconWrap = document.createElement("span");
    chipIconWrap.className = "scoreChipIcon";
    if (typeof makeChipIconImg === "function"){
      chipIconWrap.appendChild(makeChipIconImg());
    } else {
      const fallback = document.createElement("span");
      fallback.className = "scoreChipIconFallback";
      fallback.textContent = "●";
      chipIconWrap.appendChild(fallback);
    }

    const chipCount = document.createElement("span");
    chipCount.className = "scoreChipCount";
    chipCount.textContent = "0枚";

    chip.appendChild(chipIconWrap);
    chip.appendChild(chipCount);

    area.appendChild(box);
    area.appendChild(chip);
    return area;
  }

  const leftArea = makeScoreArea("scoreLeft", "scoreLeftArea", "scoreLeftChip");
  leftArea.classList.add("scoreAreaLeft");
  root.appendChild(leftArea);

  const rightArea = makeScoreArea("scoreRight", "scoreRightArea", "scoreRightChip");
  rightArea.classList.add("scoreAreaRight");
  root.appendChild(rightArea);

  const bottomArea = makeScoreArea("scoreBottom", "scoreBottomArea", "scoreBottomChip");
  bottomArea.classList.add("scoreAreaBottom");
  root.appendChild(bottomArea);
}

function renderCenterUi(){
  ensureCenterUi();

  renderCenterScores();
  renderScoreWinds();
  renderRoundInfo();
  renderDoraIndicators();
  renderWallInfo();
  renderCenterChips();
  renderUkeireSwitch(); // 表示テキスト同期のみ（状態変更しない）
}

// ================================
// 受け入れ表示スイッチ（表示同期だけ）
// ※ ON/OFFの状態変更は main.js のボタンハンドラが担当
// ================================
function renderUkeireSwitch(){
  if (typeof ukeireToggleBtn === "undefined" || !ukeireToggleBtn) return;
  if (typeof isUkeireVisible === "undefined") return;
  ukeireToggleBtn.textContent = isUkeireVisible ? "受け入れ：ON" : "受け入れ：OFF";
}

function renderCenterScores(){
  const safeScores = Array.isArray(scores) ? scores : [35000, 35000, 35000];

  const setScore = (boxId, value)=>{
    const box = document.getElementById(boxId);
    if (!box) return;
    const numEl = box.querySelector(".scoreNum");
    if (!numEl) return;

    const n = Number.isFinite(value) ? (value | 0) : 0;
    numEl.textContent = n.toLocaleString("ja-JP");
  };

  setScore("scoreBottom", safeScores[0]);
  setScore("scoreRight", safeScores[1]);
  setScore("scoreLeft", safeScores[2]);
}

function formatCenterChipCountText(value){
  const n = Number.isFinite(value) ? (value | 0) : 0;
  return `${n}枚`;
}

function renderCenterChips(){
  const seatToChipId = {
    0: "scoreBottomChip",
    1: "scoreRightChip",
    2: "scoreLeftChip"
  };

  for (const seatKey of Object.keys(seatToChipId)){
    const seatIndex = Number(seatKey);
    const chipEl = document.getElementById(seatToChipId[seatIndex]);
    if (!chipEl) continue;

    const countEl = chipEl.querySelector(".scoreChipCount");
    if (!countEl) continue;

    let count = 0;
    if (typeof getHanchanChipCount === "function"){
      count = getHanchanChipCount(seatIndex);
    } else if (typeof window !== "undefined" && window.hanchanSeatStats && window.hanchanSeatStats[seatIndex]){
      count = Number(window.hanchanSeatStats[seatIndex].chip) || 0;
    }

    countEl.textContent = formatCenterChipCountText(count);
    chipEl.classList.toggle("isPositive", count > 0);
    chipEl.classList.toggle("isNegative", count < 0);
    chipEl.classList.toggle("isZero", count === 0);
  }
}

function renderScoreWinds(){
  const seatOrder = ["bottom", "right", "left"];

  const e = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const eastSeat = seatOrder[((e % 3) + 3) % 3];

  const windBySeat = { bottom:"", right:"", left:"" };

  const startIdx = seatOrder.indexOf(eastSeat);
  windBySeat[seatOrder[startIdx]] = "東";
  windBySeat[seatOrder[(startIdx + 1) % 3]] = "南";
  windBySeat[seatOrder[(startIdx + 2) % 3]] = "西";

  const setWind = (boxId, windChar) => {
    const box = document.getElementById(boxId);
    if (!box) return;
    const windEl = box.querySelector(".windMark");
    if (!windEl) return;
    windEl.textContent = windChar;
    windEl.classList.toggle("windEast", windChar === "東");
  };

  setWind("scoreBottom", windBySeat.bottom);
  setWind("scoreRight",  windBySeat.right);
  setWind("scoreLeft",   windBySeat.left);
}

function renderRoundInfo(){
  const el = document.getElementById("roundInfo");
  if (!el) return;
  const wind = roundWind || "東";
  const num  = roundNumber || 1;
  const hb = honba || 0;
  el.textContent = `${wind}${num}局　${hb}本場`;
}

// ================================
// ドラ表示牌コード -> 実際のドラ牌コード
// - 数牌：次の数字へ
// - 字牌：1z→2z→...→7z→1z
// - 三麻の萬子は 1m ↔ 9m
// ================================
function getDoraCodeFromIndicator(code){
  if (!code || typeof code !== "string" || code.length < 2) return code;

  const num = code[0];
  const suit = code[1];

  if (suit === "p" || suit === "s"){
    const n = Number(num);
    if (!Number.isInteger(n) || n < 1 || n > 9) return code;
    return `${n === 9 ? 1 : n + 1}${suit}`;
  }

  if (suit === "z"){
    const n = Number(num);
    if (!Number.isInteger(n) || n < 1 || n > 7) return code;
    return `${n === 7 ? 1 : n + 1}z`;
  }

  if (suit === "m"){
    if (code === "1m") return "9m";
    if (code === "9m") return "1m";
    return code;
  }

  return code;
}

function renderDoraIndicators(){
  const el = document.getElementById("doraTile");
  if (!el) return;
  el.innerHTML = "";
  if (!Array.isArray(doraIndicators)) return;

  for (const d of doraIndicators){
    if (!d || !d.code) continue;
    const doraCode = getDoraCodeFromIndicator(d.code);
    el.appendChild(makeImgByCode(doraCode));
  }
}

function renderWallInfo(){
  const el = document.getElementById("wallInfo");
  if (!el) return;

  const wallCount = (typeof wall !== "undefined" && wall) ? wall.length : 0;
  const deadCount = (typeof getDeadWallDisplayCount === "function")
    ? getDeadWallDisplayCount()
    : ((typeof deadWall !== "undefined" && deadWall) ? deadWall.length : 0);

  el.innerHTML = `
    <div>山：${wallCount}枚</div>
    <div>王牌：${deadCount}枚</div>
  `;
}
