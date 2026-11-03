import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';

/*
 * Cloche de notifications (PRD M13, 03-APPFLOW §7, `/api/v1/me/notifications`) : notifications de
 * l'utilisateur dans son **espace actif**, les plus récentes d'abord, avec le nombre de non lues.
 * Le lien d'une notification mène à la page de l'objet (« /cga/cotisation »…).
 */
export type AppNotification = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string | null;
};

export type NotificationPage = ApiPage<AppNotification> & {
  meta: ApiPage<AppNotification>['meta'] & { unread_count: number };
};

export const notificationKeys = {
  all: ['notifications'] as const,
  panel: ['notifications', 'panel'] as const,
};

export const notificationsApi = {
  async latest(): Promise<NotificationPage> {
    const { data } = await http.get<NotificationPage>('/me/notifications', {
      params: { per_page: config.notificationsPanelSize },
    });

    return data;
  },

  read: (id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<AppNotification>>(
        `/me/notifications/${encodeURIComponent(id)}/read`,
      );

      return data.data;
    }),

  readAll: () =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<{ marked: number }>>('/me/notifications/read-all');

      return data.data.marked;
    }),
};
