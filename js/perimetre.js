/* République du Bénin — MEMP — Cloisonnement des espaces de travail : un Conseiller Pédagogique (CP) ne voit, ne modifie et ne supprime
   que les données de SA zone pédagogique. Règles pures (sans accès à la base) appliquées par js/db.js à CHAQUE lecture et écriture :
   aucun écran, export, sauvegarde ou module ne peut donc contourner le cloisonnement.   Conception : Maître Aimé FACHOLA */

export const STORES_ZONE = ['schools', 'fiches', 'classReports', 'personnel', 'effectifs', 'recensements', 'activities', 'bilans'];
const COMMUNS = /^(seed-|officiel-cs-|comptes-fictifs|dosp-pobe|integre-|reglement|edt[:-])/;   // réglages communs à l'appareil
const RE_ZONE = /[A-Za-z0-9]+-ZP\d+/g;   // code de zone pédagogique (ex. CSPOBE-ZP01) lu dans les clés de réglages

/** Règles d'un CP ; null pour les autres rôles (administrateur, CCS, DDEMP, DOSP : périmètre de leur rôle, géré par scoped/inScope). */
export function creerPerimetre(user) {
  if (!user || user.role !== 'CP') return null;
  const z = user.codeZone || '', nom = user.username || '', codeCp = user.codeCp || '';
  const bilans = new Set();
  const cleOk = (cle) => {
    const k = String(cle || '');
    if (k === 'zone_desheritee') return false;
    const zs = k.match(RE_ZONE);
    return !zs || zs.every(x => x === z);
  };
  const propre = (rec) => !!z && !!rec && rec.codeZone === z;
  const lit = (store, rec) => {
    if (!rec) return false;
    if (STORES_ZONE.includes(store)) return propre(rec);
    switch (store) {
      case 'users': return rec.id === user.id;
      case 'logs': return rec.user === nom;
      case 'docs': return rec.by === nom || (!!codeCp && rec.cp === codeCp) || propre(rec);
      case 'dosp': return propre(rec) || rec.by === nom;
      case 'photos': return bilans.has(rec.bilanId);
      case 'settings': return cleOk(rec.key);
      case 'ref': return rec.type === 'zone' ? rec.code === z : rec.type === 'up' ? (rec.codeZone || z) === z : true;
      default: return true;   // themesDone, réglages (voir cleReglageOk), etc.
    }
  };
  return {
    zone: z,
    lit,
    /** Peut-on enregistrer cet enregistrement ? Retourne { ok, rec } (zone complétée si absente) */
    ecrit(store, rec, existant) {
      if (!rec) return { ok: false, rec };
      if (existant && !lit(store, existant)) return { ok: false, rec };
      if (STORES_ZONE.includes(store)) {
        if (!z) return { ok: false, rec };
        if (!rec.codeZone) return { ok: true, rec: { ...rec, codeZone: z } };
        return { ok: rec.codeZone === z, rec };
      }
      if (store === 'dosp' && !rec.codeZone) return { ok: true, rec: { ...rec, codeZone: z, by: rec.by || nom } };
      if (store === 'photos') return { ok: bilans.has(rec.bilanId), rec };
      if (store === 'settings') return { ok: cleOk(rec.key), rec };
      if (store === 'ref' && (rec.type === 'zone' || rec.type === 'up')) return { ok: lit(store, rec), rec };
      return { ok: lit(store, rec) || store === 'logs' || store === 'docs', rec };
    },
    /** Clé de réglage autorisée : toute clé qui porte le code d'une zone doit porter celui du CP ; la clé commune de la zone déshéritée est fermée */
    cleReglageOk: cleOk,
    /** Clé effective d'un réglage : communs à l'appareil (amorçage, textes officiels) inchangés ; clés déjà zonées inchangées ; les autres suffixées « @zone » */
    cleReglage(cle) {
      const k = String(cle || '');
      if (k === 'zone_desheritee') return k + ':' + z;
      if (COMMUNS.test(k) || k.match(RE_ZONE)) return k;
      return k + '@' + z;
    },
    noterBilans(liste) { bilans.clear(); (liste || []).forEach(b => b && b.id && bilans.add(b.id)); },
    noterBilan(id) { if (id) bilans.add(id); },
  };
}
