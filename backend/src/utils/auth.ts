// Auth Utilities - JWT + Password Hashing

import { Env, JwtPayload } from '../types';

// Simple crypto-based password hashing (no bcryptjs dependency in Workers)
export class AuthUtils {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Hash password using SHA-256 with salt
   */
  async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + this.env.JWT_SECRET);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashPassword(password);
    return computedHash === hash;
  }

  /**
   * Generate JWT token
   */
  async generateToken(payload: JwtPayload): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + parseInt(this.env.JWT_EXPIRES_IN || '86400');

    const tokenPayload = {
      ...payload,
      iat: now,
      exp,
    };

    const base64Encode = (obj: any) =>
      btoa(JSON.stringify(obj))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const headerB64 = base64Encode(header);
    const payloadB64 = base64Encode(tokenPayload);
    const signature = await this.hmacSha256(
      `${headerB64}.${payloadB64}`,
      this.env.JWT_SECRET
    );

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [headerB64, payloadB64, signature] = parts;

      // Verify signature
      const expectedSig = await this.hmacSha256(
        `${headerB64}.${payloadB64}`,
        this.env.JWT_SECRET
      );
      if (signature !== expectedSig) return null;

      // Decode payload
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

      // Check expiry
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

      return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      };
    } catch {
      return null;
    }
  }

  private async hmacSha256(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Generate a unique ID
   */
  static generateId(prefix: string = ''): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}${timestamp}${random}`;
  }
}
