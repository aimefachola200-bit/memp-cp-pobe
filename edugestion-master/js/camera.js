/* ÉduGestion Pro Master — appareil photo (caméra avant ou arrière) pour toutes les photos de l'application.

   Chaque champ de fichier qui accepte une image (photo de l'élève, de l'agent, de l'école, carte
   d'identité, courrier scanné, pièce jointe…) reçoit automatiquement un bouton « \uE03C Appareil photo ».
   La prise de vue remplit le champ exactement comme un fichier choisi : l'écran qui l'utilise
   (redimensionnement, aperçu, enregistrement) n'a rien à changer.

   Bascule avant / arrière fiable : l'appareil est choisi d'après son nom (front / back, avant /
   arrière…), sinon le suivant de la liste — certains téléphones ignorent « facingMode » et rouvraient
   toujours la même caméra (même méthode que SCOLARIS, GESCOL et MEMP-CP). */
(function (global) {
  'use strict';
  const EG = global.EG;

  function camerasVideo() {
    try { return navigator.mediaDevices.enumerateDevices().then(l => l.filter(d => d.kind === 'videoinput')).catch(() => []); }
    catch (e) { return Promise.resolve([]); }
  }

  /** Identifiant de la caméra à ouvrir pour la face voulue (null : on laisse faire facingMode). */
  function choisirCamera(cams, face, actuel) {
    if (!cams || cams.length < 2) return null;
    const re = face === 'user' ? /front|avant|user|selfie|facing front/i : /back|arri[eè]re|rear|environment|facing back/i;
    const parNom = cams.filter(c => re.test(c.label || ''));
    const autre = parNom.find(c => c.deviceId !== actuel) || parNom[0];
    if (autre) return autre.deviceId;
    const i = cams.findIndex(c => c.deviceId === actuel);
    return cams[(i + 1) % cams.length].deviceId;
  }

  /** Flux vidéo : l'appareil précis d'abord, puis la face imposée, puis la face préférée, puis n'importe laquelle. */
  async function ouvrirFlux(face, appareil) {
    const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const essais = appareil ? [{ deviceId: { exact: appareil } }] : [];
    essais.push({ facingMode: { exact: face } }, { facingMode: { ideal: face } }, {});
    let err = null;
    for (const v of essais) {
      try { return await navigator.mediaDevices.getUserMedia({ video: Object.assign({}, v, base), audio: false }); }
      catch (e) { err = e; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e; }
    }
    throw err;
  }

  const el = (tag, attrs, enfants) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (enfants || []).forEach(c => c && n.appendChild(c));
    return n;
  };

  /**
   * Ouvre l'appareil photo. Rend une promesse : un File JPEG, ou null si l'on ferme sans photo.
   * options.face : 'environment' (arrière, par défaut) ou 'user' (avant, pour un portrait pris par soi-même).
   */
  function prendrePhoto(options) {
    options = options || {};
    return new Promise(resolve => {
      let flux = null, face = options.face || 'environment', appareil = '', fini = false;
      const video = el('video', { autoplay: true, playsinline: true, muted: true, style: 'width:100%;max-height:60vh;background:#000;border-radius:8px' });
      video.muted = true;
      const info = el('p', { class: 'muet petit', text: 'Démarrage de la caméra…', style: 'margin:.5em 0' });
      const arreter = () => { if (flux) { flux.getTracks().forEach(t => t.stop()); flux = null; } };
      const fond = el('div', { class: 'modal-fond' });
      const terminer = fichier => { if (fini) return; fini = true; arreter(); fond.remove(); resolve(fichier || null); };

      async function demarrer() {
        arreter(); info.textContent = 'Démarrage de la caméra…';
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          info.textContent = 'Caméra indisponible ici (connexion sécurisée HTTPS requise). Utilisez « Choisir un fichier ».'; return;
        }
        try {
          flux = await ouvrirFlux(face, appareil);
          const piste = flux.getVideoTracks()[0], reg = piste && piste.getSettings ? piste.getSettings() : {};
          appareil = reg.deviceId || appareil;
          if (reg.facingMode) face = reg.facingMode === 'user' ? 'user' : 'environment';
          video.srcObject = flux; await video.play().catch(() => {});
          video.style.transform = face === 'user' ? 'scaleX(-1)' : '';
          info.textContent = face === 'user' ? 'Caméra avant (selfie)' : 'Caméra arrière';
        } catch (e) {
          info.textContent = e && e.name === 'NotAllowedError' ? 'Accès à la caméra refusé : autorisez-le dans les réglages du navigateur ou de l’application.'
            : e && e.name === 'NotFoundError' ? 'Aucune caméra détectée sur cet appareil.' : 'Caméra inaccessible : ' + ((e && e.message) || e);
        }
      }
      async function choisirFace(f) {
        if (f === face && flux) return;
        const cams = await camerasVideo(), re = f === 'user' ? /front|avant|user|selfie/i : /back|arri[eè]re|rear|environment/i;
        const parNom = cams.filter(c => re.test(c.label || ''));
        face = f;
        appareil = parNom.length ? parNom[0].deviceId : (choisirCamera(cams, face, appareil) || '');
        demarrer();
      }
      async function basculer() {
        face = face === 'user' ? 'environment' : 'user';
        appareil = choisirCamera(await camerasVideo(), face, appareil) || '';
        demarrer();
      }
      function declencher() {
        if (!flux || !video.videoWidth) { info.textContent = 'La caméra n’est pas encore prête.'; return; }
        const max = 1600, k = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
        const g = c.getContext('2d');
        if (face === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
        g.drawImage(video, 0, 0, c.width, c.height);
        c.toBlob(b => {
          if (!b) { info.textContent = 'Prise de vue impossible, réessayez.'; return; }
          const nom = 'photo-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.jpg';
          let f;
          try { f = new File([b], nom, { type: 'image/jpeg', lastModified: Date.now() }); } catch (e) { f = b; f.name = nom; }
          terminer(f);
        }, 'image/jpeg', 0.85);
      }

      const boite = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': options.titre || 'Appareil photo' }, [
        el('div', { class: 'modal-tete' }, [el('h2', { text: options.titre || 'Appareil photo' }),
          el('button', { class: 'icone-btn', type: 'button', 'aria-label': 'Fermer', text: '✕', onclick: () => terminer(null) })]),
        el('div', { class: 'modal-corps' }, [video, info]),
        el('div', { class: 'modal-pied', style: 'display:flex;flex-wrap:wrap;gap:8px' }, [
          el('button', { class: 'btn btn-fantome', type: 'button', text: '\uE03C Caméra avant', title: 'Caméra de face (selfie)', onclick: () => choisirFace('user') }),
          el('button', { class: 'btn btn-fantome', type: 'button', text: '\uE03C Caméra arrière', title: 'Caméra du dos du téléphone', onclick: () => choisirFace('environment') }),
          el('button', { class: 'btn btn-fantome', type: 'button', text: '\uE058 Basculer', title: 'Basculer caméra avant / arrière', onclick: basculer }),
          el('button', { class: 'btn btn-primaire', type: 'button', text: '\uE03C Prendre la photo', onclick: declencher }),
          el('button', { class: 'btn btn-fantome', type: 'button', text: 'Annuler', onclick: () => terminer(null) })
        ])
      ]);
      fond.appendChild(boite);
      fond.addEventListener('click', e => { if (e.target === fond) terminer(null); });
      document.body.appendChild(fond);
      demarrer();
    });
  }

  /** Place le fichier pris en photo dans le champ, comme si on l'avait choisi, et prévient l'écran. */
  function remplir(champ, fichier) {
    try {
      const dt = new DataTransfer();
      dt.items.add(fichier);
      champ.files = dt.files;
    } catch (e) {
      /* Navigateur sans DataTransfer : on expose le fichier, les écrans le lisent via champ.files sinon. */
      try { Object.defineProperty(champ, 'files', { configurable: true, get: () => [fichier] }); } catch (x) { return; }
    }
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const accepteImage = c => c.type === 'file' && /image/i.test(c.getAttribute('accept') || '') && !c.dataset.sansCamera;

  /** Ajoute le bouton « Appareil photo » à côté d'un champ image (une seule fois). */
  function equiper(champ) {
    if (champ.dataset.camera || !accepteImage(champ)) return;
    champ.dataset.camera = '1';
    const portrait = /photo|portrait|identit|eleve|agent|personnel/i.test((champ.id || '') + ' ' + (champ.name || '') + ' ' + (champ.getAttribute('aria-label') || ''));
    const b = el('button', {
      type: 'button', class: 'btn btn-fantome btn-camera', text: '\uE03C Appareil photo', title: 'Prendre la photo avec la caméra (avant ou arrière)',
      style: 'margin:4px 0 4px 6px',
      onclick: e => {
        e.preventDefault(); e.stopPropagation();
        prendrePhoto({ face: 'environment', titre: portrait ? 'Photo — caméra avant ou arrière' : 'Appareil photo' }).then(f => { if (f) remplir(champ, f); });
      }
    });
    /* Un champ masqué (déclenché par un autre bouton) garde son bouton propre : on place le nôtre à côté. */
    if (champ.parentNode) champ.parentNode.insertBefore(b, champ.nextSibling);
  }

  function parcourir(racine) {
    if (!racine || racine.nodeType !== 1) return;
    if (racine.matches && racine.matches('input[type=file]')) equiper(racine);
    if (racine.querySelectorAll) racine.querySelectorAll('input[type=file]').forEach(equiper);
  }

  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(parcourir)))
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', () => parcourir(document.body));

  EG.Camera = { prendrePhoto, choisirCamera, ouvrirFlux, remplir, equiper };
})(window);
