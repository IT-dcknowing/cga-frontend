/*
 * Fond de la carte économique (04-UX-UI §6 « EconomicMap », maquette `cga-connect-v4-1.html` validée) :
 * contour simplifié de la Côte d'Ivoire dans un repère de 220 × 260, et position de chaque zone. Une
 * Direction régionale est placée par sa « zone de la carte » (`geo_key`, saisie dans le référentiel des
 * DR) ; plusieurs DR d'une même zone (Abidjan Nord 1 à 4) forment une seule bulle. Une DR sans zone
 * connue figure dans le tableau sous la carte, sans bulle.
 */
export const MAP_VIEW_BOX = '0 0 220 260';

export const MAP_OUTLINE =
  'M52 18 L118 10 L138 26 L172 30 L186 62 L196 96 L192 138 L200 170 L188 200 L196 224 L168 232 L150 246 L118 236 L96 246 L64 234 L36 238 L30 206 L18 178 L26 148 L20 116 L34 84 L30 52 Z';

export const MAP_ZONES: Record<string, { label: string; x: number; y: number }> = {
  abidjan: { label: 'Abidjan', x: 150, y: 208 },
  bouake: { label: 'Bouaké', x: 118, y: 118 },
  yamoussoukro: { label: 'Yamoussoukro', x: 104, y: 150 },
  'san-pedro': { label: 'San Pedro', x: 72, y: 212 },
  korhogo: { label: 'Korhogo', x: 96, y: 52 },
  daloa: { label: 'Daloa', x: 64, y: 142 },
};

/** Rayon des bulles : le plus petit et le plus grand, proportionnels au chiffre d'affaires. */
export const BUBBLE_RADIUS = { min: 6, max: 28 };
