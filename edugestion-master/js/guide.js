/* Guide d'utilisation (« Lisez-moi ») — moteur commun : CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro Master / Master.
   Contenu propre à chaque application : window.GUIDE_CONTENU = { app, titre, version, roles: [[id, libellé]], sections: [
     { id, titre, roles: ['*'] | [id…], intro, etapes: [texte…], conseils: [texte…], faq: [[question, réponse]…] } ] }.
   Guide.ouvrir(contenu?, { role })     → fenêtre plein écran (recherche, choix du rôle, impression / PDF)
   Guide.monter(racine, contenu?, opts) → même guide dans une page de l'application
   Guide.html(contenu, role)            → HTML imprimable (sert aussi à produire LISEZ-MOI.pdf et LISEZMOI.md)
   Sans émoji : dessins au trait du jeu commun (js/icones.js) quand il est chargé. Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.Guide) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fort = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/« (.+?) »/g, '« <b>$1</b> »');
  const ic = (n, t) => (global.Icones && global.Icones.icone) ? global.Icones.icone(n, { taille: t || 18 }) : '';
  const pour = (s, role) => !role || !s.roles || s.roles.indexOf('*') >= 0 || s.roles.indexOf(role) >= 0;

  function sectionHtml(s, num) {
    let h = '<section class="gd-s" id="gd-' + esc(s.id) + '"><h2>' + (s.icone ? '<span class="gd-i">' + ic(s.icone, 20) + '</span>' : '') + (num ? num + '. ' : '') + esc(s.titre) + '</h2>';
    if (s.intro) h += '<p>' + fort(s.intro) + '</p>';
    if (s.etapes && s.etapes.length) h += '<ol class="gd-etapes">' + s.etapes.map(e => '<li>' + fort(e) + '</li>').join('') + '</ol>';
    if (s.conseils && s.conseils.length) h += '<div class="gd-conseil"><b>Bon à savoir</b><ul>' + s.conseils.map(e => '<li>' + fort(e) + '</li>').join('') + '</ul></div>';
    if (s.faq && s.faq.length) h += '<dl class="gd-faq">' + s.faq.map(([q, r]) => '<dt>' + fort(q) + '</dt><dd>' + fort(r) + '</dd>').join('') + '</dl>';
    return h + '</section>';
  }
  const CSS = '.gd{font:15px/1.55 Arial,sans-serif;color:#1D2939}.gd h1{font-size:22px;color:#1F4E79;margin:0 0 4px}.gd .gd-sous{color:#667085;margin:0 0 12px}'
    + '.gd h2{font-size:17px;color:#1F4E79;margin:18px 0 6px;display:flex;align-items:center;gap:6px;border-bottom:2px solid #E4E7EC;padding-bottom:3px}.gd-i{display:inline-flex}.gd-i svg{width:20px;height:20px}'
    + '.gd-etapes{padding-left:22px}.gd-etapes li{margin:3px 0}.gd-conseil{background:#EEF4FB;border-left:4px solid #1F4E79;border-radius:6px;padding:6px 10px;margin:8px 0}.gd-conseil ul{margin:4px 0;padding-left:18px}'
    + '.gd-faq dt{font-weight:700;margin-top:8px}.gd-faq dd{margin:2px 0 0 0}.gd-toc{columns:2 220px;padding-left:18px;margin:6px 0 10px}.gd-toc a{color:#1F4E79}'
    + '.gd-pied{font-size:11px;color:#98A2B3;text-align:right;margin-top:16px}.gd-s{break-inside:auto}.gd h2{break-after:avoid}'
    + '@media print{.gd{font-size:12pt}.gd-barre{display:none!important}}';

  /** HTML complet du guide (écran et impression) */
  function html(c, role) {
    c = c || global.GUIDE_CONTENU || { sections: [] };
    const ss = c.sections.filter(s => pour(s, role));
    const lib = role && (c.roles || []).find(r => r[0] === role);
    return '<div class="gd"><h1>Guide d’utilisation — ' + esc(c.titre || c.app || '') + '</h1>'
      + '<p class="gd-sous">' + esc((c.version ? 'Version ' + c.version + ' · ' : '') + (lib ? 'Pour : ' + lib[1] : 'Tous les rôles')) + '</p>'
      + '<ol class="gd-toc">' + ss.map(s => '<li><a href="#gd-' + esc(s.id) + '">' + esc(s.titre) + '</a></li>').join('') + '</ol>'
      + ss.map((s, i) => sectionHtml(s, i + 1)).join('')
      + '<p class="gd-pied">Conception : Maître Aimé FACHOLA — +229 01 96 51 03 33</p></div>';
  }
  function styles() {
    if (document.getElementById('gd-styles')) return;
    const st = document.createElement('style'); st.id = 'gd-styles';
    st.textContent = CSS + '.gd-voile{position:fixed;inset:0;background:#fff;z-index:10080;overflow:auto}'
      + '.gd-barre{position:sticky;top:0;z-index:2;background:#1F4E79;color:#fff;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px}'
      + '.gd-barre b{font-size:15px;margin-right:auto}.gd-barre input,.gd-barre select{font:inherit;font-size:14px;padding:7px 9px;border-radius:7px;border:0;min-height:38px;max-width:100%}'
      + '.gd-barre button{font:inherit;font-size:14px;border:1px solid #fff;background:none;color:#fff;border-radius:7px;padding:7px 11px;min-height:38px;cursor:pointer}'
      + '.gd-corps{max-width:880px;margin:0 auto;padding:12px 16px 40px}.gd-vide{color:#667085;font-style:italic}'
      + '@media print{body.gd-imprime>*:not(.gd-voile){display:none!important}.gd-voile{position:static;overflow:visible}}';
    document.head.append(st);
  }
  function el(t, a, kids) { const e = document.createElement(t); Object.entries(a || {}).forEach(([k, v]) => { if (v == null) return; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }); (kids || []).forEach(x => e.append(x)); return e; }

  /** Guide dans une zone (page de l'application) ou dans une fenêtre plein écran */
  function monter(racine, c, o) {
    styles(); c = c || global.GUIDE_CONTENU; o = o || {};
    let role = o.role || '';
    const corps = el('div', { class: 'gd-corps', 'data-guide': 'corps' });
    const recherche = el('input', { type: 'search', placeholder: 'Rechercher dans le guide…', 'aria-label': 'Rechercher dans le guide', 'data-guide': 'recherche', 'data-geo': 'aucun' });
    const choix = el('select', { 'aria-label': 'Rôle', 'data-guide': 'role' }, [el('option', { value: '' }, ['Tous les rôles'])].concat((c.roles || []).map(([v, l]) => el('option', { value: v }, [l]))));
    choix.value = role;
    const rendre = () => {
      const q = norm(recherche.value).trim();
      if (!q) { corps.innerHTML = html(c, role); return; }
      const mots = q.split(/\s+/);
      const ss = c.sections.filter(s => pour(s, role)).filter(s => { const t = norm([s.titre, s.intro].concat(s.etapes || [], s.conseils || [], (s.faq || []).flat()).join(' ')); return mots.every(m => t.indexOf(m) >= 0); });
      corps.innerHTML = '<div class="gd">' + (ss.length ? ss.map(s => sectionHtml(s)).join('') : '<p class="gd-vide">Aucune rubrique ne correspond à « ' + esc(recherche.value) + ' ».</p>') + '</div>';
    };
    let t = null; recherche.addEventListener('input', () => { clearTimeout(t); t = setTimeout(rendre, 200); });
    choix.addEventListener('change', () => { role = choix.value; rendre(); });
    const barre = el('div', { class: 'gd-barre' }, [el('b', {}, ['Guide d’utilisation']), recherche, choix,
      el('button', { type: 'button', 'data-guide': 'imprimer', onclick: () => { document.body.classList.add('gd-imprime'); const fin = () => { document.body.classList.remove('gd-imprime'); window.removeEventListener('afterprint', fin); }; window.addEventListener('afterprint', fin); setTimeout(() => window.print(), 50); } }, ['Imprimer / PDF']),
      c.pdf ? el('a', { href: c.pdf, download: '', style: 'color:#fff;border:1px solid #fff;border-radius:7px;padding:7px 11px;text-decoration:none', 'data-guide': 'pdf' }, ['LISEZ-MOI (PDF)']) : document.createTextNode('')]
      .concat(o.fermer ? [el('button', { type: 'button', 'aria-label': 'Fermer le guide', 'data-guide': 'fermer', onclick: o.fermer }, ['Fermer'])] : []));
    racine.append(barre, corps); rendre();
    return { rendre };
  }
  function ouvrir(c, o) {
    styles(); o = o || {};
    const voile = el('div', { class: 'gd-voile', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Guide d’utilisation', 'data-guide': 'fenetre' });
    const fermer = () => { voile.remove(); window.removeEventListener('keydown', echap); };
    const echap = (e) => { if (e.key === 'Escape') fermer(); };
    document.body.append(voile); window.addEventListener('keydown', echap);
    monter(voile, c, Object.assign({}, o, { fermer }));
    return fermer;
  }
  /** Texte Markdown (LISEZMOI.md) */
  function markdown(c) {
    c = c || global.GUIDE_CONTENU;
    const md = (t) => String(t || '').replace(/« (.+?) »/g, '« **$1** »');
    let s = '# Guide d’utilisation — ' + c.titre + '\n\n' + (c.version ? '_Version ' + c.version + '_\n\n' : '');
    if (c.roles && c.roles.length) s += 'Rôles : ' + c.roles.map(r => r[1]).join(' · ') + '\n\n';
    c.sections.forEach((x, i) => {
      s += '## ' + (i + 1) + '. ' + x.titre + '\n\n';
      if (x.roles && x.roles.indexOf('*') < 0) s += '_Pour : ' + x.roles.map(r => ((c.roles || []).find(q => q[0] === r) || [r, r])[1]).join(', ') + '_\n\n';
      if (x.intro) s += md(x.intro) + '\n\n';
      (x.etapes || []).forEach((e, j) => { s += (j + 1) + '. ' + md(e) + '\n'; }); if (x.etapes && x.etapes.length) s += '\n';
      if (x.conseils && x.conseils.length) s += '**Bon à savoir**\n\n' + x.conseils.map(e => '- ' + md(e)).join('\n') + '\n\n';
      (x.faq || []).forEach(([q, r]) => { s += '**' + q + '**  \n' + md(r) + '\n\n'; });
    });
    return s + '---\nConception : Maître Aimé FACHOLA — +229 01 96 51 03 33\n';
  }
  global.Guide = { ouvrir, monter, html, markdown, CSS };
})(typeof window !== 'undefined' ? window : globalThis);
