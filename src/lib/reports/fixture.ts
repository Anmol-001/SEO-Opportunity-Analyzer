import type { OpportunityReport } from "./types";

export const demoReport: OpportunityReport = {
  executiveSummary: {
    overallAssessment:
      "Northstar Dental has a credible service foundation, but its local search coverage is narrower than the pages repeatedly winning across the sampled results.",
    businessImplication:
      "The strongest near-term opportunity is to deepen the existing dental implant page and add location-specific evidence before expanding into broader informational content.",
  },
  websiteFindings: [
    {
      id: "F001",
      title: "Primary service page lacks local depth",
      severity: "high",
      evidence:
        "The analyzed implant page mentions Noida once and contains 430 words; four recurring direct competitors use dedicated local service pages with richer treatment detail.",
      impact:
        "The page provides fewer relevance signals for commercial service + location searches.",
    },
    {
      id: "F002",
      title: "FAQ coverage is missing",
      severity: "medium",
      evidence:
        "No FAQ section or FAQ structured data was found on the analyzed service page; three of five competitor pages answer cost and recovery questions.",
      impact:
        "The page does not address common decision-stage questions visible in the search results.",
    },
  ],
  serpFindings: [
    {
      id: "F003",
      keyword: "dental implants noida",
      intent: "Local commercial",
      serpCharacteristics: ["Local pack", "People also ask", "Ads"],
      rankingPosition: 8,
      evidence:
        "The submitted domain appears at organic position 8. The result set also contains a local pack and cost-related questions.",
    },
    {
      id: "F004",
      keyword: "dental implant cost noida",
      intent: "Pricing commercial",
      serpCharacteristics: ["People also ask", "Featured snippet"],
      rankingPosition: null,
      evidence:
        "The submitted domain was not present in the collected results; three direct competitors rank with dedicated cost sections.",
    },
  ],
  competitorFindings: [
    {
      id: "F005",
      domain: "smilecraft.example",
      type: "Direct competitor",
      positioning: "Implant-led clinic with strong local proof",
      strengths: ["Dedicated Noida page", "Cost table", "Clinician credentials"],
      gap: "Northstar does not consolidate these decision signals on one page.",
      evidence: "Appeared in four of five commercial query result sets.",
    },
    {
      id: "F006",
      domain: "carepoint.example",
      type: "Direct competitor",
      positioning: "Treatment education and recovery guidance",
      strengths: ["Detailed procedure steps", "FAQ schema", "Recovery timeline"],
      gap: "Northstar's page has limited post-treatment guidance.",
      evidence: "Appeared in three result sets and ranked twice in the top five.",
    },
  ],
  keywordOpportunities: [
    {
      cpc: 38.5,
      keyword: "dental implants noida",
      monthlyTrend: [
        { month: "2026-05", volume: 320 },
        { month: "2026-06", volume: 350 },
        { month: "2026-07", volume: 390 },
      ],
      searchVolume: 390,
      paidCompetitionSignal: 0.74,
      rankingPosition: 8,
      opportunityType: "existing",
      priority: "high",
      rationale: "Existing first-page visibility makes page improvement the fastest path.",
    },
    {
      cpc: 31.2,
      keyword: "dental implant cost noida",
      monthlyTrend: [
        { month: "2026-05", volume: 170 },
        { month: "2026-06", volume: 190 },
        { month: "2026-07", volume: 210 },
      ],
      searchVolume: 210,
      paidCompetitionSignal: 0.66,
      rankingPosition: null,
      opportunityType: "potential",
      priority: "high",
      rationale: "Strong decision-stage intent, repeated competitor coverage, and no current visibility.",
    },
    {
      cpc: null,
      keyword: "dental implant recovery",
      monthlyTrend: null,
      searchVolume: null,
      paidCompetitionSignal: null,
      rankingPosition: null,
      opportunityType: "potential",
      priority: "medium",
      rationale: "SERP questions show informational demand; connected volume data was unavailable.",
    },
  ],
  recommendations: [
    {
      id: "R001",
      action:
        "Expand the implant page into a complete Noida service page with treatment steps, local proof, clinician credentials, and a clear consultation CTA.",
      priority: "high",
      impact: "Strengthens the page already ranking on page one for the core query.",
      effort: "medium",
      evidenceRefs: ["F001", "F003", "F005"],
    },
    {
      id: "R002",
      action:
        "Add a transparent cost section and answer the pricing questions surfaced across competitor pages and People Also Ask.",
      priority: "high",
      impact: "Creates relevant coverage for a high-intent query where the site is not visible.",
      effort: "low",
      evidenceRefs: ["F002", "F004", "F005"],
    },
    {
      id: "R003",
      action:
        "Publish an evidence-reviewed recovery guide and link it to the primary implant service page.",
      priority: "medium",
      impact: "Builds topical depth around a question competitors currently answer better.",
      effort: "medium",
      evidenceRefs: ["F002", "F006"],
    },
  ],
  nextSteps: {
    days30: [
      "Rewrite the primary implant page around service + location intent.",
      "Add pricing and recovery FAQs with appropriate structured data.",
    ],
    days60: [
      "Publish the recovery guide and build contextual internal links.",
      "Strengthen local trust proof with credentials and original patient evidence.",
    ],
    days90: [
      "Recheck the five-query search sample and compare ranking movement.",
      "Use the results to choose the next service + location expansion page.",
    ],
  },
  dataAvailability: {
    website: true,
    serp: true,
    keywordMetrics: true,
    aiSynthesis: true,
    notes: [
      "This example uses representative fixture data for the initial vertical slice.",
      "Paid competition is an advertising signal, not an SEO difficulty score.",
    ],
  },
};

export const demoAssessment = {
  id: "demo",
  businessName: "Northstar Dental",
  websiteUrl: "https://northstardental.example",
  industry: "Dental care",
  location: "Noida",
  primaryService: "Dental implants",
  status: "complete" as const,
  opportunityScore: 72,
  createdAt: new Date("2026-08-29T09:30:00.000Z"),
  completedAt: new Date("2026-08-29T09:34:00.000Z"),
};
