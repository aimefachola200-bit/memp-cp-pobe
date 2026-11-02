/* République du Bénin — MEMP — Application CP
   Groupe WhatsApp des directeurs de la zone (CP) ou de la circonscription (CCS), en attendant GESCOL et SCOLARIS.
   WhatsApp n'autorise aucune application à créer un groupe ni à y ajouter des membres à la place de l'administrateur :
   la page rassemble les numéros des directeurs (fiche de l'école ou fiche du personnel « Directeur »), les met au format
   international du Bénin, produit le fichier de contacts (.vcf) — l'écran « Nouveau groupe » de WhatsApp ne propose
   alors que ceux qui ont un compte WhatsApp —, envoie le lien d'invitation directeur par directeur avec suivi, et
   prépare des messages prêts à l'emploi (convocation, rappel, informations…). Les numéros restent sur l'appareil.
   Conception : Maître Aimé FACHOLA */
import { h, toast, download } from './util.js';
import { db } from './db.js';
import { scoped, cleGroupe, libGroupe, ordreGroupe, modeGroupeDefaut, schoolLabel } from './data.js';

export async function render(id, ctx) { return groupe(ctx); }

/** Numéro béninois au format international sans « + » (2290197000000), ou '' (10 chiffres en 01 depuis le 30/11/2024 ; 8 chiffres → 01 devant). */
export function normaliser(brut) {
  let n = String(brut || '').replace(/[^\d+]/g, '');
  if (!n) return '';
  n = n.replace(/^\+/, '').replace(/^00/, '');
  if (n.indexOf('229') === 0 && n.length >= 11) n = n.slice(3);
  if (n.length === 8) n = '01' + n;
  return /^01\d{8}$/.test(n) ? '229' + n : '';
}
const lisible = (n) => n ? '+229 ' + n.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ') : '';

const MODELES = {
  convocation: { l: 'Convocation (réunion, UP, formation)', t: '\uE050 *CONVOCATION — {emetteur}*\n\n{salut}Les directeurs et directrices sont convoqués à {objet} le *{date}* à *{heure}* à {lieu}.\n{precisions}\nPrésence obligatoire.\n\n{signataire}' },
  visite: { l: 'Annonce de visite de classe', t: '\uE02A *VISITE PÉDAGOGIQUE — {emetteur}*\n\n{salut}{objet} est prévue le *{date}*{heure_a}.\n{precisions}\nMerci de préparer les documents pédagogiques (cahier journal, fiches, emploi du temps, registre d’appel).\n\n{signataire}' },
  rappel: { l: 'Rappel de document à rendre', t: '\uE01A *RAPPEL — {emetteur}*\n\n{salut}{objet} est attendu au plus tard le *{date}*.\n{precisions}\n\n{signataire}' },
  information: { l: 'Information générale', t: '\uE07B *INFORMATION — {emetteur}*\n\n{salut}{objet}\n{precisions}\n\n{signataire}' },
  libre: { l: 'Message libre', t: '{salut}{precisions}' }
};

async function groupe(ctx) {
  const u = ctx.user;
  const emetteur = u.role === 'CP' ? 'CP de la zone ' + (u.numZone || '') + (u.nomCs ? ' — CS ' + u.nomCs : '') : (u.role === 'CCS' ? 'Circonscription Scolaire' + (u.nomCs ? ' de ' + u.nomCs : '') : u.role === 'DDEMP' ? 'Direction départementale' + (u.departement ? ' du ' + u.departement : '') : 'MEMP');
  const signataire = u.role === 'CP' ? 'Le Conseiller Pédagogique' + (u.numZone ? ' de la zone ' + u.numZone : '') : (u.role === 'CCS' ? 'Le Chef de la Circonscription Scolaire' : u.role === 'DDEMP' ? 'Le Directeur départemental' : 'L’administration');
  const prefixe = u.role === 'CP' ? 'CPZ' + (u.numZone || '') + ' Dir' : 'CS Dir';
  const CLE = 'whatsapp-' + u.id;
  const g = Object.assign({ nom: 'Directeurs — ' + emetteur, lien: '', contacts: {}, modele: { type: 'convocation' },
    message: 'Bonjour {directeur}, directeur/directrice de {ecole}. {emetteur} vous invite à rejoindre le groupe WhatsApp « {groupe} » : {lien}' }, (await db.setting(CLE)) || {});
  const sauver = () => db.setting(CLE, JSON.parse(JSON.stringify(g)));

  const schools = await scoped('schools', u), perso = await scoped('personnel', u);
  const mode = modeGroupeDefaut(u), zonesRef = (await db.all('ref')).filter(r => r.type === 'zone');
  const dirs = () => schools.map(s => {
    const agent = perso.find(p => p.schoolId === s.id && /direct/i.test(p.fonction || '') && p.telephone);
    const brut = s.contact || (agent && agent.telephone) || '';
    const num = normaliser(brut), c = g.contacts[s.id] || {};
    return { s, nom: s.directeur || (agent && [agent.nom, agent.prenoms].filter(Boolean).join(' ')) || '', brut, num, wa: c.wa !== false, envoye: c.envoye || '', grp: cleGroupe(s, mode) };
  }).sort((a, b) => ordreGroupe(a.grp, b.grp) || String(a.s.nom).localeCompare(String(b.s.nom), 'fr'));
  let filtre = '', nonInvites = false;
  const visibles = () => dirs().filter(x => (!filtre || x.grp === filtre) && (!nonInvites || !x.envoye));
  const retenus = () => dirs().filter(x => x.num && x.wa);

  ctx.title('Groupe WhatsApp des directeurs', emetteur + ' — ' + schools.length + ' école(s)');

  const stats = h('div', { class: 'cards' }), corps = h('tbody'), apercu = h('div', { class: 'pre', style: { whiteSpace: 'pre-wrap', background: '#e7f8ee', color: '#17201b', borderRadius: '10px', padding: '10px 12px' } });
  const majStats = () => { const d = dirs(), v = d.filter(x => x.num), r = v.filter(x => x.wa); stats.replaceChildren(...[[d.length, 'écoles'], [v.length, 'numéros valides'], [r.length, 'avec WhatsApp'], [r.filter(x => x.envoye).length, 'invités']].map(([n, l]) => h('div', { class: 'stat' }, h('b', String(n)), h('span', l)))); };

  const message = (x) => String(g.message || '').replace(/\{directeur\}/g, x.nom || 'Monsieur/Madame le Directeur').replace(/\{ecole\}/g, x.s.nom || '')
    .replace(/\{groupe\}/g, g.nom || '').replace(/\{lien\}/g, g.lien || '').replace(/\{emetteur\}/g, emetteur);
  const ouvrir = (url) => window.open(url, '_blank', 'noopener');
  const inviter = async (x) => {
    if (!g.lien && !confirm('Aucun lien d’invitation n’est enregistré. Envoyer quand même ?')) return;
    ouvrir('https://wa.me/' + x.num + '?text=' + encodeURIComponent(message(x)));
    g.contacts[x.s.id] = { ...(g.contacts[x.s.id] || {}), envoye: new Date().toISOString() }; await sauver(); dessiner();
  };

  const texteModele = (x) => {
    const m = g.modele || {}, v = (k) => String(m[k] || '').trim();
    const dt = v('date') ? new Date(v('date') + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '…';
    return (MODELES[m.type] || MODELES.information).t.replace('{salut}', x ? 'Bonjour ' + (x.nom || 'Monsieur/Madame le Directeur') + ' (' + x.s.nom + '),\n' : '')
      .replace('{emetteur}', emetteur).replace('{signataire}', signataire).replace('{objet}', v('objet') || '…').replace('{date}', dt)
      .replace('{heure_a}', v('heure') ? ' à ' + v('heure') : '').replace('{heure}', v('heure') || '…').replace('{lieu}', v('lieu') || '…')
      .replace('{precisions}', v('precisions')).replace(/\n{3,}/g, '\n\n').trim();
  };

  function dessiner() {
    majStats();
    corps.replaceChildren(...visibles().map(x => h('tr', { style: x.num ? null : { opacity: .65 } },
      h('td', { style: { textAlign: 'center' } }, h('input', { type: 'checkbox', checked: x.wa, disabled: !x.num, title: 'Ce directeur a un compte WhatsApp',
        onchange: async (e) => { g.contacts[x.s.id] = { ...(g.contacts[x.s.id] || {}), wa: e.target.checked }; await sauver(); majStats(); } })),
      h('td', h('b', x.s.nom), h('br'), h('small', { class: 'notes' }, libGroupe(x.grp, zonesRef, mode))),
      h('td', x.nom || '—'),
      h('td', h('input', { class: 'input', style: { minWidth: '150px' }, value: x.num ? lisible(x.num) : x.brut, placeholder: '01 XX XX XX XX',
        onchange: async (e) => { const n = normaliser(e.target.value); x.s.contact = n ? lisible(n).replace('+229 ', '') : e.target.value.trim(); await db.put('schools', x.s);
          if (e.target.value && !n) toast('Numéro non reconnu : 10 chiffres commençant par 01.', 'warn'); dessiner(); } }),
        x.brut && !x.num ? h('div', h('span', { class: 'badge corriger' }, 'numéro invalide')) : null),
      h('td', x.envoye ? h('span', { class: 'badge Validée' }, 'envoyée le ' + new Date(x.envoye).toLocaleDateString('fr-FR')) : '—'),
      h('td', x.num && x.wa ? h('button', { class: 'btn sm primary', onclick: () => inviter(x) }, '\uE035 Inviter') : null))));
    if (!corps.children.length) corps.append(h('tr', h('td', { colspan: 6, style: { textAlign: 'center' } }, 'Aucune école dans votre périmètre.')));
  }

  const champ = (l, el) => h('label', { class: 'field', style: { gridColumn: 'span 6' } }, h('span', l), el);
  const inNom = h('input', { class: 'input', value: g.nom, oninput: (e) => { g.nom = e.target.value; sauver(); } });
  const inLien = h('input', { class: 'input', value: g.lien, placeholder: 'https://chat.whatsapp.com/…', oninput: (e) => { g.lien = e.target.value.trim(); sauver(); } });
  const inMsg = h('textarea', { class: 'input', rows: 3, oninput: (e) => { g.message = e.target.value; sauver(); } }); inMsg.value = g.message;

  const m = g.modele;
  const majApercu = () => { apercu.textContent = texteModele(null); sauver(); };
  const mChamp = (k, l, type) => champ(l, h('input', { class: 'input', type: type || 'text', value: m[k] || '', oninput: (e) => { m[k] = e.target.value; majApercu(); } }));
  const selModele = h('select', { class: 'input', onchange: (e) => { m.type = e.target.value; majApercu(); } }, Object.entries(MODELES).map(([k, v]) => h('option', { value: k, selected: (m.type || 'convocation') === k }, v.l)));
  const prec = h('textarea', { class: 'input', rows: 2, oninput: (e) => { m.precisions = e.target.value; majApercu(); } }); prec.value = m.precisions || '';

  const selGrp = h('select', { class: 'input', style: { maxWidth: '320px' }, onchange: (e) => { filtre = e.target.value; dessiner(); } },
    h('option', { value: '' }, mode === 'zone' ? 'Toutes les zones / arrondissements' : 'Tous les arrondissements'),
    [...new Set(schools.map(s => cleGroupe(s, mode)))].sort(ordreGroupe).map(k => h('option', { value: k }, libGroupe(k, zonesRef, mode))));

  ctx.el.append(
    stats,
    h('div', { class: 'card' }, h('h3', 'Créer le groupe en trois gestes'),
      h('ol', { style: { lineHeight: 1.55, paddingLeft: '20px' } },
        h('li', h('b', 'Contacts : '), 'sur le téléphone qui administrera le groupe, touchez « \uE012 Contacts pour WhatsApp », ouvrez le fichier et importez les contacts (ils s’appellent tous « ' + prefixe + ' … »).'),
        h('li', h('b', 'Créer le groupe : '), 'WhatsApp → ⋮ → Nouveau groupe → tapez « ' + prefixe + ' » et cochez tout. WhatsApp ne propose que les directeurs qui ont un compte : les autres sont écartés d’eux-mêmes.'),
        h('li', h('b', 'Lien d’invitation : '), 'dans le groupe → Infos → Inviter via un lien → Copier, collez-le ci-dessous et envoyez-le aux directeurs absents (\uE035), un toucher par directeur.')),
      h('p', { class: 'notes' }, 'WhatsApp n’autorise aucune application à créer un groupe ou à y ajouter quelqu’un à votre place. Les numéros restent sur cet appareil.'),
      h('div', { class: 'grid12' }, champ('Nom du groupe', inNom), champ('Lien d’invitation du groupe', inLien),
        h('label', { class: 'field', style: { gridColumn: '1 / -1' } }, h('span', 'Message d’invitation ({directeur}, {ecole}, {groupe}, {lien})'), inMsg))),
    h('div', { class: 'card' }, h('h3', '\uE04F Messages prêts à l’emploi'),
      h('div', { class: 'grid12' }, champ('Modèle', selModele), mChamp('objet', 'Objet (réunion, visite, document…)'), mChamp('date', 'Date', 'date'), mChamp('heure', 'Heure', 'time'), mChamp('lieu', 'Lieu'),
        h('label', { class: 'field', style: { gridColumn: '1 / -1' } }, h('span', 'Précisions'), prec)),
      apercu,
      h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } },
        h('button', { class: 'btn primary', onclick: () => ouvrir('https://wa.me/?text=' + encodeURIComponent(texteModele(null))) }, '\uE01C Envoyer au groupe'),
        h('button', { class: 'btn', onclick: async () => {
          const cle = JSON.stringify(m); if (!g.serie || g.serie.cle !== cle) g.serie = { cle, faits: {} };
          const x = visibles().find(y => y.num && y.wa && !g.serie.faits[y.s.id]);
          if (!x) { toast('Message envoyé à tous les directeurs retenus.'); return; }
          ouvrir('https://wa.me/' + x.num + '?text=' + encodeURIComponent(texteModele(x))); g.serie.faits[x.s.id] = new Date().toISOString(); await sauver();
          toast('Ouvert pour ' + x.s.nom + ' — reste ' + visibles().filter(y => y.num && y.wa && !g.serie.faits[y.s.id]).length + ' directeur(s).');
        } }, '\uE01D À chaque directeur — au suivant')),
      h('p', { class: 'notes' }, '« Envoyer au groupe » ouvre WhatsApp avec le message : choisissez le groupe. « À chaque directeur » ouvre une conversation personnalisée, l’un après l’autre.')),
    h('div', { class: 'tbl-tools', style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' } }, selGrp,
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: (e) => { nonInvites = e.target.checked; dessiner(); } }), ' seulement les non invités')),
    h('div', { class: 'tbl-wrap' }, h('table', h('thead', h('tr', ['WhatsApp', 'École', 'Directeur', 'Numéro', 'Invitation', ''].map(t => h('th', t)))), corps)));

  ctx.actions([
    { label: '\uE012 Contacts pour WhatsApp (.vcf)', kind: 'primary', onClick: () => {
      const l = retenus(); if (!l.length) return toast('Aucun numéro valide : renseignez les numéros des directeurs.', 'warn');
      const e = (s) => String(s || '').replace(/([,;\\])/g, '\\$1');
      download(l.map(x => ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + e(prefixe + ' ' + x.s.nom + (x.nom ? ' — ' + x.nom : '')), 'N:' + e(x.s.nom) + ';' + e(prefixe) + ';;;',
        'ORG:' + e(emetteur), 'TITLE:' + e('Directeur — ' + x.s.nom), 'TEL;TYPE=CELL:+' + x.num, 'END:VCARD'].join('\r\n')).join('\r\n') + '\r\n', 'directeurs-whatsapp.vcf', 'text/vcard');
      toast(l.length + ' contact(s) prêts à importer dans le téléphone.');
    } },
    { label: '\uE039 Inviter le suivant', onClick: () => { const x = visibles().find(y => y.num && y.wa && !y.envoye); if (!x) return toast('Tous les directeurs retenus ont reçu l’invitation.'); inviter(x); } },
    { label: '\uE00F Copier les numéros', onClick: async () => { const t = retenus().map(x => '+' + x.num).join('\n'); if (!t) return toast('Aucun numéro valide.', 'warn'); try { await navigator.clipboard.writeText(t); toast('Numéros copiés.'); } catch { download(t, 'numeros-directeurs.txt', 'text/plain'); } } },
    { label: '\uE00C Partager le lien', onClick: () => { if (!g.lien) return toast('Collez d’abord le lien d’invitation.', 'warn'); const t = 'Rejoignez le groupe WhatsApp « ' + g.nom + ' » : ' + g.lien; if (navigator.share) navigator.share({ title: g.nom, text: t }).catch(() => {}); else ouvrir('https://wa.me/?text=' + encodeURIComponent(t)); } },
    { label: '↺ Remettre les envois à zéro', onClick: async () => { if (!confirm('Effacer le suivi des invitations envoyées ?')) return; Object.values(g.contacts).forEach(c => delete c.envoye); await sauver(); dessiner(); } },
  ]);
  apercu.textContent = texteModele(null);
  dessiner();
  ctx.status(retenus().length + ' directeur(s) joignable(s) sur WhatsApp');
}
