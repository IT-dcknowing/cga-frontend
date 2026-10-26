import { within } from '@testing-library/react';

/**
 * Champ d'un `FormField` par son libellé exact : le texte du libellé, avant l'astérisque d'un champ
 * obligatoire. Évite qu'un libellé en préfixe un autre (« Téléphone », « Téléphone du gérant »).
 */
export function fieldByLabel(container: HTMLElement, label: string): HTMLElement {
  const labelElement = within(container).getByText(
    (_, element) => element?.tagName === 'LABEL' && element.firstChild?.textContent === label,
  );
  const control = document.getElementById(labelElement.getAttribute('for') ?? '');

  if (control === null) {
    throw new Error(`Aucun champ pour le libellé « ${label} ».`);
  }

  return control;
}
