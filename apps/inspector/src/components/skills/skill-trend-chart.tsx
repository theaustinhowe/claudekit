"use client";

import type { SkillTrendPoint } from "@/lib/actions/skills";

const TREND_COLORS = [
  "hsl(252, 80%, 60%)",
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(280, 70%, 55%)",
];

export function SkillTrendChart({ data }: { data: SkillTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Need at least 2 analyses to show trends. Run more analyses over time.
      </div>
    );
  }

  // Collect all unique skill names across analyses
  const allSkills = new Set<string>();
  for (const point of data) {
    for (const skill of point.skills) {
      allSkills.add(skill.name);
    }
  }

  // Take top skills by max frequency across all analyses
  const skillMaxFreq = new Map<string, number>();
  for (const name of allSkills) {
    let max = 0;
    for (const point of data) {
      const s = point.skills.find((sk) => sk.name === name);
      if (s && s.frequency > max) max = s.frequency;
    }
    skillMaxFreq.set(name, max);
  }

  const topSkills = [...skillMaxFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  // Build chart data
  const w = 500;
  const h = 200;
  const padX = 40;
  const padY = 20;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;
  const maxFreq = Math.max(...[...skillMaxFreq.values()], 1);

  const paths = topSkills.map((skillName, si) => {
    const points = data.map((point, pi) => {
      const freq = point.skills.find((s) => s.name === skillName)?.frequency ?? 0;
      const x = padX + (pi / (data.length - 1)) * chartW;
      const y = padY + chartH - (freq / maxFreq) * chartH;
      return { x, y };
    });

    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    return { name: skillName, d, color: TREND_COLORS[si % TREND_COLORS.length] };
  });

  const dateLabels = data.map((point, i) => {
    const x = padX + (i / (data.length - 1)) * chartW;
    const date = new Date(point.analysisDate);
    return { x, label: `${date.getMonth() + 1}/${date.getDate()}` };
  });

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ maxHeight: "250px" }}
        role="img"
        aria-label="Skill frequency trends over time"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padY + chartH - pct * chartH;
          return (
            <g key={pct}>
              <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="currentColor" strokeOpacity={0.1} />
              <text x={padX - 8} y={y + 3} textAnchor="end" className="text-[10px] fill-muted-foreground">
                {Math.round(pct * maxFreq)}
              </text>
            </g>
          );
        })}

        {/* Date labels */}
        {dateLabels.map(({ x, label }) => (
          <text key={`${x}-${label}`} x={x} y={h - 2} textAnchor="middle" className="text-[10px] fill-muted-foreground">
            {label}
          </text>
        ))}

        {/* Lines */}
        {paths.map(({ name, d, color }) => (
          <path
            key={name}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Dots */}
        {paths.map(({ name, color }) =>
          data.map((point, pi) => {
            const freq = point.skills.find((s) => s.name === name)?.frequency ?? 0;
            if (freq === 0) return null;
            const cx = padX + (pi / (data.length - 1)) * chartW;
            const cy = padY + chartH - (freq / maxFreq) * chartH;
            return <circle key={`${name}-${point.analysisDate}`} cx={cx} cy={cy} r="3" fill={color} />;
          }),
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap justify-center">
        {paths.map(({ name, color }) => (
          <div key={name} className="flex items-center gap-1.5 text-xs">
            <div className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="text-muted-foreground">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
