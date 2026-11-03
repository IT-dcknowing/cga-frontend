import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CenterObligationsTab } from '@/features/obligations/components/center-obligations-tab';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';

/*
 * `/cga/gestion-interne` (03-APPFLOW §4.3) : onglet « Obligations du centre » (F-OBL-07, étape 4.7) ;
 * l'onglet « Fiche permanente » du rapport trimestriel suit à l'étape 5.7. L'onglet ouvert est dans
 * l'adresse (`?onglet=`).
 */
const TABS = ['obligations'] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  obligations: fr.obligations.center.tab,
};

export function InternalPage() {
  const [params, setParams] = useSearchParams();
  const tab = oneOf(TABS, params.get('onglet')) ?? TABS[0];

  return (
    <>
      <PageHeader title={fr.nav.internal} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setParams({ onglet: value }, { replace: true });
        }}
      >
        <TabsList>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {TAB_LABELS[key]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="obligations">
          <CenterObligationsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
