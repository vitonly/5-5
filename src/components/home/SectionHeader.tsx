import Link from "next/link";

export function SectionHeader({
  title,
  href,
  linkLabel,
  as: Tag = "h2",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <Tag className="text-[17px] leading-snug min-[720px]:text-[20px]">{title}</Tag>
      {href && (
        <Link
          href={href}
          className="press -mr-2 shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-[13px] font-medium text-[var(--points)] transition-colors hover:bg-[var(--points-bg)]"
        >
          {linkLabel ?? "Все"} →
        </Link>
      )}
    </div>
  );
}
