import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { fr } from '@/lib/i18n/fr';

/*
 * Droits groupés par module (03-APPFLOW §4.3 et §6) : sections repliables, case et libellé par
 * droit, droits verrouillés grisés avec un cadenas, « Tout accorder / Tout retirer » par module.
 * La marque d'écart (« personnalisé », « ajusté pour cet utilisateur ») et les actions de ligne sont
 * fournies par l'écran ; ce composant ne décide d'aucun droit.
 */
const labels = fr.permissions;

export type PermissionRow = { code: string; label: string; locked: boolean };

export function PermissionModules<P extends PermissionRow>({
  modules,
  selected,
  disabled = false,
  onChange,
  marker,
  rowAction,
}: {
  modules: { module: string; label: string; permissions: P[] }[];
  selected: ReadonlySet<string>;
  disabled?: boolean;
  onChange: (codes: string[], granted: boolean) => void;
  /** Écart avec la référence (réseau, profil) : texte montré à côté du droit. */
  marker: (permission: P, granted: boolean) => string | null;
  rowAction?: (permission: P) => ReactNode;
}) {
  return (
    <div className="grid gap-3">
      {modules.map((module) => {
        const editable = module.permissions.filter((permission) => !permission.locked);
        const granted = module.permissions.filter((permission) => selected.has(permission.code));

        return (
          <details
            key={module.module}
            open
            className="rounded-card border border-border bg-card"
            aria-label={module.label}
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 font-semibold">
              <span>{module.label}</span>
              <span className="text-note font-normal text-muted">
                {labels.grantedCount(String(granted.length), String(module.permissions.length))}
              </span>
            </summary>
            <div className="grid gap-2 border-t border-border px-4 py-3">
              {!disabled && editable.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onChange(
                        editable.map((permission) => permission.code),
                        true,
                      );
                    }}
                  >
                    {labels.grantAll(module.label)}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onChange(
                        editable.map((permission) => permission.code),
                        false,
                      );
                    }}
                  >
                    {labels.revokeAll(module.label)}
                  </Button>
                </div>
              ) : null}
              <ul className="grid gap-1.5">
                {module.permissions.map((permission) => {
                  const checked = selected.has(permission.code);
                  const note = marker(permission, checked);

                  return (
                    <li
                      key={permission.code}
                      className="flex flex-wrap items-start justify-between gap-2"
                    >
                      <label
                        className={`flex items-start gap-2 text-body ${permission.locked ? 'text-muted' : ''}`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={disabled || permission.locked}
                          onChange={(event) => {
                            onChange([permission.code], event.target.checked);
                          }}
                        />
                        <span>
                          {permission.label}
                          {permission.locked ? (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-note">
                              <Lock className="size-3.5" aria-hidden="true" />
                              {labels.locked}
                            </span>
                          ) : null}
                        </span>
                      </label>
                      <span className="flex items-center gap-2">
                        {note !== null ? (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-note text-accent-text">
                            {note}
                          </span>
                        ) : null}
                        {rowAction?.(permission)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        );
      })}
    </div>
  );
}
