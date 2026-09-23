import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  currentUser: { name: string; role: 'EOS' | 'Client'; initials: string } = {
    name: 'Pengguna',
    role: 'Client',
    initials: 'P'
  };

  constructor(private router: Router, private auth: AuthService) {
    const user = this.auth.user;
    if (user) {
      this.currentUser = {
        name: user.name,
        role: user.role,
        initials: this.initialsOf(user.name)
      };
    }
  }

  get isClient(): boolean {
    return this.auth.isClient;
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private initialsOf(name: string): string {
    const initials = (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
    return initials || 'P';
  }
}
