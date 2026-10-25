import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PublicLayout } from '@/components/layout/public-layout';
import type { Membership } from '@/features/auth/api/auth-api';
import { spaceHomeFor, spaceKindOf, spaceNameOf } from '@/features/auth/lib/destination';
import { useAuth } from '@/features/auth/session/auth-context';
import { fr } from '@/lib/i18n/fr';
import { roleLabel } from '@/lib/reference/roles';
import { cn } from '@/lib/utils';
import { toastUnexpectedError } from '@/lib/http-error-toast';

/*
 * `/choisir-espace` (F-AUTH-04, 03-APPFLOW §2) : une carte par rattachement — organisation, rôle,
 * notifications non lues. La carte de l'espace ouvert, ou à défaut du dernier espace utilisé, est
 * présélectionnée (03-APPFLOW §1). Le clic enregistre l'espace actif **côté serveur**
 * (`POST /me/space`), qui renvoie les droits effectifs : le frontend ne choisit jamais ses droits.
 */
function subtitleOf(membership: Membership): string {
  const role = roleLabel(membership.role);

  // Adhérent : « INC SARL — Accès principal · DC-KNOWING CGA » (F-AUTH-04).
  return spaceKindOf(membership) === 'member' ? `${role} · ${membership.organization.name}` : role;
}

export function ChooseSpacePage() {
  const { api, session, setSession } = useAuth();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const memberships = session?.memberships ?? [];
  const preselectedId = session?.active_membership_id ?? session?.last_membership_id ?? null;

  const choose = (membership: Membership) => {
    void (async () => {
      setPendingId(membership.id);

      try {
        setSession(await api.chooseSpace(membership.id));
        await navigate(spaceHomeFor(membership), { replace: true });
      } catch (error) {
        toastUnexpectedError(error);
        setPendingId(null);
      }
    })();
  };

  return (
    <PublicLayout title={fr.chooseSpace.title}>
      {memberships.length === 0 ? (
        <p className="text-body text-muted">{fr.chooseSpace.empty}</p>
      ) : (
        <>
          <p className="text-note text-muted">{fr.chooseSpace.intro}</p>

          <ul className="mt-4 grid gap-3">
            {memberships.map((membership) => {
              const preselected = membership.id === preselectedId;
              const current = membership.id === session?.active_membership_id;

              return (
                <li key={membership.id}>
                  <button
                    type="button"
                    // Présélection : Entrée ouvre directement l'espace habituel.
                    autoFocus={preselected}
                    disabled={pendingId !== null}
                    aria-busy={pendingId === membership.id || undefined}
                    onClick={() => {
                      choose(membership);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-card border bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40 disabled:opacity-60',
                      preselected ? 'border-primary' : 'border-border',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {spaceNameOf(membership)}
                      </span>
                      <span className="block text-note text-muted">{subtitleOf(membership)}</span>
                      {preselected ? (
                        <span className="mt-1 block text-note font-semibold text-primary">
                          {current ? fr.chooseSpace.current : fr.chooseSpace.last}
                        </span>
                      ) : null}
                    </span>

                    {membership.unread_notifications > 0 ? (
                      <span className="shrink-0 rounded-badge bg-accent-soft px-2 py-0.5 text-badge font-bold text-accent-text">
                        {fr.chooseSpace.unread(String(membership.unread_notifications))}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PublicLayout>
  );
}
