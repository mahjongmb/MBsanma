// ========= render_cpu.js（CPU描画専用） =========
// 依存：cpuLeftHandEl, cpuRightHandEl, cpuLeftRiverEl, cpuRightRiverEl
//      cpuLeftHand13, cpuRightHand13, cpuLeftRiver, cpuRightRiver
//      makeHaimenImg(), makeImgByCode()

function renderOneCpuHand(handEl, hand13Ref, openHand, drawnTile, drawnPositionClass){
  if (!handEl) return;

  handEl.innerHTML = "";

  const body = document.createElement("div");
  body.className = "cpuHandBody";

  const tiles = Array.isArray(hand13Ref) ? hand13Ref : [];
  for (const t of tiles){
    if (!t || !t.code) continue;
    body.appendChild(openHand ? makeTileImg(t) : makeHaimenImg());
  }

  if (drawnTile && drawnTile.code){
    const slot = document.createElement("div");
    slot.className = `cpuDrawnSlot ${drawnPositionClass || "cpuDrawnBottom"}`;

    const img = openHand ? makeTileImg(drawnTile) : makeHaimenImg();
    img.classList.add("cpuDrawnTile");

    slot.appendChild(img);
    body.appendChild(slot);
  }

  handEl.appendChild(body);
}

function renderCpuHands(){
  const openAll = (typeof isCpuHandOpen !== "undefined") ? !!isCpuHandOpen : false;

  let winnerSeats = [];
  try{
    if (typeof window !== "undefined" && typeof window.getRonWinnerSeatIndexesFromQueue === "function"){
      winnerSeats = window.getRonWinnerSeatIndexesFromQueue();
    }
  }catch(e){}

  if (!Array.isArray(winnerSeats) || winnerSeats.length <= 0){
    winnerSeats =
      (typeof lastAgariWinnerSeatIndex !== "undefined" && lastAgariWinnerSeatIndex != null)
        ? [lastAgariWinnerSeatIndex]
        : [];
  }

  const ended =
    (typeof isEnded !== "undefined")
      ? !!isEnded
      : false;

  let ryukyokuTenpaiSeats = null;
  if (ended && lastAgariType === "ryukyoku"){
    try{
      if (typeof buildCurrentRoundSettlement === "function"){
        const settlement = buildCurrentRoundSettlement();
        if (settlement && Array.isArray(settlement.tenpaiSeats)){
          ryukyokuTenpaiSeats = settlement.tenpaiSeats.slice();
        }
      }
    }catch(e){}
  }

  const openLeft = openAll
    || (ended && Array.isArray(winnerSeats) && winnerSeats.includes(2))
    || (ended && lastAgariType === "ryukyoku" && Array.isArray(ryukyokuTenpaiSeats) && ryukyokuTenpaiSeats.includes(2));

  const openRight = openAll
    || (ended && Array.isArray(winnerSeats) && winnerSeats.includes(1))
    || (ended && lastAgariType === "ryukyoku" && Array.isArray(ryukyokuTenpaiSeats) && ryukyokuTenpaiSeats.includes(1));

  const leftDrawnTile =
    (typeof getCpuDrawnTileBySeat === "function")
      ? getCpuDrawnTileBySeat(2)
      : null;

  const rightDrawnTile =
    (typeof getCpuDrawnTileBySeat === "function")
      ? getCpuDrawnTileBySeat(1)
      : null;

  renderOneCpuHand(cpuLeftHandEl, cpuLeftHand13, openLeft, leftDrawnTile, "cpuDrawnBottom");
  renderOneCpuHand(cpuRightHandEl, cpuRightHand13, openRight, rightDrawnTile, "cpuDrawnTop");
}

function renderCpuRivers(){
  const leftDeclareId =
    (typeof getCpuRiichiDisplayTileIdBySeat === "function")
      ? getCpuRiichiDisplayTileIdBySeat(2)
      : null;

  const rightDeclareId =
    (typeof getCpuRiichiDisplayTileIdBySeat === "function")
      ? getCpuRiichiDisplayTileIdBySeat(1)
      : null;

  // 左CPU 河
  if (cpuLeftRiverEl){
    cpuLeftRiverEl.innerHTML = "";
    if (Array.isArray(cpuLeftRiver)){
      for (const t of cpuLeftRiver){
        const img = makeImgByCode(t.code);
        if (t && t.id === leftDeclareId){
          img.classList.add("riichiDeclare");
        }
        cpuLeftRiverEl.appendChild(img);
      }
    }
  }

  // 右CPU 河
  if (cpuRightRiverEl){
    cpuRightRiverEl.innerHTML = "";
    if (Array.isArray(cpuRightRiver)){
      for (const t of cpuRightRiver){
        const img = makeImgByCode(t.code);
        if (t && t.id === rightDeclareId){
          img.classList.add("riichiDeclare");
        }
        cpuRightRiverEl.appendChild(img);
      }
    }
  }
}



function _cpuMeldWrapBase(){
  if (typeof _meldWrapBase === "function") return _meldWrapBase();

  const wrap = document.createElement("div");
  wrap.className = "meld";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = "flex-end";
  wrap.style.gap = "0px";
  wrap.style.lineHeight = "0";
  return wrap;
}

function _cpuUprightImg(code){
  if (typeof _uprightImg === "function") return _uprightImg(code);

  const img = makeImgByCode(code);
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  return img;
}

function _cpuHaimenImg(){
  if (typeof _haimenImg === "function") return _haimenImg();

  const img = (typeof makeHaimenImg === "function") ? makeHaimenImg() : makeImgByCode("1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  return img;
}

function _cpuCalledRotatedImg(code){
  if (typeof _calledRotatedImg === "function") return _calledRotatedImg(code);

  const img = makeImgByCode(code);
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  img.style.transform = "rotate(90deg)";
  img.style.transformOrigin = "center center";
  img.style.marginLeft = "6px";
  img.style.marginRight = "6px";
  img.style.translate = "0 5px";
  return img;
}

function buildCpuMeldNode(m){
  if (!m || !m.code) return null;

  const type = m.type || "ankan";
  const code = m.code;

  if (type === "pon"){
    const wrap = _cpuMeldWrapBase();
    const from = m.from;
    const n = 3;

    for (let i = 0; i < n; i++){
      const isCalled =
        (from === "R" && i === n - 1) ||
        (from === "L" && i === 0);

      wrap.appendChild(isCalled ? _cpuCalledRotatedImg(code) : _cpuUprightImg(code));
    }
    return wrap;
  }

  if (type === "minkan"){
    const wrap = _cpuMeldWrapBase();
    const from = m.from;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "row";
    row.style.alignItems = "flex-end";
    row.style.gap = "0px";
    row.style.lineHeight = "0";

    for (let i = 0; i < 3; i++){
      row.appendChild(_cpuUprightImg(code));
    }

    const called = _cpuCalledRotatedImg(code);

    if (from === "L"){
      wrap.appendChild(called);
      wrap.appendChild(row);
    } else {
      wrap.appendChild(row);
      wrap.appendChild(called);
    }

    return wrap;
  }

  if (type === "kakan"){
    const wrap = _cpuMeldWrapBase();
    const from = m.from;
    const n = 3;

    for (let i = 0; i < n; i++){
      const isCalled =
        (from === "R" && i === n - 1) ||
        (from === "L" && i === 0);

      if (!isCalled){
        wrap.appendChild(_cpuUprightImg(code));
        continue;
      }

      const stack = document.createElement("span");
      stack.style.position = "relative";
      stack.style.display = "inline-block";
      stack.style.lineHeight = "0";
      stack.style.margin = "0";
      stack.style.padding = "0";

      const baseCalled = _cpuCalledRotatedImg(code);

      const top = makeImgByCode(code);
      top.style.position = "absolute";
      top.style.display = "block";
      top.style.margin = "0";
      top.style.padding = "0";
      top.style.left = "50%";
      top.style.top = "-28px";
      top.style.transform = "translateX(-50%) rotate(90deg)";
      top.style.transformOrigin = "center center";
      top.style.zIndex = "2";
      top.style.pointerEvents = "none";

      stack.appendChild(baseCalled);
      stack.appendChild(top);

      wrap.appendChild(stack);
    }

    return wrap;
  }

  const wrap = _cpuMeldWrapBase();
  wrap.appendChild(_cpuHaimenImg());
  wrap.appendChild(_cpuUprightImg(code));
  wrap.appendChild(_cpuUprightImg(code));
  wrap.appendChild(_cpuHaimenImg());
  return wrap;
}

function renderCpuMelds(){
  if (cpuLeftMeldsEl){
    cpuLeftMeldsEl.innerHTML = "";
    if (Array.isArray(cpuLeftMelds)){
      for (const m of cpuLeftMelds){
        const node = buildCpuMeldNode(m);
        if (node) cpuLeftMeldsEl.appendChild(node);
      }
    }
  }

  if (cpuRightMeldsEl){
    cpuRightMeldsEl.innerHTML = "";
    if (Array.isArray(cpuRightMelds)){
      for (const m of cpuRightMelds){
        const node = buildCpuMeldNode(m);
        if (node) cpuRightMeldsEl.appendChild(node);
      }
    }
  }
}

function renderCpuPeis(){
  if (cpuLeftPeisEl){
    cpuLeftPeisEl.innerHTML = "";
    if (Array.isArray(cpuLeftPeis)){
      for (const t of cpuLeftPeis){
        cpuLeftPeisEl.appendChild(makeTileImg(t));
      }
    }
  }

  if (cpuRightPeisEl){
    cpuRightPeisEl.innerHTML = "";
    if (Array.isArray(cpuRightPeis)){
      for (const t of cpuRightPeis){
        cpuRightPeisEl.appendChild(makeTileImg(t));
      }
    }
  }
}

function renderCpu(){
  renderCpuHands();
  renderCpuRivers();
  renderCpuPeis();
  renderCpuMelds();
}