import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('garde une taille de texte et une couleur de la charte ensemble', () => {
    expect(cn('text-body', 'text-ink')).toBe('text-body text-ink');
  });

  it('garde la dernière de deux couleurs de fond de la charte', () => {
    expect(cn('bg-primary', 'bg-danger')).toBe('bg-danger');
  });

  it('garde le dernier de deux arrondis de la charte', () => {
    expect(cn('rounded-control', 'rounded-card')).toBe('rounded-card');
  });

  it('ignore les valeurs fausses', () => {
    expect(cn('p-4', false, undefined, 'font-bold')).toBe('p-4 font-bold');
  });
});
