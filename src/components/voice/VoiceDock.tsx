"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import type { VoiceRoomId } from "@/lib/voice-rooms";
import { VOICE_ROOMS, isVoiceRoomId, voiceRoomLabel } from "@/lib/voice-rooms";
import { QUICK_EVENTS } from "@/components/HeaderQuickActions";

type RoomParticipant = {
  identity: string;
  name: string;
  isAdmin: boolean;
  isMuted: boolean;
};

type RoomState = {
  id: VoiceRoomId;
  name: string;
  capacity: number;
  participants: RoomParticipant[];
};

type SpeakMode = "open" | "ptt" | "vad";

type Props = {
  role: "ADMIN" | "STUDENT";
  myId: string;
};

const PTT_STORAGE = "startplus_voice_ptt_key";
const MODE_STORAGE = "startplus_voice_mode";
const VAD_STORAGE = "startplus_voice_vad";

function displayNameOf(p: { identity: string; name?: string }) {
  return p.name?.trim() || p.identity.slice(0, 8);
}

export function VoiceDock({ role, myId }: Props) {
  const isAdmin = role === "ADMIN";
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [rooms, setRooms] = useState<RoomState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<VoiceRoomId | null>(null);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [spkDevices, setSpkDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [spkId, setSpkId] = useState<string>("");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [speakMode, setSpeakMode] = useState<SpeakMode>("open");
  const [pttKey, setPttKey] = useState("KeyV");
  const [vadThreshold, setVadThreshold] = useState(15);
  const [micLevel, setMicLevel] = useState(0);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [dragIdentity, setDragIdentity] = useState<string | null>(null);
  const [dragFromRoom, setDragFromRoom] = useState<VoiceRoomId | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const vadRaf = useRef<number | null>(null);
  const testRaf = useRef<number | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testCtxRef = useRef<AudioContext | null>(null);
  const pttHeld = useRef(false);
  const speakModeRef = useRef<SpeakMode>("open");
  const vadThresholdRef = useRef(15);
  const [testingMic, setTestingMic] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Связь с кнопкой в шапке на телефоне (см. HeaderQuickActions)
  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    const sync = () => window.dispatchEvent(new CustomEvent(QUICK_EVENTS.voiceState, { detail: { inRoom: Boolean(activeRoomId) } }));
    window.addEventListener(QUICK_EVENTS.voiceToggle, toggle);
    window.addEventListener(QUICK_EVENTS.sync, sync);
    sync();
    return () => {
      window.removeEventListener(QUICK_EVENTS.voiceToggle, toggle);
      window.removeEventListener(QUICK_EVENTS.sync, sync);
    };
  }, [activeRoomId]);

  useEffect(() => {
    speakModeRef.current = speakMode;
    try {
      localStorage.setItem(MODE_STORAGE, speakMode);
    } catch {
      /* ignore */
    }
  }, [speakMode]);

  useEffect(() => {
    vadThresholdRef.current = vadThreshold;
    try {
      localStorage.setItem(VAD_STORAGE, String(vadThreshold));
    } catch {
      /* ignore */
    }
  }, [vadThreshold]);

  useEffect(() => {
    try {
      const mode = localStorage.getItem(MODE_STORAGE) as SpeakMode | null;
      if (mode === "open" || mode === "ptt" || mode === "vad") setSpeakMode(mode);
      const key = localStorage.getItem(PTT_STORAGE);
      if (key) setPttKey(key);
      const vad = localStorage.getItem(VAD_STORAGE);
      if (vad) setVadThreshold(Number(vad) || 15);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/rooms");
      if (!res.ok) return;
      const data = (await res.json()) as {
        configured?: boolean;
        rooms?: RoomState[];
      };
      setConfigured(data.configured !== false);
      setRooms(data.rooms ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshRooms();
    const t = setInterval(() => void refreshRooms(), 4000);
    return () => clearInterval(t);
  }, [refreshRooms]);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(devices.filter((d) => d.kind === "audioinput"));
      setSpkDevices(devices.filter((d) => d.kind === "audiooutput"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  const applyMicEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
    } catch {
      /* ignore */
    }
  }, []);

  const levelFromAnalyser = (analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(100, Math.round(rms * 280));
  };

  const stopVadLoop = useCallback(() => {
    if (vadRaf.current != null) {
      cancelAnimationFrame(vadRaf.current);
      vadRaf.current = null;
    }
  }, []);

  const stopMicTest = useCallback(() => {
    if (testRaf.current != null) {
      cancelAnimationFrame(testRaf.current);
      testRaf.current = null;
    }
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;
    if (testCtxRef.current) {
      void testCtxRef.current.close().catch(() => undefined);
      testCtxRef.current = null;
    }
    setTestingMic(false);
    if (!roomRef.current) setMicLevel(0);
  }, []);

  const startMicTest = useCallback(async () => {
    setTestError(null);
    stopMicTest();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: micId ? { exact: micId } : undefined,
          echoCancellation: true,
          noiseSuppression,
          autoGainControl: true,
        },
      });
      testStreamRef.current = stream;
      const ctx = new AudioContext();
      testCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
      setTestingMic(true);
      void refreshDevices();

      const tick = () => {
        setMicLevel(levelFromAnalyser(analyser, data));
        testRaf.current = requestAnimationFrame(tick);
      };
      testRaf.current = requestAnimationFrame(tick);
    } catch (e) {
      setTestingMic(false);
      setTestError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Разрешите микрофон в браузере и нажмите «Тест» снова"
          : "Не удалось открыть микрофон для теста"
      );
    }
  }, [micId, noiseSuppression, refreshDevices, stopMicTest]);

  // Автотест уровня, пока открыты настройки (и не сидим в комнате — там свой loop)
  useEffect(() => {
    if (settingsOpen && !activeRoomId) {
      void startMicTest();
    } else if (!settingsOpen) {
      stopMicTest();
    }
    return () => {
      if (!activeRoomId) stopMicTest();
    };
  }, [settingsOpen, activeRoomId, micId, noiseSuppression, startMicTest, stopMicTest]);

  const startVadLoop = useCallback(
    (track: LocalAudioTrack) => {
      stopVadLoop();
      stopMicTest();
      const media = track.mediaStreamTrack;
      if (!media) return;
      const stream = new MediaStream([media]);
      const ctx = new AudioContext();
      if (ctx.state === "suspended") void ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;

      const tick = () => {
        const level = levelFromAnalyser(analyser, data);
        setMicLevel(level);

        const mode = speakModeRef.current;
        if (mode === "vad") {
          void applyMicEnabled(level >= vadThresholdRef.current);
        } else if (mode === "ptt") {
          void applyMicEnabled(pttHeld.current);
        } else {
          void applyMicEnabled(true);
        }
        vadRaf.current = requestAnimationFrame(tick);
      };
      vadRaf.current = requestAnimationFrame(tick);
    },
    [applyMicEnabled, stopMicTest, stopVadLoop]
  );

  const detachAllAudio = useCallback(() => {
    for (const el of audioEls.current.values()) {
      el.pause();
      el.srcObject = null;
      el.remove();
    }
    audioEls.current.clear();
  }, []);

  const attachRemoteAudio = useCallback(
    (participant: RemoteParticipant, publication: RemoteTrackPublication) => {
      const track = publication.track;
      if (!track || track.kind !== Track.Kind.Audio) return;
      const key = `${participant.identity}:${publication.trackSid}`;
      let el = audioEls.current.get(key);
      if (!el) {
        el = document.createElement("audio");
        el.autoplay = true;
        el.dataset.identity = participant.identity;
        document.body.appendChild(el);
        audioEls.current.set(key, el);
      }
      track.attach(el);
      const vol = volumes[participant.identity] ?? 100;
      el.volume = Math.min(1, Math.max(0, vol / 100));
      if (spkId && "setSinkId" in el) {
        void (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
          spkId
        );
      }
    },
    [spkId, volumes]
  );

  const leaveRoom = useCallback(async () => {
    stopVadLoop();
    detachAllAudio();
    const room = roomRef.current;
    roomRef.current = null;
    localTrackRef.current = null;
    if (room) {
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    }
    setActiveRoomId(null);
    setConnectedIds([]);
    setSpeakingIds(new Set());
    setMicLevel(0);
    void refreshRooms();
  }, [detachAllAudio, refreshRooms, stopVadLoop]);

  const joinRoom = useCallback(
    async (roomId: VoiceRoomId) => {
      setError(null);
      setJoining(true);
      try {
        if (roomRef.current) await leaveRoom();

        const res = await fetch("/api/voice/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Не удалось войти");
          return;
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression,
            autoGainControl: true,
            deviceId: micId || undefined,
          },
        });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            attachRemoteAudio(participant, publication as RemoteTrackPublication);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
          const key = `${participant.identity}:${publication.trackSid}`;
          const el = audioEls.current.get(key);
          if (el) {
            el.pause();
            el.srcObject = null;
            el.remove();
            audioEls.current.delete(key);
          }
        });
        room.on(RoomEvent.ParticipantConnected, () => {
          setConnectedIds(Array.from(room.remoteParticipants.keys()));
          void refreshRooms();
        });
        room.on(RoomEvent.ParticipantDisconnected, () => {
          setConnectedIds(Array.from(room.remoteParticipants.keys()));
          void refreshRooms();
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          setSpeakingIds(new Set(speakers.map((s) => s.identity)));
        });
        room.on(RoomEvent.Disconnected, () => {
          setActiveRoomId(null);
          setConnectedIds([]);
          void refreshRooms();
        });
        // После admin move LiveKit меняет room.name без полного leave
        room.on(RoomEvent.RoomMetadataChanged, () => {
          if (isVoiceRoomId(room.name)) {
            setActiveRoomId(room.name);
            void refreshRooms();
          }
        });

        await room.connect(data.url, data.token);
        await room.localParticipant.setMicrophoneEnabled(true, {
          deviceId: micId || undefined,
          echoCancellation: true,
          noiseSuppression,
          autoGainControl: true,
        });

        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const track = pub?.track as LocalAudioTrack | undefined;
        if (track) {
          localTrackRef.current = track;
          startVadLoop(track);
        }

        if (speakModeRef.current === "ptt" || speakModeRef.current === "vad") {
          await room.localParticipant.setMicrophoneEnabled(false);
        }

        setActiveRoomId(roomId);
        setConnectedIds(Array.from(room.remoteParticipants.keys()));
        void refreshRooms();
        void refreshDevices();
      } catch (e) {
        console.error(e);
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Разрешите доступ к микрофону в браузере"
            : "Ошибка подключения к голосовой комнате"
        );
        await leaveRoom();
      } finally {
        setJoining(false);
      }
    },
    [
      attachRemoteAudio,
      leaveRoom,
      micId,
      noiseSuppression,
      refreshDevices,
      refreshRooms,
      startVadLoop,
    ]
  );

  // PTT keys
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (speakModeRef.current !== "ptt" || !roomRef.current) return;
      if (e.code !== pttKey) return;
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      pttHeld.current = true;
      void applyMicEnabled(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (speakModeRef.current !== "ptt" || !roomRef.current) return;
      if (e.code !== pttKey) return;
      pttHeld.current = false;
      void applyMicEnabled(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [applyMicEnabled, pttKey]);

  // Apply volume changes
  useEffect(() => {
    for (const [key, el] of audioEls.current) {
      const identity = key.split(":")[0];
      const vol = volumes[identity] ?? 100;
      el.volume = Math.min(1, Math.max(0, vol / 100));
    }
  }, [volumes]);

  // Switch mic device while connected
  useEffect(() => {
    const track = localTrackRef.current;
    if (!track || !micId) return;
    void track.setDeviceId(micId);
  }, [micId]);

  // Только при размонтировании layout (выход с сайта), не при смене колбэков
  useEffect(() => {
    return () => {
      stopVadLoop();
      detachAllAudio();
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        try {
          room.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  // Синхронизация activeRoomId после server-side move
  useEffect(() => {
    if (!activeRoomId) return;
    const t = setInterval(() => {
      const room = roomRef.current;
      if (!room?.name) return;
      if (isVoiceRoomId(room.name) && room.name !== activeRoomId) {
        setActiveRoomId(room.name);
        void refreshRooms();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [activeRoomId, refreshRooms]);

  const adminAction = async (body: Record<string, unknown>) => {
    setError(null);
    const res = await fetch("/api/voice/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    void refreshRooms();
  };

  const inRoomLabel = activeRoomId ? voiceRoomLabel(activeRoomId) : null;
  const fabTitle = inRoomLabel ? `Голос · ${inRoomLabel}` : "Голосовые комнаты";

  const remoteInActive = useMemo(() => {
    if (!activeRoomId) return [];
    return rooms.find((r) => r.id === activeRoomId)?.participants.filter((p) => p.identity !== myId) ?? [];
  }, [activeRoomId, myId, rooms]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={fabTitle}
        className="fixed bottom-6 right-[5.5rem] z-40 hidden h-14 w-14 touch-manipulation select-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xl text-[var(--text)] shadow-[var(--shadow-popover)] transition-[background-color,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[var(--control)] active:scale-[0.97] min-[720px]:flex"
      >
        {activeRoomId ? (
          <span className="relative">
            🎧
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
          </span>
        ) : (
          "🎙"
        )}
      </button>

      <aside
        // Закрытая панель полностью скрыта: без тени у края экрана и без фокуса клавиатурой
        inert={!open}
        aria-hidden={!open}
        className={`drawer-panel fixed right-0 top-0 z-[60] flex h-full w-full max-w-sm flex-col border-l border-[var(--border)] bg-[var(--surface)] ${
          open ? "is-open translate-x-0 shadow-[var(--shadow-popover)]" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <div>
            <h3 className="font-display font-bold text-[var(--text)]">Голосовые комнаты</h3>
            {inRoomLabel && (
              <p className="text-xs text-[var(--points)]">Вы в: {inRoomLabel}</p>
            )}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className="rounded px-2 py-1 text-sm text-[var(--text-2)] hover:bg-[var(--control)]"
              title="Настройки звука"
            >
              ⚙
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-[var(--text-2)] hover:bg-[var(--control)]"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!configured && (
            <p className="rounded border border-[var(--border)] bg-[var(--control)] p-3 text-sm text-[var(--text-2)]">
              Голосовой сервер ещё не подключён. Скоро заработает.
            </p>
          )}
          {error && (
            <p className="rounded border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          {settingsOpen && (
            <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--border)] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">Настройки звука</p>
              <label className="block text-xs text-[var(--text-3)]">
                Микрофон
                <select
                  value={micId}
                  onChange={(e) => setMicId(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
                >
                  <option value="">По умолчанию</option>
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 12)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-[var(--text-3)]">
                Динамики
                <select
                  value={spkId}
                  onChange={(e) => setSpkId(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
                >
                  <option value="">По умолчанию</option>
                  {spkDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 12)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={noiseSuppression}
                  onChange={(e) => setNoiseSuppression(e.target.checked)}
                />
                Шумоподавление
              </label>
              <label className="block text-xs text-[var(--text-3)]">
                Режим речи
                <select
                  value={speakMode}
                  onChange={(e) => setSpeakMode(e.target.value as SpeakMode)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
                >
                  <option value="open">Открытый микрофон</option>
                  <option value="ptt">Push-to-talk</option>
                  <option value="vad">Активация голосом</option>
                </select>
              </label>
              {speakMode === "ptt" && (
                <label className="block text-xs text-[var(--text-3)]">
                  Клавиша PTT (нажмите)
                  <input
                    readOnly
                    value={pttKey}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      setPttKey(e.code);
                      try {
                        localStorage.setItem(PTT_STORAGE, e.code);
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
                  />
                </label>
              )}
              <div className="space-y-2">
                <label className="block text-xs text-[var(--text-3)]">
                  Порог голоса: {vadThreshold}
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={vadThreshold}
                    onChange={(e) => setVadThreshold(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <div className="relative mt-1 h-3 overflow-hidden rounded bg-[var(--control)]">
                  <div
                    className={`progress-fill h-full w-full origin-left transition-transform duration-75 ${
                      micLevel >= vadThreshold ? "bg-[var(--points)]" : "bg-[var(--text-4)]"
                    }`}
                    style={{
                      transform: `scaleX(${Math.max(0, Math.min(1, micLevel / 100))})`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-full w-0.5 bg-[var(--danger)]"
                    style={{ left: `${vadThreshold}%` }}
                    title={`Порог ${vadThreshold}`}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[var(--text-3)]">
                    {testingMic || activeRoomId
                      ? `Уровень: ${micLevel} · говорите в микрофон`
                      : "Нажмите «Тест», затем говорите"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void startMicTest()}
                    className="rounded bg-[var(--points)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--points-hover)]"
                  >
                    Тест
                  </button>
                </div>
                {testError && (
                  <p className="text-[11px] text-[var(--danger)]">{testError}</p>
                )}
              </div>
            </div>
          )}

          {VOICE_ROOMS.map((def) => {
            const room = rooms.find((r) => r.id === def.id) ?? {
              id: def.id,
              name: def.name,
              capacity: 5,
              participants: [],
            };
            const isHere = activeRoomId === def.id;
            return (
              <section
                key={def.id}
                className={`rounded-[var(--radius-card)] border p-3 ${
                  isHere
                    ? "border-[var(--points-border)] bg-[var(--points-bg)]"
                    : "border-[var(--border)]"
                }`}
                onDragOver={(e) => {
                  if (isAdmin && dragIdentity) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isAdmin || !dragIdentity || !dragFromRoom) return;
                  if (dragFromRoom === def.id) return;
                  void adminAction({
                    action: "move",
                    fromRoomId: dragFromRoom,
                    toRoomId: def.id,
                    identity: dragIdentity,
                  });
                  setDragIdentity(null);
                  setDragFromRoom(null);
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--text)]">{room.name}</p>
                    <p className="font-mono-num text-xs text-[var(--text-3)]">
                      {room.participants.length}/{room.capacity}
                    </p>
                  </div>
                  {isHere ? (
                    <button
                      type="button"
                      onClick={() => void leaveRoom()}
                      className="rounded border border-[var(--danger)]/40 px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10"
                    >
                      Выйти
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={joining || room.participants.length >= room.capacity || !configured}
                      onClick={() => void joinRoom(def.id)}
                      className="rounded bg-[var(--points)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--points-hover)] disabled:opacity-50"
                    >
                      {joining ? "…" : "Войти"}
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {room.participants.length === 0 && (
                    <li className="text-xs text-[var(--text-3)]">Пусто</li>
                  )}
                  {room.participants.map((p) => {
                    const speaking = speakingIds.has(p.identity);
                    const isMe = p.identity === myId;
                    return (
                      <li
                        key={p.identity}
                        draggable={isAdmin && !isMe}
                        onDragStart={() => {
                          setDragIdentity(p.identity);
                          setDragFromRoom(def.id);
                        }}
                        onDragEnd={() => {
                          setDragIdentity(null);
                          setDragFromRoom(null);
                        }}
                        className={`flex items-center justify-between gap-2 rounded border border-[var(--border-soft)] px-2 py-1.5 text-sm ${
                          isAdmin && !isMe ? "cursor-grab" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[var(--text)]">
                            {speaking ? "🟢 " : p.isMuted ? "🔇 " : "⚪ "}
                            {p.name}
                            {isMe ? " (вы)" : ""}
                            {p.isAdmin ? " · тренер" : ""}
                          </p>
                          {!isMe && isHere && (
                            <label className="mt-1 flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                              громкость
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={volumes[p.identity] ?? 100}
                                onChange={(e) =>
                                  setVolumes((prev) => ({
                                    ...prev,
                                    [p.identity]: Number(e.target.value),
                                  }))
                                }
                                className="w-20"
                              />
                            </label>
                          )}
                        </div>
                        {isAdmin && !isMe && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              title="Мьют"
                              onClick={() =>
                                void adminAction({
                                  action: "mute",
                                  roomId: def.id,
                                  identity: p.identity,
                                  muted: !p.isMuted,
                                })
                              }
                              className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-2)] hover:bg-[var(--control)]"
                            >
                              {p.isMuted ? "Размутить" : "Мьют"}
                            </button>
                            <button
                              type="button"
                              title="Кик"
                              onClick={() =>
                                void adminAction({
                                  action: "kick",
                                  roomId: def.id,
                                  identity: p.identity,
                                })
                              }
                              className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--danger)] hover:bg-[var(--control)]"
                            >
                              Кик
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {isAdmin && (
            <p className="text-[11px] text-[var(--text-3)]">
              Админ: перетащите ученика в другую комнату. Mute / Kick — кнопки справа.
            </p>
          )}

          {activeRoomId && remoteInActive.length > 0 && !settingsOpen && (
            <p className="text-[11px] text-[var(--text-3)]">
              Громкость каждого — у имени участника в вашей комнате.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
