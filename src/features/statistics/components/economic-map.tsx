import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  statisticsApi,
  statisticsKeys,
  type Directorate,
  type PeriodQuery,
} from '@/features/statistics/api/statistics-api';
import {
  BUBBLE_RADIUS,
  MAP_OUTLINE,
  MAP_VIEW_BOX,
  MAP_ZONES,
} from '@/features/statistics/lib/map-zones';
import { formatCompactAmount, formatNumber } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Carte économique (04-UX-UI §6 « EconomicMap », 03-APPFLOW §3.2, F-STA-01, étape 8.5) : contour de la
 * Côte d'Ivoire en `primary-soft` / `primary`, bulles `primary` à 75 % dont le rayon suit le chiffre
 * d'affaires des adhérents, libellé de la zone sous la bulle ; survol : CA, CGA, adhérents ; tableau par
 * Direction régionale sous la carte, et clic : adhérents par commune (agrégats, aucun nom).
 */
const labels = fr.statistics.national;

type Bubble = {
  key: string;
  label: string;
  x: number;
  y: number;
  cgas: number;
  members: number;
  revenue: number;
  ids: string[];
};

/** Bulles par zone de la carte : les DR d'une même zone sont additionnées. */
function bubblesOf(directorates: Directorate[]): Bubble[] {
  const bubbles = new Map<string, Bubble>();

  for (const directorate of directorates) {
    const zone = directorate.geo_key === null ? undefined : MAP_ZONES[directorate.geo_key];

    if (zone === undefined || directorate.geo_key === null) {
      continue;
    }
    const bubble = bubbles.get(directorate.geo_key) ?? {
      key: directorate.geo_key,
      label: zone.label,
      x: zone.x,
      y: zone.y,
      cgas: 0,
      members: 0,
      revenue: 0,
      ids: [],
    };

    bubble.cgas += directorate.cgas;
    bubble.members += directorate.members;
    bubble.revenue += directorate.revenue;
    if (directorate.id !== null) {
      bubble.ids.push(directorate.id);
    }
    bubbles.set(directorate.geo_key, bubble);
  }

  return [...bubbles.values()];
}

function CommunesDialog({
  directorate,
  query,
  onClose,
}: {
  directorate: Directorate;
  query: PeriodQuery;
  onClose: () => void;
}) {
  const text = labels.communes;
  const id = directorate.id ?? '';
  const communes = useQuery({
    queryKey: statisticsKeys.communes(id, query),
    queryFn: () => statisticsApi.communes(id, query),
  });
  const title = labels.map.open(directorate.name ?? '');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent title={title} size="preview">
        <DialogBody>
          {communes.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : communes.isError ? (
            <Banner tone="danger" role="alert">
              {text.loadError}
            </Banner>
          ) : communes.data.communes.length === 0 ? (
            <p className="text-note text-muted">{text.empty}</p>
          ) : (
            <table className="w-full text-table">
              <caption className="sr-only">{text.caption}</caption>
              <thead>
                <tr className="border-b border-border text-left text-[0.75rem] uppercase text-muted">
                  <th scope="col" className="py-2">
                    {text.commune}
                  </th>
                  <th scope="col" className="py-2 text-right">
                    {text.members}
                  </th>
                </tr>
              </thead>
              <tbody>
                {communes.data.communes.map((commune) => (
                  <tr key={commune.id} className="border-b border-border last:border-b-0">
                    <th scope="row" className="py-2 text-left font-semibold">
                      {commune.name}
                    </th>
                    <td className="py-2 text-right tabular-nums">
                      {formatNumber(commune.members)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{text.close}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EconomicMap({
  directorates,
  query,
}: {
  directorates: Directorate[];
  query: PeriodQuery;
}) {
  const [opened, setOpened] = useState<Directorate | null>(null);
  const bubbles = bubblesOf(directorates);
  const largest = Math.max(1, ...bubbles.map((bubble) => bubble.revenue));
  const radius = (revenue: number) =>
    BUBBLE_RADIUS.min + ((BUBBLE_RADIUS.max - BUBBLE_RADIUS.min) * revenue) / largest;
  const text = labels.map;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <figure className="grid gap-2">
          <svg
            viewBox={MAP_VIEW_BOX}
            role="img"
            aria-label={text.title}
            className="mx-auto block w-full max-w-[330px]"
          >
            <path
              d={MAP_OUTLINE}
              fill="var(--color-primary-soft)"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            {bubbles.map((bubble) => {
              const r = radius(bubble.revenue);

              return (
                <g key={bubble.key}>
                  <title>
                    {text.bubble(
                      bubble.label,
                      formatCompactAmount(bubble.revenue),
                      formatNumber(bubble.cgas),
                      formatNumber(bubble.members),
                    )}
                  </title>
                  <circle
                    cx={bubble.x}
                    cy={bubble.y}
                    r={r}
                    fill="var(--color-primary)"
                    fillOpacity={0.75}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  <text
                    x={bubble.x}
                    y={bubble.y + r + 9}
                    textAnchor="middle"
                    fontSize={7.5}
                    fontWeight={700}
                    fill="var(--color-ink)"
                  >
                    {bubble.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <figcaption className="text-center text-note text-muted">{text.legend}</figcaption>
        </figure>
        <div className="overflow-x-auto">
          <table className="w-full text-table tabular-nums">
            <caption className="sr-only">{text.caption}</caption>
            <thead>
              <tr className="border-b border-border bg-bg text-left text-[0.75rem] font-bold uppercase tracking-[0.04em] text-muted">
                <th scope="col" className="px-3 py-2">
                  {text.directorate}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {text.cgas}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {text.members}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {text.revenue}
                </th>
              </tr>
            </thead>
            <tbody>
              {directorates.map((directorate) => (
                <tr
                  key={directorate.id ?? 'none'}
                  className="h-12 border-b border-border last:border-b-0"
                >
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {directorate.id === null ? (
                      text.unspecified
                    ) : (
                      <Button
                        variant="link"
                        aria-label={text.open(directorate.name ?? '')}
                        onClick={() => {
                          setOpened(directorate);
                        }}
                      >
                        {directorate.name}
                      </Button>
                    )}
                  </th>
                  <td className="px-3 py-2 text-right">{formatNumber(directorate.cgas)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(directorate.members)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatCompactAmount(directorate.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      {opened === null ? null : (
        <CommunesDialog
          directorate={opened}
          query={query}
          onClose={() => {
            setOpened(null);
          }}
        />
      )}
    </Card>
  );
}
