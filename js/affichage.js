/* Affichage : thème Clair / Sombre / Auto (selon l'heure) et bouton « Cachets affichés / masqués ».
   Même présentation que SCOLARIS et GESCOL. Les choix sont mémorisés sur l'appareil (localStorage, jamais bloquant).
   Auto : sombre de 18 h à 6 h, clair le jour (heure de l'appareil). */
(function () {
  var CLE_T = 'memp_theme', CLE_C = 'memp_sans_cachet', ORDRE = ['auto', 'light', 'dark'];
  var LIB = { auto: 'Auto (heure)', light: 'Clair', dark: 'Sombre' };
  function lire(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* valable pour la page seulement */ } }
  function sombreSelonHeure() { var h = new Date().getHours(); return h >= 18 || h < 6; }
  function theme() { var t = lire(CLE_T, 'auto'); return ORDRE.indexOf(t) < 0 ? 'auto' : t; }
  function effectif(t) { return t === 'auto' ? (sombreSelonHeure() ? 'dark' : 'light') : t; }
  function poser() {
    var t = theme(), e = effectif(t), r = document.documentElement;
    r.setAttribute('data-theme', e); r.setAttribute('data-theme-choix', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', e === 'dark' ? '#0f1720' : '#1F4E79');
  }
  function sansCachet() { return lire(CLE_C, '0') === '1'; }
  window.sansCachet = sansCachet;     // utilisé par les générateurs de PDF et de documents
  function appliquerCachet() { document.documentElement.classList.toggle('sans-cachet', sansCachet()); }
  function libelles() {
    var tb = document.querySelectorAll('[data-theme-btn]'), cb = document.querySelectorAll('[data-cachet-btn]'), i, a, b;
    a = '\u25D0 ' + LIB[theme()]; b = sansCachet() ? '\u2715 Cachets masqués' : '\u25C9 Cachets affichés';
    for (i = 0; i < tb.length; i++) if (tb[i].textContent !== a) tb[i].textContent = a;
    for (i = 0; i < cb.length; i++) if (cb[i].textContent !== b) cb[i].textContent = b;
  }
  function boutons() {
    var d = document.createElement('div'); d.className = 'outils-affichage'; d.setAttribute('data-outils-affichage', '');
    var c = document.createElement('button'); c.type = 'button'; c.className = 'btn-theme'; c.setAttribute('data-cachet-btn', '');
    c.title = 'Masquer ou afficher les cachets dans les documents et les PDF';
    c.addEventListener('click', function () { ecrire(CLE_C, sansCachet() ? '0' : '1'); appliquerCachet(); libelles(); });
    var t = document.createElement('button'); t.type = 'button'; t.className = 'btn-theme'; t.setAttribute('data-theme-btn', '');
    t.title = 'Clair, sombre, ou automatique selon l’heure (sombre de 18 h à 6 h)';
    t.addEventListener('click', function () { ecrire(CLE_T, ORDRE[(ORDRE.indexOf(theme()) + 1) % 3]); poser(); libelles(); });
    d.appendChild(c); d.appendChild(t); return d;
  }
  function installer() {
    var cibles = document.querySelectorAll('.sb-head, .login-body, .sidebar > .marque');
    for (var i = 0; i < cibles.length; i++) {
      var c = cibles[i];
      if (c.nextElementSibling && c.nextElementSibling.hasAttribute('data-outils-affichage')) continue;
      if (c.classList.contains('login-body')) { if (c.querySelector('[data-outils-affichage]')) continue; c.insertBefore(boutons(), c.firstChild); }
      else c.parentNode.insertBefore(boutons(), c.nextSibling);
    }
    libelles();
  }
  poser(); appliquerCachet();
  function demarrer() {
    installer();
    var racine = document.getElementById('app') || document.body;
    new MutationObserver(function () { installer(); }).observe(racine, { childList: true, subtree: true });
    setInterval(poser, 60000);                                    // en mode Auto, le thème suit l'heure sans recharger
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poser(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
