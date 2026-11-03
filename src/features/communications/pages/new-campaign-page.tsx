import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  CAMPAIGN_CHANNELS,
  campaignKeys,
  campaignsApi,
  type CampaignFilter,
} from '@/features/communications/api/campaigns-api';
import { communicationsRoutes } from '@/features/communications/lib/routes';
import { httpMembersApi, REGIMES } from '@/features/members/api/members-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { formatNumber } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/communications/nouveau` (03-APPFLOW §4.3, F-COM-03) : 1. destinataires (portefeuille,
 * régimes, secteurs, honoraires impayés ; compteur en direct), 2. canaux (quota SMS restant),
 * 3. message libre ou modèle et aperçu, 4. envoi — direct jusqu'au seuil, « Envoyer pour validation »
 * au-delà pour un autre agent que le gérant (RG-COM-01), refus d'un quota SMS insuffisant (RG-COM-02).
 * Préremplissage depuis `/cga/echeances` : `?membres=id1,id2&modele=deadline`.
 */
const labels = fr.communications;
const text = labels.wizard;
const STEPS = text.steps;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debounced;
}

export function NewCampaignPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('modele') ?? '';
  const memberIds = (params.get('membres') ?? '').split(',').filter((id) => id !== '');
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState<CampaignFilter>({
    portfolio: 'cga',
    regimes: [],
    sector_ids: [],
    unpaid_fees: false,
    member_ids: memberIds,
  });
  const [channels, setChannels] = useState<string[]>(['platform']);
  const [template, setTemplate] = useState(preset in labels.templates ? preset : '');
  const [title, setTitle] = useState(labels.templates[template]?.title ?? '');
  const [body, setBody] = useState(labels.templates[template]?.body ?? '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sectors = useQuery({
    queryKey: ['referentials', 'sectors'],
    queryFn: () => httpMembersApi.sectors(),
  });
  const audienceInput = useDebounced({ channels, filter }, config.searchDebounceMs);
  const audience = useQuery({
    queryKey: campaignKeys.audience(audienceInput.channels, audienceInput.filter),
    queryFn: () => campaignsApi.audience(audienceInput.channels, audienceInput.filter),
    enabled: audienceInput.channels.length > 0,
    // Le dernier compte reste affiché pendant le recomptage (pas de clignotement « Comptage… »).
    placeholderData: (previous) => previous,
  });
  const count = audience.data?.recipients_count ?? null;
  const smsShort =
    audience.data !== undefined && audience.data.sms_needed > audience.data.sms_remaining;
  const needsValidation =
    audience.data?.needs_approval === true && !can(permissionCodes.cga.communicationsApprove);

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function chooseTemplate(key: string) {
    setTemplate(key);
    setTitle(labels.templates[key]?.title ?? '');
    setBody(labels.templates[key]?.body ?? '');
  }

  function next() {
    if (step === 1 && channels.length === 0) {
      setErrors({ channels: text.chooseChannel });

      return;
    }
    if (step === 2) {
      const missing = {
        title: title.trim() === '' ? text.required : undefined,
        body: body.trim() === '' ? text.required : undefined,
      };

      setErrors(missing);
      if (missing.title !== undefined || missing.body !== undefined) {
        return;
      }
    }
    setErrors({});
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function send() {
    setSubmitting(true);
    setConflict(null);
    try {
      const campaign = await campaignsApi.send({
        title: title.trim(),
        body: body.trim(),
        channels,
        filter,
      });

      toast.success(
        campaign.status === 'pending_approval'
          ? text.pending
          : text.sent(formatNumber(campaign.recipients_count)),
      );
      void navigate(`${communicationsRoutes.root}?onglet=historique`);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        const remaining = error.details.remaining;

        setConflict(
          error.code === 'sms_quota_insufficient' && typeof remaining === 'number'
            ? text.smsInsufficient(formatNumber(remaining))
            : error.message,
        );
      } else if (error instanceof ApiValidationError) {
        setConflict(Object.values(error.fields).at(0) ?? null);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const counter = count === null ? text.counting : text.counter(formatNumber(count));

  return (
    <>
      <PageHeader
        title={text.title}
        breadcrumb={<Link to={communicationsRoutes.root}>{text.back}</Link>}
      />
      <Card>
        <CardContent className="grid gap-4">
          <p className="text-label font-semibold" aria-live="polite">
            {text.step(String(step + 1), String(STEPS.length), STEPS[step])}
          </p>

          {step === 0 ? (
            <fieldset className="grid gap-4">
              <legend className="sr-only">{STEPS[0]}</legend>
              {can(permissionCodes.cga.cabinet) ? (
                <FormField id="campaign-portfolio" label={text.portfolio}>
                  <Select
                    id="campaign-portfolio"
                    value={filter.portfolio}
                    onChange={(event) => {
                      setFilter({
                        ...filter,
                        portfolio: event.target.value as CampaignFilter['portfolio'],
                      });
                    }}
                  >
                    {Object.entries(text.portfolios).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : null}
              <fieldset className="grid gap-2">
                <legend className="text-label font-semibold">{text.regimes}</legend>
                <div className="flex flex-wrap gap-4">
                  {REGIMES.map((regime) => (
                    <label key={regime} className="flex items-center gap-2 text-table">
                      <Checkbox
                        checked={filter.regimes.includes(regime)}
                        onChange={() => {
                          setFilter({ ...filter, regimes: toggle(filter.regimes, regime) });
                        }}
                      />
                      {regime}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="text-label font-semibold">{text.sectors}</legend>
                <p className="text-note text-muted">{text.sectorsHint}</p>
                <div className="flex flex-wrap gap-4">
                  {(sectors.data ?? []).map((sector) => (
                    <label key={sector.id} className="flex items-center gap-2 text-table">
                      <Checkbox
                        checked={filter.sector_ids.includes(sector.id)}
                        onChange={() => {
                          setFilter({
                            ...filter,
                            sector_ids: toggle(filter.sector_ids, sector.id),
                          });
                        }}
                      />
                      {sector.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-table">
                <Checkbox
                  checked={filter.unpaid_fees}
                  onChange={() => {
                    setFilter({ ...filter, unpaid_fees: !filter.unpaid_fees });
                  }}
                />
                {text.unpaidFees}
              </label>
              {filter.member_ids.length > 0 ? (
                <p className="text-note text-muted">
                  {text.selected(formatNumber(filter.member_ids.length))}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {step === 1 ? (
            <fieldset className="grid gap-2">
              <legend className="text-label font-semibold">{STEPS[1]}</legend>
              <p className="text-note text-muted">{text.channelsHint}</p>
              <div className="flex flex-wrap gap-4">
                {CAMPAIGN_CHANNELS.map((channel) => (
                  <label key={channel} className="flex items-center gap-2 text-table">
                    <Checkbox
                      checked={channels.includes(channel)}
                      onChange={() => {
                        setChannels(toggle(channels, channel));
                      }}
                    />
                    {labels.channels[channel]}
                  </label>
                ))}
              </div>
              {errors.channels === undefined ? null : (
                <p role="alert" className="text-note text-danger">
                  {errors.channels}
                </p>
              )}
              {audience.data !== undefined && channels.includes('sms') ? (
                <p className={smsShort ? 'text-table text-danger' : 'text-table'}>
                  {text.smsNeeded(
                    formatNumber(audience.data.sms_needed),
                    formatNumber(audience.data.sms_remaining),
                  )}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4">
              <FormField id="campaign-template" label={text.template}>
                <Select
                  id="campaign-template"
                  value={template}
                  onChange={(event) => {
                    chooseTemplate(event.target.value);
                  }}
                >
                  <option value="">{text.free}</option>
                  {Object.entries(labels.templates).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <TextField
                id="campaign-title"
                label={text.subject}
                required
                value={title}
                error={errors.title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
              <FormField id="campaign-body" label={text.body} required error={errors.body}>
                <Textarea
                  id="campaign-body"
                  rows={5}
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                  }}
                />
              </FormField>
              <section
                aria-label={text.preview}
                className="rounded-card border border-border bg-surface p-4"
              >
                <p className="text-label font-semibold">{text.preview}</p>
                <p className="mt-1 text-table font-semibold">{title}</p>
                <p className="text-table whitespace-pre-line">{body}</p>
              </section>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-3">
              {conflict === null ? null : (
                <Banner tone="danger" role="alert">
                  {conflict}
                </Banner>
              )}
              <p className="text-table font-semibold">{title}</p>
              <p className="text-table">
                {text.summary(
                  count === null ? '…' : formatNumber(count),
                  channels.map((channel) => labels.channels[channel] ?? channel).join(', '),
                )}
              </p>
              {needsValidation && audience.data !== undefined ? (
                <Banner tone="warning">
                  {text.approvalNotice(formatNumber(audience.data.approval_threshold))}
                </Banner>
              ) : null}
            </div>
          ) : null}

          <p
            className="text-table font-semibold"
            aria-live="polite"
            aria-busy={audience.isFetching || undefined}
          >
            {count === 0 ? text.noRecipient : counter}
          </p>

          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-between">
            <Button
              variant="secondary"
              disabled={step === 0 || submitting}
              onClick={() => {
                setStep((current) => Math.max(current - 1, 0));
              }}
            >
              {text.previous}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={count === 0}>
                {text.next}
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={submitting}
                disabled={count === 0 || count === null}
                onClick={() => void send()}
              >
                {needsValidation ? text.sendForApproval : text.send}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
