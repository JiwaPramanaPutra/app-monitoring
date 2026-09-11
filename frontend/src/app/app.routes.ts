import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'monitoring', loadComponent: () => import('./pages/monitoring/monitoring.component').then(m => m.MonitoringComponent) },
  { path: 'laporan-trafik', loadComponent: () => import('./pages/laporan-trafik/laporan-trafik.component').then(m => m.LaporanTrafikComponent) },
  { path: 'laporan', loadComponent: () => import('./pages/laporan/laporan.component').then(m => m.LaporanComponent) },
  // Halaman Pengguna hanya untuk role EOS
  { path: 'pengguna', loadComponent: () => import('./pages/pengguna/pengguna.component').then(m => m.PenggunaComponent) }
];
