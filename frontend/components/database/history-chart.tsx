import { relativeTime } from "@/lib/format";

export interface HistoryPoint {
  at: string;
  score: number | null;
  status: string;
}

/**
 * Every earlier answer for this pair, oldest first. A score that moves across runs is
 * the thing a reviewer most needs to see, so it is drawn rather than described.
 */
export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const scored = points.filter((p) => p.score !== null);
  if (scored.length < 2) return null;

  const w = 100;
  const h = 34;
  const x = (i: number) => (scored.length === 1 ? 0 : (i / (scored.length - 1)) * w);
  const y = (s: number) => h - s * h;
  const line = scored
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.score ?? 0).toFixed(2)}`)
    .join(" ");

  const changes = scored.filter((p, i) => i > 0 && p.score !== scored[i - 1].score).length;

  return (
    <div>
      <svg
        viewBox={`-2 -2 ${w + 4} ${h + 4}`}
        preserveAspectRatio="none"
        className="h-[46px] w-full"
        aria-hidden
      >
        <line x1="0" y1={h} x2={w} y2={h} stroke="var(--edge)" strokeWidth="0.5" />
        <line x1="0" y1="0" x2={w} y2="0" stroke="var(--edge)" strokeWidth="0.5" />
        <path d={line} fill="none" stroke="var(--navy)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {scored.map((p, i) => (
          <circle
            key={p.at}
            cx={x(i)}
            cy={y(p.score ?? 0)}
            r="1.6"
            fill={i === scored.length - 1 ? "var(--navy)" : "var(--slate-soft)"}
          />
        ))}
      </svg>
      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
        {scored.length} scored runs, the earliest {relativeTime(scored[0].at)}.{" "}
        {changes === 0
          ? "The answer has not moved."
          : `The answer moved ${changes === 1 ? "once" : `${changes} times`}.`}
      </p>
    </div>
  );
}
