import type { ReactNode } from "react";
import { getRoadmap, type Project, type Roadmap } from "@/lib/linear";

// Re-render (revalidate) at most every 5 minutes; edits in Linear show up within that window.
export const revalidate = 300;

const LABEL_W = 240;

function parse(d: string | null): Date | null {
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
          <div style={{ marginTop: 10, fontSize: 13, color: "#7f1d1d" }}>
            Make sure <code>LINEAR_API_KEY</code> is set in Vercel &rarr; Project &rarr; Settings
            &rarr; Environment Variables, then redeploy.
          </div>
        </div>
      </main>
    );
  }

  const projects = data.projects;

  // Compute the overall date range across projects + milestones.
  const times: number[] = [];
  for (const p of projects) {
    const s = parse(p.startDate);
    const t = parse(p.targetDate);
    if (s) times.push(s.getTime());
    if (t) times.push(t.getTime());
    for (const m of p.milestones) {
      const md = parse(m.targetDate);
      if (md) times.push(md.getTime());
    }
  }
  const minRaw = new Date(Math.min(...times));
  const maxRaw = new Date(Math.max(...times));
  const start = sundayOnOrBefore(minRaw);
  const end = new Date(maxRaw);
  end.setDate(end.getDate() + (6 - end.getDay()) + 1); // pad to end of the last week
  const span = end.getTime() - start.getTime();
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start.getTime()) / span) * 100));

  const weeks: Date[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));

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
          Live from Linear · auto-refreshes ~5 min · loaded{" "}
          {new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#b91c1c", fontWeight: 700, margin: "6px 0 22px" }}>
        Overall finish target: {fmt(maxRaw)} 2026
      </div>

      <Section title="Master Roadmap">
        <Grid weeks={weeks} pct={pct}>
          {projects.map((p) => {
            const s = parse(p.startDate) || parse(p.targetDate)!;
            const t = parse(p.targetDate) || parse(p.startDate)!;
            const left = pct(s.getTime());
            const width = Math.max(1.5, pct(t.getTime()) - left);
            return (
              <Row key={p.id} label={p.name} sub={`${fmt(s)} – ${fmt(t)}`}>
                <div
                  title={`${p.name}: ${fmt(s)} – ${fmt(t)}`}
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: 8,
                    height: 18,
                    background: p.color,
                    borderRadius: 5,
                    opacity: 0.92,
                  }}
                />
                {p.milestones.map((m) => {
                  const md = parse(m.targetDate);
                  if (!md) return null;
                  return (
                    <div
                      key={m.id}
                      title={`${m.name} · ${fmt(md)}`}
                      style={{
                        position: "absolute",
                        left: `${pct(md.getTime())}%`,
                        top: 10,
                        transform: "translateX(-50%)",
                        width: 9,
                        height: 9,
                        background: "#fff",
                        border: `2px solid ${p.color}`,
                        borderRadius: "50%",
                      }}
                    />
                  );
                })}
              </Row>
            );
          })}
        </Grid>
      </Section>

      {projects.map((p) => (
        <Section key={p.id} title={p.name} color={p.color}>
          <Grid weeks={weeks} pct={pct}>
            {p.milestones.length === 0 && (
              <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>
                No milestones with dates.
              </div>
            )}
            {p.milestones.map((m, i) => {
              const md = parse(m.targetDate);
              if (!md) return null;
              const prev =
                i === 0
                  ? parse(p.startDate) || md
                  : parse(p.milestones[i - 1].targetDate) || md;
              const left = pct(prev.getTime());
              const width = Math.max(1.5, pct(md.getTime()) - left);
              return (
                <Row key={m.id} label={m.name} sub={fmt(md)}>
                  <div
                    title={`${m.name} → ${fmt(md)}`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${width}%`,
                      top: 8,
                      height: 18,
                      background: p.color,
                      borderRadius: 5,
                      opacity: i % 2 === 0 ? 0.9 : 0.6,
                    }}
                  />
                </Row>
              );
            })}
          </Grid>
        </Section>
      ))}

      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 26 }}>
        Dates are read live from Linear project &amp; milestone targets. Change a date in Linear and
        this page reflects it within ~5 minutes (or on the next deploy).
      </div>
    </main>
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
    <section style={{ margin: "22px 0" }}>
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
  children,
}: {
  weeks: Date[];
  pct: (t: number) => number;
  children: ReactNode;
}) {
  return (
    <div style={{ minWidth: 780 }}>
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 4 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div
          style={{
            position: "relative",
            flex: 1,
            height: 24,
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
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid #f1f2f4" }}>
      <div style={{ width: LABEL_W, flexShrink: 0, padding: "6px 12px 6px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ position: "relative", flex: 1, height: 34 }}>{children}</div>
    </div>
  );
}
