import type { SessionEvent } from '../types';
import { processDOM } from './dom-cleaner';

interface RRWebEvent {
  type: number;
  data: any;
  timestamp: number;
}

// rrweb node types
const NODE_TYPE_DOCUMENT = 0;
const NODE_TYPE_DOCTYPE = 1;
const NODE_TYPE_ELEMENT = 2;
const NODE_TYPE_TEXT = 3;
const NODE_TYPE_CDATA = 4;
const NODE_TYPE_COMMENT = 5;

// rrweb event types
const EVENT_TYPE_FULL_SNAPSHOT = 2;
const EVENT_TYPE_META = 4;

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Recursively serialize an rrweb serialized node tree back to HTML.
 * This doesn't need to be perfect — it's for AI analysis, not rendering.
 */
export function serializeRRWebNode(node: any): string {
  if (!node) return '';

  switch (node.type) {
    case NODE_TYPE_DOCUMENT: {
      // Document node: just recurse into children
      const children = node.childNodes ?? [];
      return children.map((child: any) => serializeRRWebNode(child)).join('');
    }

    case NODE_TYPE_DOCTYPE: {
      return '<!DOCTYPE html>';
    }

    case NODE_TYPE_ELEMENT: {
      const tagName = (node.tagName ?? '').toLowerCase();
      if (!tagName) return '';

      // Build attribute string
      let attrStr = '';
      if (node.attributes) {
        for (const [key, value] of Object.entries(node.attributes)) {
          if (value === true || value === '') {
            attrStr += ` ${key}`;
          } else if (value !== null && value !== undefined && value !== false) {
            // Escape double quotes in attribute values
            const escaped = String(value).replace(/"/g, '&quot;');
            attrStr += ` ${key}="${escaped}"`;
          }
        }
      }

      // Void elements: no closing tag
      if (VOID_ELEMENTS.has(tagName)) {
        return `<${tagName}${attrStr}>`;
      }

      // Regular elements: opening tag, children, closing tag
      const children = node.childNodes ?? [];
      const childHTML = children
        .map((child: any) => serializeRRWebNode(child))
        .join('');

      return `<${tagName}${attrStr}>${childHTML}</${tagName}>`;
    }

    case NODE_TYPE_TEXT: {
      return node.textContent ?? '';
    }

    case NODE_TYPE_CDATA:
    case NODE_TYPE_COMMENT: {
      // Skip comment and CDATA nodes
      return '';
    }

    default:
      return '';
  }
}

/**
 * Extract DOM snapshots from rrweb replay data, correlating them with page URLs.
 *
 * Iterates through replay chunks in order, tracking URL changes via Meta events
 * and capturing full DOM snapshots when FullSnapshot events are encountered.
 */
export function extractDOMSnapshots(
  replayData: Map<number, unknown[]>
): Map<string, string> {
  const snapshots = new Map<string, string>();

  // Sort chunk indices so we process in order
  const sortedIndices = [...replayData.keys()].sort((a, b) => a - b);

  let currentUrl: string | null = null;

  for (const chunkIndex of sortedIndices) {
    const events = replayData.get(chunkIndex) as RRWebEvent[];
    if (!events) continue;

    for (const event of events) {
      // Track URL from Meta events
      if (event.type === EVENT_TYPE_META && event.data?.href) {
        currentUrl = event.data.href;
      }

      // Extract DOM from FullSnapshot events
      if (event.type === EVENT_TYPE_FULL_SNAPSHOT && event.data?.node) {
        const rawHTML = serializeRRWebNode(event.data.node);
        const cleanedHTML = processDOM(rawHTML);

        const url = currentUrl ?? 'unknown';
        snapshots.set(url, cleanedHTML);
      }
    }
  }

  return snapshots;
}

/**
 * Main entry point for processing replay data.
 *
 * Extracts DOM snapshots from rrweb replay chunks and correlates them with page URLs.
 * When a snapshot URL is unknown, attempts to find the closest pageview event by timestamp.
 */
export function processReplayData(
  replayData: Map<number, unknown[]>,
  events: SessionEvent[]
): Map<string, string> {
  if (replayData.size === 0) {
    return new Map();
  }

  const snapshots = extractDOMSnapshots(replayData);

  // If we have an 'unknown' URL snapshot, try to correlate with pageview events
  if (snapshots.has('unknown')) {
    const unknownHTML = snapshots.get('unknown')!;
    snapshots.delete('unknown');

    // Find pageview events sorted by timestamp
    const pageviewEvents = events
      .filter(e => e.type === 'pageview')
      .sort((a, b) => a.timestamp - b.timestamp);

    if (pageviewEvents.length > 0) {
      // Find the earliest snapshot timestamp to correlate
      let earliestSnapshotTimestamp = Infinity;

      const sortedIndices = [...replayData.keys()].sort((a, b) => a - b);
      for (const chunkIndex of sortedIndices) {
        const chunkEvents = replayData.get(chunkIndex) as RRWebEvent[];
        if (!chunkEvents) continue;

        for (const event of chunkEvents) {
          if (event.type === EVENT_TYPE_FULL_SNAPSHOT) {
            earliestSnapshotTimestamp = Math.min(
              earliestSnapshotTimestamp,
              event.timestamp
            );
          }
        }
      }

      // Find the closest pageview event by timestamp
      let closestEvent: SessionEvent | null = null;
      let closestDistance = Infinity;

      for (const pageview of pageviewEvents) {
        const distance = Math.abs(
          pageview.timestamp - earliestSnapshotTimestamp
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEvent = pageview;
        }
      }

      if (closestEvent) {
        snapshots.set(closestEvent.url, unknownHTML);
      } else {
        // No correlation found — keep as unknown
        snapshots.set('unknown', unknownHTML);
      }
    } else {
      // No pageview events to correlate with — keep as unknown
      snapshots.set('unknown', unknownHTML);
    }
  }

  return snapshots;
}
