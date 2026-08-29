export const pipelineStages = [
  {
    status: "pending",
    label: "Assessment received",
    description: "Your inputs have been validated and queued.",
  },
  {
    status: "scanning",
    label: "Website analyzed",
    description: "Reviewing key pages, structure, and topical coverage.",
  },
  {
    status: "researching",
    label: "Search landscape researched",
    description: "Collecting rankings and SERP characteristics.",
  },
  {
    status: "ranking",
    label: "Visibility checked",
    description: "Finding where your domain appears for each query.",
  },
  {
    status: "competitors",
    label: "Competitors compared",
    description: "Identifying recurring domains and content patterns.",
  },
  {
    status: "keywords",
    label: "Opportunities scored",
    description: "Calculating priorities from the collected evidence.",
  },
  {
    status: "generating",
    label: "Recommendations generated",
    description: "Synthesizing evidence into a focused action plan.",
  },
  {
    status: "complete",
    label: "Report ready",
    description: "Your SEO opportunity report is complete.",
  },
] as const;

export type PipelineStatus = (typeof pipelineStages)[number]["status"] | "failed";

export function stageIndex(status: PipelineStatus) {
  if (status === "failed") return -1;
  return pipelineStages.findIndex((stage) => stage.status === status);
}
