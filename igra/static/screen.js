/* Табло для проектора. Раньше этот код был прямо в screen.html,
   но защитная политика страниц (CSP) разрешает только скрипты из файлов. */
/* Табло для проектора: всё видно, но без правильных ответов до их показа */
let state = null;
const playersEl = $("#players");
const timer = new TimerBar($("#timer"));
const view = new GameView($("#stage"), {
  role: "screen",
  muted: () => false,
  renderLobby(el, s) {
    const online = s.players.filter(p => p.online);
    el.innerHTML = `
      <div class="mega">Своя игра</div>
      <div class="sub">Откройте в браузере на своём компьютере:</div>
      <div class="join-url">${esc(s.join_url)}</div>
      <div class="sub">${online.length ? "В игре:" : "Ждём игроков…"}</div>
      <div class="lobby-players">${online.map(p => `<span>${esc(p.name)}</span>`).join("")}</div>`;
  },
});

$("#soundOverlay").addEventListener("click", () => {
  Sound.init();
  $("#soundOverlay").remove();
  try { document.documentElement.requestFullscreen(); } catch (e) {}
});

connect("screen", msg => {
  if (msg.type === "need_login") {
    document.body.innerHTML = `<div class="app"><div class="center"><div class="mega" style="font-size:48px">Табло</div>
      <div class="sub">Войдите на сайт, чтобы открыть табло</div></div></div>`;
  } else if (msg.type === "state") {
    state = msg.state;
    view.update(state);
    renderPause(state);
    renderPlayers(playersEl, state);
    timer.set(["open", "answering", "writing", "final_bets"].includes(state.phase) ? state.timer : null);
    $("#roundLabel").textContent = state.round && state.phase !== "lobby" ? state.round.name : "";
    $("#packLabel").textContent = state.pack || "";
  } else if (msg.type === "fx") {
    if (msg.name !== "falstart") Sound.play(msg.name);
    if (msg.name === "correct" || msg.name === "wrong") flashPlayer(playersEl, msg.pid, msg.name === "correct");
  }
});
