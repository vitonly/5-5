/* =========================================================
   Редактор паков для «Своей игры».

   Как устроено:
   - пак — это обычный объект: раунды → темы → вопросы (см. siq_write.py);
   - всё, что ведущий меняет, сразу пишется в этот объект,
     а через секунду после последнего изменения пак сохраняется на сервер;
   - картинки можно вставлять из буфера обмена (Ctrl+V), перетаскивать
     мышкой или выбирать кнопкой «Файл». Файл сразу загружается на сервер,
     а в пак записывается только его имя.
   ========================================================= */

/* ---------- Состояние ---------- */
let pin = sessionStorage.getItem("editorPin") || "";
let siteMode = false;
let draftId = null;     // номер открытого черновика
let pack = null;        // сам пак
let sel = { r: 0, t: 0 };   // какая тема открыта справа (номер раунда и темы)
let activeZone = null;  // куда вставлять картинку по Ctrl+V
let saveTimer = null;
let dirty = false;      // есть несохранённые изменения

const KINDS = [
  ["simple", "Обычный"],
  ["secret", "Кот в мешке"],
  ["secretNoQuestion", "Кот без вопроса"],
  ["stake", "Аукцион"],
  ["noRisk", "Без риска"],
  ["forAll", "Для всех"],
];

/* ---------- Маленький помощник для создания элементов ----------
   h("button", { class: "btn", onclick: f }, "Текст") — создаёт <button class="btn">Текст</button> */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Переставить элемент массива на d позиций (−1 — вверх, +1 — вниз)
function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

/* ---------- Запросы к серверу ---------- */
function withPin(url) {
  return pin ? url + (url.includes("?") ? "&" : "?") + "pin=" + encodeURIComponent(pin) : url;
}

async function api(path, opts = {}) {
  const r = await fetch(withPin(BASE + path), opts);
  if (r.status === 403) {
    askPin();
    throw new Error("Нет доступа");
  }
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* сервер прислал текст ошибки */ }
  if (!r.ok || (data && data.ok === false)) throw new Error((data && data.msg) || text || "Ошибка сервера");
  return data;
}

function askPin() {
  if (siteMode) {
    showModal("Нет доступа", h("p", {}, "Редактор открывается только админу сайта. Войдите на сайт под своим аккаунтом."));
    return;
  }
  $("#pinBox").style.display = "";
  $("#pinInput").value = "";
  $("#pinInput").focus();
}

$("#pinForm").addEventListener("submit", e => {
  e.preventDefault();
  pin = $("#pinInput").value.trim();
  sessionStorage.setItem("editorPin", pin);
  $("#pinBox").style.display = "none";
  route();
});

function showModal(title, body) {
  $("#modalTitle").textContent = title;
  $("#modalBody").replaceChildren(body);
  $("#modal").style.display = "";
}
$("#modalClose").addEventListener("click", () => { $("#modal").style.display = "none"; });

/* ---------- Сохранение ---------- */
function setSaveState(text, isError = false) {
  const el = $("#saveState");
  el.textContent = text;
  el.classList.toggle("err", isError);
}

// Вызываем после любого изменения пака: сохраним через секунду тишины
function changed() {
  dirty = true;
  setSaveState("Не сохранено");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1000);
}

async function save() {
  clearTimeout(saveTimer);
  if (!draftId || !dirty) return;
  dirty = false;
  setSaveState("Сохраняю…");
  try {
    await api(`api/editor/drafts/${draftId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pack),
    });
    setSaveState(dirty ? "Не сохранено" : "Сохранено ✓");
  } catch (e) {
    dirty = true;
    setSaveState("Ошибка сохранения", true);
    saveTimer = setTimeout(save, 5000);   // попробуем ещё раз
  }
}

// Не даём случайно закрыть вкладку, пока изменения не дошли до сервера
window.addEventListener("beforeunload", e => { if (dirty) { save(); e.preventDefault(); e.returnValue = ""; } });

/* ---------- Главный экран ---------- */
async function showHome() {
  draftId = null; pack = null; activeZone = null;
  if (location.hash) history.replaceState(null, "", location.pathname);
  $("#editor").style.display = "none";
  $("#editButtons").style.display = "none";
  $("#home").style.display = "";
  setSaveState("");
  try {
    const [drafts, packs] = await Promise.all([api("api/editor/drafts"), api("api/editor/packs")]);
    $("#gamePacks").replaceChildren(...packs.map(p => h("option", { value: p.file }, `${p.title}  (${p.file})`)));
    $("#btnEditGamePack").disabled = !packs.length;
    const list = $("#drafts");
    if (!drafts.length) { list.replaceChildren(h("div", { class: "muted" }, "Пока пусто. Создайте новый пак или откройте готовый.")); return; }
    list.replaceChildren(...drafts.map(d => h("div", { class: "draft" },
      h("div", { class: "grow" },
        h("div", { class: "nm" }, d.name),
        h("div", { class: "muted" },
          "изменён " + new Date(d.updated * 1000).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) +
          (d.file ? ` · в игре как «${d.file}»` : " · ещё не в игре"))),
      h("button", { class: "btn small", onclick: () => openDraft(d.id) }, "Открыть"),
      h("button", { class: "icon del", title: "Удалить черновик", onclick: () => deleteDraft(d) }, "✕"),
    )));
  } catch (e) { if (e.message !== "Нет доступа") toast(e.message, true); }
}

async function deleteDraft(d) {
  const note = d.file ? `\n\nПак «${d.file}» в игре останется, удалится только черновик.` : "";
  if (!confirm(`Удалить черновик «${d.name}»?${note}`)) return;
  await api(`api/editor/drafts/${d.id}`, { method: "DELETE" }).catch(e => toast(e.message, true));
  showHome();
}

$("#btnNew").addEventListener("click", async () => {
  try {
    const r = await api("api/editor/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    openDraft(r.id);
  } catch (e) { toast(e.message, true); }
});

$("#btnEditGamePack").addEventListener("click", async () => {
  const file = $("#gamePacks").value;
  if (!file) return;
  toast("Открываю пак…");
  try {
    const r = await api("api/editor/drafts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: file }),
    });
    openDraft(r.id);
  } catch (e) { toast(e.message, true); }
});

$("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  toast("Загружаю " + file.name + "…");
  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await api("api/editor/import", { method: "POST", body: fd });
    openDraft(r.id);
  } catch (err) { toast(err.message, true); }
});

/* ---------- Открыть черновик ---------- */
async function openDraft(id) {
  try {
    const r = await api(`api/editor/drafts/${id}`);
    draftId = id;
    pack = r.pack;
    sel = { r: 0, t: 0 };
    dirty = false;
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);   // после перезагрузки откроется он же
    $("#home").style.display = "none";
    $("#editor").style.display = "";
    $("#editButtons").style.display = "";
    setSaveState("Сохранено ✓");
    renderAll();
  } catch (e) {
    if (e.message !== "Нет доступа") { toast(e.message, true); showHome(); }
  }
}

function currentTheme() {
  const r = pack.rounds[sel.r];
  return r && r.themes[sel.t] ? { round: r, theme: r.themes[sel.t] } : null;
}

function renderAll() { renderSide(); renderMain(); }

/* ---------- Левая колонка: название пака, раунды и темы ---------- */
function renderSide() {
  const side = $("#side");
  const info = h("div", { class: "round" },
    h("label", { class: "f" }, "Название пака",
      h("input", { type: "text", value: pack.name || "", oninput: e => { pack.name = e.target.value; changed(); } })),
    h("label", { class: "f" }, "Автор",
      h("input", { type: "text", value: pack.author || "", oninput: e => { pack.author = e.target.value; changed(); } })),
  );

  const rounds = pack.rounds.map((r, ri) => h("div", { class: "round" + (r.final ? " final" : "") },
    h("div", { class: "row" },
      h("input", { type: "text", class: "grow", value: r.name, placeholder: "Название раунда",
        oninput: e => { r.name = e.target.value; changed(); } }),
    ),
    h("div", { class: "row" },
      h("label", { class: "check", title: "В финале у каждой темы один вопрос без цены, игроки делают ставки" },
        h("input", { type: "checkbox", checked: r.final, onchange: e => { r.final = e.target.checked; changed(); renderAll(); } }),
        "Финал"),
      h("div", { class: "grow" }),
      h("button", { class: "icon", title: "Выше", disabled: ri === 0, onclick: () => { move(pack.rounds, ri, -1); sel = { r: ri - 1, t: 0 }; changed(); renderAll(); } }, "↑"),
      h("button", { class: "icon", title: "Ниже", disabled: ri === pack.rounds.length - 1, onclick: () => { move(pack.rounds, ri, 1); sel = { r: ri + 1, t: 0 }; changed(); renderAll(); } }, "↓"),
      h("button", { class: "icon del", title: "Удалить раунд", onclick: () => {
        if (!confirm(`Удалить раунд «${r.name}» со всеми темами и вопросами?`)) return;
        pack.rounds.splice(ri, 1); sel = { r: 0, t: 0 }; changed(); renderAll();
      } }, "✕"),
    ),
    r.themes.map((t, ti) => h("div", {
      class: "theme-link" + (sel.r === ri && sel.t === ti ? " on" : ""),
      onclick: () => { sel = { r: ri, t: ti }; renderAll(); window.scrollTo({ top: 0 }); },
    }, t.name || "Без названия", h("span", { class: "cnt" }, t.questions.length + " вопр."))),
    h("button", { class: "btn small ghost", onclick: () => addTheme(ri) }, "+ Тема"),
  ));

  side.replaceChildren(info, ...rounds,
    h("button", { class: "btn ghost", onclick: addRound }, "+ Раунд"));
}

function newQuestion(price) {
  return { price, kind: "simple", question: [], answer_media: [], right: [], wrong: [], comment: "",
           secret_theme: "", price_min: 0, price_max: 0, price_step: 0, give_self: false };
}

function addRound() {
  const n = pack.rounds.length + 1;
  pack.rounds.push({ name: `Раунд ${n}`, final: false, themes: [] });
  addTheme(pack.rounds.length - 1);
}

function addTheme(ri) {
  const r = pack.rounds[ri];
  // Цены нового раунда: 100…500 в первом, 200…1000 во втором и т. д.
  const step = 100 * (ri + 1);
  const qs = r.final ? [newQuestion(0)] : [1, 2, 3, 4, 5].map(k => newQuestion(step * k));
  r.themes.push({ name: `Тема ${r.themes.length + 1}`, questions: qs });
  sel = { r: ri, t: r.themes.length - 1 };
  changed();
  renderAll();
}

/* ---------- Правая часть: тема и её вопросы ---------- */
function renderMain() {
  const main = $("#main");
  activeZone = null;
  const cur = currentTheme();
  if (!cur) {
    main.replaceChildren(h("div", { class: "card" }, h("div", { class: "muted" }, "Слева создайте раунд и тему.")));
    return;
  }
  const { round, theme } = cur;
  const head = h("div", { class: "card" },
    h("h2", {}, round.name + (round.final ? " · финал" : "")),
    h("div", { class: "row" },
      h("input", { type: "text", class: "grow", value: theme.name, placeholder: "Название темы", style: "font-size:20px; font-weight:800",
        oninput: e => { theme.name = e.target.value; changed(); renderSide(); } }),
      h("button", { class: "icon", title: "Тема выше", disabled: sel.t === 0, onclick: () => { move(round.themes, sel.t, -1); sel.t--; changed(); renderAll(); } }, "↑"),
      h("button", { class: "icon", title: "Тема ниже", disabled: sel.t === round.themes.length - 1, onclick: () => { move(round.themes, sel.t, 1); sel.t++; changed(); renderAll(); } }, "↓"),
      h("button", { class: "icon del", title: "Удалить тему", onclick: () => {
        if (!confirm(`Удалить тему «${theme.name}» и все её вопросы?`)) return;
        round.themes.splice(sel.t, 1); sel.t = Math.max(0, sel.t - 1); changed(); renderAll();
      } }, "✕"),
    ),
    h("div", { class: "muted" }, "Чтобы вставить картинку: скопируйте её (или сделайте скриншот Win+Shift+S), щёлкните по нужному вопросу и нажмите Ctrl+V."),
  );

  const cards = theme.questions.map((q, qi) => questionCard(theme, q, qi, round.final));
  const add = h("button", { class: "btn ghost", onclick: () => {
    const last = theme.questions[theme.questions.length - 1];
    const prev = theme.questions[theme.questions.length - 2];
    const step = last && prev ? last.price - prev.price : 100;
    theme.questions.push(newQuestion(round.final ? 0 : (last ? last.price + (step > 0 ? step : 100) : 100)));
    changed(); renderMain(); renderSide();
  } }, "+ Вопрос");
  main.replaceChildren(head, ...cards, add);
}

// Поле «список строк»: правильные/неправильные ответы, по одному на строку
function linesField(label, q, key, placeholder) {
  return h("label", { class: "f" }, label,
    h("textarea", { rows: Math.max(1, q[key].length), placeholder,
      oninput: e => { q[key] = e.target.value.split("\n").map(s => s.trim()).filter(Boolean); changed(); } },
      q[key].join("\n")));
}

function questionCard(theme, q, qi, final) {
  const qs = theme.questions;
  const isSecret = q.kind === "secret" || q.kind === "secretNoQuestion";

  const header = h("div", { class: "row" },
    h("span", { class: "num" }, qi + 1),
    final ? h("span", { class: "muted" }, "Финальный вопрос") : [
      h("label", { class: "f", style: "width:110px" }, "Цена",
        h("input", { type: "number", min: 0, step: 50, value: q.price, oninput: e => { q.price = parseInt(e.target.value, 10) || 0; changed(); } })),
      h("label", { class: "f", style: "width:190px" }, "Тип вопроса",
        h("select", { onchange: e => { q.kind = e.target.value; changed(); renderMain(); } },
          KINDS.map(([v, t]) => h("option", { value: v, selected: v === q.kind }, t)))),
    ],
    h("div", { class: "grow" }),
    h("button", { class: "icon", title: "Выше", disabled: qi === 0, onclick: () => { move(qs, qi, -1); changed(); renderMain(); } }, "↑"),
    h("button", { class: "icon", title: "Ниже", disabled: qi === qs.length - 1, onclick: () => { move(qs, qi, 1); changed(); renderMain(); } }, "↓"),
    h("button", { class: "icon", title: "Сделать копию", onclick: () => {
      qs.splice(qi + 1, 0, JSON.parse(JSON.stringify(q))); changed(); renderMain(); renderSide();
    } }, "⧉"),
    h("button", { class: "icon del", title: "Удалить вопрос", onclick: () => {
      if (!confirm(`Удалить вопрос ${qi + 1}?`)) return;
      qs.splice(qi, 1); changed(); renderMain(); renderSide();
    } }, "✕"),
  );

  // Настройки кота в мешке: своя тема и цена, которую выбирает получатель
  const secret = isSecret && !final ? h("div", { class: "secret-box" },
    h("label", { class: "f" }, "Тема кота",
      h("input", { type: "text", value: q.secret_theme, placeholder: "Например: Предметы", oninput: e => { q.secret_theme = e.target.value; changed(); } })),
    ...[["price_min", "Цена от"], ["price_max", "до"], ["price_step", "шаг"]].map(([k, t]) =>
      h("label", { class: "f" }, t,
        h("input", { type: "number", min: 0, step: 50, value: q[k] || "", placeholder: k === "price_step" ? "0" : String(q.price),
          oninput: e => { q[k] = parseInt(e.target.value, 10) || 0; changed(); } }))),
    h("label", { class: "check" },
      h("input", { type: "checkbox", checked: q.give_self, onchange: e => { q.give_self = e.target.checked; changed(); } }),
      "Можно оставить кота себе"),
  ) : null;

  const noQuestion = q.kind === "secretNoQuestion" && !final;
  return h("div", { class: "q" },
    header,
    secret,
    noQuestion ? h("div", { class: "muted" }, "Кот без вопроса: игрок, которому отдали кота, просто получает очки.") : [
      zone("Вопрос", q, "question"),
      linesField("Правильный ответ (если вариантов несколько — каждый с новой строки)", q, "right", "Например: Пудж"),
      h("details", { class: "more", open: !!(q.wrong.length || q.comment || q.answer_media.length) },
        h("summary", {}, "Дополнительно: картинка к ответу, неправильные ответы, комментарий"),
        zone("Показать вместе с ответом", q, "answer_media"),
        linesField("Неправильные ответы (подсказка ведущему, игроки их не видят)", q, "wrong", "Например: Мипо"),
        h("label", { class: "f" }, "Комментарий для ведущего",
          h("textarea", { rows: 2, oninput: e => { q.comment = e.target.value; changed(); } }, q.comment)),
      ),
    ],
  );
}

/* ---------- Зона с содержимым вопроса или ответа ----------
   Внутри — список кусочков: текст, картинка, звук, видео.
   Щелчок по зоне делает её «активной»: туда пойдёт Ctrl+V. */
function zone(title, q, key) {
  const fileInput = h("input", { type: "file", accept: "image/*,audio/*,video/*", multiple: true, hidden: true,
    onchange: e => { addFiles(z, [...e.target.files]); e.target.value = ""; } });
  const list = h("div", { style: "display:flex; flex-direction:column; gap:8px" });
  const z = h("div", { class: "zone", tabindex: 0 },
    h("div", { class: "zone-title" }, title),
    list,
    h("div", { class: "row" },
      h("button", { class: "btn small ghost", onclick: () => { q[key].push({ type: "text", value: "" }); changed(); z.render(true); } }, "+ Текст"),
      h("button", { class: "btn small ghost", onclick: () => fileInput.click() }, "+ Файл"),
      fileInput,
      h("span", { class: "hint" }, "или ", h("b", {}, "Ctrl+V"), " / перетащите картинку сюда"),
    ),
  );
  z.q = q; z.key = key;

  // Перерисовать только эту зону (focusLast — поставить курсор в новый текст)
  z.render = (focusLast = false) => {
    list.replaceChildren(...q[key].map((it, i) => itemView(z, it, i)));
    if (focusLast) { const ta = list.querySelectorAll("textarea"); ta.length && ta[ta.length - 1].focus(); }
  };
  z.render();

  const activate = () => {
    if (activeZone && activeZone !== z) activeZone.classList.remove("active");
    activeZone = z;
    z.classList.add("active");
  };
  z.addEventListener("focusin", activate);
  z.addEventListener("mousedown", activate);

  // Перетаскивание файлов мышкой
  z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("drag"); });
  z.addEventListener("dragleave", () => z.classList.remove("drag"));
  z.addEventListener("drop", e => {
    e.preventDefault();
    z.classList.remove("drag");
    activate();
    if (e.dataTransfer.files.length) addFiles(z, [...e.dataTransfer.files]);
  });
  return z;
}

function mediaUrl(name) {
  return withPin(`${BASE}api/editor/drafts/${draftId}/media/${encodeURIComponent(name)}`);
}

function itemView(z, it, i) {
  const arr = z.q[z.key];
  let body;
  if (it.type === "text") {
    body = h("textarea", { rows: 2, placeholder: "Текст вопроса",
      oninput: e => { it.value = e.target.value; grow(e.target); changed(); } }, it.value);
    requestAnimationFrame(() => grow(body));
  } else if (it.type === "image") {
    body = h("img", { src: mediaUrl(it.value), alt: "картинка" });
  } else if (it.type === "audio") {
    body = h("audio", { src: mediaUrl(it.value), controls: true, preload: "none" });
  } else {
    body = h("video", { src: mediaUrl(it.value), controls: true, preload: "metadata" });
  }
  return h("div", { class: "item" },
    h("div", { class: "body" }, body),
    h("div", { class: "tools" },
      h("button", { class: "icon", title: "Выше", disabled: i === 0, onclick: () => { move(arr, i, -1); changed(); z.render(); } }, "↑"),
      h("button", { class: "icon", title: "Ниже", disabled: i === arr.length - 1, onclick: () => { move(arr, i, 1); changed(); z.render(); } }, "↓"),
      h("button", { class: "icon del", title: "Убрать", onclick: () => { arr.splice(i, 1); changed(); z.render(); } }, "✕"),
    ),
  );
}

// Высота поля текста — по содержимому
function grow(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 4 + "px"; }

/* ---------- Загрузка файлов ---------- */
const EXT_BY_MIME = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/bmp": ".bmp",
  "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mp4": ".m4a",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };

/* Большие картинки уменьшаем прямо в браузере: скриншот на весь экран весит
   несколько мегабайт, а на проекторе разницы не видно. Анимированные GIF не трогаем. */
async function shrinkImage(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { return file; }
  const MAX = 1920;
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size < 1.5 * 1024 * 1024) return file;   // и так небольшая
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";                      // прозрачный фон станет белым (в JPEG нет прозрачности)
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.88));
  return blob && blob.size < file.size ? new File([blob], "image.jpg", { type: "image/jpeg" }) : file;
}

async function addFiles(z, files) {
  for (const original of files) {
    const kind = original.type.split("/")[0];
    if (!["image", "audio", "video"].includes(kind)) { toast(`«${original.name}» — это не картинка, звук или видео`, true); continue; }
    const note = h("div", { class: "uploading" }, "Загружаю " + (kind === "image" ? "картинку" : "файл") + "…");
    z.querySelector(".zone-title").after(note);
    try {
      const file = await shrinkImage(original);
      // У картинки из буфера обмена имя всегда «image.png» — расширение берём по типу файла
      const hasExt = /\.[a-z0-9]{2,5}$/i.test(file.name);
      const name = hasExt ? file.name : "file" + (EXT_BY_MIME[file.type] || "");
      const fd = new FormData();
      fd.append("file", file, name);
      const r = await api(`api/editor/drafts/${draftId}/media`, { method: "POST", body: fd });
      z.q[z.key].push({ type: r.type, value: r.value });
      changed();
      z.render();
    } catch (e) {
      toast("Не загрузилось: " + e.message, true);
    } finally {
      note.remove();
    }
  }
}

/* ---------- Ctrl+V: вставка из буфера обмена ----------
   Если в буфере картинка — загружаем её в активную зону.
   Если текст и курсор стоит в поле ввода — обычная вставка текста. */
document.addEventListener("paste", e => {
  if (!draftId) return;
  const files = [...(e.clipboardData?.files || [])];
  const inField = ["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName);
  if (files.length) {
    e.preventDefault();
    if (!activeZone || !document.body.contains(activeZone)) { toast("Сначала щёлкните по вопросу, куда вставить картинку", true); return; }
    addFiles(activeZone, files);
    return;
  }
  if (inField || !activeZone || !document.body.contains(activeZone)) return;
  const text = e.clipboardData.getData("text/plain").trim();
  if (text) {
    e.preventDefault();
    activeZone.q[activeZone.key].push({ type: "text", value: text });
    changed();
    activeZone.render();
  }
});

/* ---------- Кнопки шапки ---------- */
function problemsView(problems) {
  if (!problems.length) return h("p", {}, "Всё в порядке: пустых вопросов и вопросов без ответа нет.");
  const more = problems.length > 30 ? h("p", { class: "muted" }, `…и ещё ${problems.length - 30}`) : null;
  return h("div", {}, h("ul", {}, problems.slice(0, 30).map(p => h("li", {}, p))), more);
}

$("#btnCheck").addEventListener("click", async () => {
  await save();
  try {
    const r = await api(`api/editor/drafts/${draftId}/check`);
    showModal(r.problems.length ? "Что стоит поправить" : "Проверка", problemsView(r.problems));
  } catch (e) { toast(e.message, true); }
});

$("#btnPublish").addEventListener("click", async () => {
  await save();
  const b = $("#btnPublish");
  b.disabled = true;
  try {
    const r = await api(`api/editor/drafts/${draftId}/publish`, { method: "POST" });
    if (r.problems.length) {
      showModal(`Сохранено в игру как «${r.file}»`, h("div", {},
        h("p", {}, "Пак уже на пульте ведущего, но вот что стоит поправить:"), problemsView(r.problems)));
    } else {
      toast(`Готово! Пак «${r.file}» есть на пульте ведущего`);
    }
  } catch (e) { toast(e.message, true); }
  b.disabled = false;
});

$("#btnDownload").addEventListener("click", async () => {
  await save();
  // Скачиваем через невидимую ссылку — браузер сам предложит сохранить файл
  const a = h("a", { href: withPin(`${BASE}api/editor/drafts/${draftId}/download`) });
  document.body.append(a);
  a.click();
  a.remove();
});

$("#btnHome").addEventListener("click", async () => { await save(); showHome(); });

/* ---------- Запуск ---------- */
// Номер черновика хранится в адресе (#abc123…): после перезагрузки откроется тот же пак
function route() {
  const id = location.hash.slice(1);
  if (/^[a-f0-9]{12}$/.test(id)) openDraft(id); else showHome();
}

(async () => {
  try {
    const cfg = await (await fetch(BASE + "config.json")).json();
    siteMode = cfg.site;
    if (siteMode && !(cfg.user && cfg.user.admin)) { askPin(); return; }
  } catch (e) { /* сервер старой версии — работаем как дома */ }
  route();
})();
