"""
Чтение паков SIGame (.siq).

.siq — это обычный zip-архив. Внутри:
  content.xml  — описание раундов, тем и вопросов;
  Images/, Audio/, Video/ — медиафайлы.

Поддерживаются обе версии формата:
  v4 — старые паки (<scenario><atom ...>);
  v5 — новые паки из SIGame 7/8 (<params><param name="question"><item ...>).

Результат чтения — объект Pack с раундами, темами и вопросами.
Медиафайлы распаковываются в папку кэша и получают короткие номера
(m0.jpg, m1.mp3 ...), чтобы ученики не видели настоящие имена файлов
(в имени файла часто бывает подсказка к ответу).
"""

import hashlib
import os
import posixpath
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import unquote


# ---------- Модель данных ----------

@dataclass
class Item:
    """Один кусочек вопроса или ответа: текст, картинка, звук или видео."""
    type: str            # 'text' | 'image' | 'audio' | 'video'
    value: str           # для текста — сам текст, для медиа — имя файла в кэше (m3.png)


@dataclass
class Question:
    price: int
    kind: str                                   # тип вопроса (уже приведённый): simple, secret, stake, norisk, forall
    content: list = field(default_factory=list)  # список Item — что показываем как вопрос
    answer: str = ""                             # правильный ответ текстом
    answer_content: list = field(default_factory=list)  # медиа, которые показываем вместе с ответом
    comment: str = ""                            # комментарий автора (видит только ведущий)
    wrong: list = field(default_factory=list)    # неправильные ответы из пака (подсказка ведущему)
    # Параметры «кота в мешке»: своя тема, диапазон цены, можно ли отдать себе
    secret_theme: str = ""
    price_min: int = 0
    price_max: int = 0
    price_step: int = 0
    give_self: bool = False       # можно ли оставить кота себе
    no_question: bool = False     # «кот без вопроса»: получатель просто получает очки


# Как называются типы вопросов в паках разных версий -> наши типы
KIND_MAP = {
    "simple": "simple", "": "simple",
    # аукцион
    "stake": "stake", "auction": "stake",
    # кот в мешке
    "secret": "secret", "secretpublicprice": "secret", "secretnoquestion": "secret",
    "cat": "secret", "bagcat": "secret",
    # вопрос без риска (в v4 назывался «вопрос от спонсора»)
    "norisk": "norisk", "sponsored": "norisk",
    # вопрос для всех
    "forall": "forall",
}


def normalize_kind(raw):
    return KIND_MAP.get((raw or "simple").lower(), "simple")


@dataclass
class Theme:
    name: str
    questions: list = field(default_factory=list)


@dataclass
class Round:
    name: str
    is_final: bool
    themes: list = field(default_factory=list)


@dataclass
class Pack:
    name: str
    rounds: list = field(default_factory=list)
    media_dir: str = ""      # папка, куда распакованы медиа этого пака
    pack_id: str = ""        # короткий хэш файла — используется в адресах медиа


# Папки внутри .siq для каждого типа медиа
MEDIA_FOLDERS = {"image": "Images", "audio": "Audio", "video": "Video"}

# В v4 тип 'voice' означает звук
V4_TYPES = {"image": "image", "voice": "audio", "audio": "audio", "video": "video"}


def _strip_ns(root):
    """Убираем пространства имён XML (в v5 они есть), чтобы искать теги по простым именам."""
    for el in root.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def _text(el):
    return (el.text or "").strip() if el is not None else ""


class _MediaStore:
    """
    Отвечает за поиск файла внутри zip по имени из content.xml
    и распаковку его в кэш под коротким именем.
    """

    def __init__(self, zf: zipfile.ZipFile, out_dir: str):
        self.zf = zf
        self.out_dir = out_dir
        self.counter = 0
        self.done = {}  # (папка, имя) -> имя в кэше, чтобы не распаковывать дважды
        # Имена файлов в архиве SIGame кодирует как в URL (%D0%9A...).
        # Строим словарь «раскодированное имя в нижнем регистре» -> настоящее имя в zip.
        self.index = {}
        for name in zf.namelist():
            folder, _, base = name.partition("/")
            if not base:
                continue
            key = (folder.lower(), unquote(base).lower())
            self.index[key] = name

    def get(self, media_type: str, ref: str):
        """Возвращает имя файла в кэше или None, если файла в паке нет."""
        ref = ref.lstrip("@")                      # в v4 ссылки начинаются с @
        folder = MEDIA_FOLDERS[media_type]
        key = (folder.lower(), unquote(ref).lower())
        if key in self.done:
            return self.done[key]
        zip_name = self.index.get(key)
        if zip_name is None:
            return None
        ext = posixpath.splitext(ref)[1].lower() or ".bin"
        cache_name = f"m{self.counter}{ext}"
        self.counter += 1
        target = os.path.join(self.out_dir, cache_name)
        if not os.path.exists(target):
            with self.zf.open(zip_name) as src, open(target, "wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
        self.done[key] = cache_name
        return cache_name


# ---------- Разбор версии 5 ----------

def _v5_items(param, media: _MediaStore):
    """Превращает <param type="content"> в список Item."""
    items = []
    for it in param.findall("item"):
        t = (it.get("type") or "text").lower()
        val = it.text or ""
        if t == "text" or t == "html":
            if val.strip():
                items.append(Item("text", val.strip()))
        elif t in MEDIA_FOLDERS:
            if it.get("isRef", "").lower() == "true":
                cached = media.get(t, val.strip())
                if cached:
                    items.append(Item(t, cached))
                else:
                    items.append(Item("text", f"[нет файла: {val.strip()}]"))
            # медиа, вшитое не по ссылке, встречается редко — пропускаем
    return items


def _int(v, default=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _parse_question_v5(q, media):
    price = _int(q.get("price"))
    raw_kind = q.get("type", "simple") or "simple"
    content, answer_content = [], []
    qq = Question(price, normalize_kind(raw_kind))
    qq.no_question = raw_kind.lower() == "secretnoquestion"
    params = q.find("params")
    if params is not None:
        for p in params.findall("param"):
            name = p.get("name")
            if name == "question":
                content = _v5_items(p, media)
            elif name == "answer":
                answer_content = _v5_items(p, media)
            elif name == "theme":
                # Тема кота: либо просто текст, либо <item>
                qq.secret_theme = (p.text or "").strip() or _text(p.find("item"))
            elif name == "price":
                ns = p.find("numberSet")
                if ns is not None:
                    qq.price_min = _int(ns.get("minimum"))
                    qq.price_max = _int(ns.get("maximum"))
                    qq.price_step = _int(ns.get("step"))
            elif name == "selectionMode":
                qq.give_self = (p.text or "").strip().lower() == "any"
    qq.content, qq.answer_content = content, answer_content
    right = [a.text.strip() for a in q.findall("right/answer") if a.text]
    qq.answer = " / ".join(right)
    qq.wrong = [a.text.strip() for a in q.findall("wrong/answer") if a.text]
    qq.comment = _text(q.find("info/comments"))
    return qq


# ---------- Разбор версии 4 ----------

def _parse_question_v4(q, media):
    price = _int(q.get("price"))
    type_el = q.find("type")
    raw_kind = type_el.get("name", "simple") if type_el is not None else "simple"
    qq = Question(price, normalize_kind(raw_kind))
    if type_el is not None:
        tp = {p.get("name"): (p.text or "").strip() for p in type_el.findall("param")}
        qq.secret_theme = tp.get("theme", "")
        cost = _int(tp.get("cost"), 0)
        qq.price_min = qq.price_max = cost
        qq.give_self = tp.get("self", "").lower() == "true"
    content, answer_content = [], []
    target = content  # всё после атома 'marker' относится к ответу
    for atom in q.findall("scenario/atom"):
        t = (atom.get("type") or "text").lower()
        val = (atom.text or "").strip()
        if t == "marker":
            target = answer_content
            continue
        if t in ("text", "say"):
            if val:
                target.append(Item("text", val))
        elif t in V4_TYPES:
            mt = V4_TYPES[t]
            cached = media.get(mt, val) if val.startswith("@") else None
            target.append(Item(mt, cached) if cached else Item("text", f"[нет файла: {val}]"))
    qq.content, qq.answer_content = content, answer_content
    right = [a.text.strip() for a in q.findall("right/answer") if a.text]
    qq.answer = " / ".join(right)
    qq.wrong = [a.text.strip() for a in q.findall("wrong/answer") if a.text]
    qq.comment = _text(q.find("info/comments"))
    return qq


# ---------- Главная функция ----------

def load_pack(path: str, cache_root: str) -> Pack:
    """Читает .siq и распаковывает медиа в cache_root/<хэш файла>/."""
    with open(path, "rb") as f:
        pack_id = hashlib.sha1(f.read()).hexdigest()[:10]
    out_dir = os.path.join(cache_root, pack_id)
    os.makedirs(out_dir, exist_ok=True)

    with zipfile.ZipFile(path) as zf:
        content_name = next((n for n in zf.namelist() if n.lower() == "content.xml"), None)
        if content_name is None:
            raise ValueError("В архиве нет content.xml — это не пак SIGame")
        root = _strip_ns(ET.fromstring(zf.read(content_name)))
        version = int(float(root.get("version", "4")))
        media = _MediaStore(zf, out_dir)
        parse_q = _parse_question_v5 if version >= 5 else _parse_question_v4

        pack = Pack(name=root.get("name") or os.path.basename(path), media_dir=out_dir, pack_id=pack_id)
        for r in root.findall("rounds/round"):
            rnd = Round(r.get("name", "Раунд"), r.get("type") == "final")
            for t in r.findall("themes/theme"):
                theme = Theme(t.get("name", "Тема"))
                for q in t.findall("questions/question"):
                    theme.questions.append(parse_q(q, media))
                rnd.themes.append(theme)
            pack.rounds.append(rnd)
    return pack


def pack_title(path: str) -> str:
    """Быстро достаёт название пака для списка, не распаковывая медиа."""
    try:
        with zipfile.ZipFile(path) as zf:
            name = next((n for n in zf.namelist() if n.lower() == "content.xml"), None)
            root = _strip_ns(ET.fromstring(zf.read(name)))
            return root.get("name") or os.path.basename(path)
    except Exception:
        return os.path.basename(path) + " (ошибка чтения)"
