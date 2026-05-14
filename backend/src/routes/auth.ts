// Auth Routes - Login, Logout, Current User

import { Router, Request as IttyRequest } from 'itty-router';
import { Env, JwtPayload, ApiResponse } from '../types';
import { DatabaseService } from '../services/d1';
import { AuthUtils } from '../utils/auth';

export function createAuthRoutes(router: Router, env: Env) {
  const db = new DatabaseService(env);
  const auth = new AuthUtils(env);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Login
  router.post('/api/auth/login', async (request: IttyRequest) => {
    try {
      const { username, password } = await request.json() as any;

      if (!username || !password) {
        return new Response(JSON.stringify({ success: false, error: '请输入用户名和密码' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const user = await db.getUserByUsername(username);
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: '用户名或密码错误' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (user.status === 0) {
        return new Response(JSON.stringify({ success: false, error: '账号已被禁用，请联系管理员' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const valid = await auth.verifyPassword(password, user.password_hash);
      if (!valid) {
        return new Response(JSON.stringify({ success: false, error: '用户名或密码错误' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        role: user.role as 'user' | 'admin',
      };

      const token = await auth.generateToken(payload);

      // Store session in KV
      await env.SESSION_KV.put(token, JSON.stringify(payload), { expirationTtl: 86400 });

      return new Response(JSON.stringify({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
          },
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '登录失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // Logout
  router.post('/api/auth/logout', async (request: IttyRequest) => {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      await env.SESSION_KV.delete(authHeader.slice(7));
    }
    return new Response(JSON.stringify({ success: true, message: '已退出登录' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });

  // Get current user
  router.get('/api/auth/me', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: '未登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true, data: user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });

  return router;
}
