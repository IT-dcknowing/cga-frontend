import { describe, expect, it } from 'vitest';
import { http } from '@/lib/http';

describe('http (02-TRD §6.1)', () => {
  it('vise l’API versionnée du même domaine', () => {
    expect(http.defaults.baseURL).toBe('/api/v1');
  });

  it('envoie le cookie de session et le jeton CSRF de Sanctum', () => {
    expect(http.defaults.withCredentials).toBe(true);
    expect(http.defaults.withXSRFToken).toBe(true);
    expect(http.defaults.xsrfCookieName).toBe('XSRF-TOKEN');
    expect(http.defaults.xsrfHeaderName).toBe('X-XSRF-TOKEN');
  });

  it('demande des réponses JSON', () => {
    expect(http.defaults.headers.Accept).toBe('application/json');
  });
});
