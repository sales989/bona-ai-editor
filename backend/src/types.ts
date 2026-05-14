// Type definitions for BONA AI Editor

// ====== Environment Bindings ======
export interface Env {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  JWT_SECRET: string;
  PICWISH_API_KEY?: string;
  DASHSCOPE_API_KEY?: string;
  AI: Ai;
  JWT_EXPIRES_IN?: string;
  APP_NAME?: string;
}

// ====== User Types ======
export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: 'user' | 'admin';
  status: number;
  created_at: string;
  updated_at: string;
}

export type SafeUser = Omit<User, 'password_hash'>;

// ====== Task Types ======
export type TaskType = 'video' | 'image';
export type TaskStatus = 'pending' | 'processing' | 'success' | 'failed';

export interface Task {
  id: string;
  user_id: string;
  task_type: TaskType;
  source_file_ids: string; // JSON array
  ai_prompt: string;
  status: TaskStatus;
  progress: number;
  result_file_id: string | null;
  result_file_path: string | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

// ====== API Config ======
export interface ApiConfig {
  id: string;
  provider: string;
  api_key: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

// ====== TG File Info ======
export interface TgFileInfo {
  file_id: string;
  file_unique_id: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
}

// ====== Auth Payload ======
export interface JwtPayload {
  userId: string;
  username: string;
  role: 'user' | 'admin';
}

// ====== API Response ======
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ====== Request with User Context ======
export interface RequestWithUser extends Request {
  user?: JwtPayload;
}

// ====== AI Model Type ======
export type AiModelProvider = 'cloudflare' | 'picwish' | 'dashscope';

export interface AiTaskResult {
  success: boolean;
  file_id?: string;
  file_path?: string;
  error?: string;
}
