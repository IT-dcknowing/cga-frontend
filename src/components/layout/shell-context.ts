import { createContext, useContext } from 'react';

/** Vrai à l'intérieur de la coque d'un espace : un écran commun (erreur) s'y affiche sans PublicLayout. */
export const ShellContext = createContext(false);

export function useInShell(): boolean {
  return useContext(ShellContext);
}
