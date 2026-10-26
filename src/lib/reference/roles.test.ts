import { describe, expect, it } from 'vitest';
import { roleLabel } from '@/lib/reference/roles';

describe('roleLabel (01-PRD §3.1)', () => {
  it('donne le libellé d’un rôle connu', () => {
    expect(roleLabel('cga_manager')).toBe('Gérant');
    expect(roleLabel('member_owner')).toBe('Accès principal');
  });

  it('affiche tel quel un rôle que cette version ne connaît pas encore', () => {
    expect(roleLabel('role_futur')).toBe('role_futur');
  });
});
