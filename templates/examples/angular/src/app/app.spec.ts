import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL, App } from './app';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('muestra las personas devueltas por la API', async () => {
    const fixture = TestBed.createComponent(App);
    http.expectOne(API_URL).flush([{ id: '1', nombre: 'Ana', apellido: 'Gomez', edad: 30 }]);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ana Gomez');
    expect(el.textContent).toContain('30 anos');
  });

  it('muestra un error si la API falla', async () => {
    const fixture = TestBed.createComponent(App);
    http.expectOne(API_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudo cargar: HTTP 500');
  });
});