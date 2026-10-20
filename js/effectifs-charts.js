/* République du Bénin — MEMP — Courbes d'âge (SVG), sans dépendance */
import { graphique } from './graphiques.js';
export const COULEURS = { G: '#0369a1', F: '#be185d', T: '#006633' };
export const PALETTE = ['#0369a1', '#be185d', '#15803d', '#b45309', '#6d28d9', '#0f766e'];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const joli = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/** series : [{ nom, color, values, tirets? }] ; labels : abscisses — graphique au choix (courbe, histogramme, barres
    empilées, aires, points), voir graphiques.js */
export function svgCourbe(opts) { return graphique(opts); }
