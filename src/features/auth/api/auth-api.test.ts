import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  attemptsLeftOf,
  httpAuthApi,
  LoginError,
  loginFailureFor,
  type Membership,
  type Session,
} from '@/features/auth/api/auth-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { http } from '@/lib/http';

// Client simulé ; le cookie CSRF passe par son `get`, comme le vrai `fetchCsrfCookie`.
vi.mock('@/lib/http', async () => {
  const { config: settings } = await import('@/lib/config');
  const client = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };

  return {
    http: client,
    fetchCsrfCookie: async () => {
      await client.get('/sanctum/csrf-cookie', { baseURL: settings.apiRootUrl });
    },
  };
});

const get = http.get as unknown as Mock;
const post = http.post as unknown as Mock;
const patch = http.patch as unknown as Mock;

function membership(id: string): Membership {
  return {
    id,
    role: 'cga_manager',
    organization: { id: 'org-1', type: 'cga', name: 'DC-KNOWING CGA', banking_enabled: false },
    member: null,
    unread_notifications: 0,
  };
}

function session(memberships: Membership[], activeId: string | null): Session {
  return {
    user: {
      first_name: 'Koffi',
      last_name: 'N’Guessan',
      phone: '+2250700000001',
      email: 'gerant@dc-knowing.ci',
      notification_preferences: { sms: true, whatsapp: false },
    },
    memberships,
    active_membership_id: activeId,
    last_membership_id: null,
    permissions: [],
  };
}

function axiosErrorWith(status: number, data: unknown = {}): AxiosError {
  return new AxiosError('refusé', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

/** `/me` renvoie successivement les sessions données. */
function meReturns(...sessions: Session[]) {
  const queue = [...sessions];

  get.mockImplementation((url: string) =>
    url === '/me'
      ? Promise.resolve({ data: { data: queue.length > 1 ? queue.shift() : queue[0] } })
      : Promise.resolve({ data: '' }),
  );
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof LoginError ? error.reason : 'autre';
  }

  return 'aucune';
}

describe('loginFailureFor (02-TRD §4.4)', () => {
  it('02-TRD §6.1 · 429 signale la limitation des essais', () => {
    expect(loginFailureFor(429)).toBe('too_many_attempts');
  });

  it('F-AUTH-01 · 403 signale un accès qui n’est pas actif', () => {
    expect(loginFailureFor(403)).toBe('inactive_account');
  });

  it('F-AUTH-01 · 401 et 422 signalent des identifiants refusés', () => {
    expect(loginFailureFor(401)).toBe('invalid_credentials');
    expect(loginFailureFor(422)).toBe('invalid_credentials');
  });

  it('03-APPFLOW §7 · tout le reste est une erreur imprévue', () => {
    expect(loginFailureFor(500)).toBe('unexpected');
    expect(loginFailureFor(undefined)).toBe('unexpected');
  });
});

describe('attemptsLeftOf (F-AUTH-03)', () => {
  it('lit les essais restants d’un conflit, et rien sinon', () => {
    expect(attemptsLeftOf(new ApiBusinessError('wrong_code', { attempts_left: 2 }))).toBe(2);
    expect(attemptsLeftOf(new ApiBusinessError('expired_code'))).toBeNull();
    expect(attemptsLeftOf(new Error('autre'))).toBeNull();
  });
});

describe('httpAuthApi (02-TRD §6.1, §6.2)', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    post.mockResolvedValue({ data: '' });
    patch.mockResolvedValue({ data: '' });
  });

  it('prend le cookie CSRF, se connecte, puis lit la session de /me', async () => {
    const opened = session([membership('m-1'), membership('m-2')], null);
    meReturns(opened);

    await expect(
      httpAuthApi.login({ identifier: 'a@b.ci', password: 'demo1234' }),
    ).resolves.toEqual(opened);
    expect(get).toHaveBeenCalledWith('/sanctum/csrf-cookie', { baseURL: config.apiRootUrl });
    // 03-APPFLOW §2 : un refus de connexion s'affiche sous le formulaire, pas dans un toast.
    expect(post).toHaveBeenCalledWith(
      '/auth/login',
      { identifier: 'a@b.ci', password: 'demo1234' },
      { skipErrorToast: [401, 403, 422, 429] },
    );
    expect(post).not.toHaveBeenCalledWith('/me/space', expect.anything());
  });

  it('03-APPFLOW §1 · ouvre d’office l’unique rattachement si le serveur ne l’a pas fait', async () => {
    const only = membership('m-1');
    meReturns(session([only], null), session([only], 'm-1'));

    const opened = await httpAuthApi.login({ identifier: 'a@b.ci', password: 'demo1234' });

    expect(post).toHaveBeenCalledWith('/me/space', { membership_id: 'm-1' });
    expect(opened.active_membership_id).toBe('m-1');
  });

  it('traduit la réponse du serveur en cause d’échec', async () => {
    get.mockResolvedValue({ data: '' });
    post.mockRejectedValue(axiosErrorWith(429));

    expect(await reasonOf(httpAuthApi.login({ identifier: 'a@b.ci', password: 'x' }))).toBe(
      'too_many_attempts',
    );
  });

  it('03-APPFLOW §7 · une panne réseau reste une erreur imprévue', async () => {
    get.mockRejectedValue(new Error('réseau injoignable'));

    expect(await reasonOf(httpAuthApi.login({ identifier: 'a@b.ci', password: 'x' }))).toBe(
      'unexpected',
    );
  });

  it('relit la session au chargement, et rien sans session (401)', async () => {
    const opened = session([membership('m-1')], 'm-1');
    meReturns(opened);
    await expect(httpAuthApi.currentSession()).resolves.toEqual(opened);

    get.mockRejectedValue(axiosErrorWith(401));
    await expect(httpAuthApi.currentSession()).resolves.toBeNull();

    get.mockRejectedValue(axiosErrorWith(500));
    await expect(httpAuthApi.currentSession()).rejects.toBeInstanceOf(AxiosError);
  });

  it('RG-ACC-02 · enregistre l’espace choisi côté serveur et relit les droits', async () => {
    const opened = session([membership('m-1'), membership('m-2')], 'm-2');
    meReturns(opened);

    await expect(httpAuthApi.chooseSpace('m-2')).resolves.toEqual(opened);
    expect(post).toHaveBeenCalledWith('/me/space', { membership_id: 'm-2' });
  });

  it('se déconnecte', async () => {
    await httpAuthApi.logout();

    expect(post).toHaveBeenCalledWith('/auth/logout');
  });

  it('RG-ACC-04 · demande un code puis réinitialise le mot de passe', async () => {
    get.mockResolvedValue({ data: '' });

    await httpAuthApi.requestPasswordCode('+2250700000001');
    await httpAuthApi.resetPassword({
      identifier: '+2250700000001',
      code: '123456',
      password: 'nouveau-mot',
    });

    expect(get).toHaveBeenCalledWith('/sanctum/csrf-cookie', { baseURL: config.apiRootUrl });
    expect(post).toHaveBeenCalledWith('/auth/password/code', { identifier: '+2250700000001' });
    expect(post).toHaveBeenCalledWith('/auth/password/reset', {
      identifier: '+2250700000001',
      code: '123456',
      password: 'nouveau-mot',
    });
  });

  it('un code refusé devient un conflit métier avec les essais restants', async () => {
    post.mockRejectedValue(
      axiosErrorWith(409, { code: 'wrong_code', details: { attempts_left: 1 } }),
    );

    await expect(
      httpAuthApi.resetPassword({ identifier: 'a@b.ci', code: '000000', password: 'x' }),
    ).rejects.toMatchObject({ code: 'wrong_code', details: { attempts_left: 1 } });
  });

  it('F-AUTH-02 · lit l’invitation par son jeton, encodé dans l’adresse', async () => {
    get.mockResolvedValue({
      data: { data: { status: 'invalid', organization_contact: 'DC-KNOWING CGA' } },
    });

    await expect(httpAuthApi.readInvitation('a/b')).resolves.toEqual({
      status: 'invalid',
      organization_contact: 'DC-KNOWING CGA',
    });
    expect(get).toHaveBeenCalledWith('/auth/invitations/a%2Fb');
  });

  it('A07 · un jeton inconnu (404) donne le même écran qu’un lien expiré', async () => {
    get.mockRejectedValue(axiosErrorWith(404));
    await expect(httpAuthApi.readInvitation('inconnu')).resolves.toEqual({
      status: 'invalid',
      organization_contact: null,
    });

    get.mockRejectedValue(axiosErrorWith(500));
    await expect(httpAuthApi.readInvitation('inconnu')).rejects.toBeInstanceOf(AxiosError);
  });

  it('RG-ACC-03 · accepte l’invitation puis lit la session ouverte', async () => {
    const opened = session([membership('m-1')], 'm-1');
    meReturns(opened);

    await expect(
      httpAuthApi.activate({
        token: 'jeton',
        password: 'nouveau-mot',
        accepted_terms: true,
        sms_opt_in: true,
        whatsapp_opt_in: false,
      }),
    ).resolves.toEqual(opened);
    expect(post).toHaveBeenCalledWith('/auth/invitations/jeton/accept', {
      password: 'nouveau-mot',
      accepted_terms: true,
      sms_opt_in: true,
      whatsapp_opt_in: false,
    });
  });

  it('une activation refusée par la validation garde le détail des champs', async () => {
    get.mockResolvedValue({ data: '' });
    post.mockRejectedValue(axiosErrorWith(422, { errors: { password: ['Trop courant.'] } }));

    await expect(
      httpAuthApi.activate({
        token: 'jeton',
        password: 'azertyui',
        accepted_terms: true,
        sms_opt_in: false,
        whatsapp_opt_in: false,
      }),
    ).rejects.toBeInstanceOf(ApiValidationError);
  });

  it('F-AUTH-05 · enregistre le profil, le téléphone et les préférences, puis relit /me', async () => {
    const opened = session([membership('m-1')], 'm-1');
    meReturns(opened);

    await expect(
      httpAuthApi.updateProfile({ first_name: 'Koffi', last_name: 'N’Guessan', email: null }),
    ).resolves.toEqual(opened);
    await httpAuthApi.requestPhoneCode('+2250700000009');
    await expect(
      httpAuthApi.confirmPhone({ phone: '+2250700000009', code: '123456' }),
    ).resolves.toEqual(opened);
    await expect(httpAuthApi.updatePreferences({ sms: false, whatsapp: true })).resolves.toEqual(
      opened,
    );
    await httpAuthApi.changePassword({ current_password: 'demo1234', password: 'nouveau-mot' });

    expect(patch).toHaveBeenCalledWith('/me', {
      first_name: 'Koffi',
      last_name: 'N’Guessan',
      email: null,
    });
    expect(post).toHaveBeenCalledWith('/me/phone/code', { phone: '+2250700000009' });
    expect(post).toHaveBeenCalledWith('/me/phone', { phone: '+2250700000009', code: '123456' });
    expect(patch).toHaveBeenCalledWith('/me/preferences', { sms: false, whatsapp: true });
    expect(post).toHaveBeenCalledWith('/me/password', {
      current_password: 'demo1234',
      password: 'nouveau-mot',
    });
  });
});
