import { prisma } from "@/lib/db";
import { getLiveStreams, extractTwitchLogin, type LiveStream } from "@/lib/twitch";

export async function getLiveStreamsFromMaterials(): Promise<{
  liveStreams: LiveStream[];
  liveLogins: string[];
}> {
  const streamMaterials = await prisma.learningMaterial.findMany({
    where: { type: "STREAM" },
  });

  const logins = streamMaterials
    .map((m) => extractTwitchLogin(m.url || m.title))
    .filter((l): l is string => Boolean(l));

  const uniqueLogins = Array.from(new Set(logins));
  const liveStreams = await getLiveStreams(uniqueLogins);

  return {
    liveStreams,
    liveLogins: liveStreams.map((s) => s.login),
  };
}
