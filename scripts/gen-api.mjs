// `npm run gen:api` : types TypeScript de l'API, depuis l'OpenAPI du backend lancé (06-IMPLEMENTATION-PLAN
// étape 0.4). Le serveur visé est celui de `VITE_API_BASE_URL` (`.env`), comme pour l'application :
// aucune adresse en dur (02-TRD §7.6). Une variable de l'environnement l'emporte, comme pour Vite.
import { writeFile } from 'node:fs/promises';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import { loadEnv } from 'vite';

// Document OpenAPI publié par Scramble, à la racine du serveur de l'API (02-TRD §6.7, A02).
const DOCS_PATH = '/docs/api.json';
const OUTPUT = 'src/types/api.d.ts';

const { VITE_API_BASE_URL: apiBaseUrl = '' } = loadEnv('development', process.cwd(), 'VITE_');

if (!/^https?:\/\//i.test(apiBaseUrl)) {
  throw new Error(
    `VITE_API_BASE_URL doit être une adresse absolue (ex. http://localhost:8002/api/v1) : « ${apiBaseUrl} ».`,
  );
}

const docsUrl = new URL(DOCS_PATH, apiBaseUrl);

console.log(`Lecture de ${docsUrl.href}`);
await writeFile(OUTPUT, COMMENT_HEADER + astToString(await openapiTS(docsUrl)));
console.log(`Types écrits dans ${OUTPUT}`);
