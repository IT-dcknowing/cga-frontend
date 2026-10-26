/**
 * Paramètres du frontend. Seul endroit du code qui lit `import.meta.env` : ailleurs, tout passe par
 * `config` (même règle que `env()` réservé à `config/` côté backend, 02-TRD §7.6).
 */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }

  return value === 'true' || value === '1';
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function text(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? fallback : trimmed;
}

/** Racine du serveur d'une adresse : son origine si elle est absolue, `/` (même domaine) sinon. */
function rootOf(url: string): string {
  return /^https?:\/\//i.test(url) ? new URL(url).origin : '/';
}

/**
 * Adresse de l'API versionnée (`VITE_API_BASE_URL`, fichier `.env`) : absolue en développement
 * (`http://localhost:8002/api/v1`), relative en production où le SPA est servi sur le même domaine
 * que l'API (02-TRD §3, T-01). Sans réglage, l'API du même domaine (02-TRD §4 : base `/api/v1`).
 */
const apiBaseUrl = text(import.meta.env.VITE_API_BASE_URL, '/api/v1');

export const config = {
  apiBaseUrl,
  /**
   * Racine du serveur de l'API, hors `/api/v1` : Sanctum y sert `/sanctum/csrf-cookie`
   * (02-TRD §6.1). L'origine de `apiBaseUrl` quand elle est absolue, `/` sinon.
   */
  apiRootUrl: rootOf(apiBaseUrl),
  /**
   * Bouchon de l'API d'authentification, tant que l'étape 0.9 (`POST /api/v1/auth/login`) n'est pas
   * livrée. Activé par `VITE_API_STUB` dans `.env.development` ; absent en production.
   */
  useApiStub: flag(import.meta.env.VITE_API_STUB, false),
  /**
   * Journal des requêtes et réponses de l'API dans la console (`VITE_API_LOG`). Actif par défaut en
   * développement, coupé dans les tests, et jamais dans un build de production.
   */
  logApiCalls:
    import.meta.env.DEV && flag(import.meta.env.VITE_API_LOG, import.meta.env.MODE !== 'test'),
  /**
   * Longueur minimale d'un mot de passe (02-TRD §6.1 : 8 caractères). Contrôle de confort : le
   * serveur refait la vérification et refuse en plus les mots de passe trop courants.
   */
  passwordMinLength: integer(import.meta.env.VITE_PASSWORD_MIN_LENGTH, 8),
  /** Nombre de chiffres d'un code reçu par SMS (F-AUTH-03 : 6 chiffres). */
  codeLength: integer(import.meta.env.VITE_CODE_LENGTH, 6),
  /**
   * Lignes demandées par page de liste (`?per_page=`, 02-TRD §4.3 : 25 par défaut, 100 au plus).
   * Le serveur reste juge : le tableau suit le `per_page` qu'il renvoie.
   */
  pageSize: integer(import.meta.env.VITE_PAGE_SIZE, 25),
  /** Plafond de `per_page` (02-TRD §4.3) : un référentiel court se lit en une page (DR d'un filtre). */
  pageSizeMax: integer(import.meta.env.VITE_PAGE_SIZE_MAX, 100),
  /** Pause de frappe avant de lancer une recherche dans une liste, en millisecondes. */
  searchDebounceMs: integer(import.meta.env.VITE_SEARCH_DEBOUNCE_MS, 300),
  /** Intervalle de lecture de l'avancement d'un import en file « imports », en millisecondes. */
  importPollMs: integer(import.meta.env.VITE_IMPORT_POLL_MS, 2000),
  /** Intervalle de relecture d'un document en cours de production (RG-DOC-05), en millisecondes. */
  documentPollMs: integer(import.meta.env.VITE_DOCUMENT_POLL_MS, 3000),
} as const;
