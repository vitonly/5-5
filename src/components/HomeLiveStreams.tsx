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
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--danger)] opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
        </span>
        <h2 className="text-[17px] leading-snug min-[720px]:text-[20px]">Сейчас в эфире</h2>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {cards.map((c, i) => (
          <div key={i} className="w-[78%] shrink-0 snap-start sm:w-auto">
            {c}
          </div>
        ))}
      </div>
    </section>
  );
}
