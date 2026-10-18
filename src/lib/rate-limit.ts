/**
 * Простой счётчик неудачных попыток в памяти процесса (сайт работает одним процессом на VPS).
 * Защищает вход от подбора паролей. После перезапуска сервера счётчики обнуляются — это нормально.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Сколько секунд ещё ждать, если лимит исчерпан; 0 — можно пробовать */
export function retryAfterSec(key: string, limit: number): number {
  const b = buckets.get(key);
  if (!b) return 0;
  const now = Date.now();
  if (b.resetAt <= now) {
    buckets.delete(key);
    return 0;
  }
  return b.count >= limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

/** Засчитать неудачную попытку */
export function hit(key: string, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
  // Не даём карте расти бесконечно
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
}

export function reset(key: string) {
  buckets.delete(key);
}

/** IP клиента за nginx */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
