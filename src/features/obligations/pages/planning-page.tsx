import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Send, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import { communicationsRoutes } from '@/features/communications/lib/routes';
import { memberRoutes } from '@/features/members/lib/member';
import { obligationKeys, obligationsApi } from '@/features/obligations/api/obligations-api';
import {
  planningApi,
  planningKeys,
  type PlanningFilters,
  type PlanningLine,
} from '@/features/obligations/api/planning-api';
import { RevenueTab } from '@/features/obligations/components/revenue-tab';
import { formatAmount, formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/echeances` (F-OBL-06, 03-APPFLOW §4.3) : planning groupé par date et par obligation
 * (adhérents, faits / à faire, plateforme), filtres dans l'adresse (période, obligation, statut),
 * indicateur « échéances sous n jours » ; une ligne ouvre le panneau des adhérents concernés (lien
 * vers l'onglet Obligations de chaque dossier) et « Envoyer un rappel » prépare un envoi groupé aux
 * adhérents qui n'ont pas encore fait le nécessaire. Onglet « Mobilisation des recettes ».
 */
const labels = fr.obligations.planning;
const PROGRESSES = ['open', 'done'] as const;
const TABS = ['planning', 'revenue'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateParam(value: string | null): string {
  return value !== null && DATE.test(value) ? value : '';
}

function MembersPanel({ line, onClose }: { line: PlanningLine; onClose: () => void }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const text = labels.panel;
  const members = useQuery({
    queryKey: planningKeys.members(line),
    queryFn: () => planningApi.members(line),
  });
  const pending = (members.data ?? []).filter(
    (item) => !['done', 'paid', 'established'].includes(item.status),
  );
  const date = formatDate(line.due_date);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        size="preview"
        title={text.title(line.label, date)}
        description={text.description(String(line.members))}
      >
        <DialogBody>
          {members.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : members.isError ? (
            <Banner tone="danger" role="alert">
              {text.loadError}
            </Banner>
          ) : members.data.length === 0 ? (
            <p className="text-note text-muted">{text.empty}</p>
          ) : (
            <ul aria-label={text.title(line.label, date)} className="divide-y divide-border">
              {members.data.map((item) => (
                <li
                  key={item.instance_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="grid gap-0.5">
                    <Link
                      className="font-semibold text-primary underline"
                      to={memberRoutes.detailTab(item.member.id, 'obligations')}
                      aria-label={text.open(item.member.company_name)}
                    >
                      {item.member.company_name}
                    </Link>
                    <span className="text-note text-muted">
                      {[
                        item.member.membership_number ?? item.member.client_number,
                        item.balance !== null && item.balance > 0
                          ? text.balance(formatAmount(item.balance))
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {item.member_declared_status === null ? null : (
                      <span className="text-note font-semibold text-accent-text">
                        {text.declared}
                      </span>
                    )}
                  </span>
                  <StatusBadge domain="obligation" status={item.status} />
                </li>
              ))}
            </ul>
          )}
          {pending.length > 0 && can(permissionCodes.cga.communications) ? (
            <p className="text-note text-muted">{text.remindHint(String(pending.length))}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {fr.common.close}
          </Button>
          {pending.length > 0 && can(permissionCodes.cga.communications) ? (
            <Button
              onClick={() => {
                const ids = pending.map((item) => item.member.id).join(',');

                void navigate(`${communicationsRoutes.create}?membres=${ids}&modele=deadline`);
              }}
            >
              <Send aria-hidden="true" />
              {text.remind}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanningTab() {
  const [params, setParams] = useSearchParams();
  const [opened, setOpened] = useState<PlanningLine | null>(null);
  const filters: PlanningFilters = {
    from: dateParam(params.get('du')),
    to: dateParam(params.get('au')),
    obligation_type_id: params.get('obligation') ?? '',
    progress: oneOf(PROGRESSES, params.get('statut')) ?? '',
  };
  const query = useQuery({
    queryKey: planningKeys.lines(filters),
    queryFn: () => planningApi.lines(filters),
    placeholderData: (previous) => previous,
  });
  const types = useQuery({ queryKey: obligationKeys.types, queryFn: () => obligationsApi.types() });

  function filter(key: 'du' | 'au' | 'obligation' | 'statut', value: string) {
    const next = new URLSearchParams(params);

    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <div className="grid gap-4">
      {query.data !== undefined && query.data.upcoming.count > 0 ? (
        <Banner tone="warning">
          {labels.upcoming(
            String(query.data.upcoming.count),
            String(query.data.upcoming.members),
            String(query.data.upcoming.days),
          )}
        </Banner>
      ) : null}
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-4">
            <FormField id="planning-from" label={labels.from} className="w-44">
              <Input
                id="planning-from"
                type="date"
                value={filters.from}
                onChange={(event) => {
                  filter('du', event.target.value);
                }}
              />
            </FormField>
            <FormField id="planning-to" label={labels.to} className="w-44">
              <Input
                id="planning-to"
                type="date"
                value={filters.to}
                onChange={(event) => {
                  filter('au', event.target.value);
                }}
              />
            </FormField>
            <FormField id="planning-obligation" label={labels.obligation} className="w-72">
              <Select
                id="planning-obligation"
                value={filters.obligation_type_id}
                onChange={(event) => {
                  filter('obligation', event.target.value);
                }}
              >
                <option value="">{labels.progresses['']}</option>
                {(types.data ?? []).map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="planning-progress" label={labels.progress} className="w-40">
              <Select
                id="planning-progress"
                value={filters.progress}
                onChange={(event) => {
                  filter('statut', event.target.value);
                }}
              >
                {['', ...PROGRESSES].map((value) => (
                  <option key={value} value={value}>
                    {labels.progresses[value]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {query.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : query.isError ? (
            <Banner tone="danger" role="alert">
              {labels.loadError}
            </Banner>
          ) : (
            <>
              <p className="text-note text-muted">
                {labels.period(formatDate(query.data.from), formatDate(query.data.to))}
              </p>
              {query.data.lines.length === 0 ? (
                <EmptyState icon={CalendarClock}>{labels.empty}</EmptyState>
              ) : (
                <ul aria-label={labels.caption} className="divide-y divide-border">
                  {query.data.lines.map((line) => {
                    const date = formatDate(line.due_date);

                    return (
                      <li
                        key={`${line.due_date}-${line.kind}-${line.label}`}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                      >
                        <span className="grid gap-0.5">
                          <span className="font-semibold">
                            {date} — {line.label}
                          </span>
                          <span className="text-note text-muted">
                            {[
                              fr.obligations.categories[line.category] ?? line.category_label,
                              line.kind_label,
                              line.platform,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-3 text-table">
                          <span>
                            {line.members} {labels.columns.members.toLowerCase()}
                          </span>
                          <span className={line.open > 0 ? 'font-semibold' : undefined}>
                            {labels.counts(String(line.done), String(line.open))}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={labels.showMembers(line.label, date)}
                            onClick={() => {
                              setOpened(line);
                            }}
                          >
                            <Users aria-hidden="true" />
                            {labels.columns.members}
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {opened === null ? null : (
        <MembersPanel
          line={opened}
          onClose={() => {
            setOpened(null);
          }}
        />
      )}
    </div>
  );
}

export function PlanningPage() {
  const [params, setParams] = useSearchParams();
  const tab = oneOf(TABS, params.get('onglet')) ?? 'planning';

  return (
    <>
      <PageHeader title={labels.title} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);

          if (value === 'planning') {
            next.delete('onglet');
          } else {
            next.set('onglet', value);
          }
          setParams(next, { replace: true });
        }}
      >
        <TabsList>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {labels.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="planning">
          <PlanningTab />
        </TabsContent>
        <TabsContent value="revenue">
          <RevenueTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
