/* Sauvegardes automatiques — commun à CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro Master / Master.
   - Instantanés locaux périodiques (IndexedDB « sauvegardes-<app> ») : un par jour d'utilisation au plus, les N derniers gardés ;
   - Rappel (bandeau) quand la dernière sauvegarde exportée a plus de 7 jours ;
   - Export en un geste : fichier .json avec enveloppe { format: 'SAUVEGARDE-AUTO', app, cree, empreinte SHA-256, donnees } ;
   - Restauration (instantané ou fichier) avec contrôle d'intégrité : l'empreinte est recalculée avant de remplacer quoi que ce soit.
   L'application fournit : { app, titre, lire: async () => texte JSON de toutes ses données, restaurer: async (texte) => void,
     exporterApp?: async () => void (export propre à l'application, marqué comme sauvegarde), garder?: 10, intervalleH?: 20,
     rappel?: true (bandeau intégré), joursRappel?: 7, couleur?, peutRestaurer?: () => booléen }.
   API : window.SauvegardeAuto.installer(A) → { instantane(force), liste(), restaurer(id), exporter(), importerFichier(file), fenetre(), derniereExport() }.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.SauvegardeAuto) return;
  const FORMAT = 'SAUVEGARDE-AUTO';
  async function sha256(t) {
    const b = new TextEncoder().encode(t);
    if (global.crypto && crypto.subtle) { const d = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h = 2166136261; for (const x of b) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return 'f' + h.toString(16);
  }
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* rien */ } } };
  const jours = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity;
  const frDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const taille = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function installer(A) {
    A = Object.assign({ garder: 10, intervalleH: 20, rappel: true, joursRappel: 7, couleur: '#1F4E79', titre: 'Application' }, A || {});
    const NOM = 'sauvegardes-' + A.app, K_EXPORT = 'sauvegardeExport:' + A.app, K_REPORT = 'sauvegardeReport:' + A.app;
    let base = null;
    const ouvrir = () => base || (base = new Promise((res, rej) => {
      try {
        const r = indexedDB.open(NOM, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('instantanes', { keyPath: 'id' });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('base occupée'));
      } catch (e) { rej(e); }
    }));
    const tx = async (mode, f) => { const db = await ouvrir(); return new Promise((res, rej) => { const t = db.transaction('instantanes', mode); const r = f(t.objectStore('instantanes')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
    async function liste() {
      const db = await ouvrir();
      return new Promise((res) => { const q = db.transaction('instantanes', 'readonly').objectStore('instantanes').getAll(); q.onsuccess = () => res((q.result || []).map(x => ({ id: x.id, date: x.date, octets: x.octets, empreinte: x.empreinte, motif: x.motif })).sort((a, b) => b.date.localeCompare(a.date))); q.onerror = () => res([]); });
    }
    /** Instantané local : au plus un toutes les intervalleH heures, sauf force (avant une restauration, une synchronisation…) */
    async function instantane(force, motif) {
      try {
        const l = await liste();
        if (!force && l[0] && (Date.now() - new Date(l[0].date).getTime()) < A.intervalleH * 3600000) return null;
        const texte = await A.lire();
        if (!texte || texte.length < 20) return null;
        const empreinte = await sha256(texte);
        if (!force && l[0] && l[0].empreinte === empreinte) return null;   // rien n'a changé
        const x = { id: new Date().toISOString().replace(/[:.]/g, '-'), date: new Date().toISOString(), octets: texte.length, empreinte, motif: motif || (force ? 'manuel' : 'automatique'), texte };
        await tx('readwrite', s => s.put(x));
        const tous = await liste();
        for (const v of tous.slice(A.garder)) await tx('readwrite', s => s.delete(v.id));
        return x.id;
      } catch (e) { console.warn('Instantané impossible :', e && e.message); return null; }
    }
    async function lireInstantane(id) { const db = await ouvrir(); return new Promise((res) => { const q = db.transaction('instantanes', 'readonly').objectStore('instantanes').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
    /** Restauration d'un instantané : intégrité vérifiée, instantané de l'état actuel pris avant */
    async function restaurer(id) {
      const x = await lireInstantane(id);
      if (!x) throw new Error('Instantané introuvable.');
      if ((await sha256(x.texte)) !== x.empreinte) throw new Error('Instantané endommagé (empreinte différente) : restauration refusée.');
      JSON.parse(x.texte);
      await instantane(true, 'avant restauration');
      await A.restaurer(x.texte);
      return true;
    }
    function nomFichier() { return 'sauvegarde_' + A.app + '_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json'; }
    /** Export en un geste : enveloppe avec empreinte ; partage (téléphone) ou téléchargement */
    async function exporter() {
      const texte = await A.lire();
      const env = { format: FORMAT, app: A.app, titre: A.titre, cree: new Date().toISOString(), empreinte: await sha256(texte), octets: texte.length, donnees: texte };
      const blob = new Blob([JSON.stringify(env)], { type: 'application/json' }), nom = nomFichier();
      const f = (typeof File !== 'undefined') ? new File([blob], nom, { type: 'application/json' }) : null;
      let ok = false;
      if (f && navigator.canShare && navigator.canShare({ files: [f] }) && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ files: [f], title: nom }); ok = true; } catch (e) { ok = false; } }
      if (!ok) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); ok = true; }
      marquerExport(); return nom;
    }
    function marquerExport() { ls.set(K_EXPORT, new Date().toISOString()); const b = document.getElementById('sauvRappel-' + A.app); if (b) b.remove(); }
    const derniereExport = () => ls.get(K_EXPORT);
    /** Restauration depuis un fichier exporté (enveloppe contrôlée) */
    async function importerFichier(fichier) {
      const t = await fichier.text(); let env;
      try { env = JSON.parse(t); } catch (e) { throw new Error('Fichier illisible (ce n’est pas une sauvegarde).'); }
      if (!env || env.format !== FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde « en un geste » de l’application. Utilisez la restauration habituelle de l’application pour les autres sauvegardes.');
      if (env.app !== A.app) throw new Error('Cette sauvegarde vient d’une autre application (' + (env.titre || env.app) + ').');
      if ((await sha256(env.donnees || '')) !== env.empreinte) throw new Error('Sauvegarde endommagée ou modifiée (empreinte différente) : restauration refusée.');
      JSON.parse(env.donnees);
      await instantane(true, 'avant restauration');
      await A.restaurer(env.donnees);
      return env.cree;
    }
    function rappel() {
      if (!A.rappel) return;
      const d = derniereExport(), r = ls.get(K_REPORT);
      if (jours(d) < A.joursRappel || jours(r) < 1 || document.getElementById('sauvRappel-' + A.app)) return;
      const b = document.createElement('div');
      b.id = 'sauvRappel-' + A.app; b.setAttribute('role', 'status'); b.dataset.sauvegarde = 'rappel';
      b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147482000;max-width:560px;margin:0 auto;background:#fff;color:#1D2939;border:2px solid ' + A.couleur + ';border-radius:12px;padding:10px 12px;font:14px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.2);display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      b.innerHTML = '<span style="flex:1;min-width:200px">' + (d ? 'Dernière sauvegarde exportée il y a ' + jours(d) + ' jours.' : 'Aucune sauvegarde n’a encore été exportée de cet appareil.') + ' Gardez une copie hors de l’appareil (clé USB, WhatsApp, courriel).</span>'
        + '<button type="button" data-a="oui" style="min-height:38px;border:0;border-radius:8px;background:' + A.couleur + ';color:#fff;padding:0 12px;font:inherit;font-weight:700;cursor:pointer">Sauvegarder maintenant</button>'
        + '<button type="button" data-a="non" style="min-height:38px;border:1px solid #D0D5DD;border-radius:8px;background:#fff;padding:0 10px;font:inherit;cursor:pointer">Demain</button>';
      b.querySelector('[data-a="oui"]').onclick = () => { (A.exporterApp ? Promise.resolve(A.exporterApp()).then(marquerExport) : exporter()).catch(e => alert(e.message)); };
      b.querySelector('[data-a="non"]').onclick = () => { ls.set(K_REPORT, new Date().toISOString()); b.remove(); };
      document.body.append(b);
    }
    /** Fenêtre : instantanés locaux (restaurer, télécharger), export en un geste, restauration d'un fichier */
    async function fenetre() {
      const l = await liste();
      const restaurable = !A.peutRestaurer || A.peutRestaurer();
      const ov = document.createElement('div'); ov.dataset.sauvegarde = 'fenetre';
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(16,24,40,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 10px;overflow:auto;font:14px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif';
      ov.innerHTML = '<div style="background:#fff;color:#1D2939;border-radius:12px;width:min(720px,100%);overflow:hidden">'
        + '<div style="background:' + A.couleur + ';color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center"><b>Sauvegardes de ' + esc(A.titre) + '</b><button type="button" data-a="fermer" aria-label="Fermer" style="background:none;border:0;color:#fff;font-size:22px;cursor:pointer;min-width:36px;min-height:36px">×</button></div>'
        + '<div style="padding:12px 14px">'
        + '<p style="margin:0 0 8px">L’application garde sur cet appareil les ' + A.garder + ' dernières copies de vos données (une par jour d’utilisation au plus). Elles protègent d’une erreur de saisie, pas de la perte de l’appareil : exportez aussi une copie.</p>'
        + '<p style="margin:0 0 10px;color:#475467">Dernière copie exportée : <b>' + (derniereExport() ? frDate(derniereExport()) : 'jamais') + '</b></p>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px"><button type="button" data-a="exporter" style="min-height:40px;border:0;border-radius:8px;background:' + A.couleur + ';color:#fff;padding:0 12px;font:inherit;font-weight:700;cursor:pointer">Exporter une sauvegarde (un geste)</button>'
        + '<button type="button" data-a="instantane" style="min-height:40px;border:1px solid #D0D5DD;border-radius:8px;background:#fff;padding:0 12px;font:inherit;cursor:pointer">Copie locale maintenant</button>'
        + (restaurable ? '<label style="min-height:40px;border:1px solid #D0D5DD;border-radius:8px;padding:0 12px;display:inline-flex;align-items:center;cursor:pointer">Restaurer un fichier…<input type="file" accept=".json,application/json" data-a="fichier" style="display:none"></label>' : '<span style="align-self:center;color:#667085;font-size:12px">La restauration est réservée à l’administrateur.</span>') + '</div>'
        + '<div style="overflow:auto;max-height:50vh;border:1px solid #EAECF0;border-radius:8px"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#F2F4F7;position:sticky;top:0"><th style="text-align:left;padding:6px 8px">Date</th><th style="text-align:left;padding:6px 8px">Motif</th><th style="text-align:left;padding:6px 8px">Taille</th><th></th></tr></thead><tbody>'
        + (l.length ? l.map(x => '<tr><td style="padding:6px 8px;border-top:1px solid #EAECF0">' + frDate(x.date) + '</td><td style="padding:6px 8px;border-top:1px solid #EAECF0">' + esc(x.motif) + '</td><td style="padding:6px 8px;border-top:1px solid #EAECF0">' + taille(x.octets) + '</td><td style="padding:6px 8px;border-top:1px solid #EAECF0;white-space:nowrap">' + (restaurable ? '<button type="button" data-r="' + esc(x.id) + '" style="min-height:32px;border:1px solid #FDA29B;color:#B42318;border-radius:7px;background:#fff;cursor:pointer;font:inherit">Restaurer</button>' : '') + '</td></tr>').join('')
          : '<tr><td colspan="4" style="padding:10px;color:#667085">Aucune copie locale pour le moment.</td></tr>')
        + '</tbody></table></div><p data-msg style="min-height:1.3em;margin:8px 0 0;color:#067647"></p></div></div>';
      document.body.append(ov);
      const msg = ov.querySelector('[data-msg]'), fermer = () => ov.remove();
      ov.querySelector('[data-a="fermer"]').onclick = fermer;
      ov.addEventListener('click', e => { if (e.target === ov) fermer(); });
      ov.querySelector('[data-a="exporter"]').onclick = async () => { try { const n = await exporter(); msg.textContent = 'Sauvegarde exportée : ' + n; } catch (e) { msg.style.color = '#B42318'; msg.textContent = e.message; } };
      ov.querySelector('[data-a="instantane"]').onclick = async () => { const id = await instantane(true, 'manuel'); fermer(); if (id) fenetre(); };
      if (ov.querySelector('[data-a="fichier"]')) ov.querySelector('[data-a="fichier"]').onchange = async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        if (!confirm('Remplacer toutes les données de cet appareil par cette sauvegarde ? (une copie de l’état actuel est gardée)')) return;
        try { const d = await importerFichier(f); msg.textContent = 'Sauvegarde du ' + frDate(d) + ' restaurée.'; } catch (x) { msg.style.color = '#B42318'; msg.textContent = x.message; }
      };
      ov.querySelectorAll('[data-r]').forEach(b => { b.onclick = async () => {
        if (!confirm('Revenir à la copie du ' + b.closest('tr').firstChild.textContent + ' ? Les données actuelles sont gardées dans une nouvelle copie.')) return;
        try { await restaurer(b.dataset.r); msg.textContent = 'Copie restaurée.'; } catch (x) { msg.style.color = '#B42318'; msg.textContent = x.message; }
      }; });
    }
    // démarrage : instantané du jour et rappel, puis toutes les heures
    const cycle = () => { instantane(false).then(() => rappel()); };
    setTimeout(cycle, 4000); setInterval(cycle, 3600000);
    return { instantane, liste, restaurer, exporter, importerFichier, fenetre, derniereExport, marquerExport, rappel };
  }
  global.SauvegardeAuto = { installer, FORMAT, sha256 };
})(typeof window !== 'undefined' ? window : globalThis);
