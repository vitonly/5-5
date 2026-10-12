import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/components/ErrorScreen";

export const metadata = { title: "Страница не найдена" };

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="Здесь туман войны"
      text="Такой страницы нет — возможно, ссылка устарела или в адресе опечатка."
    >
      <Button asChild>
        <Link href="/">На главную</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/materials">Материалы</Link>
      </Button>
    </ErrorScreen>
  );
}
