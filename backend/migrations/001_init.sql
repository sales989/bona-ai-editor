-- D1 Database Initialization Script
-- BONA AI Graphic & Video Editor

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status INTEGER DEFAULT 1, -- 1=enabled 0=disabled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('video', 'image')),
  source_file_ids TEXT NOT NULL, -- JSON array of TG file_ids
  ai_prompt TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  progress INTEGER DEFAULT 0, -- 0-100
  result_file_id TEXT,
  result_file_path TEXT,
  error_msg TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS api_configs (
  id TEXT PRIMARY KEY,
  provider TEXT UNIQUE NOT NULL, -- 'picwish', 'dashscope' (通义万相)
  api_key TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin account (password: admin123, must be changed on first login)
-- Password hash for 'admin123' using bcrypt
INSERT OR IGNORE INTO users (id, username, password_hash, role, status) VALUES
  ('u_adm_001', 'admin', '$2a$10$placeholder_hash_change_on_first_login', 'admin', 1);

-- Insert default API config placeholders
INSERT OR IGNORE INTO api_configs (id, provider, api_key, enabled) VALUES
  ('cfg_picwish', 'picwish', '', 0),
  ('cfg_dashscope', 'dashscope', '', 0);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
