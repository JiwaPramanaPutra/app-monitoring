import { Injectable } from '@angular/core';

export interface AuthUser {
  username: string;
  name: string;
  role: 'EOS' | 'Client';
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get user(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  get isClient(): boolean {
    return this.user?.role === 'Client';
  }

  /** Menukar kredensial dengan JWT dari backend. Melempar Error bila gagal. */
  async login(username: string, password: string): Promise<void> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({} as any));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Gagal masuk. Coba lagi.');
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}
