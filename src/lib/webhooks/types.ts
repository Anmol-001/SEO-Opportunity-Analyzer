export const completionEventType = "seo_assessment.completed" as const;

export interface CompletionWebhookPayload {
  assessmentId: string;
  businessName: string;
  completedAt: string;
  event: typeof completionEventType;
  opportunityScore: number;
  status: "complete";
  website: string;
}

export interface WebhookAttemptResult {
  error: string | null;
  ok: boolean;
  responseStatus: number | null;
  retryable: boolean;
}

export type WebhookDeliveryOutcome =
  | {
      attemptCount: number;
      eventId: string;
      responseStatus: number;
      status: "delivered";
    }
  | {
      attemptCount: number;
      eventId: string;
      responseStatus: number | null;
      status: "failed";
    }
  | {
      attemptCount: 0;
      eventId: string;
      responseStatus: null;
      status: "skipped";
    };
