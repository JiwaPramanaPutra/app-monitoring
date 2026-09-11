import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

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

  constructor(private router: Router) {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      this.currentUser = JSON.parse(saved);
    }
  }

  get isClient(): boolean {
    return this.currentUser.role === 'Client';
  }

  logout() {
    localStorage.removeItem('currentUser');
    this.router.navigate(['/login']);
  }
}
