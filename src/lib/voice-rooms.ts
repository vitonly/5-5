export const VOICE_ROOMS = [
  { id: "voice-1", name: "Комната 1" },
  { id: "voice-2", name: "Комната 2" },
] as const;

export type VoiceRoomId = (typeof VOICE_ROOMS)[number]["id"];

export const VOICE_ROOM_CAPACITY = 5;

export function isVoiceRoomId(value: string): value is VoiceRoomId {
  return VOICE_ROOMS.some((r) => r.id === value);
}

export function voiceRoomLabel(id: string): string {
  return VOICE_ROOMS.find((r) => r.id === id)?.name ?? id;
}
