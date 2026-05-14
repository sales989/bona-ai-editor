// BONA AI Editor - Main Entry Point
// Cloudflare Workers backend with D1, KV, Telegram Bot storage

import { Router, error, json } from 'itty-router';
import { Env, JwtPayload } from './types';
import { AuthUtils } from './utils/auth';
import { createAuthRoutes } from './routes/auth';
import { createAdminRoutes } from './routes/admin';
import { createTaskRoutes } from './routes/tasks';
import { createUploadRoutes } from './routes/upload';

// Create fresh router for each worker invocation to prevent route duplication
function createRouter(env: Env) {
  const router = Router();

  // Mount routes
  createAuthRoutes(router, env);
  createAdminRoutes(router, env);
  createTaskRoutes(router, env);
  createUploadRoutes(router, env);

  // CORS preflight handler (catch-all before route matching)
  router.all('*', async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
  });

  // Health check
  router.get('/api/health', () => {
    return new Response(JSON.stringify({
      success: true,
      data: {
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  });

  return router;
}

// Initialize admin account on first run
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
    try {
      // Ensure admin account exists on first request
      ctx.waitUntil(initAdminIfNeeded(env));

      const url = new URL(request.url);

      // Only handle API routes
      if (!url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // Initialize auth utilities
      const auth = new AuthUtils(env);

      // Auth middleware
      const publicPaths = ['/api/health', '/api/auth/login'];
      const isPublic = publicPaths.some(p => url.pathname === p || url.pathname.startsWith(p + '/'));

      if (!isPublic) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ success: false, error: '未授权，请先登录' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        const token = authHeader.slice(7);
        const payload = await auth.verifyToken(token);

        if (!payload) {
          return new Response(JSON.stringify({ success: false, error: '登录已过期，请重新登录' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // Check session in KV
        const session = await env.SESSION_KV.get(token);
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: '会话已失效，请重新登录' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        (request as any).user = payload;
      }

      // Create fresh router and handle
      const router = createRouter(env);
      return await router.handle(request);
    } catch (error) {
      console.error('Unhandled error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '服务器内部错误',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
