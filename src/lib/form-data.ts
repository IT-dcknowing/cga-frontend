/**
 * Corps `multipart/form-data` d'une requête qui porte un fichier (justificatif, pièce, preuve). Les
 * objets imbriqués deviennent `champ[clé]`, comme le lit Laravel ; un booléen `1` / `0` ; une valeur
 * nulle, une chaîne vide que le serveur rend à `null` (ConvertEmptyStringsToNull) ; une valeur
 * `undefined` est omise.
 */
export function toFormData(values: Record<string, unknown>, method?: 'PUT'): FormData {
  const body = new FormData();

  function append(name: string, value: unknown) {
    if (value === undefined) {
      return;
    }

    if (value instanceof File) {
      body.append(name, value);
    } else if (value === null) {
      body.append(name, '');
    } else if (typeof value === 'boolean') {
      body.append(name, value ? '1' : '0');
    } else if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        append(`${name}[${key}]`, nested);
      }
    } else {
      body.append(name, String(value as string | number));
    }
  }

  for (const [name, value] of Object.entries(values)) {
    append(name, value);
  }

  // Laravel ne lit les fichiers d'un PUT qu'en POST avec `_method` (method spoofing).
  if (method !== undefined) {
    body.append('_method', method);
  }

  return body;
}
