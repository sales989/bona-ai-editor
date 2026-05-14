// API utilities for BONA AI Editor

const API_BASE = '/api';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('bona_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('bona_token', token);
    } else {
      localStorage.removeItem('bona_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  isLoggedIn(): boolean {
    return !!this.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Don't set Content-Type for FormData (let browser set it)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const resp = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });

      // Handle file responses
      const contentType = resp.headers.get('content-type');
      if (contentType?.includes('image/') || contentType?.includes('video/') || contentType?.includes('application/octet-stream')) {
        return { success: true, data: resp as any };
      }

      const data = await resp.json();

      if (!resp.ok) {
        return { success: false, error: data.error || `请求失败 (${resp.status})` };
      }

      return data;
    } catch (error) {
      return { success: false, error: '网络错误，请检查连接' };
    }
  }

  // Auth
  async login(username: string, password: string) {
    return this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async logout() {
    const result = await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
    return result;
  }

  async getCurrentUser() {
    return this.request<any>('/auth/me');
  }

  // Upload
  async uploadFiles(files: File[]) {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return this.request<{ file_ids: string[]; count: number }>('/upload', {
      method: 'POST',
      body: formData,
    });
  }

  // Tasks
  async createTask(taskType: 'image' | 'video', sourceFileIds: string[], aiPrompt: string) {
    return this.request<{ task_id: string; status: string }>('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        task_type: taskType,
        source_file_ids: sourceFileIds,
        ai_prompt: aiPrompt,
      }),
    });
  }

  async listTasks(params: { type?: string; status?: string; page?: number; page_size?: number; user_id?: string } = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
    return this.request<{ tasks: any[]; total: number }>(`/tasks?${query}`);
  }

  async getTask(taskId: string) {
    return this.request<any>(`/tasks/${taskId}`);
  }

  async reEditTask(taskId: string, aiPrompt: string) {
    return this.request<{ task_id: string }>(`/tasks/${taskId}/reedit`, {
      method: 'POST',
      body: JSON.stringify({ ai_prompt: aiPrompt }),
    });
  }

  // Admin
  async listUsers() {
    return this.request<any[]>('/admin/users');
  }

  async createUser(username: string, password: string, role: string = 'user') {
    return this.request<{ id: string; username: string; role: string }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    });
  }

  async updateUserStatus(userId: string, status: number) {
    return this.request(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async resetUserPassword(userId: string, password: string) {
    return this.request(`/admin/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  }

  async deleteUser(userId: string) {
    return this.request(`/admin/users/${userId}`, { method: 'DELETE' });
  }

  async getApiConfigs() {
    return this.request<any[]>('/admin/api-configs');
  }

  async saveApiConfig(provider: string, apiKey: string) {
    return this.request(`/admin/api-configs/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ api_key: apiKey }),
    });
  }

  async getStats() {
    return this.request<{ totalUsers: number; totalTasks: number; successTasks: number; failedTasks: number }>('/admin/stats');
  }

  // Get API Key (admin only)
  async getApiKey(provider: string) {
    return this.request<{ api_key: string }>(`/admin/api-key/${provider}`);
  }

  // Update task result (frontend writes back after AI processing)
  async updateTaskResult(taskId: string, result: { result_file_id?: string; error_msg?: string }) {
    return this.request(`/tasks/${taskId}/result`, {
      method: 'PUT',
      body: JSON.stringify(result),
    });
  }
}

export const api = new ApiClient();
