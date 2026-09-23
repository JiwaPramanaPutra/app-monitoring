import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Satu pintu untuk semua panggilan API dari komponen:
 * - menempelkan header Authorization dari sesi aktif
 * - membersihkan sesi dan redirect ke /login saat 401
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  constructor(private auth: AuthService, private router: Router) {}

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers || {});
    const token = this.auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(path, { ...init, headers });

    if (res.status === 401) {
      this.auth.logout();
      this.router.navigate(['/login']);
    }
    return res;
  }

  /** Unduh file dari endpoint API yang butuh token (mis. export CSV). */
  async download(path: string): Promise<void> {
    const res = await this.fetch(path);
    if (!res.ok) {
      throw new Error(`Gagal mengunduh (HTTP ${res.status}).`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1] : 'download';

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
