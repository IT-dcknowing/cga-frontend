import { Bell, ChevronDown, Menu, MoreHorizontal, X } from 'lucide-react';
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
import { fr } from '@/lib/i18n/fr';
import { roleLabel } from '@/lib/reference/roles';
import { cn } from '@/lib/utils';
import { toastUnexpectedError } from '@/lib/http-error-toast';

/*
 * Coque des espaces (04-UX-UI §5.1) : en-tête `primary-dark` de 56 px, menu latéral de 240 px,
 * contenu sur fond `bg`. Tablette : menu replié en icônes, déplié au survol ou au focus. Mobile :
 * tiroir pour les agents, barre basse pour l'adhérent (§5.2). Le menu affiché vient des droits
 * effectifs de `/me` (RG-ROLE-07). Le titre de l'écran est posé par la page (`PageHeader`).
 */
function menuItemClasses(isActive: boolean): string {
  return cn(
    'flex items-center gap-3 whitespace-nowrap border-l-[3px] px-4 py-2.5 text-table transition-colors',
    isActive
      ? 'border-l-primary bg-primary-soft font-semibold text-primary-dark'
      : 'border-l-transparent text-ink hover:bg-primary-soft/40',
  );
}

function SideMenu({ entries, onNavigate }: { entries: MenuEntry[]; onNavigate?: () => void }) {
  return (
    <nav aria-label={fr.shell.mainMenu} className="py-3">
      <ul>
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
          className="flex h-9 items-center gap-1 rounded-control px-2 text-table font-semibold hover:bg-white/10"
          onClick={() => {
            setOpen((previous) => !previous);
          }}
        >
          {firstName}
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>

        {open ? (
          <div
            role="menu"
            aria-label={fr.shell.userMenu}
            className="absolute right-0 mt-1 w-56 overflow-hidden rounded-card border border-border bg-card py-1 text-ink shadow-card"
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
              className="block w-full px-4 py-2 text-left text-table text-danger hover:bg-danger-soft"
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
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 bg-primary-dark px-4 text-white md:px-6">
          {entries.length > 0 && !memberSpace ? (
            <button
              type="button"
              aria-label={fr.shell.openMenu}
              aria-expanded={drawerOpen}
              className="-ml-2 flex size-11 items-center justify-center rounded-control hover:bg-white/10 md:hidden"
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
              'shrink-0 font-extrabold tracking-tight',
              memberSpace && 'hidden md:inline',
            )}
          >
            {fr.public.brand}
          </Link>

          <p className="min-w-0 truncate text-note text-white/85">
            <span
              className={cn(
                memberSpace && 'font-semibold text-white md:font-normal md:text-white/85',
              )}
            >
              {spaceNameOf(activeMembership)}
            </span>
            <span className={cn(memberSpace && 'hidden md:inline')}>
              {' · '}
              {roleLabel(activeMembership.role)}
            </span>
          </p>

          <div className="ml-auto flex items-center gap-1">
            {/* Compteur seul : le panneau des notifications (NotificationBell) arrive au Lot 6. */}
            <span className="relative flex size-11 items-center justify-center">
              <Bell className="size-5" aria-hidden="true" />
              <span className="sr-only">{fr.shell.notifications(String(unread))}</span>
              {unread > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-bold text-white"
                >
                  {unread}
                </span>
              ) : null}
            </span>

            <UserMenu firstName={session.user.first_name} onSignOut={signOut} />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1280px] flex-1">
          {entries.length > 0 ? (
            <div className="relative hidden w-16 shrink-0 md:block lg:w-60">
              <div className="absolute inset-y-0 left-0 z-20 w-16 overflow-hidden border-r border-border bg-card transition-[width] duration-150 focus-within:w-60 focus-within:shadow-card hover:w-60 hover:shadow-card lg:static lg:w-60 lg:shadow-none lg:hover:shadow-none">
                <SideMenu entries={entries} />
              </div>
            </div>
          ) : null}

          <main className={cn('min-w-0 flex-1 px-4 py-6 md:px-6', memberSpace && 'pb-24 md:pb-6')}>
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
