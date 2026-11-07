import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { DOCUMENT_TYPES } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  concernKeys,
  concernsApi,
  type Concern,
  type ConcernSpace,
} from '@/features/concerns/api/concerns-api';
import { StatusDialog, TransferDialog } from '@/features/concerns/components/concern-dialogs';
import { ConcernStatusBadge } from '@/features/concerns/components/concern-list';
import { ConversationThread } from '@/features/concerns/components/conversation-thread';
import { concernRoutes } from '@/features/concerns/lib/routes';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Fil d'une préoccupation (03-APPFLOW §3.2, §4.3, §5.2, 04-UX-UI « Fil », étape 7.4) : en-tête (objet,
 * catégorie, statut, délai écoulé), `ConversationThread`, zone de réponse en bas avec, pour celui qui
 * traite, la bascule « Note interne » et les pièces jointes ; selon le bloc `can` du serveur :
 * changement de statut (motif d'un rejet), « Rouvrir la demande », « Transmettre au CNCGA ».
 */
const labels = fr.concerns;

function ReplyForm({ space, concern }: { space: ConcernSpace; concern: Concern }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const canNote = concern.can?.note === true;
  const id = `concern-reply-${concern.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim() === '') {
      setError(fr.members.create.errors.required);

      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      const updated = await concernsApi.reply(space, concern.id, {
        message: message.trim(),
        internal: canNote && internal,
        files,
      });

      queryClient.setQueryData(concernKeys.detail(space, concern.id), updated);
      await queryClient.invalidateQueries({ queryKey: concernKeys.all });
      toast.success(canNote && internal ? labels.reply.noteSaved : labels.reply.sent);
      setMessage('');
      setInternal(false);
      setFiles([]);
      setFormKey((key) => key + 1);
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setError(Object.values(caught.fields)[0]);
      } else if (caught instanceof ApiBusinessError) {
        toast.error(caught.message);
      } else {
        toastUnexpectedError(caught);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      key={formKey}
      aria-label={space === 'member' ? labels.reply.memberLabel : labels.reply.label}
      className="sticky bottom-0 grid gap-3 rounded-card border border-border bg-card p-4"
      onSubmit={(event) => void submit(event)}
    >
      <FormField
        id={id}
        label={space === 'member' ? labels.reply.memberLabel : labels.reply.label}
        error={error}
      >
        <Textarea
          {...fieldProps(id, error, false)}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </FormField>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FormField id={`${id}-files`} label={labels.reply.files}>
          <Input
            id={`${id}-files`}
            type="file"
            multiple
            accept={DOCUMENT_TYPES}
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
            }}
          />
        </FormField>
        {canNote ? (
          <CheckboxField id={`${id}-internal`} label={labels.reply.internal}>
            <Checkbox
              id={`${id}-internal`}
              checked={internal}
              onChange={(event) => {
                setInternal(event.target.checked);
              }}
            />
          </CheckboxField>
        ) : null}
        <Button type="submit" disabled={submitting}>
          <Send aria-hidden="true" />
          {labels.reply.submit}
        </Button>
      </div>
    </form>
  );
}

function ConcernView({ space, concern }: { space: ConcernSpace; concern: Concern }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'status' | 'transfer' | null>(null);
  const [reopening, setReopening] = useState(false);
  const can = concern.can;

  async function reopen() {
    setReopening(true);
    try {
      const updated = await concernsApi.reopen(space === 'member' ? 'member' : 'cga', concern.id);

      queryClient.setQueryData(concernKeys.detail(space, concern.id), updated);
      await queryClient.invalidateQueries({ queryKey: concernKeys.all });
      toast.success(labels.reopen.done);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-note text-muted">
              {labels.detail.header(
                labels.categories[concern.category] ?? concern.category_label,
                String(concern.elapsed_days),
              )}
            </span>
            <ConcernStatusBadge status={concern.status} />
          </div>
          {concern.member === undefined || concern.member === null ? null : (
            <p className="text-note">{labels.detail.member(concern.member.company_name)}</p>
          )}
          {concern.organization === undefined ? null : (
            <p className="text-note">{labels.detail.organization(concern.organization.name)}</p>
          )}
          {concern.rejection_reason === null ? null : (
            <p className="text-note text-danger">
              {labels.detail.rejection(concern.rejection_reason)}
            </p>
          )}
          {concern.transfer === undefined || concern.transfer === null ? null : (
            <p className="text-note text-muted">
              {labels.detail.transfer(
                labels.statuses[concern.transfer.status] ?? concern.transfer.status_label,
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {can?.change_status === true && space !== 'member' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDialog('status');
                }}
              >
                {labels.status.action}
              </Button>
            ) : null}
            {can?.transfer === true && space === 'cga' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDialog('transfer');
                }}
              >
                {labels.transfer.action}
              </Button>
            ) : null}
            {can?.reopen === true && space !== 'network' ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={reopening}
                onClick={() => void reopen()}
              >
                <RotateCcw aria-hidden="true" />
                {labels.reopen.action}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ConversationThread messages={concern.messages ?? []} />

      {can?.reply === true || can?.note === true ? (
        <ReplyForm space={space} concern={concern} />
      ) : null}

      {dialog === 'status' && space !== 'member' ? (
        <StatusDialog
          space={space}
          concern={concern}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'transfer' ? (
        <TransferDialog
          concern={concern}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function ConcernPage({ space }: { space: ConcernSpace }) {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: concernKeys.detail(space, id),
    queryFn: () => concernsApi.show(space, id),
  });

  return (
    <>
      <PageHeader
        title={query.data?.subject ?? (space === 'member' ? labels.memberTitle : labels.title)}
        breadcrumb={<Link to={concernRoutes.list(space)}>{labels.detail.back}</Link>}
      />
      {query.isPending ? (
        <Skeleton className="h-48 w-full" />
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
          {labels.detail.loadError}
        </Banner>
      ) : (
        <ConcernView space={space} concern={query.data} />
      )}
    </>
  );
}
