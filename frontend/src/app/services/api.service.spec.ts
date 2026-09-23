import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

describe('ApiService', () => {
  let service: ApiService;
  let auth: AuthService;
  let router: any;
  let fetchMock: any;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    });
    vi.stubGlobal('fetch', fetchMock);
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: router }]
    });
    service = TestBed.inject(ApiService);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('attaches the Bearer token from the active session', async () => {
    localStorage.setItem('auth_token', 'jwt-abc');

    await service.fetch('/api/devices');

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');
  });

  it('clears the session and redirects to login on 401', async () => {
    localStorage.setItem('auth_token', 'jwt-abc');
    localStorage.setItem('auth_user', JSON.stringify({ username: 'admin', name: 'Administrator', role: 'EOS' }));
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false }) });

    await service.fetch('/api/devices');

    expect(auth.token).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
