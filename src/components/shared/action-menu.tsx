import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * Menu « ⋯ » des actions secondaires d'une fiche (03-APPFLOW §4.3, 04-UX-UI §6) : bouton, liste
 * d'actions en `menuitem`, fermée par Échap, un clic à côté ou le choix d'une action. Sans action
 * permise, le menu n'apparaît pas.
 */
export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  /** Action irréversible (suppression, radiation) : en `danger`. */
  danger?: boolean;
};

export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  const close = () => {
    setOpen(false);
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
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
        <Button
          variant="secondary"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((previous) => !previous);
          }}
        >
          <MoreHorizontal aria-hidden="true" />
          {label}
        </Button>

        {open ? (
          <div
            role="menu"
            aria-label={label}
            className="absolute right-0 mt-1 w-72 overflow-hidden rounded-card border border-border bg-card py-1 text-ink shadow-card"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={cn(
                  'block w-full px-4 py-2 text-left text-table',
                  item.danger === true
                    ? 'text-danger hover:bg-danger-soft'
                    : 'hover:bg-primary-soft',
                )}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
