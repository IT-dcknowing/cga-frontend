import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

/*
 * Journal des appels à l'API dans la console du navigateur, pour le développement (`VITE_API_LOG`).
 * Jamais d'en-têtes (cookies, jeton CSRF), mots de passe, codes et jetons masqués (02-TRD §6.5) ;
 * rien n'est envoyé ailleurs que dans la console, rien n'est stocké.
 */

export const MASK = '••••';

/** Clés masquées dans le corps des requêtes : secrets saisis par l'utilisateur. */
export const REQUEST_SECRETS: ReadonlySet<string> = new Set([
  'password',
  'password_confirmation',
  'current_password',
  'code',
  'token',
]);

/** Clés masquées dans le corps des réponses (`code` y est un code d'erreur, pas un secret). */
export const RESPONSE_SECRETS: ReadonlySet<string> = new Set(['token']);

const SUCCESS_STYLE = 'color: #15803d; font-weight: 600';
const FAILURE_STYLE = 'color: #b91c1c; font-weight: 600';

export type ConsoleOutput = Pick<Console, 'groupCollapsed' | 'groupEnd' | 'log' | 'error'>;

/** Copie de `value` où les clés secrètes sont masquées, à toute profondeur ; `value` reste intact. */
export function maskSecrets(value: unknown, secretKeys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskSecrets(item, secretKeys));
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      secretKeys.has(key) ? MASK : maskSecrets(item, secretKeys),
    ]),
  );
}

/** Corps d'une requête : axios l'a déjà sérialisé en JSON quand la réponse arrive. */
function requestBodyOf(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function durationOf(request: InternalAxiosRequestConfig | undefined): string {
  const startedAt = request?.metadata?.startedAt;

  return startedAt === undefined ? '' : ` (${Math.round(performance.now() - startedAt)} ms)`;
}

type LoggedCall = {
  request: InternalAxiosRequestConfig | undefined;
  outcome: string;
  failed: boolean;
  body?: unknown;
};

function logCall(client: AxiosInstance, output: ConsoleOutput, call: LoggedCall): void {
  const method = (call.request?.method ?? 'get').toUpperCase();
  const url = call.request === undefined ? '?' : client.getUri(call.request);
  const mark = call.failed ? '✖' : '✔';

  output.groupCollapsed(
    `%c${mark} ${method} ${url} → ${call.outcome}${durationOf(call.request)}`,
    call.failed ? FAILURE_STYLE : SUCCESS_STYLE,
  );
  output.log('Requête', {
    method,
    url,
    body: maskSecrets(requestBodyOf(call.request?.data), REQUEST_SECRETS),
  });

  if (call.failed) {
    output.error('Réponse', maskSecrets(call.body, RESPONSE_SECRETS));
  } else {
    output.log('Réponse', maskSecrets(call.body, RESPONSE_SECRETS));
  }

  output.groupEnd();
}

/**
 * Branche le journal sur un client axios : un groupe replié par appel, vert s'il réussit, rouge
 * s'il échoue (statut HTTP, ou « réseau » quand le serveur n'a pas répondu). L'erreur est relancée
 * telle quelle.
 */
export function attachApiLogger(client: AxiosInstance, output: ConsoleOutput = console): void {
  client.interceptors.request.use((request) => {
    request.metadata = { startedAt: performance.now() };

    return request;
  });

  client.interceptors.response.use(
    (response) => {
      logCall(client, output, {
        request: response.config,
        outcome: String(response.status),
        failed: false,
        body: response.data,
      });

      return response;
    },
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        logCall(client, output, {
          request: error.config,
          outcome:
            error.response === undefined
              ? `réseau (${error.message})`
              : String(error.response.status),
          failed: true,
          body: error.response === undefined ? error.message : error.response.data,
        });
      }

      return Promise.reject(error);
    },
  );
}
