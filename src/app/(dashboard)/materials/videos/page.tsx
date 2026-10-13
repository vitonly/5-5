import { redirect } from "next/navigation";

export const metadata = { title: "Видео" };

/** Видео живут в общей ленте материалов — старый URL оставляем как редирект. */
export default function VideosPage() {
  redirect("/materials");
}
