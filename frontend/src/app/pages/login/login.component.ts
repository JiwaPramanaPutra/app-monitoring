import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Login mock sementara — digantikan auth backend (JWT) pada fitur berikutnya.
const DUMMY_USERS: Record<string, { name: string; role: 'EOS' | 'Client'; initials: string; pass: string }> = {
  'admin': { name: 'Administrator', role: 'EOS', initials: 'AD', pass: 'admin' },
  'client': { name: 'Viewer', role: 'Client', initials: 'VW', pass: 'client' }
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username = '';
  password = '';
  errorMsg = '';

  constructor(private router: Router) {}

  onLogin() {
    if (!this.username || !this.password) return;

    const user = DUMMY_USERS[this.username.toLowerCase()];
    if (user && this.password === user.pass) {
      // Simpan info user ke localStorage
      localStorage.setItem('currentUser', JSON.stringify(user));
      this.router.navigate(['/dashboard']);
    } else {
      this.errorMsg = 'Nama pengguna atau kata sandi salah.';
    }
  }
}
