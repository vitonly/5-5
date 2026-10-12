"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      code="Упс"
      title="Что-то пошло не так"
      text="Страница не загрузилась. Попробуйте ещё раз — обычно это помогает."
    >
      <Button onClick={() => unstable_retry()}>Попробовать снова</Button>
      <Button asChild variant="outline">
        <Link href="/">На главную</Link>
      </Button>
    </ErrorScreen>
  );
}
