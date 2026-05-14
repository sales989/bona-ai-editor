// Admin Routes - User management, API config, system settings

import { Router, Request as IttyRequest } from 'itty-router';
import { Env, JwtPayload } from '../types';
import { DatabaseService } from '../services/d1';
import { AuthUtils } from '../utils/auth';

export function createAdminRoutes(router: Router, env: Env) {
  const db = new DatabaseService(env);
  const auth = new AuthUtils(env);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Admin middleware
  function checkAdmin(user: JwtPayload | undefined): boolean {
    return user?.role === 'admin';
  }

  // ====== User Management ======

  // List users
  router.get('/api/admin/users', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const users = await db.listUsers();
    return new Response(JSON.stringify({ success: true, data: users }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });

  // Create user
  router.post('/api/admin/users', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const { username, password, role } = await request.json() as any;

      if (!username || !password) {
        return new Response(JSON.stringify({ success: false, error: '用户名和密码不能为空' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const existing = await db.getUserByUsername(username);
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '用户名已存在' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const passwordHash = await auth.hashPassword(password);
      const userId = AuthUtils.generateId('u_');
      const success = await db.createUser(userId, username, passwordHash, role || 'user');

      return new Response(JSON.stringify({
        success,
        data: success ? { id: userId, username, role: role || 'user' } : undefined,
        error: success ? undefined : '创建用户失败',
      }), {
        status: success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '创建用户失败' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // Update user status (enable/disable)
  router.put('/api/admin/users/:id/status', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const userId = request.params?.id;
      const { status } = await request.json() as any;

      if (!userId || status === undefined) {
        return new Response(JSON.stringify({ success: false, error: '缺少必要参数' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Cannot disable yourself
      if (userId === user.userId && status === 0) {
        return new Response(JSON.stringify({ success: false, error: '不能禁用自己' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const success = await db.updateUserStatus(userId, status);
      return new Response(JSON.stringify({
        success,
        error: success ? undefined : '更新状态失败',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ success: false, error: '更新状态失败' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // Reset user password
  router.put('/api/admin/users/:id/password', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const userId = request.params?.id;
      const { password } = await request.json() as any;

      if (!userId || !password) {
        return new Response(JSON.stringify({ success: false, error: '缺少必要参数' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const passwordHash = await auth.hashPassword(password);
      const success = await db.updateUserPassword(userId, passwordHash);
      return new Response(JSON.stringify({
        success,
        error: success ? undefined : '重置密码失败',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ success: false, error: '重置密码失败' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // Delete user
  router.delete('/api/admin/users/:id', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = request.params?.id;
    if (userId === user.userId) {
      return new Response(JSON.stringify({ success: false, error: '不能删除自己' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const success = await db.deleteUser(userId!);
    return new Response(JSON.stringify({
      success,
      error: success ? undefined : '删除用户失败',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });

  // ====== API Config Management ======

  // List API configs (masked keys)
  router.get('/api/admin/api-configs', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const configs = await db.listApiConfigs();
    // Mask API keys - show only last 4 chars
    const masked = configs.map(c => ({
      ...c,
      api_key: c.api_key ? `${c.api_key.slice(0, 4)}...${c.api_key.slice(-4)}` : '',
    }));

    return new Response(JSON.stringify({ success: true, data: masked }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });

  // Save API config
  router.put('/api/admin/api-configs/:provider', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const provider = request.params?.provider;
      const { api_key } = await request.json() as any;

      if (!provider || !api_key) {
        return new Response(JSON.stringify({ success: false, error: '缺少必要参数' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const configId = `cfg_${provider}`;
      const success = await db.saveApiConfig(configId, provider, api_key);
      return new Response(JSON.stringify({
        success,
        error: success ? undefined : '保存配置失败',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // ====== Stats ======
  router.get('/api/admin/stats', async (request: IttyRequest) => {
    const user = (request as any).user as JwtPayload;
    if (!checkAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stats = await db.getStats();
    return new Response(JSON.stringify({ success: true, data: stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });

  return router;
}
