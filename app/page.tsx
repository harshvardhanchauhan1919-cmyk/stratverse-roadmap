import type { ReactNode } from "react";
import { getRoadmap, type Project, type Roadmap } from "@/lib/linear";
import baselineData from "@/baseline.json";

// Render on every request so a refresh always reflects the latest Linear dates.
export const dynamic = "force-dynamic";

const BASE = baselineData as {
  frozenOn: string;
  projects: Record<string, { startDate: string; targetDate: string }>;
  milestones: Record<string, string>;
};

const LABEL_W = 300;
const ROW_H = 40;
const MS_DAY = 86400000;

function parse(d: string | null | undefined): Date | null {
  return d ? new Date(d + "T00:00:00") : null;
}
function fmt(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function sundayOnOrBefore(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
function norm(v: number | null | undefined): number {
  if (!v) return 0;
  const f = v > 1 ? v / 100 : v; // Linear returns 0..1; guard percentages too
  return Math.max(0, Math.min(1, f));
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}
// Translucent version of a colour WITHOUT using CSS `opacity`.
// `opacity` on a parent applies to its children too (it creates a group), so a
// full-strength progress fill inside a 0.28-opacity track ends up at 0.28 as
// well — i.e. invisible. Baking the alpha into the background colour instead
// keeps the child fill at full strength.
function tint(color: string, alpha: number): string {
  let hex = (color || "").trim();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color; // named/unknown colour: leave as-is
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Schedule health, expressed in DAYS OF SLACK so it shares a unit with the
// drift chip. Slack = days actually left, minus the days the remaining work
// would take at the planned rate. Algebraically identical to a progress-vs-
// elapsed-time gap, just multiplied by the window length.
//
// Deliberately independent of `drift`: drift only moves when someone edits a
// date in Linear, so on its own it reads "on plan" for a milestone due
// tomorrow at 0%.
//
// A grace period suppresses the chip early in a window. Work rarely burns
// linearly — it lands in a lump near the end — so without this every freshly
// started row would cry wolf on day one and the signal would be ignored.
const GRACE_FRACTION = 0.25; // judge nothing until a quarter of the window has gone
const GRACE_MIN_DAYS = 1;

interface Health {
  label: string;
  color: string;
  expected: number; // 0..1 — share of the window elapsed as of today
  title: string;
}
function healthOf(s: Date, e: Date, progress: number, today: Date): Health | null {
  const totalDays = daysBetween(s, e);
  const elapsedDays = daysBetween(s, today);
  const daysLeft = daysBetween(today, e);
  const donePct = Math.round(progress * 100);
  const expected =
    totalDays <= 0
      ? today.getTime() >= e.getTime()
        ? 1
        : 0
      : Math.max(0, Math.min(1, elapsedDays / totalDays));
  const expPct = Math.round(expected * 100);

  if (progress >= 1) return { label: "done", color: "#16a34a", expected, title: "Complete" };
  if (today.getTime() < s.getTime()) return null; // not started — nothing to judge
  if (today.getTime() > e.getTime())
    return {
      label: `overdue at ${donePct}%`,
      color: "#b91c1c",
      expected,
      title: `Past target date and only ${donePct}% complete`,
    };

  // Grace period.
  if (elapsedDays < GRACE_MIN_DAYS) return null;
  if (totalDays > 0 && elapsedDays / totalDays < GRACE_FRACTION) return null;

  const daysNeeded = (1 - progress) * totalDays;
  const slack = daysLeft - daysNeeded;
  const behindBy = Math.max(1, Math.round(-slack));
  const title =
    `${donePct}% complete vs ~${expPct}% expected by today · ` +
    `${daysLeft}d left, ~${daysNeeded.toFixed(1)}d of work remaining at the planned rate`;

  if (slack >= -0.5) return { label: "on track", color: "#16a34a", expected, title };
  // "At risk" band widens with the length of the window: a day of slip means
  // more on a 5-day milestone than on a 40-day project.
  const atRiskFloor = -Math.max(2, 0.15 * totalDays);
  if (slack > atRiskFloor) return { label: "at risk", color: "#d97706", expected, title };
  return { label: `behind ${behindBy}d`, color: "#dc2626", expected, title };
}

// ---------------------------------------------------------------------------
// Row models. Built before render so the legend can ask whether any row
// actually produces a drift or health chip, and omit keys for signals that
// aren't on screen.
// ---------------------------------------------------------------------------
interface RowModel {
  id: string;
  label: string;
  color: string;
  planned: { s: Date; e: Date } | null;
  current: { s: Date; e: Date };
  progress: number;
  drift: number;
}

function projectRow(p: Project): RowModel {
  const b = BASE.projects[p.id];
  const curS = parse(p.startDate) || parse(p.targetDate)!;
  const curE = parse(p.targetDate) || parse(p.startDate)!;
  const baseS = b ? parse(b.startDate) : null;
  const baseE = b ? parse(b.targetDate) : null;
  return {
    id: p.id,
    label: p.name,
    color: p.color,
    planned: baseS && baseE ? { s: baseS, e: baseE } : null,
    current: { s: curS, e: curE },
    progress: norm(p.progress),
    drift: baseE && curE ? daysBetween(baseE, curE) : 0,
  };
}

function milestoneRows(p: Project): RowModel[] {
  const out: RowModel[] = [];
  p.milestones.forEach((m, i) => {
    const curE = parse(m.targetDate);
    if (!curE) return;
    const curS =
      i === 0 ? parse(p.startDate) || curE : parse(p.milestones[i - 1].targetDate) || curE;
    const baseE = parse(BASE.milestones[m.id]);
    const baseS =
      i === 0
        ? parse(BASE.projects[p.id]?.startDate)
        : parse(BASE.milestones[p.milestones[i - 1].id]);
    out.push({
      id: m.id,
      label: m.name,
      color: p.color,
      planned: baseS && baseE ? { s: baseS, e: baseE } : null,
      current: { s: curS, e: curE },
      progress: norm(m.progress),
      drift: baseE ? daysBetween(baseE, curE) : 0,
    });
  });
  return out;
}

export default async function Page() {
  let data: Roadmap | null = null;
  let error: string | null = null;
  try {
    data = await getRoadmap();
  } catch (e: any) {
    error = e?.message || "Failed to load roadmap.";
  }

  if (error || !data) {
    return (
      <main style={{ maxWidth: 900, margin: "48px auto", padding: 24 }}>
        <h1 style={{ color: "#1F3864" }}>Stratverse — Build Roadmap</h1>
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 18,
            borderRadius: 10,
          }}
        >
          <strong>Couldn&apos;t load data from Linear.</strong>
          <div style={{ marginTop: 8, fontSize: 13 }}>{error}</div>
        </div>
      </main>
    );
  }

  const projects = data.projects;

  // Date range across BOTH baseline and live dates.
  const times: number[] = [];
  for (const p of projects) {
    [parse(p.startDate), parse(p.targetDate)].forEach((d) => d && times.push(d.getTime()));
    const b = BASE.projects[p.id];
    if (b) {
      const bs = parse(b.startDate);
      const bt = parse(b.targetDate);
      if (bs) times.push(bs.getTime());
      if (bt) times.push(bt.getTime());
    }
    for (const m of p.milestones) {
      const md = parse(m.targetDate);
      if (md) times.push(md.getTime());
      const bm = parse(BASE.milestones[m.id]);
      if (bm) times.push(bm.getTime());
    }
  }
  const minRaw = new Date(Math.min(...times));
  const maxRaw = new Date(Math.max(...times));
  const start = sundayOnOrBefore(minRaw);
  const end = new Date(maxRaw);
  end.setDate(end.getDate() + (6 - end.getDay()) + 1);
  const span = end.getTime() - start.getTime();
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start.getTime()) / span) * 100));

  const weeks: Date[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPct = pct(today.getTime());

  const masterRows = projects.map(projectRow);
  const perProject = projects.map((p) => ({ project: p, rows: milestoneRows(p) }));
  const allRows = [...masterRows, ...perProject.flatMap((x) => x.rows)];
  // Only key a signal in the legend if some row on screen actually shows it.
  const anyDrift = allRows.some((r) => r.drift !== 0);
  const anyHealth = allRows.some(
    (r) => healthOf(r.current.s, r.current.e, r.progress, today) !== null
  );

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h1 style={{ color: "#1F3864", margin: 0, fontSize: 26 }}>
          Stratverse Portals — Build Roadmap
        </h1>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Live from Linear · refreshes on load · {new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#b91c1c", fontWeight: 700, margin: "6px 0 12px" }}>
        Overall finish target: {fmt(maxRaw)} 2026
      </div>

      <Legend baselineDate={BASE.frozenOn} showDrift={anyDrift} showHealth={anyHealth} />

      <Section title="Master Roadmap">
        <Grid weeks={weeks} pct={pct} todayPct={todayPct}>
          {masterRows.map((r) => (
            <TrackRow
              key={r.id}
              label={r.label}
              color={r.color}
              planned={r.planned}
              current={r.current}
              progress={r.progress}
              drift={r.drift}
              pct={pct}
              todayPct={todayPct}
              today={today}
            />
          ))}
        </Grid>
      </Section>

      {perProject.map(({ project: p, rows }) => (
        <Section key={p.id} title={p.name} color={p.color}>
          <Grid weeks={weeks} pct={pct} todayPct={todayPct}>
            {rows.length === 0 && (
              <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>
                No milestones with dates.
              </div>
            )}
            {rows.map((r) => (
              <TrackRow
                key={r.id}
                label={r.label}
                color={r.color}
                planned={r.planned}
                current={r.current}
                progress={r.progress}
                drift={r.drift}
                pct={pct}
                todayPct={todayPct}
                today={today}
              />
            ))}
          </Grid>
        </Section>
      ))}

      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 26 }}>
        Planned = frozen baseline ({fmt(parse(BASE.frozenOn)!)} 2026). Current = live Linear dates.
        Fill = % complete (from Linear). The drift chip (+3d late) compares dates against the
        baseline and only moves when someone edits a date in Linear. The health chip is days of
        pace — days left minus the days the remaining work needs at the planned rate — and is
        suppressed for the first quarter of a row&apos;s window. Edit dates or progress in Linear
        and refresh to update.
      </div>
    </main>
  );
}

function DriftChip({ drift }: { drift: number }) {
  if (!drift) return <span style={{ color: "#16a34a", fontWeight: 600 }}>on plan</span>;
  const late = drift > 0;
  return (
    <span style={{ color: late ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
      {late ? `+${drift}d late` : `${Math.abs(drift)}d early`}
    </span>
  );
}

function TrackRow({
  label,
  color,
  planned,
  current,
  progress,
  drift,
  pct,
  todayPct,
  today,
}: {
  label: string;
  color: string;
  planned: { s: Date; e: Date } | null;
  current: { s: Date; e: Date };
  progress: number;
  drift: number;
  pct: (t: number) => number;
  todayPct: number;
  today: Date;
}) {
  const cs = pct(current.s.getTime());
  const cw = Math.max(1.2, pct(current.e.getTime()) - cs);
  const pctDone = Math.round(progress * 100);
  const totalDays = daysBetween(current.s, current.e);
  const health = healthOf(current.s, current.e, progress, today);
  return (
    <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid #f1f2f4" }}>
      <div style={{ width: LABEL_W, flexShrink: 0, padding: "5px 12px 5px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{label}</div>
        <div
          style={{
            fontSize: 10,
            color: "#9ca3af",
            marginTop: 1,
            display: "flex",
            gap: 7,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>
            {fmt(current.s)} – {fmt(current.e)}
          </span>
          <span style={{ color: "#374151" }}>{totalDays}d</span>
          <span style={{ color: "#111827", fontWeight: 600 }}>{pctDone}%</span>
          <DriftChip drift={drift} />
          {health && (
            <span style={{ color: health.color, fontWeight: 600 }} title={health.title}>
              {health.label}
            </span>
          )}
        </div>
      </div>
      <div style={{ position: "relative", flex: 1, height: ROW_H }}>
        {/* Today line */}
        <div
          title="Today"
          style={{
            position: "absolute",
            left: `${todayPct}%`,
            top: 0,
            height: ROW_H,
            width: 2,
            background: "#ef4444",
            opacity: 0.6,
            zIndex: 3,
          }}
        />
        {/* Planned (baseline) — thin grey bar */}
        {planned && (
          <div
            title={`Planned: ${fmt(planned.s)} – ${fmt(planned.e)}`}
            style={{
              position: "absolute",
              left: `${pct(planned.s.getTime())}%`,
              width: `${Math.max(1.2, pct(planned.e.getTime()) - pct(planned.s.getTime()))}%`,
              top: 6,
              height: 6,
              background: "rgba(107, 114, 128, 0.85)",
              borderRadius: 3,
            }}
          />
        )}
        {/* Current (live) — colored bar with progress fill */}
        <div
          title={`Current: ${fmt(current.s)} – ${fmt(current.e)} · ${pctDone}% done`}
          style={{
            position: "absolute",
            left: `${cs}%`,
            width: `${cw}%`,
            top: 15,
            height: 16,
            background: tint(color, 0.28),
            borderRadius: 5,
            overflow: "hidden",
          }}
        >
          {pctDone > 0 && (
            <div
              title={`${pctDone}% complete`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${pctDone}%`,
                minWidth: 2,
                background: color,
              }}
            />
          )}
          {health && health.expected > 0 && health.expected < 1 && (
            <div
              title={`The fill should reach here today (~${Math.round(
                health.expected * 100
              )}% complete at the planned rate)`}
              style={{
                position: "absolute",
                left: `${health.expected * 100}%`,
                top: 0,
                height: "100%",
                width: 2,
                background: "rgba(17, 24, 39, 0.55)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({
  baselineDate,
  showDrift,
  showHealth,
}: {
  baselineDate: string;
  showDrift: boolean;
  showHealth: boolean;
}) {
  const item = (node: ReactNode, text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {node}
      <span>{text}</span>
    </span>
  );
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        fontSize: 11,
        color: "#4b5563",
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "8px 12px",
        margin: "0 0 8px",
      }}
    >
      {item(
        <span style={{ width: 22, height: 6, background: "rgba(107, 114, 128, 0.85)", borderRadius: 3 }} />,
        `Planned (baseline, ${baselineDate})`
      )}
      {item(
        <span style={{ width: 22, height: 12, background: tint("#1F3864", 0.28), borderRadius: 3 }} />,
        "Current (live from Linear)"
      )}
      {item(
        <span style={{ width: 22, height: 12, background: "#1F3864", borderRadius: 3 }} />,
        "% complete"
      )}
      {item(<span style={{ width: 2, height: 14, background: "#ef4444" }} />, "Today")}
      {showDrift &&
        item(
          <span style={{ color: "#dc2626", fontWeight: 700 }}>e.g. +3d late</span>,
          "days behind baseline"
        )}
      {showHealth && (
        <>
          {item(
            <span style={{ width: 2, height: 12, background: "rgba(17, 24, 39, 0.55)" }} />,
            "Pace marker — where the fill should be today"
          )}
          <span
            style={{ fontWeight: 600 }}
            title="Days ahead of / behind the pace needed to finish on time"
          >
            <span style={{ color: "#16a34a" }}>on track</span>
            <span style={{ color: "#9ca3af" }}> / </span>
            <span style={{ color: "#d97706" }}>at risk</span>
            <span style={{ color: "#9ca3af" }}> / </span>
            <span style={{ color: "#dc2626" }}>behind</span>
          </span>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  color,
  children,
}: {
  title: string;
  color?: string;
  children: ReactNode;
}) {
  const c = color || "#1F3864";
  return (
    <section style={{ margin: "20px 0" }}>
      <h2
        style={{
          fontSize: 15,
          margin: "0 0 8px",
          color: c,
          borderLeft: `4px solid ${c}`,
          paddingLeft: 8,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "10px 14px",
          overflowX: "auto",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Grid({
  weeks,
  pct,
  todayPct,
  children,
}: {
  weeks: Date[];
  pct: (t: number) => number;
  todayPct: number;
  children: ReactNode;
}) {
  return (
    <div style={{ minWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 4 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div
          style={{
            position: "relative",
            flex: 1,
            height: 26,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          {weeks.map((w, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${pct(w.getTime())}%`,
                bottom: 2,
                fontSize: 10,
                color: "#6b7280",
                borderLeft: "1px solid #eef0f3",
                paddingLeft: 3,
                height: 18,
                whiteSpace: "nowrap",
              }}
            >
              {w.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </div>
          ))}
          <div
            title="Today"
            style={{
              position: "absolute",
              left: `${todayPct}%`,
              bottom: 0,
              height: 22,
              width: 2,
              background: "#ef4444",
            }}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
