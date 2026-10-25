import { describe, expect, it } from 'vitest';
import type { Membership, Session } from '@/features/auth/api/auth-api';
import {
  activeMembershipOf,
  authRoutes,
  loginDestination,
  loginReturningTo,
  resolveDestination,
  safeReturnPath,
  spaceHomeFor,
  spaceKindOf,
  spaceNameOf,
  spaceRoutes,
} from '@/features/auth/lib/destination';

function membership(role: string, type: Membership['organization']['type']): Membership {
  return {
    id: `m-${role}`,
    role,
    organization: { id: 'org-1', type, name: 'DC-KNOWING CGA', banking_enabled: false },
    member: role.startsWith('member_') ? { id: 'mem-1', name: 'INC SARL' } : null,
    unread_notifications: 0,
  };
}

function session(memberships: Membership[], activeId: string | null): Session {
  return {
    user: {
      first_name: 'Koffi',
      last_name: 'N’Guessan',
      phone: '+2250700000001',
      email: null,
      notification_preferences: { sms: true, whatsapp: false },
    },
    memberships,
    active_membership_id: activeId,
    last_membership_id: null,
    permissions: [],
  };
}

describe('Espaces (03-APPFLOW §1)', () => {
  it('reconnaît l’espace de chaque famille de rôles', () => {
    expect(spaceKindOf(membership('platform_admin', 'platform'))).toBe('platform');
    expect(spaceKindOf(membership('cncga_president', 'cncga'))).toBe('cncga');
    expect(spaceKindOf(membership('cga_manager', 'cga'))).toBe('cga');
    expect(spaceKindOf(membership('member_owner', 'cga'))).toBe('member');
    expect(spaceKindOf(membership('role_futur', 'cga'))).toBeNull();
  });

  it('mène chaque rôle à l’accueil de son espace', () => {
    expect(spaceHomeFor(membership('platform_admin', 'platform'))).toBe(spaceRoutes.platform);
    expect(spaceHomeFor(membership('cncga_president', 'cncga'))).toBe(spaceRoutes.cncga);
    expect(spaceHomeFor(membership('cga_manager', 'cga'))).toBe(spaceRoutes.cga);
    expect(spaceHomeFor(membership('member_owner', 'cga'))).toBe(spaceRoutes.member);
  });

  it('ne devine pas la destination d’un rôle inconnu', () => {
    expect(spaceHomeFor(membership('role_futur', 'cga'))).toBe(authRoutes.chooseSpace);
  });

  it('F-AUTH-04 · nomme l’espace d’un adhérent par son entreprise, les autres par l’organisation', () => {
    expect(spaceNameOf(membership('member_owner', 'cga'))).toBe('INC SARL');
    expect(spaceNameOf(membership('cga_manager', 'cga'))).toBe('DC-KNOWING CGA');
  });
});

describe('resolveDestination (03-APPFLOW §1)', () => {
  it('F-AUTH-01 · un espace ouvert mène à son tableau de bord', () => {
    const cga = membership('cga_manager', 'cga');

    expect(resolveDestination(session([cga], cga.id))).toBe(spaceRoutes.cga);
  });

  it('RG-ACC-02 · plusieurs rattachements sans espace ouvert mènent au sélecteur', () => {
    expect(
      resolveDestination(
        session([membership('cncga_president', 'cncga'), membership('cga_manager', 'cga')], null),
      ),
    ).toBe(authRoutes.chooseSpace);
  });

  it('activation · un espace ouvert mène à son tableau de bord, même avec d’autres rattachements', () => {
    const cga = membership('cga_manager', 'cga');

    expect(resolveDestination(session([membership('cncga_president', 'cncga'), cga], cga.id))).toBe(
      spaceRoutes.cga,
    );
  });

  it('ignore un espace actif qui ne figure pas parmi les rattachements', () => {
    expect(activeMembershipOf(session([membership('cga_manager', 'cga')], 'm-inconnu'))).toBeNull();
    expect(activeMembershipOf(null)).toBeNull();
  });
});

describe('loginDestination (03-APPFLOW §1, F-AUTH-01)', () => {
  it('RG-ACC-04 · un seul rattachement mène au tableau de bord de son espace', () => {
    const cga = membership('cga_manager', 'cga');
    const member = membership('member_owner', 'cga');

    expect(loginDestination(session([cga], cga.id))).toBe(spaceRoutes.cga);
    expect(loginDestination(session([member], member.id))).toBe(spaceRoutes.member);
  });

  it('RG-ACC-02 · plusieurs rattachements mènent au sélecteur, sans espace ouvert', () => {
    expect(
      loginDestination(
        session([membership('cncga_president', 'cncga'), membership('cga_manager', 'cga')], null),
      ),
    ).toBe(authRoutes.chooseSpace);
  });

  it('RG-ACC-02 · plusieurs rattachements mènent au sélecteur, même si le serveur a ouvert l’accès principal', () => {
    const primary = membership('cga_accountant_expert', 'cga');

    expect(
      loginDestination(session([primary, membership('cncga_president', 'cncga')], primary.id)),
    ).toBe(authRoutes.chooseSpace);
  });

  it('un seul rattachement que le serveur n’a pas ouvert passe par le sélecteur', () => {
    expect(loginDestination(session([membership('cga_manager', 'cga')], null))).toBe(
      authRoutes.chooseSpace,
    );
  });
});

describe('safeReturnPath (02-TRD §6.7, A01)', () => {
  it('03-APPFLOW §7 · accepte un chemin interne', () => {
    expect(safeReturnPath('/cga/adherents?page=2')).toBe('/cga/adherents?page=2');
  });

  it('ignore un paramètre absent ou vide', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
  });

  it('A01 · refuse une adresse absolue', () => {
    expect(safeReturnPath('https://evil.tld/cga')).toBeNull();
  });

  it('A01 · refuse un chemin qui change de domaine', () => {
    expect(safeReturnPath('//evil.tld/cga')).toBeNull();
  });

  it('A01 · refuse un antislash, que le navigateur lirait comme une barre oblique', () => {
    expect(safeReturnPath('/\\evil.tld')).toBeNull();
  });

  it('refuse la page de connexion elle-même, qui bouclerait', () => {
    expect(safeReturnPath(authRoutes.login)).toBeNull();
    expect(safeReturnPath(`${authRoutes.login}?retour=%2Fcga`)).toBeNull();
  });

  it('03-APPFLOW §7 · encode la page demandée dans le lien de connexion', () => {
    expect(loginReturningTo('/cga/adherents?page=2')).toBe(
      '/connexion?retour=%2Fcga%2Fadherents%3Fpage%3D2',
    );
  });
});
