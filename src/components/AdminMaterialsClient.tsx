"use client";

import { confirmAction } from "@/components/ui/confirm";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Segmented } from "@/components/ui/segmented";
import { PositionBadge } from "@/components/RoleIcon";
import { FileText, Pencil, PlayCircle, Radio, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DOTA_ROLE_LABELS, DOTA_ROLE_POSITION, MATERIAL_TYPE_LABELS, SKILL_LEVEL_LABELS } from "@/lib/labels";
import { parseSkillLevels } from "@/lib/materials";
import { materialDisplayTitle, parseJsonArray, videoThumbnail } from "@/lib/utils";
import type { LearningMaterial, MaterialType, DotaRole, SkillLevel } from "@prisma/client";

const TYPES: MaterialType[] = ["VIDEO", "STREAM", "ARTICLE"];
const ROLES = Object.keys(DOTA_ROLE_LABELS) as DotaRole[];
const SKILL_LEVELS = Object.keys(SKILL_LEVEL_LABELS) as SkillLevel[];

export function AdminMaterialsClient({ materials }: { materials: LearningMaterial[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<MaterialType>("VIDEO");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [positions, setPositions] = useState<DotaRole[]>([]);
  const [skillLevels, setSkillLevels] = useState<SkillLevel[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [listFilter, setListFilter] = useState<"ALL" | MaterialType>("ALL");

  function togglePosition(r: DotaRole) {
    setPositions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function toggleSkillLevel(level: SkillLevel) {
    setSkillLevels((prev) =>
      prev.includes(level) ? prev.filter((x) => x !== level) : [...prev, level]
    );
  }

  function resetForm() {
    setEditingId(null);
    setType("VIDEO");
    setTitle("");
    setDescription("");
    setUrl("");
    setPositions([]);
    setSkillLevels([]);
    setError("");
  }

  function startEdit(m: LearningMaterial) {
    setFormOpen(true);
    setEditingId(m.id);
    setType(m.type);
    setTitle(m.title ?? "");
    setDescription(m.description ?? "");
    setUrl(m.url ?? "");
    setPositions(parseJsonArray(m.positions) as DotaRole[]);
    setSkillLevels(parseSkillLevels(m.skillLevels));
    setError("");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function create() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          description,
          url,
          positions,
          skillLevels: type === "VIDEO" ? skillLevels : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось добавить");
        return;
      }
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/materials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          type,
          title,
          description,
          url,
          positions,
          skillLevels: type === "VIDEO" ? skillLevels : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction("Удалить материал?"))) return;
    await fetch("/api/materials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (editingId === id) resetForm();
    router.refresh();
  }

  const urlHint =
    type === "STREAM"
      ? "Ссылка на Twitch-канал (twitch.tv/имя или просто имя)"
      : type === "VIDEO"
        ? "Ссылка на видео (YouTube)"
        : "Ссылка на статью";

  const canSubmit = Boolean(url.trim() || title.trim() || description.trim());

  return (
    <div className="space-y-4">
      <CollapsibleCard
        variant="create"
        title={editingId ? "Редактировать материал" : "Добавить материал"}
        description="Видео с YouTube, Twitch-канал или статья"
        open={formOpen || Boolean(editingId)}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) resetForm();
        }}
      >
        <div className="space-y-4">
          <div>
            <Label>Тип</Label>
            <div className="mt-2 flex gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm ${
                    type === t
                      ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-ink)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                  }`}
                >
                  {MATERIAL_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Название (необязательно)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Описание (необязательно)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>{urlHint}</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Для каких позиций</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => togglePosition(r)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    positions.includes(r)
                      ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-ink)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                  }`}
                >
                  {DOTA_ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          {type === "VIDEO" && (
            <div>
              <Label>Для кого это видео</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SKILL_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleSkillLevel(level)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      skillLevels.includes(level)
                        ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-ink)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                    }`}
                  >
                    {SKILL_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {editingId ? (
              <>
                <Button onClick={saveEdit} disabled={saving || !canSubmit}>
                  {saving ? "Сохранение..." : "Сохранить"}
                </Button>
                <Button variant="secondary" onClick={resetForm} disabled={saving}>
                  Отмена
                </Button>
              </>
            ) : (
              <Button onClick={create} disabled={saving || !canSubmit}>
                {saving ? "Добавление..." : "Добавить"}
              </Button>
            )}
          </div>
        </div>
      </CollapsibleCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={listFilter}
          onChange={setListFilter}
          items={[
            { value: "ALL", label: "Все", count: materials.length },
            ...TYPES.map((t) => ({
              value: t,
              label: MATERIAL_TYPE_LABELS[t],
              count: materials.filter((m) => m.type === t).length,
            })),
          ]}
        />
      </div>

      <div className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
        {materials
          .filter((m) => listFilter === "ALL" || m.type === listFilter)
          .map((m) => {
          const pos = parseJsonArray(m.positions) as DotaRole[];
          const levels = parseSkillLevels(m.skillLevels);
          const isEditing = editingId === m.id;
          const thumb = m.type === "VIDEO" ? videoThumbnail(m.url) : null;
          const Icon = m.type === "VIDEO" ? PlayCircle : m.type === "STREAM" ? Radio : FileText;
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 px-3 py-3 min-[720px]:px-4 ${isEditing ? "bg-[var(--admin-bg)]" : ""}`}
            >
              <div className="flex h-12 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--control)] text-[var(--text-3)] min-[720px]:h-14 min-[720px]:w-[100px]">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <Icon className="h-5 w-5" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className="h-5 px-2 text-[11px]">{MATERIAL_TYPE_LABELS[m.type]}</Badge>
                  {pos.map((p) => (
                    <PositionBadge key={p} position={DOTA_ROLE_POSITION[p]} className="h-[18px] w-[18px] text-[10px]" />
                  ))}
                  {levels.map((l) => (
                    <span key={l} className="text-[11px] text-[var(--admin-ink)]">
                      {SKILL_LEVEL_LABELS[l]}
                    </span>
                  ))}
                </div>
                <p className="mt-1 truncate text-[14px] font-semibold text-[var(--text)]">{materialDisplayTitle(m)}</p>
                {m.description && <p className="truncate text-[12px] text-[var(--text-3)]">{m.description}</p>}
                {m.url && (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[12px] text-[var(--admin)] hover:underline"
                  >
                    {m.url}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => startEdit(m)} disabled={saving} aria-label="Править">
                  <Pencil aria-hidden />
                  <span className="hidden min-[720px]:inline">Править</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(m.id)}
                  disabled={saving}
                  aria-label="Удалить"
                  className="px-2 text-[var(--text-3)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
