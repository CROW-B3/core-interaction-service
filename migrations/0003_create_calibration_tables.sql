CREATE TABLE IF NOT EXISTS camera_registry (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  camera_id TEXT NOT NULL,
  zone TEXT,
  grid_row INTEGER NOT NULL,
  grid_col INTEGER NOT NULL,
  adjacency TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_registry_store_camera
  ON camera_registry(store_id, camera_id);

CREATE TABLE IF NOT EXISTS calibrations (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  session_id TEXT,
  reasoning TEXT NOT NULL,
  adjustments TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calibrations_store_date
  ON calibrations(store_id, date);
