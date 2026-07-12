// Types for the Learn / Tour walkthrough. These mirror the backend RepoTour
// shape (app/schemas/api_models.py) so swapping the local mock for the real
// `POST /repositories/{id}/tour` endpoint is a drop-in change.

// "code" walkthrough = how the repo works; "debt" = the technical-debt tour.
export type TourKind = "code" | "debt";

export type ConceptKind =
  // shared
  | "overview"
  | "entrypoint"
  // code-walkthrough concepts
  | "core"
  | "module"
  | "data"
  | "api"
  | "utility"
  // technical-debt concepts
  | "hotspot"
  | "coupling"
  | "complexity"
  | "stable"
  | "tests";

export type MetricTone = "good" | "warn" | "bad" | "neutral";

export interface TourStopMetric {
  label: string;
  value: string;
  tone: MetricTone;
}

export interface TourStop {
  id: string;
  fileId: number | null;
  path: string | null;
  title: string;
  role: string; // "the what" — what this file does + how it connects
  concept: ConceptKind;
  conceptTitle: string;
  lesson: string; // "the lesson" — the debt concept this file illustrates
  metrics: TourStopMetric[];
  relatedFileIds: number[];
}

export interface RepoTour {
  repoId: number;
  kind: TourKind;
  generated: boolean; // true once AI-authored; false for the heuristic fallback
  model: string;
  summary: string;
  stops: TourStop[];
  debtOrder: string[]; // (debt kind only) stop ids, worst-risk first
}
