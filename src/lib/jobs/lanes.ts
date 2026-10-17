import type { AnalysisMode, JobType } from "./queue";

/** Eigen capaciteit voor detectie, snelle beoordeling en push; verrijking mag wachten. */
export function jobLanes(concurrency: number): Array<{
  name: string; types: JobType[]; concurrency: number; analysisMode?: AnalysisMode;
}> {
  return [
    { name: "detectie", types: ["CHECK_PROFILE"], concurrency: 1 },
    { name: "details", types: ["FETCH_DETAIL", "REFRESH_FACETS"], concurrency: 1 },
    { name: "snel", types: ["ANALYZE_AD"], concurrency: 1, analysisMode: "quick" },
    { name: "analyse", types: ["ANALYZE_AD", "CLEANUP"], concurrency: Math.max(1, concurrency - 1), analysisMode: "full" },
    { name: "push", types: ["NOTIFY"], concurrency: 1 },
  ];
}
