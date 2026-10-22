"""
Логика игры «Своя игра»: состояние, фазы, кнопка, очки, особые вопросы, финал.

Фазы игры (поле phase):
  lobby         — ждём игроков, ведущий выбирает пак
  round_intro   — заставка раунда: название и список тем
  board         — табло, игрок выбирает вопрос
  secret_give   — «кот в мешке»: выбравший решает, кому отдать вопрос
  secret_price  — получивший кота выбирает цену (если в паке задан диапазон)
  auction       — аукцион: игроки по очереди делают ставки
  final_themes  — финал: игроки по очереди вычёркивают темы
  final_bets    — финал: тайные ставки
  intro         — карточка «Тема — стоимость» (1.5 сек), медиа подгружаются заранее
  reading       — вопрос на экране (текст печатается постепенно), кнопки закрыты
  open          — кнопки открыты, ждём первого нажатия (обычный вопрос)
  answering     — игрок отвечает вслух, ведущий решает «верно / неверно»
  writing       — все пишут ответ текстом («вопрос для всех», финал)
  judging       — ведущий проверяет письменные ответы
  reveal        — показываем правильный ответ
  game_over     — итоги

Типы вопросов (qtype):
  simple  — обычный: кто первым нажал, тот отвечает
  secret  — кот в мешке: отвечает тот, кому отдали, без кнопки
  stake   — аукцион: отвечает победитель аукциона на свою ставку
  norisk  — без риска: отвечает выбравший, верно = двойная цена, неверно = 0
  forall  — для всех: все пишут ответ, каждому ± цена
  final   — финальный вопрос: все финалисты пишут ответ, каждому ± ставка

Модуль ничего не знает про сеть: он меняет состояние и вызывает
self.notify() — сервер в ответ рассылает новое состояние всем клиентам.
"""

import asyncio
import random
import secrets
import time
from dataclasses import dataclass, field

from siq import Pack


# ---------- Настройки по умолчанию ----------

DEFAULT_SETTINGS = {
    "open_time": 10,          # сколько секунд ждём нажатия после открытия кнопок
    "answer_time": 20,        # сколько секунд даём на устный ответ (только таймер на экране)
    "falstart_block": 1.0,    # на сколько секунд блокируем кнопку за фальстарт
    "reveal_time": 6,         # сколько секунд показываем ответ перед возвратом на табло
    "read_speed": 18,         # скорость появления текста вопроса, символов в секунду (0 — сразу весь)
    "scroll_speed": 30,       # скорость автопрокрутки текста, который не влез в окно даже мелким шрифтом (пикс/сек)
    "write_time": 30,         # сколько секунд на письменный ответ в «вопросе для всех»
    "final_write_time": 45,   # сколько секунд на письменный ответ в финале
    "final_bet_time": 30,     # сколько секунд на ставку в финале
    "players_sound": True,    # проигрывать звук/видео на компьютерах игроков
    "minus_for_wrong": True,  # вычитать стоимость за неверный ответ (классика)
    "allow_appeals": True,    # игроки могут оспорить решение ведущего
    "play_all_final": False,  # играть все финальные вопросы вместо вычёркивания тем
}

READ_LOOKAHEAD = 0.5       # на сколько секунд вперёд игрокам отдаём текст вопроса при «печати»
ANSWER_MAX = 200           # максимум символов в письменном ответе (то же число — в static/common.js)
PRESS_WINDOW = 0.04        # окно (сек), в которое собираем почти одновременные нажатия
QUESTION_INTRO_TIME = 1.5
SECRET_INTRO_TIME = 2.5    # заставка «Кот в мешке» / «Аукцион» перед действиями

# Фазы, в которых идёт работа с конкретным вопросом
QUESTION_PHASES = ("secret_give", "secret_price", "auction", "final_bets",
                   "intro", "reading", "open", "answering", "writing", "judging", "reveal")


@dataclass
class Player:
    id: str
    token: str           # секрет для переподключения (хранится в браузере/приложении игрока)
    name: str
    score: int = 0
    online: bool = False
    rtt: float = 0.0     # задержка сети туда-обратно, сек (для компенсации при нажатии)
    blocked_until: float = 0.0  # до какого момента кнопка заблокирована фальстартом
    uid: str | None = None      # id пользователя на сайте (в игре на сайте)
    photo: str | None = None    # аватарка с сайта


@dataclass
class QCtx:
    """Всё, что относится к текущему вопросу."""
    qtype: str = "simple"
    theme: str = ""              # тема, которую показываем (у кота может быть своя)
    price: int = 0               # цена на табло
    value: int = 0               # сколько стоит ответ для отвечающего (кот/аукцион/без риска)
    responder: str | None = None  # кто отвечает без кнопки (кот, аукцион, без риска)
    giver: str | None = None     # кто отдаёт кота
    price_options: list = field(default_factory=list)  # варианты цены кота
    # Аукцион
    order: list = field(default_factory=list)   # очередь участников
    turn: int = 0                               # индекс в очереди
    bids: dict = field(default_factory=dict)    # id -> ставка (число) или "pass"
    high: tuple | None = None                   # (id, ставка) — лидер аукциона
    # Письменные ответы
    eligible: list = field(default_factory=list)  # кто пишет ответ
    answers: dict = field(default_factory=dict)   # id -> текст
    marks: dict = field(default_factory=dict)     # id -> True/False (решение ведущего)
    bets: dict = field(default_factory=dict)      # финал: id -> ставка
    # Апелляции: id -> сколько добавить игроку, если ведущий примет апелляцию
    appealable: dict = field(default_factory=dict)
    appeals: list = field(default_factory=list)   # кто подал апелляцию и ждёт решения
    appeal_done: set = field(default_factory=set)  # кто уже подавал апелляцию на этот вопрос
    reading_started: float = 0.0


class Game:
    def __init__(self):
        self.settings = dict(DEFAULT_SETTINGS)
        self.players: dict[str, Player] = {}
        self.pack: Pack | None = None
        self.pack_file = ""
        self.notify = lambda: None          # сервер подставит свою функцию рассылки
        self.fx = lambda name, **kw: None   # сервер подставит функцию для звуковых эффектов
        self.reset()

    # ================= Служебное =================

    def reset(self):
        """Возврат в лобби (игроки и пак сохраняются)."""
        self.phase = "lobby"
        self.round_idx = 0
        self.rounds = []            # индексы раундов пака, которые будем играть
        self.played = set()         # сыгранные клетки: (тема, вопрос)
        self.chooser_id = None      # кто выбирает следующий вопрос
        self.cur = None             # текущая клетка (тема, вопрос)
        self.q = QCtx()             # контекст текущего вопроса
        self.answerer_id = None     # кто сейчас отвечает
        self.excluded = set()       # кто уже ошибся на этом вопросе
        self.pending = []           # нажатия, пришедшие в окно PRESS_WINDOW
        self.waiting_media = False  # ждём, пока у ведущего доиграет звук/видео
        # Финал
        self.finalists = []         # кто играет финал
        self.final_removed = set()  # вычеркнутые темы
        self.final_turn = 0         # чей ход вычёркивать (индекс в finalists)
        self.final_queue = []       # оставшиеся финальные вопросы при «играть все»
        # Таймер
        self.deadline = None        # время окончания таймера (для отсчёта на экранах)
        self.deadline_total = None  # полная длительность таймера
        self.timer_gen = 0          # номер таймера: старые таймеры проверяют его и не срабатывают
        self.timer_cb = None        # что вызвать по окончании (нужно для паузы)
        self.timer_show = False
        self.timer_end = None
        # Пауза
        self.paused = False
        self.paused_left = None     # сколько оставалось у таймера в момент паузы
        # Игра на сайте: номер игры (чтобы очки школы не начислить дважды)
        self.game_id = secrets.token_hex(6)
        self.awarded = False

    def _set_timer(self, seconds, callback, show=True):
        """Запускает таймер. Новый таймер автоматически отменяет предыдущий."""
        self.timer_gen += 1
        gen = self.timer_gen
        now = time.monotonic()
        self.timer_cb, self.timer_show, self.timer_end = callback, show, now + seconds
        self.deadline = now + seconds if show else None
        if show and not self.deadline_total:
            self.deadline_total = seconds

        async def run():
            await asyncio.sleep(seconds)
            if gen == self.timer_gen and not self.paused:   # таймер всё ещё актуален
                self.timer_cb = None
                callback()
                self.notify()

        asyncio.get_event_loop().create_task(run())

    def _timer(self, seconds, callback, show=True):
        """Новый таймер с новой полной длительностью (для полоски на экране)."""
        self.deadline_total = seconds if show else None
        self._set_timer(seconds, callback, show)

    def _cancel_timer(self):
        self.timer_gen += 1
        self.deadline = None
        self.deadline_total = None
        self.timer_cb = None

    @property
    def round(self):
        if not self.pack or self.round_idx >= len(self.rounds):
            return None
        return self.pack.rounds[self.rounds[self.round_idx]]

    @property
    def question(self):
        if self.cur is None or not self.round:
            return None
        t, q = self.cur
        return self.round.themes[t].questions[q]

    def online_players(self):
        return [p for p in self.players.values() if p.online]

    def name(self, pid):
        p = self.players.get(pid)
        return p.name if p else "—"

    def _add(self, pid, delta):
        if pid in self.players:
            self.players[pid].score += delta

    # ================= Пауза =================

    def pause(self):
        if self.paused or self.phase in ("lobby", "game_over"):
            return
        self.paused = True
        if self.timer_cb and self.timer_end:
            self.paused_left = max(0.3, self.timer_end - time.monotonic())
        else:
            self.paused_left = None
        self.timer_gen += 1   # «замораживаем» текущий таймер
        self.fx("pause")

    def resume(self):
        if not self.paused:
            return
        self.paused = False
        if self.timer_cb and self.paused_left is not None:
            total = self.deadline_total
            self._set_timer(self.paused_left, self.timer_cb, self.timer_show)
            self.deadline_total = total
        self.paused_left = None
        self.fx("resume")

    # ================= Игроки =================

    def join(self, name: str, token: str | None, uid=None, photo=None) -> Player:
        """
        Новый игрок или возвращение старого по токену.
        На сайте токен — это «site:<id профиля>», поэтому один профиль = один игрок,
        с какого бы компьютера он ни зашёл.
        """
        if token:
            for p in self.players.values():
                if p.token == token:
                    if name:
                        p.name = name[:24]
                    return p
        pid = secrets.token_hex(4)
        tok = token if uid else secrets.token_hex(16)
        p = Player(pid, tok, (name or "Игрок")[:24], uid=uid, photo=photo)
        self.players[pid] = p
        return p

    def kick(self, pid):
        self.players.pop(pid, None)
        if self.chooser_id == pid:
            self.chooser_id = None
        if pid in self.finalists:
            self.finalists.remove(pid)
        if self.answerer_id == pid:
            self.answerer_id = None
            if self.q.qtype == "simple":
                self._reopen_or_reveal()
            else:
                self.reveal()

    # ================= Ход игры =================

    def start(self):
        """Начать игру с первого раунда."""
        if not self.pack:
            return "Сначала выберите пак"
        self.rounds = [i for i, r in enumerate(self.pack.rounds) if any(t.questions for t in r.themes)]
        if not self.rounds:
            return "В паке нет вопросов"
        for p in self.players.values():
            p.score = 0
        self.game_id = secrets.token_hex(6)
        self.awarded = False
        online = self.online_players()
        self.chooser_id = random.choice(online).id if online else None
        self.round_idx = 0
        self._begin_round()
        return None

    def _begin_round(self):
        self.played = set()
        self.cur = None
        self.q = QCtx()
        self.phase = "round_intro"
        n = len(self.round.themes)
        # Заставка: название раунда, потом по очереди появляются темы
        self._timer(min(9.0, 2.5 + 0.5 * n), self._after_round_intro, show=False)

    def skip_intro(self):
        if self.phase == "round_intro":
            self._after_round_intro()

    def _after_round_intro(self):
        if self.round.is_final:
            self._start_final()
        else:
            self._to_board()

    def _to_board(self):
        self.phase = "board"
        self.cur = None
        self.answerer_id = None
        self.excluded = set()
        self._cancel_timer()

    def next_round(self):
        self._cancel_timer()
        self.paused = False
        if self.round_idx + 1 < len(self.rounds):
            self.round_idx += 1
            self._begin_round()
        else:
            self.phase = "game_over"

    def end_game(self):
        self._cancel_timer()
        self.paused = False
        self.phase = "game_over"

    # ---------- Выбор вопроса ----------

    def choose(self, t: int, q: int, by_pid: str | None, is_host=False):
        """Выбор клетки на табло. Выбирать может тот, чья очередь, или ведущий."""
        if self.phase != "board" or not self.round or self.paused:
            return
        if not is_host and by_pid != self.chooser_id:
            return
        themes = self.round.themes
        if not (0 <= t < len(themes) and 0 <= q < len(themes[t].questions)):
            return
        if (t, q) in self.played:
            return
        self.played.add((t, q))
        self.cur = (t, q)
        self._prepare_question(themes[t].name)

    def _prepare_question(self, theme_name, qtype=None):
        """Создаём контекст вопроса и запускаем нужный сценарий по его типу."""
        qq = self.question
        self.answerer_id = None
        self.excluded = set()
        self.pending = []
        self.q = QCtx(qtype=qtype or qq.kind, theme=theme_name, price=qq.price, value=qq.price)
        kind = self.q.qtype
        chooser_ok = self.chooser_id in self.players and self.players[self.chooser_id].online

        if kind == "secret":
            self.q.theme = qq.secret_theme or theme_name
            self.q.giver = self.chooser_id if chooser_ok else None
            cands = self.secret_candidates()
            if len(cands) == 1:
                # Отдать некому выбирать — сразу единственному кандидату
                self.phase = "secret_give"
                self._timer(SECRET_INTRO_TIME, lambda: self.give_secret(cands[0], by=None, force=True), show=False)
            else:
                self.phase = "secret_give"
                self._cancel_timer()
            self.fx("secret")
        elif kind == "stake":
            self._start_auction()
            self.fx("auction")
        elif kind == "norisk":
            if not chooser_ok:
                self.q.qtype = "simple"   # выбирающего нет в сети — играем как обычный
            else:
                self.q.responder = self.chooser_id
                self.q.value = qq.price * 2
                self.fx("norisk")
            self._intro()
        else:
            self._intro()

    def _intro(self):
        self.phase = "intro"
        self._timer(QUESTION_INTRO_TIME, self._start_reading, show=False)

    def _start_reading(self):
        """Показываем вопрос. Кнопки пока закрыты."""
        qq = self.question
        self.phase = "reading"
        self.q.reading_started = time.monotonic()
        if self.q.qtype == "secret" and qq.no_question:
            # «Кот без вопроса»: получатель просто получает очки
            self._add(self.q.responder, self.q.value)
            self.fx("correct", pid=self.q.responder)
            self.reveal(force=True)
            return
        has_av = any(i.type in ("audio", "video") for i in qq.content)
        text_len = sum(len(i.value) for i in qq.content if i.type == "text")
        has_img = any(i.type == "image" for i in qq.content)
        speed = self.settings["read_speed"]
        # Время на чтение: пока «печатается» текст (+ немного), плюс время на картинку
        text_time = (text_len / speed + 0.6) if speed > 0 else min(10.0, max(2.0, text_len / 18))
        delay = max(1.5, text_time) + (1.5 if has_img else 0.0)
        if has_av:
            # Ждём сигнала от пульта ведущего, что медиа доиграло (подстраховка — 90 сек)
            self.waiting_media = True
            self._timer(90, self.after_reading, show=False)
        else:
            self._timer(delay, self.after_reading, show=False)

    def media_ended(self):
        """Пульт ведущего сообщил, что звук/видео в вопросе закончилось."""
        if self.phase == "reading" and self.waiting_media and not self.paused:
            self.after_reading()

    def after_reading(self):
        """Вопрос прочитан: дальше всё зависит от типа вопроса."""
        if self.phase not in ("intro", "reading"):
            return
        self.waiting_media = False
        if self.q.qtype == "simple":
            self.open_buttons()
        elif self.q.qtype in ("forall", "final"):
            self._start_writing()
        else:
            # Кот, аукцион, без риска: отвечает один игрок, без кнопки
            self.answerer_id = self.q.responder
            self.phase = "answering"
            self._timer(self.settings["answer_time"], lambda: None)
            self.fx("buzz", pid=self.answerer_id)

    # ---------- Обычный вопрос: кнопки ----------

    def open_buttons(self):
        """Открываем кнопки — с этого момента нажатие засчитывается."""
        if self.phase not in ("intro", "reading", "answering"):
            return
        if self.q.qtype != "simple":
            return self.after_reading()
        self.waiting_media = False
        self.phase = "open"
        self.answerer_id = None
        self.pending = []
        self._timer(self.settings["open_time"], self.reveal)
        self.fx("open")

    def press(self, pid: str):
        """Игрок нажал кнопку."""
        p = self.players.get(pid)
        if not p or self.paused or self.q.qtype != "simple":
            return
        now = time.monotonic()
        if self.phase in ("intro", "reading"):
            # Фальстарт: нажал до открытия кнопок — блокируем
            p.blocked_until = now + self.settings["falstart_block"]
            self.fx("falstart", to=pid)
            return
        if self.phase != "open":
            return
        if pid in self.excluded or p.blocked_until > now:
            return
        if any(x[1] == pid for x in self.pending):
            return
        # Компенсируем задержку сети: нажатие произошло примерно на rtt/2 раньше, чем дошло
        self.pending.append((now - p.rtt / 2, pid))
        if len(self.pending) == 1:
            # Первое нажатие: ждём 40 мс остальные почти одновременные и выбираем самое раннее
            asyncio.get_event_loop().call_later(PRESS_WINDOW, self._decide_press)

    def _decide_press(self):
        if self.phase != "open" or not self.pending or self.paused:
            self.pending = []
            return
        self.pending.sort()
        self.answerer_id = self.pending[0][1]
        self.pending = []
        self.phase = "answering"
        self.timer_gen += 1
        self.timer_cb = None
        self.deadline = time.monotonic() + self.settings["answer_time"]
        self.deadline_total = self.settings["answer_time"]
        self.timer_end = self.deadline
        self.fx("buzz", pid=self.answerer_id)
        self.notify()

    # ---------- Решение ведущего (устный ответ) ----------

    def _deltas(self):
        """Сколько получает/теряет отвечающий: (за верный, за неверный)."""
        t, v = self.q.qtype, self.q.value
        if t == "simple":
            return v, (-v if self.settings["minus_for_wrong"] else 0)
        if t == "norisk":
            return v, 0           # value уже удвоено
        return v, -v              # кот, аукцион

    def judge(self, correct: bool):
        """Ведущий засчитывает или не засчитывает ответ."""
        if self.phase != "answering" or not self.answerer_id or self.paused:
            return
        pid = self.answerer_id
        good, bad = self._deltas()
        if correct:
            self._add(pid, good)
            self.chooser_id = pid   # кто ответил верно, тот и выбирает дальше
            self.fx("correct", pid=pid)
            self.reveal()
        else:
            self._add(pid, bad)
            self.fx("wrong", pid=pid)
            # Апелляция: если ведущий передумает, игрок получит разницу и право выбора
            self.q.appealable[pid] = good - bad
            if self.q.qtype == "simple":
                self.excluded.add(pid)
                self.answerer_id = None
                self._reopen_or_reveal()
            else:
                self.reveal()

    def _reopen_or_reveal(self):
        """После неверного ответа: если ещё есть кому жать — открываем кнопки снова."""
        left = [p for p in self.online_players() if p.id not in self.excluded]
        if left:
            self.phase = "answering"  # open_buttons принимает переход из answering
            self.open_buttons()
        else:
            self.reveal()

    # ---------- Кот в мешке ----------

    def secret_candidates(self):
        """Кому можно отдать кота: всем, кроме выбравшего (если пак не разрешает себе)."""
        qq = self.question
        online = [p.id for p in self.online_players()]
        others = [pid for pid in online if pid != self.q.giver]
        if qq.give_self or not others:
            return online
        return others

    def give_secret(self, to_pid, by=None, is_host=False, force=False):
        if self.phase != "secret_give" or (self.paused and not force):
            return
        if not force and not is_host and by != self.q.giver:
            return
        if to_pid not in self.secret_candidates():
            return
        self.q.responder = to_pid
        qq = self.question
        lo, hi, step = qq.price_min, qq.price_max, qq.price_step
        if lo <= 0 and hi <= 0:
            lo = hi = qq.price
        if lo == hi:
            self.q.value = lo
            self._intro()
        else:
            # Получатель выбирает цену: из шагов диапазона, а если их слишком много — минимум/максимум
            opts = list(range(lo, hi + 1, step)) if step > 0 else [lo, hi]
            if len(opts) > 8:
                opts = [lo, hi]
            self.q.price_options = opts
            self.phase = "secret_price"
            self._cancel_timer()
        self.fx("pick")

    def secret_price(self, value, by=None, is_host=False):
        if self.phase != "secret_price" or self.paused:
            return
        if not is_host and by != self.q.responder:
            return
        if value not in self.q.price_options:
            return
        self.q.value = value
        self._intro()

    # ---------- Аукцион ----------

    def _start_auction(self):
        """Очередь: начинает выбравший, дальше остальные игроки в сети."""
        online = [p.id for p in self.online_players()]
        start = self.chooser_id if self.chooser_id in online else (online[0] if online else None)
        if start is None:
            self.q.qtype = "simple"
            return self._intro()
        i = online.index(start)
        self.q.order = online[i:] + online[:i]
        self.q.turn = 0
        self.q.bids = {}
        self.q.high = None
        self.phase = "auction"
        self._cancel_timer()

    def auction_turn(self):
        return self.q.order[self.q.turn] if self.phase == "auction" and self.q.order else None

    def auction_limits(self, pid):
        """(минимальная ставка, максимальная ставка) для игрока; None — ставить не может."""
        p = self.players.get(pid)
        if not p:
            return None
        price = self.q.price
        if self.q.high is None:
            # Первая ставка: не меньше номинала. Если очков мало — можно только номинал.
            return (price, max(p.score, price))
        hi = self.q.high[1]
        if p.score <= hi:
            return None
        return (hi + 1, p.score)

    def auction_act(self, pid, action, amount=0, is_host=False):
        """action: 'bid' (ставка amount), 'allin' (ва-банк), 'pass' (пас)."""
        if self.phase != "auction" or self.paused:
            return
        turn = self.auction_turn()
        if not is_host and pid != turn:
            return
        pid = turn
        p = self.players[pid]
        lim = self.auction_limits(pid)
        if action == "pass":
            if self.q.high is None:
                return            # первый обязан сделать ставку (хотя бы номинал)
            self.q.bids[pid] = "pass"
        elif action in ("bid", "allin"):
            if lim is None:
                return
            amount = max(lim[1], self.q.price) if action == "allin" else int(amount)
            if not (lim[0] <= amount <= lim[1]):
                return
            self.q.bids[pid] = amount
            self.q.high = (pid, amount)
            if amount >= p.score and p.score > 0:
                self.fx("allin", pid=pid)
        else:
            return
        self._auction_next()

    def _auction_next(self):
        """Передаём ход следующему, кто ещё может перебить. Если никого — аукцион окончен."""
        order, n = self.q.order, len(self.q.order)
        leader = self.q.high[0] if self.q.high else None
        for step in range(1, n + 1):
            i = (self.q.turn + step) % n
            pid = order[i]
            if pid == leader or self.q.bids.get(pid) == "pass":
                continue
            p = self.players.get(pid)
            if not p or not p.online or self.auction_limits(pid) is None:
                self.q.bids[pid] = "pass"   # не может перебить или вышел — автоматически пас
                continue
            self.q.turn = i
            return
        self.finish_auction()

    def finish_auction(self):
        """Аукцион окончен: отвечает лидер на свою ставку."""
        if self.phase != "auction":
            return
        if self.q.high is None:
            self.q.high = (self.q.order[0], self.q.price)
        self.q.responder, self.q.value = self.q.high
        self._intro()

    # ---------- Вопрос для всех / финал: письменные ответы ----------

    def _start_writing(self):
        if self.q.qtype == "final":
            self.q.eligible = [pid for pid in self.finalists if pid in self.players]
            secs = self.settings["final_write_time"]
        else:
            self.q.eligible = [p.id for p in self.online_players()]
            secs = self.settings["write_time"]
        self.q.answers = {}
        self.q.marks = {}
        self.phase = "writing"
        self._timer(secs, self.close_writing)
        self.fx("open")

    def submit_answer(self, pid, text):
        if self.phase != "writing" or self.paused or pid not in self.q.eligible:
            return
        self.q.answers[pid] = (text or "").strip()[:ANSWER_MAX]
        # Все ответили — сразу к проверке
        online_elig = [x for x in self.q.eligible if self.players.get(x) and self.players[x].online]
        if all(x in self.q.answers for x in online_elig):
            self.close_writing()

    def close_writing(self):
        if self.phase != "writing":
            return
        self.phase = "judging"
        self._cancel_timer()
        # Заранее отмечаем пустые ответы как неверные
        for pid in self.q.eligible:
            if not self.q.answers.get(pid):
                self.q.marks[pid] = False

    def mark(self, pid, correct):
        if self.phase == "judging" and pid in self.q.eligible:
            self.q.marks[pid] = bool(correct)

    def apply_marks(self):
        """Ведущий проверил все ответы: начисляем очки и показываем ответ."""
        if self.phase != "judging":
            return False
        self.q.eligible = [x for x in self.q.eligible if x in self.players]   # вдруг кого-то удалили
        if any(pid not in self.q.marks for pid in self.q.eligible):
            return False
        for pid in self.q.eligible:
            v = self.q.bets.get(pid, 0) if self.q.qtype == "final" else self.q.value
            ok = self.q.marks[pid]
            self._add(pid, v if ok else -v)
            if not ok:
                self.q.appealable[pid] = 2 * v
        self.fx("correct")
        self.reveal(force=True)
        return True

    # ---------- Финал ----------

    def _start_final(self):
        self.finalists = [p.id for p in self.online_players() if p.score > 0]
        if not self.finalists:
            self.phase = "game_over"
            return
        themes = [i for i, t in enumerate(self.round.themes) if t.questions]
        self.final_removed = set()
        if self.settings["play_all_final"] or len(themes) == 1:
            self.final_queue = themes
            self._next_final_question()
        else:
            self.final_queue = []
            # Вычёркивать начинает игрок с наименьшим счётом
            self.finalists.sort(key=lambda pid: self.players[pid].score)
            self.final_turn = 0
            self.phase = "final_themes"
            self._cancel_timer()

    def final_left(self):
        return [i for i, t in enumerate(self.round.themes) if t.questions and i not in self.final_removed]

    def final_remover(self):
        if self.phase != "final_themes" or not self.finalists:
            return None
        return self.finalists[self.final_turn % len(self.finalists)]

    def remove_theme(self, t, by=None, is_host=False):
        if self.phase != "final_themes" or self.paused:
            return
        if not is_host and by != self.final_remover():
            return
        if t not in self.final_left():
            return
        self.final_removed.add(t)
        self.final_turn += 1
        self.fx("pick")
        left = self.final_left()
        if len(left) == 1:
            self.final_queue = left
            self._next_final_question()

    def _next_final_question(self):
        """Следующий финальный вопрос: сначала ставки."""
        if not self.final_queue:
            self.phase = "game_over"
            self._cancel_timer()
            return
        t = self.final_queue.pop(0)
        self.cur = (t, 0)
        self.played.add(self.cur)
        # Финалисты — те, у кого сейчас больше нуля
        self.finalists = [pid for pid in self.finalists if pid in self.players and self.players[pid].score > 0]
        if not self.finalists:
            self.phase = "game_over"
            return
        self.q = QCtx(qtype="final", theme=self.round.themes[t].name, price=0)
        self.answerer_id = None
        self.phase = "final_bets"
        self._timer(self.settings["final_bet_time"], self.close_bets)

    def place_bet(self, pid, amount, is_host=False):
        if self.phase != "final_bets" or (self.paused and not is_host) or pid not in self.finalists:
            return
        p = self.players[pid]
        amount = int(amount)
        if not (1 <= amount <= max(1, p.score)):
            return
        self.q.bets[pid] = amount
        online = [x for x in self.finalists if self.players[x].online]
        if all(x in self.q.bets for x in online):
            self.close_bets()

    def close_bets(self):
        if self.phase != "final_bets":
            return
        # Кто не успел — ставка 1
        for pid in self.finalists:
            self.q.bets.setdefault(pid, 1)
        self._intro()

    # ---------- Показ ответа и апелляции ----------

    def reveal(self, force=False):
        """Показываем правильный ответ."""
        if not force and self.phase not in ("open", "answering", "reading", "intro", "writing", "judging"):
            return
        self.waiting_media = False
        self.phase = "reveal"
        self.answerer_id = None
        qq = self.question
        has_av = any(i.type in ("audio", "video") for i in qq.answer_content)
        # Если в ответе есть звук/видео или это финал — ждём, пока ведущий нажмёт «Дальше»
        long_wait = has_av or self.q.qtype in ("final", "forall")
        self._timer(60 if long_wait else self.settings["reveal_time"], self.after_question)

    def skip(self):
        """Ведущий пропускает вопрос (сразу к ответу)."""
        if self.phase in ("intro", "reading", "open", "answering", "writing", "judging",
                          "secret_give", "secret_price", "auction", "final_bets"):
            self.reveal(force=True)

    def after_question(self):
        """После показа ответа — на табло, к следующему финальному вопросу или к следующему раунду."""
        if self.phase != "reveal":
            return
        self.q.appeals = []
        if self.round.is_final:
            if self.final_queue:
                self._next_final_question()
            else:
                self.phase = "game_over"
                self._cancel_timer()
            return
        total = sum(len(t.questions) for t in self.round.themes)
        if len(self.played) >= total:
            self.next_round()
        else:
            self._to_board()

    def can_appeal(self, pid):
        return (self.settings["allow_appeals"] and self.phase in QUESTION_PHASES
                and pid in self.q.appealable and pid not in self.q.appeal_done)

    def appeal(self, pid):
        if not self.can_appeal(pid):
            return
        self.q.appeal_done.add(pid)
        self.q.appeals.append(pid)
        self.fx("appeal", pid=pid)

    def resolve_appeal(self, pid, accept):
        if pid not in self.q.appeals:
            return
        self.q.appeals.remove(pid)
        if accept:
            self._add(pid, self.q.appealable.pop(pid, 0))
            if self.round and not self.round.is_final:
                self.chooser_id = pid
            self.excluded.discard(pid)
            self.fx("correct", pid=pid)

    # ---------- Ручные правки ведущего ----------

    def set_score(self, pid, value: int):
        if pid in self.players:
            self.players[pid].score = int(value)

    def set_chooser(self, pid):
        if pid in self.players:
            self.chooser_id = pid

    # ================= Снимок состояния для клиентов =================

    def snapshot(self, role: str, pid: str | None = None, media_prefix=""):
        """
        Собирает состояние для конкретного клиента.
        role: 'host' видит правильный ответ и чужие письменные ответы всегда,
              'player' и 'screen' — только в фазе reveal.
        """
        now = time.monotonic()
        host = role == "host"
        reveal = self.phase == "reveal"

        def items(lst):
            return [{"type": i.type,
                     "value": i.value if i.type == "text" else media_prefix + i.value}
                    for i in lst]

        def question_items(lst):
            """
            Текст вопроса для игроков и табло — только та часть, что уже «напечаталась»
            (плюс полсекунды вперёд, чтобы печать на экране шла плавно).
            Раньше весь текст сразу уходил в браузер, и ученик мог прочитать вопрос
            заранее через инструменты разработчика. Ведущий получает текст целиком.
            len — полная длина: браузер заранее оставляет под текст место.
            """
            out = items(lst)
            if host or self.phase not in ("intro", "reading"):
                return out
            speed = self.settings["read_speed"]
            if self.phase == "intro":
                left = 0                                     # заставка: текста ещё не видно
            elif speed <= 0 or not Q.reading_started:
                return out                                   # «сразу весь текст»
            else:
                left = int((now - Q.reading_started + READ_LOOKAHEAD) * speed)
            for it in out:
                if it["type"] != "text":
                    continue
                full = it["value"]
                it["len"] = len(full)
                it["value"] = full[:max(0, left)]
                left -= len(full)
            return out

        s = {
            "phase": self.phase,
            "paused": self.paused,
            "pack": self.pack.name if self.pack else None,
            "players": [
                {"id": p.id, "name": p.name, "score": p.score, "online": p.online,
                 "excluded": p.id in self.excluded, "photo": p.photo}
                for p in self.players.values()
            ],
            "chooser": self.chooser_id,
            "answerer": self.answerer_id,
            "timer": None,
            "settings": self.settings if host else
                        {"players_sound": self.settings["players_sound"],
                         # игрокам и табло нужна скорость прокрутки длинного текста
                         "scroll_speed": self.settings["scroll_speed"]},
        }
        if self.deadline:
            left = self.paused_left if (self.paused and self.paused_left) else max(0.0, self.deadline - now)
            s["timer"] = {"left": left, "total": self.deadline_total or left, "paused": self.paused}

        rnd = self.round
        if rnd and self.phase != "lobby":
            s["round"] = {
                "name": rnd.name,
                "num": self.round_idx + 1,
                "count": len(self.rounds),
                "final": rnd.is_final,
                "themes": [
                    {"name": t.name,
                     "questions": [{"price": q.price, "played": (ti, qi) in self.played}
                                   for qi, q in enumerate(t.questions)]}
                    for ti, t in enumerate(rnd.themes)
                ],
            }

        # ---- Особые фазы до вопроса ----
        Q = self.q
        if self.phase == "final_themes":
            s["final"] = {
                "themes": [{"index": i, "name": t.name, "removed": i in self.final_removed}
                           for i, t in enumerate(rnd.themes) if t.questions],
                "turn": self.final_remover(),
                "finalists": self.finalists,
            }
        if self.phase in QUESTION_PHASES and self.cur is not None:
            s["qtype"] = Q.qtype
            s["finalists"] = self.finalists if Q.qtype == "final" else []
            if Q.qtype == "secret":
                s["secret"] = {"giver": Q.giver, "to": Q.responder, "theme": Q.theme,
                               "value": Q.value if (Q.responder and self.phase != "secret_price") else None,
                               "options": Q.price_options,
                               "candidates": self.secret_candidates() if self.phase == "secret_give" else []}
            if Q.qtype == "stake":
                s["auction"] = {"order": Q.order, "turn": self.auction_turn(), "bids": Q.bids,
                                "high": list(Q.high) if Q.high else None, "price": Q.price,
                                "limits": self.auction_limits(self.auction_turn()) if self.auction_turn() else None}
            if Q.responder:
                s["responder"] = Q.responder
            if Q.qtype == "final":
                s["final_theme"] = Q.theme   # тему финального вопроса знают все
                done = list(Q.bets.keys())
                s["bets"] = {"done": done,
                             "all": Q.bets if (host or reveal) else {},
                             "mine": Q.bets.get(pid) if pid else None}
            if Q.qtype in ("forall", "final") and self.phase in ("writing", "judging", "reveal"):
                show = host or reveal
                s["written"] = {
                    "eligible": Q.eligible,
                    "submitted": [x for x in Q.eligible if Q.answers.get(x)],
                    "answers": Q.answers if show else ({pid: Q.answers[pid]} if pid in Q.answers else {}),
                    "marks": Q.marks if show else {},
                }

        # ---- Сам вопрос ----
        qq = self.question
        if qq and self.phase in ("intro", "reading", "open", "answering", "writing", "judging", "reveal"):
            t, qi = self.cur
            qs = {"theme": Q.theme or rnd.themes[t].name,
                  "price": Q.value if Q.qtype in ("secret", "stake") else Q.price,
                  "qtype": Q.qtype, "cell": [t, qi],
                  "content": question_items(qq.content),
                  "read_speed": self.settings["read_speed"],
                  "read_elapsed": (now - Q.reading_started) if self.phase == "reading" and Q.reading_started else None}
            if host or reveal:
                qs["answer"] = qq.answer
                qs["answer_content"] = items(qq.answer_content)
            if host:
                qs["comment"] = qq.comment
                qs["wrong"] = qq.wrong
            s["question"] = qs

        # Ставки финала видны ведущему ещё до вопроса (для подсказки)
        if host:
            s["appeals"] = list(Q.appeals)
            if qq and self.phase in QUESTION_PHASES:
                s.setdefault("question_preview", {"answer": qq.answer, "wrong": qq.wrong,
                                                  "theme": Q.theme, "price": Q.price})

        if role == "player" and pid in self.players:
            p = self.players[pid]
            s["me"] = {"id": p.id, "name": p.name,
                       "blocked": max(0.0, p.blocked_until - now),
                       "can_appeal": self.can_appeal(pid),
                       "appeal_pending": pid in Q.appeals}
        return s
