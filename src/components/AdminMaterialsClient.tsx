"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DOTA_ROLE_LABELS, MATERIAL_TYPE_LABELS, SKILL_LEVEL_LABELS } from "@/lib/labels";
import { parseSkillLevels } from "@/lib/materials";
import { materialDisplayTitle, parseJsonArray } from "@/lib/utils";
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
    if (!confirm("Удалить материал?")) return;
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
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Редактировать материал" : "Добавить материал"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
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
                      ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
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
                        ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
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
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {materials.map((m) => {
          const pos = parseJsonArray(m.positions) as DotaRole[];
          const levels = parseSkillLevels(m.skillLevels);
          const isEditing = editingId === m.id;
          return (
            <Card
              key={m.id}
              className={isEditing ? "ring-2 ring-[var(--admin-border)]" : undefined}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge>{MATERIAL_TYPE_LABELS[m.type]}</Badge>
                    <CardTitle className="mt-2">{materialDisplayTitle(m)}</CardTitle>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startEdit(m)}
                      disabled={saving}
                    >
                      Править
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => remove(m.id)}
                      disabled={saving}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {m.description && (
                  <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{m.description}</p>
                )}
                {m.url && (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--admin)] underline hover:brightness-110"
                  >
                    {m.url}
                  </a>
                )}
                {pos.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pos.map((p) => (
                      <span
                        key={p}
                        className="rounded border border-[var(--border)] bg-[var(--control)] px-2 py-0.5 text-xs text-[var(--text-2)]"
                      >
                        {DOTA_ROLE_LABELS[p]}
                      </span>
                    ))}
                  </div>
                )}
                {levels.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {levels.map((l) => (
                      <span
                        key={l}
                        className="rounded border border-[var(--admin-border)] bg-[var(--admin-bg)] px-2 py-0.5 text-xs text-[var(--admin)]"
                      >
                        {SKILL_LEVEL_LABELS[l]}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
