import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  obligationKeys,
  obligationsApi,
  type ObligationType,
  type SuggestionCriteria,
} from '@/features/obligations/api/obligations-api';
import type { ObligationChoice } from '@/features/obligations/lib/obligation-choice';
import { fr } from '@/lib/i18n/fr';

/*
 * Bloc « Obligations proposées » de l'assistant d'inscription (03-APPFLOW §4.3, étape 4.5, F-OBL-02,
 * RG-OBL-02, 03) : les obligations que le moteur d'applicabilité du serveur propose pour le régime,
 * l'effectif et le secteur saisis, cochées par défaut ; « + Ajouter une obligation » cherche dans le
 * catalogue du centre. À l'enregistrement du dossier, le serveur crée ses propres propositions :
 * `applyObligationChoice` les confirme ou les retire selon les cases, puis attribue les ajouts.
 */
const labels = fr.obligations;

function describe(type: ObligationType): string {
  return labels.proposed.line(
    labels.categories[type.category] ?? type.category_label,
    type.periodicity_label,
  );
}

export function CatalogDialog({
  excluded,
  onClose,
  onChoose,
}: {
  excluded: Set<string>;
  onClose: () => void;
  onChoose: (type: ObligationType) => void;
}) {
  const [search, setSearch] = useState('');
  const catalog = useQuery({
    queryKey: obligationKeys.types,
    queryFn: () => obligationsApi.types(),
  });
  const needle = search.trim().toLocaleLowerCase('fr');
  const found = (catalog.data ?? []).filter(
    (type) =>
      !excluded.has(type.id) &&
      (needle === '' || `${type.label} ${type.code}`.toLocaleLowerCase('fr').includes(needle)),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent title={labels.catalog.title} description={labels.catalog.description}>
        <DialogBody>
          <FormField id="obligation-search" label={labels.catalog.search}>
            <Input
              id="obligation-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </FormField>
          {catalog.isPending ? (
            <p className="text-note text-muted" role="status">
              {labels.proposed.loading}
            </p>
          ) : catalog.isError ? (
            <Banner tone="danger" role="alert">
              {labels.catalog.loadError}
            </Banner>
          ) : found.length === 0 ? (
            <p className="text-note text-muted">{labels.catalog.empty}</p>
          ) : (
            <ul className="grid gap-1" aria-label={labels.catalog.title}>
              {found.map((type) => (
                <li
                  key={type.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2"
                >
                  <span className="grid">
                    <span className="text-body">
                      {type.label}
                      {type.local ? ` (${labels.catalog.local})` : ''}
                    </span>
                    <span className="text-note text-muted">{describe(type)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={labels.catalog.choose(type.label)}
                    onClick={() => {
                      onChoose(type);
                    }}
                  >
                    <Plus aria-hidden="true" />
                    {fr.common.add}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {fr.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProposedObligations({
  criteria,
  choice,
  disabled,
  onChange,
}: {
  criteria: SuggestionCriteria;
  choice: ObligationChoice;
  disabled: boolean;
  onChange: (choice: ObligationChoice) => void;
}) {
  const [searching, setSearching] = useState(false);
  const suggestions = useQuery({
    queryKey: obligationKeys.suggestions(criteria),
    queryFn: () => obligationsApi.suggestions(criteria),
    enabled: criteria.regime !== '',
  });
  const proposed = suggestions.data ?? [];
  const shown = [
    ...proposed,
    ...choice.added.filter((type) => !proposed.some((item) => item.id === type.id)),
  ];

  function toggle(type: ObligationType, checked: boolean) {
    if (choice.added.some((item) => item.id === type.id)) {
      onChange({
        ...choice,
        added: checked ? choice.added : choice.added.filter((item) => item.id !== type.id),
      });

      return;
    }
    onChange({
      ...choice,
      unchecked: checked
        ? choice.unchecked.filter((id) => id !== type.id)
        : [...choice.unchecked, type.id],
    });
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-card-title font-bold text-ink">{labels.proposed.title}</legend>
      <p className="text-note text-muted">{labels.proposed.hint}</p>
      {suggestions.isPending && criteria.regime !== '' ? (
        <p className="text-note text-muted" role="status">
          {labels.proposed.loading}
        </p>
      ) : suggestions.isError ? (
        <Banner tone="warning" role="alert">
          {labels.proposed.loadError}
        </Banner>
      ) : shown.length === 0 ? (
        <p className="text-note text-muted">{labels.proposed.none}</p>
      ) : (
        <ul className="grid gap-1" aria-label={labels.proposed.title}>
          {shown.map((type) => {
            const id = `proposed-obligation-${type.id}`;
            const added = choice.added.some((item) => item.id === type.id);

            return (
              <li key={type.id}>
                <CheckboxField
                  id={id}
                  label={
                    <span className="grid">
                      <span>
                        {type.label}
                        {added ? ` (${labels.proposed.added})` : ''}
                      </span>
                      <span className="text-note text-muted">{describe(type)}</span>
                    </span>
                  }
                >
                  <Checkbox
                    id={id}
                    checked={added || !choice.unchecked.includes(type.id)}
                    disabled={disabled}
                    onChange={(event) => {
                      toggle(type, event.target.checked);
                    }}
                  />
                </CheckboxField>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setSearching(true);
          }}
        >
          <Plus aria-hidden="true" />
          {labels.proposed.add}
        </Button>
      </div>
      {searching ? (
        <CatalogDialog
          excluded={new Set(shown.map((type) => type.id))}
          onClose={() => {
            setSearching(false);
          }}
          onChoose={(type) => {
            onChange({ ...choice, added: [...choice.added, type] });
            setSearching(false);
          }}
        />
      ) : null}
    </fieldset>
  );
}
