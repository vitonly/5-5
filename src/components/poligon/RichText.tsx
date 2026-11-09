/*
 * Текст с выделением **жирным** — без разборщика Markdown:
 * режем строку по двойным звёздочкам, чётные куски — обычные, нечётные — жирные.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-[var(--text)]">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
