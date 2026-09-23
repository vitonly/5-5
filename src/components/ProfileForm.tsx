"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerCard } from "@/components/PlayerCard";
import { RankMedalPicker } from "@/components/RankMedalPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/button";
import { DOTA_ROLE_LABELS, rankLabel } from "@/lib/labels";
import { parseSecondaryRoles } from "@/lib/secondary-roles";
import type { DotaRole, User, PlayerProfile } from "@prisma/client";

type UserWithProfile = User & { profile: PlayerProfile | null };

type SaveStatus = "idle" | "saving" | "saved" | "error";

const ROLE_KEYS = Object.keys(DOTA_ROLE_LABELS) as DotaRole[];

export function ProfileForm({ user }: { user: UserWithProfile }) {
  const router = useRouter();
  const profile = user.profile!;
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName || "");
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl || "");
  const [steamInput, setSteamInput] = useState(profile.steamAccountId?.toString() || "");
  const [primaryRole, setPrimaryRole] = useState(profile.primaryRole || "");
  const [secondaryRoles, setSecondaryRoles] = useState<DotaRole[]>(() =>
    parseSecondaryRoles(
      (profile as PlayerProfile & { secondaryRoles?: string }).secondaryRoles,
      profile.secondaryRole
    )
  );
  const [rankTier, setRankTier] = useState<number | null>(profile.rankTier);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const skipAutoSave = useRef(true);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewUser = {
    ...user,
    firstName,
    lastName: lastName || null,
    photoUrl: photoUrl || null,
  };

  const previewProfile = {
    ...profile,
    rankTier,
    primaryRole: (primaryRole || null) as DotaRole | null,
    secondaryRole: secondaryRoles[0] ?? null,
    secondaryRoles: JSON.stringify(secondaryRoles),
  };

  const saveProfile = useCallback(async () => {
    if (!firstName.trim()) return;

    setSaveStatus("saving");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          photoUrl: photoUrl || null,
          steamInput,
          rankTier,
          primaryRole: primaryRole || null,
          secondaryRoles,
        }),
      });
      if (!res.ok) {
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saved");
      router.refresh();
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [firstName, lastName, photoUrl, steamInput, rankTier, primaryRole, secondaryRoles, router]);

  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    if (!firstName.trim()) return;

    const timer = setTimeout(() => saveProfile(), 800);
    return () => clearTimeout(timer);
  }, [firstName, lastName, photoUrl, steamInput, rankTier, primaryRole, secondaryRoles, saveProfile]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  function setSecondaryAt(index: number, role: string) {
    setSecondaryRoles((prev) => {
      const next = [...prev];
      if (!role) {
        next.splice(index, 1);
        return next;
      }
      const asRole = role as DotaRole;
      if (asRole === primaryRole) return prev;
      if (next.includes(asRole) && next[index] !== asRole) return prev;
      next[index] = asRole;
      return next;
    });
  }

  function addSecondarySlot() {
    if (secondaryRoles.length >= 3) return;
    const available = ROLE_KEYS.find(
      (r) => r !== primaryRole && !secondaryRoles.includes(r)
    );
    if (!available) return;
    setSecondaryRoles((prev) => [...prev, available]);
  }

  function moveSecondary(index: number, dir: -1 | 1) {
    setSecondaryRoles((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function removeSecondary(index: number) {
    setSecondaryRoles((prev) => prev.filter((_, i) => i !== index));
  }

  const steamId = steamInput.replace(/\D/g, "") || profile.steamAccountId?.toString();
  const openDotaUrl = steamId ? `https://www.opendota.com/players/${steamId}` : null;

  const statusLabel =
    saveStatus === "saving"
      ? "Сохранение..."
      : saveStatus === "saved"
        ? "Сохранено"
        : saveStatus === "error"
          ? "Ошибка сохранения"
          : null;

  const selectClassName =
    "flex h-10 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Настройки профиля</CardTitle>
        {statusLabel && (
          <span
            className={`text-xs ${
              saveStatus === "error" ? "text-[var(--danger)]" : "text-[var(--text-3)]"
            }`}
          >
            {statusLabel}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[var(--radius-control)] border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
          <PlayerCard user={previewUser} profile={previewProfile} />
        </div>

        <div>
          <Label htmlFor="firstName">Имя</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="lastName">Фамилия</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>

        <div>
          <Label>Аватар</Label>
          <AvatarUpload
            photoUrl={photoUrl}
            onPhotoChange={setPhotoUrl}
            onClear={() => setPhotoUrl("")}
          />
        </div>

        <div>
          <Label>Мой рейтинг (медаль)</Label>
          <div className="mt-2">
            <RankMedalPicker rankTier={rankTier} onChange={setRankTier} />
          </div>
          <p className="mt-2 text-xs text-[var(--text-3)]">
            Сейчас: <b className="text-[var(--points)]">{rankLabel(rankTier)}</b>. Рейтинг силы
            считается от медали, а не от числового MMR.
          </p>
        </div>

        <div>
          <Label htmlFor="steam">Steam / OpenDota (ссылка для сверки)</Label>
          <Input
            id="steam"
            value={steamInput}
            onChange={(e) => setSteamInput(e.target.value)}
            placeholder="ID или ссылка opendota.com/players/..."
          />
          <p className="mt-1 text-xs text-[var(--text-3)]">
            Не влияет на рейтинг силы — только чтобы сверять профиль.
            {openDotaUrl && (
              <>
                {" "}
                <a
                  href={openDotaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--points)] underline"
                >
                  Открыть OpenDota
                </a>
              </>
            )}
          </p>
        </div>

        <div>
          <Label htmlFor="primaryRole">Основная роль</Label>
          <select
            id="primaryRole"
            className={selectClassName}
            value={primaryRole}
            onChange={(e) => {
              const next = e.target.value;
              setPrimaryRole(next);
              if (next) {
                setSecondaryRoles((prev) => prev.filter((r) => r !== next));
              }
            }}
          >
            <option value="">—</option>
            {Object.entries(DOTA_ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Вторичные роли (до 3, с приоритетом)</Label>
          <p className="mb-2 text-xs text-[var(--text-3)]">
            Приоритет учитывается при раздаче позиций в 5 на 5. №1 — самый желаемый запасной вариант.
          </p>
          <div className="space-y-2">
            {secondaryRoles.map((role, index) => (
              <div key={`${role}-${index}`} className="flex items-center gap-2">
                <span className="w-6 shrink-0 font-mono-num text-xs text-[var(--text-4)]">
                  #{index + 1}
                </span>
                <select
                  className={selectClassName}
                  value={role}
                  onChange={(e) => setSecondaryAt(index, e.target.value)}
                >
                  {ROLE_KEYS.filter(
                    (r) =>
                      r === role || (r !== primaryRole && !secondaryRoles.includes(r))
                  ).map((key) => (
                    <option key={key} value={key}>
                      {DOTA_ROLE_LABELS[key]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2"
                  disabled={index === 0}
                  onClick={() => moveSecondary(index, -1)}
                  aria-label="Выше приоритет"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2"
                  disabled={index === secondaryRoles.length - 1}
                  onClick={() => moveSecondary(index, 1)}
                  aria-label="Ниже приоритет"
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2"
                  onClick={() => removeSecondary(index)}
                  aria-label="Убрать"
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          {secondaryRoles.length < 3 && (
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              onClick={addSecondarySlot}
              disabled={
                !ROLE_KEYS.some((r) => r !== primaryRole && !secondaryRoles.includes(r))
              }
            >
              Добавить роль
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
