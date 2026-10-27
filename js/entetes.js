/* République du Bénin — MEMP — En-têtes de tableaux toujours visibles (comme « Figer les volets » d'Excel)
   Pendant le défilement de la page, la ligne d'en-tête (thead) de chaque tableau descend avec l'écran et reste juste sous
   la barre du haut, la barre d'actions et le titre de la rubrique (s'il est fixé), jusqu'à la fin du tableau.
   Les tableaux peuvent défiler en largeur dans leur cadre : l'en-tête suit, la première colonne reste à gauche.
   Conception : Maître Aimé FACHE */
const CADRES = '.tbl-wrap > table, .gridwrap > table, .rc-tw > table, .fixe-wrap > table';
let prevu = false;
function titreAuDessus(table) {
  // titre de rubrique fixé dans le même bloc (.sec-title de la section, h3.fixe ou h4 de la carte)
  const sec = table.closest('.sec-body'); if (sec && sec.previousElementSibling && sec.previousElementSibling.classList.contains('sec-title')) return sec.previousElementSibling;
  const carte = table.closest('.card'); if (carte) { const t = carte.querySelector(':scope > h3.fixe, :scope > h4.fixe, :scope > .rubrique-fixe') || (carte.classList.contains('eff-wrap') ? carte.querySelector(':scope > h4') : null); if (t) return t; }
  return null;
}
function placer() {
  prevu = false;
  const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr')) || 0;
  for (const table of document.querySelectorAll(CADRES)) {
    const th = table.tHead; if (!th) continue;
    const r = table.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) { if (th.style.transform) { th.style.transform = ''; th.classList.remove('entete-flottante'); } continue; }
    const t = titreAuDessus(table), haut = hdr + (t ? Math.max(0, t.getBoundingClientRect().bottom - hdr) : 0);
    const dec = Math.min(haut - r.top, r.height - th.offsetHeight - 24);
    if (dec > 0) { th.style.transform = `translateY(${Math.round(dec)}px)`; th.classList.add('entete-flottante'); }
    else if (th.style.transform) { th.style.transform = ''; th.classList.remove('entete-flottante'); }
  }
}
export function suivreEntetes() { if (!prevu) { prevu = true; requestAnimationFrame(placer); } }
addEventListener('scroll', suivreEntetes, { passive: true });
addEventListener('resize', suivreEntetes);
// contenu redessiné (onglets, saisies) : on replace les en-têtes
new MutationObserver(suivreEntetes).observe(document.documentElement, { childList: true, subtree: true });
