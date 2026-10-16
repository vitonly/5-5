import { getSessionUser } from "@/lib/session";
import { buildDaySummaryImage } from "@/lib/match-summary-image";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Нужно войти", { status: 401 });
  const { id } = await params;

  const built = await buildDaySummaryImage(id);
  if (!built.ok) return new Response(built.error, { status: built.status });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const buf = Buffer.from(await built.response.arrayBuffer());
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      ...(download ? { "Content-Disposition": `attachment; filename="${built.filename}"` } : {}),
    },
  });
}
