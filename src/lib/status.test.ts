import { describe, expect, it } from 'vitest';
import { describeStatus } from '@/lib/status';

describe('describeStatus (04-UX-UI §2.1)', () => {
  it.each([
    ['active', 'success', 'Actif'],
    ['draft', 'warning', 'Brouillon'],
    ['radiation_pending', 'warning', 'Radiation en cours'],
    ['radiated', 'danger', 'Radié'],
    ['closed', 'neutral', 'Clos'],
  ])('adhérent « %s » : ton %s, libellé « %s »', (code, tone, label) => {
    expect(describeStatus('member', code)).toEqual({ tone, label });
  });

  it('affiche les pièces en attente en orange et un dossier complet en vert', () => {
    expect(describeStatus('pieces', 'pending').tone).toBe('warning');
    expect(describeStatus('pieces', 'complete').tone).toBe('success');
  });

  it('affiche les régimes en gris', () => {
    expect(describeStatus('regime', 'RSI')).toEqual({ tone: 'neutral', label: 'RSI' });
  });

  it('affiche un code inconnu tel quel, en gris', () => {
    expect(describeStatus('member', 'archived')).toEqual({ tone: 'neutral', label: 'archived' });
  });
});
