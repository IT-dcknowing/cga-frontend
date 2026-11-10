import { ChevronDown, Menu, MoreHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { ShellContext } from '@/components/layout/shell-context';
import {
  authRoutes,
  spaceHomeFor,
  spaceKindOf,
  spaceNameOf,
} from '@/features/auth/lib/destination';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  MEMBER_BAR_SIZE,
  menuFor,
  visibleEntries,
  type MenuEntry,
} from '@/features/navigation/menu';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { fr } from '@/lib/i18n/fr';
import { roleLabel } from '@/lib/reference/roles';
import { cn } from '@/lib/utils';
import { toastUnexpectedError } from '@/lib/http-error-toast';

/*
 * Coque des espaces (maquette v4.1 & 04-UX-UI §5.1) :
 * - Bandeau Écosystème (#eco) en haut avec fil CNCGA ▸ CGA ▸ Adhérent
 * - En-tête applicatif sur fond blanc (bg-card), border-b border-border
 * - Menu latéral fixe de 212 px (nav#side) sur fond blanc
 * - Contenu sur fond `bg` (max-w-[1120px])
 * - Sur mobile : tiroir pour les agents, barre basse pour l'adhérent
 */
function menuItemClasses(isActive: boolean): string {
  return cn(
    'flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[13px] font-bold transition-colors mb-0.5',
    isActive
      ? 'bg-primary-soft text-primary-dark'
      : 'text-muted hover:bg-neutral-soft hover:text-ink',
  );
}

function SideMenu({ entries, onNavigate }: { entries: MenuEntry[]; onNavigate?: () => void }) {
  return (
    <nav aria-label={fr.shell.mainMenu} className="p-2">
      <ul className="space-y-0.5">
        {entries.map((entry) => (
          <li key={entry.path}>
            <NavLink
              to={entry.path}
              onClick={onNavigate}
              className={({ isActive }) => menuItemClasses(isActive)}
            >
              <entry.icon className="size-4 shrink-0" aria-hidden="true" />
              {entry.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function UserMenu({ firstName, onSignOut }: { firstName: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={fr.shell.closeMenu}
          className="fixed inset-0 z-30 cursor-default"
          onClick={close}
        />
      ) : null}

      <div
        className="relative z-40"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            close();
          }
        }}
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-9 items-center gap-1 rounded-control px-2 text-table font-semibold text-ink hover:bg-neutral-soft cursor-pointer"
          onClick={() => {
            setOpen((previous) => !previous);
          }}
        >
          {firstName}
          <ChevronDown className="size-4 text-muted" aria-hidden="true" />
        </button>

        {open ? (
          <div
            role="menu"
            aria-label={fr.shell.userMenu}
            className="absolute right-0 mt-1 w-56 overflow-hidden rounded-card border border-border bg-card py-1 text-ink shadow-toast"
          >
            <Link
              role="menuitem"
              to={authRoutes.profile}
              className="block px-4 py-2 text-table hover:bg-primary-soft"
              onClick={close}
            >
              {fr.shell.profile}
            </Link>
            <Link
              role="menuitem"
              to={authRoutes.chooseSpace}
              className="block px-4 py-2 text-table hover:bg-primary-soft"
              onClick={close}
            >
              {fr.shell.changeSpace}
            </Link>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-table text-danger hover:bg-danger-soft cursor-pointer"
              onClick={() => {
                close();
                onSignOut();
              }}
            >
              {fr.shell.logout}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function BottomBar({
  entries,
  onMore,
  moreOpen,
}: {
  entries: MenuEntry[];
  onMore: () => void;
  moreOpen: boolean;
}) {
  return (
    <nav
      aria-label={fr.shell.bottomMenu}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card md:hidden"
    >
      {entries.slice(0, MEMBER_BAR_SIZE).map((entry) => (
        <NavLink
          key={entry.path}
          to={entry.path}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 text-overline',
              isActive ? 'font-semibold text-primary' : 'text-muted',
            )
          }
        >
          <entry.icon className="size-5" aria-hidden="true" />
          {entry.label}
        </NavLink>
      ))}
      <button
        type="button"
        aria-expanded={moreOpen}
        className="flex min-h-14 flex-col items-center justify-center gap-1 text-overline text-muted"
        onClick={onMore}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
        {fr.nav.more}
      </button>
    </nav>
  );
}

/** Panneau glissant du mobile, sous un voile qui le referme. */
function Sheet({
  label,
  side,
  onClose,
  children,
}: {
  label: string;
  side: 'left' | 'bottom';
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Le focus entre dans le panneau à l'ouverture ; Échap le referme (04-UX-UI §9).
  useEffect(() => {
    panel.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-40 md:hidden"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={fr.shell.closeMenu}
        className="absolute inset-0 cursor-default bg-ink/40"
        onClick={onClose}
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          'absolute overflow-y-auto bg-card outline-none',
          side === 'left' ? 'inset-y-0 left-0 w-64' : 'inset-x-0 bottom-0 rounded-t-card py-2',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { api, session, activeMembership, can, endSession } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);
  const closeMore = useCallback(() => {
    setMoreOpen(false);
  }, []);

  // Les gardes (RequireSpace) ont déjà redirigé : rien à afficher sans espace actif.
  if (session === null || activeMembership === null) {
    return null;
  }

  const entries = visibleEntries(menuFor(activeMembership), can, activeMembership);
  const memberSpace = spaceKindOf(activeMembership) === 'member';
  const unread = activeMembership.unread_notifications;

  const signOut = () => {
    void (async () => {
      try {
        await api.logout();
      } catch (error) {
        // La session locale est abandonnée quand même : mieux vaut fermer que rester à moitié ouvert.
        toastUnexpectedError(error);
      }

      // La garde de l'espace renvoie alors à la connexion, sans « Votre session a expiré ».
      endSession('logout');
    })();
  };

  return (
    <ShellContext.Provider value>
      <div className="flex min-h-dvh flex-col bg-bg">
        {/* Bandeau Écosystème (maquette v4.1 #eco) */}
        <div
          id="eco"
          className="flex flex-wrap items-center gap-1.5 bg-ink px-4 py-1.5 text-[12px] font-bold text-eco-text"
        >
          <span>Écosystème :</span>
          <Link
            to={authRoutes.chooseSpace}
            className={cn(
              'rounded-[5px] px-2 py-0.5 text-[12px] font-bold transition-colors',
              spaceKindOf(activeMembership) === 'cncga'
                ? 'bg-primary text-white'
                : 'text-eco-text hover:text-white',
            )}
          >
            CNCGA
          </Link>
          <span className="text-eco-sep">▸</span>
          <Link
            to={authRoutes.chooseSpace}
            className={cn(
              'rounded-[5px] px-2 py-0.5 text-[12px] font-bold transition-colors',
              spaceKindOf(activeMembership) === 'cga'
                ? 'bg-primary text-white'
                : 'text-eco-text hover:text-white',
            )}
          >
            CGA
          </Link>
          <span className="text-eco-sep">▸</span>
          <Link
            to={authRoutes.chooseSpace}
            className={cn(
              'rounded-[5px] px-2 py-0.5 text-[12px] font-bold transition-colors',
              spaceKindOf(activeMembership) === 'member'
                ? 'bg-primary text-white'
                : 'text-eco-text hover:text-white',
            )}
          >
            Adhérent
          </Link>
          <span className="ml-auto hidden font-semibold text-eco-text opacity-65 md:inline">
            CGA Connect v4 · Legal Flow intégré · documents complets · rapport PDF + Word
          </span>
        </div>

        {/* En-tête applicatif (maquette v4.1 header.app : fond blanc, border-b) */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 text-ink md:px-6">
          {entries.length > 0 && !memberSpace ? (
            <button
              type="button"
              aria-label={fr.shell.openMenu}
              aria-expanded={drawerOpen}
              className="-ml-2 flex size-11 items-center justify-center rounded-control hover:bg-neutral-soft md:hidden cursor-pointer"
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          ) : null}

          <Link
            to={spaceHomeFor(activeMembership)}
            className={cn(
              'shrink-0 text-base font-extrabold tracking-tight text-primary-dark',
              memberSpace && 'hidden md:inline',
            )}
          >
            {fr.public.brand}
          </Link>

          <span
            className={cn(
              'hidden h-4 w-px bg-border md:inline',
              memberSpace && 'hidden',
            )}
            aria-hidden="true"
          />

          <p className="min-w-0 truncate text-[13.5px]">
            <span
              className={cn(
                'font-extrabold text-ink',
                memberSpace && 'font-semibold md:font-extrabold',
              )}
            >
              {spaceNameOf(activeMembership)}
            </span>
            <span className={cn('text-[12px] text-muted', memberSpace && 'hidden md:inline')}>
              {' · '}
              {roleLabel(activeMembership.role)}
            </span>
          </p>

          <div className="ml-auto flex items-center gap-2">
            {/* Raccourci changement de profil conforme à la maquette */}
            <Link
              to={authRoutes.chooseSpace}
              className="hidden sm:inline-flex"
            >
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-control border border-border bg-transparent px-2.5 py-1 text-[12px] font-bold text-ink hover:bg-neutral-soft cursor-pointer"
              >
                Changer de profil
              </button>
            </Link>

            {/* Une cloche par espace : le compteur et la liste suivent l'espace actif. */}
            <NotificationBell key={activeMembership.id} initialUnread={unread} />

            <UserMenu firstName={session.user.first_name} onSignOut={signOut} />
          </div>
        </header>

        <div className="flex flex-1">
          {entries.length > 0 ? (
            <aside className="hidden shrink-0 border-r border-border bg-card md:block md:w-[212px]">
              <SideMenu entries={entries} />
            </aside>
          ) : null}

          <main className={cn('min-w-0 flex-1 px-4 py-6 md:px-6 max-w-[1120px]', memberSpace && 'pb-24 md:pb-6')}>
            {children}
          </main>
        </div>

        {drawerOpen ? (
          <Sheet label={fr.shell.mainMenu} side="left" onClose={closeDrawer}>
            <div className="flex justify-end px-2 pt-2">
              <button
                type="button"
                aria-label={fr.shell.closeMenu}
                className="flex size-11 items-center justify-center rounded-control hover:bg-primary-soft"
                onClick={() => {
                  setDrawerOpen(false);
                }}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <SideMenu
              entries={entries}
              onNavigate={() => {
                setDrawerOpen(false);
              }}
            />
          </Sheet>
        ) : null}

        {memberSpace ? (
          <>
            {moreOpen ? (
              <Sheet label={fr.nav.more} side="bottom" onClose={closeMore}>
                <SideMenu
                  entries={entries.slice(MEMBER_BAR_SIZE)}
                  onNavigate={() => {
                    setMoreOpen(false);
                  }}
                />
                <Link
                  to={authRoutes.profile}
                  className="block px-4 py-2.5 text-table"
                  onClick={() => {
                    setMoreOpen(false);
                  }}
                >
                  {fr.shell.profile}
                </Link>
                <Link
                  to={authRoutes.chooseSpace}
                  className="block px-4 py-2.5 text-table"
                  onClick={() => {
                    setMoreOpen(false);
                  }}
                >
                  {fr.shell.changeSpace}
                </Link>
                <button
                  type="button"
                  className="block w-full px-4 py-2.5 text-left text-table text-danger"
                  onClick={() => {
                    setMoreOpen(false);
                    signOut();
                  }}
                >
                  {fr.shell.logout}
                </button>
              </Sheet>
            ) : null}

            <BottomBar
              entries={entries}
              moreOpen={moreOpen}
              onMore={() => {
                setMoreOpen((previous) => !previous);
              }}
            />
          </>
        ) : null}
      </div>
    </ShellContext.Provider>
  );
}
