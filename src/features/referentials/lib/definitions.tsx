import { StatusBadge } from '@/components/shared/status-badge';
import type {
  Holiday,
  NationalReference,
  Sector,
} from '@/features/referentials/api/referential-crud';
import type {
  Commune,
  RegionalDirectorate,
  TaxOffice,
} from '@/features/referentials/api/referentials-api';
import {
  DataStatusBadge,
  type ReferentialDef,
} from '@/features/referentials/components/referential-panel';
import { formatAmount, formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Définition de chaque référentiel national géré dans `/cncga/parametres` (F-REF-01 à 04) : champs
 * de `…Request`, lignes de `…Resource`. Les cibles d'une fusion suivent `MergeReferential` : une
 * valeur active (validée pour un secteur), et un CDI de la même direction régionale.
 */
const labels = fr.referentials;

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export const directoratesDef: ReferentialDef<RegionalDirectorate> = {
  uri: 'regional-directorates',
  title: labels.directorates.title,
  noun: labels.directorates.noun,
  sort: 'name',
  searchable: true,
  mergeable: true,
  fields: [
    { name: 'code', label: labels.directorates.code, required: true },
    { name: 'name', label: labels.directorates.name, required: true },
    { name: 'geo_key', label: labels.directorates.geoKey },
    { name: 'active', label: labels.directorates.active, type: 'checkbox' },
  ],
  primary: (item) => item.name,
  secondary: (item) => [item.code, item.active ? null : labels.inactive],
  badges: (item) => <DataStatusBadge status={item.data_status} />,
  mergeTargets: (_item, candidates) => candidates.filter((candidate) => candidate.active),
  formOf: (item) => ({
    code: text(item?.code),
    name: text(item?.name),
    geo_key: text(item?.geo_key),
    active: item?.active ?? true,
  }),
};

export const taxOfficesDef: ReferentialDef<TaxOffice> = {
  uri: 'tax-offices',
  title: labels.taxOffices.title,
  noun: labels.taxOffices.noun,
  sort: 'name',
  searchable: true,
  mergeable: true,
  fields: [
    {
      name: 'regional_directorate_id',
      label: labels.taxOffices.directorate,
      type: 'directorate',
      required: true,
    },
    { name: 'code', label: labels.taxOffices.code, required: true },
    { name: 'name', label: labels.taxOffices.name, required: true },
    { name: 'active', label: labels.taxOffices.active, type: 'checkbox' },
  ],
  primary: (item) => item.name,
  secondary: (item) => [
    item.code,
    item.regional_directorate.name,
    item.active ? null : labels.inactive,
  ],
  badges: (item) => <DataStatusBadge status={item.data_status} />,
  mergeTargets: (item, candidates) =>
    candidates.filter(
      (candidate) =>
        candidate.active && candidate.regional_directorate.id === item.regional_directorate.id,
    ),
  formOf: (item) => ({
    regional_directorate_id: text(item?.regional_directorate.id),
    code: text(item?.code),
    name: text(item?.name),
    active: item?.active ?? true,
  }),
};

export const communesDef: ReferentialDef<Commune> = {
  uri: 'communes',
  title: labels.communes.title,
  noun: labels.communes.noun,
  sort: 'name',
  searchable: true,
  mergeable: true,
  fields: [
    { name: 'name', label: labels.communes.name, required: true },
    { name: 'regional_directorate_id', label: labels.communes.directorate, type: 'directorate' },
  ],
  primary: (item) => item.name,
  secondary: () => [],
  badges: (item) => <DataStatusBadge status={item.data_status} />,
  formOf: (item) => ({
    name: text(item?.name),
    regional_directorate_id: text(item?.regional_directorate_id),
  }),
};

export const sectorsDef: ReferentialDef<Sector> = {
  uri: 'sectors',
  title: labels.sectors.title,
  noun: labels.sectors.noun,
  sort: 'name',
  searchable: true,
  mergeable: true,
  fields: [
    { name: 'code', label: labels.sectors.code, required: true },
    { name: 'name', label: labels.sectors.name, required: true },
  ],
  primary: (item) => item.name,
  secondary: (item) => [item.code],
  badges: (item) => (
    <>
      <StatusBadge domain="sector" status={item.status} />
      <DataStatusBadge status={item.data_status} />
    </>
  ),
  // Un secteur fusionné l'est pour de bon ; la cible est un secteur validé.
  canMerge: (item) => item.status !== 'merged',
  mergeTargets: (_item, candidates) =>
    candidates.filter((candidate) => candidate.status === 'validated'),
  formOf: (item) => ({ code: text(item?.code), name: text(item?.name) }),
};

export const nationalReferencesDef: ReferentialDef<NationalReference> = {
  uri: 'national-references',
  title: labels.nationalReferences.title,
  noun: labels.nationalReferences.noun,
  sort: '-year',
  // `ListNationalReferencesRequest` ne filtre que par année.
  searchable: false,
  mergeable: false,
  fields: [
    { name: 'year', label: labels.nationalReferences.year, type: 'integer', required: true },
    { name: 'domestic_tax_revenue', label: labels.nationalReferences.revenue, type: 'integer' },
    { name: 'nominal_gdp', label: labels.nationalReferences.gdp, type: 'integer' },
    { name: 'tax_revenue_source', label: labels.nationalReferences.revenueSource },
    { name: 'gdp_source', label: labels.nationalReferences.gdpSource },
  ],
  primary: (item) => String(item.year),
  secondary: (item) => [
    item.domestic_tax_revenue === null
      ? null
      : labels.nationalReferences.revenueShort(formatAmount(item.domestic_tax_revenue)),
    item.nominal_gdp === null
      ? null
      : labels.nationalReferences.gdpShort(formatAmount(item.nominal_gdp)),
  ],
  badges: (item) => <DataStatusBadge status={item.data_status} />,
  formOf: (item) => ({
    year: text(item?.year),
    domestic_tax_revenue: text(item?.domestic_tax_revenue),
    nominal_gdp: text(item?.nominal_gdp),
    tax_revenue_source: text(item?.tax_revenue_source),
    gdp_source: text(item?.gdp_source),
  }),
};

export const holidaysDef: ReferentialDef<Holiday> = {
  uri: 'holidays',
  title: labels.holidays.title,
  noun: labels.holidays.noun,
  sort: 'date',
  searchable: true,
  mergeable: false,
  fields: [
    { name: 'date', label: labels.holidays.date, type: 'date', required: true },
    { name: 'label', label: labels.holidays.label, required: true },
  ],
  primary: (item) => item.label,
  secondary: (item) => [formatDate(item.date)],
  formOf: (item) => ({ date: text(item?.date), label: text(item?.label) }),
};
