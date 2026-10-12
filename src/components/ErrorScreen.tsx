import Image from "next/image";

/** Общий экран для 404 и ошибок: логотип, крупный код, пояснение и действия */
export function ErrorScreen({
  code,
  title,
  text,
  children,
}: {
  code: string;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <main className="rise-in flex min-h-[100svh] flex-col items-center justify-center px-4 py-12 text-center">
      <Image src="/brand/start-plus.png" alt="СТАРТ+" width={72} height={78} priority className="mb-6 h-auto w-[64px]" />
      <p
        className="font-display text-[88px] font-bold leading-none tracking-[-0.05em] min-[720px]:text-[128px]"
        style={{
          background: "linear-gradient(180deg, var(--points) 0%, var(--power) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {code}
      </p>
      <h1 className="mt-4">{title}</h1>
      <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-[var(--text-2)]">{text}</p>
      <div className="mt-7 flex w-full max-w-[360px] flex-col gap-2 min-[480px]:w-auto min-[480px]:max-w-none min-[480px]:flex-row">
        {children}
      </div>
    </main>
  );
}
