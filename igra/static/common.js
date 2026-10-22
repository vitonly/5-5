/* =========================================================
   Общий код для страниц игрока, ведущего и табло:
   - подключение к серверу (WebSocket) с автопереподключением;
   - звуковые эффекты (генерируются в браузере, файлы не нужны);
   - отрисовка табло, вопроса, ответа, игроков, таймера,
     особых вопросов (кот, аукцион, финал) и паузы.
   ========================================================= */

// Экранирование текста, чтобы вопрос с символами < > не ломал страницу
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function $(sel, root = document) { return root.querySelector(sel); }

// Короткое всплывающее сообщение внизу экрана
function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " err" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Названия типов вопросов для плашек
// Максимум символов в письменном ответе игрока (сервер обрезает так же — game.py ANSWER_MAX)
const ANSWER_MAX = 200;
const QTYPE_LABEL = { secret: "Кот в мешке", stake: "Аукцион", norisk: "Вопрос без риска", forall: "Вопрос для всех", final: "Финал" };

/* ---------- Подключение к серверу ----------
   role: 'player' | 'host' | 'screen'
   onMessage(msg) вызывается на каждое сообщение сервера.
   Если связь пропала — переподключаемся через секунду. */
// Папка, в которой открыта игра: "/" дома или в классе, "/igra/" на сайте.
// Все адреса строим от неё, чтобы игра работала по любому пути.
const BASE = location.pathname.replace(/[^/]*$/, "");

function connect(role, onMessage, extraQuery = "", onOpen = null) {
  const api = { ws: null, send(obj) { if (api.ws && api.ws.readyState === 1) api.ws.send(JSON.stringify(obj)); } };
  const dot = document.getElementById("conn");
  function open() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}${BASE}ws?role=${role}${extraQuery}`);
    api.ws = ws;
    ws.onopen = () => { dot && dot.classList.add("on"); onOpen && onOpen(); };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      // Пинг отвечаем мгновенно — сервер так измеряет задержку сети
      if (msg.type === "ping") { api.send({ type: "pong", t: msg.t }); return; }
      onMessage(msg);
    };
    ws.onclose = () => {
      dot && dot.classList.remove("on");
      if (!api.stopped) setTimeout(open, 1000);
    };
  }
  open();
  return api;
}

/* ---------- Звуки ----------
   Синтезируем простые сигналы через Web Audio API. */
const Sound = {
  ctx: null,
  enabled: true,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  // Один тон: частота (можно «скольжение» до freq2), длительность, форма волны, задержка, громкость
  tone(freq, dur, type = "sine", delay = 0, vol = 0.18, freq2 = null) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  play(name) {
    switch (name) {
      case "buzz": this.tone(880, 0.12, "square", 0, .12); this.tone(1320, 0.25, "square", 0.1, .12); break;
      case "correct": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "triangle", i * 0.09)); break;
      case "wrong": this.tone(220, 0.35, "sawtooth", 0, .12); this.tone(165, 0.5, "sawtooth", 0.2, .12); break;
      case "open": this.tone(1200, 0.08, "sine", 0, .1); break;
      case "falstart": this.tone(140, 0.25, "square", 0, .14); break;
      case "pick": this.tone(660, 0.08, "triangle"); this.tone(990, 0.12, "triangle", 0.07); break;
      case "round": [392, 523, 659].forEach((f, i) => this.tone(f, 0.4, "triangle", i * 0.12, .15)); break;
      case "secret": this.tone(500, 0.3, "triangle", 0, .15, 900); this.tone(900, 0.4, "triangle", 0.3, .15, 450); break;
      case "auction": [0, 0.18, 0.36].forEach(d => this.tone(180, 0.12, "square", d, .14)); break;
      case "norisk": [784, 988, 1175].forEach((f, i) => this.tone(f, 0.3, "sine", i * 0.1, .12)); break;
      case "allin": this.tone(300, 0.6, "sawtooth", 0, .1, 1200); break;
      case "appeal": this.tone(700, 0.15, "square", 0, .1); this.tone(700, 0.15, "square", 0.25, .1); break;
      case "pause": this.tone(600, 0.2, "sine", 0, .12, 300); break;
      case "resume": this.tone(300, 0.2, "sine", 0, .12, 600); break;
    }
  },
};

/* ---------- Таймер-полоска ----------
   Сервер присылает, сколько осталось секунд. Дальше анимируем локально.
   На паузе полоска замирает. */
class TimerBar {
  constructor(el) { this.el = el; this.bar = el.querySelector("i"); this.end = 0; this.total = 1; this.frozen = null; this.loop(); }
  set(timer) {
    if (!timer) { this.end = 0; this.frozen = null; this.el.classList.remove("on"); return; }
    this.total = timer.total * 1000;
    this.frozen = timer.paused ? timer.left * 1000 : null;
    this.end = performance.now() + timer.left * 1000;
    this.el.classList.add("on");
  }
  loop() {
    const left = this.frozen !== null ? this.frozen : Math.max(0, this.end - performance.now());
    const k = this.total ? Math.min(1, left / this.total) : 0;
    this.bar.style.transform = `scaleX(${k})`;
    this.bar.style.backgroundPosition = `${k * 100}% 0`;
    requestAnimationFrame(() => this.loop());
  }
}

/* ---------- Игроки внизу ---------- */
function renderPlayers(el, state, meId = null, opts = {}) {
  const list = state.players.filter(p => p.online || p.score !== 0 || opts.showOffline);
  el.innerHTML = list.map(p => `
    <div class="chip ${p.id === state.chooser ? "chooser" : ""} ${p.id === state.answerer ? "answerer" : ""}
                ${p.excluded ? "out" : ""} ${p.online ? "" : "offline"} ${p.id === meId ? "me" : ""}" data-pid="${p.id}">
      <div class="n">${p.photo ? `<img class="ava" src="${esc(p.photo)}" alt="">` : ""}${esc(p.name)}</div>
      <div class="s ${p.score < 0 ? "neg" : ""}">${p.score}</div>
    </div>`).join("");
}

// Подсветить игрока (верно — зелёным, неверно — красным)
function flashPlayer(el, pid, ok) {
  const chip = el.querySelector(`.chip[data-pid="${pid}"]`);
  if (!chip) return;
  chip.classList.remove("flash-ok", "flash-bad");
  void chip.offsetWidth; // перезапуск анимации
  chip.classList.add(ok ? "flash-ok" : "flash-bad");
}

function playerName(state, pid) {
  const p = state.players.find(p => p.id === pid);
  return p ? p.name : "—";
}

function playerScore(state, pid) {
  const p = state.players.find(p => p.id === pid);
  return p ? p.score : 0;
}

/* ---------- Пауза: затемнение поверх страницы ---------- */
function renderPause(state) {
  let ov = document.getElementById("pauseOverlay");
  if (state.paused && !ov) {
    ov = document.createElement("div");
    ov.id = "pauseOverlay";
    ov.className = "pause-overlay";
    ov.innerHTML = `<div class="mega zoom-in">Пауза</div><div class="sub">Ведущий скоро продолжит игру</div>`;
    document.body.appendChild(ov);
  } else if (!state.paused && ov) {
    ov.remove();
  }
}

/* =========================================================
   GameView — рисует центральную часть экрана по состоянию игры.
   Чтобы звук и видео не перезапускались при каждом обновлении,
   DOM пересоздаётся только при смене «экрана» (ключ view),
   а внутри экрана меняются лишь отдельные части.
   options:
     role       — 'player' | 'host' | 'screen'
     meId()     — id текущего игрока (для игрока)
     onChoose(t, q) — клик по клетке табло (если разрешено)
     canChoose(state) — можно ли сейчас кликать по табло
     onRemoveTheme(t), canRemove(state) — вычёркивание темы в финале
     muted()    — выключить звук медиа на этой странице
     onMediaEnded() — всё медиа вопроса доиграло (нужно ведущему)
   ========================================================= */
/* =========================================================
   Длинный текст в окне вопроса/ответа
   1) Сначала уменьшаем шрифт, пока текст не влезет в карточку.
   2) Если даже на минимальном шрифте не влезает — включаем медленную
      прокрутку снизу вверх (скорость — «Прокрутка длинного текста» в настройках ведущего).
      Колесом мыши / пальцем можно листать вручную, автопрокрутка на время замирает.
   ========================================================= */
/* Невидимый заполнитель под ещё не пришедший текст вопроса: держит место,
   чтобы текст не «прыгал». Похож на обычные слова — переносы почти такие же. */
function filler(n) {
  if (n <= 0) return "";
  return "оооооо ".repeat(Math.ceil(n / 7)).slice(0, n);
}

const FIT_MIN_PX = 20;          // мельче этого шрифт не делаем — дальше прокрутка
const FIT_TEXT_SEL = ".q-text, .answer-text";

function fitTextInBox(box) {
  const els = [...box.querySelectorAll(FIT_TEXT_SEL)];
  els.forEach(el => { el.style.fontSize = ""; });          // вернуть размер из CSS
  box.classList.remove("overflowing");
  if (!els.length) return false;
  const fits = () => box.scrollHeight <= box.clientHeight + 1;
  if (fits()) return false;

  // Базовые размеры из CSS (у разных элементов разные)
  const base = els.map(el => parseFloat(getComputedStyle(el).fontSize) || 24);
  const apply = k => els.forEach((el, i) => { el.style.fontSize = Math.max(FIT_MIN_PX, base[i] * k) + "px"; });
  const kMin = Math.min(1, FIT_MIN_PX / Math.max(...base));

  apply(kMin);
  if (!fits()) { box.classList.add("overflowing"); return true; }   // не влезает даже мелко
  // Двоичный поиск самого крупного шрифта, при котором всё влезает
  let lo = kMin, hi = 1;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    apply(mid);
    if (fits()) lo = mid; else hi = mid;
  }
  apply(lo);
  return false;
}

class AutoScroller {
  // el — карточка с overflow; getSpeed() — пикселей в секунду;
  // follow() — нижняя граница уже «напечатанного» текста внутри карточки (или null, если печать закончена)
  constructor(el, getSpeed, follow) {
    this.el = el; this.getSpeed = getSpeed; this.follow = follow;
    this.state = "wait";                          // wait → scroll → end → (к началу) → wait …
    this.until = performance.now() + 2500;        // сначала даём прочитать начало
    this.last = performance.now();
    this.pos = 0;
    this.alive = true;
    // Ведущий/игрок листает сам — автопрокрутка замирает на 6 секунд и продолжает с этого места
    const hold = () => { this.state = "wait"; this.until = performance.now() + 6000; this.pos = this.el.scrollTop; };
    el.addEventListener("wheel", hold, { passive: true });
    el.addEventListener("pointerdown", hold);
    el.addEventListener("touchstart", hold, { passive: true });
    requestAnimationFrame(this.tick);
  }
  tick = (now) => {
    if (!this.alive || !this.el.isConnected) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const el = this.el;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);

    if (this.state === "wait" && now >= this.until) this.state = "scroll";
    if (this.state === "scroll") {
      // Пока текст «печатается», не уезжаем ниже напечатанного
      const typed = this.follow ? this.follow() : null;
      const cap = typed == null ? max : Math.min(max, Math.max(0, typed - el.clientHeight * 0.75));
      if (this.pos < cap) {
        this.pos = Math.min(cap, this.pos + Math.max(5, this.getSpeed()) * dt);
        el.scrollTop = this.pos;
      } else if (typed == null && this.pos >= max - 0.5) {
        this.state = "end"; this.until = now + 4000;     // дочитали — стоим 4 секунды
      }
    }
    if (this.state === "end" && now >= this.until) {
      el.scrollTo({ top: 0, behavior: "smooth" });       // и плавно к началу, по кругу
      this.pos = 0; this.state = "wait"; this.until = now + 3000;
    }
    requestAnimationFrame(this.tick);
  };
  stop() { this.alive = false; }
}

class GameView {
  constructor(stage, options) {
    this.stage = stage;
    this.o = options;
    // Окно поменяло размер (проектор, полноэкранный режим) — подгоняем текст заново
    let rt = null;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => this.fitCard(), 150); });
    this.key = null;
    this.state = null;
    this.mediaEls = [];
    this.answerMedia = [];
  }

  update(state) {
    const prev = this.state;
    this.state = state;
    // Скорость автопрокрутки длинного текста, пикселей в секунду (настройка ведущего)
    this.scrollSpeed = (state.settings && state.settings.scroll_speed) || 30;
    const key = this.viewKey(state);
    if (key !== this.key) {
      this.stopMedia();
      this.key = key;
      this.build(state, prev);
    }
    this.refresh(state, prev);
    this.applyPause(state);
  }

  // Какой «экран» сейчас показываем
  viewKey(s) {
    const r = s.round ? s.round.num : 0;
    const cell = s.question ? s.question.cell.join(",") : (s.question_preview ? "p" : "");
    switch (s.phase) {
      case "lobby": return "lobby";
      case "round_intro": return "rintro:" + r;
      case "board": return "board:" + r;
      case "game_over": return "over";
      case "final_themes": return "fthemes:" + r;
      case "secret_give": case "secret_price": return "secret:" + r + ":" + this.cellKey(s);
      case "auction": return "auction:" + r + ":" + this.cellKey(s);
      case "final_bets": return "fbets:" + r + ":" + this.cellKey(s);
      default: return s.question ? `q:${r}:${cell}` : "empty";
    }
  }

  cellKey(s) {
    // До показа вопроса номер клетки неизвестен игрокам — ключ строим по теме и цене
    if (s.secret) return s.secret.theme;
    if (s.auction) return s.auction.price + ":" + (s.auction.order || []).join("");
    return (s.bets ? "b" : "") + (s.round ? s.round.themes.filter(t => t).length : 0);
  }

  build(s, prev) {
    const st = this.stage;
    if (s.phase === "lobby") {
      st.innerHTML = `<div class="center fade-in" id="lobby"></div>`;
    } else if (s.phase === "round_intro") {
      Sound.play("round");
      // Название раунда, затем по одной появляются темы
      const themes = s.round.themes.filter(t => t.questions.length);
      st.innerHTML = `<div class="center">
          <div class="sub zoom-in">${s.round.final ? "Финальный раунд" : `Раунд ${s.round.num} из ${s.round.count}`}</div>
          <div class="mega zoom-in">${esc(s.round.name)}</div>
          <div class="intro-themes">${themes.map((t, i) =>
            `<div class="intro-theme" style="animation-delay:${0.9 + i * 0.45}s">${esc(t.name)}</div>`).join("")}</div>
        </div>`;
    } else if (s.phase === "board") {
      st.innerHTML = `<div class="board-wrap fade-in"><div class="board-hint" id="hint"></div><div class="board" id="board"></div></div>`;
    } else if (s.phase === "final_themes") {
      st.innerHTML = `<div class="center fade-in">
          <div class="type-badge final">Финал</div>
          <div class="board-hint" id="hint"></div>
          <div class="final-themes" id="fthemes"></div></div>`;
    } else if (s.phase === "secret_give" || s.phase === "secret_price") {
      st.innerHTML = `<div class="center">
          <div class="type-badge secret zoom-in">Кот в мешке</div>
          <div class="special-card zoom-in">
            <div class="sc-label">Тема</div><div class="sc-theme">${esc(s.secret.theme)}</div>
            <div class="sc-value" id="secretValue"></div>
          </div>
          <div class="board-hint" id="hint"></div></div>`;
    } else if (s.phase === "auction") {
      st.innerHTML = `<div class="center">
          <div class="type-badge stake zoom-in">Аукцион</div>
          <div class="sub" id="aucTheme"></div>
          <div class="auction-table" id="auction"></div>
          <div class="board-hint" id="hint"></div></div>`;
    } else if (s.phase === "final_bets") {
      st.innerHTML = `<div class="center">
          <div class="type-badge final zoom-in">Финал</div>
          <div class="special-card zoom-in"><div class="sc-label">Тема</div><div class="sc-theme" id="fbTheme"></div></div>
          <div class="board-hint">Финалисты делают ставки</div>
          <div class="written-row" id="betsRow"></div></div>`;
    } else if (s.phase === "game_over") {
      const rows = [...s.players].filter(p => p.online || p.score !== 0).sort((a, b) => b.score - a.score);
      st.innerHTML = `<div class="center">
          <div class="mega zoom-in">Итоги</div>
          <div class="podium">${rows.map((p, i) => `
            <div class="row fade-in" style="animation-delay:${i * 0.12}s">
              <div class="place">${1 + rows.filter(o => o.score > p.score).length}</div><div class="name">${esc(p.name)}</div><div class="score">${p.score}</div>
            </div>`).join("")}</div>
        </div>`;
    } else if (s.question) {
      this.buildQuestion(s);
    } else {
      st.innerHTML = "";
    }
  }

  // Обновления внутри текущего экрана
  refresh(s, prev) {
    if (s.phase === "lobby") this.refreshLobby(s);
    if (s.phase === "board") this.refreshBoard(s);
    if (s.phase === "final_themes") this.refreshFinalThemes(s);
    if (s.phase === "secret_give" || s.phase === "secret_price") this.refreshSecret(s);
    if (s.phase === "auction") this.refreshAuction(s);
    if (s.phase === "final_bets") this.refreshBets(s);
    if (s.question && this.key.startsWith("q:")) this.refreshQuestion(s, prev);
  }

  refreshLobby(s) {
    const el = $("#lobby", this.stage);
    if (!el || !this.o.renderLobby) return;
    this.o.renderLobby(el, s);
  }

  /* ---------- Табло ---------- */
  refreshBoard(s) {
    const board = $("#board", this.stage), hint = $("#hint", this.stage);
    if (!board) return;
    const themes = s.round.themes;
    const cols = Math.max(1, ...themes.map(t => t.questions.length));
    const clickable = this.o.canChoose ? this.o.canChoose(s) : false;
    board.className = "board" + (clickable ? " clickable" : "");
    board.style.gridTemplateColumns = `minmax(120px, 1.7fr) repeat(${cols}, 1fr)`;
    let html = "";
    themes.forEach((t, ti) => {
      html += `<div class="theme">${esc(t.name)}</div>`;
      for (let qi = 0; qi < cols; qi++) {
        const q = t.questions[qi];
        if (!q) { html += `<div class="cell played"></div>`; continue; }
        html += `<div class="cell ${q.played ? "played" : ""}" data-t="${ti}" data-q="${qi}">${q.played ? "" : q.price}</div>`;
      }
    });
    const cacheKey = html + clickable;
    if (board._html !== cacheKey) {   // перерисовываем, только если табло или право выбора изменились
      board._html = cacheKey;
      board.innerHTML = html;
      if (clickable) {
        board.querySelectorAll(".cell:not(.played)").forEach(c => {
          c.addEventListener("click", () => {
            c.classList.add("picked");
            Sound.play("pick");
            this.o.onChoose(+c.dataset.t, +c.dataset.q);
          });
        });
      }
    }
    // Подсказка, чья очередь выбирать
    const me = this.o.meId ? this.o.meId() : null;
    if (hint) {
      if (me && s.chooser === me) { hint.className = "board-hint me"; hint.innerHTML = "Ваш выбор! Нажмите на вопрос"; }
      else if (s.chooser) { hint.className = "board-hint"; hint.innerHTML = `Выбирает <b>${esc(playerName(s, s.chooser))}</b>`; }
      else { hint.className = "board-hint"; hint.innerHTML = "Вопрос выбирает ведущий"; }
    }
  }

  /* ---------- Финал: вычёркивание тем ---------- */
  refreshFinalThemes(s) {
    const box = $("#fthemes", this.stage), hint = $("#hint", this.stage);
    const can = this.o.canRemove ? this.o.canRemove(s) : false;
    const html = s.final.themes.map(t => `
      <div class="ftheme ${t.removed ? "removed" : ""} ${can && !t.removed ? "clickable" : ""}" data-t="${t.index}">${esc(t.name)}</div>`).join("");
    if (box._html !== html) {
      box._html = html;
      box.innerHTML = html;
      if (can) box.querySelectorAll(".ftheme.clickable").forEach(el =>
        el.addEventListener("click", () => { Sound.play("pick"); this.o.onRemoveTheme(+el.dataset.t); }));
    }
    const me = this.o.meId ? this.o.meId() : null;
    if (me && s.final.turn === me) { hint.className = "board-hint me"; hint.textContent = "Ваш ход: нажмите на тему, чтобы её убрать"; }
    else { hint.className = "board-hint"; hint.innerHTML = `Убирает тему: <b>${esc(playerName(s, s.final.turn))}</b>`; }
  }

  /* ---------- Кот в мешке ---------- */
  refreshSecret(s) {
    const hint = $("#hint", this.stage), val = $("#secretValue", this.stage);
    const me = this.o.meId ? this.o.meId() : null;
    const sec = s.secret;
    if (s.phase === "secret_give") {
      val.textContent = "";
      if (me && sec.giver === me) { hint.className = "board-hint me"; hint.textContent = "Вы отдаёте кота! Выберите игрока внизу"; }
      else if (sec.giver) { hint.className = "board-hint"; hint.innerHTML = `<b>${esc(playerName(s, sec.giver))}</b> решает, кому отдать кота`; }
      else { hint.className = "board-hint"; hint.textContent = "Ведущий решает, кому отдать кота"; }
    } else {
      val.textContent = "Цена: " + sec.options.join(" / ");
      if (me && sec.to === me) { hint.className = "board-hint me"; hint.textContent = "Кот достался вам! Выберите цену внизу"; }
      else { hint.className = "board-hint"; hint.innerHTML = `Кот достался <b>${esc(playerName(s, sec.to))}</b>. Выбирает цену…`; }
    }
  }

  /* ---------- Аукцион ---------- */
  refreshAuction(s) {
    const a = s.auction, box = $("#auction", this.stage), hint = $("#hint", this.stage);
    $("#aucTheme", this.stage).textContent = `Номинал ${a.price}`;
    const me = this.o.meId ? this.o.meId() : null;
    box.innerHTML = a.order.map(pid => {
      const b = a.bids[pid];
      const isHigh = a.high && a.high[0] === pid;
      const txt = b === "pass" ? "пас" : (b !== undefined ? (b >= playerScore(s, pid) && b > a.price ? `ва-банк ${b}` : b) : "—");
      return `<div class="auc-row ${pid === a.turn ? "turn" : ""} ${isHigh ? "high" : ""} ${b === "pass" ? "pass" : ""}">
        <span class="nm">${esc(playerName(s, pid))}</span><span class="sc">${playerScore(s, pid)}</span><span class="bid">${txt}</span></div>`;
    }).join("");
    if (me && a.turn === me) { hint.className = "board-hint me"; hint.textContent = "Ваш ход: ставка, ва-банк или пас — внизу"; }
    else { hint.className = "board-hint"; hint.innerHTML = `Ходит <b>${esc(playerName(s, a.turn))}</b>` + (a.high ? ` · лидер ${esc(playerName(s, a.high[0]))}: ${a.high[1]}` : ""); }
  }

  /* ---------- Финал: ставки ---------- */
  refreshBets(s) {
    const prev = s.question_preview;
    const themeEl = $("#fbTheme", this.stage);
    // Тему финального вопроса знают все: берём её из списка оставшихся тем
    themeEl.textContent = s.final_theme || (prev ? prev.theme : "");
    const row = $("#betsRow", this.stage);
    row.innerHTML = (s.finalists || []).map(pid => `
      <div class="wchip ${s.bets.done.includes(pid) ? "done" : ""}"><span>${esc(playerName(s, pid))}</span><b>${s.bets.done.includes(pid) ? "✓" : "…"}</b></div>`).join("");
  }

  /* ---------- Вопрос ---------- */
  buildQuestion(s) {
    const q = s.question;
    this.mediaEls = [];
    this.answerMedia = [];
    this.answerBuilt = false;
    this.started = false;
    this.typer = null;
    const label = QTYPE_LABEL[q.qtype];
    const priceTxt = q.qtype === "final" ? "" : q.price;
    this.stage.innerHTML = `
      <div class="center" id="introCard">
        ${label ? `<div class="type-badge ${q.qtype} zoom-in">${label}</div>` : ""}
        <div class="intro-card zoom-in"><div class="theme-name">${esc(q.theme)}</div>${priceTxt !== "" ? `<div class="price">${priceTxt}</div>` : ""}</div>
      </div>
      <div class="center" id="qView" style="display:none">
        <div class="q-head">${label ? `<span class="type-badge small ${q.qtype}">${label}</span>` : ""}
          <span class="t">${esc(q.theme)}</span><span class="p">${priceTxt}</span>
          <span class="banner" id="banner" style="display:none"></span></div>
        <div class="q-card" id="qCard">
          <div id="qContent" style="display:contents"></div>
          <div id="aContent" style="display:none"></div>
        </div>
        <div class="written-row" id="writtenRow"></div>
      </div>`;
    // Вопрос рисуем сразу, но скрыто — медиа успевают подгрузиться за время заставки
    this.mediaEls = this.renderItems($("#qContent", this.stage), q.content);
    this.textEls = [...this.stage.querySelectorAll("#qContent .q-text")];
    this.stage.querySelectorAll("#qContent img").forEach(img => img.addEventListener("load", () => this.fitCard(), { once: true }));
  }

  // Рисует список элементов (текст/картинка/звук/видео). Возвращает медиа-элементы.
  renderItems(container, items) {
    const media = [];
    // len — полная длина текста: пока вопрос «печатается», игрокам приходит только начало
    const textLen = items.filter(i => i.type === "text").reduce((n, i) => n + (i.len ?? i.value.length), 0);
    for (const it of items) {
      if (it.type === "text") {
        const d = document.createElement("div");
        d.className = "q-text" + (textLen > 160 ? " long" : "");
        d._full = it.value;                       // сколько текста уже знаем
        d._len = it.len ?? it.value.length;       // сколько будет всего
        d.textContent = it.value;
        container.appendChild(d);
      } else if (it.type === "image") {
        const box = document.createElement("div");
        box.className = "q-media";
        box.innerHTML = `<img src="${esc(it.value)}" alt="">`;
        container.appendChild(box);
      } else if (it.type === "audio") {
        const box = document.createElement("div");
        box.className = "q-media";
        box.innerHTML = `<div class="sound-icon paused"><i></i><i></i><i></i><i></i><i></i></div>`;
        const a = new Audio();
        a.preload = "auto"; a.src = it.value;
        a._icon = box.firstElementChild;
        container.appendChild(box);
        media.push(a);
      } else if (it.type === "video") {
        const box = document.createElement("div");
        box.className = "q-media";
        const v = document.createElement("video");
        v.preload = "auto"; v.playsInline = true; v.src = it.value;
        box.appendChild(v);
        container.appendChild(box);
        media.push(v);
      }
    }
    return media;
  }

  /* Текст вопроса «печатается» с заданной скоростью (как в SIGame).
     Сервер присылает, сколько секунд уже идёт чтение, — так у всех текст появляется синхронно. */
  startTyping(q) {
    if (!this.textEls.length || !q.read_speed || q.read_elapsed == null) return;
    const start = performance.now() - q.read_elapsed * 1000;
    const speed = q.read_speed;
    const els = this.textEls;
    // Текст делаем невидимым, но место под ним сохраняем — чтобы страница не «прыгала»
    // Сразу кладём весь (пока невидимый) текст: под него должно быть место ещё до первой буквы
    els.forEach(el => {
      el.innerHTML = `<span class="typed"></span><span class="untyped">${esc(el._full + filler(el._len - el._full.length))}</span>`;
    });
    const tick = () => {
      if (this.typer !== tick) return;
      let n = Math.floor((performance.now() - start) / 1000 * speed);
      for (const el of els) {
        // Печатаем не дальше того, что уже прислал сервер; остаток — невидимый заполнитель того же размера
        const k = Math.max(0, Math.min(el._full.length, n));
        el.firstChild.textContent = el._full.slice(0, k);
        el.lastChild.textContent = el._full.slice(k) + filler(el._len - el._full.length);
        n -= el._len;
      }
      if (n < 0) requestAnimationFrame(tick); else this.typer = null;
    };
    this.typer = tick;
    requestAnimationFrame(tick);
  }

  finishTyping() {
    if (!this.textEls) return;
    this.typer = null;
    this.textEls.forEach(el => { el.textContent = el._full; });
    this.fitCard();   // теперь известен весь текст — уточняем размер шрифта
  }

  // Сервер дослал следующую часть текста вопроса
  updateKnownText(q) {
    if (!this.textEls || !q || !q.content) return;
    const texts = q.content.filter(i => i.type === "text");
    this.textEls.forEach((el, i) => {
      const t = texts[i];
      if (!t || t.value.length <= el._full.length) return;
      el._full = t.value;
      if (!this.typer) el.textContent = el._full;   // печать не идёт — показываем сразу
    });
  }

  startMedia(list, notifyEnd) {
    const muted = this.o.muted ? this.o.muted() : false;
    let left = list.length;
    const done = () => { if (--left === 0 && notifyEnd && this.o.onMediaEnded) this.o.onMediaEnded(); };
    for (const m of list) {
      m.muted = muted;
      m.onended = () => { m._icon && m._icon.classList.add("paused"); m._ended = true; done(); };
      m.onerror = done;  // файл не открылся — не держим игру
      m.onplay = () => m._icon && m._icon.classList.remove("paused");
      m.onpause = () => m._icon && m._icon.classList.add("paused");
      const p = m.play();
      if (p && p.catch) p.catch(() => {
        // Браузер запретил звук без клика — пробуем без звука, чтобы хотя бы видео шло
        m.muted = true;
        m.play().catch(() => done());
      });
    }
  }

  stopMedia() {
    for (const m of [...(this.mediaEls || []), ...(this.answerMedia || [])]) {
      try { m.onpause = null; m.pause(); m.removeAttribute("src"); m.load(); } catch (e) {}
    }
    this.mediaEls = []; this.answerMedia = [];
    this.typer = null;
    if (this.scroller) { this.scroller.stop(); this.scroller = null; }
  }

  /* Подогнать текст под карточку вопроса; если не влезает — автопрокрутка */
  fitCard() {
    const card = $("#qCard", this.stage);
    if (!card || card.offsetParent === null) return;      // карточка ещё скрыта
    const overflow = fitTextInBox(card);
    if (overflow) {
      if (!this.scroller || this.scroller.el !== card) {
        if (this.scroller) this.scroller.stop();
        card.scrollTop = 0;
        this.scroller = new AutoScroller(card, () => this.scrollSpeed, () => this.typedBottom(card));
      }
    } else if (this.scroller) {
      this.scroller.stop(); this.scroller = null; card.scrollTop = 0;
    }
  }

  // Нижняя граница уже напечатанного текста (в координатах прокрутки карточки); null — печать закончена
  typedBottom(card) {
    if (!this.typer) return null;
    const spans = [...card.querySelectorAll(".q-text .typed")].filter(sp => sp.textContent.length);
    if (!spans.length) return 0;
    const r = spans[spans.length - 1].getBoundingClientRect();
    return r.bottom - card.getBoundingClientRect().top + card.scrollTop;
  }

  // Пауза: останавливаем звук/видео, после паузы продолжаем
  applyPause(s) {
    const all = [...(this.mediaEls || []), ...(this.answerMedia || [])];
    if (s.paused && !this.pausedMedia) {
      this.pausedMedia = all.filter(m => !m.paused && !m._ended);
      this.pausedMedia.forEach(m => m.pause());
    } else if (!s.paused && this.pausedMedia) {
      this.pausedMedia.forEach(m => m.play().catch(() => {}));
      this.pausedMedia = null;
    }
  }

  // Применить новое значение «без звука» (переключатель у ведущего / настройка)
  applyMute() {
    const muted = this.o.muted ? this.o.muted() : false;
    for (const m of [...(this.mediaEls || []), ...(this.answerMedia || [])]) m.muted = muted;
  }

  refreshQuestion(s, prev) {
    const q = s.question;
    this.updateKnownText(q);
    const intro = $("#introCard", this.stage), view = $("#qView", this.stage);
    if (!view) return;
    if (s.phase === "intro") return;   // пока заставка

    intro.style.display = "none";
    view.style.display = "";

    // Первый показ вопроса — запускаем звук/видео и «печать» текста
    if (!this.started && s.phase !== "reveal") {
      this.started = true;
      view.classList.add("fade-in");
      this.startMedia(this.mediaEls, true);
      if (s.phase === "reading") this.startTyping(q);
      this.fitCard();
    }
    if (s.phase !== "reading" && this.typer) this.finishTyping();

    // Плашка состояния
    const banner = $("#banner", this.stage);
    const show = (cls, text) => { banner.style.display = ""; banner.className = "banner " + cls; banner.textContent = text; };
    if (s.phase === "answering") show("", `Отвечает: ${playerName(s, s.answerer)}`);
    else if (s.phase === "open") show("open", "Кнопки открыты!");
    else if (s.phase === "writing") show("open", "Пишем ответ!");
    else if (s.phase === "judging") show("wait", "Ведущий проверяет ответы");
    else if (s.phase === "reading") {
      if (this.o.role === "screen") banner.style.display = "none";
      else if (s.responder) show("wait", `Отвечает ${playerName(s, s.responder)}`);
      else show("wait", "Слушаем вопрос…");
    } else banner.style.display = "none";

    // Кто уже написал ответ (вопрос для всех / финал)
    const row = $("#writtenRow", this.stage);
    if (s.written && s.phase !== "reveal") {
      row.innerHTML = s.written.eligible.map(pid => {
        const done = s.written.submitted.includes(pid);
        return `<div class="wchip ${done ? "done" : ""}"><span>${esc(playerName(s, pid))}</span><b>${done ? "✓" : "…"}</b></div>`;
      }).join("");
    } else if (s.phase !== "reveal") {
      row.innerHTML = "";
    }

    // Показ ответа: прячем вопрос, показываем ответ (и все письменные ответы, если были)
    if (s.phase === "reveal" && !this.answerBuilt && q.answer !== undefined) {
      this.answerBuilt = true;
      for (const m of this.mediaEls) { try { m.pause(); } catch (e) {} }
      this.finishTyping();
      $("#qContent", this.stage).style.display = "none";
      const a = $("#aContent", this.stage);
      a.style.display = "contents";
      a.innerHTML = `<div class="answer-label zoom-in">Правильный ответ</div>
                     <div class="answer-text zoom-in">${esc(q.answer || "—")}</div>`;
      this.answerMedia = this.renderItems(a, q.answer_content || []);
      this.startMedia(this.answerMedia, false);
      // Ответ мог оказаться длинным — подгоняем шрифт заново (и ещё раз, когда догрузятся картинки)
      if (this.scroller) { this.scroller.stop(); this.scroller = null; }
      requestAnimationFrame(() => this.fitCard());   // после того, как ниже нарисуются письменные ответы
      a.querySelectorAll("img").forEach(img => img.addEventListener("load", () => this.fitCard(), { once: true }));
      if (s.written) {
        const bets = (s.bets && s.bets.all) || {};
        row.innerHTML = s.written.eligible.map((pid, i) => {
          const ok = s.written.marks[pid];
          const bet = bets[pid] !== undefined ? ` · ${ok ? "+" : "−"}${bets[pid]}` : "";
          return `<div class="wans ${ok ? "ok" : "bad"} fade-in" style="animation-delay:${0.3 + i * 0.15}s">
            <div class="wn">${esc(playerName(s, pid))}${bet}</div>
            <div class="wt">${esc(s.written.answers[pid] || "— нет ответа —")}</div></div>`;
        }).join("");
      }
    }
  }
}

/* ---------- Режим приложения ----------
   Если страница открыта в окне приложения (SvoyaIgra.exe), а не в браузере,
   у неё есть мост window.pywebview.api. Тогда добавляем кнопку «Выход»,
   потому что окно открыто на весь экран без рамки. */
function isApp() { return !!(window.pywebview && window.pywebview.api); }

function setupAppMode() {
  if (!isApp() || document.getElementById("appExit")) return;
  const bar = document.querySelector(".topbar");
  if (!bar) return;
  const b = document.createElement("button");
  b.id = "appExit";
  b.className = "btn ghost small";
  b.textContent = "Выход ✕";
  b.onclick = () => { if (confirm("Выйти из игры?")) window.pywebview.api.quit(); };
  bar.appendChild(b);
  document.dispatchEvent(new Event("appmode"));
}
window.addEventListener("pywebviewready", setupAppMode);
document.addEventListener("DOMContentLoaded", setupAppMode);
