import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  runCompletionWebhookDelivery,
  type WebhookDeliveryDependencies,
  type WebhookEventStore,
} from "./delivery";
import { completionEventType, type CompletionWebhookPayload } from "./types";

function prismaWebhookStore(submissionId: string): WebhookEventStore {
  const db = getDb();
  return {
    async findDelivered(input) {
      return db.webhookEvent.findFirst({
        where: {
          submissionId: input.submissionId,
          eventType: input.eventType,
          status: "delivered",
        },
        orderBy: { createdAt: "desc" },
        select: {
          attemptCount: true,
          id: true,
          responseStatus: true,
        },
      });
    },
    async create(input) {
      return db.webhookEvent.create({
        data: {
          submissionId,
          attemptCount: input.attemptCount,
          destinationHost: input.destinationHost,
          eventType: input.eventType,
          lastError: input.lastError,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          status: input.status,
        },
        select: { id: true },
      });
    },
    async update(id, input) {
      await db.webhookEvent.update({
        where: { id },
        data: input,
      });
    },
  };
}

export async function deliverCompletionWebhook(
  submissionId: string,
  dependencies: WebhookDeliveryDependencies = {},
) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      businessName: true,
      completedAt: true,
      opportunityScore: true,
      status: true,
      websiteUrl: true,
    },
  });
  if (
    !submission ||
    submission.status !== "complete" ||
    submission.completedAt === null ||
    submission.opportunityScore === null
  ) {
    throw new Error("A completed assessment is required for webhook delivery.");
  }
  const payload: CompletionWebhookPayload = {
    assessmentId: submissionId,
    businessName: submission.businessName,
    completedAt: submission.completedAt.toISOString(),
    event: completionEventType,
    opportunityScore: submission.opportunityScore,
    status: "complete",
    website: submission.websiteUrl,
  };
  return runCompletionWebhookDelivery(
    {
      payload,
      secret: process.env.WEBHOOK_SECRET,
      store: prismaWebhookStore(submissionId),
      submissionId,
      webhookUrl: process.env.WEBHOOK_URL,
    },
    dependencies,
  );
}
