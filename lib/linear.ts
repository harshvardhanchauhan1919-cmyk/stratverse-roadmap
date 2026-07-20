// Server-only Linear data access. The API key lives in an environment variable
// and is NEVER sent to the browser — both the page and the /api/roadmap route
// call this on the server.

export interface Milestone {
  id: string;
  name: string;
  targetDate: string | null;
  sortOrder: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  startDate: string | null;
  targetDate: string | null;
  milestones: Milestone[];
}

export interface Roadmap {
  team: string;
  projects: Project[];
}

const TEAM_ID = process.env.LINEAR_TEAM_ID || "1760cbd0-fb5e-4347-b7fb-ebff5fe2e64e";

const QUERY = `
query Roadmap($teamId: String!) {
  team(id: $teamId) {
    name
    projects(first: 50) {
      nodes {
        id
        name
        color
        startDate
        targetDate
        projectMilestones(first: 20) {
          nodes { id name targetDate sortOrder }
        }
      }
    }
  }
}`;

export async function getRoadmap(): Promise<Roadmap> {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error(
      "LINEAR_API_KEY is not set. Add it in Vercel -> Project -> Settings -> Environment Variables (or .env.local for local dev)."
    );
  }

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: key, // personal API keys are passed directly, no "Bearer"
    },
    body: JSON.stringify({ query: QUERY, variables: { teamId: TEAM_ID } }),
    // Cache the upstream response for 5 minutes so heavy traffic does not hammer Linear.
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Linear API returned ${res.status} ${res.statusText}. ${body.slice(0, 300)}`
    );
  }

  const json: any = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  const team = json.data?.team;
  const projects: Project[] = (team?.projects?.nodes || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    color: p.color || "#4472C4",
    startDate: p.startDate ?? null,
    targetDate: p.targetDate ?? null,
    milestones: (p.projectMilestones?.nodes || [])
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        targetDate: m.targetDate ?? null,
        sortOrder: m.sortOrder ?? 0,
      }))
      .sort((a: Milestone, b: Milestone) => a.sortOrder - b.sortOrder),
  }));

  // Only show projects that have at least one date set (i.e. the scheduled portal plan).
  const dated = projects.filter((p) => p.startDate || p.targetDate);
  dated.sort((a, b) =>
    (a.startDate || a.targetDate || "").localeCompare(b.startDate || b.targetDate || "")
  );

  return { team: team?.name || "Stratverse", projects: dated };
}
