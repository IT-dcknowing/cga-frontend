import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight, Download, Send, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  CLOSING_STEPS,
  closingApi,
  closingKeys,
  type ClosingCampaign,
  type ClosingFilters,
  type ClosingItem,
  type ClosingStep,
  type SkippedItem,
} from '@/features/closing/api/closing-api';
import {
  BulkAssignDialog,
  BulkStepDialog,
  EditItemDialog,
  MarkStepDialog,
} from '@/features/closing/components/closing-dialogs';
import { ItemSteps, StepTimeline } from '@/features/closing/components/closing-steps';
import { communicationsRoutes } from '@/features/communications/lib/routes';
import { memberRoutes } from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/cloture` (F-OBL-08, 03-APPFLOW §4.3, étape 4.11) : campagne de clôture de l'exercice choisi —
 * frise des 4 étapes (date, faits, en retard), filtres dans l'adresse (portefeuille, agent, étape,
 * en retard), tableau par dossier (étapes faites, retard en orange), sélection multiple → « Marquer
 * l'étape faite », « Envoyer un rappel de pièces » (envoi groupé prérempli), « Affecter à un agent » ;
 * bloc « Pour le rapport » (SMT et états financiers établis et transmis, portefeuille CGA).
 */
const labels = fr.closing;
const PORTFOLIOS = ['cga', 'cabinet'] as const;
const STEP_FILTERS = [...CLOSING_STEPS, 'done'] as const;

type Dialog =
  | { name: 'mark'; item: ClosingItem; step: ClosingStep }
  | { name: 'edit'; item: ClosingItem }
  | { name: 'bulkStep' | 'bulkAssign' };

function ReportBlock({
  report,
}: {
  report: Awaited<ReturnType<typeof closingApi.board>>['report'];
}) {
  const text = labels.report;
  const rows: [string, number][] = [
    [text.smtEstablished, report.smt_established],
    [text.smtTransmitted, report.smt_transmitted],
    [text.statementsEstablished, report.financial_statements_established],
    [text.statementsTransmitted, report.financial_statements_transmitted],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">{text.hint}</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-0.5">
              <dt className="text-note text-muted">{label}</dt>
              <dd className="text-page-title font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ItemRow({
  item,
  selectable,
  selected,
  onToggle,
  onAction,
}: {
  item: ClosingItem;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onAction: (dialog: Dialog) => void;
}) {
  const name = item.member?.company_name ?? '';
  const next = item.next_step;
  const actions: ActionMenuItem[] = [];

  if (item.can?.mark_step === true && next !== null) {
    actions.push({
      label: labels.list.markNext(labels.steps[next] ?? next),
      onSelect: () => {
        onAction({ name: 'mark', item, step: next });
      },
    });
  }
  if (item.can?.update === true) {
    actions.push({
      label: labels.list.edit,
      onSelect: () => {
        onAction({ name: 'edit', item });
      },
    });
  }

  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      {selectable ? (
        <Checkbox
          className="mt-1"
          checked={selected}
          aria-label={labels.list.select(name)}
          onChange={onToggle}
        />
      ) : null}
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="grid gap-0.5">
            {item.member === undefined ? null : (
              <Link
                className="font-semibold text-primary underline"
                to={memberRoutes.detailTab(item.member.id, 'closing')}
                aria-label={labels.list.open(name)}
              >
                {name}
              </Link>
            )}
            <span className="text-note text-muted">
              {[
                item.member?.membership_number ?? item.member?.client_number,
                item.portfolio_label,
                item.deliverable_label,
                item.assigned_to === undefined || item.assigned_to === null
                  ? labels.list.unassigned
                  : labels.list.assignedTo(item.assigned_to.name),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          {actions.length > 0 ? (
            <ActionMenu label={labels.list.rowActions(name)} items={actions} />
          ) : null}
        </div>
        <ItemSteps steps={item.steps} />
        {item.filing_reference === null ? null : (
          <span className="flex flex-wrap items-center gap-2 text-note text-muted">
            {labels.list.reference(item.filing_reference)}
            {item.filing_receipt ? (
              <Button variant="link" size="sm" asChild>
                <a href={item.filing_receipt.url} target="_blank" rel="noreferrer">
                  <Download aria-hidden="true" />
                  {labels.list.receipt}
                </a>
              </Button>
            ) : null}
          </span>
        )}
      </div>
    </li>
  );
}

function CampaignView({ campaign }: { campaign: ClosingCampaign }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Map<string, ClosingItem>>(new Map());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [skipped, setSkipped] = useState<SkippedItem[]>([]);
  const manages = can(permissionCodes.cga.closingManage) && campaign.status === 'open';
  const filters: ClosingFilters = {
    portfolio: oneOf(PORTFOLIOS, params.get('portefeuille')) ?? '',
    assignedTo: params.get('agent') ?? '',
    step: oneOf(STEP_FILTERS, params.get('etape')) ?? '',
    late: params.get('retard') === '1',
    page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
  };
  const board = useQuery({
    queryKey: closingKeys.board(campaign.id, filters.portfolio, filters.assignedTo),
    queryFn: () => closingApi.board(campaign.id, filters),
  });
  const items = useQuery({
    queryKey: closingKeys.items(campaign.id, filters),
    queryFn: () => closingApi.items(campaign.id, filters),
    placeholderData: (previous) => previous,
  });
  const agents = useQuery({ queryKey: closingKeys.agents, queryFn: () => closingApi.agents() });
  const portfolios = can(permissionCodes.cga.cabinet) ? PORTFOLIOS : (['cga'] as const);

  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);

    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== 'page') {
      next.delete('page');
    }
    setParams(next, { replace: true });
    setSelected(new Map());
  }

  function toggle(item: ClosingItem) {
    setSelected((current) => {
      const next = new Map(current);

      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }

      return next;
    });
  }

  const pageItems = items.data?.data ?? [];
  const allSelected = pageItems.length > 0 && pageItems.every((item) => selected.has(item.id));
  const selectedIds = [...selected.keys()];
  const close = () => {
    setDialog(null);
  };

  return (
    <div className="grid gap-4">
      {board.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : board.isError ? (
        <Banner tone="danger" role="alert">
          {labels.loadError}
        </Banner>
      ) : (
        <StepTimeline campaign={campaign} board={board.data.board} />
      )}

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <FormField id="closing-portfolio" label={labels.filters.portfolio} className="w-40">
              <Select
                id="closing-portfolio"
                value={filters.portfolio}
                onChange={(event) => {
                  filter('portefeuille', event.target.value);
                }}
              >
                {['', ...portfolios].map((value) => (
                  <option key={value} value={value}>
                    {labels.filters.portfolios[value]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="closing-agent-filter" label={labels.filters.agent} className="w-56">
              <Select
                id="closing-agent-filter"
                value={filters.assignedTo}
                onChange={(event) => {
                  filter('agent', event.target.value);
                }}
              >
                <option value="">{labels.filters.allAgents}</option>
                {(agents.data ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="closing-step-filter" label={labels.filters.step} className="w-48">
              <Select
                id="closing-step-filter"
                value={filters.step}
                onChange={(event) => {
                  filter('etape', event.target.value);
                }}
              >
                <option value="">{labels.filters.allSteps}</option>
                {CLOSING_STEPS.map((step) => (
                  <option key={step} value={step}>
                    {labels.steps[step]}
                  </option>
                ))}
                <option value="done">{labels.filters.doneAll}</option>
              </Select>
            </FormField>
            <CheckboxField id="closing-late" label={labels.filters.late}>
              <Checkbox
                id="closing-late"
                checked={filters.late}
                onChange={(event) => {
                  filter('retard', event.target.checked ? '1' : '');
                }}
              />
            </CheckboxField>
          </div>

          {manages && selectedIds.length > 0 ? (
            <div
              role="toolbar"
              aria-label={labels.list.selected(String(selectedIds.length))}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft p-3"
            >
              <span className="text-note font-semibold">
                {labels.list.selected(String(selectedIds.length))}
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setDialog({ name: 'bulkStep' });
                }}
              >
                <CalendarCheck aria-hidden="true" />
                {labels.bulk.markStep}
              </Button>
              {can(permissionCodes.cga.communications) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const members = [...selected.values()]
                      .map((item) => item.member?.id)
                      .filter((id): id is string => id !== undefined);

                    void navigate(
                      `${communicationsRoutes.create}?membres=${members.join(',')}&modele=closing`,
                    );
                  }}
                >
                  <Send aria-hidden="true" />
                  {labels.bulk.remind}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDialog({ name: 'bulkAssign' });
                }}
              >
                <UserCheck aria-hidden="true" />
                {labels.bulk.assign}
              </Button>
            </div>
          ) : null}

          {skipped.length > 0 ? (
            <Banner tone="warning" role="status">
              <span className="grid gap-1">
                <span>{labels.bulk.skipped(String(skipped.length))}</span>
                <ul className="list-disc pl-5">
                  {skipped.map((item) => (
                    <li key={item.id}>{item.message}</li>
                  ))}
                </ul>
              </span>
            </Banner>
          ) : null}

          {items.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : items.isError ? (
            <Banner tone="danger" role="alert">
              {labels.list.loadError}
            </Banner>
          ) : pageItems.length === 0 ? (
            <EmptyState icon={CalendarCheck}>{labels.list.empty}</EmptyState>
          ) : (
            <>
              {manages ? (
                <CheckboxField id="closing-select-page" label={labels.list.selectPage}>
                  <Checkbox
                    id="closing-select-page"
                    checked={allSelected}
                    onChange={() => {
                      setSelected((current) => {
                        const next = new Map(current);

                        for (const item of pageItems) {
                          if (allSelected) {
                            next.delete(item.id);
                          } else {
                            next.set(item.id, item);
                          }
                        }

                        return next;
                      });
                    }}
                  />
                </CheckboxField>
              ) : null}
              <ul aria-label={labels.list.caption} className="divide-y divide-border">
                {pageItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    selectable={manages}
                    selected={selected.has(item.id)}
                    onToggle={() => {
                      toggle(item);
                    }}
                    onAction={setDialog}
                  />
                ))}
              </ul>
              {items.data.meta.last_page > 1 ? (
                <div className="flex items-center justify-end gap-2 text-note text-muted">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={items.data.meta.current_page <= 1}
                    aria-label={fr.referentials.previous}
                    onClick={() => {
                      filter('page', String(items.data.meta.current_page - 1));
                    }}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  {fr.referentials.page(
                    String(items.data.meta.current_page),
                    String(items.data.meta.last_page),
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={items.data.meta.current_page >= items.data.meta.last_page}
                    aria-label={fr.referentials.next}
                    onClick={() => {
                      filter('page', String(items.data.meta.current_page + 1));
                    }}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {board.data === undefined ? null : <ReportBlock report={board.data.report} />}

      {dialog?.name === 'mark' ? (
        <MarkStepDialog item={dialog.item} step={dialog.step} onClose={close} />
      ) : null}
      {dialog?.name === 'edit' ? <EditItemDialog item={dialog.item} onClose={close} /> : null}
      {dialog?.name === 'bulkStep' ? (
        <BulkStepDialog
          campaignId={campaign.id}
          itemIds={selectedIds}
          onClose={close}
          onSkipped={(items) => {
            setSkipped(items);
            setSelected(new Map());
          }}
        />
      ) : null}
      {dialog?.name === 'bulkAssign' ? (
        <BulkAssignDialog
          campaignId={campaign.id}
          itemIds={selectedIds}
          onClose={() => {
            close();
            setSelected(new Map());
          }}
        />
      ) : null}
    </div>
  );
}

export function ClosingPage() {
  const [params, setParams] = useSearchParams();
  const campaigns = useQuery({
    queryKey: closingKeys.campaigns,
    queryFn: () => closingApi.campaigns(),
  });
  const list = campaigns.data ?? [];
  const requested = params.get('annee');
  const campaign =
    list.find((candidate) => String(candidate.fiscal_year) === requested) ??
    list.find((candidate) => candidate.status === 'open') ??
    list.at(0);

  return (
    <>
      <PageHeader
        title={labels.title}
        actions={
          list.length > 0 && campaign !== undefined ? (
            <FormField id="closing-year" label={labels.year} className="w-56">
              <Select
                id="closing-year"
                value={String(campaign.fiscal_year)}
                onChange={(event) => {
                  setParams({ annee: event.target.value }, { replace: true });
                }}
              >
                {list.map((candidate) => (
                  <option key={candidate.id} value={String(candidate.fiscal_year)}>
                    {labels.yearOption(String(candidate.fiscal_year), candidate.status_label)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null
        }
      />
      {campaigns.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : campaigns.isError ? (
        <Banner
          tone="danger"
          role="alert"
          action={
            <Button variant="secondary" size="sm" onClick={() => void campaigns.refetch()}>
              {fr.common.retry}
            </Button>
          }
        >
          {labels.loadError}
        </Banner>
      ) : campaign === undefined ? (
        <Card>
          <CardContent>
            <EmptyState icon={CalendarCheck}>{labels.none}</EmptyState>
          </CardContent>
        </Card>
      ) : (
        <CampaignView key={campaign.id} campaign={campaign} />
      )}
    </>
  );
}
