import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import { RolesList } from '@/features/permissions/components/roles-list';
import { NetworkUsersList } from '@/features/platform/components/network-users-list';
import { ReferenceDataPanel } from '@/features/reference-data/components/reference-data-panel';
import { TemplatesPanel } from '@/features/templates/components/templates-panel';
import { platformRoutes } from '@/features/platform/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';

/*
 * `/plateforme` (03-APPFLOW §6, administrateur de la plateforme) : un onglet par fonction, chacun
 * selon les droits effectifs de `/me`. Les onglets dont l'écran arrive avec une étape suivante, ou
 * dont l'API manque encore, affichent « Bientôt disponible ». L'onglet ouvert vit dans l'adresse.
 */
const labels = fr.platform;

const TABS = ['droits', 'utilisateurs', 'reseau', 'donnees', 'modeles'] as const;

type Tab = (typeof TABS)[number];

const RIGHTS: Record<Tab, string> = {
  droits: 'network_permissions.manage',
  utilisateurs: 'network_user_permissions.manage',
  reseau: 'platform.settings.manage',
  donnees: 'referentials.manage',
  modeles: 'platform.templates.manage',
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

export function PlatformPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = TABS.filter((tab) => can(RIGHTS[tab]));
  const tab = oneOf(visible, params.get('onglet')) ?? visible.at(0) ?? 'droits';

  const screens: Partial<Record<Tab, ReactNode>> = {
    droits: <RolesList level="network" detailPath={platformRoutes.role} />,
    utilisateurs: <NetworkUsersList />,
    donnees: <ReferenceDataPanel />,
    modeles: <TemplatesPanel />,
  };

  return (
    <>
      <PageHeader title={fr.spaces.platform} />

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
            {screens[key] ?? <Pending />}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
