import { CREATE_INTERACTIONS_TABLE, type Interaction } from '../db/schema';

/**
 * Initialize the database with required tables
 * Note: Table creation is idempotent (IF NOT EXISTS), so this is safe to call multiple times
 */
export async function initializeDatabase(db: D1Database): Promise<void> {
  try {
    // Create table using prepare() instead of exec() to avoid span tracking issues in queue context
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        eventCount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('user_behavior', 'engagement_pattern', 'anomaly', 'custom')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
        tags TEXT NOT NULL,
        metadata TEXT,
        createdAt INTEGER NOT NULL,
        processedAt INTEGER NOT NULL
      );
    `;

    try {
      await db.prepare(createTableSQL).run();
      console.log('Database initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('already exists')) {
        console.log('Table already exists');
        return;
      }
      // For other errors, log but continue
      console.warn('Database initialization warning:', errorMessage.substring(0, 150));
    }

    // Create indexes
    const indexStatements = [
      `CREATE INDEX IF NOT EXISTS idx_interactions_sessionId ON interactions(sessionId);`,
      `CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);`,
      `CREATE INDEX IF NOT EXISTS idx_interactions_createdAt ON interactions(createdAt);`,
    ];

    for (const indexSQL of indexStatements) {
      try {
        await db.prepare(indexSQL).run();
      } catch (error) {
        // Index creation warnings are not critical
        console.debug(`Index creation note: ${error}`);
      }
    }
  } catch (error) {
    console.warn('Database initialization encountered an issue:', error);
    // Don't throw - allow processing to continue
  }
}

/**
 * Save an interaction to the database
 */
export async function saveInteraction(
  db: D1Database,
  interaction: Interaction
): Promise<void> {
  try {
    const tagsJson = JSON.stringify(interaction.tags);
    const metadataJson = interaction.metadata ? JSON.stringify(interaction.metadata) : null;

    const result = await db
      .prepare(
        `
        INSERT INTO interactions (
          id,
          sessionId,
          eventCount,
          type,
          title,
          description,
          confidence,
          tags,
          metadata,
          createdAt,
          processedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .bind(
        interaction.id,
        interaction.sessionId,
        interaction.eventCount,
        interaction.type,
        interaction.title,
        interaction.description,
        interaction.confidence,
        tagsJson,
        metadataJson,
        interaction.createdAt,
        interaction.processedAt
      )
      .run();

    if (!result.success) {
      throw new Error(`Failed to save interaction: ${result.error}`);
    }

    console.log(`Saved interaction ${interaction.id} for session ${interaction.sessionId}`);
  } catch (error) {
    console.error('Error saving interaction:', error);
    throw error;
  }
}

/**
 * Save multiple interactions in batch
 */
export async function saveInteractionsBatch(
  db: D1Database,
  interactions: Interaction[]
): Promise<void> {
  try {
    // Ensure table exists before saving
    await ensureTablesExist(db);

    for (const interaction of interactions) {
      await saveInteraction(db, interaction);
    }
  } catch (error) {
    console.error('Error saving interactions batch:', error);
    throw error;
  }
}

/**
 * Ensure required tables exist (safe to call multiple times)
 */
async function ensureTablesExist(db: D1Database): Promise<void> {
  try {
    // Try to create table with IF NOT EXISTS using prepare() instead of exec()
    // prepare() avoids span tracking issues in queue handler context
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        eventCount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('user_behavior', 'engagement_pattern', 'anomaly', 'custom')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
        tags TEXT NOT NULL,
        metadata TEXT,
        createdAt INTEGER NOT NULL,
        processedAt INTEGER NOT NULL
      );
    `;

    try {
      // Use prepare() instead of exec() to avoid span tracking issues
      await db.prepare(createTableSQL).run();
      console.log('Interactions table created or already exists');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('already exists')) {
        console.log('Interactions table already exists');
      } else if (errorMessage.includes('no such table')) {
        // Table doesn't exist, but we're about to try to insert
        // The INSERT statement will fail, so throw this error
        throw error;
      }
    }

    // Create indexes
    const indexStatements = [
      `CREATE INDEX IF NOT EXISTS idx_interactions_sessionId ON interactions(sessionId);`,
      `CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);`,
      `CREATE INDEX IF NOT EXISTS idx_interactions_createdAt ON interactions(createdAt);`,
    ];

    for (const indexSQL of indexStatements) {
      try {
        await db.prepare(indexSQL).run();
      } catch (error) {
        // Index creation errors are not critical
        console.debug(`Index creation note: ${error}`);
      }
    }
  } catch (error) {
    console.error('Error ensuring tables exist:', error);
    // Don't throw - try to continue anyway - the table might already exist
  }
}

/**
 * Get interactions for a specific session
 */
export async function getSessionInteractions(
  db: D1Database,
  sessionId: string
): Promise<Interaction[]> {
  try {
    const results = await db
      .prepare('SELECT * FROM interactions WHERE sessionId = ? ORDER BY createdAt DESC')
      .bind(sessionId)
      .all();

    if (!results.results || results.results.length === 0) {
      return [];
    }

    return (results.results as any[]).map(row => ({
      id: row.id,
      sessionId: row.sessionId,
      eventCount: row.eventCount,
      type: row.type,
      title: row.title,
      description: row.description,
      confidence: row.confidence,
      tags: JSON.parse(row.tags || '[]'),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      processedAt: row.processedAt,
    }));
  } catch (error) {
    console.error(`Error retrieving interactions for session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Get all interactions by type
 */
export async function getInteractionsByType(
  db: D1Database,
  type: string
): Promise<Interaction[]> {
  try {
    const results = await db
      .prepare('SELECT * FROM interactions WHERE type = ? ORDER BY createdAt DESC LIMIT 100')
      .bind(type)
      .all();

    if (!results.results || results.results.length === 0) {
      return [];
    }

    return (results.results as any[]).map(row => ({
      id: row.id,
      sessionId: row.sessionId,
      eventCount: row.eventCount,
      type: row.type,
      title: row.title,
      description: row.description,
      confidence: row.confidence,
      tags: JSON.parse(row.tags || '[]'),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      processedAt: row.processedAt,
    }));
  } catch (error) {
    console.error(`Error retrieving interactions by type ${type}:`, error);
    throw error;
  }
}

/**
 * Get interaction statistics
 */
export async function getInteractionStats(
  db: D1Database
): Promise<Record<string, any>> {
  try {
    const result = await db
      .prepare(
        `
        SELECT
          COUNT(*) as total_interactions,
          COUNT(DISTINCT sessionId) as unique_sessions,
          AVG(confidence) as avg_confidence,
          MAX(processedAt) as last_processed
        FROM interactions
      `
      )
      .first();

    return result || {};
  } catch (error) {
    console.error('Error retrieving interaction statistics:', error);
    throw error;
  }
}
