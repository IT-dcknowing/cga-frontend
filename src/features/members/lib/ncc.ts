/** `Ncc::normalize` du backend : sans espace, en majuscules (« 1234567 a » vaut « 1234567A »). */
export function normalizedNcc(ncc: string): string {
  return ncc.replace(/\s+/g, '').toUpperCase();
}
