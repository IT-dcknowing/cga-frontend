import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import { dossierApi } from '@/features/members/api/dossier-api';
import type { Member } from '@/features/members/api/members-api';
import { dossierKeys, useMember } from '@/features/members/api/queries';
import {
  BlockAttestationDialog,
  RegenerateDocumentsDialog,
  ReleaseAttestationDialog,
} from '@/features/members/components/attestation-dialogs';
import { DocumentsTab } from '@/features/members/components/documents-tab';
import { FinanceTab } from '@/features/members/components/finance-tab';
import {
  CancelRadiationDialog,
  ChangeRegimeDialog,
  DeleteDraftDialog,
  EditMemberDialog,
  MoveToCgaDialog,
  RequestRadiationDialog,
  ValidateMembershipDialog,
  ValidateRadiationDialog,
} from '@/features/members/components/member-dialogs';
import {
  AccessesTab,
  HistoryTab,
  IdentityTab,
  PiecesTab,
} from '@/features/members/components/member-tabs';
import { PortfolioBadge, ReferrerTag } from '@/features/members/components/portfolio-badge';
import { documentFieldsChanged, memberNumber, memberRoutes } from '@/features/members/lib/member';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/adherents/:id` (F-ADH-03, 03-APPFLOW §4.3) : en-tête (raison sociale, n°, ancien n°, badges
 * portefeuille, apporteur, statut), bandeaux (brouillon, reclassement au réel, pièces, radiation),
 * actions selon le bloc `can` du serveur, onglets Identité · Honoraires et paiements · Documents ·
 * Pièces · Accès en ligne · Historique. Après la validation : bandeau vert et suites proposées
 * (produire le contrat et l'attestation, inviter l'adhérent). Les alertes proposent seulement
 * d'ouvrir une modale : la plateforme ne radie ni ne bloque jamais d'elle-même (RG-ADH-18, RG-DOC-10).
 */
const labels = fr.members.detail;

const TABS = ['identity', 'finance', 'documents', 'pieces', 'accesses', 'history'] as const;

type Tab = (typeof TABS)[number];

type DialogState =
  | {
      name:
        | 'edit'
        | 'validate'
        | 'regime'
        | 'cancelRadiation'
        | 'move'
        | 'delete'
        | 'block'
        | 'release'
        | 'regenerate';
    }
  | { name: 'radiation'; toCabinet: boolean; preset?: { initiator: string; reason: string } }
  | { name: 'validateRadiation'; defaultOutcome: string };

function Breadcrumb() {
  return (
    <Link to={memberRoutes.list} className="hover:text-ink hover:underline">
      {fr.nav.members}
    </Link>
  );
}

function LoadingMember() {
  return (
    <div aria-busy="true">
      <span className="sr-only">{fr.common.loading}</span>
      <Skeleton className="mb-2 h-3 w-32" />
      <Skeleton className="mb-6 h-8 w-80 max-w-full" />
      <Card>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Banners({
  member,
  open,
  showPieces,
}: {
  member: Member;
  open: (dialog: DialogState) => void;
  showPieces: () => void;
}) {
  const banners = [];
  const radiation = member.radiation;
  const items = fr.members.create.missing.items;

  if (member.status === 'draft') {
    const missing = member.missing_for_validation.map((code) => items[code] ?? code);

    banners.push(
      <Banner key="draft" tone="warning">
        {missing.length > 0 ? labels.banners.missing(missing.join(', ')) : labels.banners.draft}
      </Banner>,
    );
  }

  for (const alert of member.alerts) {
    const required = alert.code === 'radiation_required';

    banners.push(
      <Banner
        key={alert.code}
        tone={alert.overdue ? 'danger' : 'warning'}
        action={
          !required && alert.overdue && member.can.block_attestation ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                open({ name: 'block' });
              }}
            >
              {labels.blockDialog.action}
            </Button>
          ) : required && member.can.request_radiation ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                open({
                  name: 'radiation',
                  toCabinet: true,
                  preset: { initiator: 'cga', reason: 'reclassified_real_regime' },
                });
              }}
            >
              {labels.radiationDialog.action}
            </Button>
          ) : undefined
        }
      >
        {required ? labels.banners.radiationRequired(String(alert.days)) : alert.label}
      </Banner>,
    );
  }

  if (member.attestation_block) {
    const block = member.attestation_block;

    banners.push(
      <Banner
        key="attestation"
        tone="danger"
        action={
          member.can.release_attestation ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                open({ name: 'release' });
              }}
            >
              {labels.releaseDialog.action}
            </Button>
          ) : undefined
        }
      >
        {labels.banners.attestationBlocked(
          formatTimestampDate(block.blocked_at),
          block.trigger_label,
          block.reason,
        )}
      </Banner>,
    );
  }

  if (member.status !== 'draft' && member.pieces_status === 'pending') {
    banners.push(
      <Banner
        key="pieces"
        tone="warning"
        action={
          <Button variant="secondary" size="sm" onClick={showPieces}>
            {labels.banners.seePieces}
          </Button>
        }
      >
        {labels.banners.piecesPending}
      </Banner>,
    );
  }

  if (radiation !== null && radiation.status === 'requested') {
    banners.push(
      <Banner
        key="radiation"
        tone="warning"
        action={
          radiation.can.validate ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                open({ name: 'validateRadiation', defaultOutcome: 'closed' });
              }}
            >
              {labels.validateRadiationDialog.action}
            </Button>
          ) : undefined
        }
      >
        {labels.banners.radiationPending(formatTimestampDate(radiation.requested_at))}
      </Banner>,
    );
  }

  if (radiation !== null && radiation.validated_at !== null) {
    banners.push(
      <Banner key="radiated" tone="danger">
        {labels.banners.radiated(
          formatTimestampDate(radiation.validated_at),
          radiation.outcome_label ?? '',
        )}
      </Banner>,
    );
  }

  return banners.length === 0 ? null : <div className="mb-4 grid gap-2">{banners}</div>;
}

export function MemberPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can: allows } = useAuth();
  const queryClient = useQueryClient();
  const query = useMember(id);
  const [tab, setTab] = useState<Tab>('identity');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // Bandeau vert : adhésion validée ici, ou par l'assistant d'inscription (état de navigation).
  const [justValidated, setJustValidated] = useState(
    (location.state as { validated?: boolean } | null)?.validated === true,
  );
  const [producing, setProducing] = useState(false);

  if (query.isPending) {
    return <LoadingMember />;
  }

  if (query.isError) {
    return (
      <>
        <PageHeader breadcrumb={<Breadcrumb />} title={fr.errorScreens.unexpectedTitle} />
        <Banner
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {fr.common.retry}
            </Button>
          }
        >
          {labels.loadError}
        </Banner>
      </>
    );
  }

  const member = query.data;
  const { can } = member;
  const radiation = member.radiation;
  const number = memberNumber(member);
  const close = () => {
    setDialog(null);
  };
  const open = (next: DialogState) => {
    setDialog(next);
  };

  const menu: ActionMenuItem[] = [];

  /** Contrat et attestation produits en file (RG-DOC-05), suivis dans l'onglet Documents. */
  async function produceDocuments() {
    setProducing(true);

    try {
      await dossierApi.produce(member.id, 'membership_contract');
      await dossierApi.produce(member.id, 'membership_certificate');
      toast.success(labels.banners.produced);
      await queryClient.invalidateQueries({ queryKey: dossierKeys.documents(member.id) });
      setTab('documents');
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setProducing(false);
    }
  }

  if (can.change_regime) {
    menu.push({
      label: labels.regimeDialog.action,
      onSelect: () => {
        open({ name: 'regime' });
      },
    });
  }

  if (can.request_radiation) {
    menu.push(
      {
        label: labels.radiationDialog.action,
        onSelect: () => {
          open({ name: 'radiation', toCabinet: false });
        },
      },
      {
        label: labels.radiationDialog.toCabinetAction,
        onSelect: () => {
          open({ name: 'radiation', toCabinet: true });
        },
      },
    );
  }

  if (radiation?.can.validate === true && radiation.status === 'requested') {
    menu.push({
      label: labels.validateRadiationDialog.action,
      onSelect: () => {
        open({ name: 'validateRadiation', defaultOutcome: 'closed' });
      },
    });
  }

  if (can.block_attestation) {
    menu.push({
      label: labels.blockDialog.action,
      onSelect: () => {
        open({ name: 'block' });
      },
    });
  }

  if (can.release_attestation) {
    menu.push({
      label: labels.releaseDialog.action,
      onSelect: () => {
        open({ name: 'release' });
      },
    });
  }

  if (can.move_to_cga) {
    menu.push({
      label: labels.moveDialog.action,
      onSelect: () => {
        open({ name: 'move' });
      },
    });
  }

  if (radiation?.can.cancel === true) {
    menu.push({
      label: labels.cancelRadiationDialog.action,
      onSelect: () => {
        open({ name: 'cancelRadiation' });
      },
    });
  }

  if (can.delete) {
    menu.push({
      label: labels.deleteDialog.action,
      danger: true,
      onSelect: () => {
        open({ name: 'delete' });
      },
    });
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      {can.validate ? (
        <Button
          onClick={() => {
            open({ name: 'validate' });
          }}
        >
          <CheckCircle2 aria-hidden="true" />
          {labels.validateDialog.action}
        </Button>
      ) : null}
      {can.update ? (
        <Button
          variant="secondary"
          onClick={() => {
            open({ name: 'edit' });
          }}
        >
          <Pencil aria-hidden="true" />
          {labels.edit}
        </Button>
      ) : null}
      <ActionMenu label={labels.actions} items={menu} />
    </div>
  );

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb />} title={member.company_name} actions={actions} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-table font-semibold">{number ?? labels.noNumber}</span>
        {member.legacy_number !== null ? (
          <span className="text-note text-muted">{labels.legacyNumber(member.legacy_number)}</span>
        ) : null}
        <PortfolioBadge portfolio={member.portfolio} />
        {member.portfolio === 'cga' && member.referrer ? (
          <ReferrerTag label={member.referrer.label} />
        ) : null}
        <StatusBadge domain="member" status={member.status} />
        <StatusBadge domain="regime" status={member.regime} />
        {member.attestation_blocked ? (
          <span className="inline-flex items-center rounded-badge bg-danger-soft px-2 py-0.5 text-badge font-bold text-danger">
            {labels.attestationBlocked}
          </span>
        ) : null}
      </div>

      {justValidated && member.status !== 'draft' ? (
        <Banner
          tone="success"
          role="status"
          className="mb-4"
          action={
            <div className="flex flex-wrap gap-2">
              {member.portfolio === 'cga' && allows(permissionCodes.cga.documentsProduce) ? (
                <Button size="sm" loading={producing} onClick={() => void produceDocuments()}>
                  {labels.banners.produceDocuments}
                </Button>
              ) : null}
              {allows(permissionCodes.cga.membersAccess) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTab('accesses');
                  }}
                >
                  {labels.banners.inviteOnline}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setJustValidated(false);
                }}
              >
                {labels.banners.close}
              </Button>
            </div>
          }
        >
          {member.portfolio === 'cga'
            ? labels.banners.validated(number ?? '')
            : labels.banners.clientCreated(number ?? '')}
        </Banner>
      ) : null}

      <Banners
        member={member}
        open={open}
        showPieces={() => {
          setTab('pieces');
        }}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
      >
        <TabsList>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {labels.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="identity">
          <IdentityTab member={member} />
        </TabsContent>
        <TabsContent value="finance">
          <FinanceTab member={member} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab member={member} />
        </TabsContent>
        <TabsContent value="pieces">
          <PiecesTab member={member} />
        </TabsContent>
        <TabsContent value="accesses">
          <AccessesTab member={member} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab member={member} />
        </TabsContent>
      </Tabs>

      {dialog?.name === 'edit' ? (
        <EditMemberDialog
          member={member}
          onClose={close}
          onSaved={(before, after) => {
            // RG-ADH-07 : un champ du contrat ou de l'attestation a changé → le CGA décide.
            if (after.status !== 'draft' && documentFieldsChanged(before, after)) {
              open({ name: 'regenerate' });
            }
          }}
        />
      ) : null}
      {dialog?.name === 'validate' ? (
        <ValidateMembershipDialog
          member={member}
          onClose={close}
          onValidated={() => {
            setJustValidated(true);
          }}
        />
      ) : null}
      {dialog?.name === 'block' ? <BlockAttestationDialog member={member} onClose={close} /> : null}
      {dialog?.name === 'release' ? (
        <ReleaseAttestationDialog member={member} onClose={close} />
      ) : null}
      {dialog?.name === 'regenerate' ? (
        <RegenerateDocumentsDialog member={member} onClose={close} />
      ) : null}
      {dialog?.name === 'regime' ? <ChangeRegimeDialog member={member} onClose={close} /> : null}
      {dialog?.name === 'radiation' ? (
        <RequestRadiationDialog
          member={member}
          onClose={close}
          toCabinet={dialog.toCabinet}
          preset={dialog.preset}
          onRequested={(requested) => {
            // Bascule vers le Cabinet : la validation s'enchaîne pour qui peut valider (03-APPFLOW §4.3).
            if (dialog.toCabinet && requested.radiation?.can.validate === true) {
              open({ name: 'validateRadiation', defaultOutcome: 'moved_to_cabinet' });
            }
          }}
        />
      ) : null}
      {dialog?.name === 'validateRadiation' ? (
        <ValidateRadiationDialog
          member={member}
          onClose={close}
          defaultOutcome={dialog.defaultOutcome}
        />
      ) : null}
      {dialog?.name === 'cancelRadiation' ? (
        <CancelRadiationDialog member={member} onClose={close} />
      ) : null}
      {dialog?.name === 'move' ? <MoveToCgaDialog member={member} onClose={close} /> : null}
      {dialog?.name === 'delete' ? (
        <DeleteDraftDialog
          member={member}
          onClose={close}
          onDeleted={() => {
            void navigate(`${memberRoutes.list}?tab=brouillons`);
          }}
        />
      ) : null}
    </>
  );
}
