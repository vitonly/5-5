/*
 * Отрисовка уроков и текстов заданий полигона из простых блоков (см. Block в lib/poligon/types).
 */
import type { Block } from "@/lib/poligon/types";
import { cn } from "@/lib/utils";
import { RichText } from "./RichText";
import { CopyButton } from "./CopyButton";

const CALLOUT_STYLE = {
  points: {
    box: "border-[var(--points-border)] bg-[var(--points-bg)]",
    title: "text-[var(--points-ink)]",
    label: "Баллы",
  },
  tip: {
    box: "border-[var(--success-border)] bg-[var(--success-bg)]",
    title: "text-[var(--success-ink)]",
    label: "Совет",
  },
  warn: {
    box: "border-[var(--warning-border)] bg-[var(--warning-bg)]",
    title: "text-[var(--warning-ink)]",
    label: "Ловушка",
  },
} as const;

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-[var(--text-2)]">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "h":
      return <h3 className="mt-3 font-display text-[18px] font-semibold text-[var(--text)]">{block.text}</h3>;
    case "p":
      return (
        <p>
          <RichText text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cn("flex flex-col gap-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)]">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead className="bg-[var(--surface-muted)] text-left text-[var(--text)]">
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} className="border-b border-[var(--border)] px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-[var(--border-soft)] last:border-0">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top">
                      <RichText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout": {
      const s = CALLOUT_STYLE[block.tone];
      return (
        <div className={cn("rounded-[var(--radius-control)] border px-4 py-3", s.box)}>
          <p className={cn("mb-1 text-[13px] font-semibold", s.title)}>{block.title ?? s.label}</p>
          <p className="text-[var(--text)]">
            <RichText text={block.text} />
          </p>
        </div>
      );
    }
    case "code":
      return (
        <figure className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)]">
          <div className="flex items-start justify-between gap-2 px-3 py-2">
            <code className="break-all font-mono text-[14px] text-[var(--text)]">{block.text}</code>
            <CopyButton text={block.text} />
          </div>
          {block.caption && (
            <figcaption className="border-t border-[var(--border-soft)] px-3 py-1.5 text-[13px] text-[var(--text-3)]">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "exercise":
      return (
        <div className="rounded-[var(--radius-control)] border border-[var(--admin-border)] bg-[var(--admin-bg)] px-4 py-3">
          <p className="mb-1 text-[13px] font-semibold text-[var(--admin-ink)]">{block.title}</p>
          <p className="text-[var(--text)]">
            <RichText text={block.task} />
          </p>
          {/* Ответ спрятан — сначала попробуй сам */}
          <details className="mt-2">
            <summary className="cursor-pointer text-[13px] font-medium text-[var(--admin-ink)]">Показать ответ</summary>
            <p className="mt-2 text-[var(--text)]">
              <RichText text={block.answer} />
            </p>
          </details>
        </div>
      );
  }
}
