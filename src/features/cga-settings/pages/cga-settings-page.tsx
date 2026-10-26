import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import { AgentsPanel } from '@/features/cga-settings/components/agents-panel';
import { CampaignTab } from '@/features/cga-settings/components/campaign-tab';
import { CentreTab } from '@/features/cga-settings/components/centre-tab';
import { FeeScheduleTab } from '@/features/cga-settings/components/fee-schedule-tab';
import { ReferrersTab } from '@/features/cga-settings/components/referrers-tab';
import { cgaPermissionRoutes } from '@/features/cga-settings/lib/routes';
import { RolesList } from '@/features/permissions/components/roles-list';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/parametres` (03-APPFLOW §4.3) : onglets Centre, Utilisateurs, Droits par rôle, Barème,
 * Règles, Apporteurs d'affaires, Campagne d'attestations, Facturation FNE — chacun montré selon les
 * droits effectifs de `/me` (RG-ROLE-07), le serveur refaisant le contrôle. Les onglets dont l'écran
 * arrive avec un lot suivant affichent « Bientôt disponible ». L'onglet ouvert vit dans l'adresse.
 */
const labels = fr.cgaSettings;
const cga = permissionCodes.cga;

const TABS = [
  'centre',
  'utilisateurs',
  'droits',
  'bareme',
  'regles',
  'apporteurs',
  'campagne',
  'facturation',
] as const;

type Tab = (typeof TABS)[number];

/** Droit qui ouvre chaque onglet. */
const RIGHTS: Record<Tab, string> = {
  centre: cga.profile,
  utilisateurs: cga.users,
  droits: cga.permissions,
  bareme: cga.profile,
  regles: cga.profile,
  apporteurs: cga.referrers,
  campagne: cga.documentsProduce,
  facturation: cga.integrations,
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

const SCREENS: Partial<Record<Tab, ReactNode>> = {
  centre: <CentreTab />,
  utilisateurs: <AgentsPanel scope="cga" />,
  droits: <RolesList level="cga" detailPath={cgaPermissionRoutes.role} />,
  bareme: <FeeScheduleTab />,
  apporteurs: <ReferrersTab />,
  campagne: <CampaignTab />,
};

export function CgaSettingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = TABS.filter((tab) => can(RIGHTS[tab]));
  // Le menu « Paramètres » demande la fiche du centre ou ses utilisateurs : un onglet au moins.
  const tab = oneOf(visible, params.get('onglet')) ?? visible.at(0) ?? 'centre';

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
            {SCREENS[key] ?? <Pending />}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
