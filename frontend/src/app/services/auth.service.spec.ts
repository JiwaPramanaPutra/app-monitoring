import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let fetchMock: any;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('stores token and user after a successful login', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: 'jwt-123',
        user: { username: 'admin', name: 'Administrator', role: 'EOS' }
      })
    });

    await service.login('admin', 'secret');

    expect(service.token).toBe('jwt-123');
    expect(service.user?.role).toBe('EOS');
    expect(service.isAuthenticated).toBe(true);
    expect(service.isClient).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('throws and keeps the session empty on failed login', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Nama pengguna atau kata sandi salah.' })
    });

    await expect(service.login('admin', 'wrong')).rejects.toThrow('Nama pengguna atau kata sandi salah.');
    expect(service.token).toBeNull();
    expect(service.isAuthenticated).toBe(false);
  });

  it('clears the session on logout', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: 'jwt-456',
        user: { username: 'viewer', name: 'Viewer', role: 'Client' }
      })
    });

    await service.login('viewer', 'secret');
    expect(service.isClient).toBe(true);

    service.logout();
    expect(service.token).toBeNull();
    expect(service.user).toBeNull();
  });
});
