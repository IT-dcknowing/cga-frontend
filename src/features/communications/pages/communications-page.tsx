import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  campaignKeys,
  campaignsApi,
  type Campaign,
} from '@/features/communications/api/campaigns-api';
import {
  CgaAnnouncementsTab,
  NewAnnouncementButton,
} from '@/features/announcements/pages/announcements-pages';
import { useAuth } from '@/features/auth/session/auth-context';
import { communicationsRoutes } from '@/features/communications/lib/routes';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatNumber, formatTimestamp } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/communications` (03-APPFLOW §4.3, F-COM-02 et 03) : onglets Annonces (étape 7.6), Envois groupés
 * (« Nouvel envoi », quota SMS restant) et Historique des envois (date, objet, canaux, destinataires,
 * délivrance) ; le gérant y valide ou refuse les envois en attente (RG-COM-01).
 */
const labels = fr.communications;

const TABS = ['envois', 'historique', 'annonces'] as const;

function RejectDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim() === '') {
      setError(labels.wizard.required);

      return;
    }
    setSubmitting(true);
    try {
      await campaignsApi.decide(campaign.id, { approve: false, reason: reason.trim() });
      await queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      toast.success(labels.rejectDialog.done);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setError(caught.fields.reason);
      } else if (caught instanceof ApiBusinessError) {
        setConflict(caught.message);
      } else {
        toastUnexpectedError(caught);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.rejectDialog.title(campaign.title)}
      submitLabel={labels.rejectDialog.submit}
      variant="danger"
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      <FormField
        id="campaign-reject-reason"
        label={labels.rejectDialog.reason}
        required
        error={error}
      >
        <Textarea
          id="campaign-reject-reason"
          rows={3}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </FormField>
    </FormDialog>
  );
}

function History({ campaigns, canApprove }: { campaigns: Campaign[]; canApprove: boolean }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<Campaign | null>(null);

  async function approve(campaign: Campaign) {
    try {
      const sent = await campaignsApi.decide(campaign.id, { approve: true });

      await queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      toast.success(labels.approved(formatNumber(sent.recipients_count)));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  if (campaigns.length === 0) {
    return <EmptyState icon={Megaphone}>{labels.empty}</EmptyState>;
  }

  return (
    <>
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="grid gap-0.5">
              <p className="text-table font-semibold">{campaign.title}</p>
              <p className="text-note text-muted">
                {labels.line(
                  formatTimestamp(campaign.created_at),
                  formatNumber(campaign.recipients_count),
                )}
                {' · '}
                {campaign.channels.map((channel) => labels.channels[channel] ?? channel).join(', ')}
              </p>
              {campaign.status === 'sent' ? (
                <p className="text-note text-muted">
                  {labels.delivery(
                    formatNumber(campaign.delivery.sent ?? 0),
                    formatNumber(campaign.delivery.failed ?? 0),
                  )}
                </p>
              ) : null}
              {campaign.rejection_reason === null ? null : (
                <p className="text-note text-danger">
                  {labels.rejected(campaign.rejection_reason)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge domain="campaign" status={campaign.status} />
              {canApprove && campaign.status === 'pending_approval' ? (
                <>
                  <Button size="sm" onClick={() => void approve(campaign)}>
                    {labels.approve}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setRejecting(campaign);
                    }}
                  >
                    {labels.reject}
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {rejecting === null ? null : (
        <RejectDialog
          campaign={rejecting}
          onClose={() => {
            setRejecting(null);
          }}
        />
      )}
    </>
  );
}

export function CommunicationsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = oneOf(TABS, params.get('onglet')) ?? 'envois';
  const [announcing, setAnnouncing] = useState(false);
  const query = useQuery({ queryKey: campaignKeys.history, queryFn: () => campaignsApi.history() });
  const pending =
    query.data?.campaigns.filter((campaign) => campaign.status === 'pending_approval') ?? [];

  return (
    <>
      <PageHeader
        title={labels.title}
        actions={
          // Une action principale par écran (04-UX-UI §1) : celle de l'onglet ouvert.
          tab === 'annonces' ? (
            can(permissionCodes.cga.announcements) ? (
              <NewAnnouncementButton
                onClick={() => {
                  setAnnouncing(true);
                }}
              />
            ) : null
          ) : query.data?.can.send === true ? (
            <Button asChild>
              <Link to={communicationsRoutes.create}>
                <Plus aria-hidden="true" />
                {labels.newCampaign}
              </Link>
            </Button>
          ) : null
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setParams({ onglet: value }, { replace: true });
        }}
      >
        <TabsList>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {labels.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>
        {query.isPending ? (
          <Skeleton className="h-40" />
        ) : query.isError ? (
          <Banner tone="danger" role="alert">
            {labels.loadError}
          </Banner>
        ) : (
          <>
            <TabsContent value="envois">
              <Card>
                <CardContent className="grid gap-3">
                  <p className="text-table">
                    {labels.intro(formatNumber(query.data.approvalThreshold))}
                  </p>
                  <p className="text-table font-semibold">
                    {labels.smsRemaining(formatNumber(query.data.smsRemaining))}
                  </p>
                  {pending.length > 0 ? (
                    <History campaigns={pending} canApprove={query.data.can.approve} />
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="historique">
              <Card>
                <CardContent>
                  <History campaigns={query.data.campaigns} canApprove={query.data.can.approve} />
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
        <TabsContent value="annonces">
          <CgaAnnouncementsTab
            creating={announcing}
            onClose={() => {
              setAnnouncing(false);
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
