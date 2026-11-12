/**
 * Маленький салют: искры разлетаются из центра родителя и гаснут (~600 мс).
 * Родитель должен быть position: relative. Чтобы запустить ещё раз — поменять key.
 * При prefers-reduced-motion искры не показываются (см. .burst в globals.css).
 */
const SPARKS = 10;

export function Burst({ className }: { className?: string }) {
  return (
    <span className={className ? `burst ${className}` : "burst"} aria-hidden>
      {Array.from({ length: SPARKS }, (_, i) => (
        <span
          key={i}
          // Угол каждой искры — равномерно по кругу; чётные чуть дальше, чтобы салют был «неровным»
          style={{ "--a": `${(360 / SPARKS) * i}deg`, "--d": i % 2 ? "22px" : "30px" } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
