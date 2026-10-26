import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileBadge } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { feesApi, feesKeys, type CertificateCampaign } from '@/features/cga-settings/api/fees-api';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatNumber, formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Campagne d'attestations » de `/cga/parametres` (RG-DOC-06, 07, 03-APPFLOW §4.3) : année,
 * adhérents éligibles et attestations déjà émises ; attestations bloquées avec leur motif
 * (RG-DOC-10, exclues de la campagne). « Lancer la campagne {année} » → modale « n éligibles, m
 * bloqués » → production en file (toast « Production de n attestations en cours »).
 */
const labels = fr.cgaSettings.campaign;

function LaunchDialog({
  campaign,
  onClose,
}: {
  campaign: CertificateCampaign;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function launch() {
    setBusy(true);
    setConflict(null);

    try {
      const { queued } = await feesApi.launchCampaign();

      toast.success(labels.launched(formatNumber(queued)));
      await queryClient.invalidateQueries({ queryKey: feesKeys.campaign });
      onClose();
    } catch (error) {
      setBusy(false);

      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.launch(String(campaign.year))}
      description={labels.summary(
        formatNumber(campaign.eligible),
        formatNumber(campaign.blocked.length),
      )}
      submitLabel={labels.submit}
      submitting={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void launch();
      }}
      conflict={conflict}
      effects={[
        ...labels.effects,
        ...campaign.blocked.map((block) =>
          labels.blockedEffect(block.member.company_name, block.trigger_label),
        ),
      ]}
    >
      {null}
    </ConfirmDialog>
  );
}

export function CampaignTab() {
  const [launching, setLaunching] = useState(false);
  const query = useQuery({ queryKey: feesKeys.campaign, queryFn: () => feesApi.campaign() });

  if (query.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (query.isError) {
    return (
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
    );
  }

  const campaign = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title(String(campaign.year))}</CardTitle>
        <Button
          size="sm"
          disabled={campaign.eligible === 0}
          onClick={() => {
            setLaunching(true);
          }}
        >
          <FileBadge aria-hidden="true" />
          {labels.launch(String(campaign.year))}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">{labels.intro}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-table md:max-w-md">
          <dt className="text-muted">{labels.eligible}</dt>
          <dd className="font-semibold">{formatNumber(campaign.eligible)}</dd>
          <dt className="text-muted">{labels.issued}</dt>
          <dd className="font-semibold">{formatNumber(campaign.issued)}</dd>
          <dt className="text-muted">{labels.blocked}</dt>
          <dd className="font-semibold">{formatNumber(campaign.blocked.length)}</dd>
        </dl>
        {campaign.eligible === 0 ? <p className="text-note text-muted">{labels.none}</p> : null}
        {campaign.blocked.length > 0 ? (
          <ul aria-label={labels.blockedTitle} className="divide-y divide-border">
            {campaign.blocked.map((block) => (
              <li key={block.member.id} className="grid gap-0.5 py-2">
                <span className="font-semibold">
                  {block.member.company_name}
                  {block.member.membership_number === null
                    ? null
                    : ` · ${block.member.membership_number}`}
                </span>
                <span className="text-note text-muted">
                  {labels.blockedLine(
                    formatTimestampDate(block.blocked_at),
                    block.trigger_label,
                    block.reason,
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      {launching ? (
        <LaunchDialog
          campaign={campaign}
          onClose={() => {
            setLaunching(false);
          }}
        />
      ) : null}
    </Card>
  );
}
