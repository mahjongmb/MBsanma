// ========= render_right.js（右エリア：北/副露描画専用） =========
// 依存：peisEl, meldsEl, peis, melds, makeImgByCode(), makeHaimenImg()

function renderPeis(){
  if (!peisEl) return;
  peisEl.innerHTML = "";

  for (const t of peis){
    const img = makeTileImg(t);
    peisEl.appendChild(img);
  }
}

/* =========================================================
   ★ 副露表示：詰め・下端揃え用ヘルパ
   - 縦牌同士は「隙間ゼロ」
   - 横向き牌は bounding box 都合で「少し余白＋Y補正」
========================================================= */

function _meldWrapBase(){
  const wrap = document.createElement("div");
  wrap.className = "meld";

  // ★ JS側で確実に制御（CSS差に依存しない）
  wrap.style.display = "flex";
  wrap.style.flexDirection = "row";
  wrap.style.alignItems = "flex-end"; // ★下端揃え（box下端）
  wrap.style.gap = "0px";             // ★縦牌間の隙間ゼロ
  wrap.style.lineHeight = "0";
  return wrap;
}

function _uprightImg(code){
  const img = makeImgByCode(code);
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  return img;
}

function _haimenImg(){
  if (typeof makeHaimenImg === "function"){
    const img = makeHaimenImg();
    img.style.display = "block";
    img.style.margin = "0";
    img.style.padding = "0";
    return img;
  }
  // 保険：裏画像生成が無い場合は表で代替（落とさない）
  const img = makeImgByCode("1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  img.style.opacity = "0.35";
  return img;
}

function _calledRotatedImg(code){
  const img = makeImgByCode(code);
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";

  // ★横向き（回転）
  img.style.transform = "rotate(90deg)";
  img.style.transformOrigin = "center center";

  // ======================================================
  // ★ かぶり対策：
  //   回転牌はbounding boxの都合で横幅が食い込みやすいので
  //   「横向き牌だけ」左右に最小の余白を入れる
  //   ※ 縦牌同士は隙間ゼロのまま
  // ======================================================
  img.style.marginLeft = "6px";
  img.style.marginRight = "6px";

  // ======================================================
  // ★ 見た目下端揃え（視覚補正）：
  //   さっきの 3px だとまだ少し高い → もう少しだけ下げる
  // ======================================================
  img.style.translate = "0 5px";

  return img;
}

// ★ 副露表現：
// - ポン：3枚のうち「鳴いた牌」を90度（右から→一番右 / 左から→一番左）
// - 明槓：縦向きの牌を横に3枚並べ、鳴いた横向き1枚を（左から→左端 / 右から→右端）に付ける
// - 加槓：ポンの「横向き牌」の上部に、横向きで“横に置く”
// - 暗槓：両端を裏向きにして（裏・表・表・裏）、隙間を詰める
//
// melds の想定形：
//   pon   : { type:"pon",    code, from:"L"|"R" }
//   minkan: { type:"minkan", code, from:"L"|"R" }
//   kakan : { type:"kakan",  code, from:"L"|"R" }  // 「上に置く」表現
//   ankan : { type:"ankan",  code }                 // or 旧形式 {code}（typeなし）
function renderMelds(){
  if (!meldsEl) return;
  meldsEl.innerHTML = "";

  for (const m of melds){
    const type = (m && m.type) ? m.type : "ankan"; // 旧形式 {code} は暗槓扱い
    const code = m && m.code ? m.code : null;
    if (!code) continue;

    if (type === "pon"){
      // ===== ポン =====
      const wrap = _meldWrapBase();
      const from = m.from; // "R" or "L"
      const n = 3;

      for (let i = 0; i < n; i++){
        const isCalled =
          (from === "R" && i === n - 1) ||
          (from === "L" && i === 0);

        const img = isCalled ? _calledRotatedImg(code) : _uprightImg(code);
        wrap.appendChild(img);
      }

      meldsEl.appendChild(wrap);
      continue;
    }

    if (type === "minkan"){
      // ===== 明槓 =====
      // 指定：縦向き3枚（横に詰める） + 鳴いた横向き1枚（左/右に付ける）
      const wrap = _meldWrapBase();
      const from = m.from; // "R" or "L"

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "row";
      row.style.alignItems = "flex-end"; // ★下端揃え
      row.style.gap = "0px";             // ★縦牌同士は詰める
      row.style.lineHeight = "0";

      for (let i = 0; i < 3; i++){
        row.appendChild(_uprightImg(code));
      }

      const called = _calledRotatedImg(code);

      if (from === "L"){
        wrap.appendChild(called);
        wrap.appendChild(row);
      } else {
        wrap.appendChild(row);
        wrap.appendChild(called);
      }

      meldsEl.appendChild(wrap);
      continue;
    }

    if (type === "kakan"){
      // ===== 加槓 =====
      // 指定：ポンの横向き牌（called）の「上部」に、横向きで“ピタ”と置く（被せない）
      // 今は「被りすぎ」→ top をもう少し上へ逃がす
      const wrap = _meldWrapBase();
      const from = m.from; // "R" or "L"
      const n = 3;

      for (let i = 0; i < n; i++){
        const isCalled =
          (from === "R" && i === n - 1) ||
          (from === "L" && i === 0);

        if (!isCalled){
          wrap.appendChild(_uprightImg(code));
          continue;
        }

        // called + top のスタック
        const stack = document.createElement("span");
        stack.style.position = "relative";
        stack.style.display = "inline-block";
        stack.style.lineHeight = "0";
        stack.style.margin = "0";
        stack.style.padding = "0";

        const baseCalled = _calledRotatedImg(code);

        // 上に置く牌（横向きのまま）
        const top = makeImgByCode(code);
        top.style.position = "absolute";
        top.style.display = "block";
        top.style.margin = "0";
        top.style.padding = "0";
        top.style.left = "50%";

        // ★「上部に置く」：被りすぎ対策で、上へ逃がす量を増やす
        //    -16px → -28px
        top.style.top = "-28px";

        // ★ 横向きで置く
        top.style.transform = "translateX(-50%) rotate(90deg)";
        top.style.transformOrigin = "center center";
        top.style.zIndex = "2";
        top.style.pointerEvents = "none";

        stack.appendChild(baseCalled);
        stack.appendChild(top);

        wrap.appendChild(stack);
      }

      meldsEl.appendChild(wrap);
      continue;
    }

    // ===== 暗槓（または未知typeは暗槓扱い） =====
    {
      const wrap = _meldWrapBase();

      // 指定：両端を裏にして、隙間を詰める（裏・表・表・裏）
      wrap.appendChild(_haimenImg());
      wrap.appendChild(_uprightImg(code));
      wrap.appendChild(_uprightImg(code));
      wrap.appendChild(_haimenImg());

      meldsEl.appendChild(wrap);
      continue;
    }
  }
}
