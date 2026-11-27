import { describe, expect, it } from 'vitest';
import { isFinished, listPermission } from '@/features/exports/api/exports-api';
import { exportRoutes } from '@/features/exports/lib/routes';

/*
 * Droit de chaque liste exportée par espace (RG-SEC-06, `ExportType::permissionIn`), fin d'un export et
 * adresses de « Mes exports » (liens de `ExportReadyNotification`).
 */
describe('exports-api (8.6, F-EXP-01)', () => {
  it('RG-SEC-06 : droit de la liste exportée, dans son seul espace', () => {
    expect(listPermission('cga', 'members')).toBe('members.view');
    expect(listPermission('cga', 'concerns')).toBe('concerns.reply');
    expect(listPermission('cga', 'obligations')).toBe('obligations.manage');
    expect(listPermission('cga', 'training_registrations')).toBe('trainings.cga.manage');
    expect(listPermission('network', 'training_registrations')).toBe('trainings.network.manage');
    expect(listPermission('network', 'network_concerns')).toBe('network_concerns.view');
    expect(listPermission('network', 'dues')).toBe('dues.view');
    expect(listPermission('network', 'statistics')).toBe('statistics.national.view');

    // Une liste d'un autre espace n'existe pas : pas de bouton.
    expect(listPermission('network', 'members')).toBeNull();
    expect(listPermission('cga', 'dues')).toBeNull();
    expect(listPermission('cga', 'statistics')).toBeNull();
  });

  it('un export est fini quand il est prêt ou en échec', () => {
    expect(isFinished({ status: 'done' })).toBe(true);
    expect(isFinished({ status: 'failed' })).toBe(true);
    expect(isFinished({ status: 'queued' })).toBe(false);
    expect(isFinished({ status: 'processing' })).toBe(false);
    expect(isFinished(undefined)).toBe(false);
  });

  it('« Mes exports » aux adresses de la notification « Export prêt »', () => {
    expect(exportRoutes.list('network')).toBe('/cncga/exports');
    expect(exportRoutes.detail('cga', '01exp1')).toBe('/cga/exports/01exp1');
    expect(exportRoutes.detail('network', '01exp1')).toBe('/cncga/exports/01exp1');
  });
});
