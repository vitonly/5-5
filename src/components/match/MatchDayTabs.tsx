"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";

/** Переключатель «Итоги дня | Игры» в карточке завершённого матча */
export function MatchDayTabs({
  summary,
  games,
  gamesCount,
  initial = "summary",
}: {
  summary: React.ReactNode;
  games: React.ReactNode;
  gamesCount: number;
  initial?: "summary" | "games";
}) {
  const [tab, setTab] = useState<"summary" | "games">(initial);
  return (
    <div>
      <div className="flex justify-center px-4 pt-4 min-[720px]:px-6">
        <Segmented
          stretch={false}
          value={tab}
          onChange={setTab}
          items={[
            { value: "summary", label: "Итоги дня" },
            { value: "games", label: `Игры · ${gamesCount}` },
          ]}
        />
      </div>
      <div hidden={tab !== "summary"}>{summary}</div>
      <div hidden={tab !== "games"}>{games}</div>
    </div>
  );
}
