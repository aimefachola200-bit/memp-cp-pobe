/* République du Bénin — MEMP — Guide d'utilisation (moteur commun js/guide.js, contenu js/guide-contenu.js) : recherche,
   choix du rôle, impression / PDF, LISEZ-MOI.pdf. Conception : Maître Aimé FACHOLA */
export async function render(id, ctx) {
  ctx.title && ctx.title('Guide d’utilisation', 'Premiers pas, chaque module en quelques étapes, sauvegarde, hors ligne, impression, vérification, questions fréquentes');
  if (!window.Guide) { ctx.el.append(Object.assign(document.createElement('p'), { textContent: 'Guide indisponible : rechargez l’application.' })); return; }
  const role = { ADMIN: 'admin', CP: 'cp', CCS: 'ccs', DDEMP: 'ddemp', DOSP: 'dosp' }[ctx.user && ctx.user.role] || '';
  window.Guide.monter(ctx.el, window.GUIDE_CONTENU, { role });
}
