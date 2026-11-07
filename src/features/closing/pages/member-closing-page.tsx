import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { DOCUMENT_TYPES } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/session/auth-context';
import { closingApi, closingKeys, type ClosingItem } from '@/features/closing/api/closing-api';
import { ItemSteps } from '@/features/closing/components/closing-steps';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/adherent/cloture` (03-APPFLOW §5.2, F-OBL-08) : étapes de l'exercice et dates ; « Déposer des
 * pièces » crée une préoccupation « Pièces de clôture » avec les fichiers joints (PRD M10). Seuls les
 * exercices dont la campagne est ouverte sont proposés au dépôt.
 */
const labels = fr.closing.memberSpace;
const required = fr.members.create.errors.required;

function DepositDialog({ item, onClose }: { item: ClosingItem; onClose: () => void }) {
  const [subject, setSubject] = useState(labels.defaultSubject(String(item.campaign.fiscal_year)));
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = {
      subject: subject.trim() === '' ? required : undefined,
      message: message.trim() === '' ? required : undefined,
      attachments: files.length === 0 ? labels.filesRequired : undefined,
    };

    setErrors(missing);
    if (Object.values(missing).some((value) => value !== undefined)) {
      return;
    }

    setConflict(null);
    setSubmitting(true);
    try {
      await closingApi.depositPieces({ subject: subject.trim(), message: message.trim(), files });
      toast.success(labels.sent);
      onClose();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        const fields = Object.fromEntries(
          Object.entries(error.fields).map(([key, value]) => [
            key.startsWith('attachments') ? 'attachments' : key,
            value,
          ]),
        );

        setErrors(fields);
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.depositTitle}
      description={labels.depositDescription}
      submitLabel={labels.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <TextField
        id="closing-deposit-subject"
        label={labels.subject}
        required
        value={subject}
        error={errors.subject}
        onChange={(event) => {
          setSubject(event.target.value);
        }}
      />
      <FormField
        id="closing-deposit-message"
        label={labels.message}
        required
        error={errors.message}
      >
        <Textarea
          {...fieldProps('closing-deposit-message', errors.message, false)}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </FormField>
      <FormField
        id="closing-deposit-files"
        label={labels.files}
        required
        error={errors.attachments}
      >
        <Input
          {...fieldProps('closing-deposit-files', errors.attachments, false)}
          type="file"
          multiple
          accept={DOCUMENT_TYPES}
          onChange={(event) => {
            setFiles(Array.from(event.target.files ?? []));
          }}
        />
      </FormField>
    </FormDialog>
  );
}

export function MemberClosingPage() {
  const { can } = useAuth();
  const [deposit, setDeposit] = useState<ClosingItem | null>(null);
  const query = useQuery({ queryKey: closingKeys.own, queryFn: () => closingApi.own() });
  const open = (query.data ?? []).filter((item) => item.campaign.status === 'open');

  return (
    <>
      <PageHeader title={labels.title} />
      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : query.isError ? (
        <Banner tone="danger" role="alert">
          {labels.loadError}
        </Banner>
      ) : open.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={CalendarCheck}>{labels.empty}</EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <p className="text-body text-muted">{labels.intro}</p>
          {open.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>
                  {fr.closing.memberTab.year(String(item.campaign.fiscal_year))}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-note text-muted">{labels.deliverable(item.deliverable_label)}</p>
                <ItemSteps steps={item.steps} />
                {can(permissionCodes.member.concerns) ? (
                  <div>
                    <Button
                      onClick={() => {
                        setDeposit(item);
                      }}
                    >
                      <Upload aria-hidden="true" />
                      {labels.deposit}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {deposit === null ? null : (
        <DepositDialog
          item={deposit}
          onClose={() => {
            setDeposit(null);
          }}
        />
      )}
    </>
  );
}
