"use client";

import { useEffect, useState } from "react";
import { StreamCard } from "@/components/StreamCard";
import type { LiveStream } from "@/lib/twitch";

type StreamMaterial = {
  id: string;
  title: string;
  description?: string;
  url?: string | null;
  positions: string;
  type?: string;
};

export function HomeLiveStreams({
  materialByLogin,
}: {
  materialByLogin: Record<string, StreamMaterial>;
}) {
  const [streams, setStreams] = useState<LiveStream[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/streams/live");
        if (!res.ok) return;
        const data = (await res.json()) as { liveStreams?: LiveStream[] };
        if (!cancelled) setStreams(data.liveStreams ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [...streams]
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, 6)
    .map((s) => {
      const material = materialByLogin[s.login.toLowerCase()];
      if (!material) return null;
      return (
        <StreamCard key={s.login} material={material} login={s.login} live={s} />
      );
    })
    .filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 text-[var(--danger)]">Сейчас в эфире</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
    </section>
  );
}
