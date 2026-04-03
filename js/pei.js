// ========= pei.js（北抜き） =========

function doPei(){
  try{
    if (isEnded) return;
    if (isRiichiSelecting) return;

    // ★ ポン後の「切るまで」中はペー不可
    if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return;

    // ★ リーチ中は「待ち状態(riichiWait)」のときだけOK
    if (isRiichi && !riichiWait) return;

    clearNewFlags();

    // ================================
    // 1) ツモ北ならそれを抜く（drawn を差し替えればOK）
    // ================================
    if (drawn && drawn.code === "4z"){
      peis.push(drawn);
      drawn = null;

      // ★ 王牌から補充（嶺上扱い）
      const add = drawFromDeadWallForPei();
      if (add){
        add.isNew = true;
        drawn = add;
      }

      if (isRiichi) riichiWait = false;

      render();

      // ★ ここで未定義でも落とさない（保険）
      if (isRiichi && typeof scheduleRiichiAuto === "function") scheduleRiichiAuto();

      return;
    }

    // ================================
    // 2) 手牌北を抜く（hand13 を 13枚に戻し、drawn は維持）
    // ================================
    const idx = hand13.findIndex(t => t.code === "4z");
    if (idx < 0) return;

    const north = hand13.splice(idx, 1)[0];
    peis.push(north);

    // ★ 王牌から補充：drawn に入れると「hand13=12 + drawn=1」になってズレるので
    //    hand13 側へ戻す（drawn はそのまま維持）
    const add = drawFromDeadWallForPei();
    if (add){
      add.isNew = true;
      hand13.push(add);
      hand13 = sortHand(hand13);
    }

    if (isRiichi) riichiWait = false;

    render();

    // ★ ここで未定義でも落とさない（保険）
    if (isRiichi && typeof scheduleRiichiAuto === "function") scheduleRiichiAuto();

  }catch(err){
    // ★ doPei 内で捕まえると stack が取れるので、Script error. で潰れない
    if (typeof showFatalError === "function") showFatalError(err, "doPei()");
  }
}
