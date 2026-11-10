/*
 * Схемы окон программ для уроков: Excel, Word и слайды.
 * Это не скриншоты, а упрощённые рисунки: показывают, куда нажать и что должно получиться.
 */
import type { ConnectorId, ExcelFigure, SlideFigure, WinFigure } from "@/lib/poligon/types";
import { cn } from "@/lib/utils";
import { RichText } from "./RichText";

const EXCEL_TABS = ["Файл", "Главная", "Вставка", "Разметка", "Формулы", "Данные", "Вид"];
const LETTERS = "ABCDEFGHIJKLMNOP".split("");

const MARK = {
  bad: "bg-[var(--danger-bg)] text-[var(--danger)] font-semibold",
  ok: "bg-[var(--success-bg)] text-[var(--success-ink)] font-semibold",
  sel: "outline outline-2 -outline-offset-2 outline-[var(--success)] bg-[var(--success-bg)]",
};

function Caption({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <figcaption className="border-t border-[var(--border-soft)] px-3 py-1.5 text-[13px] text-[var(--text-3)]">
      <RichText text={text} />
    </figcaption>
  );
}

export function ExcelMock(f: ExcelFigure) {
  const cols = f.cols ?? LETTERS.slice(0, Math.max(...f.rows.map((r) => r.length), 1));
  const first = f.firstRow ?? 1;
  return (
    <figure className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
      {/* Вкладки и лента */}
      {(f.tab || f.ribbon) && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <div className="no-scrollbar flex gap-0.5 overflow-x-auto px-2 pt-1.5 text-[12px]">
            {EXCEL_TABS.map((t) => (
              <span
                key={t}
                className={cn(
                  "whitespace-nowrap rounded-t px-2 py-1",
                  t === f.tab ? "bg-[var(--surface)] font-semibold text-[var(--success-ink)]" : "text-[var(--text-3)]"
                )}
              >
                {t}
              </span>
            ))}
          </div>
          {f.ribbon && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto bg-[var(--surface)] px-2 py-2">
              {f.ribbon.map((b) => (
                <span
                  key={b}
                  className={cn(
                    "whitespace-nowrap rounded border px-2 py-1 text-[12px]",
                    b === f.active
                      ? "border-[var(--success)] bg-[var(--success-bg)] font-semibold text-[var(--success-ink)] ring-2 ring-[var(--success)]"
                      : "border-[var(--border-soft)] text-[var(--text-2)]"
                  )}
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Строка формул */}
      {(f.cell || f.formula) && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1 font-mono text-[13px]">
          <span className="min-w-12 rounded border border-[var(--border-soft)] px-1.5 text-center text-[var(--text-2)]">{f.cell ?? ""}</span>
          <span className="italic text-[var(--text-3)]">fx</span>
          <span className="break-all text-[var(--text)]">{f.formula ?? ""}</span>
        </div>
      )}
      {/* Таблица */}
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[12.5px]">
          <thead>
            <tr>
              <th className="w-8 border border-[var(--border-soft)] bg-[var(--surface-muted)]" />
              {cols.map((c) => (
                <th key={c} className="border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-0.5 font-normal text-[var(--text-3)]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.rows.map((row, r) => (
              <tr key={r}>
                <td className="border border-[var(--border-soft)] bg-[var(--surface-muted)] px-1 text-center text-[var(--text-3)]">{first + r}</td>
                {cols.map((_, c) => {
                  const m = f.marks?.[`${r},${c}`];
                  return (
                    <td
                      key={c}
                      className={cn(
                        "whitespace-nowrap border border-[var(--border-soft)] px-2 py-0.5 text-[var(--text)]",
                        r === 0 && first === 1 && "font-semibold",
                        m && MARK[m]
                      )}
                    >
                      {row[c] ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Окно-диалог */}
      {f.dialog && (
        <div className="m-3 max-w-[340px] rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] shadow-[var(--shadow-raised)]">
          <div className="border-b border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text)]">
            {f.dialog.title}
          </div>
          <ul className="flex flex-col gap-1 px-3 py-2 text-[13px] text-[var(--text-2)]">
            {f.dialog.lines.map((l, i) => (
              <li key={i}>
                <RichText text={l} />
              </li>
            ))}
          </ul>
          {f.dialog.button && (
            <div className="flex justify-end px-3 pb-2">
              <span className="rounded border border-[var(--success)] bg-[var(--success-bg)] px-3 py-0.5 text-[12px] font-semibold text-[var(--success-ink)] ring-2 ring-[var(--success)]">
                {f.dialog.button}
              </span>
            </div>
          )}
        </div>
      )}
      <Caption text={f.caption} />
    </figure>
  );
}

export function WordMock({
  caption,
  ribbon,
  active,
  lines,
}: {
  caption?: string;
  ribbon?: string;
  active?: string;
  lines: { style: "title" | "h1" | "h2" | "p" | "li"; text: string }[];
}) {
  const styles = ["Обычный", "Заголовок 1", "Заголовок 2", "Название", "Список"];
  return (
    <figure className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)]">
      {ribbon && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-[12px]">
          <span className="mr-1 font-semibold text-[var(--admin-ink)]">{ribbon}</span>
          {styles.map((st) => (
            <span
              key={st}
              className={cn(
                "whitespace-nowrap rounded border px-2 py-1",
                st === active
                  ? "border-[var(--admin-border)] bg-[var(--admin-bg)] font-semibold text-[var(--admin-ink)] ring-2 ring-[var(--admin-border)]"
                  : "border-[var(--border-soft)] text-[var(--text-2)]"
              )}
            >
              {st}
            </span>
          ))}
        </div>
      )}
      <div className="mx-auto my-3 flex max-w-[520px] flex-col gap-1.5 bg-[var(--surface)] px-6 py-5 shadow-[var(--shadow-xs)]">
        {lines.map((l, i) => (
          <p
            key={i}
            className={cn(
              "text-[var(--text)]",
              l.style === "title" && "text-center text-[15px] font-bold uppercase",
              l.style === "h1" && "mt-2 text-[14px] font-bold",
              l.style === "h2" && "text-[13px] font-semibold",
              l.style === "p" && "text-justify text-[12.5px] leading-snug",
              l.style === "li" && "pl-4 text-[12.5px] leading-snug"
            )}
          >
            {l.text}
          </p>
        ))}
      </div>
      <Caption text={caption} />
    </figure>
  );
}

export function SlidesMock({ caption, items }: { caption?: string; items: SlideFigure[] }) {
  return (
    <figure className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="grid gap-3 p-3 min-[640px]:grid-cols-2">
        {items.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className={cn("text-[12px] font-semibold", s.tone === "good" ? "text-[var(--success-ink)]" : "text-[var(--danger)]")}>
              {s.tone === "good" ? "✓ " : "✗ "}
              {s.label}
            </span>
            <div
              className={cn(
                "flex aspect-[16/9] max-w-full flex-col gap-2 overflow-hidden rounded border p-3",
                s.tone === "good" ? "border-[var(--success-border)]" : "border-[var(--danger-border)]"
              )}
            >
              <p className="text-[13px] font-bold leading-tight text-[var(--text)]">{s.title}</p>
              {s.big && (
                <div className="grid flex-1 grid-cols-3 items-center gap-2">
                  {s.big.map((b) => (
                    <div key={b.label} className="text-center">
                      <p className="font-mono-num text-[18px] font-bold text-[var(--points-ink)]">{b.value}</p>
                      <p className="text-[10px] text-[var(--text-3)]">{b.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {s.bars && (
                <div className="flex flex-1 items-end gap-1.5">
                  {s.bars.map((b) => (
                    <div key={b.label} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                      <div className="w-full rounded-t bg-[var(--points-ink)]" style={{ height: `${Math.max(4, b.value) * 0.6}px` }} />
                      <span className="text-[9px] text-[var(--text-3)]">{b.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {s.bullets && (
                <ul className="flex flex-col gap-0.5 pl-3 text-[10.5px] leading-snug text-[var(--text-2)]">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="list-disc">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
      <Caption text={caption} />
    </figure>
  );
}

/* ---------- Windows: окно с деревом или списком ---------- */

const WIN_ICON = {
  warn: { ch: "⚠", cls: "text-[var(--warning)]" },
  off: { ch: "⬇", cls: "text-[var(--text-3)]" },
  ok: { ch: "✓", cls: "text-[var(--success)]" },
  folder: { ch: "▸", cls: "text-[var(--text-3)]" },
};

export function WinMock({ caption, title, path, items, buttons, active }: WinFigure) {
  return (
    <figure className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5">
        <span className="text-[13px] font-semibold text-[var(--text)]">{title}</span>
        <span className="font-mono text-[12px] tracking-widest text-[var(--text-3)]">— ▢ ✕</span>
      </div>
      {path && <div className="border-b border-[var(--border-soft)] px-3 py-1.5 text-[13px] text-[var(--text-2)]">{path}</div>}
      <ul className="flex flex-col py-1 text-[13px]">
        {items.map((it, i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-2 px-3 py-0.5 text-[var(--text)]",
              it.mark === "sel" && "bg-[var(--success-bg)] outline outline-1 -outline-offset-1 outline-[var(--success)]",
              it.mark === "bad" && "bg-[var(--danger-bg)]"
            )}
            style={{ paddingLeft: `${12 + (it.indent ?? 0) * 18}px` }}
          >
            {it.icon && <span className={cn("w-4 text-center", WIN_ICON[it.icon].cls)}>{WIN_ICON[it.icon].ch}</span>}
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
      {buttons && (
        <div className="flex flex-wrap justify-end gap-1.5 border-t border-[var(--border-soft)] px-3 py-2">
          {buttons.map((b) => (
            <span
              key={b}
              className={cn(
                "rounded border px-2.5 py-0.5 text-[12px]",
                b === active
                  ? "border-[var(--success)] bg-[var(--success-bg)] font-semibold text-[var(--success-ink)] ring-2 ring-[var(--success)]"
                  : "border-[var(--border-soft)] text-[var(--text-2)]"
              )}
            >
              {b}
            </span>
          ))}
        </div>
      )}
      <Caption text={caption} />
    </figure>
  );
}

/* ---------- Командная строка ---------- */

export function ConsoleMock({ caption, lines }: { caption?: string; lines: string[] }) {
  return (
    <figure className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text)]">
        Командная строка
      </div>
      <pre className="overflow-x-auto bg-[var(--surface-muted)] px-3 py-2 font-mono text-[12.5px] leading-relaxed text-[var(--text)]">
        {lines.join("\n")}
      </pre>
      <Caption text={caption} />
    </figure>
  );
}

/* ---------- Разъёмы: упрощённые рисунки ---------- */


export const CONNECTOR_INFO: Record<ConnectorId, { name: string; what: string }> = {
  hdmi: { name: "HDMI", what: "Видео и звук на монитор или телевизор" },
  dp: { name: "DisplayPort", what: "Видео (и звук) на монитор; один угол срезан" },
  vga: { name: "VGA (D-Sub)", what: "Аналоговое видео на старый монитор; синий, 15 контактов, винты" },
  dvi: { name: "DVI", what: "Цифровое видео на монитор; широкий, белый, винты" },
  usba: { name: "USB-A", what: "Клавиатура, мышь, гарнитура, флешка" },
  usbc: { name: "USB-C", what: "Симметричный: можно вставить любой стороной" },
  rj45: { name: "RJ-45 (Ethernet)", what: "Сетевой кабель: ПК ↔ роутер или коммутатор" },
  "jack-green": { name: "3,5 мм, зелёный", what: "Выход на наушники или колонки" },
  "jack-pink": { name: "3,5 мм, розовый", what: "Вход микрофона" },
  c13: { name: "Сетевой кабель питания (C13)", what: "Питание ПК или монитора от розетки или ИБП" },
  atx24: { name: "ATX 24-pin", what: "Главное питание материнской платы от блока питания" },
  eps8: { name: "EPS 8-pin (4+4)", what: "Питание процессора — разъём у сокета, сверху слева" },
  pcie8: { name: "PCIe 8-pin (6+2)", what: "Дополнительное питание видеокарты" },
  sata: { name: "SATA", what: "Данные и питание SSD/HDD; Г-образный ключ" },
};

function ConnectorSvg({ id }: { id: ConnectorId }) {
  const stroke = "var(--text)";
  const fill = "var(--surface-muted)";
  const pin = "var(--text-3)";
  const common = { stroke, strokeWidth: 2, fill };
  switch (id) {
    case "hdmi":
      return <path d="M10 18 H90 V32 L80 42 H20 L10 32 Z" {...common} />;
    case "dp":
      return <path d="M10 18 H90 V42 H20 L10 32 Z" {...common} />;
    case "vga":
      return (
        <g>
          <path d="M14 16 H86 L78 44 H22 Z" {...common} style={{ fill: "var(--points-bg)" }} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3, 4].map((c) => <circle key={`${r}${c}`} cx={30 + c * 10 + r * 2} cy={24 + r * 8} r="2" fill={pin} />)
          )}
        </g>
      );
    case "dvi":
      return (
        <g>
          <rect x="8" y="16" width="84" height="28" rx="3" {...common} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3, 4, 5, 6, 7].map((c) => <rect key={`${r}${c}`} x={14 + c * 7} y={21 + r * 7} width="3" height="3" fill={pin} />)
          )}
          <rect x="74" y="27" width="12" height="3" fill={pin} />
        </g>
      );
    case "usba":
      return (
        <g>
          <rect x="18" y="18" width="64" height="24" rx="2" {...common} />
          <rect x="24" y="22" width="52" height="8" fill={pin} />
        </g>
      );
    case "usbc":
      return (
        <g>
          <rect x="22" y="20" width="56" height="20" rx="10" {...common} />
          <rect x="32" y="28" width="36" height="4" rx="2" fill={pin} />
        </g>
      );
    case "rj45":
      return (
        <g>
          <path d="M22 14 H78 V40 H62 V46 H38 V40 H22 Z" {...common} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
            <rect key={c} x={28 + c * 6} y="18" width="3" height="10" fill={pin} />
          ))}
        </g>
      );
    case "jack-green":
    case "jack-pink":
      return (
        <g>
          <circle cx="50" cy="30" r="16" {...common} style={{ fill: id === "jack-green" ? "var(--success-bg)" : "var(--danger-bg)" }} />
          <circle cx="50" cy="30" r="5" fill={pin} />
        </g>
      );
    case "c13":
      return <path d="M20 16 H80 V36 L70 46 H30 L20 36 Z" {...common} />;
    case "atx24":
      return (
        <g>
          <rect x="6" y="18" width="88" height="24" rx="2" {...common} />
          {[0, 1].map((r) =>
            Array.from({ length: 12 }, (_, c) => <rect key={`${r}${c}`} x={9 + c * 7} y={21 + r * 10} width="5" height="7" fill={pin} />)
          )}
        </g>
      );
    case "eps8":
    case "pcie8":
      return (
        <g>
          <rect x="22" y="18" width="56" height="24" rx="2" {...common} />
          {[0, 1].map((r) =>
            [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={26 + c * 13} y={21 + r * 10} width="9" height="7" fill={pin} />)
          )}
          {id === "pcie8" && <line x1="65" y1="16" x2="65" y2="44" stroke={stroke} strokeWidth="2" strokeDasharray="3 2" />}
          {id === "eps8" && <line x1="50" y1="16" x2="50" y2="44" stroke={stroke} strokeWidth="2" strokeDasharray="3 2" />}
        </g>
      );
    case "sata":
      return <path d="M14 22 H86 V38 H24 V30 H14 Z" {...common} />;
  }
}

export function ConnectorPic({ id, size = 100 }: { id: ConnectorId; size?: number }) {
  return (
    <svg viewBox="0 0 100 60" width={size} height={(size * 60) / 100} role="img" aria-label="Разъём">
      <ConnectorSvg id={id} />
    </svg>
  );
}

export function ConnectorsMock({ caption, items }: { caption?: string; items: ConnectorId[] }) {
  return (
    <figure className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="grid grid-cols-2 gap-3 p-3 min-[640px]:grid-cols-4">
        {items.map((id) => (
          <div key={id} className="flex flex-col items-center gap-1 text-center">
            <ConnectorPic id={id} />
            <span className="text-[13px] font-semibold text-[var(--text)]">{CONNECTOR_INFO[id].name}</span>
            <span className="text-[12px] text-[var(--text-3)]">{CONNECTOR_INFO[id].what}</span>
          </div>
        ))}
      </div>
      <Caption text={caption} />
    </figure>
  );
}
