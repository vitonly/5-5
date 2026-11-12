import type { CardDesign, CardPattern } from "@/lib/card-design";
import { CARD_HEIGHT, CARD_WIDTH, SHIELD_PATH } from "@/lib/card-design";

/** Слой с «глубиной» для 3D-наклона: чем больше depth, тем сильнее сдвигается (см. .tilt-layer) */
function depth(d: number) {
  return { "--depth": d } as React.CSSProperties;
}

/** Запас по краям у фото и фона: при наклоне слой сдвигается и край не должен показываться */
const BLEED = 8;

function PatternLayer({ design }: { design: CardDesign }) {
  const id = design.id;
  const o = design.patternOpacity;

  switch (design.pattern as CardPattern) {
    case "cosmos":
      return (
        <g opacity={o}>
          <defs>
            <radialGradient id={`rg-${id}`} cx="70%" cy="30%" r="60%">
              <stop offset="0%" stopColor={design.accent} stopOpacity="0.5" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#rg-${id})`} />
          <polygon points="180,60 240,120 200,200 120,140" fill={design.accentAlt} opacity="0.15" />
          <polygon points="40,100 100,40 160,100 100,180" fill={design.accent} opacity="0.12" />
          <polygon points="200,250 280,200 260,320 180,300" fill={design.accentAlt} opacity="0.1" />
          <circle cx="220" cy="280" r="55" fill="none" stroke={design.accent} strokeWidth="1" opacity="0.2" />
          <circle cx="60" cy="220" r="35" fill={design.accentAlt} opacity="0.08" />
          {[...Array(12)].map((_, i) => (
            <circle
              key={i}
              cx={30 + (i * 23) % CARD_WIDTH}
              cy={50 + (i * 31) % 280}
              r={2 + (i % 3)}
              fill={design.accent}
              opacity={0.15 + (i % 5) * 0.05}
            />
          ))}
        </g>
      );

    case "wire":
      return (
        <g opacity={o * 0.9} stroke={design.accent} strokeWidth="0.6" fill="none">
          {[...Array(14)].map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 30} x2={CARD_WIDTH} y2={i * 30 + 40} opacity="0.12" />
          ))}
          {[...Array(12)].map((_, i) => (
            <line key={`v${i}`} x1={i * 25} y1="0" x2={i * 25 + 60} y2={CARD_HEIGHT} opacity="0.1" />
          ))}
          <polygon points="140,80 220,160 140,240 60,160" opacity="0.15" />
          <polygon points="140,120 190,170 140,220 90,170" opacity="0.1" />
          <circle cx="140" cy="170" r="80" opacity="0.08" />
        </g>
      );

    case "neon":
      return (
        <g opacity={o}>
          <defs>
            <linearGradient id={`ng-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={design.accent} stopOpacity="0.35" />
              <stop offset="50%" stopColor="transparent" />
              <stop offset="100%" stopColor={design.accentAlt} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#ng-${id})`} />
          <polygon points="0,120 140,0 280,80 140,200" fill={design.accent} opacity="0.08" />
          <polygon points="0,280 200,160 280,400 80,400" fill={design.accentAlt} opacity="0.07" />
          {[...Array(8)].map((_, i) => (
            <polygon
              key={i}
              points={`${i * 35},${300 + i * 5} ${i * 35 + 20},${280 + i * 8} ${i * 35 + 10},${320 + i * 3}`}
              fill={design.accent}
              opacity="0.2"
            />
          ))}
        </g>
      );

    case "gold":
      return (
        <g opacity={o}>
          <defs>
            <radialGradient id={`gg-${id}`} cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor={design.shine} />
              <stop offset="60%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#gg-${id})`} />
          {[...Array(6)].map((_, i) => (
            <line
              key={i}
              x1="0"
              y1={60 + i * 55}
              x2={CARD_WIDTH}
              y2={30 + i * 55}
              stroke={design.accent}
              strokeWidth="0.5"
              opacity="0.12"
            />
          ))}
          <ellipse cx="140" cy="180" rx="100" ry="60" fill={design.accent} opacity="0.06" />
        </g>
      );

    case "silver":
      return (
        <g opacity={o}>
          <defs>
            <linearGradient id={`sg-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.15" />
              <stop offset="50%" stopColor="transparent" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#sg-${id})`} />
          <polygon points="0,0 280,100 280,200 0,120" fill="#fff" opacity="0.04" />
          <polygon points="0,250 280,180 280,400 0,400" fill="#fff" opacity="0.03" />
        </g>
      );

    default:
      return null;
  }
}

export function CardFrame({
  design,
  rating,
  firstName,
  lastName,
  photoUrl,
  size = CARD_WIDTH,
  hideName = false,
}: {
  design: CardDesign;
  rating: number;
  firstName: string;
  lastName?: string | null;
  photoUrl?: string | null;
  /** ширина в px; высота масштабируется пропорционально */
  size?: number;
  /** Только фото + сила — без полоски с ФИО (профиль игрока) */
  hideName?: boolean;
}) {
  const clipId = `clip-${design.id}`;
  const borderId = `border-${design.id}`;
  const line1 = firstName.trim().toUpperCase();
  const line2 = (lastName || "").trim().toUpperCase();
  const single = !line2 ? line1 : null;
  const nameFontSize = single
    ? single.length > 14
      ? 13
      : single.length > 10
        ? 15
        : 17
    : Math.max(line1.length, line2.length) > 12
      ? 13
      : 15;

  return (
    <svg
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
      width={size}
      height={Math.round((size * CARD_HEIGHT) / CARD_WIDTH)}
      className="block h-auto max-w-full drop-shadow-2xl"
      style={{ filter: `drop-shadow(0 12px 32px ${design.glow})` }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SHIELD_PATH} />
        </clipPath>
        <linearGradient id={borderId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={design.borderGradient[0]} />
          <stop offset="50%" stopColor={design.borderGradient[1]} />
          <stop offset="100%" stopColor={design.borderGradient[2]} />
        </linearGradient>
        <linearGradient id={`bg-${design.id}`} x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={design.bgGradient[0]} />
          <stop offset="55%" stopColor={design.bgGradient[1]} />
          <stop offset="100%" stopColor={design.bgGradient[2]} />
        </linearGradient>
      </defs>

      {/* Border */}
      <path d={SHIELD_PATH} fill={`url(#${borderId})`} />

      <g clipPath={`url(#${clipId})`} transform="translate(3.5, 3.5) scale(0.975)">
        {/* Задний слой: фото или фон — сдвигается меньше всех */}
        <g className="tilt-layer" style={depth(0.3)}>
          {photoUrl ? (
            <image
              href={photoUrl}
              x={-BLEED}
              y={-BLEED}
              width={CARD_WIDTH + BLEED * 2}
              height={CARD_HEIGHT + BLEED * 2}
              preserveAspectRatio="xMidYMid slice"
            />
          ) : (
            <>
              <rect
                x={-BLEED}
                y={-BLEED}
                width={CARD_WIDTH + BLEED * 2}
                height={CARD_HEIGHT + BLEED * 2}
                fill={`url(#bg-${design.id})`}
              />
              <PatternLayer design={design} />
              <g transform="translate(90, 110)" opacity="0.45" fill={design.accent}>
                <ellipse cx="50" cy="35" rx="32" ry="36" />
                <path d="M10 180 Q10 100 50 88 Q90 100 90 180 Z" />
              </g>
            </>
          )}
        </g>

        {/* Сила поверх фото — передний слой, сдвигается сильнее всех */}
        <g className="tilt-layer" style={depth(1)}>
          <text
            x="28"
            y="72"
            fill={design.text}
            fontSize="52"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
            style={{ filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.8))` }}
          >
            {rating}
          </text>
        </g>

        {!hideName && (
          <g className="tilt-layer" style={depth(0.65)}>
            {/* Name bar */}
            <rect
              x="24"
              y="278"
              width={CARD_WIDTH - 48}
              height={line2 ? 56 : 42}
              rx="4"
              fill="rgba(0,0,0,0.55)"
            />
            {single ? (
              <text
                x={CARD_WIDTH / 2}
                y="306"
                fill={design.text}
                fontSize={nameFontSize}
                fontWeight="900"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
              >
                {fitLine(single, 16)}
              </text>
            ) : (
              <>
                <text
                  x={CARD_WIDTH / 2}
                  y="300"
                  fill={design.text}
                  fontSize={nameFontSize}
                  fontWeight="900"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                >
                  {fitLine(line1, 16)}
                </text>
                <text
                  x={CARD_WIDTH / 2}
                  y="320"
                  fill={design.text}
                  fontSize={nameFontSize}
                  fontWeight="900"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                >
                  {fitLine(line2, 16)}
                </text>
              </>
            )}
          </g>
        )}

        {/* Shine line top */}
        <path
          d="M20 22 L130 22 L140 14 L150 22 L260 22"
          stroke={design.shine}
          strokeWidth="1"
          fill="none"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}

/**
 * Оборот FIFA-карточки: тот же щит и цвета, внутри — до 4 крупных цифр сеткой 2×2.
 * id градиентов с приставкой «b-», чтобы не совпасть с лицевой стороной на той же странице.
 */
export function CardBack({
  design,
  title,
  stats,
  footer,
  size = CARD_WIDTH,
}: {
  design: CardDesign;
  /** Имя игрока сверху */
  title: string;
  /** Цифры: подпись + значение (берутся первые 4) */
  stats: { label: string; value: string }[];
  /** Строка внизу, например роль */
  footer?: string | null;
  size?: number;
}) {
  const id = `b-${design.id}`;
  // Центры клеток сетки 2×2: столбцы и строки
  const cols = [80, 200];
  const rows = [150, 240];

  return (
    <svg
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
      width={size}
      height={Math.round((size * CARD_HEIGHT) / CARD_WIDTH)}
      className="block h-auto max-w-full"
      style={{ filter: `drop-shadow(0 12px 32px ${design.glow})` }}
      role="img"
      aria-label={`${title}: ${stats.map((s) => `${s.label} ${s.value}`).join(", ")}`}
    >
      <defs>
        <clipPath id={`clip-${id}`}>
          <path d={SHIELD_PATH} />
        </clipPath>
        <linearGradient id={`border-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={design.borderGradient[0]} />
          <stop offset="50%" stopColor={design.borderGradient[1]} />
          <stop offset="100%" stopColor={design.borderGradient[2]} />
        </linearGradient>
        <linearGradient id={`bg-${id}`} x1="100%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={design.bgGradient[0]} />
          <stop offset="55%" stopColor={design.bgGradient[1]} />
          <stop offset="100%" stopColor={design.bgGradient[2]} />
        </linearGradient>
      </defs>

      <path d={SHIELD_PATH} fill={`url(#border-${id})`} />

      <g clipPath={`url(#clip-${id})`} transform="translate(3.5, 3.5) scale(0.975)">
        <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#bg-${id})`} />
        {/* Затемнение, чтобы цифры читались на любом фоне */}
        <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill="rgba(0,0,0,0.35)" />
        <circle cx="220" cy="300" r="70" fill={design.accent} opacity="0.08" />
        <circle cx="50" cy="90" r="45" fill={design.accentAlt} opacity="0.08" />

        <g fill={design.text} fontFamily="system-ui, sans-serif" textAnchor="middle">
          <text x={CARD_WIDTH / 2} y="50" fontSize="12" fontWeight="700" letterSpacing="2" opacity="0.7">
            СТАТИСТИКА
          </text>
          <text x={CARD_WIDTH / 2} y="76" fontSize="18" fontWeight="900">
            {fitLine(title.toUpperCase(), 18)}
          </text>

          {/* Тонкие линии сетки */}
          <g stroke={design.text} strokeWidth="1" opacity="0.15">
            <line x1="140" y1="112" x2="140" y2="278" />
            <line x1="36" y1="195" x2="244" y2="195" />
          </g>

          {stats.slice(0, 4).map((s, i) => {
            const x = cols[i % 2];
            const y = rows[Math.floor(i / 2)];
            return (
              <g key={s.label}>
                <text x={x} y={y} fontSize="38" fontWeight="900">
                  {fitLine(s.value, 6)}
                </text>
                <text x={x} y={y + 24} fontSize="15" fontWeight="700" letterSpacing="1" opacity="0.75">
                  {s.label.toUpperCase()}
                </text>
              </g>
            );
          })}

          {footer && (
            <text x={CARD_WIDTH / 2} y="318" fontSize="15" fontWeight="700" opacity="0.85">
              {fitLine(footer, 24)}
            </text>
          )}
        </g>

        <path
          d="M20 22 L130 22 L140 14 L150 22 L260 22"
          stroke={design.shine}
          strokeWidth="1"
          fill="none"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}

function fitLine(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}
