// Telegram Bot File Storage Service
// Handles all file uploads, downloads, and proxy serving via Telegram Bot API

import { Env, TgFileInfo } from '../types';

const TG_API_BASE = 'https://api.telegram.org/bot';

export class TelegramService {
  private botToken: string;
  private chatId: string;

  constructor(env: Env) {
    this.botToken = env.TELEGRAM_BOT_TOKEN;
    this.chatId = env.TELEGRAM_CHAT_ID;
  }

  private get apiBase(): string {
    return `${TG_API_BASE}${this.botToken}`;
  }

  /**
   * Upload file to Telegram channel
   * Supports: photo, video, document (for other file types)
   */
  async uploadFile(
    fileBuffer: ArrayBuffer | Uint8Array,
    fileName: string,
    mimeType: string
  ): Promise<TgFileInfo | null> {
    try {
      const blob = new Blob([fileBuffer], { type: mimeType });
      const formData = new FormData();
      formData.append('chat_id', this.chatId);

      // Determine the correct method based on mime type
      if (mimeType.startsWith('video/')) {
        formData.append('video', blob, fileName);
      } else if (mimeType.startsWith('image/')) {
        formData.append('photo', blob, fileName);
      } else {
        formData.append('document', blob, fileName);
      }

      const resp = await fetch(`${this.apiBase}/sendVideo`, {
        method: 'POST',
        body: formData,
      });

      // If video fails, try as document
      if (!resp.ok && mimeType.startsWith('video/')) {
        const docFormData = new FormData();
        docFormData.append('chat_id', this.chatId);
        docFormData.append('document', blob, fileName);
        const docResp = await fetch(`${this.apiBase}/sendDocument`, {
          method: 'POST',
          body: docFormData,
        });
        if (!docResp.ok) return null;

        const docData = await docResp.json() as any;
        if (!docData.ok) return null;

        const doc = docData.result.document;
        return {
          file_id: doc.file_id,
          file_unique_id: doc.file_unique_id,
          file_size: doc.file_size,
          mime_type: doc.mime_type,
        };
      }

      if (!resp.ok) {
        // Try as photo for images
        if (mimeType.startsWith('image/')) {
          const imgFormData = new FormData();
          imgFormData.append('chat_id', this.chatId);
          imgFormData.append('photo', blob, fileName);
          const imgResp = await fetch(`${this.apiBase}/sendPhoto`, {
            method: 'POST',
            body: imgFormData,
          });
          if (!imgResp.ok) return null;

          const imgData = await imgResp.json() as any;
          if (!imgData.ok) return null;

          // For photos, TG returns array of sizes - use the largest
          const photoSizes = imgData.result.photo;
          const largest = photoSizes[photoSizes.length - 1];
          return {
            file_id: largest.file_id,
            file_unique_id: largest.file_unique_id,
            file_size: largest.file_size,
          };
        }
        return null;
      }

      const data = await resp.json() as any;
      if (!data.ok) return null;

      const video = data.result.video || data.result.document;
      return {
        file_id: video?.file_id || data.result.document?.file_id,
        file_unique_id: video?.file_unique_id || data.result.document?.file_unique_id,
        file_size: video?.file_size || data.result.document?.file_size,
        mime_type: video?.mime_type || data.result.document?.mime_type,
      };
    } catch (error) {
      console.error('TG upload error:', error);
      return null;
    }
  }

  /**
   * Get file download path from Telegram
   */
  async getFilePath(fileId: string): Promise<string | null> {
    try {
      const resp = await fetch(`${this.apiBase}/getFile?file_id=${fileId}`);
      const data = await resp.json() as any;
      if (!data.ok) return null;
      return data.result.file_path;
    } catch {
      return null;
    }
  }

  /**
   * Get direct download URL for a TG file
   */
  async getFileUrl(fileId: string): Promise<string | null> {
    const filePath = await this.getFilePath(fileId);
    if (!filePath) return null;
    return `${TG_API_BASE}${this.botToken}/${filePath}`;
  }

  /**
   * Proxy file from Telegram - used for frontend preview/download
   */
  async proxyFile(fileId: string): Promise<Response | null> {
    const filePath = await this.getFilePath(fileId);
    if (!filePath) return null;

    const fileUrl = `${TG_API_BASE}${this.botToken}/${filePath}`;
    const resp = await fetch(fileUrl);

    if (!resp.ok) return null;

    // Proxy the response with proper CORS headers
    const headers = new Headers(resp.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');

    return new Response(resp.body, {
      status: resp.status,
      headers,
    });
  }

  /**
   * Send a text message to the channel (for logging/debug)
   */
  async sendMessage(text: string): Promise<boolean> {
    try {
      const resp = await fetch(`${this.apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
        }),
      });
      const data = await resp.json() as any;
      return data.ok === true;
    } catch {
      return false;
    }
  }

  /**
   * Compress file if it exceeds TG's 50MB limit
   */
  async compressIfNeeded(buffer: ArrayBuffer, maxSize: number = 50 * 1024 * 1024): Promise<ArrayBuffer> {
    if (buffer.byteLength <= maxSize) return buffer;

    // Simple compression: if over 50MB, we return as-is and let the service handle it
    // In production, you'd use FFmpeg WASM for video compression
    // For now, we reject files that are too large
    throw new Error(`File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB > 50MB limit`);
  }
}
