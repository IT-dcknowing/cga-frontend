import { http } from '@/lib/http';
import { SHOWN_BY_SCREEN, type ApiItem } from '@/lib/query';

/*
 * Espace adhérent (03-APPFLOW §5), sur `/api/v1/member/…` : l'adhérent ne voit que son propre
 * dossier, choisi par le serveur d'après son accès actif — aucun identifiant n'est envoyé.
 */
export type MemberHome = {
  member: {
    company_name: string;
    sigle: string | null;
    number: string | null;
    portfolio: string;
    portfolio_label: string;
    status: string;
    status_label: string;
    regime_label: string;
    adhesion_date: string | null;
    /** Date d'effet d'une radiation validée : fin de l'adhésion. */
    ended_on: string | null;
  };
  access: { role: string; role_label: string; read_only_until: string | null };
  organization: {
    name: string;
    sigle: string | null;
    address: string | null;
    city: string | null;
    phone_1: string | null;
    phone_2: string | null;
    email: string | null;
  };
};

export const httpMemberSpaceApi = {
  async home(): Promise<MemberHome> {
    const { data } = await http.get<ApiItem<MemberHome>>('/member/home', {
      skipErrorToast: SHOWN_BY_SCREEN,
    });

    return data.data;
  },
};
