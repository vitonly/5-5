"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerCard } from "@/components/PlayerCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/button";
import { DOTA_ROLE_LABELS, rankLabel } from "@/lib/labels";
import type { User, PlayerProfile } from "@prisma/client";

type UserWithProfile = User & { profile: PlayerProfile | null };

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ProfileForm({ user }: { user: UserWithProfile }) {
  const router = useRouter();
  const profile = user.profile!;
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName || "");
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl || "");
  const [mmr, setMmr] = useState(profile.mmr?.toString() || "");
  const [steamInput, setSteamInput] = useState(profile.steamAccountId?.toString() || "");
  const [primaryRole, setPrimaryRole] = useState(profile.primaryRole || "");
  const [secondaryRole, setSecondaryRole] = useState(profile.secondaryRole || "");
  const [rankTier, setRankTier] = useState<number | null>(profile.rankTier);
  const [refreshing, setRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const skipAutoSave = useRef(true);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewUser = {
    ...user,
    firstName,
    lastName: lastName || null,
    photoUrl: photoUrl || null,
  };

  const saveProfile = useCallback(
    async (options?: { refreshRank?: boolean }) => {
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
            mmr: mmr === "" ? null : Number(mmr),
            steamInput,
            refreshRank: options?.refreshRank ?? false,
            primaryRole: primaryRole || null,
            secondaryRole: secondaryRole || null,
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
    },
    [firstName, lastName, photoUrl, mmr, steamInput, primaryRole, secondaryRole, router]
  );

  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    if (!firstName.trim()) return;

    const timer = setTimeout(() => saveProfile(), 800);
    return () => clearTimeout(timer);
  }, [firstName, lastName, photoUrl, mmr, steamInput, primaryRole, secondaryRole, saveProfile]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  async function refreshRank() {
    if (!steamInput) return;
    setRefreshing(true);
    const res = await fetch(`/api/opendota?accountId=${encodeURIComponent(steamInput)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.rankTier) setRankTier(data.rankTier);
      if (!mmr && data.mmrEstimate) setMmr(String(data.mmrEstimate));
      await saveProfile({ refreshRank: true });
    }
    setRefreshing(false);
  }

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
          <PlayerCard user={previewUser} profile={profile} />
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
          <Label htmlFor="mmr">Мой MMR</Label>
          <Input
            id="mmr"
            type="number"
            min={0}
            value={mmr}
            onChange={(e) => setMmr(e.target.value)}
            placeholder="Например, 4200"
          />
          <p className="mt-1 text-xs text-[var(--text-3)]">
            MMR на карточке. Базовый рейтинг — по медали OpenDota.
          </p>
        </div>

        <div>
          <Label htmlFor="steam">Steam / OpenDota ID</Label>
          <div className="flex gap-2">
            <Input
              id="steam"
              value={steamInput}
              onChange={(e) => setSteamInput(e.target.value)}
              placeholder="ID или ссылка opendota.com/players/..."
            />
            <Button type="button" variant="secondary" onClick={refreshRank} disabled={refreshing}>
              {refreshing ? "..." : "Ранг"}
            </Button>
          </div>
          <p className="mt-1 text-sm text-[var(--points)]">
            Ранг из OpenDota: <b>{rankLabel(rankTier)}</b>
          </p>
          <p className="text-xs text-[var(--text-3)]">
            Медаль задаёт RangBase (Рекрут 5 … Титан 75). Сила = clamp(RangBase + SkillMod + VibeMod, 1–100).
          </p>
        </div>

        <div>
          <Label htmlFor="primaryRole">Основная роль</Label>
          <select
            id="primaryRole"
            className={selectClassName}
            value={primaryRole}
            onChange={(e) => setPrimaryRole(e.target.value)}
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
          <Label htmlFor="secondaryRole">Вторичная роль</Label>
          <select
            id="secondaryRole"
            className={selectClassName}
            value={secondaryRole}
            onChange={(e) => setSecondaryRole(e.target.value)}
          >
            <option value="">—</option>
            {Object.entries(DOTA_ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
