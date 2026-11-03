import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  notificationKeys,
  notificationsApi,
  type AppNotification,
} from '@/features/notifications/api/notifications-api';
import { formatTimestamp } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * Cloche de l'en-tête (03-APPFLOW §7, PRD M13) : compteur des non lues de l'espace actif, panneau des
 * dernières notifications lu à l'ouverture ; un clic marque la notification comme lue et ouvre la page
 * de l'objet ; « Tout marquer comme lu ». Le compteur part de celui de `/me`, puis suit le serveur.
 */
const labels = fr.notifications;

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
}) {
  const unread = notification.read_at === null;

  return (
    <li>
      <button
        type="button"
        className={cn(
          'grid w-full gap-0.5 border-l-[3px] px-4 py-3 text-left hover:bg-primary-soft/40',
          unread ? 'border-l-primary bg-primary-soft/20' : 'border-l-transparent',
        )}
        onClick={() => {
          onOpen(notification);
        }}
      >
        <span className={cn('text-table', unread && 'font-semibold')}>
          {notification.title}
          {unread ? <span className="sr-only"> ({labels.unread})</span> : null}
        </span>
        {notification.body === null ? null : (
          <span className="text-note text-muted">{notification.body}</span>
        )}
        {notification.created_at === null ? null : (
          <span className="text-overline text-muted">
            {formatTimestamp(notification.created_at)}
          </span>
        )}
      </button>
    </li>
  );
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: notificationKeys.panel,
    queryFn: () => notificationsApi.latest(),
    enabled: open,
  });
  const unread = query.data?.meta.unread_count ?? initialUnread;

  const close = () => {
    setOpen(false);
  };

  // Échap ferme le panneau, où que soit le focus (04-UX-UI §9).
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });

  async function openNotification(notification: AppNotification) {
    try {
      if (notification.read_at === null) {
        await notificationsApi.read(notification.id);
        await refresh();
      }
    } catch (error) {
      toastUnexpectedError(error);
    }

    if (notification.link !== null && notification.link.startsWith('/')) {
      close();
      void navigate(notification.link);
    }
  }

  async function markAllRead() {
    try {
      await notificationsApi.readAll();
      await refresh();
    } catch (error) {
      toastUnexpectedError(error);
    }
  }

  return (
    <>
      {open ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          aria-label={labels.close}
          className="fixed inset-0 z-30 cursor-default"
          onClick={close}
        />
      ) : null}

      <div className="relative z-40">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="relative flex size-11 items-center justify-center rounded-control hover:bg-white/10"
          onClick={() => {
            setOpen((previous) => !previous);
          }}
        >
          <Bell className="size-5" aria-hidden="true" />
          <span className="sr-only">{fr.shell.notifications(String(unread))}</span>
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-bold text-white"
            >
              {unread}
            </span>
          ) : null}
        </button>

        {open ? (
          <div
            role="dialog"
            aria-label={labels.title}
            className="absolute right-0 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-card text-ink shadow-card"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
              <h2 className="text-table font-semibold">{labels.title}</h2>
              <div className="flex items-center gap-1">
                {unread > 0 ? (
                  <Button variant="link" size="sm" onClick={() => void markAllRead()}>
                    <CheckCheck aria-hidden="true" />
                    {labels.markAllRead}
                  </Button>
                ) : null}
                <button
                  type="button"
                  aria-label={labels.close}
                  className="flex size-8 items-center justify-center rounded-control hover:bg-primary-soft"
                  onClick={close}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {query.isPending ? (
              <div className="grid gap-2 p-4" aria-busy="true">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : query.isError ? (
              <div className="grid gap-2 p-4 text-table">
                <p>{labels.loadError}</p>
                <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                  {labels.retry}
                </Button>
              </div>
            ) : query.data.data.length === 0 ? (
              <p className="p-4 text-table text-muted">{labels.empty}</p>
            ) : (
              <ul
                aria-label={labels.title}
                className="max-h-96 divide-y divide-border overflow-y-auto"
              >
                {query.data.data.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onOpen={(item) => void openNotification(item)}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
