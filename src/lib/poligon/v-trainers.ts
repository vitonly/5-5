/*
 * Тренажёры модуля В: данные сценариев и автоматическая проверка.
 * Симулятор неисправностей, командная строка, пути в Windows 11, разъёмы, акт и отчёт.
 */
import type { ConnectorId } from "./types";
import type { ReviewCard, Workbook } from "./a-practicum";

const str = (w: Workbook, id: string) => String(w[id] ?? "").trim();

/* =========================================================
 * 1. Симулятор неисправностей
 * ========================================================= */

export type SimStep = {
  id: string;
  label: string;
  /** check — посмотреть руками, util — диагностическая утилита, fix — действие-исправление */
  kind: "check" | "util" | "fix";
  /** Что ученик увидит (строки; если начинается с «C:\» — показываем как консоль) */
  result: string[];
  /** Шаг ведёт к причине (не лишний) */
  useful?: boolean;
  /** Правильное исправление */
  correct?: boolean;
  /** Для работы внутри ПК: перед этим шагом нужно обесточить */
  needsPowerOff?: boolean;
};

export type SimScenario = { id: string; title: string; symptom: string; cause: string; steps: SimStep[] };

const POWER_OFF: SimStep = {
  id: "poweroff",
  label: "Выключить ПК, вынуть вилку, снять остаточный заряд кнопкой питания",
  kind: "check",
  result: ["ПК обесточен. Можно работать с кабелями и внутри корпуса."],
  useful: true,
};

export const SIM: SimScenario[] = [
  {
    id: "s1",
    title: "Нет интернета",
    symptom: "Игрок: «Steam пишет «нет подключения», браузер не открывает сайты».",
    cause: "Сетевой кабель вынут из ПК (не дошёл до щелчка).",
    steps: [
      { id: "led", label: "Посмотреть на индикаторы сетевой карты сзади ПК", kind: "check", result: ["Индикаторы у разъёма RJ-45 не горят."], useful: true },
      { id: "ipc", label: "Командная строка: ipconfig", kind: "util", result: ["C:\\>ipconfig", "Адаптер Ethernet Ethernet:", "   Состояние среды. . . . . . . . : Среда передачи недоступна."], useful: true },
      { id: "dev", label: "Диспетчер устройств → Сетевые адаптеры", kind: "util", result: ["Realtek PCIe GbE Family Controller — устройство работает нормально."] },
      { id: "ping", label: "Командная строка: ping 8.8.8.8", kind: "util", result: ["C:\\>ping 8.8.8.8", "Сбой передачи. Общий сбой."] },
      { id: "dns", label: "Сменить DNS на 8.8.8.8", kind: "fix", result: ["Ничего не изменилось: «Среда передачи недоступна»."] },
      { id: "reboot", label: "Перезагрузить ПК", kind: "fix", result: ["После перезагрузки интернета по-прежнему нет."] },
      { id: "cable", label: "Вставить кабель RJ-45 в сетевую карту до щелчка", kind: "fix", correct: true, result: ["Индикаторы загорелись. ping 8.8.8.8 — получено 4 из 4, 0% потерь."] },
    ],
  },
  {
    id: "s2",
    title: "Нет интернета, кабель на месте",
    symptom: "Интернета нет. Кабель вставлен, индикаторы на сетевой карте горят.",
    cause: "Сетевой адаптер отключён в Windows.",
    steps: [
      { id: "ipc", label: "Командная строка: ipconfig", kind: "util", result: ["C:\\>ipconfig", "Настройка протокола IP для Windows", "(адаптера Ethernet в списке нет)"], useful: true },
      { id: "ncpa", label: "Win+R → ncpa.cpl (сетевые подключения)", kind: "util", result: ["Ethernet — Отключено (значок серый)."], useful: true },
      { id: "cable", label: "Переткнуть сетевой кабель", kind: "fix", result: ["Индикаторы горят, но интернета нет."] },
      { id: "steam", label: "Переустановить Steam", kind: "fix", result: ["Steam переустановлен — подключения всё равно нет."] },
      { id: "enable", label: "Включить адаптер Ethernet (ПКМ → Включить)", kind: "fix", correct: true, result: ["Ethernet — подключено. ipconfig показывает 192.168.1.25, ping 8.8.8.8 — 0% потерь."] },
    ],
  },
  {
    id: "s3",
    title: "Сайты не открываются",
    symptom: "Dota 2 не может подключиться к серверам Steam, сайты не открываются. Кабель и адаптер в порядке.",
    cause: "Вручную прописан неверный DNS-сервер.",
    steps: [
      { id: "ping", label: "ping 8.8.8.8", kind: "util", result: ["C:\\>ping 8.8.8.8", "Ответ от 8.8.8.8: число байт=32 время=13мс TTL=117", "Пакетов: отправлено = 4, получено = 4, потеряно = 0 (0% потерь)"], useful: true },
      { id: "pingname", label: "ping ya.ru", kind: "util", result: ["C:\\>ping ya.ru", "При проверке связи не удалось обнаружить узел ya.ru."], useful: true },
      { id: "ipall", label: "ipconfig /all", kind: "util", result: ["C:\\>ipconfig /all", "   DNS-серверы. . . . . . . . . . . : 10.10.10.10"], useful: true },
      { id: "dev", label: "Диспетчер устройств → Сетевые адаптеры", kind: "util", result: ["Сетевой адаптер работает нормально."] },
      { id: "driver", label: "Переустановить драйвер сетевой карты", kind: "fix", result: ["После переустановки ping ya.ru по-прежнему не находит узел."] },
      { id: "fixdns", label: "Параметры → Сеть и Интернет → Ethernet → DNS: автоматически (DHCP)", kind: "fix", correct: true, result: ["ipconfig /flushdns. ping ya.ru — ответы есть. Steam подключился."] },
    ],
  },
  {
    id: "s4",
    title: "Адрес 169.254",
    symptom: "Интернета нет. Кабель вставлен, адаптер включён.",
    cause: "ПК не получил адрес от роутера (DHCP) — нужно запросить заново.",
    steps: [
      { id: "ipc", label: "ipconfig", kind: "util", result: ["C:\\>ipconfig", "   IPv4-адрес автонастройки. . . . . : 169.254.37.12", "   Основной шлюз. . . . . . . . . . :"], useful: true },
      { id: "dns", label: "Сменить DNS на 77.88.8.8", kind: "fix", result: ["Адрес по-прежнему 169.254.37.12."] },
      { id: "renew", label: "ipconfig /release, затем ipconfig /renew", kind: "fix", correct: true, result: ["IPv4-адрес: 192.168.1.31, шлюз 192.168.1.1. ping 8.8.8.8 — 0% потерь."] },
      { id: "dota", label: "Проверить целостность файлов Dota 2", kind: "fix", result: ["Файлы в порядке, сети по-прежнему нет."] },
    ],
  },
  {
    id: "s5",
    title: "Курсор «плывёт»",
    symptom: "Игрок: «Курсор слишком быстрый и проскакивает мимо цели, при резком движении улетает».",
    cause: "Скорость указателя на максимуме и включена повышенная точность (ускорение).",
    steps: [
      { id: "set", label: "Параметры → Bluetooth и устройства → Мышь", kind: "util", result: ["Скорость указателя мыши: 20 из 20."], useful: true },
      { id: "adv", label: "Дополнительные параметры мыши → Параметры указателя", kind: "util", result: ["☑ Включить повышенную точность установки указателя."], useful: true },
      { id: "pad", label: "Проверить коврик и сенсор мыши", kind: "check", result: ["Коврик чистый, сенсор без пыли."] },
      { id: "replace", label: "Заменить мышь", kind: "fix", result: ["С новой мышью курсор так же улетает."] },
      { id: "fix", label: "Скорость 10 и снять галочку «повышенная точность»", kind: "fix", correct: true, result: ["Курсор двигается ровно, без ускорения. Игрок подтверждает."] },
    ],
  },
  {
    id: "s6",
    title: "Кнопки мыши перепутаны",
    symptom: "Левая кнопка открывает контекстное меню, правая — выделяет.",
    cause: "В параметрах основной кнопкой выбрана правая.",
    steps: [
      { id: "set", label: "Параметры → Bluetooth и устройства → Мышь", kind: "util", result: ["Основная кнопка мыши: Правая."], useful: true },
      { id: "driver", label: "Переустановить драйвер мыши", kind: "fix", result: ["Кнопки по-прежнему перепутаны."] },
      { id: "fix", label: "Основная кнопка мыши → Левая", kind: "fix", correct: true, result: ["Левая кнопка выделяет, правая открывает меню."] },
    ],
  },
  {
    id: "s7",
    title: "Нет звука в наушниках",
    symptom: "В Dota 2 и в системе нет звука в наушниках. Гарнитура USB подключена.",
    cause: "Выбрано не то устройство вывода — динамики монитора по HDMI.",
    steps: [
      { id: "plug", label: "Проверить подключение гарнитуры", kind: "check", result: ["USB-гарнитура подключена, индикатор горит."], useful: true },
      { id: "mixer", label: "Открыть микшер громкости", kind: "util", result: ["Громкость системы 60, Dota 2 — 80."] },
      { id: "out", label: "Параметры → Система → Звук → Вывод", kind: "util", result: ["Выбрано: «Динамики (Монитор HDMI)»."], useful: true },
      { id: "reinstall", label: "Переустановить драйвер звуковой карты", kind: "fix", result: ["Звука в наушниках по-прежнему нет."] },
      { id: "fix", label: "Выбрать «Наушники (USB Headset)» устройством вывода", kind: "fix", correct: true, result: ["Звук в наушниках есть, в Dota 2 тоже."] },
    ],
  },
  {
    id: "s8",
    title: "Микрофон не работает",
    symptom: "Игрока не слышат в голосовом чате. Наушники работают.",
    cause: "Доступ приложений к микрофону выключен в параметрах конфиденциальности.",
    steps: [
      { id: "in", label: "Параметры → Система → Звук → Ввод", kind: "util", result: ["Выбран «Микрофон (USB Headset)», уровень 80."], useful: true },
      { id: "test", label: "Проверить микрофон (индикатор уровня)", kind: "util", result: ["Индикатор в параметрах двигается, а приложение звука не получает."], useful: true },
      { id: "priv", label: "Параметры → Конфиденциальность и защита → Микрофон", kind: "util", result: ["«Разрешить приложениям доступ к микрофону» — Откл."], useful: true },
      { id: "swap", label: "Заменить гарнитуру", kind: "fix", result: ["С другой гарнитурой то же самое."] },
      { id: "fix", label: "Включить доступ приложений к микрофону", kind: "fix", correct: true, result: ["Голосовой чат слышит игрока."] },
    ],
  },
  {
    id: "s9",
    title: "Горячие клавиши не работают",
    symptom: "Win+Пробел перебирает три раскладки, горячие клавиши в Dota 2 срабатывают через раз.",
    cause: "Добавлена лишняя раскладка (английская Dvorak).",
    steps: [
      { id: "lang", label: "Параметры → Время и язык → Язык и регион", kind: "util", result: ["Русский; English (United States): раскладки US и Dvorak."], useful: true },
      { id: "notepad", label: "Проверить клавиши в Блокноте", kind: "check", result: ["В одной из раскладок буквы печатаются не на своих местах."], useful: true },
      { id: "replace", label: "Заменить клавиатуру", kind: "fix", result: ["С новой клавиатурой то же самое."] },
      { id: "fix", label: "Удалить раскладку Dvorak, оставить русскую и US", kind: "fix", correct: true, result: ["Раскладки переключаются между двумя, горячие клавиши работают."] },
    ],
  },
  {
    id: "s10",
    title: "15 FPS и низкое разрешение",
    symptom: "Dota 2 запускается, но 15 кадров в секунду, разрешение максимум 1024×768.",
    cause: "Видеокарта отключена в Диспетчере устройств — работает базовый видеоадаптер.",
    steps: [
      { id: "res", label: "Параметры → Система → Дисплей", kind: "util", result: ["Разрешение: 1024×768, других вариантов нет."], useful: true },
      { id: "dev", label: "Диспетчер устройств → Видеоадаптеры", kind: "util", result: ["⬇ NVIDIA GeForce GTX 1650 (отключено)", "Базовый видеоадаптер (Майкрософт)"], useful: true },
      { id: "game", label: "Понизить настройки графики в Dota 2", kind: "fix", result: ["FPS вырос до 20, разрешение то же — проблема не в игре."] },
      { id: "fix", label: "ПКМ по GeForce GTX 1650 → Включить устройство", kind: "fix", correct: true, result: ["Разрешение 1920×1080 доступно, в Dota 2 — 140 FPS."] },
    ],
  },
  {
    id: "s11",
    title: "Игра вылетает после обновления драйвера",
    symptom: "После обновления драйвера видеокарты Dota 2 закрывается сразу после запуска.",
    cause: "Новый драйвер видеокарты работает с ошибкой — нужно откатить.",
    steps: [
      { id: "events", label: "Просмотр событий → Журналы Windows → Система", kind: "util", result: ["Ошибка: «Видеодрайвер перестал отвечать и был восстановлен» — в момент запуска игры."], useful: true },
      { id: "dev", label: "Диспетчер устройств → Видеоадаптеры", kind: "util", result: ["⚠ NVIDIA GeForce GTX 1650 — «Windows остановила это устройство, так как оно сообщило о возникновении неполадок. (Код 43)»"], useful: true },
      { id: "files", label: "Проверить целостность файлов Dota 2", kind: "fix", result: ["Файлы в порядке, игра всё равно вылетает."] },
      { id: "fix", label: "Свойства видеокарты → Драйвер → Откатить", kind: "fix", correct: true, result: ["Драйвер откачен, ошибки нет, Dota 2 запускается."] },
    ],
  },
  {
    id: "s12",
    title: "Монитор: «Нет сигнала»",
    symptom: "ПК включён, вентиляторы крутятся, на мониторе «Нет сигнала».",
    cause: "Кабель монитора подключён к разъёму материнской платы, а не видеокарты.",
    steps: [
      { id: "input", label: "Проверить выбранный вход на мониторе (Input)", kind: "check", result: ["Выбран HDMI — тот же, куда вставлен кабель."], useful: true },
      { id: "look", label: "Посмотреть, куда подключён кабель сзади ПК", kind: "check", result: ["HDMI вставлен в верхний разъём рядом с USB — это материнская плата. Ниже есть видеокарта с HDMI и DP."], useful: true },
      POWER_OFF,
      { id: "ram", label: "Открыть корпус и переустановить оперативную память", kind: "fix", needsPowerOff: true, result: ["Память переустановлена, сигнала по-прежнему нет."] },
      { id: "fix", label: "Переподключить кабель монитора в разъём видеокарты", kind: "fix", correct: true, needsPowerOff: true, result: ["Изображение появилось, Windows загрузилась."] },
    ],
  },
  {
    id: "s13",
    title: "Писк и нет изображения",
    symptom: "При включении из корпуса повторяющиеся короткие писки, изображения нет. Монитор и кабель исправны.",
    cause: "Планка оперативной памяти вставлена не до конца.",
    steps: [
      { id: "listen", label: "Послушать сигналы при включении", kind: "check", result: ["Повторяющиеся короткие писки — обычно проблема с памятью."], useful: true },
      { id: "cable", label: "Проверить кабель монитора и вход", kind: "check", result: ["Кабель в видеокарте, вход выбран правильно."] },
      POWER_OFF,
      { id: "open", label: "Открыть корпус и осмотреть слоты памяти", kind: "check", needsPowerOff: true, result: ["Одна планка стоит криво, защёлка с одной стороны не закрыта."], useful: true },
      { id: "psu", label: "Заменить блок питания", kind: "fix", needsPowerOff: true, result: ["Писки остались."] },
      { id: "fix", label: "Вынуть планку и вставить ровно до щелчка обеих защёлок", kind: "fix", correct: true, needsPowerOff: true, result: ["Писков нет, изображение появилось."] },
    ],
  },
];

/** Что хранится в тетради по каждому сценарию */
export type SimState = { log: string[]; solved: boolean; wrongFixes: number; startMs?: number; endMs?: number; unsafe?: boolean };

export function simState(w: Workbook, sid: string): SimState {
  try {
    const v = JSON.parse(str(w, `sim_${sid}`) || "{}");
    return { log: v.log ?? [], solved: !!v.solved, wrongFixes: v.wrongFixes ?? 0, startMs: v.startMs, endMs: v.endMs, unsafe: !!v.unsafe };
  } catch {
    return { log: [], solved: false, wrongFixes: 0 };
  }
}

export function reviewSim(w: Workbook): ReviewCard[] {
  const c: ReviewCard = { title: "Симулятор неисправностей", max: "", good: [], bad: [] };
  let solved = 0;
  for (const sc of SIM) {
    const st = simState(w, sc.id);
    if (!st.log.length) {
      c.bad.push(`«${sc.title}»: не пройден.`);
      continue;
    }
    const steps = st.log.map((id) => sc.steps.find((s) => s.id === id)!).filter(Boolean);
    const extra = steps.filter((s) => s.kind !== "fix" && !s.useful).length;
    const usedUtil = steps.some((s) => s.kind === "util");
    const sec = st.startMs && st.endMs ? Math.round((st.endMs - st.startMs) / 1000) : null;
    if (!st.solved) {
      c.bad.push(`«${sc.title}»: причина не найдена. Ответ: ${sc.cause}`);
      continue;
    }
    solved++;
    const notes: string[] = [];
    if (st.wrongFixes) notes.push(`неверных исправлений: ${st.wrongFixes}`);
    if (extra) notes.push(`лишних проверок: ${extra}`);
    if (!usedUtil) notes.push("без диагностической утилиты");
    if (st.unsafe) notes.push("работа с кабелями без обесточивания — нарушение охраны труда");
    const t = sec !== null ? ` за ${sec < 60 ? `${sec} с` : `${Math.floor(sec / 60)} мин ${sec % 60} с`}` : "";
    if (notes.length) c.bad.push(`«${sc.title}»: решён${t}, но ${notes.join(", ")}.`);
    else c.good.push(`«${sc.title}»: решён${t} — чисто, утилитой, без лишних шагов.`);
  }
  c.good.unshift(`Решено сценариев: ${solved} из ${SIM.length}.`);
  return [c];
}

/* =========================================================
 * 2. Командная строка
 * ========================================================= */

const IPCONFIG_ALL = [
  "C:\\>ipconfig /all",
  "Адаптер Ethernet Ethernet:",
  "   Описание. . . . . . . . . . . . . : Realtek PCIe GbE Family Controller",
  "   Физический адрес. . . . . . . . . : 3C-7C-3F-1A-22-B4",
  "   DHCP включен. . . . . . . . . . . : Да",
  "   IPv4-адрес. . . . . . . . . . . . : 192.168.0.47(Основной)",
  "   Маска подсети . . . . . . . . . . : 255.255.255.0",
  "   Основной шлюз. . . . . . . . . . : 192.168.0.1",
  "   DNS-серверы. . . . . . . . . . . : 77.88.8.8",
];
const PING_LOSS = [
  "C:\\>ping 8.8.8.8",
  "Ответ от 8.8.8.8: число байт=32 время=12мс TTL=117",
  "Превышен интервал ожидания для запроса.",
  "Ответ от 8.8.8.8: число байт=32 время=48мс TTL=117",
  "Ответ от 8.8.8.8: число байт=32 время=17мс TTL=117",
  "Статистика Ping для 8.8.8.8:",
  "    Пакетов: отправлено = 4, получено = 3, потеряно = 1 (25% потерь)",
  "Приблизительное время приема-передачи в мс:",
  "    Минимальное = 12мсек, Максимальное = 48 мсек, Среднее = 25 мсек",
];
const APIPA = ["C:\\>ipconfig", "Адаптер Ethernet Ethernet:", "   IPv4-адрес автонастройки. . . . . : 169.254.11.80", "   Основной шлюз. . . . . . . . . . :"];

export type CmdTask =
  | { id: string; kind: "read"; output: string[]; q: string; answers: string[]; why: string }
  | { id: string; kind: "write"; q: string; answers: string[]; why: string };

export const CMD: CmdTask[] = [
  { id: "c1", kind: "read", output: IPCONFIG_ALL, q: "Какой IPv4-адрес у компьютера?", answers: ["192.168.0.47"], why: "Строка «IPv4-адрес»." },
  { id: "c2", kind: "read", output: IPCONFIG_ALL, q: "Какой адрес у роутера (основной шлюз)?", answers: ["192.168.0.1"], why: "Строка «Основной шлюз»." },
  { id: "c3", kind: "read", output: IPCONFIG_ALL, q: "Какой DNS-сервер используется?", answers: ["77.88.8.8"], why: "Строка «DNS-серверы» — видно только в ipconfig /all." },
  { id: "c4", kind: "read", output: PING_LOSS, q: "Сколько процентов пакетов потеряно? (только число)", answers: ["25"], why: "«потеряно = 1 (25% потерь)»." },
  { id: "c5", kind: "read", output: PING_LOSS, q: "Среднее время ответа в мс? (только число)", answers: ["25"], why: "«Среднее = 25 мсек». Для игры хорошо до 50 мс без потерь." },
  { id: "c6", kind: "read", output: APIPA, q: "ПК получил адрес от роутера? (да / нет)", answers: ["нет"], why: "169.254.x.x и пустой шлюз — адрес не получен, Windows придумала его сама." },
  { id: "w1", kind: "write", q: "Показать IP, шлюз и DNS-серверы", answers: ["ipconfig /all", "ipconfig/all"], why: "ipconfig /all." },
  { id: "w2", kind: "write", q: "Проверить связь с адресом 8.8.8.8", answers: ["ping 8.8.8.8"], why: "ping 8.8.8.8." },
  { id: "w3", kind: "write", q: "Пинговать 8.8.8.8 непрерывно, пока не остановишь (Ctrl+C)", answers: ["ping -t 8.8.8.8", "ping 8.8.8.8 -t", "ping /t 8.8.8.8", "ping 8.8.8.8 /t"], why: "Ключ -t — бесконечный ping." },
  { id: "w4", kind: "write", q: "Запросить у роутера новый IP-адрес (после release)", answers: ["ipconfig /renew", "ipconfig/renew"], why: "ipconfig /renew." },
  { id: "w5", kind: "write", q: "Очистить кэш DNS", answers: ["ipconfig /flushdns", "ipconfig/flushdns"], why: "ipconfig /flushdns." },
  { id: "w6", kind: "write", q: "Узнать маршрут до ya.ru", answers: ["tracert ya.ru"], why: "tracert ya.ru." },
  { id: "w7", kind: "write", q: "Win+R: открыть сетевые подключения", answers: ["ncpa.cpl"], why: "ncpa.cpl." },
  { id: "w8", kind: "write", q: "Win+R: открыть средство диагностики DirectX", answers: ["dxdiag"], why: "dxdiag." },
  { id: "w9", kind: "write", q: "Win+R: открыть Просмотр событий", answers: ["eventvwr", "eventvwr.msc"], why: "eventvwr.msc." },
  { id: "w10", kind: "write", q: "Win+R: открыть Диспетчер устройств", answers: ["devmgmt.msc"], why: "devmgmt.msc." },
  { id: "w11", kind: "write", q: "Win+R: открыть старую панель «Звук»", answers: ["mmsys.cpl"], why: "mmsys.cpl." },
  { id: "w12", kind: "write", q: "Win+R: узнать версию Windows", answers: ["winver"], why: "winver." },
  { id: "w13", kind: "write", q: "Win+R: сведения о системе", answers: ["msinfo32"], why: "msinfo32." },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function reviewCmd(w: Workbook): ReviewCard[] {
  const c: ReviewCard = { title: "Командная строка", max: "", good: [], bad: [] };
  let ok = 0;
  for (const t of CMD) {
    const a = norm(str(w, t.id));
    if (t.answers.map(norm).includes(a)) ok++;
    else c.bad.push(`«${t.q}»: ${a ? `у тебя «${str(w, t.id)}»` : "нет ответа"}. Правильно: ${t.answers[0]}. ${t.why}`);
  }
  c.good.unshift(`Верно: ${ok} из ${CMD.length}.`);
  return [c];
}

/* =========================================================
 * 3. Пути в Windows 11 и разъёмы
 * ========================================================= */

export const PATHS: { id: string; title: string; steps: string[] }[] = [
  { id: "p1", title: "Откатить драйвер видеокарты", steps: ["Win+X", "Диспетчер устройств", "Видеоадаптеры", "ПКМ по видеокарте → Свойства", "Вкладка «Драйвер»", "Откатить"] },
  { id: "p2", title: "Выбрать наушники для вывода звука", steps: ["Параметры (Win+I)", "Система", "Звук", "Вывод", "Наушники (USB Headset)"] },
  { id: "p3", title: "Включить отключённый сетевой адаптер", steps: ["Win+R", "ncpa.cpl", "ПКМ по Ethernet", "Включить"] },
  { id: "p4", title: "Вернуть автоматический DNS (Windows 11)", steps: ["Параметры (Win+I)", "Сеть и Интернет", "Ethernet", "Назначение DNS-сервера → Изменить", "Автоматически (DHCP)"] },
  { id: "p5", title: "Отключить ускорение указателя", steps: ["Параметры (Win+I)", "Bluetooth и устройства", "Мышь", "Дополнительные параметры мыши", "Параметры указателя", "Снять «повышенную точность»"] },
  { id: "p6", title: "Проверить целостность файлов Dota 2", steps: ["Steam", "Библиотека", "ПКМ по Dota 2 → Свойства", "Установленные файлы", "Проверить целостность"] },
  { id: "p7", title: "Выключить залипание клавиш", steps: ["Параметры (Win+I)", "Специальные возможности", "Клавиатура", "Залипание клавиш — Откл."] },
  { id: "p8", title: "Безопасно открыть корпус ПК", steps: ["Выключить ПК через Пуск", "Вынуть вилку из розетки / ИБП", "Нажать кнопку питания (снять заряд)", "Антистатический браслет", "Снять боковую крышку"] },
];

export const CONNECTOR_QUIZ: ConnectorId[] = ["hdmi", "dp", "vga", "dvi", "usba", "usbc", "rj45", "jack-green", "jack-pink", "atx24", "eps8", "pcie8", "sata"];

export function reviewWhere(w: Workbook, names: Record<ConnectorId, string>): ReviewCard[] {
  const p: ReviewCard = { title: "Пути в Windows", max: "", good: [], bad: [] };
  for (const x of PATHS) {
    const a = str(w, `path_${x.id}`);
    if (a === x.steps.join(" → ")) p.good.push(`«${x.title}»: верно.`);
    else p.bad.push(`«${x.title}»: ${a ? "неверный порядок" : "не собрано"}. Правильно: ${x.steps.join(" → ")}.`);
  }
  const c: ReviewCard = { title: "Разъёмы", max: "", good: [], bad: [] };
  let ok = 0;
  for (const id of CONNECTOR_QUIZ) {
    if (str(w, `con_${id}`) === id) ok++;
    else c.bad.push(`Разъём «${names[id]}»: ${str(w, `con_${id}`) ? `ты выбрал «${names[str(w, `con_${id}`) as ConnectorId] ?? "?"}»` : "не отвечено"}.`);
  }
  c.good.unshift(`Узнано разъёмов: ${ok} из ${CONNECTOR_QUIZ.length}.`);
  return [p, c];
}

/* =========================================================
 * 4. Акт и отчёт по сценарию
 * ========================================================= */

export const DOCS_DATA = [
  "dxdiag → Система: Процессор Intel(R) Core(TM) i5-10400F CPU @ 2.90GHz; Память 16384MB ОЗУ.",
  "dxdiag → Экран: NVIDIA GeForce GTX 1650, видеопамять 4 ГБ.",
  "Проводник → Этот компьютер: Локальный диск (C:) — свободно 38 ГБ из 476 ГБ.",
  "Параметры → Дисплей: разрешение 1920 × 1080, монитор 24\".",
  "Периферия: клавиатура проводная; мышь беспроводная (USB-приёмник).",
  "winver: Windows 10 Pro.",
  "ping 8.8.8.8: получено 4 из 4, 0% потерь, среднее 12 мс.",
];

export const DOCS_JOURNAL = [
  "13:05 — эксперт внёс неисправность, начало диагностики. Симптом: нет звука в наушниках.",
  "13:06 — гарнитура USB подключена, индикатор горит.",
  "13:09 — Параметры → Система → Звук: вывод на «Динамики (Монитор HDMI)». Причина найдена.",
  "13:11 — выбрано «Наушники (USB Headset)», звук в Dota 2 есть. Устранено.",
];

/** Строки акта: что вписать (ключевое слово для проверки) и правильная отметка */
export const ACT_ROWS: { id: string; row: string; norm: string; key: RegExp; ok: "ОК" | "Не ОК"; hint: string }[] = [
  { id: "a11", row: "1.1 Процессор", norm: "Intel Core i5 9400 или аналог", key: /10400/, ok: "ОК", hint: "i5-10400F новее i5-9400 — ОК." },
  { id: "a12", row: "1.2 Оперативная память", norm: "8 ГБ и выше", key: /16/, ok: "ОК", hint: "16384 МБ = 16 ГБ." },
  { id: "a13", row: "1.3 Видеокарта", norm: "GeForce GTX 1650 или аналог", key: /1650/, ok: "ОК", hint: "GTX 1650 — как в норме." },
  { id: "a14", row: "1.4 Накопитель", norm: "SSD / HDD, свободное место ≥ 50 ГБ", key: /38/, ok: "Не ОК", hint: "Свободно 38 ГБ — меньше 50." },
  { id: "a22", row: "2.2 Разрешение", norm: "1680x1050 и выше", key: /1920/, ok: "ОК", hint: "1920×1080 выше нормы." },
  { id: "a32", row: "3.2 Мышь", norm: "Проводная, курсор двигается плавно", key: /беспровод/i, ok: "Не ОК", hint: "Норма — проводная." },
  { id: "a41", row: "4.1 Операционная система", norm: "Microsoft Windows 10 Pro", key: /10/, ok: "ОК", hint: "Windows 10 Pro — как в норме." },
  { id: "a53", row: "5.3 Проверка ping", norm: "Стабильный, без потерь", key: /0\s*%|без потерь/i, ok: "ОК", hint: "0% потерь." },
];

export const REPORT_FIELDS: { id: string; label: string }[] = [
  { id: "r_start", label: "Время начала диагностики" },
  { id: "r_found", label: "Время обнаружения неисправности" },
  { id: "r_fixed", label: "Время устранения неисправности" },
  { id: "r_total", label: "Общее время устранения (мин)" },
  { id: "r_utils", label: "Использованные диагностические утилиты" },
  { id: "r_type", label: "Тип неисправности" },
  { id: "r_signs", label: "Внешние признаки" },
  { id: "r_cause", label: "Причина" },
  { id: "r_steps", label: "Этапы диагностики" },
  { id: "r_actions", label: "Выполненные действия" },
  { id: "r_check", label: "Проверка после устранения" },
  { id: "r_recs", label: "Рекомендации (профилактические меры)" },
];

const toMin = (t: string) => {
  const m = t.match(/(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function reviewDocs(w: Workbook): ReviewCard[] {
  const a: ReviewCard = { title: "Акт технического состояния", max: "", good: [], bad: [] };
  for (const r of ACT_ROWS) {
    const fact = str(w, `${r.id}f`), mark = str(w, `${r.id}m`);
    if (!r.key.test(fact)) a.bad.push(`${r.row}: фактическое состояние ${fact ? `«${fact}» не совпадает с данными` : "не заполнено"}. ${r.hint}`);
    else if (mark !== r.ok) a.bad.push(`${r.row}: отметка должна быть «${r.ok}». ${r.hint}`);
    else a.good.push(`${r.row}: верно.`);
  }
  const defects = str(w, "a_defects").toLowerCase();
  if (/(диск|мест|накопит)/.test(defects) && /мыш/.test(defects)) a.good.push("Недостатки указаны оба: место на диске и беспроводная мышь.");
  else a.bad.push("В «Выявленных недостатках» должны быть оба пункта: мало места на диске и беспроводная мышь.");
  if (str(w, "a_recs").length >= 30) a.good.push("Рекомендации по устранению есть.");
  else a.bad.push("Рекомендации слишком короткие: что сделать с каждым недостатком (освободить место ≥ 50 ГБ, заменить мышь на проводную).");
  if (str(w, "a_concl") === "не готово") a.good.push("Заключение верное: пока недостатки не устранены — не готово.");
  else a.bad.push("Заключение: при недостатках «Не ОК» рабочее место не готово к эксплуатации, пока их не устранят.");

  const r: ReviewCard = { title: "Отчёт о неисправности", max: "", good: [], bad: [] };
  const s = toMin(str(w, "r_start")), f = toMin(str(w, "r_found")), x = toMin(str(w, "r_fixed"));
  if (s === 13 * 60 + 5 && f === 13 * 60 + 9 && x === 13 * 60 + 11) r.good.push("Время начала, обнаружения и устранения — как в журнале.");
  else r.bad.push("Время не совпадает с журналом: начало 13:05, обнаружение 13:09, устранение 13:11.");
  if (Number(str(w, "r_total").replace(/[^\d]/g, "")) === 6) r.good.push("Общее время — 6 минут.");
  else r.bad.push("Общее время = устранение − начало = 13:11 − 13:05 = 6 минут.");
  if (/(параметр|звук|mmsys|микшер)/i.test(str(w, "r_utils"))) r.good.push("Утилиты указаны.");
  else r.bad.push("Укажи утилиты: Параметры Windows → Звук (и микшер, если открывал).");
  if (/(настрой|программ)/i.test(str(w, "r_type"))) r.good.push("Тип — программная неисправность / настройка.");
  else r.bad.push("Тип неисправности — программная (неверная настройка устройства вывода), не аппаратная.");
  if (/(hdmi|монитор|устройств\S* вывод|динамик)/i.test(str(w, "r_cause"))) r.good.push("Причина названа точно.");
  else r.bad.push("Причина: в качестве устройства вывода выбраны динамики монитора (HDMI).");
  for (const k of ["r_signs", "r_steps", "r_actions"] as const) {
    if (str(w, k).length < 15) r.bad.push(`Поле «${REPORT_FIELDS.find((f2) => f2.id === k)!.label}» заполнено слишком коротко.`);
  }
  if (/(dota|игр|звук)/i.test(str(w, "r_check"))) r.good.push("Проверка после устранения описана.");
  else r.bad.push("Опиши проверку: звук в наушниках есть, в Dota 2 тоже.");
  if (str(w, "r_recs").length >= 25) r.good.push("Рекомендации есть.");
  else r.bad.push("Рекомендации: например, проверять устройство вывода перед матчем, ограничить игрокам смену параметров.");
  return [a, r];
}
