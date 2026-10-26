import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  memberFinanceApi,
  memberFinanceKeys,
} from '@/features/member-space/api/member-finance-api';
import { formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * `/adherent/documents` (03-APPFLOW §5.2, RG-DOC-04) : contrat, attestations, reçus et documents
 * déposés par le CGA, en PDF seulement ; un document annulé garde son badge rouge « Annulé ». Le
 * serveur ne renvoie que les documents de l'adhérent, visibles par lui.
 */
const labels = fr.memberSpace.documents;

export function MemberDocumentsPage() {
  const query = useQuery({
    queryKey: memberFinanceKeys.documents,
    queryFn: () => memberFinanceApi.documents(),
  });

  let body;

  if (query.isPending) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (query.isError) {
    body = (
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
  } else if (query.data.length === 0) {
    body = <EmptyState icon={FileText}>{labels.empty}</EmptyState>;
  } else {
    body = (
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {query.data.map((document) => (
          <li key={document.id} className="grid gap-2 py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="grid gap-0.5">
                <span className="font-semibold">{document.title}</span>
                <span className="text-note text-muted">
                  {[
                    document.number,
                    document.issued_at === null ? null : formatTimestampDate(document.issued_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <StatusBadge domain="document" status={document.status} />
            </div>
            {document.pdf !== null ? (
              <Button variant="secondary" size="sm" className="justify-self-start" asChild>
                <a href={document.pdf.url} target="_blank" rel="noreferrer">
                  <Download aria-hidden="true" />
                  {labels.download(document.title)}
                </a>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <PageHeader title={labels.title} />
      <Card>
        <CardContent>{body}</CardContent>
      </Card>
    </>
  );
}
