export type HistoryDeletionRequest = {
  status: "pending";
  requestId: string;
  requestedAt: string;
};

export type PrepareHistoryDeletionResult = HistoryDeletionRequest | { status: "no-contributions" };

export function validatedHistoryDeletionRequest(value: unknown): HistoryDeletionRequest {
  const candidate = value as Partial<HistoryDeletionRequest> | null;
  if (
    candidate?.status !== "pending" ||
    typeof candidate.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.requestId) ||
    typeof candidate.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.requestedAt))
  )
    throw new Error("Invalid deletion request response.");
  return { status: "pending", requestId: candidate.requestId, requestedAt: candidate.requestedAt };
}
