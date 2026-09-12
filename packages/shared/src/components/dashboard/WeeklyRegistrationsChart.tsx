import { useState, useMemo } from "react";
import { TrendingUp, Sparkles, Calendar, Award } from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { LoadingSpinner } from "@milipay/shared/components/ui/LoadingSpinner";

interface WeeklyRegistrationsChartProps {
  data?: number[];
  isLoading?: boolean;
}

export function WeeklyRegistrationsChart({
  data = [0, 0, 0, 0, 0, 0, 0],
  isLoading = false,
}: WeeklyRegistrationsChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Normalize data array to exactly 7 items
  const series = useMemo(() => {
    if (!data || data.length === 0) return [0, 0, 0, 0, 0, 0, 0];
    if (data.length === 7) return data;
    const slice = [...data].slice(-7);
    while (slice.length < 7) slice.unshift(0);
    return slice;
  }, [data]);

  const totalWeekly = useMemo(() => series.reduce((acc, v) => acc + v, 0), [series]);
  const maxVal = useMemo(() => Math.max(...series, 1), [series]);
  const peakVal = useMemo(() => Math.max(...series), [series]);
  const dailyAvg = useMemo(() => (totalWeekly / 7).toFixed(1), [totalWeekly]);

  // Compute momentum (first 3 days vs last 3 days)
  const momentum = useMemo(() => {
    const early = series[0] + series[1] + series[2];
    const recent = series[4] + series[5] + series[6];
    if (early === 0 && recent === 0) return { pct: 0, positive: true };
    if (early === 0) return { pct: 100, positive: true };
    const diff = ((recent - early) / early) * 100;
    return { pct: Math.abs(Math.round(diff)), positive: diff >= 0 };
  }, [series]);

  // Days metadata
  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        index: i,
        isToday: i === 6,
        weekdayShort: i === 6 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }),
        weekdayFull: d.toLocaleDateString("en-US", { weekday: "long" }),
        dateFormatted: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: series[i],
        percentage: maxVal > 0 ? (series[i] / maxVal) * 100 : 0,
        shareOfWeek: totalWeekly > 0 ? Math.round((series[i] / totalWeekly) * 100) : 0,
        isPeak: series[i] > 0 && series[i] === peakVal,
      };
    });
  }, [series, maxVal, peakVal, totalWeekly]);

  // SVG Smooth Spline coordinates (viewBox 0 0 700 160)
  const svgMetrics = useMemo(() => {
    const width = 700;
    const height = 160;
    const paddingY = 24;
    const availableHeight = height - paddingY * 2;
    const stepX = width / 7;

    const points = series.map((val, i) => {
      const x = stepX * i + stepX / 2;
      const normalized = maxVal > 0 ? val / maxVal : 0;
      const y = height - paddingY - normalized * availableHeight;
      return { x, y, val };
    });

    // Generate smooth cubic bezier SVG path
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;

      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { points, pathD, areaD, height };
  }, [series, maxVal]);

  return (
    <Card raised className="p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden group/card border-ledger-line">
      {/* Background ambient corner glow */}
      <div 
        className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full bg-signal/10 blur-3xl transition-opacity duration-700 group-hover/card:opacity-100 opacity-60" 
        aria-hidden="true" 
      />

      {/* Header section with telemetry summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/[0.05] relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-signal/15 text-signal-bright border border-signal/30 uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-signal" /> Biometric Velocity
            </span>
            {momentum.pct > 0 && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium font-data ${momentum.positive ? 'text-status-ok' : 'text-ink-muted'}`}>
                <TrendingUp className={`w-3 h-3 ${!momentum.positive && 'rotate-180'}`} />
                {momentum.positive ? `+${momentum.pct}%` : `-${momentum.pct}%`} 7d trend
              </span>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-display font-semibold text-ink mt-1">
            Registrations this week
          </h2>
        </div>

        {/* Aggregate KPI chips */}
        <div className="flex items-center gap-2 sm:gap-3 self-start sm:self-auto">
          <div className="flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-xl sm:text-2xl font-bold font-data text-white tracking-tight">
              {new Intl.NumberFormat().format(totalWeekly)}
            </span>
            <span className="text-[11px] font-medium text-ink-muted">enrolled</span>
          </div>

          <div className="flex flex-col text-right px-2.5 py-1 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[10px] font-medium text-ink-faint uppercase tracking-wider">Daily Avg</span>
            <span className="text-xs font-mono font-semibold text-signal-bright">{dailyAvg} / day</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative pt-6 pb-2 min-h-[220px] flex flex-col justify-end">
        {isLoading ? (
          <div className="h-44 flex flex-col items-center justify-center gap-2.5">
            <LoadingSpinner size="lg" />
            <span className="text-xs text-ink-muted font-medium">Calculating biometric enrollment telemetry...</span>
          </div>
        ) : (
          <>
            {/* Horizontal guideline scale grid */}
            <div className="absolute inset-x-0 top-6 bottom-10 flex flex-col justify-between pointer-events-none z-0">
              {[1, 0.66, 0.33, 0].map((ratio) => (
                <div key={ratio} className="relative w-full flex items-center">
                  <div className="w-full border-b border-dashed border-white/[0.05]" />
                  <span className="absolute right-0 -top-2.5 text-[9px] font-mono text-ink-faint bg-ledger-raised/80 px-1 rounded">
                    {Math.round(maxVal * ratio)}
                  </span>
                </div>
              ))}
            </div>

            {/* SVG Spline overlay behind columns */}
            <div className="absolute inset-x-0 top-6 bottom-8 pointer-events-none z-0 overflow-hidden">
              <svg 
                viewBox="0 0 700 160" 
                preserveAspectRatio="none" 
                className="w-full h-full"
              >
                <defs>
                  <linearGradient id="velocityAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--color-signal))" stopOpacity="0.28" />
                    <stop offset="60%" stopColor="rgb(var(--color-signal))" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="rgb(var(--color-signal))" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="velocityLineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgb(var(--color-signal))" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="rgb(var(--color-signal))" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#00FFB2" stopOpacity="1" />
                  </linearGradient>
                </defs>

                {/* Shimmering area fill */}
                <path d={svgMetrics.areaD} fill="url(#velocityAreaGradient)" />

                {/* Spline curve stroke */}
                <path 
                  d={svgMetrics.pathD} 
                  fill="none" 
                  stroke="url(#velocityLineGradient)" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  className="filter drop-shadow-[0_2px_8px_rgba(var(--color-signal),0.4)]"
                />

                {/* Glowing peak markers on spline */}
                {svgMetrics.points.map((pt, idx) => {
                  const isHovered = hoveredIndex === idx;
                  const isToday = idx === 6;
                  if (!isHovered && !isToday && pt.val === 0) return null;

                  return (
                    <g key={idx}>
                      <circle 
                        cx={pt.x} 
                        cy={pt.y} 
                        r={isHovered ? "6" : isToday ? "4" : "3"} 
                        fill="rgb(var(--color-signal))" 
                        className="transition-all duration-200"
                      />
                      {(isHovered || isToday) && (
                        <circle 
                          cx={pt.x} 
                          cy={pt.y} 
                          r={isHovered ? "11" : "8"} 
                          fill="rgb(var(--color-signal))" 
                          opacity="0.3" 
                          className="animate-pulse"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Interactive Column Pillars */}
            <div className="relative z-10 flex items-stretch justify-between gap-2 sm:gap-4 h-40">
              {days.map((day) => {
                const isHovered = hoveredIndex === day.index;
                const minHeightPct = day.value > 0 ? Math.max(day.percentage, 12) : 4;

                return (
                  <div
                    key={day.index}
                    className="flex-1 flex flex-col items-center justify-end relative group cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(day.index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    {/* Floating Glassmorphic Tooltip */}
                    <div
                      className={`
                        absolute -top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none
                        transition-all duration-200 ease-out whitespace-nowrap
                        ${isHovered ? "opacity-100 scale-100 -translate-y-2" : "opacity-0 scale-95 pointer-events-none"}
                      `}
                    >
                      <div className="px-3 py-2 rounded-xl bg-ledger/95 backdrop-blur-xl border border-signal/30 shadow-[0_10px_25px_rgba(0,0,0,0.6)] text-center flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                          <span>{day.weekdayFull}</span>
                          <span>•</span>
                          <span>{day.dateFormatted}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold font-data text-signal-bright">
                            {day.value} {day.value === 1 ? "Customer" : "Customers"}
                          </span>
                          {day.isPeak && (
                            <span className="inline-flex items-center text-[9px] font-bold text-status-ok bg-status-ok/15 px-1 py-0.2 rounded">
                              Peak
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-ink-faint">
                          {day.shareOfWeek}% of week total
                        </span>
                      </div>
                      {/* Tooltip caret */}
                      <div className="w-2 h-2 bg-ledger border-r border-b border-signal/30 rotate-45 mx-auto -mt-1" />
                    </div>

                    {/* Outer Pill Track */}
                    <div className={`
                      w-full max-w-[36px] sm:max-w-[44px] flex-1 relative rounded-xl sm:rounded-2xl overflow-hidden
                      transition-all duration-300 flex flex-col justify-end p-1
                      ${isHovered 
                        ? "bg-white/[0.07] border border-signal/40 shadow-[0_0_15px_rgba(var(--color-signal),0.2)]" 
                        : "bg-white/[0.02] border border-white/[0.04] hover:border-white/10"
                      }
                    `}>
                      {/* Inner Filled Bar Column */}
                      <div
                        className={`
                          w-full rounded-lg sm:rounded-xl transition-all duration-500 ease-out relative
                          ${day.value > 0 
                            ? isHovered 
                              ? "bg-gradient-to-t from-signal/70 via-signal to-signal-bright shadow-[0_0_20px_rgba(var(--color-signal),0.7)]" 
                              : "bg-gradient-to-t from-signal/40 via-signal to-signal-bright/90"
                            : "bg-white/[0.06]"
                          }
                        `}
                        style={{ height: `${minHeightPct}%` }}
                      >
                        {/* Bright neon cap highlight on the bar */}
                        {day.value > 0 && (
                          <div className="absolute top-0 inset-x-0 h-1 bg-white/70 rounded-t-md" />
                        )}

                        {/* Direct count label on hover */}
                        {day.value > 0 && (
                          <span className={`
                            absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold
                            transition-opacity duration-200
                            ${isHovered ? "opacity-100 text-signal-bright" : "opacity-0"}
                          `}>
                            {day.value}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* X-Axis Label */}
                    <div className="mt-2.5 flex flex-col items-center gap-1">
                      <span className={`
                        text-[10px] sm:text-xs font-semibold tracking-wider transition-colors
                        ${day.isToday 
                          ? "text-signal font-bold" 
                          : isHovered 
                          ? "text-white" 
                          : "text-ink-muted"
                        }
                      `}>
                        {day.weekdayShort}
                      </span>
                      {day.isToday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-signal shadow-[0_0_6px_rgba(var(--color-signal),1)]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer Insight Banner */}
      <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-signal" />
          <span>Trailing 7-Day Window</span>
        </div>
        {peakVal > 0 && (
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Award className="w-3.5 h-3.5 text-status-warning" />
            <span className="text-ink-faint">Peak:</span>
            <span className="text-white font-semibold">{peakVal} in 24h</span>
          </div>
        )}
      </div>
    </Card>
  );
}
