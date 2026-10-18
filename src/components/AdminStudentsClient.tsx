"use client";

import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
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
import { Avatar } from "@/components/home/Avatar";
import { LogIn, Trash2 } from "lucide-react";
import type { User, PlayerProfile } from "@prisma/client";

type Student = User & { profile: PlayerProfile | null };

export function AdminStudentsClient({ students }: { students: Student[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Student | null>(students[0] || null);
  const [firstName, setFirstName] = useState(selected?.firstName || "");
  const [lastName, setLastName] = useState(selected?.lastName || "");
  const [photoUrl, setPhotoUrl] = useState(selected?.photoUrl || "");
  const [rankTier, setRankTier] = useState<number | null>(selected?.profile?.rankTier ?? null);
  const [login, setLogin] = useState(selected?.login || "");
  const [password, setPassword] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [query, setQuery] = useState("");
  const [notifyingCreds, setNotifyingCreds] = useState(false);

  const missingRoles = useMemo(
    () => students.filter((s) => hasIncompleteRoles(s.profile)),
    [students]
  );

  const pendingCredentials = useMemo(
    () =>
      students.filter(
        (s) => Boolean(s.login && s.loginPasswordTemp && s.telegramChatId)
      ),
    [students]
  );
  const pendingNoTg = useMemo(
    () =>
      students.filter(
        (s) => Boolean(s.login && s.loginPasswordTemp && !s.telegramChatId)
      ),
    [students]
  );

  function selectStudent(s: Student) {
    setSelected(s);
    setFirstName(s.firstName);
    setLastName(s.lastName || "");
    setPhotoUrl(s.photoUrl || "");
    setRankTier(s.profile?.rankTier ?? null);
    setLogin(s.login || "");
    setPassword("");
    setSaveError("");
  }

  async function saveStudent() {
    if (!selected) return;
    setSaving(true);
    setSaveError("");
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selected.id,
        firstName,
        lastName,
        photoUrl: photoUrl || null,
        rankTier,
        login,
        ...(password.trim() ? { password: password.trim() } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
      return;
    }
    setPassword("");
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
    if (!(await confirmAction("Удалить ученика? Это действие нельзя отменить."))) return;
    await fetch("/api/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    if (selected?.id === studentId) setSelected(null);
    router.refresh();
  }

  async function notifyCredentials(opts?: {
    userId?: string;
    testToAdmin?: boolean;
  }) {
    setNotifyingCreds(true);
    try {
      const res = await fetch("/api/students/notify-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const skip =
          Array.isArray(data.skippedNames) && data.skippedNames.length
            ? `\nБез TG: ${data.skippedNames.join(", ")}`
            : "";
        toast.error(
          (typeof data.error === "string" ? data.error : "Не удалось отправить") +
            skip
        );
        return;
      }
      if (opts?.testToAdmin) {
        toast.success("Тест отправлен вам в Telegram");
        return;
      }
      const failNote =
        Array.isArray(data.failed) && data.failed.length
          ? `\nОшибка: ${data.failed.join(", ")}`
          : "";
      const skipNote =
        Array.isArray(data.skippedNames) && data.skippedNames.length
          ? `\nБез TG: ${data.skippedNames.join(", ")}`
          : "";
      toast.success(`Отправлено: ${data.sent}.${skipNote}${failNote}`);
      router.refresh();
    } finally {
      setNotifyingCreds(false);
    }
  }

  async function remindRoles(opts: {
    userId?: string;
    allIncomplete?: boolean;
    testToAdmin?: boolean;
  }) {
    setReminding(true);
    try {
      const res = await fetch("/api/students/remind-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Не удалось отправить");
        return;
      }
      if (opts.testToAdmin) {
        toast.success("Тест отправлен вам в Telegram");
        return;
      }
      const failNote =
        Array.isArray(data.failed) && data.failed.length
          ? `\nБез TG / ошибка: ${data.failed.join(", ")}`
          : "";
      toast.success(`Отправлено: ${data.sent}. Пропущено: ${data.skipped}.${failNote}`);
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
    <div className="space-y-4">
      {(pendingCredentials.length > 0 || pendingNoTg.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                Рассылка логинов в TG ({pendingCredentials.length} готовы
                {pendingNoTg.length ? `, ${pendingNoTg.length} без TG` : ""})
              </CardTitle>
              <Button
                size="sm"
                disabled={notifyingCreds || pendingCredentials.length === 0}
                onClick={async () => {
                  if (
                    !(await confirmAction(
                      `Отправить каждому свой логин и пароль в Telegram?\nГотово: ${pendingCredentials.length}`
                    ))
                  ) {
                    return;
                  }
                  void notifyCredentials();
                }}
              >
                {notifyingCreds ? "Отправка…" : "Разослать всем в TG"}
              </Button>
              <Button
              title="Отправить это сообщение только себе в Telegram — проверить, как выглядит"
                type="button"
                size="sm"
                variant="ghost"
                disabled={notifyingCreds}
                onClick={() => notifyCredentials({ testToAdmin: true })}
              >
                Превью себе
              </Button>
            </div>
            <p className="text-sm text-[var(--text-3)]">
              Пароль для рассылки сохраняется только когда вы заново задаёте пароль в карточке
              ученика. После успешной отправки временная копия стирается.
            </p>
          </CardHeader>
          {pendingNoTg.length > 0 && (
            <CardContent>
              <p className="text-sm text-[var(--danger)]">
                Без Telegram (сначала привяжите бота):{" "}
                {pendingNoTg.map((s) => displayName(s)).join(", ")}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      <CollapsibleCard
        variant="create"
        title="Добавить ученика"
        description="Вход по логину и паролю. Доступы потом можно разослать в Telegram."
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
            <Input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button
              onClick={createStudent}
              disabled={creating || !newFirstName.trim() || !newLogin.trim() || !newPassword}
            >
              {creating ? "Создание..." : "Создать ученика"}
            </Button>
          </div>
          {createError && <p className="text-sm text-[var(--danger)] sm:col-span-2">{createError}</p>}
        </div>
      </CollapsibleCard>

      {missingRoles.length > 0 && (
        <CollapsibleCard
          title={
            <span className="inline-flex items-center gap-2">
              Не заполнены роли
              <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 font-mono-num text-[12px] font-bold text-[var(--danger)]">
                {missingRoles.length}
              </span>
            </span>
          }
          description="Нет основной и/или дополнительных ролей — можно напомнить в Telegram"
          headerExtra={
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={reminding}
                onClick={() => remindRoles({ allIncomplete: true })}
              >
                {reminding ? "Отправка…" : "Напомнить всем"}
              </Button>
              <Button
              title="Отправить это сообщение только себе в Telegram — проверить, как выглядит"
                type="button"
                size="sm"
                variant="ghost"
                className="hidden min-[560px]:inline-flex"
                disabled={reminding}
                onClick={() => remindRoles({ allIncomplete: true, testToAdmin: true })}
              >
                Превью себе
              </Button>
            </>
          }
        >
          <div>
            <ul className="divide-y divide-[var(--border-soft)]">
              {missingRoles.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlayerLink user={s} className="font-medium" avatar={28} />
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={reminding}
                    onClick={() =>
                      remindRoles({ userId: s.id, testToAdmin: true })
                    }
                  >
                    Тест
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </CollapsibleCard>
      )}

      <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-2 lg:gap-6" /* grid-cols-1 = minmax(0,1fr): иначе колонка растягивалась по самому широкому полю и вылезала на телефоне */>
        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-baseline gap-2">
              Ученики <span className="font-mono-num text-[14px] font-normal text-[var(--text-3)]">{students.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-[var(--text-3)]">Учеников пока нет</p>
            ) : (
              <>
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по имени или логину"
                  className="mb-3"
                />
                <ul className="-mx-2 space-y-0.5">
                {students
                  .filter((s) => {
                    const q = query.trim().toLowerCase();
                    if (!q) return true;
                    return [s.firstName, s.lastName, s.login, s.username]
                      .filter(Boolean)
                      .some((v) => String(v).toLowerCase().includes(q));
                  })
                  .map((s) => {
                  const isSel = selected?.id === s.id;
                  const hasLogin = Boolean(s.login && s.passwordHash);
                  return (
                  <li
                    key={s.id}
                    className={`group flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm transition-colors ${
                      isSel ? "bg-[var(--admin-bg)] ring-1 ring-[var(--admin-border)]" : "hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectStudent(s)}
                      className="shrink-0 rounded-full"
                      aria-label={`Редактировать ${displayName(s)}`}
                    >
                      <Avatar photoUrl={s.photoUrl} firstName={s.firstName} lastName={s.lastName} size={32} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <PlayerLink
                        user={s}
                        className={`block truncate font-medium ${isSel ? "text-[var(--admin-ink)]" : "text-[var(--text)]"}`}
                      />
                      <button
                        type="button"
                        onClick={() => selectStudent(s)}
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-left text-[12px] text-[var(--text-3)]"
                      >
                        {s.login && <span className="font-mono-num">@{s.login}</span>}
                        <span className="font-mono-num">сила {s.profile?.finalRating ?? "—"}</span>
                        <StatusDot ok={hasLogin} label="вход" />
                        <StatusDot ok={Boolean(s.telegramChatId)} label="TG" />
                        {hasIncompleteRoles(s.profile) && <span className="font-medium text-[var(--danger)]">роли!</span>}
                        {s.loginPasswordTemp && <span className="text-[var(--points-ink)]">пароль → TG</span>}
                      </button>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => impersonate(s.id)} title="Зайти за ученика">
                      <LogIn aria-hidden />
                      <span className="hidden min-[560px]:inline">Зайти</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeStudent(s.id)}
                      aria-label={`Удалить ${displayName(s)}`}
                      className="px-2 text-[var(--text-3)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                  );
                })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {selected?.profile && (
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
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
                  <Label>Логин для входа</Label>
                  <Input
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="например ivan"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label>Новый пароль</Label>
                  <Input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      selected.passwordHash
                        ? "оставьте пустым, чтобы не менять"
                        : "задайте пароль для входа"
                    }
                    autoComplete="new-password"
                  />
                  <p className="mt-1 text-xs text-[var(--text-3)]">
                    {selected.login
                      ? `Сейчас логин: ${selected.login}${selected.passwordHash ? " · пароль задан" : " · пароля нет"}${
                          selected.loginPasswordTemp
                            ? " · ждёт рассылку в TG"
                            : ""
                        }`
                      : "Логина ещё нет — задайте логин и пароль, чтобы ученик мог войти."}
                  </p>
                  {selected.login && selected.loginPasswordTemp && selected.telegramChatId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      disabled={notifyingCreds}
                      onClick={() => notifyCredentials({ userId: selected.id })}
                    >
                      Отправить этому в TG
                    </Button>
                  )}
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
                {saveError && <p className="text-sm text-[var(--danger)]">{saveError}</p>}
                <Button onClick={saveStudent} disabled={!firstName.trim() || saving}>
                  {saving ? "Сохранение…" : "Сохранить"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-[var(--success-ink)]" : "text-[var(--text-3)]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[var(--success)]" : "bg-[var(--border-field)]"}`} aria-hidden />
      {label}
    </span>
  );
}
