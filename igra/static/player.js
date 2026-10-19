/* =========================================================
   Страница игрока: вход по имени, табло, вопрос, кнопка ответа.
   ========================================================= */

// localStorage может быть недоступен — оборачиваем в try/catch
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

let me = null;           // мой id в игре
let state = null;        // последнее состояние от сервера
let blockedUntil = 0;    // до какого времени кнопка заблокирована фальстартом (локально, для вида)
let api = null;

const stage = $("#stage"), playersEl = $("#players"), buzzBtn = $("#buzz");
const timer = new TimerBar($("#timer"));

const view = new GameView(stage, {
  role: "player",
  meId: () => me,
  canChoose: s => s.phase === "board" && s.chooser === me && !s.paused,
  onChoose: (t, q) => api.send({ type: "choose", t, q }),
  canRemove: s => s.phase === "final_themes" && s.final.turn === me && !s.paused,
  onRemoveTheme: t => api.send({ type: "remove_theme", t }),
  muted: () => state && state.settings && state.settings.players_sound === false,
  renderLobby(el, s) {
    const online = s.players.filter(p => p.online);
    el.innerHTML = `
      <div class="mega zoom-in">Вы в игре!</div>
      <div class="sub">Ждём, когда ведущий начнёт</div>
      <div class="lobby-players">${online.map(p => `<span>${esc(p.name)}</span>`).join("")}</div>`;
  },
});

/* ---------- Вход ---------- */
function start(name) {
  $("#join").style.display = "none";
  $("#app").style.display = "";
  api = connect("player", onMessage, "", () => {
    // При каждом (пере)подключении представляемся — сервер узнает нас по токену
    api.send({ type: "hello", name, token: store.get("si_token") });
  });
}

$("#joinForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#nameInput").value.trim();
  if (!name) return;
  Sound.init();  // клик пользователя разрешает браузеру звук
  store.set("si_name", name);
  start(name);
});

// Экран «нажмите, чтобы продолжить»: браузер разрешает звук только после клика
function continueOverlay(name, canChangeName) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="center"><div class="mega" style="font-size:40px">${esc(name)}</div>
                  <div class="sub">Нажмите в любом месте, чтобы продолжить</div>
                  ${canChangeName ? `<button class="btn ghost small" id="changeName">Сменить имя</button>` : ""}</div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", e => {
    if (e.target.id === "changeName") {
      store.del("si_name"); store.del("si_token"); location.reload(); return;
    }
    Sound.init(); ov.remove(); view.applyMute();
  });
}

// Сообщение во весь экран (например, «войдите на сайт»)
function fullMessage(title, text, btnText, btnHref) {
  document.body.innerHTML = `<div class="app"><div class="center">
    <div class="mega" style="font-size:48px">${esc(title)}</div><div class="sub">${esc(text)}</div>
    ${btnText ? `<a class="btn gold" href="${esc(btnHref)}" style="text-decoration:none">${esc(btnText)}</a>` : ""}</div></div>`;
}

let config = { site: false };

async function init() {
  try { config = await (await fetch(BASE + "config.json", { cache: "no-store" })).json(); } catch (e) {}
  if (config.site) {
    // Игра на сайте: имя берём из профиля, вводить ничего не нужно
    if (!config.user) return fullMessage("Своя игра", "Чтобы играть, войдите на сайт под своим профилем", "Войти", config.site_url + "login");
    addBackToSite();
    continueOverlay(config.user.name, false);
    start(config.user.name);
    return;
  }
  const savedName = store.get("si_name");
  if (savedName) {
    // Вернулись на страницу — входим сразу, но просим клик, чтобы включить звук
    continueOverlay(savedName, true);
    start(savedName);
  } else {
    $("#join").style.display = "";
    $("#nameInput").focus();
  }
}

// Кнопка «На сайт» в шапке (только в игре на сайте)
function addBackToSite() {
  const bar = document.querySelector(".topbar");
  const a = document.createElement("a");
  a.className = "btn ghost small";
  a.href = config.site_url;
  a.textContent = "← На сайт";
  a.style.textDecoration = "none";
  bar.insertBefore(a, bar.firstChild);
}

init();

/* ---------- Сообщения сервера ---------- */
function onMessage(msg) {
  if (msg.type === "welcome") {
    me = msg.pid;
    store.set("si_token", msg.token);
  } else if (msg.type === "state") {
    state = msg.state;
    render();
  } else if (msg.type === "fx") {
    Sound.play(msg.name);
    if (msg.name === "falstart") {
      blockedUntil = performance.now() + 1000;
      renderBuzz();
      setTimeout(renderBuzz, 1050);
    }
    if (msg.name === "correct" || msg.name === "wrong") flashPlayer(playersEl, msg.pid, msg.name === "correct");
  } else if (msg.type === "need_login") {
    api.stopped = true;
    fullMessage("Своя игра", "Сессия на сайте закончилась — войдите снова", "Войти", config.site_url + "login");
  } else if (msg.type === "kicked") {
    api.stopped = true;
    store.del("si_token");
    document.body.innerHTML = `<div class="app"><div class="center"><div class="mega">Вы вышли из игры</div>
      <button class="btn gold" onclick="location.reload()">Войти снова</button></div></div>`;
  } else if (msg.type === "error") {
    toast(msg.msg, true);
  }
}

function render() {
  const s = state;
  view.update(s);
  view.applyMute();
  renderPause(s);
  renderPlayers(playersEl, s, me);
  timer.set(["open", "answering", "writing", "final_bets"].includes(s.phase) ? s.timer : null);
  $("#roundLabel").textContent = s.round && s.phase !== "lobby" ? s.round.name : "";
  $("#packLabel").textContent = s.pack || "";
  renderActions();
  renderBuzz();
}

/* ---------- Панель действий ----------
   Показывается вместо кнопки ответа, когда игроку нужно что-то сделать:
   отдать кота, выбрать цену, сделать ставку в аукционе или финале, написать ответ.
   Панель пересоздаётся только при смене «режима», чтобы не стирать то, что игрок печатает. */
let panelKey = "";
const panel = $("#actionPanel"), buzzRow = $("#buzzRow");

function panelMode(s) {
  if (s.paused) return "";
  if (s.phase === "secret_give" && s.secret && s.secret.giver === me) return "give:" + s.secret.candidates.join(",");
  if (s.phase === "secret_price" && s.secret && s.secret.to === me) return "price:" + s.secret.options.join(",");
  if (s.phase === "auction" && s.auction.turn === me) return "auction:" + JSON.stringify(s.auction.limits) + (s.auction.high ? "h" : "");
  if (s.phase === "final_bets" && (s.finalists || []).includes(me)) return "bet:" + (s.bets.mine ?? "");
  if (s.phase === "writing" && s.written && s.written.eligible.includes(me)) return "write:" + s.question.cell.join(",");
  return "";
}

function renderActions() {
  const s = state;
  const mode = panelMode(s);
  panel.style.display = mode ? "" : "none";
  buzzRow.style.display = mode ? "none" : "";
  if (mode === panelKey) return;
  panelKey = mode;
  if (!mode) { panel.innerHTML = ""; return; }
  const kind = mode.split(":")[0];

  if (kind === "give") {
    // Кому отдать кота в мешке
    panel.innerHTML = `<span class="lbl">Отдать кота:</span>` + s.secret.candidates.map(pid =>
      `<button class="btn gold" data-pid="${pid}">${esc(playerName(s, pid))}</button>`).join("");
    panel.querySelectorAll("[data-pid]").forEach(b => b.onclick = () => api.send({ type: "give_secret", to: b.dataset.pid }));
  } else if (kind === "price") {
    // Получатель кота выбирает цену
    panel.innerHTML = `<span class="lbl">Ваша цена:</span>` + s.secret.options.map(v =>
      `<button class="btn gold" data-v="${v}">${v}</button>`).join("");
    panel.querySelectorAll("[data-v]").forEach(b => b.onclick = () => api.send({ type: "secret_price", value: +b.dataset.v }));
  } else if (kind === "auction") {
    // Аукцион: ставка (в пределах лимитов), ва-банк, пас
    const [min, max] = s.auction.limits;
    const canPass = !!s.auction.high;
    panel.innerHTML = `
      <span class="lbl">Ваша ставка:</span>
      <input type="number" id="bidInput" min="${min}" max="${max}" step="100" value="${min}">
      <button class="btn gold" id="bidBtn">Ставка</button>
      <button class="btn red" id="allinBtn">Ва-банк (${max})</button>
      <button class="btn ghost" id="passBtn" ${canPass ? "" : "disabled title='Первый ход — нужна ставка'"}>Пас</button>
      <span class="note">от ${min} до ${max}</span>`;
    $("#bidBtn").onclick = () => {
      const v = Math.round(+$("#bidInput").value);
      if (v < min || v > max) return toast(`Ставка должна быть от ${min} до ${max}`, true);
      api.send({ type: "auction", action: "bid", amount: v });
    };
    $("#allinBtn").onclick = () => api.send({ type: "auction", action: "allin" });
    $("#passBtn").onclick = () => api.send({ type: "auction", action: "pass" });
    $("#bidInput").onkeydown = e => { if (e.key === "Enter") $("#bidBtn").click(); };
  } else if (kind === "bet") {
    // Финал: тайная ставка от 1 до своего счёта
    const max = Math.max(1, playerScore(s, me));
    if (s.bets.mine) {
      panel.innerHTML = `<span class="lbl">Ваша ставка: ${s.bets.mine}</span><span class="note">Ждём остальных…</span>`;
    } else {
      panel.innerHTML = `<span class="lbl">Ставка в финале:</span>
        <input type="number" id="betInput" min="1" max="${max}" value="${max}">
        <button class="btn gold" id="betBtn">Поставить</button>
        <span class="note">от 1 до ${max}</span>`;
      $("#betBtn").onclick = () => {
        const v = Math.round(+$("#betInput").value);
        if (v < 1 || v > max) return toast(`Ставка должна быть от 1 до ${max}`, true);
        api.send({ type: "bet", amount: v });
      };
      $("#betInput").onkeydown = e => { if (e.key === "Enter") $("#betBtn").click(); };
    }
  } else if (kind === "write") {
    // Письменный ответ. Можно исправлять и отправлять заново, пока не вышло время.
    panel.innerHTML = `<span class="lbl">Ваш ответ:</span>
      <input type="text" class="wide" id="ansInput" maxlength="200" autocomplete="off" placeholder="Напишите ответ и нажмите Enter">
      <button class="btn gold" id="ansBtn">Отправить</button>
      <span class="note" id="ansNote"></span>`;
    const inp = $("#ansInput");
    const sendAns = () => {
      const v = inp.value.trim();
      if (!v) return;
      api.send({ type: "answer", text: v });
      $("#ansNote").textContent = "Отправлено ✓";
    };
    $("#ansBtn").onclick = sendAns;
    inp.onkeydown = e => { if (e.key === "Enter") sendAns(); };
    inp.focus();
  }
}

/* ---------- Кнопка ответа ---------- */
function renderBuzz() {
  const s = state;
  if (!s) return;
  const meP = s.players.find(p => p.id === me);
  let cls = "idle", text = "ЖДИТЕ";
  if (s.paused) { text = "ПАУЗА"; }
  else if (performance.now() < blockedUntil) { cls = "blocked"; text = "ФАЛЬСТАРТ!"; }
  else if (s.phase === "answering" && s.answerer === me) { cls = "me"; text = "ВЫ ОТВЕЧАЕТЕ!"; }
  else if (s.phase === "answering") { text = "ОТВЕЧАЕТ: " + playerName(s, s.answerer).toUpperCase(); }
  else if (s.phase === "reading" && s.responder === me) { cls = "me"; text = "ГОТОВЬТЕСЬ ОТВЕЧАТЬ"; }
  else if (s.phase === "reading" && s.responder) { text = "ОТВЕЧАЕТ: " + playerName(s, s.responder).toUpperCase(); }
  else if (s.phase === "open" && meP && meP.excluded) { cls = "out"; text = "ВЫ УЖЕ ОТВЕЧАЛИ"; }
  else if (s.phase === "open") { cls = "open"; text = "ЖМИ!"; }
  else if (s.phase === "reading" || s.phase === "intro") { text = "ЖДИТЕ…"; }
  else if (s.phase === "writing") { text = "ОТВЕЧАЮТ ФИНАЛИСТЫ"; }
  else if (s.phase === "judging") { text = "ВЕДУЩИЙ ПРОВЕРЯЕТ"; }
  else if (s.phase === "reveal") { text = "ОТВЕТ"; }
  else if (s.phase === "board" && s.chooser === me) { text = "ВЫБЕРИТЕ ВОПРОС"; }
  else if (s.phase === "final_themes" && s.final && s.final.turn === me) { cls = "me"; text = "УБЕРИТЕ ТЕМУ"; }
  buzzBtn.className = "buzz " + cls;
  buzzBtn.textContent = text;

  // Апелляция: если ведущий не засчитал ответ, можно попросить пересмотреть
  const ap = $("#appealBtn");
  if (s.me && s.me.appeal_pending) { ap.style.display = ""; ap.disabled = true; ap.textContent = "Апелляция отправлена"; }
  else if (s.me && s.me.can_appeal) { ap.style.display = ""; ap.disabled = false; ap.textContent = "Оспорить решение"; }
  else ap.style.display = "none";
}
$("#appealBtn").onclick = () => api.send({ type: "appeal" });

// Нажатие отправляем сразу на pointerdown/keydown (не ждём отпускания) — так быстрее
function press() {
  if (!state || state.paused) return;
  if (["intro", "reading", "open"].includes(state.phase) && !state.responder && state.qtype === "simple") api.send({ type: "press" });
}
buzzBtn.addEventListener("pointerdown", e => { e.preventDefault(); Sound.init(); press(); });
document.addEventListener("keydown", e => {
  if (e.code === "Space" && !e.repeat && e.target.tagName !== "INPUT") {
    e.preventDefault();
    press();
  }
});
