import type { PageDomSummary, SessionEvent } from './agents/types';
import { parseJsonFromLlm, runAiPrompt } from './agents/types';

const MAX_PAGES_TO_PROCESS = 8;
const MAX_SNAPSHOT_CHARS = 4000;

interface GroupedSnapshots {
  url: string;
  snapshots: SessionEvent[];
}

export async function chunkAndSummarizeDom(
  ai: Ai,
  events: SessionEvent[]
): Promise<PageDomSummary[]> {
  const { regularEvents, rrwebEvents } = separateEvents(events);

  if (rrwebEvents.length === 0) return [];

  const grouped = groupSnapshotsByPage(rrwebEvents, regularEvents);
  const pagesToProcess = selectPagesToProcess(grouped);
  const summaries: PageDomSummary[] = [];

  for (const group of pagesToProcess) {
    const summary = await summarizePageDom(ai, group);
    if (summary) summaries.push(summary);
  }

  return summaries;
}

function separateEvents(events: SessionEvent[]): {
  regularEvents: SessionEvent[];
  rrwebEvents: SessionEvent[];
} {
  const regularEvents: SessionEvent[] = [];
  const rrwebEvents: SessionEvent[] = [];

  for (const event of events) {
    if (event.type === 'rrweb_snapshot') {
      rrwebEvents.push(event);
    } else {
      regularEvents.push(event);
    }
  }

  return { regularEvents, rrwebEvents };
}

function groupSnapshotsByPage(
  rrwebEvents: SessionEvent[],
  regularEvents: SessionEvent[]
): GroupedSnapshots[] {
  const pageviews = regularEvents
    .filter(e => e.type === 'pageview' && e.url)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (pageviews.length === 0) {
    return rrwebEvents.length > 0
      ? [{ url: 'unknown', snapshots: rrwebEvents }]
      : [];
  }

  const groups: GroupedSnapshots[] = [];

  for (let i = 0; i < pageviews.length; i++) {
    const currentPageview = pageviews[i];
    const nextPageview = pageviews[i + 1];
    const startTime = currentPageview.timestamp;
    const endTime = nextPageview?.timestamp ?? Infinity;

    const snapshots = rrwebEvents.filter(
      s => s.timestamp >= startTime && s.timestamp < endTime
    );

    if (snapshots.length > 0) {
      groups.push({ url: currentPageview.url!, snapshots });
    }
  }

  return groups;
}

function selectPagesToProcess(groups: GroupedSnapshots[]): GroupedSnapshots[] {
  if (groups.length <= MAX_PAGES_TO_PROCESS) return groups;

  const first = groups.slice(0, MAX_PAGES_TO_PROCESS - 1);
  const last = groups[groups.length - 1];
  return [...first, last];
}

function sampleSnapshots(snapshots: SessionEvent[]): SessionEvent[] {
  if (snapshots.length <= 3) return snapshots;
  const first = snapshots[0];
  const middle = snapshots[Math.floor(snapshots.length / 2)];
  const last = snapshots[snapshots.length - 1];
  return [first, middle, last];
}

function truncateSnapshotData(event: SessionEvent): string {
  const dataStr = JSON.stringify(event.data ?? {});
  return dataStr.length > MAX_SNAPSHOT_CHARS
    ? `${dataStr.slice(0, MAX_SNAPSHOT_CHARS)}...[truncated]`
    : dataStr;
}

async function summarizePageDom(
  ai: Ai,
  group: GroupedSnapshots
): Promise<PageDomSummary | null> {
  const sampled = sampleSnapshots(group.snapshots);
  const snapshotTexts = sampled.map(
    (s, i) => `Snapshot ${i + 1}:\n${truncateSnapshotData(s)}`
  );

  const prompt = `You are analyzing serialized DOM snapshots from a web page at URL: ${group.url}

${snapshotTexts.join('\n\n')}

Extract the following from these DOM snapshots:
- Page title and purpose
- Key visible text content (headings, product info, prices, CTAs)
- Interactive elements (buttons, links, forms)
- Product-related elements (names, prices, stock status)
- Error indicators (404, broken elements, error messages)
- Form fields present

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "title": "string",
  "purpose": "string",
  "visibleContent": "string summary of key visible text",
  "interactiveElements": [{"tag": "string", "text": "string"}],
  "productElements": [{"name": "string", "price": "string", "stock": "string"}],
  "errorIndicators": ["string"],
  "formFields": ["string"]
}`;

  const response = await runAiPrompt(ai, prompt, 512);
  if (!response) return null;

  const parsed = parseJsonFromLlm<{
    title?: string;
    purpose?: string;
    visibleContent?: string;
    interactiveElements?: { tag: string; text: string }[];
    productElements?: { name?: string; price?: string; stock?: string }[];
    errorIndicators?: string[];
    formFields?: string[];
  }>(response);

  if (!parsed) return null;

  return {
    url: group.url,
    title: parsed.title ?? '',
    purpose: parsed.purpose ?? '',
    visibleContent: parsed.visibleContent ?? '',
    interactiveElements: Array.isArray(parsed.interactiveElements)
      ? parsed.interactiveElements
      : [],
    productElements: Array.isArray(parsed.productElements)
      ? parsed.productElements
      : [],
    errorIndicators: Array.isArray(parsed.errorIndicators)
      ? parsed.errorIndicators
      : [],
    formFields: Array.isArray(parsed.formFields) ? parsed.formFields : [],
  };
}
