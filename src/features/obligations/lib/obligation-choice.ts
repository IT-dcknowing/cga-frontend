import {
  obligationsApi,
  type MemberObligation,
  type ObligationType,
} from '@/features/obligations/api/obligations-api';

/** Choix de l'utilisateur : propositions décochées, obligations ajoutées du catalogue. */
export type ObligationChoice = { unchecked: string[]; added: ObligationType[] };

export const emptyObligationChoice: ObligationChoice = { unchecked: [], added: [] };

/**
 * Après l'enregistrement du dossier : confirme les propositions du serveur restées cochées, retire
 * celles décochées, attribue les obligations ajoutées qui ne le sont pas encore. Sans effet la
 * seconde fois (propositions déjà traitées, ajouts déjà attribués).
 */
export async function applyObligationChoice(
  memberId: string,
  choice: ObligationChoice,
): Promise<void> {
  const current: MemberObligation[] = await obligationsApi.ofMember(memberId);
  const suggested = current.filter((item) => item.status === 'suggested');
  const remove = suggested
    .filter((item) => choice.unchecked.includes(item.type.id))
    .map((item) => item.id);
  const confirm = suggested
    .filter((item) => !choice.unchecked.includes(item.type.id))
    .map((item) => item.id);

  if (confirm.length > 0 || remove.length > 0) {
    await obligationsApi.review(memberId, { confirm, remove });
  }

  const open = new Set(
    current.filter((item) => item.status !== 'removed').map((item) => item.type.id),
  );

  for (const type of choice.added) {
    if (!open.has(type.id)) {
      await obligationsApi.add(memberId, type.id);
    }
  }
}
