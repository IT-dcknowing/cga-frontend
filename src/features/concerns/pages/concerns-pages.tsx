import { useQuery } from '@tanstack/react-query';
import { FileQuestion, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  concernKeys,
  concernsApi,
  type Concern,
  type ConcernIndicators,
} from '@/features/concerns/api/concerns-api';
import {
  DocumentRequestDialog,
  NewConcernDialog,
} from '@/features/concerns/components/concern-dialogs';
import { ConcernList } from '@/features/concerns/components/concern-list';
import { concernRoutes } from '@/features/concerns/lib/routes';
import { formatNumber } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Listes des préoccupations (03-APPFLOW §3.2, §4.3, §5.2, étape 7.4) : `/cga/preoccupations` (Reçues des
 * adhérents · Envoyées au CNCGA, « + Écrire au CNCGA »), `/cncga/preoccupations` (demandes des CGA,
 * onglet « Indicateurs » agrégés, RG-PRE-03), `/adherent/messages` (« + Nouvelle demande »,
 * « Demander un document »).
 */
const labels = fr.concerns;

function useTab<T extends string>(tabs: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const tab = oneOf(tabs, params.get('onglet')) ?? fallback;

  return [
    tab,
    (value: string) => {
      setParams(value === fallback ? {} : { onglet: value }, { replace: true });
    },
  ] as const;
}

export function CgaConcernsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [writing, setWriting] = useState(false);
  const [tab, setTab] = useTab(['recues', 'envoyees'] as const, 'recues');
  const canWrite = can(permissionCodes.cga.concernsNetwork);

  return (
    <>
      <PageHeader
        title={labels.title}
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setWriting(true);
              }}
            >
              <Plus aria-hidden="true" />
              {labels.create.cgaAction}
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="recues">{labels.tabs.received}</TabsTrigger>
          <TabsTrigger value="envoyees">{labels.tabs.sent}</TabsTrigger>
        </TabsList>
        <TabsContent value="recues">
          <ConcernList space="cga" level="member_to_cga" />
        </TabsContent>
        <TabsContent value="envoyees">
          <ConcernList space="cga" level="cga_to_cncga" />
        </TabsContent>
      </Tabs>
      {writing ? (
        <NewConcernDialog
          space="cga"
          onClose={() => {
            setWriting(false);
          }}
          onCreated={(concern: Concern) => {
            setWriting(false);
            toast.success(labels.create.sentToCncga);
            void navigate(concernRoutes.detail('cga', concern.id));
          }}
        />
      ) : null}
    </>
  );
}

function hours(value: number | null): string {
  return value === null
    ? labels.indicators.none
    : labels.indicators.hours(formatNumber(Math.round(value)));
}

function rate(value: number | null): string {
  return value === null ? labels.indicators.none : `${formatNumber(Math.round(value * 100))} %`;
}

function Metrics({ data }: { data: ConcernIndicators }) {
  const text = labels.indicators;
  const items: [string, string][] = [
    [text.count, formatNumber(data.count)],
    [text.treatmentRate, rate(data.treatment_rate)],
    [text.onTargetRate, rate(data.on_target_rate)],
    [text.responseHours, hours(data.average_response_hours)],
    [text.resolutionHours, hours(data.average_resolution_hours)],
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-0.5">
          <dt className="text-note text-muted">{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IndicatorsTab() {
  const text = labels.indicators;
  const query = useQuery({
    queryKey: concernKeys.indicators('network'),
    queryFn: () => concernsApi.networkIndicators(),
  });

  if (query.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (query.isError) {
    return (
      <Banner tone="danger" role="alert">
        {text.loadError}
      </Banner>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Metrics data={query.data.network} />
        <div className="overflow-x-auto">
          <table className="w-full text-table">
            <caption className="text-left font-semibold">{text.caption}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="py-2 pr-3">
                  {text.cga}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {text.count}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {text.treatmentRate}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {text.responseHours}
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data.organizations.map((row) => (
                <tr key={row.organization.id} className="border-b border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {row.organization.name}
                  </th>
                  <td className="py-2 pr-3 text-right">{formatNumber(row.count)}</td>
                  <td className="py-2 pr-3 text-right">{rate(row.treatment_rate)}</td>
                  <td className="py-2 pr-3 text-right">{hours(row.average_response_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function NetworkConcernsPage() {
  const [tab, setTab] = useTab(['demandes', 'indicateurs'] as const, 'demandes');

  return (
    <>
      <PageHeader title={labels.title} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="demandes">{labels.tabs.requests}</TabsTrigger>
          <TabsTrigger value="indicateurs">{labels.tabs.indicators}</TabsTrigger>
        </TabsList>
        <TabsContent value="demandes">
          <ConcernList space="network" />
        </TabsContent>
        <TabsContent value="indicateurs">
          <IndicatorsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

export function MemberMessagesPage() {
  const { activeMembership } = useAuth();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'new' | 'document' | null>(null);
  const cga = activeMembership?.organization.name ?? '';

  return (
    <>
      <PageHeader
        title={labels.memberTitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDialog('document');
              }}
            >
              <FileQuestion aria-hidden="true" />
              {labels.document.action}
            </Button>
            <Button
              onClick={() => {
                setDialog('new');
              }}
            >
              <Plus aria-hidden="true" />
              {labels.create.memberAction}
            </Button>
          </div>
        }
      />
      <ConcernList space="member" />
      {dialog === 'new' ? (
        <NewConcernDialog
          space="member"
          onClose={() => {
            setDialog(null);
          }}
          onCreated={(concern) => {
            setDialog(null);
            toast.success(labels.create.sentToCga(cga));
            void navigate(concernRoutes.detail('member', concern.id));
          }}
        />
      ) : null}
      {dialog === 'document' ? (
        <DocumentRequestDialog
          onClose={() => {
            setDialog(null);
          }}
          onCreated={(concern) => {
            setDialog(null);
            void navigate(concernRoutes.detail('member', concern.id));
          }}
        />
      ) : null}
    </>
  );
}
