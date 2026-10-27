/* République du Bénin — MEMP — Vues d'administration : identité numérique, transmission, vérification, journal, utilisateurs, paramètres
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, uid, nowISO, toast, modal, confirmBox, pickFile, readAsText, download, sha256, checkPassword, hashPassword, fmtDateTime, clean, bytesToB64, fetchBytes, today, $ } from './util.js';
import { db } from './db.js';
import { APP, CREDIT } from './config.js';
import { dataTable, formDialog, fieldEl } from './ui.js';
import { scoped, inScope, addLog, session, ROLES, ficheOf } from './data.js';
import { getIdentity, saveIdentity, makeCachet, cachetParDefaut, signaturePad, canonical, ficheHash, reportHash, bilanHash } from './sign.js';
import { qrDataURL } from './qr.js';
import { zoneCode } from './refdata.js';
import { listToXlsx } from './export.js';
import { prefill, sectionsFor } from './schema.js';

export async function render(id, ctx) { return ({ identite, transmission, verifier, journal, utilisateurs, parametres })[id](ctx); }

/* ================= Mot de passe ================= */
export function changePasswordDialog(user, forced = false) {
  const v = { old: '', n1: '', n2: '' };
  modal({ title: forced ? 'Changez votre mot de passe' : 'Changer le mot de passe', body: h('div', forced ? h('p', 'Pour la sécurité de vos données, choisissez un nouveau mot de passe personnel.') : null,
    [['old', 'Mot de passe actuel'], ['n1', 'Nouveau mot de passe (6 caractères minimum)'], ['n2', 'Confirmer le nouveau mot de passe']].map(([k, l]) => fieldEl({ k, l, t: 'password' }, '', (kk, val) => { v[kk] = val; }))),
    actions: [{ label: forced ? 'Plus tard' : 'Annuler' }, { label: 'Enregistrer', kind: 'primary', keepOpen: true, onClick: async (e, close) => {
      const rec = await db.get('users', user.id);
      if (!(await checkPassword(v.old, rec.pwd))) { toast('Mot de passe actuel incorrect.', 'err'); return false; }
      if (v.n1.length < 6) { toast('6 caractères minimum.', 'err'); return false; }
      if (v.n1 !== v.n2) { toast('Les deux saisies ne correspondent pas.', 'err'); return false; }
      rec.pwd = await hashPassword(v.n1); rec.mustChange = false; await db.put('users', rec); session.user = rec; toast('Mot de passe modifié.'); close(); } }] });
}

/* ================= Identité numérique ================= */
async function identite(ctx) {
  const u = ctx.user; ctx.title('Identité numérique', 'Signature manuscrite, cachet rond (ou rectangulaire) et QR code — apposés sur les PDF signés');
  const idn = (await getIdentity()) || { codeCp: u.codeCp || '', nom: u.nom || '', prenoms: u.prenoms || '', titre: u.role === 'CCS' ? 'Chef de Circonscription Scolaire' : u.role === 'DOSP' ? "Chef de la Division de l'Organisation Scolaire et de la Prévision" : u.role === 'DDEMP' ? 'Directeur Départemental des Enseignements Maternel et Primaire' : u.role === 'ADMIN' ? 'Administration du MEMP' : 'Conseiller Pédagogique', departement: u.departement || '', nomCs: u.nomCs || '', numZone: u.numZone || '', codeZone: u.codeZone || '', telephone: '', email: '', qrToken: uid(), signature: '' };
  const F = [['cachetType', 'Forme du cachet', 'select', [{ v: 'rond', l: 'Cachet rond (comme SCOLARIS)' }, { v: 'rectangulaire', l: 'Cachet rectangulaire' }]], ['cachetCouleur', 'Couleur du cachet', 'select', [{ v: 'bleu', l: 'Bleu' }, { v: 'rouge', l: 'Rouge' }]], ['codeCp', 'Code CP', 'text'], ['titre', 'Titre / fonction', 'text'], ['nom', 'Nom', 'text'], ['prenoms', 'Prénoms', 'text'], ['departement', 'Département', 'text'], ['nomCs', 'Circonscription scolaire', 'text'], ['numZone', 'N° de zone', 'text'], ['telephone', 'Téléphone', 'text'], ['email', 'E-mail', 'text'], ['cachetSup', 'Cachet rond : texte du haut', 'text'], ['cachetInf', 'Cachet rond : texte du bas', 'text'], ['cachetCentre', 'Cachet rond : centre (lignes séparées par |)', 'text']];
  const pad = signaturePad(idn.signature), prev = h('div'), qrBox = h('div', { style: { textAlign: 'center' } });
  const renderPrev = async () => { idn.codeZone = zoneCode(u.codeCs || '', idn.numZone) || idn.codeZone; const img = h('img', { src: await makeCachet(idn), style: { maxWidth: '100%', width: (idn.cachetType || 'rond') === 'rond' ? '220px' : '420px', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px' }, alt: 'Cachet' }); prev.replaceChildren(img);
    qrBox.replaceChildren(h('img', { src: qrDataURL(`MEMP-BJ|CP|${idn.codeCp || '-'}|${idn.qrToken}`, 5, 2), alt: 'QR code du CP', width: 150, height: 150 }), h('div', { class: 'notes' }, 'QR d\'identité du CP')); };
  ctx.el.append(h('div', { class: 'card' }, h('h3', 'Identité'), h('div', { class: 'grid12' }, F.map(([k, l, t, options]) => fieldEl({ k, l, t, options, w: 'half' }, idn[k] ?? (k.startsWith('cachet') ? ({ cachetType: 'rond', cachetCouleur: 'bleu', ...Object.fromEntries(Object.entries(cachetParDefaut(idn)).map(([a, b]) => ['cachet' + a[0].toUpperCase() + a.slice(1), b])) })[k] : ''), (kk, v) => { idn[kk] = v; renderPrev(); })))),
    h('div', { class: 'card' }, h('h3', 'Signature manuscrite'), h('p', { class: 'notes' }, 'Dessinez votre signature au doigt, au stylet ou à la souris — ou importez une image (fond blanc ou transparent).'), pad.el,
      h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn', onclick: () => pad.clear() }, '🧹 Effacer'), h('button', { class: 'btn', onclick: async () => { const f = await pickFile('image/*'); if (!f) return; const img = new Image(); img.onload = () => { const g = pad.el.getContext('2d'); g.clearRect(0, 0, pad.el.width, pad.el.height); const s = Math.min(pad.el.width / img.width, pad.el.height / img.height); g.drawImage(img, (pad.el.width - img.width * s) / 2, (pad.el.height - img.height * s) / 2, img.width * s, img.height * s); }; img.src = URL.createObjectURL(f); } }, '🖼 Importer une image'))),
    h('div', { class: 'card' }, h('h3', 'Cachet numérique & QR code'), prev, qrBox));
  renderPrev();
  ctx.actions([{ label: '💾 Enregistrer mon identité', kind: 'primary', onClick: async () => { if (pad.dirty) idn.signature = pad.toDataURL(); if (!idn.signature) return toast('Dessinez ou importez votre signature.', 'warn'); await saveIdentity(idn); await addLog(u, { action: 'Identité numérique mise à jour', target: idn.codeCp || u.username }); toast('Identité enregistrée sur cet appareil.'); } }]);
}

/* ================= Transmission & sauvegarde ================= */
const FORMAT = 'MEMP-CP-PACKAGE';
async function makePackage(u, statuts) {
  const fiches = (await scoped('fiches', u)).filter(f => statuts.includes(f.statut)), reports = (await scoped('classReports', u)).filter(f => statuts.includes(f.statut));
  const effs = (await scoped('effectifs', u)).filter(f => statuts.includes(f.statut));
  const ids = new Set([...fiches, ...reports, ...effs].map(f => f.schoolId)), schools = (await db.all('schools')).filter(s => ids.has(s.id));
  const refIds = new Set([...fiches, ...reports].map(f => f.id)), docs = (await db.all('docs')).filter(d => refIds.has(d.ficheId));
  const bilans = (await scoped('bilans', u)).filter(f => statuts.includes(f.statut)), bids = new Set(bilans.map(b => b.id)), photos = (await db.all('photos')).filter(p => bids.has(p.bilanId));
  const payload = { fiches, classReports: reports, effectifs: effs, schools, docs: [...docs, ...(await db.all('docs')).filter(d => bids.has(d.ficheId))], bilans, photos };
  return { fiches, reports, bilans, pkg: { format: FORMAT, version: 1, republique: APP.republique, ministere: APP.ministere, concepteur: CREDIT, embleme: bytesToB64(await fetchBytes('assets/armoiries.png')), date: nowISO(), from: { username: u.username, role: u.role, codeZone: u.codeZone || '', codeCs: u.codeCs || '', nomCs: u.nomCs || '' }, payload, hash: await sha256(canonical(payload)) } };
}
async function importPackage(u, text) {
  const pkg = JSON.parse(text); if (pkg.format !== FORMAT) throw new Error('Ce fichier n\'est pas un paquet Application CP.');
  if ((await sha256(canonical(pkg.payload))) !== pkg.hash) throw new Error('Paquet altéré ou corrompu (empreinte invalide).');
  const stat = { nouv: 0, maj: 0, ignore: 0, hors: 0 };
  for (const [store, list] of [['fiches', pkg.payload.fiches || []], ['classReports', pkg.payload.classReports || []], ['bilans', pkg.payload.bilans || []], ['effectifs', pkg.payload.effectifs || []]]) {
    for (const r of list) {
      if (!inScope(u, r)) { stat.hors++; continue; }
      const old = await db.get(store, r.id);
      if (!old) { await db.put(store, r); stat.nouv++; await addLog(u, { action: 'Réception', target: `${r.schoolNom || 'Bilan ' + r.periode} (${r.annee})`, to: r.statut, refId: r.id }); }
      else if ((r.updated || '') > (old.updated || '')) { await db.put(store, r); stat.maj++; await addLog(u, { action: 'Mise à jour reçue', target: `${r.schoolNom || 'Bilan ' + r.periode} (${r.annee})`, from: old.statut, to: r.statut, refId: r.id }); }
      else stat.ignore++;
    }
  }
  for (const p of pkg.payload.photos || []) if (!(await db.get('photos', p.id))) await db.put('photos', p);
  for (const s of pkg.payload.schools || []) if (!(await db.get('schools', s.id)) && inScope(u, s)) await db.put('schools', s);
  for (const d of pkg.payload.docs || []) if (!(await db.get('docs', d.id))) await db.put('docs', d);
  return { stat, from: pkg.from, date: pkg.date };
}
async function transmission(ctx) {
  const u = ctx.user; ctx.title('Transmission & sauvegarde', 'Échange de fiches entre le CP et le CCS sans Internet, sauvegarde et restauration');
  const st = { Transmise: u.role === 'CP', Validée: u.role === 'CCS', 'À corriger': u.role === 'CCS', Brouillon: false };
  const chk = Object.keys(st).map(k => h('label', { class: 'chk', style: { marginRight: '12px' } }, h('input', { type: 'checkbox', checked: st[k], onchange: (e) => { st[k] = e.target.checked; } }), k));
  const out = h('div');
  ctx.el.append(
    h('div', { class: 'card' }, h('h3', '📤 Envoyer des fiches'), h('p', u.role === 'CP' ? 'Le CP exporte ses fiches « Transmise » : le CCS importe le fichier reçu (WhatsApp, e-mail, clé USB, Bluetooth…).' : 'Le CCS exporte les fiches « Validée » ou « À corriger » : le CP importe le fichier pour mettre à jour ses fiches.'),
      h('div', chk), h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn primary', onclick: async () => { const sts = Object.keys(st).filter(k => st[k]); const { fiches, reports, pkg } = await makePackage(u, sts); const n = fiches.length + reports.length + (pkg.payload.bilans || []).length + (pkg.payload.effectifs || []).length; if (!n) return toast('Aucun élément à exporter pour ces statuts.', 'warn'); const name = `MEMP_${clean(u.codeZone || u.codeCs || u.username)}_${today()}.memp.json`; const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' }); download(blob, name); out.replaceChildren(h('p', `${fiches.length} fiche(s), ${reports.length} rapport(s) et ${(pkg.payload.bilans || []).length} bilan(s) exportés dans ${name}.`), navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: 'application/json' })] }) ? h('button', { class: 'btn', onclick: () => navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: 'Paquet Application CP' }).catch(() => {}) }, '📲 Partager…') : null); await addLog(u, { action: 'Export paquet', target: `${n} élément(s)` }); } }, '⬇ Exporter le paquet'), out)),
    h('div', { class: 'card' }, h('h3', '📥 Recevoir des fiches'), h('p', 'Importez un fichier « .memp.json » reçu. L\'intégrité est contrôlée ; seules les données de votre périmètre sont acceptées et la version la plus récente est conservée.'),
      h('button', { class: 'btn primary', onclick: async () => { const f = await pickFile('.json,.memp.json,application/json'); if (!f) return; try { const r = await importPackage(u, await readAsText(f)); await ctx.refreshDatalists(); modal({ title: 'Import terminé', body: h('div', h('p', `Paquet de ${r.from.username} (${ROLES[r.from.role] || r.from.role}) du ${fmtDateTime(r.date)}.`), h('ul', h('li', `${r.stat.nouv} nouvel(les) élément(s)`), h('li', `${r.stat.maj} mis à jour`), h('li', `${r.stat.ignore} déjà à jour`), h('li', `${r.stat.hors} hors de votre périmètre (ignorés)`))), actions: [{ label: 'OK', kind: 'primary' }] }); } catch (e) { toast(e.message, 'err', 6000); } } }, '⬆ Importer un paquet')),
    h('div', { class: 'card' }, h('h3', '💾 Sauvegarde complète de cet appareil'), h('p', 'Contient toutes les données (écoles, fiches, utilisateurs, identité…). Conservez-la en lieu sûr.'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn', onclick: async () => { const all = await db.exportAll(); download(new Blob([JSON.stringify({ format: 'MEMP-CP-BACKUP', version: 1, republique: APP.republique, ministere: APP.ministere, concepteur: CREDIT, embleme: bytesToB64(await fetchBytes('assets/armoiries.png')), date: nowISO(), data: all })], { type: 'application/json' }), `Sauvegarde_Application_CP_${today()}.json`); await addLog(u, { action: 'Sauvegarde complète', target: '' }); } }, '⬇ Sauvegarder'),
        u.role === 'ADMIN' ? h('button', { class: 'btn danger', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const b = JSON.parse(await readAsText(f)); if (b.format !== 'MEMP-CP-BACKUP') throw new Error('Fichier de sauvegarde invalide.'); if (!(await confirmBox('Remplacer TOUTES les données de cet appareil par cette sauvegarde ?', 'Restaurer', true))) return; await db.importAll(b.data, { replace: true }); sessionStorage.clear(); toast('Sauvegarde restaurée. Reconnexion…'); setTimeout(() => location.reload(), 900); } catch (e) { toast(e.message, 'err'); } } }, '⬆ Restaurer (administrateur)') : null)));
}

/* ================= Vérification ================= */
async function verifier(ctx) {
  ctx.title('Vérifier un document', 'Contrôle d\'authenticité d\'un PDF signé à partir de son QR code');
  const ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Collez ici le contenu du QR code (MEMP-BJ|1|…) ou le numéro du document (ex. D3F9A1C2B4)' }), res = h('div');
  async function check(txt) {
    txt = (txt || ta.value).trim(); if (!txt) return;
    const p = txt.split('|'), docId = p[0] === 'MEMP-BJ' && p[1] === '1' ? p[2] : txt.toUpperCase(), q32 = p[3] || '';
    const d = await db.get('docs', docId);
    if (!d) return res.replaceChildren(h('div', { class: 'verdict unk' }, `Document ${docId} inconnu sur cet appareil.`, h('div', { class: 'notes' }, 'Importez le paquet de transmission qui contient cette fiche, puis relancez la vérification.')));
    if (d.store === 'uascep') {
      const { verifierUascep } = await import('./views-uascep.js');
      const v = await verifierUascep(d), qrOkU = !q32 || d.hash.startsWith(q32), r = v.resume;
      return res.replaceChildren(h('div', { class: 'verdict ' + (v.same && qrOkU ? 'ok' : 'bad') }, v.same && qrOkU ? '✔ Document UASCEP authentique : le bureau est identique à celui qui a été signé.' : '✖ ATTENTION : ' + (!qrOkU ? 'le QR code ne correspond pas au document enregistré.' : 'le bureau ou ses registres ont été modifiés après la signature.')),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('p', h('b', 'Type : '), 'UASCEP — ' + (r.type || d.label)), h('p', h('b', 'Document : '), d.id), h('p', h('b', 'Bureau : '), r.bureau || '—'),
          r.membre ? h('p', h('b', 'Membre : '), r.membre) : null, r.fonction ? h('p', h('b', 'Fonction : '), r.fonction) : null, r.saison ? h('p', h('b', 'Saison : '), r.saison) : null,
          h('p', h('b', 'Date : '), r.date || fmtDateTime(d.date)), h('p', h('b', 'Signataire : '), r.signataire || '—'), h('p', h('b', 'Édité par : '), `${d.by} (${d.cp})`), h('p', { class: 'notes' }, 'Empreinte SHA-256 : ' + d.hash)));
    }
    const rec = await db.get(d.store || 'fiches', d.ficheId); if (!rec) return res.replaceChildren(h('div', { class: 'verdict unk' }, 'La fiche associée n\'est plus présente sur cet appareil.'));
    const now = d.store === 'classReports' ? await reportHash(rec) : d.store === 'bilans' ? await bilanHash(rec) : await ficheHash(rec), same = now === d.hash, qrOk = !q32 || d.hash.startsWith(q32);
    res.replaceChildren(h('div', { class: 'verdict ' + (same && qrOk ? 'ok' : 'bad') }, same && qrOk ? '✔ Document authentique : le contenu est identique à celui qui a été signé.' : '✖ ATTENTION : ' + (!qrOk ? 'le QR code ne correspond pas au document enregistré.' : 'la fiche a été modifiée après la signature.')),
      h('div', { class: 'card', style: { marginTop: '10px' } }, h('p', h('b', 'Document : '), d.id), h('p', h('b', 'Objet : '), d.label), h('p', h('b', 'Signé le : '), fmtDateTime(d.date)), h('p', h('b', 'Signataire : '), `${d.by} (${d.cp})`), h('p', h('b', 'Statut actuel de la fiche : '), rec.statut), h('p', { class: 'notes' }, 'Empreinte SHA-256 : ' + d.hash)));
  }
  const scan = h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', maxWidth: '420px', display: 'none', borderRadius: '8px' } });
  let stream;
  ctx.el.append(h('div', { class: 'card' }, ta, h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn primary', onclick: () => check() }, 'Vérifier'),
    'BarcodeDetector' in window ? h('button', { class: 'btn', onclick: async () => { try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); scan.srcObject = stream; scan.style.display = 'block'; const det = new BarcodeDetector({ formats: ['qr_code'] }); const tick = async () => { if (!stream) return; try { const c = await det.detect(scan); if (c[0]) { ta.value = c[0].rawValue; stream.getTracks().forEach(t => t.stop()); stream = null; scan.style.display = 'none'; check(); return; } } catch { /* continue */ } requestAnimationFrame(tick); }; tick(); } catch { toast('Caméra indisponible.', 'err'); } } }, '📷 Scanner le QR code') : null), scan, res));
  return () => { stream && stream.getTracks().forEach(t => t.stop()); };
}

/* ================= Journal ================= */
async function journal(ctx) {
  ctx.title('Journal des validations', 'Historique des transmissions, validations et demandes de correction');
  const rows = (await db.all('logs')).sort((a, b) => b.date.localeCompare(a.date));
  const COLS = [{ k: 'date', l: 'Date', text: r => fmtDateTime(r.date), w: 140 }, { k: 'user', l: 'Utilisateur' }, { k: 'role', l: 'Rôle' }, { k: 'action', l: 'Action', w: 160 }, { k: 'target', l: 'Élément', w: 260 }, { k: 'from', l: 'De' }, { k: 'to', l: 'Vers' }, { k: 'comment', l: 'Commentaire', w: 200 }];
  const t = dataTable({ columns: COLS, rows, pageSize: 100, empty: 'Aucune opération enregistrée.' }); ctx.el.append(t.el);
  ctx.actions([{ label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: 'JOURNAL DES VALIDATIONS', columns: COLS.map(c => ({ ...c, w: c.w || 90 })), rows: t.visible.map(r => ({ ...r, date: fmtDateTime(r.date) })) }), 'Journal.xlsx') }]);
}

/* ================= Utilisateurs ================= */
async function utilisateurs(ctx) {
  const me = ctx.user; ctx.title('Utilisateurs', 'Comptes ADMIN, CP et CCS de cet appareil');
  const F = (isNew) => [{ k: 'username', l: 'Identifiant', t: 'text', req: true, w: 'half' }, { k: 'role', l: 'Rôle', t: 'select', options: Object.entries(ROLES).map(([v, l]) => ({ v, l })), req: true, w: 'half' }, { k: 'nom', l: 'Nom', t: 'text', req: true, w: 'half' }, { k: 'prenoms', l: 'Prénoms', t: 'text', w: 'half' }, { k: 'codeCp', l: 'Code CP', t: 'text', w: 'half' }, { k: 'departement', l: 'Département', t: 'text', list: 'dl-departement', w: 'half' }, { k: 'codeCs', l: 'Code CS', t: 'text', list: 'dl-cscode', w: 'half' }, { k: 'nomCs', l: 'Circonscription scolaire', t: 'text', list: 'dl-cs', w: 'half' }, { k: 'numZone', l: 'N° zone (CP)', t: 'number', w: 'half' }, { k: 'actif', l: 'Compte actif', t: 'check', w: 'half' }, { k: 'pw', l: isNew ? 'Mot de passe initial *' : 'Nouveau mot de passe (laisser vide pour ne pas changer)', t: 'password', req: isNew }];
  const COLS = [{ k: 'username', l: 'Identifiant' }, { k: 'nom', l: 'Nom' }, { k: 'prenoms', l: 'Prénoms' }, { k: 'role', l: 'Rôle', text: r => ROLES[r.role] }, { k: 'codeZone', l: 'Zone' }, { k: 'nomCs', l: 'CS' }, { k: 'actif', l: 'Actif', text: r => r.actif === false ? 'Non' : 'Oui' }];
  const t = dataTable({ columns: COLS, rows: await db.all('users'), onOpen: () => edit() }); ctx.el.append(t.el);
  const reload = async () => t.setRows(await db.all('users')), sel = () => { const s = t.selected; if (!s) toast('Sélectionnez un utilisateur.', 'warn'); return s; };
  async function save(v, rec) {
    const users = await db.all('users'); if (users.some(x => x.id !== v.id && x.username.toLowerCase() === v.username.toLowerCase())) return 'Cet identifiant existe déjà.';
    const o = { ...rec, ...v }; o.codeZone = o.role === 'CP' ? zoneCode(o.codeCs, o.numZone) : ''; delete o.pw; if (v.pw) { o.pwd = await hashPassword(v.pw); o.mustChange = true; }
    await db.put('users', o); reload(); return null;
  }
  async function add() { let err; const v = await formDialog({ title: 'Nouvel utilisateur', fields: F(true), values: { role: 'CP', actif: true }, wide: true, validate: async (x) => { err = await save({ ...x, id: uid(), created: nowISO() }, {}); return err; } }); if (v) toast('Utilisateur créé.'); }
  async function edit() { const s = sel(); if (!s) return; const v = await formDialog({ title: "Modifier l'utilisateur", fields: F(false), values: { ...s, pw: '' }, wide: true, validate: (x) => save({ ...x }, s) }); if (v) toast('Utilisateur modifié.'); }
  ctx.actions([{ label: '➕ Ajouter', kind: 'primary', onClick: add }, { label: '✏️ Modifier / réinitialiser le mot de passe', onClick: edit },
    { label: '🗑 Supprimer', onClick: async () => { const s = sel(); if (!s) return; if (s.id === me.id) return toast('Vous ne pouvez pas supprimer votre propre compte.', 'err'); if (await confirmBox(`Supprimer le compte « ${s.username} » ?`, 'Supprimer', true)) { await db.del('users', s.id); reload(); } } }]);
}

/* ================= Paramètres & à propos ================= */
async function parametres(ctx) {
  const u = ctx.user; ctx.title('Paramètres & à propos', `${APP.full} — version ${APP.version}`);
  const est = h('span', '…'); navigator.storage && navigator.storage.estimate && navigator.storage.estimate().then(e => { est.textContent = `${(e.usage / 1048576).toFixed(1)} Mo utilisés sur ${(e.quota / 1048576).toFixed(0)} Mo disponibles`; });
  const inst = h('button', { class: 'btn accent hidden', onclick: async () => { const p = window.__installPrompt; if (!p) return; p.prompt(); await p.userChoice; } }, '⬇ Installer cette application');
  const upd = () => inst.classList.toggle('hidden', !window.__installPrompt); document.addEventListener('installable', upd); upd();
  async function demo() {
    if (!(await confirmBox('Ajouter 2 écoles et 2 fiches de démonstration (EM Akiza, EPP Akiza) ?', 'Ajouter'))) return;
    const z = { departement: 'ZOU', codeCs: 'CS118', nomCs: 'ZOGBODOMEY', numZone: '1', codeZone: 'CS118-ZP01', commune: 'ZOGBODOMEY', arrondissement: 'AKIZA', localite: 'Akiza', up: 'UP Akiza', secteur: 'Public', type: 'Classique', created: nowISO() };
    const s1 = { id: uid(), code: 'EM001', nom: 'EM Akiza', cycle: 'Maternelle', ...z }, s2 = { id: uid(), code: 'EP001', nom: 'EPP Akiza', cycle: 'Primaire', ...z };
    await db.putMany('schools', [s1, s2]);
    const mk = (k, s) => { const ps = sectionsFor(k).find(x => x.type === 'personnel'); return ficheOf(k, s, '2025-2026', prefill(k, s), Array.from({ length: ps.minRows }, (_, i) => ({ fonction: i ? ps.otherFonction : ps.firstFonction }))); };
    await db.putMany('fiches', [mk('EM_RENTREE', s1), mk('EP_FIN', s2)]); await ctx.refreshDatalists(); toast('Données de démonstration ajoutées.');
  }
  ctx.el.append(
    h('div', { class: 'card', style: { textAlign: 'center' } }, h('img', { class: 'emblem', src: 'assets/embleme-memp.png', alt: 'République du Bénin — MEMP', style: { maxWidth: '100%', width: '680px' } }), h('h2', { style: { color: 'var(--green)' } }, APP.full), h('p', 'Application autonome — fonctionne hors ligne sur ordinateur, tablette et Android.'),
      h('p', h('b', 'Conception et réalisation : '), APP.concepteur, h('br'), 'Tél. ', h('a', { href: 'tel:' + APP.concepteurTelRaw }, APP.concepteurTel))),
    h('div', { class: 'card' }, h('h3', '📲 Installation'), inst, h('ul', h('li', h('b', 'Android (Chrome) : '), 'menu ⋮ → « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».'), h('li', h('b', 'Ordinateur (Chrome / Edge) : '), 'icône d\'installation ⊕ dans la barre d\'adresse, ou menu → « Installer Application CP ».'), h('li', h('b', 'Tablette / iPad (Safari) : '), 'Partager → « Sur l\'écran d\'accueil ».'), h('li', 'Après la première ouverture avec Internet, l\'application fonctionne entièrement sans connexion.'))),
    h('div', { class: 'card' }, h('h3', '🔐 Compte'), h('p', `${u.prenoms || ''} ${u.nom || u.username} — ${ROLES[u.role]}`), h('button', { class: 'btn', onclick: () => changePasswordDialog(u) }, 'Changer mon mot de passe'), ' ', h('button', { class: 'btn', onclick: () => import('./motdepasse.js').then(m => m.dialogueSecours(u)) }, u.secours ? '🔑 Changer ma question de secours' : '🔑 Définir ma question de secours')),
    h('div', { class: 'card' }, h('h3', '🗄 Données'), h('p', 'Les données sont enregistrées sur cet appareil. Stockage : ', est), h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, 
      u.role === 'ADMIN' ? h('button', { class: 'btn danger', onclick: async () => { if (!(await confirmBox('Effacer TOUTES les données de cet appareil (écoles, fiches, comptes…) ? Action irréversible.', 'Tout effacer', true))) return; for (const s of db.STORES) await db.clear(s); await db.clear('settings'); sessionStorage.clear(); location.reload(); } }, 'Effacer toutes les données') : null)),
    h('div', { class: 'card' }, h('h3', '🔄 Mises à jour'), h('p', 'Version installée : ', h('b', APP.version)), h('button', { class: 'btn', onclick: async () => { const reg = await navigator.serviceWorker?.getRegistration(); if (!reg) return toast('Mode hors ligne non actif sur ce navigateur.', 'warn'); await reg.update(); toast('Recherche de mise à jour terminée. Rechargez la page si une nouvelle version est disponible.'); } }, 'Rechercher une mise à jour'), ' ', h('button', { class: 'btn', onclick: () => location.reload() }, 'Recharger')),
    h('p', { class: 'notes', style: { textAlign: 'center' } }, `© République du Bénin — Ministère des Enseignements Maternel et Primaire. ${CREDIT}.`));
}
