import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Persona {
  id: string;
  nombre: string;
  apellido: string;
  edad: number;
}

export const API_URL = 'http://localhost:8083/personas';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly apiUrl = API_URL;
  protected readonly personas = signal<Persona[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.http.get<Persona[]>(API_URL).subscribe({
      next: (personas) => {
        this.personas.set(personas);
        this.loading.set(false);
      },
      error: (err: { status?: number; message: string }) => {
        this.error.set(err.status ? `HTTP ${err.status}` : err.message);
        this.loading.set(false);
      },
    });
  }
}