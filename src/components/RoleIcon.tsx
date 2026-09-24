/** Иконки ролей в стиле Dota 2 (монохром). */
export function RoleIcon({
  role,
  className = "h-4 w-4",
  title,
}: {
  role: "CARRY" | "MID" | "OFFLANE" | "SUPPORT" | "HARD_SUPPORT";
  className?: string;
  title?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": title ? undefined : true,
    role: title ? ("img" as const) : undefined,
  };

  switch (role) {
    case "CARRY":
      // Лёгкая — меч
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path
            d="M14.5 3.5l6 6-1.2 1.2-1.8-1.8-7.4 7.4-2.3-.6-.6-2.3 7.4-7.4-1.8-1.8L14.5 3.5z"
            fill="currentColor"
          />
          <path d="M5 19l2.5-1 1 1L7 21.5 5 19z" fill="currentColor" />
          <path d="M11.2 14.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "MID":
      // Центр — лук
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path
            d="M5 19c4-1 7-4 9-8l2.5 2.5c-2.2 3.2-5.5 5.8-9.5 7L5 19z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M14 5.5l4.5 4.5M12.5 4L20 11.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M18.5 9.5l1.8-3.2-3.2 1.8 1.4 1.4z" fill="currentColor" />
        </svg>
      );
    case "OFFLANE":
      // Сложная — щит с молнией
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path
            d="M12 2.5l7 2.5v6.2c0 4.2-2.8 7.8-7 9.3-4.2-1.5-7-5.1-7-9.3V5L12 2.5z"
            fill="currentColor"
            opacity="0.95"
          />
          <path
            d="M13.2 7.5L9.5 12.8h2.6L10.8 16.5l4.2-5.8h-2.5L13.2 7.5z"
            fill="var(--surface, #fff)"
          />
        </svg>
      );
    case "SUPPORT":
      // Поддержка — рука с искрой
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path
            d="M8.5 14c0-2.2 1.2-3.5 2.8-4.2V7.8c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v5.2c.4-.2.9-.3 1.4-.3 1.4 0 2.4 1 2.4 2.5V18c0 1.8-1.4 3-3.2 3H11c-2.2 0-3.8-1.4-3.8-3.5v-1.2c0-.8.3-1.5.8-2.1l.5-.7z"
            fill="currentColor"
          />
          <circle cx="12.5" cy="4.2" r="1.3" fill="currentColor" />
        </svg>
      );
    case "HARD_SUPPORT":
      // Полная поддержка — рука со звёздами
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path
            d="M8.5 14.5c0-2.2 1.2-3.5 2.8-4.2V8.2c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v5.2c.4-.2.9-.3 1.4-.3 1.4 0 2.4 1 2.4 2.5V18.2c0 1.8-1.4 3-3.2 3H11c-2.2 0-3.8-1.4-3.8-3.5v-1.2c0-.8.3-1.5.8-2.1l.5-.7z"
            fill="currentColor"
          />
          <path
            d="M12.2 2.2l.45 1.1 1.15.15-.85.8.25 1.15-1-.55-1 .55.25-1.15-.85-.8 1.15-.15.45-1.1zM16.2 3.5l.3.75.8.1-.6.55.15.8-.65-.35-.65.35.15-.8-.6-.55.8-.1.3-.75zM8.3 3.8l.28.7.75.1-.55.5.15.75-.63-.35-.63.35.15-.75-.55-.5.75-.1.28-.7z"
            fill="currentColor"
          />
        </svg>
      );
  }
}
