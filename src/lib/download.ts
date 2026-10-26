/**
 * Fichier reçu de l'API (modèle Excel, rapport, export) remis au navigateur : un lien éphémère vers
 * le contenu déjà téléchargé avec la session, jamais un lien public.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Nom d'un fichier dans l'en-tête `Content-Disposition` de la réponse, sinon le nom proposé. */
export function fileNameOf(disposition: unknown, fallback: string): string {
  const match = typeof disposition === 'string' ? /filename="?([^";]+)"?/i.exec(disposition) : null;

  return match === null ? fallback : match[1];
}
