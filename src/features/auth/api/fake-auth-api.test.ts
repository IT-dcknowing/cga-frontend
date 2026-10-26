import { describe, expect, it } from 'vitest';
import { LoginError } from '@/features/auth/api/auth-api';
import { createFakeAuthApi, DEMO_CODE, DEMO_PASSWORD } from '@/features/auth/api/fake-auth-api';
import { ApiBusinessError } from '@/lib/api-errors';

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LoginError) {
      return error.reason;
    }

    return error instanceof ApiBusinessError ? error.code : 'autre';
  }

  return 'aucune';
}

describe('Bouchon d’authentification (tient le rôle du serveur de l’étape 0.9)', () => {
  it('RG-ACC-01 · accepte le téléphone comme l’e-mail', async () => {
    const api = createFakeAuthApi();

    const byPhone = await api.login({ identifier: '+2250700000001', password: DEMO_PASSWORD });
    const byEmail = await api.login({
      identifier: ' Gerant@DC-Knowing.ci ',
      password: DEMO_PASSWORD,
    });

    expect(byPhone.memberships).toHaveLength(1);
    expect(byEmail.user.phone).toBe('+2250700000001');
  });

  it('03-APPFLOW §1 · un seul rattachement ouvre directement son espace et ses droits', async () => {
    const api = createFakeAuthApi();

    const session = await api.login({
      identifier: 'gerant@dc-knowing.ci',
      password: DEMO_PASSWORD,
    });

    expect(session.active_membership_id).toBe('m-cga');
    // Codes du catalogue du backend : les droits par défaut du gérant.
    expect(session.permissions).toContain('cga.profile.manage');
  });

  it('RG-ACC-02 · plusieurs rattachements : aucun espace ouvert, le dernier utilisé est rappelé', async () => {
    const api = createFakeAuthApi();

    const session = await api.login({ identifier: 'presidente@cncga.ci', password: DEMO_PASSWORD });

    expect(session.memberships).toHaveLength(2);
    expect(session.active_membership_id).toBeNull();
    expect(session.permissions).toEqual([]);
    expect(session.last_membership_id).toBe('m-cga-2');
  });

  it('RG-ACC-02 · change d’espace sans se reconnecter et retient ce choix', async () => {
    const api = createFakeAuthApi();
    await api.login({ identifier: 'presidente@cncga.ci', password: DEMO_PASSWORD });

    const cncga = await api.chooseSpace('m-cncga');

    expect(cncga.active_membership_id).toBe('m-cncga');
    expect(cncga.permissions).toContain('dues.view');
    expect(cncga.permissions).not.toContain('members.view');

    await api.logout();
    const next = await api.login({ identifier: 'presidente@cncga.ci', password: DEMO_PASSWORD });

    expect(next.last_membership_id).toBe('m-cncga');
  });

  it('refuse un espace qui n’appartient pas à la session, et tout choix sans session', async () => {
    const api = createFakeAuthApi();

    await expect(api.chooseSpace('m-cga')).rejects.toThrow();

    await api.login({ identifier: 'gerant@dc-knowing.ci', password: DEMO_PASSWORD });
    await expect(api.chooseSpace('m-cncga')).rejects.toThrow();
  });

  it('relit la session ouverte, et plus rien après la déconnexion', async () => {
    const api = createFakeAuthApi();

    await expect(api.currentSession()).resolves.toBeNull();

    await api.login({ identifier: 'gerant@dc-knowing.ci', password: DEMO_PASSWORD });
    await expect(api.currentSession()).resolves.toMatchObject({ active_membership_id: 'm-cga' });

    await api.logout();
    await expect(api.currentSession()).resolves.toBeNull();
  });

  it('A07 · un compte inconnu et un mot de passe faux donnent le même refus', async () => {
    const api = createFakeAuthApi();

    expect(
      await reasonOf(api.login({ identifier: 'inconnu@nulle-part.ci', password: DEMO_PASSWORD })),
    ).toBe('invalid_credentials');
    expect(
      await reasonOf(api.login({ identifier: 'gerant@dc-knowing.ci', password: 'faux' })),
    ).toBe('invalid_credentials');
  });

  it('02-TRD §6.1 · bloque au 5e échec et reste bloqué ensuite', async () => {
    const api = createFakeAuthApi();
    const attempt = () => api.login({ identifier: 'gerant@dc-knowing.ci', password: 'faux' });

    for (let index = 0; index < 4; index += 1) {
      expect(await reasonOf(attempt())).toBe('invalid_credentials');
    }

    expect(await reasonOf(attempt())).toBe('too_many_attempts');
    expect(await reasonOf(attempt())).toBe('too_many_attempts');
    expect(
      await reasonOf(api.login({ identifier: 'gerant@dc-knowing.ci', password: DEMO_PASSWORD })),
    ).toBe('too_many_attempts');
  });

  it('02-TRD §6.1 · une connexion réussie remet le compteur à zéro', async () => {
    const api = createFakeAuthApi();
    const credentials = { identifier: 'gerant@dc-knowing.ci', password: 'faux' };

    await reasonOf(api.login(credentials));
    await reasonOf(api.login(credentials));
    await api.login({ identifier: credentials.identifier, password: DEMO_PASSWORD });

    expect(await reasonOf(api.login(credentials))).toBe('invalid_credentials');
  });

  it('F-AUTH-01 · refuse un compte sans rattachement actif', async () => {
    const api = createFakeAuthApi();

    expect(
      await reasonOf(api.login({ identifier: 'inactif@dc-knowing.ci', password: DEMO_PASSWORD })),
    ).toBe('inactive_account');
  });

  it('RG-ACC-04 · le code oublié vaut 3 essais, puis il faut en redemander un', async () => {
    const api = createFakeAuthApi();
    const identifier = 'gerant@dc-knowing.ci';
    const reset = (code: string) =>
      api.resetPassword({ identifier, code, password: 'nouveau-mot' });

    await api.requestPasswordCode(identifier);
    expect(await reasonOf(reset('000000'))).toBe('wrong_code');
    await expect(reset('000000')).rejects.toMatchObject({ details: { attempts_left: 1 } });
    expect(await reasonOf(reset('000000'))).toBe('expired_code');
    expect(await reasonOf(reset(DEMO_CODE))).toBe('expired_code');

    await api.requestPasswordCode(identifier);
    await expect(reset(DEMO_CODE)).resolves.toBeUndefined();
  });

  it('A07 · une demande de code pour un compte inconnu répond comme les autres', async () => {
    await expect(createFakeAuthApi().requestPasswordCode('inconnu@nulle-part.ci')).resolves.toBe(
      undefined,
    );
  });

  it('RG-ACC-03 · une invitation valide ouvre l’espace de son rattachement', async () => {
    const api = createFakeAuthApi();

    expect(await api.readInvitation('invitation-adherent')).toMatchObject({
      status: 'valid',
      is_member: true,
    });

    const session = await api.activate({
      token: 'invitation-adherent',
      password: 'nouveau-mot',
      accepted_terms: true,
      sms_opt_in: true,
      whatsapp_opt_in: false,
    });

    expect(session.active_membership_id).toBe('m-member');
  });

  it('F-AUTH-02 · un jeton inconnu donne un lien invalide avec le contact du CGA', async () => {
    const api = createFakeAuthApi();

    expect(await api.readInvitation('expire')).toMatchObject({ status: 'invalid' });
    expect(
      await reasonOf(
        api.activate({
          token: 'expire',
          password: 'nouveau-mot',
          accepted_terms: true,
          sms_opt_in: false,
          whatsapp_opt_in: false,
        }),
      ),
    ).toBe('invitation_invalid');
  });

  it('F-AUTH-05 · modifie le profil sans toucher aux comptes de démonstration', async () => {
    const api = createFakeAuthApi();
    await api.login({ identifier: 'adherent@inc.ci', password: DEMO_PASSWORD });

    const updated = await api.updateProfile({
      first_name: 'Séry',
      last_name: 'Bamba',
      email: null,
    });
    expect(updated.user).toMatchObject({ first_name: 'Séry', email: null });

    const preferences = await api.updatePreferences({ sms: false, whatsapp: false });
    expect(preferences.user.notification_preferences).toEqual({ sms: false, whatsapp: false });

    await api.logout();
    const again = await api.login({ identifier: 'adherent@inc.ci', password: DEMO_PASSWORD });
    expect(again.user).toMatchObject({ first_name: 'Sery', email: 'adherent@inc.ci' });
  });

  it('F-AUTH-05 · change le téléphone après le code envoyé au nouveau numéro', async () => {
    const api = createFakeAuthApi();
    await api.login({ identifier: 'gerant@dc-knowing.ci', password: DEMO_PASSWORD });

    await api.requestPhoneCode('+2250700000099');
    expect(await reasonOf(api.confirmPhone({ phone: '+2250700000099', code: '000000' }))).toBe(
      'wrong_code',
    );

    const session = await api.confirmPhone({ phone: '+2250700000099', code: DEMO_CODE });
    expect(session.user.phone).toBe('+2250700000099');
  });

  it('F-AUTH-05 · refuse un mot de passe actuel faux', async () => {
    const api = createFakeAuthApi();
    await api.login({ identifier: 'gerant@dc-knowing.ci', password: DEMO_PASSWORD });

    expect(
      await reasonOf(api.changePassword({ current_password: 'faux', password: 'nouveau-mot' })),
    ).toBe('wrong_password');
    await expect(
      api.changePassword({ current_password: DEMO_PASSWORD, password: 'nouveau-mot' }),
    ).resolves.toBeUndefined();
  });

  it('refuse toute modification du profil sans session', async () => {
    await expect(
      createFakeAuthApi().updateProfile({ first_name: 'A', last_name: 'B', email: null }),
    ).rejects.toThrow('Aucune session ouverte.');
  });
});
