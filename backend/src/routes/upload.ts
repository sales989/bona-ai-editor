// Upload Routes - Handle file uploads and store in TG

import { Router, Request as IttyRequest } from 'itty-router';
import { Env, JwtPayload } from '../types';
import { TelegramService } from '../services/telegram';

export function createUploadRoutes(router: Router, env: Env) {
  const tg = new TelegramService(env);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Upload files (single or multiple)
  router.post('/api/upload', async (request: IttyRequest) => {
    try {
      const user = (request as any).user as JwtPayload;
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未登录' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const formData = await request.formData();
      const files = formData.getAll('files') as File[];
      const fileIds: string[] = [];

      if (!files || files.length === 0) {
        return new Response(JSON.stringify({ success: false, error: '请上传文件' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const mimeType = file.type || 'application/octet-stream';

        // Check TG 50MB limit
        if (buffer.byteLength > 50 * 1024 * 1024) {
          return new Response(JSON.stringify({
            success: false,
            error: `文件 ${file.name} 超过50MB限制，请压缩后上传`,
          }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const tgInfo = await tg.uploadFile(buffer, file.name, mimeType);
        if (tgInfo && tgInfo.file_id) {
          fileIds.push(tgInfo.file_id);
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: `上传文件 ${file.name} 失败`,
          }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          file_ids: fileIds,
          count: fileIds.length,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: `上传失败: ${error instanceof Error ? error.message : '未知错误'}`,
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });

  return router;
}
