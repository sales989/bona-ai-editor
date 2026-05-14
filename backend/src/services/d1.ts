// Database Service - D1 CRUD operations

import { Env, User, SafeUser, Task, ApiConfig } from '../types';

export class DatabaseService {
  private db: D1Database;

  constructor(env: Env) {
    this.db = env.DB;
  }

  // ====== User Operations ======

  async createUser(id: string, username: string, passwordHash: string, role: 'user' | 'admin' = 'user'): Promise<boolean> {
    try {
      await this.db.prepare(
        'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
      ).bind(id, username, passwordHash, role).run();
      return true;
    } catch (error) {
      console.error('Create user error:', error);
      return false;
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const result = await this.db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(username).first<User>();
    return result || null;
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(id).first<User>();
    return result || null;
  }

  async listUsers(): Promise<SafeUser[]> {
    const result = await this.db.prepare(
      'SELECT id, username, role, status, created_at, updated_at FROM users ORDER BY created_at DESC'
    ).all<SafeUser>();
    return result.results || [];
  }

  async updateUserStatus(id: string, status: number): Promise<boolean> {
    try {
      await this.db.prepare(
        "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(status, id).run();
      return true;
    } catch {
      return false;
    }
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<boolean> {
    try {
      await this.db.prepare(
        "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(passwordHash, id).run();
      return true;
    } catch {
      return false;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      await this.db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return true;
    } catch {
      return false;
    }
  }

  // ====== Task Operations ======

  async createTask(task: Task): Promise<boolean> {
    try {
      await this.db.prepare(
        `INSERT INTO tasks (id, user_id, task_type, source_file_ids, ai_prompt, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(task.id, task.user_id, task.task_type, task.source_file_ids, task.ai_prompt, task.status).run();
      return true;
    } catch (error) {
      console.error('Create task error:', error);
      return false;
    }
  }

  async getTaskById(id: string): Promise<Task | null> {
    const result = await this.db.prepare(
      'SELECT * FROM tasks WHERE id = ?'
    ).bind(id).first<Task>();
    return result || null;
  }

  async listTasks(userId?: string, taskType?: string, status?: string, page = 1, pageSize = 20): Promise<{ tasks: Task[]; total: number }> {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE 1=1';
    const params: any[] = [];
    const countParams: any[] = [];

    if (userId) {
      query += ' AND user_id = ?';
      countQuery += ' AND user_id = ?';
      params.push(userId);
      countParams.push(userId);
    }
    if (taskType) {
      query += ' AND task_type = ?';
      countQuery += ' AND task_type = ?';
      params.push(taskType);
      countParams.push(taskType);
    }
    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
      countParams.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);

    const [tasksResult, countResult] = await Promise.all([
      this.db.prepare(query).bind(...params).all<Task>(),
      this.db.prepare(countQuery).bind(...countParams).first<{ total: number }>(),
    ]);

    return {
      tasks: tasksResult.results || [],
      total: countResult?.total || 0,
    };
  }

  async updateTaskStatus(id: string, status: string, progress?: number, resultFileId?: string, resultFilePath?: string, errorMsg?: string): Promise<boolean> {
    try {
      const fields: string[] = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
      const params: any[] = [status];

      if (progress !== undefined) {
        fields.push("progress = ?");
        params.push(progress);
      }
      if (resultFileId) {
        fields.push("result_file_id = ?");
        params.push(resultFileId);
      }
      if (resultFilePath) {
        fields.push("result_file_path = ?");
        params.push(resultFilePath);
      }
      if (errorMsg) {
        fields.push("error_msg = ?");
        params.push(errorMsg);
      }

      params.push(id);
      await this.db.prepare(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`
      ).bind(...params).run();
      return true;
    } catch {
      return false;
    }
  }

  async deleteTask(id: string): Promise<boolean> {
    try {
      await this.db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
      return true;
    } catch {
      return false;
    }
  }

  // ====== API Config Operations ======

  async getApiConfig(provider: string): Promise<ApiConfig | null> {
    const result = await this.db.prepare(
      'SELECT * FROM api_configs WHERE provider = ?'
    ).bind(provider).first<ApiConfig>();
    return result || null;
  }

  async listApiConfigs(): Promise<ApiConfig[]> {
    const result = await this.db.prepare(
      'SELECT * FROM api_configs ORDER BY provider'
    ).all<ApiConfig>();
    return result.results || [];
  }

  async saveApiConfig(id: string, provider: string, apiKey: string): Promise<boolean> {
    try {
      const existing = await this.getApiConfig(provider);
      if (existing) {
        await this.db.prepare(
          "UPDATE api_configs SET api_key = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE provider = ?"
        ).bind(apiKey, provider).run();
      } else {
        await this.db.prepare(
          "INSERT INTO api_configs (id, provider, api_key, enabled) VALUES (?, ?, ?, 1)"
        ).bind(id, provider, apiKey).run();
      }
      return true;
    } catch {
      return false;
    }
  }

  // ====== Stats ======

  async getStats(): Promise<{ totalUsers: number; totalTasks: number; successTasks: number; failedTasks: number }> {
    const [users, tasks, success, failed] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
      this.db.prepare('SELECT COUNT(*) as count FROM tasks').first<{ count: number }>(),
      this.db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'success'").first<{ count: number }>(),
      this.db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'failed'").first<{ count: number }>(),
    ]);

    return {
      totalUsers: users?.count || 0,
      totalTasks: tasks?.count || 0,
      successTasks: success?.count || 0,
      failedTasks: failed?.count || 0,
    };
  }
}
