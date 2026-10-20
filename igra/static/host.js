/* =========================================================
   Пульт ведущего.
   Слева — экран как у игроков (ведущий может сам выбирать клетки),
   справа — кнопки управления, правильный ответ, игроки, настройки.
   Горячие клавиши:  1 — верно,  2 — неверно,  O — открыть кнопки / закончить чтение,
                     N — дальше (к табло),  S — пропустить вопрос,  P — пауза.
   ========================================================= */

let state = null;
let api = null;
let hostSound = false;   // звук медиа на странице ведущего (по умолчанию выключен,
                         // чтобы не дублировать звук с проектора на том же компьютере)
let pin = "";

const PHASES = {
  lobby: "Лобби", round_intro: "Заставка раунда", board: "Табло", intro: "Заставка вопроса",
  reading: "Чтение вопроса", open: "Кнопки открыты", answering: "Игрок отвечает",
  reveal: "Показ ответа", game_over: "Игра окончена",
  secret_give: "Кот в мешке: кому отдать", secret_price: "Кот в мешке: цена", auction: "Аукцион",
  final_themes: "Финал: убираем темы", final_bets: "Финал: ставки",
  writing: "Пишут ответы", judging: "Проверка ответов",
};

const playersEl = $("#players");
const timer = new TimerBar($("#timer"));
const view = new GameView($("#stage"), {
  role: "host",
  canChoose: s => s.phase === "board",
  onChoose: (t, q) => api.send({ type: "choose", t, q }),
  // В финале ведущий может убрать тему за игрока (например, если тот не в сети)
  canRemove: s => s.phase === "final_themes",
  onRemoveTheme: t => api.send({ type: "remove_theme", t }),
  muted: () => !hostSound,
  // Звук/видео вопроса закончилось — сообщаем серверу, чтобы он открыл кнопки
  onMediaEnded: () => api.send({ type: "media_ended" }),
  renderLobby(el, s) {
    const online = s.players.filter(p => p.online);
    el.innerHTML = `
      <div class="mega">Лобби</div>
      <div class="sub">${s.pack ? "Пак: " + esc(s.pack) : "Выберите пак справа"}</div>
      <div class="sub">Игроков онлайн: ${online.length}</div>`;
  },
});

/* ---------- Подключение ---------- */
function start() {
  api = connect("host", onMessage, pin ? "&pin=" + encodeURIComponent(pin) : "");
}

$("#pinForm").addEventListener("submit", e => {
  e.preventDefault();
  pin = $("#pinInput").value.trim();
  $("#pinBox").style.display = "none";
  start();
});

function onMessage(msg) {
  if (msg.type === "need_login" || (msg.type === "auth_failed" && msg.site)) {
    // Игра на сайте: пульт доступен только админу сайта
    api.stopped = true;
    document.body.innerHTML = `<div class="app"><div class="center"><div class="mega" style="font-size:48px">Пульт ведущего</div>
      <div class="sub">${msg.type === "need_login" ? "Войдите на сайт под профилем администратора" : "Вести игру может только администратор сайта"}</div>
      <a class="btn gold" href="${BASE}" style="text-decoration:none">Открыть игру как игрок</a></div></div>`;
  } else if (msg.type === "auth_failed") {
    api.stopped = true;
    $("#pinBox").style.display = "";
    $("#pinInput").value = "";
    $("#pinInput").focus();
    if (pin) toast("Неверный PIN", true);
  } else if (msg.type === "state") {
    state = msg.state;
    render();
  } else if (msg.type === "fx") {
    if (hostSound) Sound.play(msg.name);
    if (msg.name === "correct" || msg.name === "wrong") flashPlayer(playersEl, msg.pid, msg.name === "correct");
  } else if (msg.type === "info") {
    toast(msg.msg);
  } else if (msg.type === "error") {
    toast(msg.msg, true);
  }
}

/* ---------- Отрисовка ---------- */
function render() {
  const s = state;
  view.update(s);
  renderPlayers(playersEl, s, null, { showOffline: true });
  timer.set(["open", "answering", "writing", "final_bets"].includes(s.phase) ? s.timer : null);
  $("#roundLabel").textContent = s.round && s.phase !== "lobby" ? `${s.round.name} (${s.round.num}/${s.round.count})` : "";
  $("#packLabel").textContent = s.pack || "";
  $("#phaseName").textContent = (PHASES[s.phase] || s.phase) + (s.paused ? " · ПАУЗА" : "");
  renderAppeals(s);
  renderActions(s);
  renderAnswer(s);
  renderPlayerList(s);
  renderPacks(s);
  renderSettings(s);
  renderJoinInfo(s);
}

// Адрес для учеников и кнопка табло. Перерисовываем, только если адрес поменялся.
let lastJoin = null;
function renderJoinInfo(s) {
  const key = s.join_url + isApp();
  if (key === lastJoin) return;
  lastJoin = key;
  const el = $("#joinInfo");
  el.innerHTML = (s.site
    ? `Ученики заходят на сайт во вкладку «Своя игра»:<br><b>${esc(s.join_url)}</b>`
    : `Ученики находят игру сами (кнопка «Играть» в приложении)<br>или вводят адрес:<br><b>${esc(s.join_url)}</b>`) + `
    <button class="btn ghost" id="screenBtn" style="margin-top:6px">Открыть табло для проектора</button>`;
  $("#screenBtn").onclick = async () => {
    if (isApp()) {
      const r = await window.pywebview.api.open_screen();
      toast(r.second_monitor ? "Табло открыто на втором экране" : "Табло открыто в отдельном окне — перетащите его на проектор");
    } else {
      window.open(BASE + "screen", "_blank");
    }
  };
}
// Когда страница поняла, что она в приложении, перерисуем блок с табло
document.addEventListener("appmode", () => { lastJoin = null; state && renderJoinInfo(state); });

// Кнопки управления меняются в зависимости от фазы.
// HTML пересобирается только когда он реально изменился — иначе стирались бы введённые числа.
let lastActions = "";
const kept = {};   // введённые ведущим значения (ставка в аукционе) между перерисовками

function renderActions(s) {
  const A = [];
  const b = (label, cls, msg, key = "", wide = false) =>
    A.push(`<button class="btn ${cls} ${wide ? "wide" : ""}" data-msg='${esc(JSON.stringify(msg))}'>${label}${key ? `<kbd>${key}</kbd>` : ""}</button>`);
  const note = t => A.push(`<div class="muted-note wide">${t}</div>`);
  const nm = pid => esc(playerName(s, pid));

  if (s.paused) {
    b("Продолжить игру", "gold", { type: "resume" }, "P", true);
  } else switch (s.phase) {
    case "lobby":
      b("Начать игру", "gold", { type: "start" }, "", true);
      break;
    case "round_intro":
      b("Пропустить заставку", "ghost", { type: "skip_intro" }, "N", true);
      break;
    case "board":
      note("Игрок выбирает вопрос. Вы тоже можете кликнуть по клетке.");
      b("Следующий раунд", "ghost", { type: "next_round" });
      b("Закончить игру", "ghost", { type: "end_game" });
      break;
    case "secret_give":
      note(s.secret.giver ? `${nm(s.secret.giver)} отдаёт кота. Можно отдать за него:` : "Кому отдать кота?");
      s.secret.candidates.forEach(pid => b(nm(pid), "ghost", { type: "give_secret", to: pid }));
      break;
    case "secret_price":
      note(`${nm(s.secret.to)} выбирает цену. Можно выбрать за него:`);
      s.secret.options.forEach(v => b(String(v), "ghost", { type: "secret_price", value: v }));
      break;
    case "auction": {
      const a = s.auction;
      note(`Ходит ${nm(a.turn)}` + (a.high ? ` · лидер ${nm(a.high[0])}: ${a.high[1]}` : "") + ". Можно сходить за него:");
      if (a.limits) {
        A.push(`<div class="wide" style="display:flex; gap:6px">
          <input type="number" id="hostBid" min="${a.limits[0]}" max="${a.limits[1]}" value="${kept.bid ?? a.limits[0]}" style="flex:1">
          <button class="btn" id="hostBidBtn">Ставка</button></div>`);
        b(`Ва-банк (${Math.max(a.limits[1], a.price)})`, "red", { type: "auction", action: "allin" });
      }
      if (a.high) b("Пас", "ghost", { type: "auction", action: "pass" });
      b("Завершить аукцион", "gold", { type: "finish_auction" }, "", true);
      break;
    }
    case "final_themes":
      note(`Тему убирает ${nm(s.final.turn)}. Можно кликнуть по теме за него.`);
      break;
    case "final_bets":
      note("Ставки: " + (s.finalists || []).map(pid =>
        `${nm(pid)} — ${s.bets.all[pid] !== undefined ? "<b>" + s.bets.all[pid] + "</b>" : "…"}`).join(", "));
      b("Закрыть ставки", "gold", { type: "close_bets" }, "", true);
      break;
    case "intro":
    case "reading":
      b(s.qtype === "simple" ? "Открыть кнопки сейчас" : "Закончить чтение", "green", { type: "unlock_now" }, "O", true);
      b("Пропустить вопрос", "ghost", { type: "skip" }, "S", true);
      break;
    case "open":
      b("Показать ответ (никто)", "ghost", { type: "reveal_now" }, "", true);
      break;
    case "answering":
      A.push(`<div class="wide" style="font-weight:800; font-size:18px">Отвечает: <span style="color:var(--gold)">${nm(s.answerer)}</span></div>`);
      A.push(`<div class="actions judge wide">
        <button class="btn green" data-msg='{"type":"judge","correct":true}'>Верно<kbd>1</kbd></button>
        <button class="btn red" data-msg='{"type":"judge","correct":false}'>Неверно<kbd>2</kbd></button></div>`);
      b("Пропустить вопрос", "ghost", { type: "skip" }, "S", true);
      break;
    case "writing":
      note(`Ответили ${s.written.submitted.length} из ${s.written.eligible.length}. Ответы видны в «Проверке» после окончания.`);
      b("Закончить приём ответов", "gold", { type: "close_writing" }, "", true);
      break;
    case "judging": {
      // Отметьте каждый ответ: верно / неверно. Потом «Применить».
      const bets = s.bets ? s.bets.all : {};
      s.written.eligible.forEach(pid => {
        const m = s.written.marks[pid];
        A.push(`<div class="wide judge-row">
          <div class="jr-top"><b>${nm(pid)}</b>${bets[pid] !== undefined ? `<span class="muted-note">ставка ${bets[pid]}</span>` : ""}</div>
          <div class="jr-ans">${esc(s.written.answers[pid] || "— нет ответа —")}</div>
          <div class="jr-btns">
            <button class="btn small ${m === true ? "green" : "ghost"}" data-msg='${esc(JSON.stringify({ type: "mark", pid, correct: true }))}'>Верно</button>
            <button class="btn small ${m === false ? "red" : "ghost"}" data-msg='${esc(JSON.stringify({ type: "mark", pid, correct: false }))}'>Неверно</button>
          </div></div>`);
      });
      b("Применить и показать ответ", "gold", { type: "apply_marks" }, "", true);
      break;
    }
    case "reveal":
      b("Дальше", "gold", { type: "to_board" }, "N", true);
      break;
    case "game_over":
      // Игра на сайте: очки школы за места
      if (s.site && !s.awarded) {
        A.push(`<div class="wide award-box">
          <div class="muted-note">Очки школы за места (при равенстве место общее):</div>
          <div class="award-row">
            <label>1 место<input type="number" step="0.1" min="0" id="aw1" value="${kept.aw1 ?? 1}"></label>
            <label>2 место<input type="number" step="0.1" min="0" id="aw2" value="${kept.aw2 ?? 0.5}"></label>
            <label>3 место<input type="number" step="0.1" min="0" id="aw3" value="${kept.aw3 ?? 0.3}"></label>
          </div>
          <button class="btn gold" id="awardBtn">Начислить очки школы</button></div>`);
      } else if (s.site) {
        note("Очки школы за эту игру начислены ✓");
      }
      b("Новая игра", "gold", { type: "to_lobby" }, "", true);
      break;
  }
  if (!s.paused && !["lobby", "game_over"].includes(s.phase)) b("Пауза", "ghost", { type: "pause" }, "P", true);
  if (!["lobby", "game_over"].includes(s.phase)) b("В лобби (сбросить игру)", "ghost small", { type: "to_lobby" }, "", true);

  const html = A.join("");
  if (html === lastActions) return;
  lastActions = html;
  const el = $("#actions");
  el.innerHTML = html;
  el.querySelectorAll("[data-msg]").forEach(btn => btn.addEventListener("click", () => {
    const msg = JSON.parse(btn.dataset.msg);
    if (msg.type === "to_lobby" && state.phase !== "game_over" && !confirm("Сбросить текущую игру?")) return;
    api.send(msg);
  }));
  const awardBtn = $("#awardBtn");
  if (awardBtn) {
    ["aw1", "aw2", "aw3"].forEach(id => { $("#" + id).oninput = e => { kept[id] = e.target.value; }; });
    awardBtn.onclick = () => {
      const pts = ["aw1", "aw2", "aw3"].map(id => +$("#" + id).value || 0);
      if (confirm(`Начислить очки школы: 1 место +${pts[0]}, 2 место +${pts[1]}, 3 место +${pts[2]}?`))
        api.send({ type: "award", points: pts });
    };
  }
  const bid = $("#hostBid");
  if (bid) {
    bid.oninput = () => { kept.bid = bid.value; };
    $("#hostBidBtn").onclick = () => api.send({ type: "auction", action: "bid", amount: Math.round(+bid.value) });
  }
}

// Апелляции игроков: принять (игрок получает очки, как за верный ответ) или отклонить
function renderAppeals(s) {
  const box = $("#appealBox");
  const list = s.appeals || [];
  box.style.display = list.length ? "" : "none";
  const html = list.map(pid => `
    <div class="judge-row"><div><b>${esc(playerName(s, pid))}</b> оспаривает решение</div>
      <div class="jr-btns">
        <button class="btn green small" data-ap="${pid}" data-ok="1">Принять</button>
        <button class="btn red small" data-ap="${pid}" data-ok="">Отклонить</button></div></div>`).join("");
  const el = $("#appealList");
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
  el.querySelectorAll("[data-ap]").forEach(x => x.onclick = () =>
    api.send({ type: "resolve_appeal", pid: x.dataset.ap, accept: !!x.dataset.ok }));
}

// Правильный ответ видит только ведущий — ещё до показа вопроса (кот, аукцион, ставки)
function renderAnswer(s) {
  const box = $("#answerBox");
  const q = s.question && s.question.answer !== undefined ? s.question : s.question_preview;
  if (q) {
    box.style.display = "";
    $("#answerText").textContent = q.answer || "—";
    // Длинный ответ — компактнее и с прокруткой (класс long в host.html)
    $("#answerText").classList.toggle("long", (q.answer || "").length > 60);
    $("#answerWrong").textContent = q.wrong && q.wrong.length ? "Не засчитывать: " + q.wrong.join(", ") : "";
    $("#answerComment").textContent = q.comment || "";
  } else {
    box.style.display = "none";
  }
}

function renderPlayerList(s) {
  const el = $("#plist");
  if (!s.players.length) { el.innerHTML = `<div class="muted-note">Пока никого</div>`; return; }
  el.innerHTML = s.players.map(p => `
    <div class="prow ${p.id === s.chooser ? "ch" : ""} ${p.id === s.answerer ? "ans" : ""}">
      <span class="nm ${p.online ? "" : "off"}" title="${p.online ? "в сети" : "не в сети"}">${p.online ? "🟢" : "⚪"} ${esc(p.name)}</span>
      <span class="sc" data-score="${p.id}">${p.score}</span>
      <button class="btn ghost small" data-chooser="${p.id}" title="Передать выбор вопроса">★</button>
      <button class="btn ghost small" data-kick="${p.id}" title="Удалить игрока">✕</button>
    </div>`).join("");
  el.querySelectorAll("[data-score]").forEach(x => x.addEventListener("click", () => {
    const p = s.players.find(p => p.id === x.dataset.score);
    const v = prompt(`Очки игрока «${p.name}»:`, p.score);
    if (v !== null && v.trim() !== "" && !isNaN(+v)) api.send({ type: "score", pid: p.id, value: Math.round(+v) });
  }));
  el.querySelectorAll("[data-chooser]").forEach(x => x.addEventListener("click", () => api.send({ type: "set_chooser", pid: x.dataset.chooser })));
  el.querySelectorAll("[data-kick]").forEach(x => x.addEventListener("click", () => {
    const p = s.players.find(p => p.id === x.dataset.kick);
    if (confirm(`Удалить игрока «${p.name}»?`)) api.send({ type: "kick", pid: p.id });
  }));
}

/* ---------- Выбор пака ----------
   Свой выпадающий список вместо <select>: в обычный <select> нельзя
   поставить кнопку, а нам нужен крестик «удалить» у каждого пака. */
let packs = [];          // паки на сервере: [{file, title}]
let loadedPack = "";     // какой пак сейчас загружен в игру
let selectedPack = "";   // какой пак выбран в списке (его загрузит кнопка «Загрузить»)
let lastPacks = "";

function packLabel(p) { return `${p.title} — ${p.file}`; }

function renderPacks(s) {
  $("#lobbyBox").style.display = s.phase === "lobby" ? "" : "none";
  // Перерисовываем, только если список изменился
  const key = JSON.stringify(s.packs) + s.pack_file;
  if (key === lastPacks) return;
  lastPacks = key;
  packs = s.packs;
  // Загрузили другой пак — выбираем его; выбранный удалили — берём загруженный или первый
  if (s.pack_file && s.pack_file !== loadedPack) selectedPack = s.pack_file;
  loadedPack = s.pack_file;
  if (!packs.some(p => p.file === selectedPack)) selectedPack = loadedPack || (packs[0] ? packs[0].file : "");
  drawPackPicker();
}

function drawPackPicker() {
  const cur = packs.find(p => p.file === selectedPack);
  $("#packCurrent").textContent = cur ? packLabel(cur) : "Нет паков — добавьте .siq";
  $("#packCurrent").disabled = !packs.length;
  $("#loadPack").disabled = !cur;
  $("#packList").innerHTML = packs.map(p => `
    <div class="pack-row ${p.file === selectedPack ? "on" : ""}" data-file="${esc(p.file)}" role="option">
      <span class="pack-name">${esc(packLabel(p))}</span>
      ${p.file === loadedPack ? '<span class="pack-tag">в игре</span>' : ""}
      <button type="button" class="pack-del" title="Удалить пак" aria-label="Удалить пак ${esc(p.file)}">✕</button>
    </div>`).join("");
}

function togglePackList(open) {
  const list = $("#packList");
  list.hidden = open === undefined ? !list.hidden : !open;
  $("#packCurrent").classList.toggle("open", !list.hidden);
}

$("#packCurrent").addEventListener("click", () => togglePackList());

$("#packList").addEventListener("click", e => {
  const row = e.target.closest(".pack-row");
  if (!row) return;
  const file = row.dataset.file;
  if (e.target.closest(".pack-del")) {
    // Крестик: удаляем пак с сервера насовсем
    const p = packs.find(x => x.file === file);
    if (confirm(`Удалить пак «${p ? packLabel(p) : file}» насовсем?

Файл сотрётся с сервера, вернуть его будет нельзя.`)) {
      api.send({ type: "delete_pack", file });
    }
    return;
  }
  // Щелчок по строке — выбираем пак
  selectedPack = file;
  drawPackPicker();
  togglePackList(false);
});

// Щелчок мимо списка или Esc — закрываем список
document.addEventListener("click", e => { if (!e.target.closest("#packPicker")) togglePackList(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape") togglePackList(false); });

$("#loadPack").addEventListener("click", () => {
  if (selectedPack) api.send({ type: "select_pack", file: selectedPack });
});

// Загрузка .siq через браузер
/* Загрузка .siq через браузер.
   Используем XMLHttpRequest, а не fetch: только он сообщает, сколько уже отправлено, —
   ведущий видит проценты и не закрывает страницу, пока большой пак не дошёл. */
function uploadPack(file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", BASE + "api/upload" + (pin ? "?pin=" + encodeURIComponent(pin) : ""));
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) setUploadState(`Загружаю ${file.name}: ${Math.floor(e.loaded / e.total * 100)}%`);
    };
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)); }
      catch (err) { reject(new Error(xhr.status === 403 ? "Нет прав ведущего" : `Сервер ответил ошибкой ${xhr.status}`)); }
    };
    xhr.onerror = () => reject(new Error("Связь оборвалась во время загрузки. Попробуйте ещё раз и не закрывайте страницу, пока не дойдёт до 100%"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

// Строка состояния загрузки под кнопками (пустая строка — спрятать)
function setUploadState(text) {
  const el = $("#uploadState");
  el.textContent = text;
  el.style.display = text ? "" : "none";
}

$("#upload").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  setUploadState(`Загружаю ${file.name}: 0%`);
  try {
    const j = await uploadPack(file);
    if (j.ok) { toast("Пак добавлен"); api.send({ type: "select_pack", file: j.file }); }
    else toast(j.msg, true);
  } catch (err) { toast(err.message, true); }
  setUploadState("");
});

/* ---------- Настройки ---------- */
function renderSettings(s) {
  document.querySelectorAll("[data-set]").forEach(inp => {
    if (document.activeElement === inp) return;   // не мешаем, пока ведущий печатает
    const v = s.settings[inp.dataset.set];
    if (inp.type === "checkbox") inp.checked = !!v; else inp.value = v;
  });
}
document.querySelectorAll("[data-set]").forEach(inp => inp.addEventListener("change", () => {
  const v = inp.type === "checkbox" ? inp.checked : +inp.value;
  api.send({ type: "settings", values: { [inp.dataset.set]: v } });
}));
$("#hostSound").addEventListener("change", e => {
  hostSound = e.target.checked;
  if (hostSound) Sound.init();
  view.applyMute();
});

/* ---------- Горячие клавиши ---------- */
document.addEventListener("keydown", e => {
  if (!state || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) || e.repeat) return;
  const p = state.phase;
  const k = e.code;
  if (k === "KeyP" && !["lobby", "game_over"].includes(p)) return api.send({ type: state.paused ? "resume" : "pause" });
  if (state.paused) return;
  if (p === "answering" && (k === "Digit1" || k === "Numpad1")) api.send({ type: "judge", correct: true });
  else if (p === "answering" && (k === "Digit2" || k === "Numpad2")) api.send({ type: "judge", correct: false });
  else if ((p === "reading" || p === "intro") && k === "KeyO") api.send({ type: "unlock_now" });
  else if (p === "reveal" && k === "KeyN") api.send({ type: "to_board" });
  else if (p === "round_intro" && k === "KeyN") api.send({ type: "skip_intro" });
  else if (["intro", "reading", "answering"].includes(p) && k === "KeyS") api.send({ type: "skip" });
});

document.addEventListener("pointerdown", () => Sound.init(), { once: true });
start();
