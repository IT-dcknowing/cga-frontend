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

  it.each([
    ['active', 'success', 'Actif'],
    ['suspended', 'danger', 'Suspendu'],
    ['terminated', 'neutral', 'Résilié'],
  ])('CGA « %s » : ton %s, libellé « %s »', (code, tone, label) => {
    expect(describeStatus('organization', code)).toEqual({ tone, label });
  });

  it.each([
    ['pending', 'warning', 'Agrément en cours'],
    ['granted', 'success', 'Agréé'],
    ['withdrawn', 'danger', 'Agrément retiré'],
  ])('RG-ORG-03, F-ORG-07 · agrément « %s » : ton %s, libellé « %s »', (code, tone, label) => {
    expect(describeStatus('agreement', code)).toEqual({ tone, label });
  });

  it('F-ORG-05 · un CGA abonné en vert ; non abonné, en essai ou résilié en gris', () => {
    expect(describeStatus('subscription', 'active')).toEqual({ tone: 'success', label: 'Abonné' });
    expect(describeStatus('subscription', 'trial')).toEqual({ tone: 'neutral', label: 'Essai' });
    expect(describeStatus('subscription', 'terminated').tone).toBe('neutral');
    expect(describeStatus('subscription', 'none')).toEqual({
      tone: 'neutral',
      label: 'Non abonné',
    });
  });

  it('affiche un code inconnu tel quel, en gris', () => {
    expect(describeStatus('member', 'archived')).toEqual({ tone: 'neutral', label: 'archived' });
  });
});
