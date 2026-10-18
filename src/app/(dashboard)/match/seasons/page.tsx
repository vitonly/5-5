import { redirect } from "next/navigation";

/**
 * Раньше здесь была вторая полная таблица очков по сезонам.
 * Теперь таблица одна — в «Статистике» (там же переключатель сезонов и архив), старый адрес ведёт туда.
 */
export default function MatchSeasonsPage() {
  redirect("/stats");
}
