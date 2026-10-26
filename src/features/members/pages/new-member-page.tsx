import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { UnsavedChangesGuard } from '@/components/shared/unsaved-changes-guard';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { useAuth } from '@/features/auth/session/auth-context';
import { ErrorScreen } from '@/features/errors/pages/error-screen';
import {
  httpMembersApi as membersApi,
  REGIMES_OF,
  type Member,
  type NccCheck,
  type Portfolio,
} from '@/features/members/api/members-api';
import {
  useCommunes,
  useFeeSchedule,
  useMemberSaved,
  useReferrers,
  useSectors,
  useTaxOffices,
} from '@/features/members/api/queries';
import { ActivityFields, IdentificationFields } from '@/features/members/components/member-fields';
import { PaymentDialog } from '@/features/members/components/payment-dialog';
import { ProposeSectorDialog } from '@/features/members/components/propose-sector-dialog';
import { memberNumber, memberRoutes } from '@/features/members/lib/member';
import {
  checkMember,
  emptyMemberForm,
  formFieldOf,
  memberInput,
  missingStep,
  scheduledFees,
  stepOf,
  type CheckLevel,
  type MemberField,
  type MemberForm,
} from '@/features/members/lib/member-form';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/adherents/nouveau` (F-ADH-02, 03-APPFLOW §4.3) : assistant en deux étapes, « Identification »
 * puis « Activité et adhésion ». Portefeuille CGA par défaut (Cabinet avec le droit de le voir) ; le
 * NCC est contrôlé à la sortie du champ (doublon dans le centre, adhérent d'un autre CGA : blocage,
 * sans jamais le nommer). « Enregistrer comme brouillon » ou « Valider l'adhésion » ; ce qui manque
 * à la validation s'affiche en liste, avec un lien vers son étape. Le serveur refait chaque contrôle.
 */
const labels = fr.members.create;
const STEPS = [labels.steps.identification, labels.steps.activity];

type Saving = 'draft' | 'validate' | null;

/** Résultat du contrôle du NCC, pour la saisie qui l'a demandé. */
type NccState = { input: string; result: NccCheck } | null;

function PortfolioChoice({
  form,
  disabled,
  onChange,
}: {
  form: UseFormReturn<MemberForm>;
  disabled: boolean;
  onChange: (portfolio: Portfolio) => void;
}) {
  const portfolio = useWatch({ control: form.control, name: 'portfolio' });

  return (
    <RadioGroupField id="member-portfolio" legend={fr.members.fields.portfolio} required>
      <div className="flex flex-wrap gap-4">
        {(['cga', 'cabinet'] as const).map((choice) => (
          <RadioOption key={choice} label={fr.members.portfolio[choice]}>
            <Radio
              name="member-portfolio"
              value={choice}
              checked={portfolio === choice}
              disabled={disabled}
              onChange={() => {
                onChange(choice);
              }}
            />
          </RadioOption>
        ))}
      </div>
    </RadioGroupField>
  );
}

export function NewMemberPage() {
  const { can } = useAuth();

  // Le menu demande « Voir les adhérents » ; inscrire demande en plus « Inscrire » (01-PRD §3.3).
  return can(permissionCodes.cga.membersCreate) ? (
    <NewMemberWizard />
  ) : (
    <ErrorScreen kind="forbidden" />
  );
}

function NewMemberWizard() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const saved = useMemberSaved();
  const seesCabinet = can(permissionCodes.cga.cabinet);
  const seesReferrers = can(permissionCodes.cga.referrers);
  const taxOffices = useTaxOffices();
  const communes = useCommunes();
  const sectors = useSectors();
  const schedule = useFeeSchedule();
  const referrers = useReferrers(seesReferrers);
  const form = useForm<MemberForm>({ defaultValues: emptyMemberForm('cga') });
  const { control, getValues, getFieldState, setValue, setError, clearErrors, setFocus } = form;
  const [portfolio, regime, ncc] = useWatch({ control, name: ['portfolio', 'regime', 'ncc'] });
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<Member | null>(null);
  const [nccState, setNccState] = useState<NccState>(null);
  const [checkingNcc, setCheckingNcc] = useState(false);
  const [refusedExclusive, setRefusedExclusive] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [payingFor, setPayingFor] = useState<Member | null>(null);
  // Dossier enregistré : la navigation qui suit ne repasse pas par « Quitter sans enregistrer ? ».
  const recorded = useRef(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [saving, setSaving] = useState<Saving>(null);
  const [proposing, setProposing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractUploaded, setContractUploaded] = useState(false);
  const [proposedSector, setProposedSector] = useState<string | null>(null);

  // Contrôle du NCC valable pour la saisie contrôlée ; refus du serveur valable pour son NCC.
  const typed = ncc.trim();
  const check = nccState !== null && nccState.input === typed ? nccState.result : null;
  const existing =
    check?.existing !== null && check?.existing !== undefined && check.existing.id !== draft?.id
      ? check.existing
      : null;
  const existingId = existing?.id ?? null;
  const blocked =
    portfolio === 'cga' && (check?.enrolled_elsewhere === true || refusedExclusive === typed);
  const stopped = blocked || existingId !== null;

  // Pré-remplissage par le barème : honoraires selon le régime, droit d'adhésion du centre (F-PAY-01).
  const fees = scheduledFees(schedule.data, regime);
  const entryFee = schedule.data?.entry_fee.amount;

  const feesAmount = fees?.amount ?? '';
  const feesPeriodicity = fees?.periodicity ?? null;

  useEffect(() => {
    // Une saisie de l'utilisateur l'emporte sur le barème.
    if (!getFieldState('fees_amount').isDirty) {
      setValue('fees_amount', feesAmount);
    }

    if (!getFieldState('fees_periodicity').isDirty && feesPeriodicity !== null) {
      setValue('fees_periodicity', feesPeriodicity);
    }
  }, [feesAmount, feesPeriodicity, getFieldState, setValue]);

  useEffect(() => {
    if (!getFieldState('entry_fee_amount').isDirty && entryFee !== undefined) {
      setValue('entry_fee_amount', String(entryFee));
    }
  }, [entryFee, getFieldState, setValue]);

  // Secteur proposé : choisi dès que son option est dans la liste (RG-REF-01).
  useEffect(() => {
    if (proposedSector !== null && sectors.data?.some((sector) => sector.id === proposedSector)) {
      setValue('sector_id', proposedSector, { shouldDirty: true });
      clearErrors('sector_id');
    }
  }, [proposedSector, sectors.data, setValue, clearErrors]);

  // « Abandonner » : la page se quitte sans repasser par « Quitter sans enregistrer ? ».
  useEffect(() => {
    if (leaving) {
      void navigate(memberRoutes.list);
    }
  }, [leaving, navigate]);

  function choosePortfolio(next: Portfolio) {
    setValue('portfolio', next, { shouldDirty: true });

    if (!REGIMES_OF[next].includes(getValues('regime') as never)) {
      setValue('regime', REGIMES_OF[next][0], { shouldDirty: true });
    }

    // Le Cabinet n'a ni apporteur ni contrat CGA (RG-PTF-06, 08).
    if (next === 'cabinet') {
      setValue('referrer_id', '');
      setValue('cga_contract_signed_on', '');
      setValue('cga_contract_confirmed', false);
      setValue('exclusivity_confirmed', false);
      setContractFile(null);
    }
  }

  async function checkNcc() {
    const input = getValues('ncc').trim();

    if (input === '') {
      setNccState(null);

      return;
    }

    setCheckingNcc(true);

    try {
      const result = await membersApi.nccCheck(input);

      setNccState({ input, result });

      if (!result.valid) {
        setError('ncc', { type: 'server', message: labels.ncc.invalid });
      } else {
        clearErrors('ncc');
      }
    } catch (error) {
      // Contrôle de confort : le serveur refera la vérification à l'enregistrement.
      console.warn('Contrôle du NCC indisponible.', error);
      setNccState(null);
    } finally {
      setCheckingNcc(false);
    }
  }

  /** Étape du champ, puis focus sur lui une fois l'étape affichée. */
  function showField(field: MemberField) {
    setStep(stepOf(field));
    window.setTimeout(() => {
      setFocus(field);
    }, 0);
  }

  /** Contrôle d'un niveau ; les erreurs s'affichent sous les champs, sur l'étape du premier. */
  function passes(level: CheckLevel): boolean {
    const found = checkMember(level, getValues());

    clearErrors();

    for (const [field, message] of found) {
      setError(field, { type: 'required', message });
    }

    const [first] = found.keys();

    if (first === undefined) {
      return true;
    }

    showField(first);

    return false;
  }

  function showSaveFailure(error: unknown) {
    if (error instanceof ApiBusinessError) {
      if (error.code === 'ncc_already_registered') {
        // Le dossier existant, désigné par le refus, prend la place du contrôle à la volée.
        setNccState({
          input: getValues('ncc').trim(),
          result: {
            ncc: getValues('ncc'),
            valid: true,
            existing: {
              id: typeof error.details.member_id === 'string' ? error.details.member_id : '',
              company_name: '',
              status: String(error.details.status ?? ''),
              portfolio: String(error.details.portfolio ?? ''),
            },
            enrolled_elsewhere: false,
          },
        });
        setStep(1);
      } else if (error.code === 'membership_exclusive') {
        setRefusedExclusive(getValues('ncc').trim());
        setStep(1);
      } else {
        setConflict(error.message);
      }

      return;
    }

    if (error instanceof ApiValidationError) {
      let first: MemberField | null = null;

      for (const [apiField, message] of Object.entries(error.fields)) {
        const field = formFieldOf(apiField);

        if (field !== undefined) {
          setError(field, { type: 'server', message });
          first ??= field;
        }
      }

      if (first !== null) {
        showField(first);

        return;
      }
    }

    toastUnexpectedError(error);
  }

  /** Dépôt de l'exemplaire signé du contrat, une fois le dossier enregistré (RG-PTF-08). */
  async function uploadContract(member: Member) {
    if (contractFile === null || contractUploaded || member.portfolio !== 'cga') {
      return;
    }

    try {
      await membersApi.uploadPiece(member.id, 'signed_cga_contract', contractFile);
      setContractUploaded(true);
    } catch (error) {
      toast.error(labels.pieceFailed, {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  /** Adhésion validée : toast, puis le dossier avec son bandeau vert et ses suites. */
  async function validated(member: Member, exclusivityConfirmed: boolean) {
    const result = await membersApi.validate(member.id, exclusivityConfirmed);
    const number = memberNumber(result) ?? '';

    saved(result);
    toast.success(
      result.portfolio === 'cga' ? labels.validated(number) : labels.clientCreated(number),
    );
    recorded.current = true;
    await navigate(memberRoutes.detail(result.id), { state: { validated: true } });
  }

  async function save(kind: 'draft' | 'validate') {
    setConflict(null);

    if (stopped || !passes(kind === 'draft' ? 'draft' : 'membership')) {
      return;
    }

    const values = getValues();

    setSaving(kind);

    let member: Member;

    try {
      member =
        draft === null
          ? await membersApi.create(values.portfolio, memberInput(values))
          : await membersApi.update(draft.id, memberInput(values));
    } catch (error) {
      showSaveFailure(error);
      setSaving(null);

      return;
    }

    setDraft(member);
    saved(member);
    await uploadContract(member);

    if (kind === 'draft') {
      toast.success(labels.draftSaved);
      recorded.current = true;
      await navigate(memberRoutes.detail(member.id));

      return;
    }

    try {
      await validated(member, values.exclusivity_confirmed);
    } catch (error) {
      setSaving(null);

      if (error instanceof ApiBusinessError && error.code === 'membership_incomplete') {
        const list = Array.isArray(error.details.missing) ? error.details.missing : [];
        const items = list.filter((item): item is string => typeof item === 'string');
        const blocking = items.filter((item) => item !== 'exclusivity_confirmed');

        // Seul le droit d'adhésion manque : son paiement, puis la validation (03-APPFLOW §4.3).
        if (
          can(permissionCodes.cga.payments) &&
          blocking.length > 0 &&
          blocking.every((item) => item === 'entry_fee_payment')
        ) {
          setPayingFor(member);
        } else {
          setMissing(items);
        }
      } else if (error instanceof ApiBusinessError && error.code === 'membership_exclusive') {
        setRefusedExclusive(values.ncc.trim());
        setStep(1);
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  function next() {
    if (!stopped && passes('identification')) {
      setStep(2);
    }
  }

  function cancel() {
    if (form.formState.isDirty) {
      setCancelling(true);
    } else {
      setLeaving(true);
    }
  }

  const busy = saving !== null;
  const nccNotice = checkingNcc ? (
    <p className="text-note text-muted" role="status">
      {labels.ncc.checking}
    </p>
  ) : existingId !== null ? (
    <p className="text-note text-danger" role="alert">
      {labels.ncc.existing}{' '}
      <Link className="font-semibold underline" to={memberRoutes.detail(existingId)}>
        {labels.ncc.openExisting}
      </Link>
    </p>
  ) : null;
  const contractInput = (
    <FormField
      id="member-contract-file"
      label={fr.members.fields.contractFile}
      hint={fr.members.fields.contractFileHint}
    >
      <Input
        id="member-contract-file"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        aria-describedby="member-contract-file-hint"
        disabled={busy}
        onChange={(event) => {
          setContractFile(event.target.files?.[0] ?? null);
          setContractUploaded(false);
        }}
      />
    </FormField>
  );

  return (
    <>
      <PageHeader
        title={labels.title}
        breadcrumb={<Link to={memberRoutes.list}>{fr.nav.members}</Link>}
      />

      <Card>
        <CardContent className="grid gap-5">
          <div>
            <p className="text-overline font-bold uppercase text-muted">
              {labels.stepOf(String(step), String(STEPS.length))}
            </p>
            <h2 className="text-card-title font-bold text-ink">{STEPS[step - 1]}</h2>
          </div>

          {conflict !== null ? (
            <Banner tone="danger" role="alert">
              {conflict}
            </Banner>
          ) : null}

          {blocked ? (
            <Banner
              tone="danger"
              role="alert"
              action={
                seesCabinet && draft === null ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      choosePortfolio('cabinet');
                    }}
                  >
                    {labels.ncc.toCabinet}
                  </Button>
                ) : undefined
              }
            >
              {labels.ncc.elsewhere}
            </Banner>
          ) : null}

          <div className={step === 1 ? undefined : 'hidden'}>
            <IdentificationFields
              form={form}
              disabled={busy}
              taxOffices={taxOffices.data}
              communes={communes.data}
              referrers={seesReferrers ? (referrers.data ?? []) : undefined}
              portfolioChoice={
                seesCabinet ? (
                  <PortfolioChoice
                    form={form}
                    disabled={busy || draft !== null}
                    onChange={choosePortfolio}
                  />
                ) : undefined
              }
              nccNotice={nccNotice}
              onNccBlur={() => void checkNcc()}
            />
          </div>

          <div className={step === 2 ? undefined : 'hidden'}>
            <ActivityFields
              form={form}
              disabled={busy}
              sectors={sectors.data}
              onProposeSector={() => {
                setProposing(true);
              }}
              contractFile={contractInput}
              withExclusivity
            />
          </div>

          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              {step === 2 ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setStep(1);
                  }}
                >
                  {labels.back}
                </Button>
              ) : null}
              <Button variant="secondary" disabled={busy} onClick={cancel}>
                {fr.common.cancel}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={saving === 'draft'}
                disabled={busy || stopped}
                onClick={() => void save('draft')}
              >
                {labels.saveDraft}
              </Button>
              {step === 1 ? (
                <Button disabled={busy || stopped} onClick={next}>
                  {labels.next}
                </Button>
              ) : (
                <Button
                  loading={saving === 'validate'}
                  disabled={busy || stopped}
                  onClick={() => void save('validate')}
                >
                  {labels.validate}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesGuard
        when={form.formState.isDirty && saving === null && !leaving}
        saved={recorded}
      />

      {payingFor !== null ? (
        <PaymentDialog
          memberId={payingFor.id}
          only="entry_fee"
          title={fr.members.finance.entryFee.title}
          submitLabel={fr.members.finance.entryFee.submit}
          onClose={() => {
            setPayingFor(null);
          }}
          onRecorded={async () => {
            setSaving('validate');

            try {
              await validated(payingFor, getValues('exclusivity_confirmed'));
            } catch (error) {
              setSaving(null);
              setPayingFor(null);

              if (error instanceof ApiBusinessError) {
                setConflict(error.message);
              } else {
                toastUnexpectedError(error);
              }
            }
          }}
        />
      ) : null}

      {proposing ? (
        <ProposeSectorDialog
          onClose={() => {
            setProposing(false);
          }}
          onProposed={(sector) => {
            setProposedSector(sector.id);
            setProposing(false);
          }}
        />
      ) : null}

      <Dialog
        open={cancelling}
        onOpenChange={(open) => {
          setCancelling(open);
        }}
      >
        <DialogContent title={labels.cancel.title} description={labels.cancel.body}>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setCancelling(false);
              }}
            >
              {labels.cancel.stay}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setCancelling(false);
                setLeaving(true);
              }}
            >
              {labels.cancel.leave}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={missing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMissing(null);
          }
        }}
      >
        <DialogContent title={labels.missing.title} description={labels.missing.intro}>
          <DialogBody>
            <ul className="grid gap-2">
              {(missing ?? []).map((code) => (
                <li key={code} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body">{labels.missing.items[code] ?? code}</span>
                  <Button
                    variant="link"
                    onClick={() => {
                      const target = missingStep(code);

                      setMissing(null);
                      setStep(target);
                    }}
                  >
                    {labels.missing.goTo(STEPS[missingStep(code) - 1])}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-note text-muted">{labels.missing.draftKept}</p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setMissing(null);
              }}
            >
              {fr.common.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
