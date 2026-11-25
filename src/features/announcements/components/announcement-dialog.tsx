import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/shared/form-dialog';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { DOCUMENT_TYPES } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  announcementKeys,
  announcementsApi,
  NETWORK_AUDIENCES,
  type AnnouncementSpace,
} from '@/features/announcements/api/announcements-api';
import { httpMembersApi, REGIMES } from '@/features/members/api/members-api';
import { useOrganizations } from '@/features/organizations/api/queries';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatNumber } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * « + Nouvelle annonce » (03-APPFLOW §3.2 et §4.3, F-COM-01 et 02, étape 7.6) : titre, texte, pièce
 * jointe, case e-mail ; pour le CNCGA, la cible (tous les CGA, certains CGA choisis, tous les adhérents
 * du réseau) ; pour un CGA, ses adhérents, filtrés ou non par régime et secteur. L'annonce est publiée
 * aussitôt ; le serveur calcule les destinataires et refait chaque contrôle.
 */
const labels = fr.announcements.create;
const required = fr.members.create.errors.required;

type Errors = Record<string, string | undefined>;

function toggle(list: string[], value: string, checked: boolean): string[] {
  return checked ? [...list, value] : list.filter((item) => item !== value);
}

/** Choix des CGA destinataires (« Certains CGA ») : recherche dans le registre, cases à cocher. */
function CgaPicker({
  chosen,
  onChange,
  error,
}: {
  chosen: Map<string, string>;
  onChange: (chosen: Map<string, string>) => void;
  error?: string;
}) {
  const [search, setSearch] = useState('');
  const query = useOrganizations({
    search,
    status: null,
    subscriptionStatus: null,
    regionalDirectorateId: null,
    sort: null,
    page: 1,
  });

  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={error === undefined ? undefined : 'announcement-cgas-error'}
    >
      <legend className="mb-1 text-label font-semibold text-muted">
        {labels.fields.cgas}
        {chosen.size > 0 ? ` · ${labels.chosen(formatNumber(chosen.size))}` : null}
      </legend>
      <FormField id="announcement-cga-search" label={labels.fields.search}>
        <Input
          id="announcement-cga-search"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </FormField>
      <ul aria-label={labels.fields.cgas} className="max-h-48 overflow-y-auto">
        {(query.data?.items ?? []).map((cga) => (
          <li key={cga.id}>
            <CheckboxField id={`announcement-cga-${cga.id}`} label={cga.name}>
              <Checkbox
                id={`announcement-cga-${cga.id}`}
                checked={chosen.has(cga.id)}
                onChange={(event) => {
                  const next = new Map(chosen);

                  if (event.target.checked) {
                    next.set(cga.id, cga.name);
                  } else {
                    next.delete(cga.id);
                  }
                  onChange(next);
                }}
              />
            </CheckboxField>
          </li>
        ))}
      </ul>
      {error === undefined ? null : (
        <p id="announcement-cgas-error" className="text-note text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Filtres des adhérents destinataires d'une annonce du centre (vides : tous). */
function MemberFilter({
  regimes,
  sectorIds,
  onRegimes,
  onSectors,
}: {
  regimes: string[];
  sectorIds: string[];
  onRegimes: (regimes: string[]) => void;
  onSectors: (sectorIds: string[]) => void;
}) {
  const sectors = useQuery({
    queryKey: ['referentials', 'sectors'],
    queryFn: () => httpMembersApi.sectors(),
  });

  return (
    <>
      <p className="text-note text-muted">{labels.ownMembers}</p>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-label font-semibold text-muted">
          {labels.fields.regimes}
        </legend>
        <div className="flex flex-wrap gap-x-6">
          {REGIMES.map((regime) => (
            <CheckboxField key={regime} id={`announcement-regime-${regime}`} label={regime}>
              <Checkbox
                id={`announcement-regime-${regime}`}
                checked={regimes.includes(regime)}
                onChange={(event) => {
                  onRegimes(toggle(regimes, regime, event.target.checked));
                }}
              />
            </CheckboxField>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-label font-semibold text-muted">
          {labels.fields.sectors}
        </legend>
        <div className="grid max-h-40 gap-x-6 overflow-y-auto sm:grid-cols-2">
          {(sectors.data ?? []).map((sector) => (
            <CheckboxField
              key={sector.id}
              id={`announcement-sector-${sector.id}`}
              label={sector.name}
            >
              <Checkbox
                id={`announcement-sector-${sector.id}`}
                checked={sectorIds.includes(sector.id)}
                onChange={(event) => {
                  onSectors(toggle(sectorIds, sector.id, event.target.checked));
                }}
              />
            </CheckboxField>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function NewAnnouncementDialog({
  space,
  onClose,
}: {
  space: AnnouncementSpace;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [audience, setAudience] = useState<string>(NETWORK_AUDIENCES[0]);
  const [cgas, setCgas] = useState<Map<string, string>>(new Map());
  const [regimes, setRegimes] = useState<string[]>([]);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Errors = {
      title: title.trim() === '' ? required : undefined,
      body: body.trim() === '' ? required : undefined,
      organization_ids:
        space === 'network' && audience === 'selected_cgas' && cgas.size === 0
          ? labels.noCga
          : undefined,
    };

    setErrors(missing);
    setConflict(null);
    if (Object.values(missing).some((value) => value !== undefined)) {
      return;
    }
    setSubmitting(true);
    try {
      const { recipients } = await announcementsApi.publish(space, {
        title: title.trim(),
        body: body.trim(),
        attachment,
        sendEmail,
        audience,
        organizationIds: [...cgas.keys()],
        regimes,
        sectorIds,
      });

      await queryClient.invalidateQueries({ queryKey: announcementKeys.all });
      toast.success(labels.published(formatNumber(recipients)));
      onClose();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.fields).map(([key, message]) => [
              key.startsWith('organization_ids') ? 'organization_ids' : key,
              message,
            ]),
          ),
        );
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
      title={labels.title}
      submitLabel={labels.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <TextField
        id="announcement-title"
        label={labels.fields.title}
        required
        value={title}
        error={errors.title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
      <FormField id="announcement-body" label={labels.fields.body} required error={errors.body}>
        <Textarea
          {...fieldProps('announcement-body', errors.body, false)}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </FormField>
      <FormField
        id="announcement-attachment"
        label={labels.fields.attachment}
        error={errors.attachment}
      >
        <Input
          {...fieldProps('announcement-attachment', errors.attachment, false)}
          type="file"
          accept={DOCUMENT_TYPES}
          onChange={(event) => {
            setAttachment(event.target.files?.[0] ?? null);
          }}
        />
      </FormField>
      {space === 'network' ? (
        <>
          <RadioGroupField
            id="announcement-audience"
            legend={labels.fields.audience}
            required
            error={errors.audience}
          >
            {NETWORK_AUDIENCES.map((value) => (
              <RadioOption key={value} label={labels.audiences[value]}>
                <Radio
                  name="announcement-audience"
                  value={value}
                  checked={audience === value}
                  onChange={() => {
                    setAudience(value);
                  }}
                />
              </RadioOption>
            ))}
          </RadioGroupField>
          {audience === 'selected_cgas' ? (
            <CgaPicker chosen={cgas} onChange={setCgas} error={errors.organization_ids} />
          ) : null}
        </>
      ) : (
        <MemberFilter
          regimes={regimes}
          sectorIds={sectorIds}
          onRegimes={setRegimes}
          onSectors={setSectorIds}
        />
      )}
      <CheckboxField id="announcement-email" label={labels.fields.email}>
        <Checkbox
          id="announcement-email"
          checked={sendEmail}
          onChange={(event) => {
            setSendEmail(event.target.checked);
          }}
        />
      </CheckboxField>
    </FormDialog>
  );
}
