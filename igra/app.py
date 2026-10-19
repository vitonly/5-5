"""
«Своя игра» как приложение для Windows.

Один и тот же файл SvoyaIgra.exe ставится и ведущему, и ученикам.
При запуске открывается полноэкранное окно с выбором:
  «Играть»      — ищем игру в локальной сети и подключаемся;
  «Вести игру»  — запускаем сервер на этом компьютере и открываем пульт ведущего.

Окно — это встроенный браузер Windows (WebView2, есть в Windows 10/11),
поэтому страницы игры те же, что и в браузерной версии.
"""

import json
import os
import socket
import sys
import threading
import time
import urllib.request

import server

PORT = 8080
CONFIG = os.path.join(server.DATA, "settings.json")   # тут запоминаем последний адрес игры


# ---------- Поиск игры в сети ----------

def broadcast_addresses():
    """Широковещательные адреса: общий и для каждой сети этого компьютера (считаем маску /24)."""
    addrs = {"255.255.255.255"}
    for ip in server.local_ips():
        parts = ip.split(".")
        if len(parts) == 4 and ip != "127.0.0.1":
            addrs.add(".".join(parts[:3] + ["255"]))
    return addrs


def discover(timeout=1.2):
    """
    Шлём в сеть «SVOYA_IGRA?» и собираем ответы серверов.
    Возвращаем список игр: адрес, имя компьютера ведущего, пак, число игроков.
    """
    found = {}
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.settimeout(0.2)
    try:
        for addr in broadcast_addresses():
            try:
                s.sendto(b"SVOYA_IGRA?", (addr, server.DISCOVERY_PORT))
            except OSError:
                pass
        end = time.time() + timeout
        while time.time() < end:
            try:
                data, (ip, _) = s.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                break
            try:
                info = json.loads(data.decode())
            except ValueError:
                continue
            if info.get("app") == "svoya-igra":
                info["url"] = f"http://{ip}:{info['port']}"
                found[info["url"]] = info
    finally:
        s.close()
    return list(found.values())


def reachable(url, timeout=2.5):
    """Проверяем, что по адресу действительно отвечает наша игра."""
    try:
        with urllib.request.urlopen(url + "/static/style.css", timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def normalize(addr):
    """'192.168.1.5' -> 'http://192.168.1.5:8080'"""
    addr = addr.strip().rstrip("/")
    if not addr.startswith("http"):
        addr = "http://" + addr
    host = addr.split("://", 1)[1]
    if ":" not in host:
        addr += f":{PORT}"
    return addr


def load_config():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(**kw):
    cfg = load_config()
    cfg.update(kw)
    try:
        with open(CONFIG, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False)
    except OSError:
        pass


# ---------- Мост между страницей и Python ----------
# Методы этого класса страница вызывает как window.pywebview.api.<метод>()

class Api:
    def __init__(self):
        self.window = None
        self.screen_window = None
        self.server_started = False

    def discover(self):
        return discover()

    def last_address(self):
        return load_config().get("last", "")

    def join(self, addr):
        """Подключиться к игре: проверяем адрес и открываем страницу игрока."""
        url = normalize(addr)
        if not reachable(url):
            return {"ok": False, "msg": f"Не удалось подключиться к {url}"}
        save_config(last=url)
        self.window.load_url(url + "/")
        return {"ok": True}

    def host(self):
        """Запустить игру на этом компьютере и открыть пульт ведущего."""
        if not self.server_started:
            if not server.port_free(PORT):
                # Порт занят: возможно, сервер уже запущен в другом окне
                if reachable(f"http://127.0.0.1:{PORT}"):
                    self.window.load_url(f"http://127.0.0.1:{PORT}/host")
                    return {"ok": True}
                return {"ok": False, "msg": f"Порт {PORT} занят другой программой"}
            threading.Thread(target=server.serve_forever, args=(PORT,), daemon=True).start()
            self.server_started = True
            # Ждём, пока сервер поднимется
            for _ in range(50):
                if reachable(f"http://127.0.0.1:{PORT}", timeout=0.5):
                    break
                time.sleep(0.1)
        self.window.load_url(f"http://127.0.0.1:{PORT}/host")
        return {"ok": True}

    def open_screen(self):
        """Окно табло для проектора. Если подключён второй монитор — открываем на нём."""
        import webview
        if self.screen_window is not None:
            try:
                self.screen_window.show()
                return {"ok": True}
            except Exception:
                self.screen_window = None
        screens = webview.screens
        target = screens[1] if len(screens) > 1 else None
        kw = {"screen": target} if target is not None else {}
        self.screen_window = webview.create_window(
            "Своя игра — табло", f"http://127.0.0.1:{PORT}/screen",
            fullscreen=target is not None, width=1280, height=720,
            background_color="#040925", **kw)  # без моста: выход из табло — Alt+F4
        self.screen_window.events.closed += lambda: setattr(self, "screen_window", None)
        return {"ok": True, "second_monitor": target is not None}

    def is_app(self):
        return True

    def quit(self):
        os._exit(0)


def main():
    try:
        import webview
    except ImportError:
        fatal("Не найдена библиотека pywebview.")
        return

    api = Api()
    launcher = os.path.join(server.STATIC, "launcher.html")
    api.window = webview.create_window(
        "Своя игра", url=launcher, js_api=api,
        fullscreen=True, background_color="#040925", text_select=False)
    try:
        webview.start()
    except Exception as e:
        fatal("Не удалось открыть окно игры.\n\nСкорее всего, на компьютере нет компонента "
              "Microsoft Edge WebView2. Его можно скачать на сайте Microsoft "
              f"(WebView2 Runtime).\n\nТехническая причина: {e}")
    os._exit(0)


def fatal(msg):
    """Сообщение об ошибке в окне Windows (без консоли)."""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, "Своя игра", 0x10)
    except Exception:
        print(msg)


if __name__ == "__main__":
    main()
