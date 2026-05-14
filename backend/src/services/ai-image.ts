// AI Image Processing Service
// Layered model architecture:
// - Cloudflare Flux-2-dev: General purpose (style transfer, background, upscale, color)
// - PicWish API: Precise removal (watermark, text, objects)
// - DashScope (通义万相): Face swap, ID photo, fine editing

import { Env, AiTaskResult } from '../types';
import { TelegramService } from './telegram';

export class AiImageService {
  private env: Env;
  private tg: TelegramService;

  constructor(env: Env) {
    this.env = env;
    this.tg = new TelegramService(env);
  }

  /**
   * Process image based on prompt - automatically selects the best AI model
   */
  async processImage(
    sourceFileIds: string[],
    prompt: string
  ): Promise<AiTaskResult> {
    const promptLower = prompt.toLowerCase();

    // Step 1: Determine which AI model to use based on prompt keywords
    const useCase = this.classifyImageUseCase(promptLower);

    try {
      switch (useCase) {
        case 'remove':
          return await this.handleRemoval(sourceFileIds, prompt);
        case 'face':
        case 'idphoto':
          return await this.handleFaceEditing(sourceFileIds, prompt);
        case 'style':
        case 'background':
        case 'upscale':
        case 'color':
        default:
          return await this.handleGeneralEditing(sourceFileIds, prompt);
      }
    } catch (error) {
      return {
        success: false,
        error: `AI processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Classify the image editing use case from natural language prompt
   */
  private classifyImageUseCase(prompt: string): string {
    const removeKeywords = ['去除', '删除', '消除', '抹掉', '去掉', '水印', 'logo', '文字', '多余', '杂物', '路人',
      'remove', 'delete', 'erase', 'watermark', 'text', 'object', 'clean'];
    const faceKeywords = ['换脸', '人脸', '面部', '五官', 'face', 'facial', 'swap face'];
    const idPhotoKeywords = ['证件照', '换底色', '红底', '蓝底', '白底', 'id photo', 'passport', 'background color'];
    const styleKeywords = ['风格', '动漫', '古风', '赛博', '卡通', '写实', 'style', 'anime', 'cartoon', 'cyber'];
    const bgKeywords = ['背景', '换背景', 'background', 'replace background', 'transparent'];
    const upscaleKeywords = ['放大', '无损', '高清', '修复', '扩图', 'upscale', 'enhance', 'hd', 'restore'];
    const colorKeywords = ['调色', '滤镜', '颜色', '饱和度', '对比度', '亮度', '黑白', '复古', '清新',
      'color', 'filter', 'saturation', 'contrast', 'brightness', 'vintage', 'black and white'];

    const score = (keywords: string[]) =>
      keywords.filter(k => prompt.includes(k)).length;

    const scores: [string, number][] = [
      ['remove', score(removeKeywords)],
      ['face', score(faceKeywords)],
      ['idphoto', score(idPhotoKeywords)],
      ['style', score(styleKeywords)],
      ['background', score(bgKeywords)],
      ['upscale', score(upscaleKeywords)],
      ['color', score(colorKeywords)],
    ];

    scores.sort((a, b) => b[1] - a[1]);
    return scores[0][1] > 0 ? scores[0][0] : 'general';
  }

  /**
   * Handle removal tasks (watermark, text, objects) via PicWish
   */
  private async handleRemoval(sourceFileIds: string[], prompt: string): Promise<AiTaskResult> {
    const apiKey = this.env.PICWISH_API_KEY || this.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      // Fallback to Cloudflare AI if no external API key
      return this.handleGeneralEditing(sourceFileIds, prompt);
    }

    try {
      // Download file from Telegram
      const fileUrl = await this.tg.getFileUrl(sourceFileIds[0]);
      if (!fileUrl) {
        return { success: false, error: 'Failed to get source file' };
      }

      // Try PicWish API for removal
      const resp = await fetch('https://api.picwish.com/v1/remove/watermark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          url: fileUrl,
        }),
      });

      if (!resp.ok) {
        return this.handleGeneralEditing(sourceFileIds, prompt);
      }

      const result = await resp.arrayBuffer();
      const tgInfo = await this.tg.uploadFile(result, 'removed.png', 'image/png');

      return {
        success: !!tgInfo,
        file_id: tgInfo?.file_id,
        file_path: tgInfo?.file_path,
        error: tgInfo ? undefined : 'Upload failed',
      };
    } catch {
      return this.handleGeneralEditing(sourceFileIds, prompt);
    }
  }

  /**
   * Handle face editing / ID photo via DashScope (通义万相)
   */
  private async handleFaceEditing(sourceFileIds: string[], prompt: string): Promise<AiTaskResult> {
    const apiKey = this.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return this.handleGeneralEditing(sourceFileIds, prompt);
    }

    try {
      const fileUrl = await this.tg.getFileUrl(sourceFileIds[0]);
      if (!fileUrl) {
        return { success: false, error: 'Failed to get source file' };
      }

      // Call DashScope (通义万相) API for face editing
      const resp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: 'wanx2.1-t2i-turbo',
          input: {
            prompt: prompt,
            image_url: fileUrl,
          },
          parameters: {
            size: '1024*1024',
            n: 1,
          },
        }),
      });

      const data = await resp.json() as any;
      if (data.output?.task_id) {
        // Poll for async result
        const result = await this.pollDashScope(data.output.task_id, apiKey);
        if (result) {
          const imgResp = await fetch(result);
          const imgBuffer = await imgResp.arrayBuffer();
          const tgInfo = await this.tg.uploadFile(imgBuffer, 'face_edit.png', 'image/png');
          return {
            success: !!tgInfo,
            file_id: tgInfo?.file_id,
          };
        }
      }

      return this.handleGeneralEditing(sourceFileIds, prompt);
    } catch {
      return this.handleGeneralEditing(sourceFileIds, prompt);
    }
  }

  /**
   * Poll DashScope async task for result
   */
  private async pollDashScope(taskId: string, apiKey: string, maxRetries = 30): Promise<string | null> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const resp = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const data = await resp.json() as any;
      if (data.output?.task_status === 'SUCCEEDED') {
        return data.output?.results?.[0]?.url || null;
      }
      if (data.output?.task_status === 'FAILED') {
        return null;
      }
    }
    return null;
  }

  /**
   * Handle general editing via Cloudflare Workers AI (Flux-2-dev)
   */
  private async handleGeneralEditing(sourceFileIds: string[], prompt: string): Promise<AiTaskResult> {
    try {
      let imageBuffer: ArrayBuffer | null = null;

      // Get source image
      if (sourceFileIds.length > 0) {
        const fileUrl = await this.tg.getFileUrl(sourceFileIds[0]);
        if (fileUrl) {
          const resp = await fetch(fileUrl);
          if (resp.ok) {
            imageBuffer = await resp.arrayBuffer();
          }
        }
      }

      // Use Cloudflare Workers AI
      const inputs: Record<string, any> = {
        prompt: prompt,
      };

      if (imageBuffer) {
        // For image-to-image tasks, pass the image as a base64 data URL
        const base64 = btoa(
          new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        inputs.image = `data:image/png;base64,${base64}`;
      }

      // Try Flux-2-dev model
      const result = await this.env.AI.run('@cf/black-forest-labs/flux-1-schnell', inputs) as any;

      // Convert result to buffer and upload to TG
      let outputBuffer: ArrayBuffer;

      if (result.image) {
        // Base64 encoded image
        const base64Data = result.image.replace(/^data:image\/\w+;base64,/, '');
        outputBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
      } else if (result instanceof Response) {
        outputBuffer = await result.arrayBuffer();
      } else {
        return { success: false, error: 'Unexpected AI response format' };
      }

      const tgInfo = await this.tg.uploadFile(outputBuffer, 'edited_image.png', 'image/png');
      if (!tgInfo) {
        // Try uploading as document instead
        const docInfo = await this.tg.uploadFile(outputBuffer, 'edited_image.png', 'application/octet-stream');
        return {
          success: !!docInfo,
          file_id: docInfo?.file_id,
          error: docInfo ? undefined : 'Upload failed after AI processing',
        };
      }

      return {
        success: true,
        file_id: tgInfo.file_id,
      };
    } catch (error) {
      return {
        success: false,
        error: `General AI editing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
