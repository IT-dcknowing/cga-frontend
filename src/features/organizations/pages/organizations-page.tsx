import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  ORGANIZATION_STATUSES,
  SUBSCRIPTION_STATUSES,
  type Organization,
  type OrganizationFilters,
  type OrganizationSort,
} from '@/features/organizations/api/organizations-api';
import { useOrganizations, useRegionalDirectorates } from '@/features/organizations/api/queries';
import { NewOrganizationDialog } from '@/features/organizations/components/new-organization-dialog';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import { formatNumber } from '@/lib/format';
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
 * `/cncga/membres` (F-ORG-01, 03-APPFLOW §3.2) : registre des CGA, recherche, filtres (statut,
 * abonnement, DR), tri et pagination par le serveur. **+ Enregistrer un CGA** → modale « Nouveau
 * CGA » ; clic sur une ligne → fiche. Recherche, filtres, tri et page vivent dans l'adresse : retour
 * arrière et lien partagé les gardent.
 */
const labels = fr.registry;
const columnsText = labels.columns;

/** Paramètres de l'adresse. */
const PARAM = {
  search: 'recherche',
  status: 'statut',
  subscription: 'abonnement',
  region: 'dr',
  sort: 'tri',
  page: 'page',
};

/** Colonnes triables par le serveur (liste blanche de `ListOrganizationsRequest`). */
const SORTABLE = ['name', 'city'] as const;
const SORTS: OrganizationSort[] = ['name', '-name', 'city', '-city'];

function filtersFrom(params: URLSearchParams): OrganizationFilters {
  return {
    search: textParam(params, PARAM.search) ?? '',
    status: oneOf(ORGANIZATION_STATUSES, params.get(PARAM.status)),
    subscriptionStatus: oneOf(SUBSCRIPTION_STATUSES, params.get(PARAM.subscription)),
    regionalDirectorateId: textParam(params, PARAM.region),
    sort: oneOf(SORTS, params.get(PARAM.sort)),
    page: pageParam(params, PARAM.page),
  };
}

function orNone(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? fr.table.none : value;
}

const baseColumns: ColumnDef<Organization>[] = [
  {
    id: 'name',
    // Un accesseur rend la colonne triable (le tri lui-même est fait par le serveur).
    accessorFn: (organization) => organization.name,
    header: columnsText.name,
    cell: ({ row }) => (
      <span>
        {row.original.name}
        {row.original.sigle !== null ? (
          <span className="ml-1.5 font-normal text-muted">{row.original.sigle}</span>
        ) : null}
      </span>
    ),
  },
  {
    id: 'city',
    accessorFn: (organization) => organization.city,
    header: columnsText.city,
    cell: ({ row }) => orNone(row.original.city),
  },
  {
    id: 'region',
    header: columnsText.region,
    cell: ({ row }) => orNone(row.original.regional_directorate?.name),
  },
  {
    id: 'agreement',
    header: columnsText.agreement,
    cell: ({ row }) => orNone(row.original.agreement_number),
  },
  {
    id: 'status',
    header: columnsText.status,
    cell: ({ row }) => <StatusBadge domain="organization" status={row.original.status} />,
  },
  {
    id: 'subscription',
    header: columnsText.subscription,
    cell: ({ row }) => (
      <StatusBadge domain="subscription" status={row.original.subscription.status} />
    ),
  },
  // RG-ORG-02 : toujours calculé par le serveur (portefeuille CGA).
  {
    id: 'members',
    header: columnsText.members,
    cell: ({ row }) => formatNumber(row.original.members_count),
  },
];

const columns: ColumnDef<Organization>[] = baseColumns.map((column) => ({
  ...column,
  enableSorting: (SORTABLE as readonly string[]).includes(column.id ?? ''),
}));

export function OrganizationsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = filtersFrom(params);
  const [search, setSearch] = useSearchInput(filters.search, setParams, PARAM.search);
  const [creating, setCreating] = useState(false);
  const query = useOrganizations(filters);
  const regions = useRegionalDirectorates();
  const canManage = can(permissionCodes.cncga.organizationsManage);

  function setFilter(name: string, value: string) {
    setParams((current) => withFilter(current, name, value));
  }

  const table = useTableParams({
    page: filters.page,
    pageSize: query.data?.perPage,
    sort: filters.sort,
    setFilter,
  });

  const filtered =
    filters.search !== '' ||
    filters.status !== null ||
    filters.subscriptionStatus !== null ||
    filters.regionalDirectorateId !== null;
  const createButton = canManage ? (
    <Button
      onClick={() => {
        setCreating(true);
      }}
    >
      <Plus aria-hidden="true" />
      {labels.create}
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title={fr.nav.cncgaMembers} actions={createButton} />

      <Card>
        <div className="grid gap-3 border-b border-border p-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:items-end">
          <div className="grid gap-1.5">
            <label htmlFor="registry-search" className="text-label font-semibold text-muted">
              {labels.search}
            </label>
            <Input
              id="registry-search"
              type="search"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="registry-status" className="text-label font-semibold text-muted">
              {labels.statusFilter}
            </label>
            <Select
              id="registry-status"
              value={filters.status ?? ''}
              onChange={(event) => {
                setFilter(PARAM.status, event.target.value);
              }}
            >
              <option value="">{fr.common.all}</option>
              {ORGANIZATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {fr.status.organization[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="registry-subscription" className="text-label font-semibold text-muted">
              {labels.subscriptionFilter}
            </label>
            <Select
              id="registry-subscription"
              value={filters.subscriptionStatus ?? ''}
              onChange={(event) => {
                setFilter(PARAM.subscription, event.target.value);
              }}
            >
              <option value="">{fr.common.all}</option>
              {SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {fr.status.subscription[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="registry-region" className="text-label font-semibold text-muted">
              {labels.regionFilter}
            </label>
            <Select
              id="registry-region"
              value={filters.regionalDirectorateId ?? ''}
              disabled={regions.data === undefined}
              onChange={(event) => {
                setFilter(PARAM.region, event.target.value);
              }}
            >
              <option value="">{fr.common.all}</option>
              {(regions.data ?? []).map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {query.isError && query.data === undefined ? (
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
              getRowId={(organization) => organization.id}
              onRowClick={(organization) => {
                void navigate(organizationRoutes.detail(organization.id));
              }}
              empty={
                filtered ? (
                  labels.noMatch
                ) : (
                  <EmptyState icon={Building2} action={createButton}>
                    {labels.empty}
                  </EmptyState>
                )
              }
            />
          </CardContent>
        )}
      </Card>

      {creating ? (
        <NewOrganizationDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}
