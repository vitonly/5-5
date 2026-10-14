import {
  AlarmClockCheck,
  ArrowUpFromLine,
  Axe,
  BookOpen,
  Crown,
  Dumbbell,
  HeartHandshake,
  Rocket,
  Shield,
  StarHalf,
  Timer,
  BadgeCheck,
  CalendarCheck,
  Flame,
  Footprints,
  HelpCircle,
  Medal,
  Moon,
  NotebookPen,
  RotateCcw,
  Send,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
  Trophy,
  Vote,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  footprints: Footprints,
  "calendar-check": CalendarCheck,
  flame: Flame,
  "notebook-pen": NotebookPen,
  "badge-check": BadgeCheck,
  sparkles: Sparkles,
  "alarm-clock-check": AlarmClockCheck,
  moon: Moon,
  trophy: Trophy,
  swords: Swords,
  zap: Zap,
  shuffle: Shuffle,
  "rotate-ccw": RotateCcw,
  star: Star,
  medal: Medal,
  "trending-up": TrendingUp,
  vote: Vote,
  send: Send,
  "shield-check": ShieldCheck,
  "book-open": BookOpen,
  timer: Timer,
  rocket: Rocket,
  crown: Crown,
  shield: Shield,
  axe: Axe,
  "heart-handshake": HeartHandshake,
  dumbbell: Dumbbell,
  "star-half": StarHalf,
  "arrow-up-from-line": ArrowUpFromLine,
};

const TIER_STYLE: Record<number, { bg: string; ring: string; glow: string }> = {
  1: {
    bg: "linear-gradient(145deg, var(--bronze-light), var(--bronze))",
    ring: "var(--bronze)",
    glow: "0 6px 16px rgba(154, 100, 56, 0.35)",
  },
  2: {
    bg: "linear-gradient(145deg, #ffffff, var(--silver))",
    ring: "var(--silver)",
    glow: "0 6px 16px rgba(86, 97, 106, 0.3)",
  },
  3: {
    bg: "linear-gradient(145deg, var(--gold-light), var(--gold))",
    ring: "var(--gold)",
    glow: "0 6px 18px rgba(201, 151, 28, 0.45)",
  },
};

export const TIER_NAMES: Record<number, string> = { 1: "Бронза", 2: "Серебро", 3: "Золото" };

/** Круглый значок ачивки цвета уровня; закрытая — серая, секретная — «?» */
export function AchievementBadge({
  icon,
  tier,
  size = 56,
  locked = false,
  secret = false,
  className,
}: {
  icon: string;
  tier: number;
  size?: number;
  locked?: boolean;
  secret?: boolean;
  className?: string;
}) {
  const Icon = secret && locked ? HelpCircle : (ACHIEVEMENT_ICONS[icon] ?? Star);
  const style = TIER_STYLE[tier] ?? TIER_STYLE[1];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        locked ? "bg-[var(--control)] text-[var(--text-3)] ring-1 ring-[var(--border)]" : "text-white",
        className
      )}
      style={
        locked
          ? { width: size, height: size }
          : { width: size, height: size, background: style.bg, boxShadow: `${style.glow}, inset 0 1px 0 rgba(255,255,255,0.6)` }
      }
    >
      <Icon
        aria-hidden
        style={{ width: size * 0.46, height: size * 0.46 }}
        className={locked ? undefined : "drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"}
        strokeWidth={2.2}
      />
    </span>
  );
}

/** Точки уровней под значком: ●●○ */
export function TierDots({ tier, maxTier }: { tier: number; maxTier: number }) {
  if (maxTier <= 1) return null;
  return (
    <span className="inline-flex gap-1" aria-label={`Уровень ${tier} из ${maxTier}`}>
      {Array.from({ length: maxTier }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background:
              i < tier ? (TIER_STYLE[i + 1]?.ring ?? "var(--points)") : "var(--border)",
          }}
        />
      ))}
    </span>
  );
}
