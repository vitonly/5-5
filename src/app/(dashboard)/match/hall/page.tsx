import { redirect } from "next/navigation";

/** Зал славы переехал в отдельный раздел */
export default function OldHallRedirect() {
  redirect("/hall");
}
