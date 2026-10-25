import { Ban, Clock, CreditCard, PauseCircle, PlayCircle, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { KeyValueList } from '@/components/shared/key-value-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Organization } from '@/features/organizations/api/organizations-api';
import { useOrganization } from '@/features/organizations/api/queries';
import { IdentityTab } from '@/features/organizations/components/identity-tab';
import {
  InviteManagerDialog,
  ReactivateDialog,
  SubscriptionDialog,
  SuspendDialog,
  WithdrawAgreementDialog,
} from '@/features/organizations/components/organization-dialogs';
import {
  isAgreementWithdrawn,
  isTerminated,
  organizationRoutes,
} from '@/features/organizations/lib/organization';
import { formatDate, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * `/cncga/membres/:id` (F-ORG-04, 03-APPFLOW §3.2) : en-tête de fiche (nom, badges, actions),
 * bandeaux, onglets Identité · Utilisateurs · Cotisations · Rapports · Chiffres clés ·
 * Préoccupations (04-UX-UI §7). Les quatre derniers arrivent avec leurs lots : « Bientôt
 * disponible ». Chaque bouton suit le bloc `can` renvoyé par le serveur (02-TRD §4.3), qui refait
 * le contrôle à chaque requête.
 */
const labels = fr.organization;

type DialogName = 'subscription' | 'suspend' | 'reactivate' | 'withdraw' | 'invite';

const LATER_TABS = ['dues', 'reports', 'figures', 'concerns'] as const;

function Breadcrumb() {
  return (
    <Link to={organizationRoutes.list} className="hover:text-ink hover:underline">
      {fr.nav.cncgaMembers}
    </Link>
  );
}

function LoadingFiche() {
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

function Banners({ organization }: { organization: Organization }) {
  const banners = [];

  if (isTerminated(organization)) {
    banners.push(
      <Banner key="terminated" tone="danger">
        {labels.banners.terminated}
      </Banner>,
    );
  }

  if (organization.agreement_withdrawn_at !== null) {
    banners.push(
      <Banner key="withdrawn" tone="danger">
        {labels.banners.withdrawn(formatDate(organization.agreement_withdrawn_at))}
      </Banner>,
    );
  }

  if (organization.status === 'suspended' && organization.suspended_at !== null) {
    banners.push(
      <Banner key="suspended" tone="danger">
        {labels.banners.suspended(
          formatTimestampDate(organization.suspended_at),
          organization.suspension_reason ?? '',
        )}
      </Banner>,
    );
  }

  if (organization.agreement_status === 'pending') {
    banners.push(
      <Banner key="pending" tone="warning">
        {labels.banners.pending}
      </Banner>,
    );
  }

  return banners.length === 0 ? null : <div className="mb-4 grid gap-2">{banners}</div>;
}

function UsersTab({
  organization,
  onInvite,
}: {
  organization: Organization;
  onInvite: (() => void) | null;
}) {
  const manager = organization.manager ?? null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.manager.title}</CardTitle>
          {manager === null && onInvite !== null ? (
            <Button variant="secondary" size="sm" onClick={onInvite}>
              <UserPlus aria-hidden="true" />
              {labels.invite.action}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {manager === null ? (
            <EmptyState icon={UserPlus}>{labels.manager.none}</EmptyState>
          ) : (
            <KeyValueList
              items={[
                { label: labels.invite.lastName, value: manager.name },
                { label: labels.invite.phone, value: manager.phone },
                { label: labels.fields.email, value: manager.email },
                { label: labels.manager.status, value: manager.status_label },
              ]}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <EmptyState icon={Users}>{labels.usersSoon}</EmptyState>
        </CardContent>
      </Card>
    </div>
  );
}

export function OrganizationPage() {
  const { id = '' } = useParams();
  const query = useOrganization(id);
  const [dialog, setDialog] = useState<DialogName | null>(null);

  if (query.isPending) {
    return <LoadingFiche />;
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

  const organization = query.data;
  const { can } = organization;
  const suspended = organization.status === 'suspended';
  const open = (name: DialogName) => () => {
    setDialog(name);
  };
  const close = () => {
    setDialog(null);
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      {can.change_subscription ? (
        <Button variant="secondary" onClick={open('subscription')}>
          <CreditCard aria-hidden="true" />
          {labels.subscription.action}
        </Button>
      ) : null}
      {can.suspend && suspended ? (
        <Button variant="secondary" onClick={open('reactivate')}>
          <PlayCircle aria-hidden="true" />
          {labels.reactivate.action}
        </Button>
      ) : null}
      {can.suspend && !suspended ? (
        <Button variant="danger" onClick={open('suspend')}>
          <PauseCircle aria-hidden="true" />
          {labels.suspend.action}
        </Button>
      ) : null}
      {can.suspend && !isAgreementWithdrawn(organization) ? (
        <Button variant="secondary" onClick={open('withdraw')}>
          <Ban aria-hidden="true" />
          {labels.withdraw.action}
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb />} title={organization.name} actions={actions} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {organization.sigle !== null ? (
          <span className="text-note font-semibold text-muted">{organization.sigle}</span>
        ) : null}
        <StatusBadge domain="organization" status={organization.status} />
        <StatusBadge domain="agreement" status={organization.agreement_status} />
        <StatusBadge domain="subscription" status={organization.subscription.status} />
      </div>

      <Banners organization={organization} />

      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">{labels.tabs.identity}</TabsTrigger>
          <TabsTrigger value="users">{labels.tabs.users}</TabsTrigger>
          {LATER_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {labels.tabs[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Monté même caché : une modification en cours survit à un changement d'onglet. */}
        <TabsContent value="identity" forceMount>
          <IdentityTab
            organization={organization}
            // Un agrément retiré ne se rétablit pas par la fiche (F-ORG-07).
            canEdit={can.update && !isAgreementWithdrawn(organization)}
          />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab
            organization={organization}
            onInvite={can.invite_manager ? open('invite') : null}
          />
        </TabsContent>
        {LATER_TABS.map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardContent>
                <EmptyState icon={Clock}>{fr.common.comingSoon}</EmptyState>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {dialog === 'subscription' ? (
        <SubscriptionDialog organization={organization} onClose={close} />
      ) : null}
      {dialog === 'suspend' ? <SuspendDialog organization={organization} onClose={close} /> : null}
      {dialog === 'reactivate' ? (
        <ReactivateDialog organization={organization} onClose={close} />
      ) : null}
      {dialog === 'withdraw' ? (
        <WithdrawAgreementDialog organization={organization} onClose={close} />
      ) : null}
      {dialog === 'invite' ? (
        <InviteManagerDialog organization={organization} onClose={close} />
      ) : null}
    </>
  );
}
