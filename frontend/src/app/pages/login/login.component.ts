import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

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
  isLoading = false;

  constructor(private router: Router, private auth: AuthService) {}

  async onLogin() {
    if (!this.username || !this.password || this.isLoading) return;

    this.isLoading = true;
    this.errorMsg = '';
    try {
      await this.auth.login(this.username, this.password);
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      this.errorMsg = err?.message || 'Gagal masuk. Coba lagi.';
    } finally {
      this.isLoading = false;
    }
  }
}
