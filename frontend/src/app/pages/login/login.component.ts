import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Dummy user database — hanya 2 role: EOS dan Client
const DUMMY_USERS: Record<string, { name: string; role: 'EOS' | 'Client'; initials: string }> = {
  'rian': { name: 'Rian Saputra', role: 'EOS', initials: 'RS' },
  'admin': { name: 'Admin EOS', role: 'EOS', initials: 'AE' },
  'budi': { name: 'Budi Santoso', role: 'Client', initials: 'BS' },
  'santi': { name: 'Santi Wijaya', role: 'Client', initials: 'SW' },
  'hendra': { name: 'Dr. Hendra', role: 'Client', initials: 'DH' },
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
    if (user && this.password.length >= 3) {
      // Simpan info user ke localStorage
      localStorage.setItem('currentUser', JSON.stringify(user));
      this.router.navigate(['/dashboard']);
    } else {
      this.errorMsg = 'Nama pengguna atau kata sandi salah.';
    }
  }
}
