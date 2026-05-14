// BONA AI Editor - Main Entry Point
// Cloudflare Workers backend with D1, KV, Telegram Bot storage

import { Env, JwtPayload } from './types';
import { AuthUtils } from './utils/auth';

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function initAdminIfNeeded(env: Env) {
  try {
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = 'admin'").first();
    if (!existing) {
      const auth = new AuthUtils(env);
      const hash = await auth.hashPassword('admin123');
      await env.DB.prepare(
        "INSERT INTO users (id, username, password_hash, role, status) VALUES (?, ?, ?, 'admin', 1)"
      ).bind('u_admin_init', 'admin', hash).run();
      console.log('Default admin account created: admin / admin123');
    }
  } catch (e) {
    console.log('Admin init check:', e);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Ensure admin account exists (fire and forget)
    ctx.waitUntil(initAdminIfNeeded(env));

    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ---- HEALTH CHECK ----
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({
        success: true,
        data: { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() },
      });
    }

    // ---- AUTH: LOGIN (no auth required) ----
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      return handleLogin(request, env);
    }

    // ---- ALL OTHER API ROUTES REQUIRE AUTH ----
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: '未授权，请先登录' }, 401);
    }

    const token = authHeader.slice(7);
    const auth = new AuthUtils(env);
    const payload = await auth.verifyToken(token);

    if (!payload) {
      return jsonResponse({ success: false, error: '登录已过期，请重新登录' }, 401);
    }

    // Verify KV session
    const session = await env.SESSION_KV.get(token);
    if (!session) {
      return jsonResponse({ success: false, error: '会话已失效，请重新登录' }, 401);
    }

    // Attach user to request
    (request as any).user = payload;

    // ---- ROUTE DISPATCH ----
    try {
      // AUTH routes
      if (url.pathname === '/api/auth/logout') {
        await env.SESSION_KV.delete(token);
        return jsonResponse({ success: true, message: '已退出登录' });
      }
      if (url.pathname === '/api/auth/me') {
        return jsonResponse({ success: true, data: payload });
      }

      // ADMIN routes
      if (url.pathname.startsWith('/api/admin/')) {
        if (payload.role !== 'admin') {
          return jsonResponse({ success: false, error: '需要管理员权限' }, 403);
        }
        return handleAdminRoute(request, env, url);
      }

      // UPLOAD
      if (url.pathname === '/api/upload' && request.method === 'POST') {
        return handleUpload(request, env);
      }

      // TASK routes
      if (url.pathname.startsWith('/api/tasks') || url.pathname.startsWith('/api/files/')) {
        return handleTaskRoute(request, env, url);
      }

      return jsonResponse({ success: false, error: 'Not found' }, 404);
    } catch (err: any) {
      console.error('Route error:', err);
      return jsonResponse({ success: false, error: '服务器内部错误: ' + (err.message || '') }, 500);
    }
  },
};

// ===== HANDLER FUNCTIONS =====

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return jsonResponse({ success: false, error: '请输入用户名和密码' }, 400);
    }
    const auth = new AuthUtils(env);
    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first() as any;
    if (!user) {
      return jsonResponse({ success: false, error: '用户名或密码错误' }, 401);
    }
    if (user.status === 0) {
      return jsonResponse({ success: false, error: '账号已被禁用，请联系管理员' }, 403);
    }
    const valid = await auth.verifyPassword(password, user.password_hash);
    if (!valid) {
      return jsonResponse({ success: false, error: '用户名或密码错误' }, 401);
    }
    const payload = { userId: user.id, username: user.username, role: user.role };
    const jwtToken = await auth.generateToken(payload);
    await env.SESSION_KV.put(jwtToken, JSON.stringify(payload), { expirationTtl: 86400 });
    return jsonResponse({
      success: true,
      data: { token: jwtToken, user: { id: user.id, username: user.username, role: user.role } },
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: '登录失败: ' + (err.message || '') }, 500);
  }
}

async function handleAdminRoute(request: Request, env: Env, url: URL): Promise<Response> {
  const user = (request as any).user;
  const method = request.method;

  // GET /api/admin/users
  if (method === 'GET' && url.pathname === '/api/admin/users') {
    const rows = await env.DB.prepare("SELECT id, username, role, status, created_at, updated_at FROM users ORDER BY created_at DESC").all();
    return jsonResponse({ success: true, data: rows.results || [] });
  }

  // POST /api/admin/users
  if (method === 'POST' && url.pathname === '/api/admin/users') {
    const { username, password, role } = await request.json();
    if (!username || !password) return jsonResponse({ success: false, error: '用户名和密码不能为空' }, 400);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return jsonResponse({ success: false, error: '用户名已存在' }, 409);
    const auth = new AuthUtils(env);
    const hash = await auth.hashPassword(password);
    const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    await env.DB.prepare("INSERT INTO users (id, username, password_hash, role, status) VALUES (?, ?, ?, ?, 1)").bind(id, username, hash, role || 'user').run();
    return jsonResponse({ success: true, data: { id, username, role: role || 'user' } });
  }

  // PUT /api/admin/users/:id/status
  const statusMatch = url.pathname.match(/^\/api\/admin\/users\/([^\/]+)\/status$/);
  if (method === 'PUT' && statusMatch) {
    const userId = statusMatch[1];
    const { status } = await request.json();
    if (userId === user.userId && status === 0) return jsonResponse({ success: false, error: '不能禁用自己' }, 400);
    await env.DB.prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, userId).run();
    return jsonResponse({ success: true });
  }

  // PUT /api/admin/users/:id/password
  const pwdMatch = url.pathname.match(/^\/api\/admin\/users\/([^\/]+)\/password$/);
  if (method === 'PUT' && pwdMatch) {
    const userId = pwdMatch[1];
    const { password } = await request.json();
    const auth = new AuthUtils(env);
    const hash = await auth.hashPassword(password);
    await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(hash, userId).run();
    return jsonResponse({ success: true });
  }

  // DELETE /api/admin/users/:id
  const delMatch = url.pathname.match(/^\/api\/admin\/users\/([^\/]+)$/);
  if (method === 'DELETE' && delMatch) {
    const userId = delMatch[1];
    if (userId === user.userId) return jsonResponse({ success: false, error: '不能删除自己' }, 400);
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    return jsonResponse({ success: true });
  }

  // GET /api/admin/api-configs
  if (method === 'GET' && url.pathname === '/api/admin/api-configs') {
    const configs = await env.DB.prepare("SELECT * FROM api_configs ORDER BY provider").all();
    const masked = (configs.results || []).map((c: any) => ({
      ...c,
      api_key: c.api_key ? `${c.api_key.slice(0, 4)}...${c.api_key.slice(-4)}` : '',
    }));
    return jsonResponse({ success: true, data: masked });
  }

  // PUT /api/admin/api-configs/:provider
  const cfgMatch = url.pathname.match(/^\/api\/admin\/api-configs\/([^\/]+)$/);
  if (method === 'PUT' && cfgMatch) {
    const provider = cfgMatch[1];
    const { api_key } = await request.json();
    const existing = await env.DB.prepare("SELECT id FROM api_configs WHERE provider = ?").bind(provider).first();
    if (existing) {
      await env.DB.prepare("UPDATE api_configs SET api_key = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE provider = ?").bind(api_key, provider).run();
    } else {
      await env.DB.prepare("INSERT INTO api_configs (id, provider, api_key, enabled) VALUES (?, ?, ?, 1)").bind('cfg_' + provider, provider, api_key).run();
    }
    return jsonResponse({ success: true });
  }

  // GET /api/admin/stats
  if (method === 'GET' && url.pathname === '/api/admin/stats') {
    const [users, tasks, successTasks] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM tasks").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'success'").first(),
    ]);
    return jsonResponse({ success: true, data: {
      totalUsers: (users as any)?.count || 0,
      totalTasks: (tasks as any)?.count || 0,
      successTasks: (successTasks as any)?.count || 0,
    }});
  }

  return jsonResponse({ success: false, error: 'Admin route not found' }, 404);
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const fileIds: string[] = [];

    if (!files || files.length === 0) {
      return jsonResponse({ success: false, error: '请上传文件' }, 400);
    }

    const tgApi = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

    for (const file of files) {
      const buffer = await (file as any).arrayBuffer();
      const mimeType = (file as any).type || 'application/octet-stream';
      const fileName = (file as any).name || 'file';

      if (buffer.byteLength > 50 * 1024 * 1024) {
        return jsonResponse({ success: false, error: `文件 ${fileName} 超过50MB限制` }, 400);
      }

      // Upload to Telegram
      const blob = new Blob([buffer], { type: mimeType });
      const form = new FormData();
      form.append('chat_id', env.TELEGRAM_CHAT_ID || '');
      form.append('document', blob, fileName);
      const resp = await fetch(`${tgApi}/sendDocument`, { method: 'POST', body: form });
      const data = await resp.json();

      if (data.ok && data.result?.document?.file_id) {
        fileIds.push(data.result.document.file_id);
      } else {
        return jsonResponse({ success: false, error: `上传文件 ${fileName} 失败` }, 500);
      }
    }

    return jsonResponse({ success: true, data: { file_ids: fileIds, count: fileIds.length } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: '上传失败: ' + (err.message || '') }, 500);
  }
}

async function handleTaskRoute(request: Request, env: Env, url: URL): Promise<Response> {
  const user = (request as any).user;
  const method = request.method;

  // GET /api/files/:fileId - Proxy file from Telegram
  const fileMatch = url.pathname.match(/^\/api\/files\/([^\/]+)$/);
  if (fileMatch) {
    const fileId = fileMatch[1];
    const tgApi = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
    const fileResp = await fetch(`${tgApi}/getFile?file_id=${fileId}`);
    const fileData = await fileResp.json();
    if (!fileData.ok) return jsonResponse({ success: false, error: '文件不存在' }, 404);
    const fileUrl = `${tgApi}/${fileData.result.file_path}`;
    const proxyResp = await fetch(fileUrl);
    const proxyHeaders = new Headers(proxyResp.headers);
    proxyHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(proxyResp.body, { headers: proxyHeaders });
  }

  // POST /api/tasks - Create task
  if (method === 'POST' && url.pathname === '/api/tasks') {
    const { task_type, ai_prompt, source_file_ids } = await request.json();
    if (!task_type || !ai_prompt || !source_file_ids) {
      return jsonResponse({ success: false, error: '缺少必要参数' }, 400);
    }
    if (!['video', 'image'].includes(task_type)) {
      return jsonResponse({ success: false, error: '无效的任务类型' }, 400);
    }

    const taskId = 't_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    await env.DB.prepare(
      "INSERT INTO tasks (id, user_id, task_type, source_file_ids, ai_prompt, status, progress) VALUES (?, ?, ?, ?, ?, 'pending', 0)"
    ).bind(taskId, user.userId, task_type, JSON.stringify(source_file_ids), ai_prompt).run();

    // Fire and forget: process in background
    env.DB.prepare("UPDATE tasks SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(taskId).run()
    .then(async () => {
      try {
        await env.DB.prepare("UPDATE tasks SET progress = 10, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(taskId).run();

        // Read API keys from DB config
        const configRows = await env.DB.prepare("SELECT provider, api_key FROM api_configs WHERE enabled = 1").all();
        const configs: Record<string, string> = {};
        for (const r of (configRows.results || []) as any[]) {
          configs[r.provider] = r.api_key;
        }

        // Get source file from Telegram
        const tgApi = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
        const fileResp = await fetch(`${tgApi}/getFile?file_id=${source_file_ids[0]}`);
        const fileData = await fileResp.json() as any;
        if (!fileData.ok) {
          throw new Error('无法获取源文件');
        }
        const sourceUrl = `${tgApi}/${fileData.result.file_path}`;

        await env.DB.prepare("UPDATE tasks SET progress = 30, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(taskId).run();

        // Try laozhang.ai API (Gemini 3 Pro Image) first
        const laozhangKey = configs['laozhang-ai'];
        if (laozhangKey) {
          const lzResult = await callLaozhangAi(laozhangKey, sourceUrl, ai_prompt);
          if (lzResult.success) {
            const fileId = await downloadAndUploadToTg(lzResult.image_url!, env, tgApi);
            if (fileId) {
              await env.DB.prepare("UPDATE tasks SET status = 'success', progress = 100, result_file_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(fileId, taskId).run();
              return;
            }
          }
        }

        // Fallback: Try Atlas Cloud (if configured)
        const atlasKey = configs['atlas'];
        if (atlasKey) {
          const atlasResult = await callAtlasCloud(atlasKey, sourceUrl, ai_prompt);
          if (atlasResult.success) {
            const fileId = await downloadAndUploadToTg(atlasResult.image_url!, env, tgApi);
            if (fileId) {
              await env.DB.prepare("UPDATE tasks SET status = 'success', progress = 100, result_file_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(fileId, taskId).run();
              return;
            }
          }
        }

        throw new Error('所有AI API调用失败，请检查API Key配置');
      } catch (e: any) {
        const errorMsg = e.message || '处理失败';
        await env.DB.prepare("UPDATE tasks SET status = 'failed', error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(errorMsg, taskId).run();
      }
    });

    return jsonResponse({ success: true, data: { task_id: taskId, status: 'pending' } });
  }

  // GET /api/tasks - List tasks
  if (method === 'GET' && url.pathname === '/api/tasks') {
    const taskType = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '20');
    const userId = user.role === 'admin' ? (url.searchParams.get('user_id') || undefined) : user.userId;

    let query = "SELECT * FROM tasks WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as total FROM tasks WHERE 1=1";
    const params: any[] = [];
    const countParams: any[] = [];

    if (userId) { query += " AND user_id = ?"; countQuery += " AND user_id = ?"; params.push(userId); countParams.push(userId); }
    if (taskType) { query += " AND task_type = ?"; countQuery += " AND task_type = ?"; params.push(taskType); countParams.push(taskType); }
    if (status) { query += " AND status = ?"; countQuery += " AND status = ?"; params.push(status); countParams.push(status); }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(pageSize, (page - 1) * pageSize);

    const [tasksResult, countResult] = await Promise.all([
      env.DB.prepare(query).bind(...params).all(),
      env.DB.prepare(countQuery).bind(...countParams).first(),
    ]);

    return jsonResponse({ success: true, data: { tasks: tasksResult.results || [], total: (countResult as any)?.total || 0 } });
  }

  // GET /api/tasks/:id
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^\/]+)$/);
  if (method === 'GET' && taskMatch) {
    const taskId = taskMatch[1];
    const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first();
    if (!task) return jsonResponse({ success: false, error: '任务不存在' }, 404);
    if (user.role !== 'admin' && (task as any).user_id !== user.userId) {
      return jsonResponse({ success: false, error: '无权限查看此任务' }, 403);
    }
    return jsonResponse({ success: true, data: task });
  }

  return jsonResponse({ success: false, error: 'Not found' }, 404);
}

// ====== AI API CALL FUNCTIONS ======

interface AiCallResult {
  success: boolean;
  image_url?: string;
  error?: string;
}

/**
 * Download image from URL and upload to Telegram
 * Returns Telegram file_id
 */
async function downloadAndUploadToTg(imageUrl: string, env: Env, tgApi: string): Promise<string | null> {
  try {
    let imageData: ArrayBuffer;

    if (imageUrl.startsWith('data:')) {
      // Base64 data URL
      const base64Data = imageUrl.split(',')[1];
      imageData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
    } else {
      // Regular URL - download with longer timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const imgResp = await fetch(imageUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!imgResp.ok) return null;
      imageData = await imgResp.arrayBuffer();
    }

    // Upload to Telegram
    const blob = new Blob([imageData], { type: 'image/png' });
    const form = new FormData();
    form.append('chat_id', env.TELEGRAM_CHAT_ID || '');
    form.append('document', blob, 'result.png');
    const resp = await fetch(`${tgApi}/sendDocument`, { method: 'POST', body: form });
    const data = await resp.json() as any;
    return data.ok && data.result?.document?.file_id ? data.result.document.file_id : null;
  } catch {
    return null;
  }
}

/**
 * Call laozhang.ai API (Gemini 3 Pro Image)
 * https://docs.laozhang.ai/api-manual
 */
async function callLaozhangAi(apiKey: string, sourceUrl: string, prompt: string): Promise<AiCallResult> {
  try {
    const apiUrl = 'https://api.laozhang.ai/v1/images/generations';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-3-pro-image',
        prompt: prompt,
        image_url: sourceUrl,
        n: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `laozhang.ai API错误 (${resp.status}): ${errText}` };
    }

    const data = await resp.json() as any;

    if (data.data?.[0]?.url) {
      return { success: true, image_url: data.data[0].url };
    }
    if (data.data?.[0]?.b64_json) {
      return { success: true, image_url: `data:image/png;base64,${data.data[0].b64_json}` };
    }

    return { success: false, error: 'laozhang.ai 返回格式异常' };
  } catch (e: any) {
    return { success: false, error: `laozhang.ai 调用失败: ${e.message}` };
  }
}

/**
 * Call Atlas Cloud API
 */
async function callAtlasCloud(apiKey: string, sourceUrl: string, prompt: string): Promise<AiCallResult> {
  try {
    const apiUrl = 'https://api.atlascloud.ai/v1/images/generations';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-2.0',
        prompt: prompt,
        image: sourceUrl,
        n: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Atlas Cloud API错误 (${resp.status}): ${errText}` };
    }

    const data = await resp.json() as any;
    if (data.data?.[0]?.url) {
      return { success: true, image_url: data.data[0].url };
    }
    if (data.data?.[0]?.b64_json) {
      return { success: true, image_url: `data:image/png;base64,${data.data[0].b64_json}` };
    }

    return { success: false, error: 'Atlas Cloud 返回格式异常' };
  } catch (e: any) {
    return { success: false, error: `Atlas Cloud 调用失败: ${e.message}` };
  }
}
