"""
Сервер «Своей игры» для локальной сети.

Запуск:  python server.py           (порт 8080)
         python server.py 9000      (другой порт)

Страницы:
  /         — игрок (ученики открывают у себя в браузере)
  /host     — ведущий (на этом же компьютере открывается без PIN-кода)
  /screen   — табло для проектора (без правильных ответов)
  /editor   — редактор паков (.siq) для ведущего

Связь с браузерами идёт через WebSocket (/ws): постоянное соединение,
по которому сервер мгновенно рассылает новое состояние игры,
а игроки — нажатия кнопки.
"""

import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import socket
import sys
import time

import aiohttp
from aiohttp import web, WSMsgType

from game import Game
from siq import load_pack, pack_title
from editor import Editor

# ---------- Пути ----------
# Когда программа собрана в .exe (PyInstaller), страницы и шрифты лежат внутри exe
# (папка sys._MEIPASS), а паки и кэш — рядом с exe, чтобы их можно было добавлять.
FROZEN = getattr(sys, "frozen", False)
BASE = os.path.dirname(os.path.abspath(__file__))
RES = getattr(sys, "_MEIPASS", BASE)
STATIC = os.path.join(RES, "static")


def _data_dir():
    """Папка для паков и кэша: рядом с exe, а если туда нельзя писать — в AppData."""
    d = os.path.dirname(sys.executable) if FROZEN else BASE
    try:
        os.makedirs(os.path.join(d, "packs"), exist_ok=True)
        test = os.path.join(d, "packs", ".write_test")
        open(test, "w").close()
        os.remove(test)
        return d
    except OSError:
        alt = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "SvoyaIgra")
        os.makedirs(alt, exist_ok=True)
        return alt


DATA = _data_dir()
PACKS = os.path.join(DATA, "packs")         # сюда кладём .siq
CACHE = os.path.join(DATA, ".cache")        # сюда распаковываются медиа паков
os.makedirs(PACKS, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)

# В собранной версии при первом запуске кладём демо-пак в папку packs
_demo = os.path.join(RES, "demo", "demo.siq")
if os.path.isfile(_demo) and not any(f.lower().endswith(".siq") for f in os.listdir(PACKS)):
    import shutil
    shutil.copy(_demo, os.path.join(PACKS, "Демо-пак.siq"))

HOST_PIN = f"{secrets.randbelow(10000):04d}"   # PIN для входа ведущего с другого компьютера

# ---------- Режим сайта ----------
# Если задан адрес сайта (SVOYA_SITE_URL), игра работает как вкладка сайта startdota.ru:
# кто игрок — узнаём у сайта по его cookie сессии, вести игру может только админ сайта,
# а после игры можно начислить очки школы за места.
SITE_URL = os.environ.get("SVOYA_SITE_URL", "").rstrip("/")      # например http://127.0.0.1:3000
SITE_MODE = bool(SITE_URL)
PUBLIC_URL = os.environ.get("SVOYA_PUBLIC_URL", "")              # например https://startdota.ru/igra/
PUBLIC_SITE = os.environ.get("SVOYA_PUBLIC_SITE", "/")           # куда ведёт кнопка «На сайт»
# Ключ для начисления очков: HMAC от JWT_SECRET сайта — отдельный секрет заводить не нужно
_jwt = os.environ.get("JWT_SECRET", "")
AWARD_KEY = hmac.new(_jwt.encode(), b"igra-award", hashlib.sha256).hexdigest() if _jwt else ""
http_session = None   # клиент для запросов к сайту (создаётся при старте)
_user_cache = {}      # cookie -> (время, пользователь): не дёргаем сайт на каждое переподключение


async def site_user(request):
    """Кто открыл страницу: спрашиваем сайт, передавая cookie браузера. None — не вошёл."""
    cookie = request.headers.get("Cookie", "")
    if not cookie:
        return None
    hit = _user_cache.get(cookie)
    if hit and time.monotonic() - hit[0] < 30:
        return hit[1]
    try:
        async with http_session.get(SITE_URL + "/api/igra/me", headers={"Cookie": cookie},
                                    timeout=aiohttp.ClientTimeout(total=5)) as r:
            user = await r.json() if r.status == 200 else None
    except Exception:
        user = None
    _user_cache[cookie] = (time.monotonic(), user)
    return user
PORT = 8080
DISCOVERY_PORT = 47777   # UDP-порт, по которому приложения игроков ищут игру в сети

game = Game()
clients = {}   # websocket -> {"role": ..., "pid": ...}


# ---------- Определяем адрес компьютера в локальной сети ----------

def local_ips():
    """Список IPv4-адресов этого компьютера в локальной сети."""
    ips = set()
    try:
        # Трюк: «подключаемся» к внешнему адресу без отправки данных — система
        # подставит адрес сетевой карты, через которую идёт трафик
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            ips.add(ip)
    except OSError:
        pass
    ips = [ip for ip in ips if not ip.startswith("127.")]
    # Сначала адреса домашних/школьных сетей
    ips.sort(key=lambda ip: not ip.startswith(("192.168.", "10.", "172.")))
    return ips or ["127.0.0.1"]


JOIN_URL = ""


def configure(port):
    """Задаёт порт и адрес для учеников (вызывается перед запуском)."""
    global PORT, JOIN_URL
    PORT = port
    JOIN_URL = PUBLIC_URL if SITE_MODE else f"http://{local_ips()[0]}:{PORT}"


# ---------- Рассылка состояния ----------

async def send(ws, data):
    try:
        await ws.send_str(json.dumps(data, ensure_ascii=False))
    except Exception:
        pass   # клиент уже отключился — уберём его при закрытии соединения


def media_prefix():
    # Относительный адрес: работает и в корне, и на сайте по пути /igra/
    return f"m/{game.pack.pack_id}/" if game.pack else ""


def state_for(info):
    s = game.snapshot(info["role"], info.get("pid"), media_prefix())
    s["join_url"] = JOIN_URL
    s["site"] = SITE_MODE
    if info["role"] == "host":
        s["packs"] = list_packs()
        s["pack_file"] = game.pack_file
        s["awarded"] = game.awarded
    return s


async def broadcast():
    """Каждому клиенту — его версия состояния (ведущему с ответами, игрокам без)."""
    await asyncio.gather(*(send(ws, {"type": "state", "state": state_for(info)})
                           for ws, info in list(clients.items())))


def notify():
    asyncio.get_event_loop().create_task(broadcast())


def fx(name, to=None, **kw):
    """Звуковой/визуальный эффект: всем или одному игроку (to=id игрока)."""
    msg = {"type": "fx", "name": name, **kw}
    for ws, info in list(clients.items()):
        if to is None or info.get("pid") == to:
            asyncio.get_event_loop().create_task(send(ws, msg))


game.notify = notify
game.fx = fx


def list_packs():
    files = sorted(f for f in os.listdir(PACKS) if f.lower().endswith(".siq"))
    return [{"file": f, "title": pack_title(os.path.join(PACKS, f))} for f in files]


# ---------- Обработка сообщений ----------

def is_local(request):
    return request.remote in ("127.0.0.1", "::1")


async def handle_player(ws, info, msg):
    t = msg.get("type")
    if t == "hello":
        su = info.get("site_user")
        if su:
            # На сайте игрок — это его профиль: имя и «токен» берём с сайта, а не из браузера
            p = game.join(su["name"], "site:" + su["id"], uid=su["id"], photo=su.get("photoUrl"))
        else:
            p = game.join(msg.get("name", "").strip(), msg.get("token"))
        p.online = True
        info["pid"] = p.id
        await send(ws, {"type": "welcome", "pid": p.id, "token": p.token, "name": p.name})
        notify()
    elif not info.get("pid"):
        return
    elif t == "press":
        game.press(info["pid"])
        notify()
    elif t == "choose":
        game.choose(int(msg["t"]), int(msg["q"]), info["pid"])
        notify()
    # ---- Особые вопросы: действия игрока ----
    elif t == "give_secret":                      # отдать кота в мешке
        game.give_secret(msg.get("to"), by=info["pid"])
        notify()
    elif t == "secret_price":                     # выбрать цену кота
        game.secret_price(int(msg["value"]), by=info["pid"])
        notify()
    elif t == "auction":                          # ставка / ва-банк / пас
        game.auction_act(info["pid"], msg.get("action"), int(msg.get("amount") or 0))
        notify()
    elif t == "remove_theme":                     # вычеркнуть тему финала
        game.remove_theme(int(msg["t"]), by=info["pid"])
        notify()
    elif t == "bet":                              # ставка в финале
        game.place_bet(info["pid"], int(msg["amount"]))
        notify()
    elif t == "answer":                           # письменный ответ
        game.submit_answer(info["pid"], str(msg.get("text", "")))
        notify()
    elif t == "appeal":                           # оспорить решение ведущего
        game.appeal(info["pid"])
        notify()
    elif t == "pong":
        # Измеряем задержку сети: сколько шёл пинг туда и обратно
        p = game.players.get(info["pid"])
        if p:
            rtt = time.monotonic() - float(msg["t"])
            if 0 <= rtt < 2:
                # Сглаживаем, чтобы один случайный скачок не испортил оценку
                p.rtt = rtt if p.rtt == 0 else p.rtt * 0.7 + rtt * 0.3


async def handle_host(ws, info, msg):
    t = msg.get("type")
    if t == "select_pack":
        name = os.path.basename(msg.get("file", ""))
        path = os.path.join(PACKS, name)
        if not os.path.isfile(path):
            return await send(ws, {"type": "error", "msg": "Файл не найден"})
        await send(ws, {"type": "info", "msg": "Загружаю пак…"})
        try:
            # Распаковка может занять время (видео) — делаем в отдельном потоке
            pack = await asyncio.get_event_loop().run_in_executor(None, load_pack, path, CACHE)
        except Exception as e:
            return await send(ws, {"type": "error", "msg": f"Не удалось прочитать пак: {e}"})
        game.pack, game.pack_file = pack, name
        game.reset()
        await send(ws, {"type": "info", "msg": f"Пак «{pack.name}» загружен"})
    elif t == "delete_pack":
        await delete_pack(ws, msg.get("file", ""))
    elif t == "start":
        err = game.start()
        if err:
            await send(ws, {"type": "error", "msg": err})
    elif t == "next_round":
        game.next_round()
    elif t == "end_game":
        game.end_game()
    elif t == "to_lobby":
        game.reset()
    elif t == "choose":
        game.choose(int(msg["t"]), int(msg["q"]), None, is_host=True)
    elif t == "unlock_now":
        game.after_reading()
    elif t == "skip_intro":
        game.skip_intro()
    elif t == "pause":
        game.pause()
    elif t == "resume":
        game.resume()
    # ---- Ведущий действует за игрока (если тот не может или не в сети) ----
    elif t == "give_secret":
        game.give_secret(msg.get("to"), is_host=True)
    elif t == "secret_price":
        game.secret_price(int(msg["value"]), is_host=True)
    elif t == "auction":
        game.auction_act(None, msg.get("action"), int(msg.get("amount") or 0), is_host=True)
    elif t == "finish_auction":
        game.finish_auction()
    elif t == "remove_theme":
        game.remove_theme(int(msg["t"]), is_host=True)
    elif t == "close_bets":
        game.close_bets()
    elif t == "close_writing":
        game.close_writing()
    elif t == "mark":
        game.mark(msg.get("pid"), bool(msg.get("correct")))
    elif t == "apply_marks":
        if not game.apply_marks():
            await send(ws, {"type": "error", "msg": "Отметьте ответы всех игроков"})
    elif t == "award":
        await award_points(ws, msg.get("points", []))
    elif t == "resolve_appeal":
        game.resolve_appeal(msg.get("pid"), bool(msg.get("accept")))
    elif t == "media_ended":
        game.media_ended()
    elif t == "judge":
        game.judge(bool(msg.get("correct")))
    elif t == "reveal_now":
        game.reveal()
    elif t == "skip":
        game.skip()
    elif t == "to_board":
        game.after_question()
    elif t == "score":
        game.set_score(msg.get("pid"), int(msg.get("value", 0)))
    elif t == "set_chooser":
        game.set_chooser(msg.get("pid"))
    elif t == "kick":
        pid = msg.get("pid")
        game.kick(pid)
        for w, i in list(clients.items()):
            if i.get("pid") == pid:
                await send(w, {"type": "kicked"})
                await w.close()
    elif t == "settings":
        for k, v in msg.get("values", {}).items():
            if k in game.settings:
                game.settings[k] = type(game.settings[k])(v)
    notify()


async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=10)
    await ws.prepare(request)
    role = request.query.get("role", "player")
    info = {"role": role}

    if role not in ("player", "screen", "host"):
        role = info["role"] = "player"

    if SITE_MODE:
        # На сайте: все — только по профилю, ведущий — только админ сайта
        user = await site_user(request)
        if not user:
            await send(ws, {"type": "need_login"})
            await ws.close()
            return ws
        if role == "host" and user.get("role") != "ADMIN":
            await send(ws, {"type": "auth_failed", "site": True})
            await ws.close()
            return ws
        info["site_user"] = user
    elif role == "host":
        # Ведущий: с этого же компьютера — без PIN, с другого — по PIN
        if not (is_local(request) or request.query.get("pin") == HOST_PIN):
            await send(ws, {"type": "auth_failed"})
            await ws.close()
            return ws

    clients[ws] = info
    await send(ws, {"type": "state", "state": state_for(info)})

    try:
        async for m in ws:
            if m.type != WSMsgType.TEXT:
                continue
            try:
                msg = json.loads(m.data)
            except ValueError:
                continue
            try:
                if info["role"] == "player":
                    await handle_player(ws, info, msg)
                elif info["role"] == "host":
                    await handle_host(ws, info, msg)
            except (KeyError, ValueError, TypeError) as e:
                await send(ws, {"type": "error", "msg": f"Ошибка запроса: {e}"})
    finally:
        clients.pop(ws, None)
        pid = info.get("pid")
        # Игрок офлайн, только если у него не осталось других открытых вкладок
        if pid and pid in game.players and not any(i.get("pid") == pid for i in clients.values()):
            game.players[pid].online = False
            notify()
    return ws


async def pinger(app):
    """Раз в 2 секунды отправляем игрокам пинг, чтобы знать их задержку."""
    async def loop():
        while True:
            await asyncio.sleep(2)
            msg = {"type": "ping", "t": time.monotonic()}
            for ws, info in list(clients.items()):
                if info["role"] == "player":
                    await send(ws, msg)
    task = asyncio.get_event_loop().create_task(loop())
    yield
    task.cancel()


class DiscoveryProtocol(asyncio.DatagramProtocol):
    """
    Отвечает приложениям игроков, которые ищут игру в сети.
    Игрок шлёт широковещательный пакет «SVOYA_IGRA?», мы отвечаем,
    на каком порту игра и что в ней сейчас.
    """

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        if data.strip() != b"SVOYA_IGRA?":
            return
        info = {
            "app": "svoya-igra",
            "port": PORT,
            "host": socket.gethostname(),
            "pack": game.pack.name if game.pack else "",
            "players": len(game.online_players()),
            "phase": game.phase,
        }
        self.transport.sendto(json.dumps(info, ensure_ascii=False).encode(), addr)


async def discovery(app):
    try:
        transport, _ = await asyncio.get_event_loop().create_datagram_endpoint(
            DiscoveryProtocol, local_addr=("0.0.0.0", DISCOVERY_PORT), allow_broadcast=True)
    except OSError:
        transport = None   # порт занят — поиск не заработает, но подключение по адресу будет
    yield
    if transport:
        transport.close()


# ---------- HTTP ----------

def page(name):
    async def h(request):
        return web.FileResponse(os.path.join(STATIC, name),
                                headers={"Cache-Control": "no-cache"})
    return h


MEDIA_RE = re.compile(r"^m\d+\.[a-z0-9]{1,5}$")


async def media(request):
    """Отдаём медиа текущего пака. Поддерживается перемотка видео (Range)."""
    pack_id, name = request.match_info["pack"], request.match_info["name"]
    if not game.pack or pack_id != game.pack.pack_id or not MEDIA_RE.match(name):
        raise web.HTTPNotFound()
    path = os.path.join(game.pack.media_dir, name)
    if not os.path.isfile(path):
        raise web.HTTPNotFound()
    return web.FileResponse(path)


async def delete_pack(ws, file):
    """
    Ведущий удаляет ненужный пак из списка.
    Насовсем не стираем: переносим в packs/.deleted — если удалили по ошибке,
    файл можно вернуть обратно в папку packs.
    """
    name = os.path.basename(file)
    path = os.path.join(PACKS, name)
    if not name.lower().endswith(".siq") or not os.path.isfile(path):
        return await send(ws, {"type": "error", "msg": "Пак не найден"})
    if game.pack_file == name and game.phase != "lobby":
        return await send(ws, {"type": "error", "msg": "Этот пак сейчас в игре — сначала завершите игру"})
    trash = os.path.join(PACKS, ".deleted")
    os.makedirs(trash, exist_ok=True)
    # К имени добавляем дату и время, чтобы пак с тем же названием не затёр прошлый удалённый
    os.replace(path, os.path.join(trash, time.strftime("%Y-%m-%d_%H-%M-%S_") + name))
    if game.pack_file == name:
        game.pack, game.pack_file = None, ""   # удалили выбранный пак — снимаем выбор
    await send(ws, {"type": "info", "msg": f"Пак «{name}» удалён"})


async def host_ok(request):
    """
    Может ли этот запрос делать то, что разрешено только ведущему.
    На сайте — только админ сайта (проверку is_local тут делать нельзя:
    через nginx все запросы приходят с 127.0.0.1). Дома и в классе —
    с этого же компьютера или с правильным PIN.
    """
    if SITE_MODE:
        user = await site_user(request)
        return bool(user and user.get("role") == "ADMIN")
    return is_local(request) or request.query.get("pin") == HOST_PIN


async def upload(request):
    """Ведущий загружает .siq через браузер."""
    if not await host_ok(request):
        raise web.HTTPForbidden()
    reader = await request.multipart()
    field = await reader.next()
    if field is None or not field.filename or not field.filename.lower().endswith(".siq"):
        return web.json_response({"ok": False, "msg": "Нужен файл .siq"})
    name = os.path.basename(field.filename)
    with open(os.path.join(PACKS, name), "wb") as f:
        while chunk := await field.read_chunk(1 << 20):
            f.write(chunk)
    notify()
    return web.json_response({"ok": True, "file": name})


async def award_points(ws, points):
    """
    Очки школы за места (только на сайте). points — [за 1 место, за 2, за 3].
    Места считаются по счёту игры; при равенстве очков место общее.
    Игроки с нулём и минусом ничего не получают.
    """
    if not SITE_MODE or not AWARD_KEY:
        return await send(ws, {"type": "error", "msg": "Очки школы начисляются только в игре на сайте"})
    if game.awarded:
        return await send(ws, {"type": "error", "msg": "Очки за эту игру уже начислены"})
    try:
        pts = [max(0.0, float(x)) for x in points][:3]
    except (TypeError, ValueError):
        return await send(ws, {"type": "error", "msg": "Неверные значения очков"})
    ranked = [p for p in game.players.values() if p.uid and p.score > 0]
    awards = []
    for p in ranked:
        place = 1 + sum(1 for o in ranked if o.score > p.score)
        if place <= len(pts) and pts[place - 1] > 0:
            awards.append({"userId": p.uid, "place": place, "delta": pts[place - 1], "name": p.name})
    if not awards:
        return await send(ws, {"type": "error", "msg": "Некому начислять: нет игроков с плюсом"})
    try:
        async with http_session.post(SITE_URL + "/api/igra/award", json={"gameId": game.game_id, "awards": awards},
                                     headers={"x-igra-key": AWARD_KEY},
                                     timeout=aiohttp.ClientTimeout(total=10)) as r:
            res = await r.json()
    except Exception as e:
        return await send(ws, {"type": "error", "msg": f"Сайт не ответил: {e}"})
    if not res.get("ok"):
        return await send(ws, {"type": "error", "msg": res.get("error", "Сайт отказал в начислении")})
    game.awarded = True
    names = ", ".join(f"{a['name']} +{a['delta']:g}" for a in awards)
    await send(ws, {"type": "info", "msg": f"Очки школы начислены: {names}"})


async def config(request):
    """Страницам: работаем ли на сайте и кто вошёл."""
    data = {"site": SITE_MODE, "site_url": PUBLIC_SITE}
    if SITE_MODE:
        user = await site_user(request)
        data["user"] = {"name": user["name"], "admin": user.get("role") == "ADMIN"} if user else None
    return web.json_response(data, headers={"Cache-Control": "no-cache"})


async def http_client(app):
    global http_session
    http_session = aiohttp.ClientSession()
    yield
    await http_session.close()


async def no_stale_scripts(request, response):
    """
    Скрипты и стили игры браузер должен каждый раз сверять с сервером.
    Иначе после обновления игры браузер мог взять старый host.js из кэша —
    и новые кнопки на пульте просто не работали. Сверка дешёвая: если файл
    не менялся, сервер отвечает «304 — не изменился» без пересылки файла.
    """
    if request.path.startswith("/static/") and request.path.endswith((".js", ".css", ".html")):
        response.headers["Cache-Control"] = "no-cache"


def make_app():
    app = web.Application(client_max_size=4 * 1024 ** 3)  # паки с видео бывают большими
    app.router.add_get("/", page("player.html"))
    app.router.add_get("/host", page("host.html"))
    app.router.add_get("/screen", page("screen.html"))
    app.router.add_get("/editor", page("editor.html"))      # редактор паков
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/m/{pack}/{name}", media)
    app.router.add_post("/api/upload", upload)
    app.router.add_get("/config.json", config)
    app.router.add_static("/static", STATIC)
    # API редактора паков (черновики лежат в папке drafts рядом с packs)
    Editor(DATA, PACKS, host_ok, notify).routes(app)
    app.on_response_prepare.append(no_stale_scripts)
    app.cleanup_ctx.append(pinger)
    app.cleanup_ctx.append(http_client)
    if not SITE_MODE:
        app.cleanup_ctx.append(discovery)   # поиск игры в локальной сети нужен только в классе
    return app


def port_free(port):
    """Проверяем, свободен ли порт (вдруг игра уже запущена)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def serve_forever(port=8080):
    """Запуск сервера в отдельном потоке (из приложения)."""
    configure(port)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    web.run_app(make_app(), host="0.0.0.0", port=port, print=None,
                handle_signals=False, loop=loop)


if __name__ == "__main__":
    # python server.py [порт] [--local-only]
    # --local-only: слушать только 127.0.0.1 (на сервере сайта игра доступна только через nginx)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    bind = "127.0.0.1" if "--local-only" in sys.argv else "0.0.0.0"
    configure(int(args[0]) if args else 8080)
    line = "=" * 56
    print(line)
    print("  СВОЯ ИГРА — сервер запущен" + (" (режим сайта)" if SITE_MODE else ""))
    print(line)
    if SITE_MODE:
        print(f"  Игра на сайте:                {JOIN_URL}")
        print(f"  Сайт для проверки входа:      {SITE_URL}")
        print(f"  Порт службы:                  {PORT} ({bind})")
    else:
        print(f"  Ученикам открыть в браузере:  {JOIN_URL}")
        for ip in local_ips()[1:]:
            print(f"     (или, если не открывается: http://{ip}:{PORT})")
        print(f"  Ведущий (этот компьютер):     http://localhost:{PORT}/host")
        print(f"  Табло для проектора:          http://localhost:{PORT}/screen")
        print(f"  PIN ведущего с другого ПК:    {HOST_PIN}")
        print(f"  Паки (.siq) кладите в папку:  {PACKS}")
    print(line)
    print("  Чтобы остановить сервер — закройте это окно или нажмите Ctrl+C")
    web.run_app(make_app(), host=bind, port=PORT, print=None)
