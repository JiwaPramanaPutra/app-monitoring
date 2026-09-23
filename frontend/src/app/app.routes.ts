import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { AuthService } from './services/auth.service';

/** Halaman privat: wajib punya sesi. */
const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated ? true : router.parseUrl('/login');
};

/** Halaman login: sesi aktif langsung dialihkan ke dashboard. */
const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated ? router.parseUrl('/dashboard') : true;
};

/** Halaman manajemen: hanya role EOS. Client dialihkan ke dashboard. */
const eosGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated) return router.parseUrl('/login');
  return auth.isClient ? router.parseUrl('/dashboard') : true;
};

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent, canActivate: [loginGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'monitoring', loadComponent: () => import('./pages/monitoring/monitoring.component').then(m => m.MonitoringComponent), canActivate: [authGuard] },
  { path: 'laporan-trafik', loadComponent: () => import('./pages/laporan-trafik/laporan-trafik.component').then(m => m.LaporanTrafikComponent), canActivate: [authGuard] },
  { path: 'laporan', loadComponent: () => import('./pages/laporan/laporan.component').then(m => m.LaporanComponent), canActivate: [authGuard] },
  { path: 'project-site', loadComponent: () => import('./pages/project-site/project-site.component').then(m => m.ProjectSiteComponent), canActivate: [eosGuard] }
];
