import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import { Megaphone, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  announcementKeys,
  announcementsApi,
  type Announcement,
  type AnnouncementSpace,
} from '@/features/announcements/api/announcements-api';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { formatNumber, formatTimestamp, formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Annonces (03-APPFLOW §3.2, §4.3, §5.2, étape 7.6) : liste des annonces publiées par l'auteur
 * (`DataTable`, aperçu au clic), fil des annonces reçues (agents d'un CGA : celles du CNCGA) avec
 * « Marquer comme lu », et « Message de mon CGA » (F-DSH-03 : le dernier message) chez l'adhérent.
 */
const labels = fr.announcements;

function audienceOf(announcement: Announcement): string {
  return announcement.audience === undefined
    ? ''
    : (labels.create.audiences[announcement.audience] ?? announcement.audience_label ?? '');
}

function AttachmentLink({ attachment }: { attachment: Announcement['attachment'] }) {
  if (attachment === undefined || attachment === null) {
    return null;
  }

  return (
    <a
      href={attachment.url}
      className="inline-flex items-center gap-1 text-note text-primary underline"
    >
      <Paperclip aria-hidden="true" className="size-3.5" />
      {labels.detail.attachment(attachment.name)}
    </a>
  );
}

/** Corps d'une annonce : expéditeur et date, texte, pièce jointe. */
function AnnouncementBody({ announcement }: { announcement: Announcement }) {
  return (
    <div className="grid gap-2">
      <p className="text-note text-muted">
        {labels.detail.from(
          announcement.from?.name ?? '',
          formatTimestamp(announcement.published_at),
        )}
      </p>
      <p className="whitespace-pre-line">{announcement.body}</p>
      <AttachmentLink attachment={announcement.attachment} />
    </div>
  );
}

function PreviewDialog({
  announcement,
  onClose,
}: {
  announcement: Announcement;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent title={announcement.title} size="preview">
        <DialogBody>
          <AnnouncementBody announcement={announcement} />
          {announcement.targets === undefined || announcement.targets.length === 0 ? null : (
            <p className="text-note text-muted">
              {labels.detail.targets(announcement.targets.map((target) => target.name).join(', '))}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{labels.detail.close}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function columns(space: AnnouncementSpace): ColumnDef<Announcement>[] {
  const text = labels.list.columns;

  return [
    { id: 'title', header: text.title, cell: ({ row }) => row.original.title },
    {
      id: 'published',
      header: text.published,
      cell: ({ row }) => formatTimestampDate(row.original.published_at),
    },
    {
      id: 'audience',
      header: text.audience,
      cell: ({ row }) =>
        space === 'network' ? audienceOf(row.original) : row.original.audience_label,
    },
    {
      id: 'recipients',
      header: text.recipients,
      cell: ({ row }) =>
        [
          formatNumber(row.original.recipients_count ?? 0),
          row.original.send_email === true ? labels.list.email : null,
        ]
          .filter(Boolean)
          .join(' · '),
    },
    {
      id: 'reads',
      header: text.reads,
      cell: ({ row }) => formatNumber(row.original.reads_count ?? 0),
    },
  ];
}

/** Annonces publiées par l'auteur (CNCGA ou centre), la plus récente en tête. */
export function AuthoredAnnouncements({ space }: { space: AnnouncementSpace }) {
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Announcement | null>(null);
  const query = useQuery({
    queryKey: announcementKeys.authored(space, page),
    queryFn: () => announcementsApi.authored(space, page),
    placeholderData: (previous) => previous,
  });
  const pagination: PaginationState = {
    pageIndex: page - 1,
    pageSize: query.data?.meta.per_page ?? config.pageSize,
  };

  function onPaginationChange(updater: Updater<PaginationState>) {
    const next = typeof updater === 'function' ? updater(pagination) : updater;

    setPage(next.pageIndex + 1);
  }

  if (query.isError && query.data === undefined) {
    return (
      <Banner
        tone="danger"
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.list.loadError}
      </Banner>
    );
  }

  return (
    <>
      <Card>
        <CardContent flush>
          <DataTable
            caption={labels.list.caption}
            columns={columns(space)}
            data={query.data?.data ?? []}
            rowCount={query.data?.meta.total ?? 0}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            isLoading={query.isPending}
            getRowId={(announcement) => announcement.id}
            onRowClick={setPreview}
            empty={<EmptyState icon={Megaphone}>{labels.list.empty}</EmptyState>}
          />
        </CardContent>
      </Card>
      {preview === null ? null : (
        <PreviewDialog
          announcement={preview}
          onClose={() => {
            setPreview(null);
          }}
        />
      )}
    </>
  );
}

function useMarkRead() {
  const queryClient = useQueryClient();
  const [marking, setMarking] = useState<string | null>(null);

  async function markRead(announcement: Announcement, done: string) {
    setMarking(announcement.id);
    try {
      await announcementsApi.markRead(announcement.id);
      await queryClient.invalidateQueries({ queryKey: announcementKeys.all });
      toast.success(done);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setMarking(null);
    }
  }

  return { marking, markRead };
}

function ReadBadge({ announcement }: { announcement: Announcement }) {
  return (
    <StatusBadge domain="announcement" status={announcement.read === true ? 'read' : 'unread'} />
  );
}

/** Annonces reçues dans l'espace actif (agents d'un CGA : celles du CNCGA). */
export function ReceivedAnnouncements() {
  const [page, setPage] = useState(1);
  const { marking, markRead } = useMarkRead();
  const query = useQuery({
    queryKey: announcementKeys.received(page, false),
    queryFn: () => announcementsApi.received(page),
    placeholderData: (previous) => previous,
  });
  const text = labels.received;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
        {query.data === undefined || query.data.meta.unread === 0 ? null : (
          <span className="text-note font-semibold text-accent-text">
            {text.unread(formatNumber(query.data.meta.unread))}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-24" />
        ) : query.isError ? (
          <Banner
            tone="danger"
            role="alert"
            action={
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                {fr.common.retry}
              </Button>
            }
          >
            {text.loadError}
          </Banner>
        ) : query.data.data.length === 0 ? (
          <EmptyState icon={Megaphone}>{text.empty}</EmptyState>
        ) : (
          <div className="grid gap-3">
            <ul aria-label={text.title} className="grid gap-3">
              {query.data.data.map((announcement) => (
                <li key={announcement.id}>
                  <article
                    aria-label={announcement.title}
                    className="grid gap-2 rounded-card border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">{announcement.title}</h3>
                      <ReadBadge announcement={announcement} />
                    </div>
                    <AnnouncementBody announcement={announcement} />
                    {announcement.read === true ? null : (
                      <div>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={marking === announcement.id}
                          onClick={() => void markRead(announcement, text.marked)}
                        >
                          {text.markRead}
                        </Button>
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ul>
            {query.data.meta.last_page > 1 ? (
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(page - 1);
                  }}
                >
                  {fr.table.previous}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= query.data.meta.last_page}
                  onClick={() => {
                    setPage(page + 1);
                  }}
                >
                  {fr.table.next}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** « Message de mon CGA » (F-DSH-03) : le dernier message reçu par l'adhérent. */
export function MemberMessageCard() {
  const { marking, markRead } = useMarkRead();
  const query = useQuery({
    queryKey: announcementKeys.received(1, false),
    queryFn: () => announcementsApi.received(1),
  });
  const text = labels.member;
  const latest = query.data?.data[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
        {latest === undefined ? null : <ReadBadge announcement={latest} />}
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-16" />
        ) : query.isError ? (
          <Banner tone="danger" role="alert">
            {text.loadError}
          </Banner>
        ) : latest === undefined ? (
          <p className="text-note text-muted">{text.empty}</p>
        ) : (
          <article aria-label={latest.title} className="grid gap-2">
            <h3 className="font-semibold">{latest.title}</h3>
            <AnnouncementBody announcement={latest} />
            {latest.read === true ? null : (
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={marking === latest.id}
                  onClick={() => void markRead(latest, labels.received.marked)}
                >
                  {text.markRead}
                </Button>
              </div>
            )}
          </article>
        )}
      </CardContent>
    </Card>
  );
}
