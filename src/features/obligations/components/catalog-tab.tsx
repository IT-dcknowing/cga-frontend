import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileField } from '@/components/ui/file-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  catalogApi,
  catalogKeys,
  type CatalogImpact,
  type CatalogVersion,
} from '@/features/obligations/api/catalog-api';
import { obligationKeys } from '@/features/obligations/api/obligations-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Catalogue des obligations » de `/cncga/parametres` (03-APPFLOW §3.2, étape 4.9,
 * RG-DATA-01, RG-DATA-04) : versions chargées (provisoire ou validée, en vigueur) ; « Importer une
 * nouvelle version » : fichier → aperçu des effets sur les dossiers de tous les centres (en nombres,
 * sans nom) → « Appliquer » ; « Valider » une version provisoire. Le serveur contrôle le fichier et
 * applique la version dans une transaction.
 */
const labels = fr.obligations.catalogVersions;

function Impact({ impact }: { impact: CatalogImpact }) {
  const types = impact.types;
  const members = impact.members;

  return (
    <section aria-label={labels.preview.title(impact.version)} className="grid gap-3">
      <h3 className="text-card-title font-bold">{labels.preview.title(impact.version)}</h3>
      <ul className="grid gap-1 text-table">
        <li>{labels.preview.added(String(types.added.length), types.added.join(', '))}</li>
        <li>{labels.preview.removed(String(types.removed.length), types.removed.join(', '))}</li>
        <li>
          {labels.preview.changed(
            String(types.changed.length),
            types.changed
              .map((change) => `${change.code} (${change.fields.join(', ')})`)
              .join(', '),
          )}
        </li>
        <li>{labels.preview.unchanged(String(types.unchanged))}</li>
      </ul>
      <p className="text-table font-semibold">
        {labels.preview.members(String(members.members), String(members.organizations))}
      </p>
      <ul className="grid gap-1 text-table">
        <li>{labels.preview.suggested(String(members.suggested))}</li>
        <li>{labels.preview.withdrawn(String(members.withdrawn))}</li>
        <li>{labels.preview.ended(String(members.ended))}</li>
        <li>{labels.preview.rescheduled(String(members.rescheduled))}</li>
      </ul>
    </section>
  );
}

function ImportCard({ onDone }: { onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [impact, setImpact] = useState<CatalogImpact | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);

  function fail(caught: unknown) {
    if (caught instanceof ApiValidationError) {
      setError(caught.fields.file ?? caught.fields.file_id ?? Object.values(caught.fields)[0]);
    } else if (caught instanceof ApiBusinessError) {
      setConflict(caught.message);
    } else {
      toastUnexpectedError(caught);
    }
  }

  async function preview() {
    setConflict(null);
    setImpact(null);
    if (file === null) {
      setError(labels.fileRequired);

      return;
    }
    setError(undefined);
    setBusy('preview');
    try {
      setImpact(await catalogApi.preview(file));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(null);
    }
  }

  async function apply(current: CatalogImpact) {
    setConfirming(false);
    setBusy('apply');
    try {
      const applied = await catalogApi.apply(current.file_id);

      toast.success(
        labels.applied(applied.version, String(applied.loaded), String(applied.suggested)),
      );
      setImpact(null);
      setFile(null);
      await onDone();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.importTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-note text-muted">{labels.importIntro}</p>
        {conflict !== null ? (
          <Banner tone="danger" role="alert">
            {conflict}
          </Banner>
        ) : null}
        <FileField
          id="catalog-file"
          label={labels.file}
          hint={labels.fileHint}
          accept="application/json,.json"
          required
          error={error}
          disabled={busy !== null}
          onChange={(chosen) => {
            setFile(chosen);
            setImpact(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={busy === 'preview'}
            disabled={busy !== null}
            onClick={() => void preview()}
          >
            <Upload aria-hidden="true" />
            {labels.analyse}
          </Button>
          {impact === null ? null : (
            <Button
              loading={busy === 'apply'}
              disabled={busy !== null}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {labels.apply(impact.version)}
            </Button>
          )}
        </div>
        {impact === null ? null : <Impact impact={impact} />}
      </CardContent>
      {impact !== null && confirming ? (
        <ConfirmDialog
          open
          onOpenChange={setConfirming}
          title={labels.confirm.title(impact.version)}
          effects={[labels.confirm.body(String(impact.members.members))]}
          submitLabel={labels.apply(impact.version)}
          submitting={busy === 'apply'}
          onSubmit={(event) => {
            event.preventDefault();
            void apply(impact);
          }}
        >
          {null}
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

export function CatalogTab() {
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: catalogKeys.versions,
    queryFn: () => catalogApi.versions(),
  });
  const [validating, setValidating] = useState<CatalogVersion | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: catalogKeys.versions });
    await queryClient.invalidateQueries({ queryKey: obligationKeys.all });
  }

  async function validate(version: CatalogVersion) {
    setValidating(null);
    try {
      const result = await catalogApi.validate(version.version);

      toast.success(labels.validated(result.version, String(result.validated)));
      await refresh();
    } catch (caught) {
      toastUnexpectedError(caught);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : versions.isError ? (
            <Banner tone="danger" role="alert">
              {labels.loadError}
            </Banner>
          ) : versions.data.length === 0 ? (
            <EmptyState icon={BookOpen}>{labels.empty}</EmptyState>
          ) : (
            <ul aria-label={labels.title} className="divide-y divide-border">
              {versions.data.map((version) => (
                <li
                  key={version.version}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <span className="grid gap-0.5">
                    <span className="font-semibold">
                      {labels.version(version.version)}
                      {version.in_force ? ` · ${labels.inForce}` : ''}
                    </span>
                    <span className="text-note text-muted">
                      {[
                        labels.count(String(version.count)),
                        version.loaded_at === null
                          ? null
                          : labels.loadedAt(formatTimestampDate(version.loaded_at)),
                        version.validated_at === null
                          ? null
                          : labels.validatedAt(formatTimestampDate(version.validated_at)),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge domain="dataStatus" status={version.status} />
                    {version.status === 'provisional' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={labels.validate(version.version)}
                        onClick={() => {
                          setValidating(version);
                        }}
                      >
                        {labels.validateShort}
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ImportCard onDone={refresh} />
      {validating === null ? null : (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setValidating(null);
            }
          }}
          title={labels.validate(validating.version)}
          effects={[labels.validateBody(String(validating.provisional_count))]}
          submitLabel={labels.validateShort}
          submitting={false}
          onSubmit={(event) => {
            event.preventDefault();
            void validate(validating);
          }}
        >
          {null}
        </ConfirmDialog>
      )}
    </div>
  );
}
