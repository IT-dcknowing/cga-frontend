import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Upload, Users } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import { useCgaProfile } from '@/features/cga-settings/api/queries';
import {
  MEMBER_SORTS,
  REGIMES,
  type Member,
  type MemberFilters,
  type PortfolioChoice,
} from '@/features/members/api/members-api';
import { useMembers, useReferrers, useTaxOffices } from '@/features/members/api/queries';
import { PortfolioBadge, ReferrerTag } from '@/features/members/components/portfolio-badge';
import { PortfolioSelector } from '@/features/members/components/portfolio-selector';
import {
  MEMBER_TAB_KEYS,
  MEMBER_TABS,
  memberNumber,
  memberRoutes,
  rememberedPortfolio,
  rememberPortfolio,
  type MemberTab,
} from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import {
  oneOf,
  pageParam,
  textParam,
  useSearchInput,
  useTableParams,
  withFilter,
} from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/adherents` (F-ADH-01, 03-APPFLOW §4.3) : sélecteur de portefeuille, onglets Actifs · Dossiers
 * à compléter · Radiations en cours · Radiés / clos, recherche (ancien n° compris), filtres régime,
 * CDI et apporteur (portefeuille CGA, droit « Voir les apporteurs »), tri et pagination par le
 * serveur. Critères dans l'adresse ; l'export Excel arrive avec le Lot 8.
 */
const labels = fr.members.list;
const columnsText = labels.columns;

const PARAM = {
  portfolio: 'portefeuille',
  tab: 'tab',
  search: 'recherche',
  regime: 'regime',
  taxOffice: 'cdi',
  referrer: 'apporteur',
  sort: 'tri',
  page: 'page',
};

const PORTFOLIO_CHOICES: PortfolioChoice[] = ['cga', 'cabinet', 'all'];
const SORTABLE = ['company_name', 'membership_number'];

function orNone(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? fr.table.none : value;
}

const baseColumns: ColumnDef<Member>[] = [
  {
    id: 'membership_number',
    accessorFn: (member) => memberNumber(member),
    header: columnsText.number,
    cell: ({ row }) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono">{orNone(memberNumber(row.original))}</span>
        <PortfolioBadge portfolio={row.original.portfolio} />
        {row.original.portfolio === 'cga' && row.original.referrer ? (
          <ReferrerTag label={row.original.referrer.label} />
        ) : null}
      </span>
    ),
  },
  {
    id: 'legacy_number',
    header: columnsText.legacyNumber,
    cell: ({ row }) => orNone(row.original.legacy_number),
  },
  {
    id: 'company_name',
    accessorFn: (member) => member.company_name,
    header: columnsText.companyName,
    cell: ({ row }) => (
      <span>
        {row.original.company_name}
        {row.original.sigle !== null ? (
          <span className="ml-1.5 font-normal text-muted">{row.original.sigle}</span>
        ) : null}
      </span>
    ),
  },
  { id: 'ncc', header: columnsText.ncc, cell: ({ row }) => row.original.ncc },
  {
    id: 'regime',
    header: columnsText.regime,
    cell: ({ row }) => <StatusBadge domain="regime" status={row.original.regime} />,
  },
  {
    id: 'pieces',
    header: columnsText.pieces,
    cell: ({ row }) => <StatusBadge domain="pieces" status={row.original.pieces_status} />,
  },
  {
    id: 'status',
    header: columnsText.status,
    cell: ({ row }) => <StatusBadge domain="member" status={row.original.status} />,
  },
];

const columns: ColumnDef<Member>[] = baseColumns.map((column) => ({
  ...column,
  enableSorting: SORTABLE.includes(column.id ?? ''),
}));

export function MembersPage() {
  const { can, activeMembership } = useAuth();
  const profile = useCgaProfile(can(permissionCodes.cga.profile));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const seesCabinet = can(permissionCodes.cga.cabinet);
  const seesReferrers = can(permissionCodes.cga.referrers);
  const membershipId = activeMembership?.id ?? null;

  // Portefeuille : celui de l'adresse, sinon le dernier choisi ; CGA seul sans le droit du Cabinet.
  const portfolio: PortfolioChoice = seesCabinet
    ? (oneOf(PORTFOLIO_CHOICES, params.get(PARAM.portfolio)) ??
      rememberedPortfolio(membershipId) ??
      'cga')
    : 'cga';
  const tab: MemberTab = oneOf(MEMBER_TAB_KEYS, params.get(PARAM.tab)) ?? 'actifs';
  const withReferrers = seesReferrers && portfolio === 'cga';
  const filters: MemberFilters = {
    portfolio,
    statuses: MEMBER_TABS[tab],
    search: textParam(params, PARAM.search) ?? '',
    regime: oneOf(REGIMES, params.get(PARAM.regime)),
    taxOfficeId: textParam(params, PARAM.taxOffice),
    referrerId: withReferrers ? textParam(params, PARAM.referrer) : null,
    sort: oneOf(MEMBER_SORTS, params.get(PARAM.sort)),
    page: pageParam(params, PARAM.page),
  };
  const [search, setSearch] = useSearchInput(filters.search, setParams, PARAM.search);
  const query = useMembers(filters);
  const taxOffices = useTaxOffices();
  const referrers = useReferrers(withReferrers);

  function setFilter(name: string, value: string) {
    setParams((current) => withFilter(current, name, value));
  }

  function choosePortfolio(choice: PortfolioChoice) {
    rememberPortfolio(membershipId, choice);
    setParams((current) => {
      const next = withFilter(current, PARAM.portfolio, choice);

      // L'apporteur n'existe qu'au portefeuille CGA (RG-PTF-06).
      if (choice !== 'cga') {
        next.delete(PARAM.referrer);
      }

      return next;
    });
  }

  const table = useTableParams({
    page: filters.page,
    pageSize: query.data?.perPage,
    sort: filters.sort,
    setFilter,
  });

  const filtered =
    filters.search !== '' ||
    filters.regime !== null ||
    filters.taxOfficeId !== null ||
    filters.referrerId !== null;
  // Agrément en cours (RG-ORG-03) : l'inscription attend l'agrément ; le serveur refuse de même.
  const agreementPending = profile.data?.agreement_status === 'pending';
  const createButton = !can(permissionCodes.cga.membersCreate) ? null : agreementPending ? (
    <Button disabled title={fr.cgaSettings.banners.agreementPending}>
      <Plus aria-hidden="true" />
      {labels.create}
    </Button>
  ) : (
    <Button asChild>
      <Link to={memberRoutes.create}>
        <Plus aria-hidden="true" />
        {labels.create}
      </Link>
    </Button>
  );
  const actions = (
    <div className="flex flex-wrap gap-2">
      {can(permissionCodes.cga.membersImport) ? (
        <Button variant="secondary" asChild>
          <Link to={memberRoutes.import}>
            <Upload aria-hidden="true" />
            {labels.import}
          </Link>
        </Button>
      ) : null}
      {createButton}
    </div>
  );

  const body =
    query.isError && query.data === undefined ? (
      <CardContent>
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
      </CardContent>
    ) : (
      <CardContent flush>
        <DataTable
          caption={labels.caption}
          columns={columns}
          data={query.data?.items ?? []}
          rowCount={query.data?.total ?? 0}
          {...table}
          isLoading={query.isPending}
          getRowId={(member) => member.id}
          onRowClick={(member) => {
            void navigate(memberRoutes.detail(member.id));
          }}
          empty={
            filtered ? (
              labels.noMatch
            ) : (
              <EmptyState icon={Users} action={tab === 'actifs' ? createButton : undefined}>
                {labels.empty[tab]}
              </EmptyState>
            )
          }
        />
      </CardContent>
    );

  return (
    <>
      <PageHeader title={fr.nav.members} actions={actions} />

      {seesCabinet ? (
        <div className="mb-4">
          <PortfolioSelector value={portfolio} onChange={choosePortfolio} />
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setFilter(PARAM.tab, value === 'actifs' ? '' : value);
        }}
      >
        <TabsList>
          {MEMBER_TAB_KEYS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {labels.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        {MEMBER_TAB_KEYS.map((key) => (
          <TabsContent key={key} value={key}>
            <Card>
              <div className="grid gap-3 border-b border-border p-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:items-end">
                <div className="grid gap-1.5">
                  <label htmlFor="members-search" className="text-label font-semibold text-muted">
                    {labels.search}
                  </label>
                  <Input
                    id="members-search"
                    type="search"
                    placeholder={labels.searchPlaceholder}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="members-regime" className="text-label font-semibold text-muted">
                    {labels.regimeFilter}
                  </label>
                  <Select
                    id="members-regime"
                    value={filters.regime ?? ''}
                    onChange={(event) => {
                      setFilter(PARAM.regime, event.target.value);
                    }}
                  >
                    <option value="">{fr.common.all}</option>
                    {REGIMES.map((regime) => (
                      <option key={regime} value={regime}>
                        {fr.status.regime[regime]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor="members-tax-office"
                    className="text-label font-semibold text-muted"
                  >
                    {labels.taxOfficeFilter}
                  </label>
                  <Select
                    id="members-tax-office"
                    value={filters.taxOfficeId ?? ''}
                    disabled={taxOffices.data === undefined}
                    onChange={(event) => {
                      setFilter(PARAM.taxOffice, event.target.value);
                    }}
                  >
                    <option value="">{fr.common.all}</option>
                    {(taxOffices.data ?? []).map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {withReferrers ? (
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="members-referrer"
                      className="text-label font-semibold text-muted"
                    >
                      {labels.referrerFilter}
                    </label>
                    <Select
                      id="members-referrer"
                      value={filters.referrerId ?? ''}
                      disabled={referrers.data === undefined}
                      onChange={(event) => {
                        setFilter(PARAM.referrer, event.target.value);
                      }}
                    >
                      <option value="">{fr.common.all}</option>
                      {(referrers.data ?? []).map((referrer) => (
                        <option key={referrer.id} value={referrer.id}>
                          {`${referrer.label} · ${referrer.name}`}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </div>
              {body}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
