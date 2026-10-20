"""
Запись паков SIGame (.siq) — обратная сторона siq.py.

Редактор хранит пак как простой словарь (JSON), а этот модуль:
  - превращает словарь в content.xml формата v5 (как в SIGame 7/8);
  - собирает .siq: zip-архив с content.xml и папками Images/, Audio/, Video/;
  - умеет и наоборот: открыть готовый .siq и сделать из него словарь для редактора.

Как выглядит пак-словарь:
  {
    "name": "Мой пак", "author": "Тренер",
    "rounds": [
      {"name": "Раунд 1", "final": false, "themes": [
        {"name": "Герои", "questions": [
          {"price": 100, "kind": "simple",
           "question": [{"type": "text", "value": "Кто это?"}, {"type": "image", "value": "a1b2.png"}],
           "answer_media": [],            # что показать вместе с ответом
           "right": ["Пудж"], "wrong": [], "comment": "",
           # только для кота в мешке:
           "secret_theme": "", "price_min": 0, "price_max": 0, "price_step": 0, "give_self": false}
        ]}
      ]}
    ]
  }
Медиа в словаре — это просто имена файлов из папки media черновика.

Описание формата: https://github.com/VladimirKhil/SI (лицензия MIT), assets/siq_5.xsd.
"""

import os
import shutil
import tempfile
import uuid
import zipfile
import xml.etree.ElementTree as ET
from datetime import date

from siq import load_pack

# Пространство имён формата v5 (так пишет SIQuester)
NS = "https://github.com/VladimirKhil/SI/blob/master/assets/siq_5.xsd"

# Типы вопросов — ровно так, как их называет SIGame
KINDS = ("simple", "secret", "secretNoQuestion", "stake", "noRisk", "forAll")

# Наши типы после чтения (siq.py) -> типы SIGame
KIND_FROM_READER = {"simple": "simple", "secret": "secret", "stake": "stake",
                    "norisk": "noRisk", "forall": "forAll"}

# В какую папку архива класть файл каждого типа
MEDIA_FOLDERS = {"image": "Images", "audio": "Audio", "video": "Video"}

# Какие файлы разрешены (по расширению). SVG и HTML нельзя: в них может быть скрипт.
MEDIA_EXT = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"},
    "audio": {".mp3", ".ogg", ".wav", ".m4a", ".aac"},
    "video": {".mp4", ".webm", ".m4v", ".mov"},
}


def media_type_by_ext(name):
    """По расширению файла понимаем, картинка это, звук или видео. None — файл не подходит."""
    ext = os.path.splitext(name)[1].lower()
    for t, exts in MEDIA_EXT.items():
        if ext in exts:
            return t
    return None


# ---------- Мелкие помощники ----------

def _int(v, default=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _str(v, limit=10000):
    """Строка без лишних пробелов по краям и не длиннее limit."""
    return str(v or "").strip()[:limit]


def _sub(parent, tag, text=None, **attrs):
    """Создаёт дочерний XML-тег с атрибутами (пустые атрибуты не пишем)."""
    el = ET.SubElement(parent, f"{{{NS}}}{tag}", {k: str(v) for k, v in attrs.items() if v not in (None, "")})
    if text is not None:
        el.text = text
    return el


def empty_question(price=100):
    return {"price": price, "kind": "simple", "question": [], "answer_media": [],
            "right": [], "wrong": [], "comment": "",
            "secret_theme": "", "price_min": 0, "price_max": 0, "price_step": 0, "give_self": False}


def new_pack(name="Новый пак", author=""):
    """Заготовка: один раунд, одна тема, пять вопросов по 100…500."""
    return {"name": name, "author": author, "rounds": [
        {"name": "Раунд 1", "final": False, "themes": [
            {"name": "Тема 1", "questions": [empty_question(p) for p in (100, 200, 300, 400, 500)]}
        ]}
    ]}


# ---------- Словарь -> content.xml ----------

def used_media(pack):
    """Все медиафайлы, на которые ссылается пак: {имя файла: тип}."""
    found = {}
    for r in pack.get("rounds", []):
        for t in r.get("themes", []):
            for q in t.get("questions", []):
                for it in q.get("question", []) + q.get("answer_media", []):
                    if it.get("type") in MEDIA_FOLDERS and it.get("value"):
                        found[it["value"]] = it["type"]
    return found


def _content_param(params, name, items):
    """<param name="question|answer" type="content"> со списком текстов и файлов."""
    items = [it for it in items if _str(it.get("value"))]
    if not items:
        return
    p = _sub(params, "param", name=name, type="content")
    for it in items:
        t = it.get("type", "text")
        if t in MEDIA_FOLDERS:
            _sub(p, "item", _str(it["value"], 200), type=t, isRef="True")
        else:
            _sub(p, "item", _str(it["value"]))


def _question_xml(parent, q, final):
    kind = q.get("kind") if q.get("kind") in KINDS else "simple"
    price = 0 if final else max(0, _int(q.get("price")))
    el = _sub(parent, "question", price=price, type="" if kind == "simple" or final else kind)
    params = _sub(el, "params")

    # Особые параметры кота в мешке: тема, цена, кому можно отдать
    if kind in ("secret", "secretNoQuestion") and not final:
        _sub(params, "param", _str(q.get("secret_theme"), 200) or "Кот в мешке", name="theme")
        lo = max(0, _int(q.get("price_min")) or price)
        hi = max(lo, _int(q.get("price_max")) or lo)
        step = max(0, _int(q.get("price_step")))
        p = _sub(params, "param", name="price", type="numberSet")
        _sub(p, "numberSet", minimum=lo, maximum=hi, step=step if hi > lo else 0)
        _sub(params, "param", "any" if q.get("give_self") else "exceptCurrent", name="selectionMode")

    _content_param(params, "question", q.get("question", []))
    _content_param(params, "answer", q.get("answer_media", []))
    if not len(params):
        el.remove(params)

    if _str(q.get("comment")):
        _sub(_sub(el, "info"), "comments", _str(q["comment"]))
    # Тег <right> обязателен, даже если ответа нет (например, у «кота без вопроса»)
    right = _sub(el, "right")
    for a in [_str(a, 500) for a in q.get("right", []) if _str(a)] or [""]:
        _sub(right, "answer", a)
    wrong = [_str(a, 500) for a in q.get("wrong", []) if _str(a)]
    if wrong:
        w = _sub(el, "wrong")
        for a in wrong:
            _sub(w, "answer", a)


def pack_to_xml(pack):
    """Собирает content.xml (байты в UTF-8)."""
    ET.register_namespace("", NS)
    root = ET.Element(f"{{{NS}}}package", {
        "name": _str(pack.get("name"), 200) or "Без названия",
        "version": "5",
        "id": str(uuid.uuid4()),
        "date": date.today().strftime("%d.%m.%Y"),
        "difficulty": "5",
        "generator": "Своя игра — редактор паков",
    })
    if _str(pack.get("author")):
        _sub(_sub(_sub(root, "info"), "authors"), "author", _str(pack["author"], 200))
    rounds = _sub(root, "rounds")
    for r in pack.get("rounds", []):
        final = bool(r.get("final"))
        rel = _sub(rounds, "round", name=_str(r.get("name"), 200) or "Раунд", type="final" if final else "")
        themes = _sub(rel, "themes")
        for t in r.get("themes", []):
            tel = _sub(themes, "theme", name=_str(t.get("name"), 200) or "Тема")
            qs = _sub(tel, "questions")
            for q in t.get("questions", []):
                _question_xml(qs, q, final)
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def check_pack(pack):
    """Что помешает играть: список понятных предупреждений (пустой — всё хорошо)."""
    problems = []
    rounds = pack.get("rounds", [])
    if not rounds:
        problems.append("В паке нет ни одного раунда")
    for ri, r in enumerate(rounds, 1):
        rname = _str(r.get("name")) or f"Раунд {ri}"
        if not r.get("themes"):
            problems.append(f"«{rname}»: нет тем")
        for t in r.get("themes", []):
            tname = _str(t.get("name")) or "Тема"
            if not t.get("questions"):
                problems.append(f"«{rname}» → «{tname}»: нет вопросов")
            for qi, q in enumerate(t.get("questions", []), 1):
                where = f"«{rname}» → «{tname}» → вопрос {qi}"
                if not any(_str(it.get("value")) for it in q.get("question", [])) and q.get("kind") != "secretNoQuestion":
                    problems.append(f"{where}: пустой вопрос")
                if not any(_str(a) for a in q.get("right", [])) and q.get("kind") != "secretNoQuestion":
                    problems.append(f"{where}: нет правильного ответа")
    return problems


def write_siq(pack, media_dir, out_path):
    """
    Сохраняет пак в файл .siq.
    Сначала пишем во временный файл и только потом заменяем — так при сбое
    старый пак не испортится наполовину записанным.
    """
    folder = os.path.dirname(out_path) or "."
    fd, tmp = tempfile.mkstemp(suffix=".siq", dir=folder)
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w") as zf:
            zf.writestr("content.xml", pack_to_xml(pack), compress_type=zipfile.ZIP_DEFLATED)
            for name, mtype in used_media(pack).items():
                src = os.path.join(media_dir, os.path.basename(name))
                if os.path.isfile(src):
                    # Картинки, звук и видео уже сжаты — кладём как есть, без повторного сжатия
                    zf.write(src, f"{MEDIA_FOLDERS[mtype]}/{os.path.basename(name)}", compress_type=zipfile.ZIP_STORED)
        os.replace(tmp, out_path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


# ---------- .siq -> словарь (открыть готовый пак в редакторе) ----------

def _items(items):
    return [{"type": it.type, "value": it.value} for it in items]


def siq_to_pack(siq_path, media_dir):
    """
    Читает .siq и возвращает пак-словарь. Медиа копируются в media_dir.
    Используем готовый читатель siq.py: он понимает и старые (v4), и новые (v5) паки.
    """
    os.makedirs(media_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as cache:
        p = load_pack(siq_path, cache)
        for name in os.listdir(p.media_dir):
            if media_type_by_ext(name):
                shutil.move(os.path.join(p.media_dir, name), os.path.join(media_dir, name))

    pack = {"name": p.name, "author": "", "rounds": []}
    for r in p.rounds:
        rd = {"name": r.name, "final": r.is_final, "themes": []}
        for t in r.themes:
            td = {"name": t.name, "questions": []}
            for q in t.questions:
                kind = KIND_FROM_READER.get(q.kind, "simple")
                if kind == "secret" and q.no_question:
                    kind = "secretNoQuestion"
                qd = empty_question(q.price)
                qd.update({
                    "kind": kind,
                    "question": _items(q.content),
                    "answer_media": _items(q.answer_content),
                    "right": list(q.right),
                    "wrong": list(q.wrong),
                    "comment": q.comment,
                    "secret_theme": q.secret_theme,
                    "price_min": q.price_min, "price_max": q.price_max, "price_step": q.price_step,
                    "give_self": q.give_self,
                })
                td["questions"].append(qd)
            rd["themes"].append(td)
        pack["rounds"].append(rd)
    return pack
