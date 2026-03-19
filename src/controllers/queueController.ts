import type {
  AnalysisResponse,
  Environment,
  SessionExportMessage,
} from '../types';
import { getContainer } from '@cloudflare/containers';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;
}

async function fetchSessionEvents(
  db: D1Database,
  sessionId: string
): Promise<any[]> {
  const result = await db
    .prepare(
      `SELECT id, type, timestamp, url, data, user_agent, screen_size_json
       FROM events
       WHERE session_id = ?
       ORDER BY timestamp ASC`
    )
    .bind(sessionId)
    .all();

  return result.results.map((row: any) => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    url: row.url,
    data: row.data ? JSON.parse(row.data) : null,
    userAgent: row.user_agent,
    screenSize: row.screen_size_json ? JSON.parse(row.screen_size_json) : null,
  }));
}

async function callPythonContainer(
  env: Environment,
  sessionData: SessionExportMessage,
  events: any[],
  cfAccountId: string,
  cfAiApiKey: string,
  aiGatewayId?: string
): Promise<AnalysisResponse> {
  const requestBody = JSON.stringify({
    session: {
      sessionId: sessionData.sessionId,
      projectId: sessionData.projectId,
      userId: sessionData.userId,
      anonymousId: sessionData.anonymousId,
      startedAt: sessionData.startedAt,
      endedAt: sessionData.endedAt,
      eventCount: sessionData.eventCount,
      metadata: sessionData.metadata,
    },
    events,
    cfAccountId,
    cfAiApiKey,
    aiGatewayId,
  });

  let response: Response;

  if (env.CONTAINER) {
    const container = getContainer(env.CONTAINER);
    response = await container.fetch('http://container/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
  } else if (env.PYTHON_CONTAINER_URL) {
    response = await fetch(`${env.PYTHON_CONTAINER_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
  } else {
    throw new Error('No container or PYTHON_CONTAINER_URL configured');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Container error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<AnalysisResponse>;
}

async function storeInteractions(
  db: D1Database,
  sessionId: string,
  projectId: string,
  interactions: AnalysisResponse['interactions']
): Promise<void> {
  for (const interaction of interactions) {
    const id = generateId('int');
    await db
      .prepare(
        `INSERT INTO interactions
         (id, session_id, project_id, interaction_type, category, description,
          summary, confidence, metrics, patterns, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        sessionId,
        projectId,
        interaction.type,
        interaction.category,
        interaction.description,
        interaction.summary,
        interaction.confidence,
        JSON.stringify(interaction.metrics),
        JSON.stringify(interaction.patterns),
        Date.now()
      )
      .run();
  }
}

async function updateSessionStatus(
  db: D1Database,
  sessionId: string,
  status: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions
       SET processing_status = ?, processed_at = ?
       WHERE id = ?`
    )
    .bind(status, Math.floor(Date.now() / 1000), sessionId)
    .run();
}

async function logProcessing(
  db: D1Database,
  sessionId: string,
  success: boolean,
  agentsUsed: number,
  tasksCompleted: number,
  errorMessage?: string
): Promise<void> {
  const id = generateId('log');
  await db
    .prepare(
      `INSERT INTO ai_processing_logs
       (id, session_id, success, agents_used, tasks_completed, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      sessionId,
      success ? 1 : 0,
      agentsUsed,
      tasksCompleted,
      errorMessage || null,
      Math.floor(Date.now() / 1000)
    )
    .run();
}

export async function processSessionMessage(
  message: SessionExportMessage,
  env: Environment
): Promise<void> {
  const { sessionId, projectId } = message;

  console.warn(
    `Processing session ${sessionId} with ${message.eventCount} events`
  );

  try {
    const events = await fetchSessionEvents(env.DB, sessionId);

    console.warn(`Fetched ${events.length} events for session ${sessionId}`);

    const result = await callPythonContainer(
      env,
      message,
      events,
      env.CF_ACCOUNT_ID,
      env.CF_AI_API_KEY
    );

    console.warn(
      `Analysis complete: ${result.interactions.length} interactions found`
    );

    await storeInteractions(env.DB, sessionId, projectId, result.interactions);

    await updateSessionStatus(env.DB, sessionId, 'completed');

    await logProcessing(
      env.DB,
      sessionId,
      true,
      result.agentsUsed,
      result.tasksCompleted
    );

    console.warn(`Session ${sessionId} processed successfully`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to process session ${sessionId}: ${errorMessage}`);

    await updateSessionStatus(env.DB, sessionId, 'failed');
    await logProcessing(env.DB, sessionId, false, 0, 0, errorMessage);

    throw error;
  }
}

export async function handleQueueBatch(
  batch: MessageBatch<SessionExportMessage>,
  env: Environment
): Promise<void> {
  console.warn(`Processing batch of ${batch.messages.length} messages`);

  for (const message of batch.messages) {
    try {
      await processSessionMessage(message.body, env);
      message.ack();
    } catch (error) {
      console.error(`Message processing failed, will retry:`, error);
      message.retry();
    }
  }
}
