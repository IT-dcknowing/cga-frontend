import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { PublicLayout } from '@/components/layout/public-layout';
import { KeyValueList } from '@/components/shared/key-value-list';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { http } from '@/lib/http';
import { httpStatusOf } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import type { ApiItem } from '@/lib/query';

/*
 * `/verifier/:jeton` (F-DOC-04, 03-APPFLOW §2), sans compte : le code du QR imprimé sur le document
 * est vérifié par `GET /api/v1/public/verify/{code}` (limité et journalisé par le serveur). Bandeau
 * vert « Document authentique et valide » ou rouge « Document ANNULÉ le … » ; type, date, CGA
 * émetteur, adhérent, n° d'adhésion. Code inconnu : « Aucun document ne correspond à ce code ».
 * Aucune autre action.
 */
const labels = fr.verification;

export type Verification = {
  status: string;
  status_label: string;
  cancelled_on: string | null;
  type: string;
  type_label: string;
  issued_on: string | null;
  issuer: string;
  member_name: string | null;
  membership_number: string | null;
};

async function verify(code: string): Promise<Verification> {
  const { data } = await http.get<ApiItem<Verification>>(
    `/public/verify/${encodeURIComponent(code)}`,
    // La page montre elle-même le code inconnu et la limite de consultations.
    { skipErrorToast: [404, 429] },
  );

  return data.data;
}

export function VerificationPage() {
  const { jeton = '' } = useParams();
  const query = useQuery({
    queryKey: ['public', 'verify', jeton],
    queryFn: () => verify(jeton),
    retry: false,
  });

  let body;

  if (query.isPending) {
    body = <Skeleton className="h-32 w-full" />;
  } else if (query.isError) {
    const status = httpStatusOf(query.error);

    body =
      status === 404 ? (
        <Banner tone="danger">{labels.unknown}</Banner>
      ) : (
        <Banner
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {fr.common.retry}
            </Button>
          }
        >
          {status === 429 ? labels.tooMany : labels.loadError}
        </Banner>
      );
  } else {
    const document = query.data;
    const cancelled = document.status === 'cancelled';

    body = (
      <div className="grid gap-4">
        <Banner tone={cancelled ? 'danger' : 'success'} role="status">
          {cancelled
            ? labels.cancelled(
                document.cancelled_on === null ? '' : formatDate(document.cancelled_on),
              )
            : labels.valid}
        </Banner>
        <KeyValueList
          items={[
            { label: labels.type, value: document.type_label },
            {
              label: labels.issuedOn,
              value: document.issued_on === null ? null : formatDate(document.issued_on),
            },
            { label: labels.issuer, value: document.issuer },
            { label: labels.member, value: document.member_name },
            { label: labels.membershipNumber, value: document.membership_number },
          ]}
        />
      </div>
    );
  }

  return <PublicLayout title={labels.title}>{body}</PublicLayout>;
}
