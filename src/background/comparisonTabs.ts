import { createSerialQueue } from "./serialQueue";

export const COMPARISON_TABS_KEY = "mooFlightsComparisonWorkerTabs";
const WORKER_MARKER = "mooFlightsComparisonWorker";
export type ComparisonWorkerRecord = {
  sourceTabId: number;
  requestId: string;
  url: string;
  stagingUrl: string;
};
type TabStorage = Pick<chrome.storage.StorageArea, "get" | "set" | "remove">;
type WorkerTab = Pick<chrome.tabs.Tab, "url" | "pendingUrl">;

export function workerTabUrls(url: string): { url: string; stagingUrl: string } {
  const marker = `${WORKER_MARKER}=${crypto.randomUUID()}`;
  const target = new URL(url);
  target.hash = `${target.hash ? `${target.hash.slice(1)}&` : ""}${marker}`;
  return { url: target.toString(), stagingUrl: `about:blank#${marker}` };
}

function storedRecords(value: unknown): Record<string, ComparisonWorkerRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, record]) => {
      if (!/^\d+$/.test(id) || !record || typeof record !== "object") return false;
      const candidate = record as Partial<ComparisonWorkerRecord>;
      return (
        Number.isInteger(candidate.sourceTabId) &&
        typeof candidate.requestId === "string" &&
        typeof candidate.url === "string" &&
        candidate.url.includes(`${WORKER_MARKER}=`) &&
        typeof candidate.stagingUrl === "string" &&
        candidate.stagingUrl.startsWith(`about:blank#${WORKER_MARKER}=`)
      );
    }),
  ) as Record<string, ComparisonWorkerRecord>;
}

/** Worker ownership survives service-worker suspension. Unique URL markers prevent closing reused tab IDs. */
export class ComparisonTabRegistry {
  private records: Record<string, ComparisonWorkerRecord> = {};
  private readonly enqueue = createSerialQueue();
  readonly ready: Promise<void>;

  constructor(
    private readonly storage: TabStorage,
    private readonly getTab: (id: number) => Promise<WorkerTab | null>,
    private readonly removeTab: (id: number) => Promise<void>,
  ) {
    this.ready = this.sweepLeftovers();
  }

  private async sweepLeftovers(): Promise<void> {
    const stored = await this.storage.get(COMPARISON_TABS_KEY);
    this.records = storedRecords(stored[COMPARISON_TABS_KEY]);
    const entries = Object.entries(this.records);
    for (const [id, record] of entries) {
      const tab = await this.getTab(Number(id));
      if (tab && this.owns(record, tab.pendingUrl || tab.url)) await this.removeTab(Number(id));
      delete this.records[id];
    }
    if (entries.length > 0 || stored[COMPARISON_TABS_KEY] !== undefined) await this.storage.remove(COMPARISON_TABS_KEY);
  }

  async remember(id: number, record: ComparisonWorkerRecord): Promise<void> {
    await this.ready;
    await this.enqueue(async () => {
      this.records[String(id)] = record;
      await this.storage.set({ [COMPARISON_TABS_KEY]: this.records });
    });
  }

  async forget(id: number): Promise<void> {
    await this.ready;
    await this.enqueue(async () => {
      if (!this.records[String(id)]) return;
      delete this.records[String(id)];
      if (Object.keys(this.records).length) await this.storage.set({ [COMPARISON_TABS_KEY]: this.records });
      else await this.storage.remove(COMPARISON_TABS_KEY);
    });
  }

  async context(id: number, url?: string): Promise<ComparisonWorkerRecord | null> {
    await this.ready;
    const record = this.records[String(id)];
    if (!record) return null;
    if (url && !this.owns(record, url)) return null;
    return record;
  }

  private owns(record: ComparisonWorkerRecord, url?: string): boolean {
    return url === record.url || url === record.stagingUrl;
  }
}
