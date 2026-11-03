import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/empty-state';
import { Banner } from '@/components/ui/banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { memberRoutes } from '@/features/members/lib/member';
import {
  planningApi,
  planningKeys,
  type RevenueAmounts,
} from '@/features/obligations/api/planning-api';
import { formatAmount, formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Mobilisation des recettes » de `/cga/echeances` (03-APPFLOW §4.3, étape 4.7, RG-OBL-08) :
 * sur les échéances de paiement de la période (par défaut du 1er janvier au jour), dû, payé, reste à
 * recouvrer et taux de recouvrement, pour le portefeuille, par nature d'impôt et par contribuable.
 * Tous les montants viennent du serveur ; une échéance sans montant dû est signalée à part.
 */
const labels = fr.obligations.revenue;

function rate(value: number | null): string {
  return value === null
    ? labels.noRate
    : `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function Amounts({ amounts }: { amounts: RevenueAmounts }) {
  return (
    <span className="grid justify-items-end gap-0.5 text-table">
      <span>
        {labels.line(
          formatAmount(amounts.amount_due),
          formatAmount(amounts.amount_paid),
          formatAmount(amounts.balance),
        )}
      </span>
      <span className="font-semibold">
        {labels.rate} : {rate(amounts.recovery_rate)}
      </span>
      {amounts.amounts_to_enter > 0 ? (
        <span className="text-note text-accent-text">
          {labels.toEnter(String(amounts.amounts_to_enter))}
        </span>
      ) : null}
    </span>
  );
}

export function RevenueTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({
    queryKey: planningKeys.revenue(from, to),
    queryFn: () => planningApi.revenue({ from, to }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-4">
        <FormField id="revenue-from" label={labels.from} className="w-44">
          <Input
            id="revenue-from"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
        </FormField>
        <FormField id="revenue-to" label={labels.to} className="w-44">
          <Input
            id="revenue-to"
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
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
          <Card aria-label={labels.totals}>
            <CardHeader>
              <CardTitle>{labels.totals}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-4">
                {(
                  [
                    [labels.due, formatAmount(query.data.totals.amount_due)],
                    [labels.paid, formatAmount(query.data.totals.amount_paid)],
                    [labels.balance, formatAmount(query.data.totals.balance)],
                    [labels.rate, rate(query.data.totals.recovery_rate)],
                  ] as const
                ).map(([term, value]) => (
                  <div key={term} className="grid gap-0.5">
                    <dt className="text-label text-muted">{term}</dt>
                    <dd className="text-card-title font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              {query.data.totals.amounts_to_enter > 0 ? (
                <p className="mt-3 text-note text-accent-text">
                  {labels.toEnter(String(query.data.totals.amounts_to_enter))}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {query.data.natures.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState icon={Coins}>{labels.empty}</EmptyState>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card aria-label={labels.natures}>
                <CardHeader>
                  <CardTitle>{labels.natures}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul aria-label={labels.natures} className="divide-y divide-border">
                    {query.data.natures.map((nature) => (
                      <li
                        key={nature.tax_nature}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                      >
                        <span className="font-semibold">{nature.tax_nature_label}</span>
                        <Amounts amounts={nature} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card aria-label={labels.members}>
                <CardHeader>
                  <CardTitle>{labels.members}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <p className="text-note text-muted">
                    {labels.membersNote(
                      String(query.data.members.length),
                      String(query.data.members_total),
                    )}
                  </p>
                  <ul aria-label={labels.members} className="divide-y divide-border">
                    {query.data.members.map((line) => (
                      <li
                        key={line.member.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                      >
                        <span className="grid gap-0.5">
                          <Link
                            className="font-semibold text-primary underline"
                            to={memberRoutes.detailTab(line.member.id, 'obligations')}
                            aria-label={labels.open(line.member.company_name)}
                          >
                            {line.member.company_name}
                          </Link>
                          <span className="text-note text-muted">
                            {line.member.membership_number ?? line.member.client_number}
                          </span>
                        </span>
                        <Amounts amounts={line} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
