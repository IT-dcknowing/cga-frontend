import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import { AgentsPanel } from '@/features/cga-settings/components/agents-panel';
import { ReferentialPanel } from '@/features/referentials/components/referential-panel';
import {
  communesDef,
  directoratesDef,
  holidaysDef,
  nationalReferencesDef,
  sectorsDef,
  taxOfficesDef,
} from '@/features/referentials/lib/definitions';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cncga/parametres` (03-APPFLOW §3.2, étape 1.7) : Utilisateurs CNCGA (Présidente), Secteurs,
 * DR / CDI / communes, Références nationales, Jours fériés, Paramètres réseau — chacun selon les
 * droits effectifs de `/me`, le serveur refaisant le contrôle. Les paramètres réseau attendent leur
 * API (« Bientôt disponible »). L'onglet ouvert vit dans l'adresse.
 */
const labels = fr.cncgaSettings;
const cncga = permissionCodes.cncga;

const TABS = ['utilisateurs', 'secteurs', 'territoire', 'references', 'feries', 'reseau'] as const;

type Tab = (typeof TABS)[number];

const RIGHTS: Record<Tab, string> = {
  utilisateurs: cncga.users,
  secteurs: cncga.referentials,
  territoire: cncga.referentials,
  references: cncga.referentials,
  feries: cncga.referentials,
  reseau: cncga.settings,
};

function Pending() {
  return (
    <Card>
      <CardContent>
        <EmptyState icon={Clock}>{fr.common.comingSoon}</EmptyState>
      </CardContent>
    </Card>
  );
}

export function CncgaSettingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = TABS.filter((tab) => can(RIGHTS[tab]));
  const tab = oneOf(visible, params.get('onglet')) ?? visible.at(0) ?? 'utilisateurs';
  const manages = can(cncga.referentials);

  const screens: Record<Tab, ReactNode> = {
    utilisateurs: <AgentsPanel scope="network" />,
    secteurs: (
      <div className="grid gap-2">
        <p className="text-note text-muted">{fr.referentials.sectors.proposedHint}</p>
        <ReferentialPanel def={sectorsDef} canManage={manages} />
      </div>
    ),
    territoire: (
      <div className="grid gap-4">
        <ReferentialPanel def={directoratesDef} canManage={manages} />
        <ReferentialPanel def={taxOfficesDef} canManage={manages} />
        <ReferentialPanel def={communesDef} canManage={manages} />
      </div>
    ),
    references: <ReferentialPanel def={nationalReferencesDef} canManage={manages} />,
    feries: <ReferentialPanel def={holidaysDef} canManage={manages} />,
    reseau: <Pending />,
  };

  return (
    <>
      <PageHeader title={fr.nav.settings} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setParams({ onglet: value }, { replace: true });
        }}
      >
        <TabsList>
          {visible.map((key) => (
            <TabsTrigger key={key} value={key}>
              {labels.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>
        {visible.map((key) => (
          <TabsContent key={key} value={key}>
            {screens[key]}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
