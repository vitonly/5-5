"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/button";
import { PlayerCard } from "@/components/PlayerCard";
import { RankMedalPicker } from "@/components/RankMedalPicker";
import { DOTA_ROLE_LABELS } from "@/lib/labels";
import { PlayerLink } from "@/components/PlayerLink";
import { PlayerRolesDisplay } from "@/components/PlayerRolesDisplay";
import {
  hasIncompleteRoles,
  parseSecondaryRoles,
} from "@/lib/secondary-roles";
import { displayName } from "@/lib/utils";
import type { User, PlayerProfile } from "@prisma/client";

type Student = User & { profile: PlayerProfile | null };

export function AdminStudentsClient({ students }: { students: Student[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Student | null>(students[0] || null);
  const [firstName, setFirstName] = useState(selected?.firstName || "");
  const [lastName, setLastName] = useState(selected?.lastName || "");
  const [photoUrl, setPhotoUrl] = useState(selected?.photoUrl || "");
  const [rankTier, setRankTier] = useState<number | null>(selected?.profile?.rankTier ?? null);

  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reminding, setReminding] = useState(false);

  const missingRoles = useMemo(
    () => students.filter((s) => hasIncompleteRoles(s.profile)),
    [students]
  );

  function selectStudent(s: Student) {
    setSelected(s);
    setFirstName(s.firstName);
    setLastName(s.lastName || "");
    setPhotoUrl(s.photoUrl || "");
    setRankTier(s.profile?.rankTier ?? null);
  }

  async function saveStudent() {
    if (!selected) return;
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selected.id,
        firstName,
        lastName,
        photoUrl: photoUrl || null,
        rankTier,
      }),
    });
    router.refresh();
  }

  async function createStudent() {
    setCreating(true);
    setCreateError("");
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: newFirstName,
        lastName: newLastName,
        login: newLogin,
        password: newPassword,
      }),
    });
    setCreating(false);
    if (res.ok) {
      setNewFirstName("");
      setNewLastName("");
      setNewLogin("");
      setNewPassword("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setCreateError(data.error || "Ошибка создания");
    }
  }

  async function impersonate(studentId: string) {
    const res = await fetch("/api/auth/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    }
  }

  async function removeStudent(studentId: string) {
    if (!confirm("Удалить ученика? Это действие нельзя отменить.")) return;
    await fetch("/api/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    if (selected?.id === studentId) setSelected(null);
    router.refresh();
  }

  async function remindRoles(opts: { userId?: string; allIncomplete?: boolean }) {
    setReminding(true);
    try {
      const res = await fetch("/api/students/remind-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.error === "string" ? data.error : "Не удалось отправить");
        return;
      }
      const failNote =
        Array.isArray(data.failed) && data.failed.length
          ? `\nБез TG / ошибка: ${data.failed.join(", ")}`
          : "";
      alert(`Отправлено: ${data.sent}. Пропущено: ${data.skipped}.${failNote}`);
    } finally {
      setReminding(false);
    }
  }

  function rolesHint(s: Student) {
    const missing: string[] = [];
    if (!s.profile?.primaryRole) missing.push("основная");
    const secondary = parseSecondaryRoles(
      s.profile?.secondaryRoles,
      s.profile?.secondaryRole
    );
    if (secondary.length === 0) missing.push("доп.");
    return missing.join(" + ");
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Добавить ученика (логин и пароль)</CardTitle>
          <p className="text-sm text-[var(--text-3)]">
            Ученик войдёт по этому логину и паролю. Для уведомлений в Telegram — попросите привязать бота в профиле.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Имя</Label>
            <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Фамилия (необязательно)</Label>
            <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
          </div>
          <div>
            <Label>Логин</Label>
            <Input value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
          </div>
          <div>
            <Label>Пароль</Label>
            <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button
              onClick={createStudent}
              disabled={creating || !newFirstName || !newLogin || !newPassword}
            >
              {creating ? "Создание..." : "Создать ученика"}
            </Button>
          </div>
          {createError && <p className="text-sm text-[var(--danger)] sm:col-span-2">{createError}</p>}
        </CardContent>
      </Card>

      {missingRoles.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Не заполнены роли ({missingRoles.length})</CardTitle>
              <Button
                size="sm"
                variant="secondary"
                disabled={reminding}
                onClick={() => remindRoles({ allIncomplete: true })}
              >
                {reminding ? "Отправка…" : "Напомнить всем в TG"}
              </Button>
            </div>
            <p className="text-sm text-[var(--text-3)]">
              Нет основной и/или дополнительных ролей. Можно отправить напоминание в Telegram.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {missingRoles.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlayerLink user={s} className="font-medium" />
                      <span className="text-xs text-[var(--danger)]">
                        не хватает: {rolesHint(s)}
                      </span>
                      <span
                        className={`text-xs ${
                          s.telegramChatId ? "text-[var(--success)]" : "text-[var(--text-3)]"
                        }`}
                      >
                        {s.telegramChatId ? "TG ✓" : "TG —"}
                      </span>
                    </div>
                    <PlayerRolesDisplay profile={s.profile} />
                  </div>
                  <Button
                    size="sm"
                    disabled={reminding || !s.telegramChatId}
                    onClick={() => remindRoles({ userId: s.id })}
                    title={
                      s.telegramChatId
                        ? `Напомнить ${displayName(s)}`
                        : "Нет привязанного Telegram"
                    }
                  >
                    Напомнить в TG
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ученики ({students.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-[var(--text-3)]">Учеников пока нет</p>
            ) : (
              <ul className="space-y-2">
                {students.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm ${
                      selected?.id === s.id
                        ? "border border-[var(--admin-border)] bg-[var(--admin-bg)]"
                        : "hover:bg-[var(--control)]"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <PlayerLink user={s} className="shrink-0 font-medium" />
                      <button
                        type="button"
                        onClick={() => selectStudent(s)}
                        className="min-w-0 flex-1 truncate text-left text-[var(--text-4)]"
                      >
                        {s.login && <span> · @{s.login}</span>}
                        <span> — {s.profile?.finalRating ?? "—"}</span>
                        {hasIncompleteRoles(s.profile) && (
                          <span className="ml-2 text-xs text-[var(--danger)]">роли!</span>
                        )}
                        <span
                          className={`ml-2 text-xs ${
                            s.telegramChatId ? "text-[var(--success)]" : "text-[var(--text-3)]"
                          }`}
                        >
                          {s.telegramChatId ? "TG ✓" : "TG —"}
                        </span>
                      </button>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => impersonate(s.id)}>
                      Зайти за него
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => removeStudent(s.id)}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {selected?.profile && (
          <div className="space-y-4">
            <PlayerCard
              user={{
                ...selected,
                firstName,
                lastName: lastName || null,
                photoUrl: photoUrl || null,
              }}
              profile={selected.profile}
            />
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <Label>Имя</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div>
                  <Label>Фамилия</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div>
                  <Label>Аватар</Label>
                  <AvatarUpload
                    photoUrl={photoUrl}
                    onPhotoChange={setPhotoUrl}
                    previewClassName="h-14 w-14 rounded-full border border-[var(--border)] object-cover"
                    showDelete={false}
                  />
                </div>
                <div>
                  <Label>Рейтинг (медаль)</Label>
                  <div className="mt-2">
                    <RankMedalPicker rankTier={rankTier} onChange={setRankTier} />
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-[var(--text-3)]">
                    Основная:{" "}
                    {selected.profile.primaryRole
                      ? DOTA_ROLE_LABELS[selected.profile.primaryRole]
                      : "—"}
                  </p>
                  <PlayerRolesDisplay profile={selected.profile} />
                </div>
                <Button onClick={saveStudent} disabled={!firstName.trim()}>
                  Сохранить
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
