"""
Редактор паков: API для страницы /editor.

Пока ведущий редактирует пак, он хранится на сервере как «черновик» —
папка drafts/<номер>/ с файлами:
  pack.json  — сам пак (раунды, темы, вопросы), см. описание в siq_write.py;
  meta.json  — служебное: под каким именем пак сохранён в игру;
  media/     — картинки, звук и видео, которые вставили в вопросы.

Страница сохраняет черновик сама каждые пару секунд, поэтому работа
не пропадёт, даже если закрыть вкладку. Кнопка «Сохранить в игру»
собирает из черновика настоящий .siq и кладёт его в папку packs.

Все запросы — только для ведущего (проверку делает server.py, функция host_ok).
"""

import asyncio
import json
import os
import re
import secrets
import shutil
import time
from urllib.parse import quote

from aiohttp import web

from siq import pack_title
from siq_write import (MEDIA_EXT, check_pack, media_type_by_ext, new_pack,
                       siq_to_pack, write_siq)

DRAFT_RE = re.compile(r"^[a-f0-9]{12}$")                 # номер черновика
MEDIA_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}\.[a-z0-9]{2,5}$")
MAX_JSON = 5 * 1024 * 1024        # пак без медиа — это просто текст, 5 МБ хватит с запасом
MAX_MEDIA = 300 * 1024 * 1024     # один файл (видео) — не больше 300 МБ

# Как отдавать файлы браузеру (только эти типы — чтобы никто не подсунул страницу со скриптом)
CONTENT_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".bmp": "image/bmp",
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
    ".mp4": "video/mp4", ".webm": "video/webm", ".m4v": "video/mp4", ".mov": "video/quicktime",
}


class Editor:
    def __init__(self, data_dir, packs_dir, host_ok, on_packs_changed):
        self.root = os.path.join(data_dir, "drafts")
        self.packs = packs_dir
        self.host_ok = host_ok                    # async-функция: ведущий ли прислал запрос
        self.on_packs_changed = on_packs_changed  # сообщить пульту, что список паков изменился
        os.makedirs(self.root, exist_ok=True)

    # ---------- Пути и чтение/запись файлов черновика ----------

    def draft_dir(self, request):
        """Папка черновика из адреса запроса. Чужие и выдуманные номера не пропускаем."""
        did = request.match_info["id"]
        path = os.path.join(self.root, did)
        if not DRAFT_RE.match(did) or not os.path.isdir(path):
            raise web.HTTPNotFound(text="Черновик не найден")
        return did, path

    @staticmethod
    def _read_json(path, default=None):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return default

    @staticmethod
    def _write_json(path, data):
        """Пишем во временный файл и подменяем — чтобы при сбое не остался обрывок."""
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)

    def _create(self, pack=None):
        """Новый пустой черновик. Возвращает (номер, папка)."""
        did = secrets.token_hex(6)
        path = os.path.join(self.root, did)
        os.makedirs(os.path.join(path, "media"))
        if pack is not None:
            self._write_json(os.path.join(path, "pack.json"), pack)
        self._write_json(os.path.join(path, "meta.json"), {"file": ""})
        return did, path

    async def _guard(self, request):
        if not await self.host_ok(request):
            raise web.HTTPForbidden(text="Редактор доступен только ведущему")

    # ---------- Обработчики запросов ----------

    async def list_drafts(self, request):
        """Список черновиков, свежие сверху."""
        await self._guard(request)
        items = []
        for did in os.listdir(self.root):
            pj = os.path.join(self.root, did, "pack.json")
            if not DRAFT_RE.match(did) or not os.path.isfile(pj):
                continue
            pack = self._read_json(pj, {})
            meta = self._read_json(os.path.join(self.root, did, "meta.json"), {})
            items.append({"id": did, "name": pack.get("name") or "Без названия",
                          "file": meta.get("file", ""), "updated": os.path.getmtime(pj)})
        items.sort(key=lambda x: -x["updated"])
        return web.json_response(items)

    async def create_draft(self, request):
        """
        Новый черновик:
          {}                    — пустой пак-заготовка;
          {"from": "file.siq"}  — копия пака, который уже лежит в игре.
        """
        await self._guard(request)
        try:
            body = await request.json() if request.can_read_body else {}
        except ValueError:
            body = {}
        src = os.path.basename(str(body.get("from") or ""))
        if not src:
            did, _ = self._create(new_pack())
            return web.json_response({"id": did})
        path = os.path.join(self.packs, src)
        if not os.path.isfile(path):
            return web.json_response({"ok": False, "msg": "Пак не найден"}, status=404)
        did = await self._import(path, keep_name=src)
        return web.json_response({"id": did})

    async def import_siq(self, request):
        """Открыть в редакторе .siq с компьютера ведущего (файл приходит формой)."""
        await self._guard(request)
        reader = await request.multipart()
        field = await reader.next()
        if field is None or not (field.filename or "").lower().endswith(".siq"):
            return web.json_response({"ok": False, "msg": "Нужен файл .siq"}, status=400)
        tmp = os.path.join(self.root, f"upload_{secrets.token_hex(4)}.siq")
        try:
            with open(tmp, "wb") as f:
                while chunk := await field.read_chunk(1 << 20):
                    f.write(chunk)
            did = await self._import(tmp)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        return web.json_response({"id": did})

    async def _import(self, siq_path, keep_name=""):
        """Разбираем .siq в новый черновик. Это может быть долго (видео) — в отдельном потоке."""
        did, path = self._create()
        try:
            pack = await asyncio.get_event_loop().run_in_executor(
                None, siq_to_pack, siq_path, os.path.join(path, "media"))
        except Exception as e:
            shutil.rmtree(path, ignore_errors=True)
            raise web.HTTPBadRequest(text=f"Не удалось прочитать пак: {e}")
        self._write_json(os.path.join(path, "pack.json"), pack)
        # Открыли пак из игры — «Сохранить в игру» перезапишет именно его
        self._write_json(os.path.join(path, "meta.json"), {"file": keep_name})
        return did

    async def get_draft(self, request):
        await self._guard(request)
        did, path = self.draft_dir(request)
        pack = self._read_json(os.path.join(path, "pack.json"))
        if pack is None:
            raise web.HTTPNotFound(text="Черновик повреждён")
        meta = self._read_json(os.path.join(path, "meta.json"), {})
        return web.json_response({"id": did, "pack": pack, "file": meta.get("file", "")})

    async def save_draft(self, request):
        """Автосохранение: страница присылает пак целиком."""
        await self._guard(request)
        _, path = self.draft_dir(request)
        raw = await request.read()
        if len(raw) > MAX_JSON:
            return web.json_response({"ok": False, "msg": "Пак слишком большой"}, status=413)
        try:
            pack = json.loads(raw)
        except ValueError:
            return web.json_response({"ok": False, "msg": "Испорченные данные"}, status=400)
        if not isinstance(pack, dict) or not isinstance(pack.get("rounds"), list):
            return web.json_response({"ok": False, "msg": "Неверный формат пака"}, status=400)
        self._write_json(os.path.join(path, "pack.json"), pack)
        return web.json_response({"ok": True, "saved": time.time()})

    async def delete_draft(self, request):
        await self._guard(request)
        _, path = self.draft_dir(request)
        shutil.rmtree(path, ignore_errors=True)
        return web.json_response({"ok": True})

    async def upload_media(self, request):
        """
        Загрузка картинки/звука/видео в черновик (вставка из буфера, перетаскивание, выбор файла).
        Файл получает случайное имя: так не бывает совпадений,
        а ученики не увидят подсказку в названии файла.
        """
        await self._guard(request)
        _, path = self.draft_dir(request)
        reader = await request.multipart()
        field = await reader.next()
        if field is None or not field.filename:
            return web.json_response({"ok": False, "msg": "Файл не пришёл"}, status=400)
        mtype = media_type_by_ext(field.filename)
        if not mtype:
            allowed = ", ".join(sorted(e for s in MEDIA_EXT.values() for e in s))
            return web.json_response({"ok": False, "msg": f"Такой файл не подходит. Можно: {allowed}"}, status=400)
        ext = os.path.splitext(field.filename)[1].lower()
        name = secrets.token_hex(6) + ext
        target = os.path.join(path, "media", name)
        size = 0
        try:
            with open(target, "wb") as f:
                while chunk := await field.read_chunk(1 << 20):
                    size += len(chunk)
                    if size > MAX_MEDIA:
                        raise ValueError
                    f.write(chunk)
        except ValueError:
            os.remove(target)
            return web.json_response({"ok": False, "msg": "Файл больше 300 МБ"}, status=413)
        return web.json_response({"ok": True, "type": mtype, "value": name})

    async def get_media(self, request):
        """Отдаём файл черновика для предпросмотра на странице редактора."""
        await self._guard(request)
        _, path = self.draft_dir(request)
        name = request.match_info["name"]
        ext = os.path.splitext(name)[1].lower()
        file = os.path.join(path, "media", name)
        if not MEDIA_NAME_RE.match(name) or ext not in CONTENT_TYPES or not os.path.isfile(file):
            raise web.HTTPNotFound()
        return web.FileResponse(file, headers={
            "Content-Type": CONTENT_TYPES[ext],
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=86400",
        })

    async def _build(self, path, out_path):
        pack = self._read_json(os.path.join(path, "pack.json"), {})
        await asyncio.get_event_loop().run_in_executor(
            None, write_siq, pack, os.path.join(path, "media"), out_path)
        return pack

    @staticmethod
    def _safe_filename(name):
        """Название пака -> имя файла: убираем символы, которые нельзя в именах файлов Windows."""
        name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", name).strip(" .")[:80]
        return (name or "Пак") + ".siq"

    async def publish(self, request):
        """«Сохранить в игру»: собираем .siq в папку packs. Пак сразу виден на пульте."""
        await self._guard(request)
        _, path = self.draft_dir(request)
        pack = self._read_json(os.path.join(path, "pack.json"), {})
        meta_path = os.path.join(path, "meta.json")
        meta = self._read_json(meta_path, {})
        file = meta.get("file") or ""
        if not file:
            # Первое сохранение: имя по названию пака, не затирая чужие паки
            base = self._safe_filename(pack.get("name", ""))
            file, n = base, 2
            while os.path.exists(os.path.join(self.packs, file)):
                file = f"{base[:-4]} ({n}).siq"
                n += 1
        await self._build(path, os.path.join(self.packs, file))
        meta["file"] = file
        self._write_json(meta_path, meta)
        self.on_packs_changed()
        return web.json_response({"ok": True, "file": file, "problems": check_pack(pack)})

    async def download(self, request):
        """«Скачать .siq»: тот же файл, но отдаём браузеру."""
        await self._guard(request)
        _, path = self.draft_dir(request)
        out = os.path.join(path, "export.siq")
        pack = await self._build(path, out)
        fname = self._safe_filename(pack.get("name", ""))
        return web.FileResponse(out, headers={
            "Content-Type": "application/octet-stream",
            # filename* — чтобы русское название файла не превратилось в кракозябры
            "Content-Disposition": f"attachment; filename=\"pack.siq\"; filename*=UTF-8''{quote(fname)}",
            "Cache-Control": "no-store",
        })

    async def check(self, request):
        """Проверка пака перед игрой: пустые вопросы, вопросы без ответа и т. п."""
        await self._guard(request)
        _, path = self.draft_dir(request)
        pack = self._read_json(os.path.join(path, "pack.json"), {})
        return web.json_response({"problems": check_pack(pack)})

    async def game_packs(self, request):
        """Паки, которые уже лежат в игре (их можно открыть в редакторе)."""
        await self._guard(request)
        files = sorted(f for f in os.listdir(self.packs) if f.lower().endswith(".siq"))
        return web.json_response([{"file": f, "title": pack_title(os.path.join(self.packs, f))} for f in files])

    def routes(self, app):
        r = app.router
        r.add_get("/api/editor/packs", self.game_packs)
        r.add_get("/api/editor/drafts", self.list_drafts)
        r.add_post("/api/editor/drafts", self.create_draft)
        r.add_post("/api/editor/import", self.import_siq)
        r.add_get("/api/editor/drafts/{id}", self.get_draft)
        r.add_put("/api/editor/drafts/{id}", self.save_draft)
        r.add_delete("/api/editor/drafts/{id}", self.delete_draft)
        r.add_post("/api/editor/drafts/{id}/media", self.upload_media)
        r.add_get("/api/editor/drafts/{id}/media/{name}", self.get_media)
        r.add_post("/api/editor/drafts/{id}/publish", self.publish)
        r.add_get("/api/editor/drafts/{id}/download", self.download)
        r.add_get("/api/editor/drafts/{id}/check", self.check)
