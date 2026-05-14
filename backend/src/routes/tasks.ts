// Task Routes - Create, List, View, Download, Re-edit

import { Router, Request as IttyRequest } from 'itty-router';
import { Env, JwtPayload, Task } from '../types';
import { DatabaseService } from '../services/d1';
import { TelegramService } from '../services/telegram';
import { AiImageService } from '../services/ai-image';
import { AiVideoService } from '../services/ai-video';
import { AuthUtils } from '../utils/auth';

export function createTaskRoutes(router: Router, env: Env) {
  const db = new DatabaseService(env);
  const tg = new TelegramService(env);
  const imageService = new AiImageService(env);
  const videoService = new AiVideoService(env);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Create task
  router.post('/api/tasks', async (request: IttyRequest) => {
    try {
      const user = (request as any).user as JwtPayload;
      const { task_type, ai_prompt, source_file_ids } = await request.json() as any;

      if (!task_type || !ai_prompt || !source_file_ids) {
        return new Response(JSON.stringify({ success: false, error: '缺少必要参数' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!['video', 'image'].includes(task_type)) {
        return new Response(JSON.stringify({ success: false, error: '无效的任务类型' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const task: Task = {
        id: AuthUtils.generateId('t_'),
        user_id: user.userId,
        task_type,
        source_file_ids: JSON.stringify(source_file_ids),
        ai_prompt,
        status: 'pending',
        progress: 0,
        result_file_id: null,
        result_file_path: null,
        error_msg: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const saved = await db.createTask(task);
      if (!saved) {
        return new Response(JSON.stringify({ success: false, error: '创建任务失败' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Start processing in background
      env.DB.prepare(
        "UPDATE tasks SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(task.id).run().then(() => {
        this.processTask(env, task);
      });

      return new Response(JSON.stringify({
        success: true,
        data: { task_id: task.id, status: 'pending' },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '创建任务失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // List tasks (with filters)
  router.get('/api/tasks', async (request: IttyRequest) => {
    try {
      const user = (request as any).user as JwtPayload;
      const url = new URL(request.url);
      const taskType = url.searchParams.get('type') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const page = parseInt(url.searchParams.get('page') || '1');
      const pageSize = parseInt(url.searchParams.get('page_size') || '20');

      // Normal users can only see their own tasks
      const userId = user.role === 'admin' ? (url.searchParams.get('user_id') || undefined) : user.userId;

      const result = await db.listTasks(userId, taskType, status, page, pageSize);

      return new Response(JSON.stringify({
        success: true,
        data: result,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '获取任务列表失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // Get task detail
  router.get('/api/tasks/:id', async (request: IttyRequest) => {
    try {
      const user = (request as any).user as JwtPayload;
      const taskId = request.params?.id;

      if (!taskId) {
        return new Response(JSON.stringify({ success: false, error: '缺少任务ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const task = await db.getTaskById(taskId);
      if (!task) {
        return new Response(JSON.stringify({ success: false, error: '任务不存在' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Permission check
      if (user.role !== 'admin' && task.user_id !== user.userId) {
        return new Response(JSON.stringify({ success: false, error: '无权限查看此任务' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, data: task }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '获取任务详情失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // Download/Preview file
  router.get('/api/files/:fileId', async (request: IttyRequest) => {
    try {
      const fileId = request.params?.fileId;
      if (!fileId) {
        return new Response(JSON.stringify({ success: false, error: '缺少文件ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await tg.proxyFile(fileId);
      if (!result) {
        return new Response(JSON.stringify({ success: false, error: '文件不存在' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return result;
    } catch {
      return new Response(JSON.stringify({ success: false, error: '获取文件失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  // Re-edit task
  router.post('/api/tasks/:id/reedit', async (request: IttyRequest) => {
    try {
      const user = (request as any).user as JwtPayload;
      const taskId = request.params?.id;
      const { ai_prompt } = await request.json() as any;

      if (!taskId || !ai_prompt) {
        return new Response(JSON.stringify({ success: false, error: '缺少必要参数' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const originalTask = await db.getTaskById(taskId);
      if (!originalTask) {
        return new Response(JSON.stringify({ success: false, error: '原任务不存在' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (user.role !== 'admin' && originalTask.user_id !== user.userId) {
        return new Response(JSON.stringify({ success: false, error: '无权限' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create new task reusing original source files
      const newTask: Task = {
        id: AuthUtils.generateId('t_'),
        user_id: user.userId,
        task_type: originalTask.task_type,
        source_file_ids: originalTask.source_file_ids,
        ai_prompt,
        status: 'pending',
        progress: 0,
        result_file_id: null,
        result_file_path: null,
        error_msg: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const saved = await db.createTask(newTask);
      if (!saved) {
        return new Response(JSON.stringify({ success: false, error: '创建编辑任务失败' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: { task_id: newTask.id },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '重新编辑失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  return router;
}

// Background task processing
async function processTask(env: Env, task: Task) {
  const db = new DatabaseService(env);
  const imageService = new AiImageService(env);
  const videoService = new AiVideoService(env);

  try {
    await db.updateTaskStatus(task.id, 'processing', 10);

    const sourceFileIds = JSON.parse(task.source_file_ids);
    let result;

    if (task.task_type === 'image') {
      await db.updateTaskStatus(task.id, 'processing', 30);
      result = await imageService.processImage(sourceFileIds, task.ai_prompt);
      await db.updateTaskStatus(task.id, 'processing', 70);
    } else {
      await db.updateTaskStatus(task.id, 'processing', 30);
      result = await videoService.processVideo(sourceFileIds, task.ai_prompt);
      await db.updateTaskStatus(task.id, 'processing', 70);
    }

    if (result.success && result.file_id) {
      await db.updateTaskStatus(task.id, 'success', 100, result.file_id, result.file_path);
    } else {
      await db.updateTaskStatus(task.id, 'failed', undefined, undefined, undefined, result.error || '处理失败');
    }
  } catch (error) {
    await db.updateTaskStatus(task.id, 'failed', undefined, undefined, undefined,
      error instanceof Error ? error.message : '处理异常');
  }
}
