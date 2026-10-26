import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { KeyValueList } from '@/components/shared/key-value-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/session/auth-context';
import { httpMemberSpaceApi } from '@/features/member-space/api/member-space-api';
import { memberSpaceRoutes } from '@/features/member-space/lib/routes';
import { formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { isScreenError, retryUnlessScreenError } from '@/lib/query';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/adherent/accueil`, version minimale (06-IMPLEMENTATION-PLAN étape 2.11, 03-APPFLOW §5.2) :
 * message d'accueil, son dossier, l'identité et les contacts de son CGA ; bandeau de fin d'adhésion
 * après une radiation validée. Les cartes d'échéances et d'honoraires (F-DSH-03) suivent leurs lots.
 * Mobile d'abord : une colonne, deux à partir de 768 px.
 */
const labels = fr.memberSpace.home;

function orNull(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value;
}

export function MemberHomePage() {
  const { session, can } = useAuth();
  const home = useQuery({
    queryKey: ['member-space', 'home'],
    queryFn: () => httpMemberSpaceApi.home(),
    throwOnError: isScreenError,
    retry: retryUnlessScreenError,
  });
  const firstName = session?.user.first_name ?? '';

  if (home.isPending) {
    return (
      <div aria-busy="true" className="grid gap-3">
        <span className="sr-only">{fr.common.loading}</span>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (home.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void home.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  }

  const { member, access, organization } = home.data;
  const fields = labels.fields;
  const phones = [organization.phone_1, organization.phone_2].filter(
    (phone): phone is string => orNull(phone) !== null,
  );

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-page-title font-extrabold text-ink">{labels.greeting(firstName)}</h1>
        <p className="mt-1 text-body text-muted">{labels.welcome(organization.name)}</p>
      </div>

      {member.ended_on !== null ? (
        <Banner tone="warning" role="status">
          {access.read_only_until === null
            ? labels.ended(formatDate(member.ended_on))
            : labels.endedUntil(formatDate(member.ended_on), formatDate(access.read_only_until))}
        </Banner>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{labels.myFile}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-card-title font-bold">{member.company_name}</p>
            <KeyValueList
              items={[
                { label: fields.number, value: orNull(member.number) },
                { label: fields.portfolio, value: member.portfolio_label },
                { label: fields.regime, value: member.regime_label },
                {
                  label: fields.adhesionDate,
                  value: member.adhesion_date === null ? null : formatDate(member.adhesion_date),
                },
                {
                  label: fields.status,
                  value: <StatusBadge domain="member" status={member.status} />,
                },
                { label: fields.access, value: access.role_label },
              ]}
            />
            {can(permissionCodes.member.documents) ? (
              <Button variant="secondary" size="sm" className="justify-self-start" asChild>
                <Link to={memberSpaceRoutes.documents}>{labels.documentsLink}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {can(permissionCodes.member.payments) ? (
          <Card>
            <CardHeader>
              <CardTitle>{labels.feesCard}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-note text-muted">{labels.feesIntro}</p>
              <Button size="sm" className="justify-self-start" asChild>
                <Link to={memberSpaceRoutes.fees}>{labels.feesLink}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{labels.myCga}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-card-title font-bold">{organization.name}</p>
            <KeyValueList
              items={[
                {
                  label: fields.address,
                  value: orNull(
                    [organization.address, organization.city].filter(Boolean).join(', '),
                  ),
                },
                {
                  label: fields.phone,
                  value:
                    phones.length === 0 ? null : (
                      <span className="grid">
                        {phones.map((phone) => (
                          <a key={phone} className="text-primary underline" href={`tel:${phone}`}>
                            {phone}
                          </a>
                        ))}
                      </span>
                    ),
                },
                {
                  label: fields.email,
                  value:
                    organization.email === null ? null : (
                      <a className="text-primary underline" href={`mailto:${organization.email}`}>
                        {organization.email}
                      </a>
                    ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
