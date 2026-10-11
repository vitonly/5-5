import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import {
  VOICE_ROOM_CAPACITY,
  VOICE_ROOMS,
  isVoiceRoomId,
  type VoiceRoomId,
  voiceRoomLabel,
} from "@/lib/voice-rooms";

export type VoiceParticipant = {
  identity: string;
  name: string;
  isAdmin: boolean;
  isMuted: boolean;
  joinedAt: number | null;
};

export type VoiceRoomState = {
  id: VoiceRoomId;
  name: string;
  capacity: number;
  participants: VoiceParticipant[];
};

function requireLivekitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const url = process.env.LIVEKIT_URL?.trim();
  if (!apiKey || !apiSecret || !url) {
    throw new Error("LIVEKIT_NOT_CONFIGURED");
  }
  return { apiKey, apiSecret, url };
}

/** URL for RoomService (server→LiveKit). Prefer internal HTTP. */
function roomServiceHost(): string {
  return (
    process.env.LIVEKIT_INTERNAL_URL?.trim() ||
    process.env.LIVEKIT_URL?.trim()?.replace(/^ws/i, "http") ||
    "http://127.0.0.1:7880"
  );
}

export function isLivekitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim() &&
      process.env.LIVEKIT_URL?.trim()
  );
}

export function getLivekitPublicUrl(): string {
  return requireLivekitConfig().url;
}

function roomClient(): RoomServiceClient {
  const { apiKey, apiSecret } = requireLivekitConfig();
  return new RoomServiceClient(roomServiceHost(), apiKey, apiSecret);
}

export async function createVoiceToken(opts: {
  userId: string;
  displayName: string;
  roomId: VoiceRoomId;
  isAdmin: boolean;
}): Promise<{ token: string; url: string; roomId: VoiceRoomId }> {
  const { apiKey, apiSecret, url } = requireLivekitConfig();
  const client = roomClient();

  // Ensure room exists with capacity
  try {
    await client.createRoom({
      name: opts.roomId,
      emptyTimeout: 60 * 60,
      maxParticipants: VOICE_ROOM_CAPACITY,
      metadata: JSON.stringify({ label: voiceRoomLabel(opts.roomId) }),
    });
  } catch {
    // already exists
  }

  const participants = await client.listParticipants(opts.roomId).catch(() => []);
  const alreadyIn = participants.some((p) => p.identity === opts.userId);
  if (!alreadyIn && participants.length >= VOICE_ROOM_CAPACITY) {
    throw new Error("ROOM_FULL");
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.userId,
    name: opts.displayName,
    ttl: "6h",
    metadata: JSON.stringify({ role: opts.isAdmin ? "ADMIN" : "STUDENT" }),
    attributes: { role: opts.isAdmin ? "ADMIN" : "STUDENT" },
  });
  at.addGrant({
    roomJoin: true,
    room: opts.roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE],
    roomAdmin: opts.isAdmin,
  });

  return { token: await at.toJwt(), url, roomId: opts.roomId };
}

function parseMetaRole(metadata?: string, attributes?: Record<string, string>): boolean {
  if (attributes?.role === "ADMIN") return true;
  if (!metadata) return false;
  try {
    return JSON.parse(metadata)?.role === "ADMIN";
  } catch {
    return false;
  }
}

export async function listVoiceRooms(): Promise<VoiceRoomState[]> {
  if (!isLivekitConfigured()) {
    return VOICE_ROOMS.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: VOICE_ROOM_CAPACITY,
      participants: [],
    }));
  }

  const client = roomClient();
  const rooms = await Promise.all(
    VOICE_ROOMS.map(async (room) => {
      let participants: VoiceParticipant[] = [];
      try {
        const list = await client.listParticipants(room.id);
        participants = list.map((p) => {
          const micMuted = (p.tracks ?? []).some(
            (t) => t.source === TrackSource.MICROPHONE && t.muted
          );
          const noMic = !(p.tracks ?? []).some((t) => t.source === TrackSource.MICROPHONE);
          return {
            identity: p.identity,
            name: p.name || p.identity,
            isAdmin: parseMetaRole(p.metadata, p.attributes as Record<string, string> | undefined),
            isMuted: micMuted || noMic,
            joinedAt: p.joinedAt ? Number(p.joinedAt) : null,
          };
        });
      } catch {
        participants = [];
      }
      return {
        id: room.id,
        name: room.name,
        capacity: VOICE_ROOM_CAPACITY,
        participants,
      };
    })
  );
  return rooms;
}

export async function adminMuteParticipant(
  roomId: string,
  identity: string,
  muted: boolean
): Promise<void> {
  if (!isVoiceRoomId(roomId)) throw new Error("BAD_ROOM");
  const client = roomClient();
  const p = await client.getParticipant(roomId, identity);
  const micTracks = (p.tracks ?? []).filter((t) => t.source === TrackSource.MICROPHONE);

  // Always restore/revoke publish on unmute/mute so "no track yet" cases work too
  await client.updateParticipant(roomId, identity, {
    permission: {
      canPublish: !muted,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: muted ? [] : [TrackSource.MICROPHONE],
    },
  });

  for (const t of micTracks) {
    await client.mutePublishedTrack(roomId, identity, t.sid, muted);
  }
}

export async function adminKickParticipant(roomId: string, identity: string): Promise<void> {
  if (!isVoiceRoomId(roomId)) throw new Error("BAD_ROOM");
  await roomClient().removeParticipant(roomId, identity);
}

export async function adminMoveParticipant(
  fromRoomId: string,
  identity: string,
  toRoomId: string
): Promise<void> {
  if (!isVoiceRoomId(fromRoomId) || !isVoiceRoomId(toRoomId)) throw new Error("BAD_ROOM");
  if (fromRoomId === toRoomId) return;

  const client = roomClient();
  const source = await client.listParticipants(fromRoomId).catch(() => []);
  if (!source.some((p) => p.identity === identity)) {
    throw new Error("participant not found");
  }

  const dest = await client.listParticipants(toRoomId).catch(() => []);
  if (dest.length >= VOICE_ROOM_CAPACITY && !dest.some((p) => p.identity === identity)) {
    throw new Error("ROOM_FULL");
  }

  try {
    await client.createRoom({
      name: toRoomId,
      emptyTimeout: 60 * 60,
      maxParticipants: VOICE_ROOM_CAPACITY,
    });
  } catch {
    /* exists */
  }

  await client.moveParticipant(fromRoomId, identity, toRoomId);
}
