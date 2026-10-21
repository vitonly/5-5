import { achievementsLive, rebuildAchievements, TIER_LABELS, type RebuildRow } from "@/lib/achievements";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function page(rows: RebuildRow[], applied: boolean, awardPoints: boolean) {
  const totalNew = rows.reduce((s, r) => s + r.points, 0);
  const totalOld = rows.reduce((s, r) => s + r.oldPoints, 0);
  const body = rows
    .map((r) => {
      const list = r.unlocked
        .map((u) => `${esc(u.title)} <span class="t">${u.secret ? "секретная" : TIER_LABELS[u.tier]}${u.points ? ` +${num(u.points)}` : ""}</span>`)
        .join(", ");
      return `<tr><td>${esc(r.name)}</td><td class="n">${r.unlocked.length}</td><td class="n b">+${num(r.points)}</td><td class="n o">${r.oldPoints ? `−${num(r.oldPoints)}` : "—"}</td><td class="l">${list || "—"}</td></tr>`;
    })
    .join("");
  const status = applied
    ? `<p class="ok">✅ Применено. Старые ачивки и их очки удалены, новые выданы ${awardPoints ? "<b>с очками</b>" : "<b>без очков</b>"}, ученикам отправлено сводное сообщение в Telegram. Автовыдача включена.</p>`
    : `<p>Это <b>предпросмотр</b> — ничего не изменено.</p>
       <p>Применить: <a href="?apply=1&points=0">без очков за прошлое</a> · <a href="?apply=1&points=1">с очками за прошлое</a></p>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пересчёт ачивок</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#14201f;background:#f6f8f7}
table{border-collapse:collapse;width:100%;background:#fff}td,th{border-bottom:1px solid #e3e8e6;padding:8px 10px;text-align:left;vertical-align:top}
th{font-size:12px;color:#5c6b69;text-transform:uppercase;letter-spacing:.04em}.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.b{color:#0b7a80;font-weight:700}.o{color:#b3261e}.l{font-size:12px;color:#3b4847}.t{color:#7a8886}.ok{background:#e3f4ea;padding:10px 12px;border-radius:8px}
a{color:#0b7a80;font-weight:600}
</style></head><body>
<h1 style="font-size:20px">Пересчёт ачивок по всей истории</h1>
${status}
<p>Учеников: ${rows.length} · ачивок к выдаче: ${rows.reduce((s, r) => s + r.unlocked.length, 0)} · очков за них: <b>+${num(totalNew)}</b> · будет снято старых очков: <b>−${num(totalOld)}</b></p>
<table><thead><tr><th>Ученик</th><th class="n">Ачивок</th><th class="n">Очки</th><th class="n">Снимем</th><th>Что откроется</th></tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}

/** GET — предпросмотр; ?apply=1&points=0|1 — применить */
async function getHandler(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Только для админа", { status: 403 });
  }
  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  const awardPoints = url.searchParams.get("points") === "1";
  if (apply && (await achievementsLive()) && url.searchParams.get("force") !== "1") {
    return new Response(
      "Пересборка уже выполнялась. Повторная удалит все ачивки и снова разошлёт сообщения. Если точно нужно — добавь &force=1",
      { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  const rows = await rebuildAchievements({ apply, awardPoints });
  return new Response(page(rows, apply, awardPoints), { headers: { "content-type": "text/html; charset=utf-8" } });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
