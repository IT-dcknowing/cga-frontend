import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';
import type { InstancesList, ObligationInstance } from './obligations-api';

/*
 * Obligations vues de l'espace adhérent (F-OBL-05, `/member/obligations`) : ses échéances, hors
 * annulées, avec le récapitulatif « Total dû » de chaque bloc ; « Signaler comme fait / payé »
 * (RG-OBL-09) : la ligne attend ensuite la confirmation de son CGA. Une déclaration se signale
 * sans montant ; un paiement porte montant, date et preuve facultative.
 */
export type MemberDeclaration = { amount: number; paid_on: string; proof: File | null };

export const memberObligationKeys = {
  all: ['member-space', 'obligations'] as const,
};

export const memberObligationsApi = {
  async list(): Promise<InstancesList> {
    const { data } = await http.get<{
      data: ObligationInstance[];
      summary: InstancesList['summary'];
    }>('/member/obligations');

    return { instances: data.data, summary: data.summary };
  },

  declare: (instance: ObligationInstance, input: MemberDeclaration | null) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ObligationInstance>>(
        `/member/obligations/${encodeURIComponent(instance.id)}/declare`,
        input === null
          ? {}
          : toFormData({
              amount: String(input.amount),
              paid_on: input.paid_on,
              ...(input.proof === null ? {} : { proof: input.proof }),
            }),
      );

      return data.data;
    }),
};
