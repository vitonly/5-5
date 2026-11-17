/** Единый источник нормализованных данных, грязных строк и ключей модуля Б. */
export type BCell = string | number | null;
export interface BCleaningCase {
  id: "exact" | "other-id" | "similar" | "platforms" | "missing-duration" | "format" | "negative";
  title: string;
  /** Первая строка всегда содержит заголовки. */
  before: string[][];
  after: string[][];
  decision: "keep" | "remove" | "partial";
  fields: string[];
  comparison: string;
  why: string;
  impact: string;
  excel: string;
}
export interface BDataset {
  teams: { id: string; name: string; players: number; roster: { id: string; name: string }[] }[];
  matches: { id: string; date: string; time: string; team1: string; team2: string; duration: number; platform?: string }[];
  incidents: { id: string; matchId: string; type: string; duration: number | null }[];
  viewers: { matchId: string; platform: string; viewers: number }[];
  rawSheets: Record<"Участники" | "Матчи" | "Инциденты" | "Зрители" | "Журнал" | "Составы команд", BCell[][]>;
  cleaningCases: BCleaningCase[];
  totals: {
    teams: number; players: number; matches: number; incidents: number; networkMinutes: number;
    knownDurations?: number;
    /** top5: длительность по убыванию, затем ID; byHour: число матчей, ключ «17»;
     * byIncident: количество событий (включая null); byPlatform: сумма наблюдений зрителей. */
    top5: string[]; byHour: Record<string, number>; byIncident: Record<string, number>; byPlatform: Record<string, number>;
  };
}

/** Не зависит от времени, локали, Math.random и порядка внешних источников. */
export function makeBDataset(seed: string, version = 1): BDataset {
  // Старые попытки без версии всегда получают прежние строки и прежний ключ.
  if (version >= 2) seed = `beginner-v2:${seed}`;
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  const next = (n: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), state | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) % n;
  };
  const names = ["Квант", "Вектор", "Феникс", "Титан", "Полюс", "Искра", "Комета", "Волна", "Атлас", "Спектр", "Орбита", "Зенит"];
  for (let i = names.length - 1; i > 0; i--) { const j = next(i + 1); [names[i], names[j]] = [names[j], names[i]]; }
  const id = (p: string, i: number) => p + String(i + 1).padStart(2, "0");
  const teams = names.slice(0, 6 + next(3)).map((name, i) => {
    const players = 5 + next(3);
    return { id: id("T", i), name, players, roster: Array.from({ length: players }, (_, j) => ({ id: `P${i + 1}-${j + 1}`, name: `${name}_${j + 1}` })) };
  });
  const platforms = ["Twitch", "YouTube", "VK Видео", "RuTube"];
  const offset = next(platforms.length);
  const startHour = version >= 2 ? 9 + next(8) : 14;
  const matches: BDataset["matches"] = Array.from({ length: 15 }, (_, i) => {
    const a = i < 2 ? 0 : next(teams.length);
    const b = i < 2 ? 1 : (a + 1 + next(teams.length - 1)) % teams.length;
    return { id: id("M", i), date: `2026-10-${String(10 + Math.floor(i / 5)).padStart(2, "0")}`,
      time: `${String(startHour + i % 5).padStart(2, "0")}:${i === 1 ? "30" : "00"}`,
      team1: teams[a].id, team2: teams[b].id, duration: 25 + next(80) };
  });
  // Почти одинаковые встречи — самостоятельные события, различается время начала.
  matches[1] = { ...matches[0], id: matches[1].id, time: `${String(startHour).padStart(2, "0")}:30` };
  // Эта встреча ссылается на повторную регистрацию T99 в сырой выгрузке.
  // Нормализованный состав события остаётся тем же после замены T99 на основной ID.
  matches[2] = { ...matches[2], team1: teams[1].id, team2: teams[0].id };
  const incidents: BDataset["incidents"] = Array.from({ length: 10 + next(4) }, (_, i) => ({
    id: id("INC", i), matchId: matches[next(matches.length)].id,
    type: i === 0 ? "Сеть" : ["Сеть", "Оборудование", "Клиент"][next(3)], duration: i === 0 ? null : 1 + next(15),
  }));
  const viewers: BDataset["viewers"] = matches.flatMap((m, i) => Array.from({ length: i === 0 ? 2 : 1 + next(2) }, (_, j) => ({
    matchId: m.id, platform: platforms[(offset + i + j) % platforms.length], viewers: 1000 + next(4500),
  })));
  if (version >= 2 && next(2)) incidents[incidents.length - 1].duration = null;
  const rawSheets: BDataset["rawSheets"] = {
    Участники: [["ID_команды", "Название", "Игроков"], ...teams.map(t => [t.id, t.name, t.players])],
    Матчи: [["ID_матча", "Дата", "Время", "Команда_1", "Команда_2", "Длительность_мин"], ...matches.map(m => [m.id, m.date, m.time, m.team1, m.team2, m.duration])],
    Инциденты: [["ID_инцидента", "ID_матча", "Тип", "Длительность_мин"], ...incidents.map(i => [i.id, i.matchId, i.type, i.duration])],
    Зрители: [["ID_матча", "Платформа", "Зрителей"], ...viewers.map(v => [v.matchId, v.platform, v.viewers])],
    Журнал: [["Лист", "Строка / ключ", "Проблема", "Действие", "Обоснование"]],
    "Составы команд": [["ID_регистрации", "ID_команды", "ID_игрока", "Ник", "Основной_ID_команды"], ...teams.flatMap(t => t.roster.map(p => [`REG-${t.id}`, t.id, p.id, p.name, t.id]))],
  };
  const cleanTeam = [...rawSheets.Участники[1]];
  const dirtyIndex = 3 + next(matches.length - 2);
  const cleanMatch = [...rawSheets.Матчи[dirtyIndex]];
  const duration = cleanMatch[5] as number;
  rawSheets.Матчи[dirtyIndex][5] = next(2) ? `${duration} мин` : `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  rawSheets.Участники[1][1] = `  ${teams[0].name.toUpperCase()}  `;
  rawSheets.Зрители[1][2] = String(viewers[0].viewers).replace(/(\d)(\d{3})$/, "$1 $2");
  const duplicate = [...rawSheets.Матчи[4]];
  rawSheets.Матчи.push([...duplicate]);
  const alias = ["T99", teams[1].name, teams[1].players];
  rawSheets.Участники.push(alias);
  const aliasRoster = teams[1].roster.map(p => ["REG-T99", "T99", p.id, p.name, teams[1].id]);
  rawSheets["Составы команд"].push(...aliasRoster);
  rawSheets.Матчи[3][3] = "T99";
  const table = (sheet: keyof typeof rawSheets, rows: BCell[][]): string[][] => [rawSheets[sheet][0], ...rows].map(r => r.map(v => v === null ? "" : String(v)));
  const cleaningCases: BCleaningCase[] = [
    { id: "exact", title: "Точный повтор строки матча", before: table("Матчи", [duplicate, duplicate]), after: table("Матчи", [duplicate]), decision: "remove", fields: rawSheets.Матчи[0].map(String), comparison: "Совпадают все поля строки", why: "Повторная выгрузка одной встречи.", impact: "Количество матчей уменьшается на 1; длительность повторно не суммируется.", excel: "Данные → Удалить дубликаты по всем столбцам." },
    { id: "other-id", title: "Команда под другим ID", before: [
      ["Источник", "ID / регистрация", "ID_команды", "ID_игрока / команда_2", "Ник / время", "Основной_ID_команды"],
      ...rawSheets["Составы команд"].slice(1).filter(r => r[1] === teams[1].id || r[1] === "T99").map(r => ["Составы команд", ...r].map(String)),
      ["Матчи", matches[2].id, "T99", matches[2].team2, matches[2].time, ""],
    ], after: [
      ["Источник", "ID / регистрация", "ID_команды", "ID_игрока / команда_2", "Ник / время", "Основной_ID_команды"],
      ...rawSheets["Составы команд"].slice(1).filter(r => r[1] === teams[1].id).map(r => ["Составы команд", ...r].map(String)),
      ["Матчи", matches[2].id, teams[1].id, matches[2].team2, matches[2].time, ""],
    ], decision: "remove", fields: ["ID_игрока", "Основной_ID_команды", "ID_команды"], comparison: "Совпадают ID всех игроков; реестр явно указывает основной ID", why: `Регистрации REG-T99 и REG-${teams[1].id} содержат один набор ID игроков и ссылаются на основной ID ${teams[1].id}. Матч ${matches[2].id} использует повторную регистрацию T99.`, impact: "Команда и игроки учитываются один раз; ссылки на T99 приводятся к " + teams[1].id + ".", excel: "Сверить наборы ID игроков и основной ID реестра; заменить T99 в связанных матчах, затем удалить повторную регистрацию и участника." },
    { id: "similar", title: "Похожие самостоятельные матчи", before: table("Матчи", rawSheets.Матчи.slice(1, 3)), after: table("Матчи", rawSheets.Матчи.slice(1, 3)), decision: "keep", fields: ["Дата", "Время", "Команда_1", "Команда_2"], comparison: "Те же команды и дата, разное время", why: "Две отдельные встречи, а не повтор строки.", impact: "Сохраняются оба матча и обе длительности.", excel: "Сравнить полный ключ события, не удалять по одной паре команд." },
    { id: "platforms", title: "Один матч на нескольких платформах", before: table("Зрители", rawSheets.Зрители.slice(1, 3)), after: table("Зрители", viewers.slice(0, 2).map(v => [v.matchId, v.platform, v.viewers])), decision: "keep", fields: ["ID_матча", "Платформа"], comparison: "ID матча совпадает, платформы различаются", why: "Зерно таблицы — матч и платформа.", impact: "Сохраняются оба наблюдения; сумма зрителей не означает уникальных людей.", excel: "Использовать составной ключ ID_матча + Платформа; число с пробелом преобразовать в числовое." },
    { id: "missing-duration", title: "Инцидент без длительности", before: table("Инциденты", [rawSheets.Инциденты[1]]), after: table("Инциденты", [rawSheets.Инциденты[1]]), decision: "partial", fields: ["ID_инцидента", "Длительность_мин"], comparison: "ID известен, длительность отсутствует", why: "Отсутствие длительности не отменяет событие и не означает ноль минут.", impact: "В количестве +1, в сумме известных минут вклада нет.", excel: "Считать по ID (СЧЁТЗ), суммировать только известную длительность; пропуск оставить пустым." },
    { id: "format", title: "Форматы текста и длительности", before: [["Сущность", "Значение"], [teams[0].id, String(rawSheets.Участники[1][1])], [String(cleanMatch[0]), String(rawSheets.Матчи[dirtyIndex][5])]], after: [["Сущность", "Значение"], [teams[0].id, String(cleanTeam[1])], [String(cleanMatch[0]), String(duration)]], decision: "partial", fields: ["Название", "Длительность_мин"], comparison: "Пробелы и регистр; минуты текстом или ч:мм", why: "Это ошибки представления значений, сущности сохраняются.", impact: "После исправления доступны корректная группировка и сумма минут.", excel: "СЖПРОБЕЛЫ и словарь названий; для ч:мм — ЧАС*60+МИНУТЫ, для текста удалить «мин» и применить ЗНАЧЕН." },
  ];
  const byHour: Record<string, number> = {}, byIncident: Record<string, number> = {}, byPlatform: Record<string, number> = {};
  for (const m of matches) { const h = String(Number(m.time.slice(0, 2))); byHour[h] = (byHour[h] ?? 0) + 1; }
  for (const i of incidents) byIncident[i.type] = (byIncident[i.type] ?? 0) + 1;
  for (const v of viewers) byPlatform[v.platform] = (byPlatform[v.platform] ?? 0) + v.viewers;
  if (version >= 2) {
    const original = rawSheets.Матчи.find(row => row[0] === matches[matches.length - 1].id)!;
    const originalDuration = matches[matches.length - 1].duration;
    // Выгрузка явно указывает исходную встречу: минус нельзя просто стереть и посчитать матч дважды.
    rawSheets.Матчи[0].push("Основной_ID_матча");
    for (const row of rawSheets.Матчи.slice(1)) row.push(row[0]);
    const bad = [...original]; bad[0] = "M99"; bad[5] = -originalDuration;
    rawSheets.Матчи.push(bad);
    cleaningCases.push({ id: "negative", title: "Отрицательные минуты в повторной записи",
      before: table("Матчи", [original, bad]), after: table("Матчи", [original]), decision: "remove",
      fields: ["Основной_ID_матча", "Дата", "Время", "Команда_1", "Команда_2"], comparison: "Реестр указывает ту же встречу; дата, время и команды совпадают",
      why: `У M99 в столбце Основной_ID_матча стоит ${original[0]}; дата, время и команды совпали. Это повторная запись с ошибкой, не новая встреча.`,
      impact: "Оставляем исходный матч один раз. Не превращаем минус в плюс без проверки.",
      excel: `На листе Матчи нажми Ctrl+F, найди M99 и ${original[0]}. Сверь Основной_ID_матча, дату, время и команды; убери только подтверждённый повтор.` });
    const platformsCase = cleaningCases.find(c => c.id === "platforms")!;
    platformsCase.why = "Один матч показали на двух площадках. У каждой свой показатель зрителей.";
    platformsCase.excel = "На листе Зрители сравни ID_матча и Платформа. Сохрани обе строки; число с пробелом введи заново без пробела.";
    const formatCase = cleaningCases.find(c => c.id === "format")!;
    formatCase.before[0][0] = "Команда или матч";
    formatCase.after[0][0] = "Команда или матч";
    formatCase.why = "Команда и матч остаются теми же. Исправляем только пробелы, название и запись числа.";
    formatCase.excel = `На листе Участники введи название «${teams[0].name}» без лишних пробелов. На листе Матчи найди ${cleanMatch[0]} через Ctrl+F и запиши ${duration} числом в Длительность_мин.`;
    // Переставляем строки после построения связанных примеров; заголовки остаются первыми.
    for (const rows of Object.values(rawSheets)) for (let i = rows.length - 1; i > 1; i--) {
      const j = 1 + next(i); [rows[i], rows[j]] = [rows[j], rows[i]];
    }
  }
  return { teams, matches, incidents, viewers, rawSheets, cleaningCases, totals: {
    teams: teams.length, players: teams.reduce((s, t) => s + t.players, 0), matches: matches.length, incidents: incidents.length,
    networkMinutes: incidents.filter(i => i.type === "Сеть").reduce((s, i) => s + (i.duration ?? 0), 0),
    ...(version >= 2 ? { knownDurations: incidents.filter(i => i.duration !== null).length } : {}),
    top5: [...matches].sort((a, b) => b.duration - a.duration || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 5).map(m => m.id),
    byHour, byIncident, byPlatform,
  } };
}
