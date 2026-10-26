import { describe, expect, it } from 'vitest';
import type { Membership } from '@/features/auth/api/auth-api';
import {
  cgaMenu,
  cncgaMenu,
  memberMenu,
  menuFor,
  visibleEntries,
  type MenuEntry,
} from '@/features/navigation/menu';
import { fr } from '@/lib/i18n/fr';
import { defaultRolePermissions } from '@/lib/reference/default-permissions';
import { permissionCodes } from '@/lib/reference/permissions';

function membership(role: string, banking = false): Membership {
  const type = role.startsWith('cncga_') ? 'cncga' : role === 'platform_admin' ? 'platform' : 'cga';

  return {
    id: `m-${role}`,
    role,
    organization: { id: 'org-1', type, name: 'DC-KNOWING CGA', banking_enabled: banking },
    member: role.startsWith('member_') ? { id: 'mem-1', name: 'INC SARL' } : null,
    unread_notifications: 0,
  };
}

const grants = (permissions: readonly string[]) => (permission: string) =>
  permissions.includes(permission);

/** Libellés du menu d'un rôle avec ses droits par défaut, ceux que `/me` renvoie sans ajustement. */
function menuOf(role: string, entries: MenuEntry[], banking = false): string[] {
  return visibleEntries(
    entries,
    grants(defaultRolePermissions[role]),
    membership(role, banking),
  ).map((entry) => entry.label);
}

const nav = fr.nav;

describe('Menus des espaces (03-APPFLOW §3.1, §4.1, §5.1)', () => {
  it('donne à chaque espace son menu, et aucun à l’espace plateforme', () => {
    expect(menuFor(membership('cncga_president'))).toBe(cncgaMenu);
    expect(menuFor(membership('cga_manager'))).toBe(cgaMenu);
    expect(menuFor(membership('member_owner'))).toBe(memberMenu);
    expect(menuFor(membership('platform_admin'))).toEqual([]);
    expect(menuFor(membership('role_futur'))).toEqual([]);
  });

  it('chaque droit lu par un menu existe dans le catalogue du backend', () => {
    const catalog = new Set(Object.values(defaultRolePermissions).flat());
    const used = [...cncgaMenu, ...cgaMenu, ...memberMenu].flatMap(
      (entry) => entry.permissions ?? [],
    );

    expect(used.filter((permission) => !catalog.has(permission))).toEqual([]);
  });

  it('RG-ROLE-07 · le menu suit les droits effectifs renvoyés par /me, pas le rôle', () => {
    const manager = membership('cga_manager');
    const labels = (permissions: readonly string[]) =>
      visibleEntries(cgaMenu, grants(permissions), manager).map((entry) => entry.label);
    // Un gérant à qui l'on aurait retiré la fiche du centre et les utilisateurs ne voit plus les
    // paramètres (ni la cotisation, qui suit la fiche du centre).
    const adjusted = defaultRolePermissions.cga_manager.filter(
      (permission) =>
        permission !== permissionCodes.cga.profile && permission !== permissionCodes.cga.users,
    );

    expect(labels(defaultRolePermissions.cga_manager)).toContain(nav.settings);
    expect(labels(adjusted)).not.toContain(nav.settings);
    expect(labels(adjusted)).not.toContain(nav.dues);
  });

  it('le tableau de bord reste ouvert à tous les rôles de l’espace, même sans droit', () => {
    expect(visibleEntries(cgaMenu, grants([]), membership('cga_manager'))).toHaveLength(1);
    expect(visibleEntries(cncgaMenu, grants([]), membership('cncga_viewer'))[0].label).toBe(
      nav.dashboard,
    );
  });
});

describe('Menu CGA de chaque rôle, droits par défaut du backend (03-APPFLOW §4.1)', () => {
  it('gérant : tout le menu, la bancabilité quand le module est activé', () => {
    expect(menuOf('cga_manager', cgaMenu)).toEqual([
      nav.dashboard,
      nav.members,
      nav.deadlines,
      nav.closing,
      nav.report,
      nav.invoices,
      nav.concerns,
      nav.trainings,
      nav.communications,
      nav.dues,
      nav.internal,
      nav.statistics,
      nav.settings,
    ]);
    expect(menuOf('cga_manager', cgaMenu, true)).toContain(nav.bankability);
  });

  it.each(['cga_accountant', 'cga_legal', 'cga_tax_advisor'])(
    '%s : sans Cotisation, Gestion interne ni Paramètres',
    (role) => {
      const menu = menuOf(role, cgaMenu);

      expect(menu).toEqual(
        expect.arrayContaining([nav.members, nav.deadlines, nav.invoices, nav.communications]),
      );
      expect(menu).not.toContain(nav.dues);
      expect(menu).not.toContain(nav.internal);
      expect(menu).not.toContain(nav.settings);
    },
  );

  it('secrétaire : sans Communications, Cotisation, Gestion interne ni Paramètres', () => {
    const menu = menuOf('cga_secretary', cgaMenu);

    expect(menu).toEqual(expect.arrayContaining([nav.members, nav.closing, nav.report]));
    for (const hidden of [nav.communications, nav.dues, nav.internal, nav.settings]) {
      expect(menu).not.toContain(hidden);
    }
  });

  it('chargé des cotisations et honoraires : Tableau de bord, Adhérents, Échéances, Factures', () => {
    expect(menuOf('cga_billing_officer', cgaMenu)).toEqual([
      nav.dashboard,
      nav.members,
      nav.deadlines,
      nav.invoices,
    ]);
  });

  it('formateur : Tableau de bord, Adhérents, Formations', () => {
    expect(menuOf('cga_trainer', cgaMenu)).toEqual([nav.dashboard, nav.members, nav.trainings]);
  });
});

describe('Menu CNCGA de chaque rôle, droits par défaut du backend (03-APPFLOW §3.1)', () => {
  it('Présidente : tout le menu CNCGA', () => {
    expect(menuOf('cncga_president', cncgaMenu)).toEqual(cncgaMenu.map((entry) => entry.label));
  });

  it('bureau (consultation) : lecture, sans Paramètres', () => {
    const menu = menuOf('cncga_viewer', cncgaMenu);

    expect(menu).toEqual(
      expect.arrayContaining([nav.cncgaMembers, nav.cncgaDues, nav.cncgaReports]),
    );
    expect(menu).not.toContain(nav.settings);
  });

  it('responsable des cotisations : Cotisations ; responsable des formations : Formations et Communications', () => {
    expect(menuOf('cncga_dues', cncgaMenu)).toContain(nav.cncgaDues);
    expect(menuOf('cncga_dues', cncgaMenu)).not.toContain(nav.cncgaTrainings);
    expect(menuOf('cncga_training', cncgaMenu)).toEqual(
      expect.arrayContaining([nav.cncgaTrainings, nav.communications]),
    );
    expect(menuOf('cncga_training', cncgaMenu)).not.toContain(nav.cncgaDues);
  });
});

describe('Menu de l’adhérent (03-APPFLOW §5.1)', () => {
  it('RG-BNK-00 · « Ma bancabilité » n’apparaît que si le CGA a activé le module', () => {
    expect(menuOf('member_owner', memberMenu)).toEqual([
      nav.home,
      nav.obligations,
      nav.documents,
      nav.messages,
      nav.trainings,
    ]);
    expect(menuOf('member_owner', memberMenu, true)).toContain(nav.myBankability);
    expect(menuOf('member_user', memberMenu, true)).toContain(nav.myBankability);
  });

  it('RG-BNK-00 · la bancabilité du CGA suit la même activation', () => {
    expect(menuOf('cga_manager', cgaMenu)).not.toContain(nav.bankability);
  });
});
