import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/session/auth-context';
import { AgentsPanel } from '@/features/cga-settings/components/agents-panel';
import { CentreTab } from '@/features/cga-settings/components/centre-tab';
import { CatalogTab } from '@/features/obligations/components/catalog-tab';
import { ReferentialPanel } from '@/features/referentials/components/referential-panel';
import {
  communesDef,
  directoratesDef,
  holidaysDef,
  nationalReferencesDef,
  sectorsDef,
  taxOfficesDef,
} from '@/features/referentials/lib/definitions';
import { SettingsPanel } from '@/features/settings/components/settings-panel';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cncga/parametres` (03-APPFLOW §3.2, étape 1.7) : Utilisateurs CNCGA (Présidente), Secteurs,
 * DR / CDI / communes, Catalogue des obligations (étape 4.9), Références nationales, Jours fériés,
 * Paramètres réseau (étape 5.13), Règles du rapport (étape 5.6b), Identité du CNCGA — chacun selon
 * les droits effectifs de `/me`, le serveur refaisant le contrôle. L'onglet ouvert vit dans l'adresse.
 */
const labels = fr.cncgaSettings;
const REPORT_RULE = 'report.increase_rule';
const cncga = permissionCodes.cncga;

const TABS = [
  'utilisateurs',
  'secteurs',
  'territoire',
  'catalogue',
  'references',
  'feries',
  'reseau',
  'regles',
  'identite',
] as const;

type Tab = (typeof TABS)[number];

const RIGHTS: Record<Tab, string> = {
  // Fiche du CNCGA, émetteur des reçus et factures de cotisation (étape 6.9).
  identite: cncga.profile,
  utilisateurs: cncga.users,
  secteurs: cncga.referentials,
  territoire: cncga.referentials,
  // Catalogue national des obligations (étape 4.9, RG-DATA-04).
  catalogue: cncga.referentials,
  references: cncga.referentials,
  feries: cncga.referentials,
  reseau: cncga.settings,
  // Règle « cotisation augmentée » du rapport trimestriel (étape 5.6b, RG-RPT-08).
  regles: cncga.settings,
};

export function CncgaSettingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = TABS.filter((tab) => can(RIGHTS[tab]));
  const tab = oneOf(visible, params.get('onglet')) ?? visible.at(0) ?? 'utilisateurs';
  const manages = can(cncga.referentials);

  const screens: Record<Tab, ReactNode> = {
    identite: <CentreTab scope="network" />,
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
    catalogue: <CatalogTab />,
    references: <ReferentialPanel def={nationalReferencesDef} canManage={manages} />,
    feries: <ReferentialPanel def={holidaysDef} canManage={manages} />,
    reseau: <SettingsPanel space="network" include={(setting) => setting.key !== REPORT_RULE} />,
    regles: (
      <SettingsPanel
        space="network"
        include={(setting) => setting.key === REPORT_RULE}
        intro={fr.settings.reportRules.intro}
      />
    ),
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
