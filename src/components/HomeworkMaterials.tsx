import { MATERIAL_TYPE_LABELS } from "@/lib/labels";
import { materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type { LearningMaterial } from "@prisma/client";

export function HomeworkMaterials({
  materialIds,
  materials,
}: {
  materialIds: string;
  materials: LearningMaterial[];
}) {
  const ids = parseJsonArray(materialIds);
  if (ids.length === 0) return null;

  const attached = ids
    .map((id) => materials.find((m) => m.id === id))
    .filter((m): m is LearningMaterial => Boolean(m));

  if (attached.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text-2)]">Материалы к заданию</p>
      <ul className="space-y-2">
        {attached.map((m) => (
          <li key={m.id}>
            {m.url ? (
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm transition-colors hover:border-[var(--points-border)] hover:bg-[var(--points-bg)]"
              >
                <span className="shrink-0 rounded-[var(--radius-control)] bg-[var(--control)] px-2 py-0.5 text-xs text-[var(--text-3)]">
                  {MATERIAL_TYPE_LABELS[m.type]}
                </span>
                <span className="text-[var(--points)] hover:underline">{materialDisplayTitle(m)}</span>
              </a>
            ) : (
              <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <span className="shrink-0 rounded-[var(--radius-control)] bg-[var(--control)] px-2 py-0.5 text-xs text-[var(--text-3)]">
                  {MATERIAL_TYPE_LABELS[m.type]}
                </span>
                <span className="text-[var(--text)]">{materialDisplayTitle(m)}</span>
                {m.description && (
                  <span className="text-xs text-[var(--text-3)]">— {m.description}</span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
