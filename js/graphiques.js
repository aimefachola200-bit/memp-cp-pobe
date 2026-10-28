/* République du Bénin — MEMP — Graphiques au choix (courbe, histogramme, barres empilées, aires, points). Conception : Maître Aimé FACHOLA */
  /* Graphiques au choix : courbe, histogramme, barres empilées, aires, points (SVG, sans dépendance).
     Les boutons au-dessus de chaque graphique changent son type ; « pour tous » l'applique à tous et le retient. */
  const TYPES = [['ligne', '\uE016 Courbe'], ['barres', '\uE015 Histogramme'], ['empilees', '▤ Barres empilées'], ['aire', '◭ Aires'], ['points', '⁘ Points']];
  const escG = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fv = (v) => (typeof v === 'number' && !Number.isInteger(v) ? (Math.round(v * 100) / 100).toString() : String(v)).replace('.', ',');
  function svgType(kind, { titre, sousTitre = '', labels, series, w = 780, h = 330 }) {
    const n = labels.length, m = { l: 64, r: 24, t: sousTitre ? 46 : 34, b: 76 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const val = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const max = kind === 'empilees' ? Math.max(1, ...labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, val(s.values[i]) || 0), 0)))
      : Math.max(1, ...series.flatMap(s => s.values.map(val).filter(v => v !== null)));
    const joli = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), q = v / p; return (q <= 1 ? 1 : q <= 2 ? 2 : q <= 5 ? 5 : 10) * p; };
    const top = joli(max), bande = iw / Math.max(1, n), x = (i) => m.l + bande * (i + 0.5), y = (v) => m.t + ih - (v / top) * ih;
    const etiq = n <= 14;
    let s = `<svg class="courbe" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escG(titre)}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">`;
    s += `<text x="${w / 2}" y="18" text-anchor="middle" font-size="14" font-weight="700" fill="#1e293b">${escG(titre)}</text>`;
    if (sousTitre) s += `<text x="${w / 2}" y="34" text-anchor="middle" font-size="11" fill="#64748b">${escG(sousTitre)}</text>`;
    for (let k = 0; k <= 5; k++) { const v = top * k / 5, yy = y(v); s += `<line x1="${m.l}" y1="${yy}" x2="${w - m.r}" y2="${yy}" stroke="#e2e8f0"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#475569">${(Math.round(v * 100) / 100).toLocaleString('fr-FR')}</text>`; }
    labels.forEach((l, i) => { s += `<text transform="translate(${x(i)} ${h - m.b + 16}) rotate(-35)" text-anchor="end" font-size="11" fill="#475569">${escG(l)}</text>`; });
    s += `<line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${m.t + ih}" stroke="#94a3b8"/><line x1="${m.l}" y1="${m.t + ih}" x2="${w - m.r}" y2="${m.t + ih}" stroke="#94a3b8"/>`;
    const tip = (se, i, v) => `<title>${escG(se.nom)} — ${escG(labels[i])} : ${fv(v)}</title>`;
    if (kind === 'barres') {
      const lb = Math.min(26, bande * 0.8 / Math.max(1, series.length));
      series.forEach((se, k) => se.values.forEach((v0, i) => { const v = val(v0); if (v === null) return; const xx = x(i) - lb * series.length / 2 + k * lb;
        s += `<g>${tip(se, i, v)}<rect x="${xx.toFixed(1)}" y="${y(Math.max(v, 0)).toFixed(1)}" width="${(lb - 1).toFixed(1)}" height="${Math.max(0.5, m.t + ih - y(Math.max(v, 0))).toFixed(1)}" fill="${se.color}" rx="1.5"/>`
          + (etiq && series.length <= 4 ? `<text x="${(xx + lb / 2).toFixed(1)}" y="${(y(Math.max(v, 0)) - 3).toFixed(1)}" text-anchor="middle" font-size="10" fill="#334155">${fv(v)}</text>` : '') + '</g>'; }));
    } else if (kind === 'empilees') {
      const lb = Math.min(40, bande * 0.6), base = labels.map(() => 0);
      series.forEach(se => se.values.forEach((v0, i) => { const v = val(v0); if (!v || v <= 0) return; const ya = y(base[i] + v), yb = y(base[i]);
        s += `<g>${tip(se, i, v)}<rect x="${(x(i) - lb / 2).toFixed(1)}" y="${ya.toFixed(1)}" width="${lb.toFixed(1)}" height="${Math.max(0.5, yb - ya).toFixed(1)}" fill="${se.color}"/>`
          + (etiq && yb - ya > 11 ? `<text x="${x(i).toFixed(1)}" y="${((ya + yb) / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="10" fill="#fff">${fv(v)}</text>` : '') + '</g>'; base[i] += v; }));
      if (etiq) base.forEach((b, i) => { if (b) s += `<text x="${x(i).toFixed(1)}" y="${(y(b) - 4).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1e293b">${fv(b)}</text>`; });
    } else {
      series.forEach(se => {
        const pts = se.values.map((v0, i) => [x(i), val(v0)]).filter(p => p[1] !== null).map(([a, v]) => [a, y(v)]);
        if (kind === 'aire' && pts.length > 1) s += `<polygon fill="${se.color}" fill-opacity="0.18" points="${pts[0][0].toFixed(1)},${m.t + ih} ${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} ${pts[pts.length - 1][0].toFixed(1)},${m.t + ih}"/>`;
        if ((kind === 'ligne' || kind === 'aire') && pts.length > 1) s += `<polyline fill="none" stroke="${se.color}" stroke-width="${se.epais || 2.4}" ${se.tirets ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round" points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
        se.values.forEach((v0, i) => { const v = val(v0); if (v === null) return; s += `<g>${tip(se, i, v)}<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${kind === 'points' ? 5 : 3.4}" fill="${se.color}"/>`
          + (etiq && series.length <= 3 ? `<text x="${x(i).toFixed(1)}" y="${(y(v) - 7).toFixed(1)}" text-anchor="middle" font-size="10" fill="#334155">${fv(v)}</text>` : '') + '</g>'; });
      });
    }
    let lx = m.l; const ly = h - 10;
    series.forEach(se => { s += `<rect x="${lx}" y="${ly - 9}" width="14" height="${kind === 'ligne' || kind === 'points' ? 4 : 9}" fill="${se.color}"/><text x="${lx + 19}" y="${ly - 1}" font-size="11" fill="#1e293b">${escG(se.nom)}</text>`; lx += 30 + se.nom.length * 6.4; });
    return s + '</svg>';
  }
  let installe = false;
  function installer() {
    if (installe || typeof document === 'undefined') return; installe = true;
    const st = document.createElement('style');
    st.textContent = '.gchoix .g-bar{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:2px 0 4px;font-size:12px;color:#475569}'
      + '.gchoix .g-b{border:1px solid #cbd5e1;background:#fff;border-radius:14px;padding:2px 9px;cursor:pointer;font-size:12px}'
      + '.gchoix .g-b.on{background:#006633;color:#fff;border-color:#006633}.gchoix label{margin-left:6px}@media print{.gchoix .g-bar{display:none}}';
    document.head.append(st);
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.gchoix .g-b'); if (!b) return;
      const w = b.closest('.gchoix'), k = b.dataset.k, tous = w.querySelector('.g-tous')?.checked;
      const appliquer = (o) => { o.querySelectorAll('.g-v').forEach(v => { v.hidden = v.dataset.k !== k; }); o.querySelectorAll('.g-b').forEach(x => x.classList.toggle('on', x.dataset.k === k)); };
      if (tous) { try { localStorage.setItem('graphique-type', k); } catch (er) { /* stockage indisponible */ } document.querySelectorAll('.gchoix').forEach(appliquer); } else appliquer(w);
    });
  }
  /** Graphique au choix : renvoie le HTML (boutons + un SVG par type, un seul visible). */
  function graphique(opts) {
    installer();
    let k = 'ligne'; try { k = localStorage.getItem('graphique-type') || 'ligne'; } catch (er) { /* stockage indisponible */ }
    if (!TYPES.some(t => t[0] === k)) k = 'ligne';
    return `<div class="gchoix"><div class="g-bar">Type de graphique : ${TYPES.map(([t, l]) => `<button type="button" class="g-b${t === k ? ' on' : ''}" data-k="${t}">${l}</button>`).join('')}`
      + '<label><input type="checkbox" class="g-tous" checked> pour tous les graphiques</label></div>'
      + TYPES.map(([t]) => `<div class="g-v" data-k="${t}"${t === k ? '' : ' hidden'}>${svgType(t, opts)}</div>`).join('') + '</div>';
  }
export { graphique, svgType, TYPES };
