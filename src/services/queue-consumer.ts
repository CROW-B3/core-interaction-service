import { analyzeSessionWithAI } from './ai-analyzer';
import { saveInteractionsBatch, initializeDatabase } from './database';
import { type SessionExport } from '../db/schema';

export interface QueueMessage {
  sessionId: string;
}

export interface SessionEvent {
  id: string;
  type: string;
  timestamp: number;
  url: string;
  data?: Record<string, any>;
  userAgent?: string;
  screenSize?: { width: number; height: number };
}

/**
 * Fetch session events from web-ingest-service
 */
async function fetchSessionEventsFromWebIngest(
  env: any,
  sessionId: string
): Promise<SessionEvent[]> {
  const webIngestUrl = env.WEB_INGEST_SERVICE_URL;
  if (!webIngestUrl) {
    throw new Error('WEB_INGEST_SERVICE_URL not configured');
  }

  const url = `${webIngestUrl}/events?sessionId=${encodeURIComponent(sessionId)}`;
  console.log(`Fetching events from: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch events from web-ingest: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json<any>();

    if (!data.success || !Array.isArray(data.events)) {
      throw new Error(`Invalid response format from web-ingest service`);
    }

    console.log(`Fetched ${data.events.length} events for session ${sessionId}`);
    return data.events;
  } catch (error) {
    console.error(`Error fetching events from web-ingest:`, error);
    throw error;
  }
}

/**
 * Process a session export message from the queue
 */
export async function processSessionExport(env: any, message: QueueMessage): Promise<void> {
  console.log(`Processing session export: ${message.sessionId}`);

  try {
    // Verify database binding is available
    if (!env?.DB) {
      throw new Error('Database binding (DB) is not configured in the environment');
    }

    // Note: Database table initialization is skipped in queue handler due to span tracking issues
    // The table will be created on first HTTP API call via initializeDatabase() or will be created by the INSERT statement

    console.log(`Fetching events for session ${message.sessionId}...`);
    // Fetch events from web-ingest-service
    const events = await fetchSessionEventsFromWebIngest(env, message.sessionId);

    if (events.length === 0) {
      console.warn(`No events found for session ${message.sessionId}`);
      return;
    }

    console.log(`Analyzing ${events.length} events with AI...`);
    // Analyze session events using AI
    const interactions = await analyzeSessionWithAI(
      env,
      message.sessionId,
      events,
      events.length
    );

    // Save interactions to database
    if (interactions.length > 0) {
      console.log(`Saving ${interactions.length} interactions to database...`);
      await saveInteractionsBatch(env.DB, interactions);
      console.log(
        `Saved ${interactions.length} interactions for session ${message.sessionId}`
      );
    } else {
      console.warn(`No interactions generated for session ${message.sessionId}`);
    }

    console.log(`✓ Successfully processed session export: ${message.sessionId}`);
  } catch (error) {
    console.error(`✘ Failed to process session export for ${message.sessionId}:`, error);
    throw error; // Re-throw to trigger queue retry
  }
}

/**
 * Validate queue message format
 */
export function validateQueueMessage(message: any): message is QueueMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  return typeof message.sessionId === 'string';
}

/**
 * Batch process multiple queue messages
 */
export async function processBatch(env: any, messages: QueueMessage[]): Promise<void> {
  console.log(`Processing batch of ${messages.length} session exports`);

  const errors: Array<{ sessionId: string; error: string }> = [];

  for (const message of messages) {
    try {
      if (!validateQueueMessage(message)) {
        throw new Error('Invalid message format');
      }

      await processSessionExport(env, message);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({
        sessionId: message.sessionId || 'unknown',
        error: errorMsg,
      });
      console.error(`Error processing session ${message.sessionId}:`, error);
    }
  }

  if (errors.length > 0) {
    console.warn(`${errors.length} messages failed to process:`, errors);
  }

  console.log(`Batch processing complete. Processed: ${messages.length - errors.length}/${messages.length}`);
}
