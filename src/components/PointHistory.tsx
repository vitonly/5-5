"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import {
  formatPoints,
  categorizePointReason,
  POINT_CATEGORY_LABELS,
  type PointCategory,
} from "@/lib/points";
import type { PointLog } from "@prisma/client";

const FILTERS: Array<PointCategory | "all"> = [
  "all",
  "homework",
  "match",
  "bonus",
  "penalty",
  "other",
];

export function PointHistory({
  logs,
  title = "История очков",
}: {
  logs: PointLog[];
  title?: string;
}) {
  const [filter, setFilter] = useState<PointCategory | "all">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((log) => categorizePointReason(log.reason) === filter);
  }, [logs, filter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`h-9 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors ${
                filter === key
                  ? "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]"
              }`}
            >
              {key === "all" ? "Все" : POINT_CATEGORY_LABELS[key]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-[var(--text-2)]">Пока нет записей</p>
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-muted)] text-left">
                    <th className="px-3 py-2.5 font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                      Дата
                    </th>
                    <th className="px-3 py-2.5 font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                      Событие
                    </th>
                    <th className="px-3 py-2.5 font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                      Источник
                    </th>
                    <th className="px-3 py-2.5 text-right font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                      Очки
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => {
                    const cat = categorizePointReason(log.reason);
                    return (
                      <tr key={log.id} className="border-t border-[var(--border-soft)]">
                        <td className="px-3 py-2.5 font-mono-num text-[12px] text-[var(--text-3)]">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--text)]">{log.reason}</td>
                        <td className="px-3 py-2.5 text-[var(--text-2)]">
                          {POINT_CATEGORY_LABELS[cat]}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-mono-num font-bold ${
                            log.delta > 0
                              ? "text-[var(--success)]"
                              : log.delta < 0
                                ? "text-[var(--danger)]"
                                : "text-[var(--text-3)]"
                          }`}
                        >
                          {log.delta > 0 ? "+" : ""}
                          {formatPoints(log.delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <ul className="space-y-0 md:hidden">
              {filtered.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-soft)] py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[var(--text)]">{log.reason}</p>
                    <p className="font-mono-num text-[12px] text-[var(--text-4)]">
                      {formatDate(log.createdAt)} · {POINT_CATEGORY_LABELS[categorizePointReason(log.reason)]}
                    </p>
                  </div>
                  <span
                    className={`font-mono-num shrink-0 text-right text-[15px] font-bold ${
                      log.delta > 0
                        ? "text-[var(--success)]"
                        : log.delta < 0
                          ? "text-[var(--danger)]"
                          : "text-[var(--text-3)]"
                    }`}
                  >
                    {log.delta > 0 ? "+" : ""}
                    {formatPoints(log.delta)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
