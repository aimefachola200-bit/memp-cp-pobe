/* ÉduGestion Pro Master — génération de QR codes (ISO/IEC 18004), mode octet.
   Versions 1 à 10, correction d'erreurs L ou M. Aucune bibliothèque :
   l'application doit pouvoir imprimer un document sans réseau. */
(function (global) {
  'use strict';
  const EG = global.EG;

  /* ---------------- Arithmétique dans GF(256) ---------------- */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /** Polynôme générateur de degré n pour la correction d'erreurs. */
  function generateur(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const suivant = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        suivant[j] ^= g[j];
        suivant[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = suivant;
    }
    return g;
  }

  /** Mots de correction d'erreurs d'un bloc de données. */
  function correction(donnees, nbMots) {
    const g = generateur(nbMots);
    const reste = new Array(donnees.length + nbMots).fill(0);
    for (let i = 0; i < donnees.length; i++) reste[i] = donnees[i];
    for (let i = 0; i < donnees.length; i++) {
      const coef = reste[i];
      if (coef === 0) continue;
      for (let j = 0; j < g.length; j++) reste[i + j] ^= mul(g[j], coef);
    }
    return reste.slice(donnees.length);
  }

  /* ---------------- Tables normalisées ---------------- */
  /* [mots de correction par bloc, blocs groupe 1, données groupe 1, blocs groupe 2, données groupe 2] */
  const BLOCS = {
    L: [null, [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
      [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
      [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]],
    M: [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
      [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
      [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]]
  };

  const ALIGNEMENTS = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  /* Bits restants après les mots de code, par version. */
  const RESTANTS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

  const BITS_NIVEAU = { L: 1, M: 0, Q: 3, H: 2 };

  function capaciteOctets(version, niveau) {
    const b = BLOCS[niveau][version];
    const motsDonnees = b[1] * b[2] + b[3] * b[4];
    const bitsCompte = version < 10 ? 8 : 16;
    return Math.floor((motsDonnees * 8 - 4 - bitsCompte) / 8);
  }

  /* ---------------- Flux binaire ---------------- */
  function motsDeCode(octets, version, niveau) {
    const b = BLOCS[niveau][version];
    const motsDonnees = b[1] * b[2] + b[3] * b[4];
    const bits = [];
    const pousser = (valeur, longueur) => {
      for (let i = longueur - 1; i >= 0; i--) bits.push((valeur >> i) & 1);
    };

    pousser(0b0100, 4);                               // mode octet
    pousser(octets.length, version < 10 ? 8 : 16);    // longueur
    octets.forEach(o => pousser(o, 8));

    const capacite = motsDonnees * 8;
    for (let i = 0; i < 4 && bits.length < capacite; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    const donnees = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      donnees.push(v);
    }
    const remplissage = [0xEC, 0x11];
    let k = 0;
    while (donnees.length < motsDonnees) donnees.push(remplissage[k++ % 2]);

    /* Découpage en blocs, puis entrelacement normalisé. */
    const blocs = [];
    let position = 0;
    for (let i = 0; i < b[1]; i++) { blocs.push(donnees.slice(position, position + b[2])); position += b[2]; }
    for (let i = 0; i < b[3]; i++) { blocs.push(donnees.slice(position, position + b[4])); position += b[4]; }
    const corrections = blocs.map(bl => correction(bl, b[0]));

    const sortie = [];
    const maxDonnees = Math.max(b[2], b[4]);
    for (let i = 0; i < maxDonnees; i++) {
      blocs.forEach(bl => { if (i < bl.length) sortie.push(bl[i]); });
    }
    for (let i = 0; i < b[0]; i++) corrections.forEach(c => sortie.push(c[i]));
    return sortie;
  }

  /* ---------------- Trame ---------------- */
  function nouvelleTrame(taille, valeur) {
    const m = [];
    for (let i = 0; i < taille; i++) m.push(new Array(taille).fill(valeur));
    return m;
  }

  /**
   * Construit les motifs fixes et note, dans une matrice parallèle, les modules
   * qui leur appartiennent : ce sont eux qui ne devront jamais être masqués.
   */
  function structure(version) {
    const n = version * 4 + 17;
    const m = nouvelleTrame(n, 0);
    const fixe = nouvelleTrame(n, false);
    const poser = (l, c, v) => { m[l][c] = v; fixe[l][c] = true; };

    /* Repères de recherche et séparateurs. */
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([L, C]) => {
      for (let i = -1; i <= 7; i++) {
        for (let j = -1; j <= 7; j++) {
          const l = L + i, c = C + j;
          if (l < 0 || c < 0 || l >= n || c >= n) continue;
          const noir = (i >= 0 && i <= 6 && (j === 0 || j === 6))
            || (j >= 0 && j <= 6 && (i === 0 || i === 6))
            || (i >= 2 && i <= 4 && j >= 2 && j <= 4);
          poser(l, c, noir ? 1 : 0);
        }
      }
    });

    /* Lignes de synchronisation. */
    for (let i = 8; i < n - 8; i++) {
      const bit = (i % 2 === 0) ? 1 : 0;
      poser(6, i, bit);
      poser(i, 6, bit);
    }

    /* Motifs d'alignement : toutes les combinaisons sauf les trois qui
       tomberaient sur un repère de recherche. */
    const centres = ALIGNEMENTS[version];
    const dernier = centres[centres.length - 1];
    centres.forEach(a => centres.forEach(b => {
      if ((a === 6 && b === 6) || (a === 6 && b === dernier) || (a === dernier && b === 6)) return;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          poser(a + i, b + j,
            (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) ? 1 : 0);
        }
      }
    }));

    poser(n - 8, 8, 1); // module toujours sombre

    /* Emplacements réservés aux informations de format et de version. */
    for (let i = 0; i <= 8; i++) {
      if (!fixe[8][i]) poser(8, i, 0);
      if (!fixe[i][8]) poser(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (!fixe[8][n - 1 - i]) poser(8, n - 1 - i, 0);
      if (!fixe[n - 1 - i][8]) poser(n - 1 - i, 8, 0);
    }
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          poser(n - 11 + j, i, 0);
          poser(i, n - 11 + j, 0);
        }
      }
    }
    return { m, fixe };
  }

  function placerDonnees(m, fixe, mots, version) {
    const n = m.length;
    const bits = [];
    mots.forEach(o => { for (let i = 7; i >= 0; i--) bits.push((o >> i) & 1); });
    for (let i = 0; i < RESTANTS[version]; i++) bits.push(0);

    let index = 0, montant = true;
    for (let colonne = n - 1; colonne > 0; colonne -= 2) {
      if (colonne === 6) colonne--; // la colonne de synchronisation est sautée
      for (let pas = 0; pas < n; pas++) {
        const ligne = montant ? n - 1 - pas : pas;
        for (let d = 0; d < 2; d++) {
          const c = colonne - d;
          if (fixe[ligne][c]) continue;
          m[ligne][c] = index < bits.length ? bits[index] : 0;
          index++;
        }
      }
      montant = !montant;
    }
  }

  const MASQUES = [
    (l, c) => (l + c) % 2 === 0,
    (l) => l % 2 === 0,
    (l, c) => c % 3 === 0,
    (l, c) => (l + c) % 3 === 0,
    (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
    (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
    (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
    (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0
  ];

  function penalite(m) {
    const n = m.length;
    let score = 0;

    /* Règle 1 : suites de cinq modules ou plus de même couleur. */
    for (let i = 0; i < n; i++) {
      for (const sens of [0, 1]) {
        let precedent = -1, longueur = 0;
        for (let j = 0; j < n; j++) {
          const v = sens ? m[j][i] : m[i][j];
          if (v === precedent) longueur++;
          else { if (longueur >= 5) score += longueur - 2; precedent = v; longueur = 1; }
        }
        if (longueur >= 5) score += longueur - 2;
      }
    }

    /* Règle 2 : blocs de deux modules sur deux de même couleur. */
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const v = m[i][j];
        if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
      }
    }

    /* Règle 3 : motifs ressemblant à un repère de recherche. */
    const motif1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const motif2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= n - 11; j++) {
        const ligne = [], colonne = [];
        for (let k = 0; k < 11; k++) { ligne.push(m[i][j + k]); colonne.push(m[j + k][i]); }
        [ligne, colonne].forEach(suite => {
          if (motif1.every((v, k) => v === suite[k]) || motif2.every((v, k) => v === suite[k])) score += 40;
        });
      }
    }

    /* Règle 4 : déséquilibre entre modules clairs et sombres. */
    let sombres = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (m[i][j]) sombres++;
    score += Math.floor(Math.abs(sombres * 100 / (n * n) - 50) / 5) * 10;
    return score;
  }

  function infoFormat(niveau, masque) {
    const donnees = (BITS_NIVEAU[niveau] << 3) | masque;
    let reste = donnees << 10;
    for (let i = 14; i >= 10; i--) if ((reste >> i) & 1) reste ^= 0x537 << (i - 10);
    return (((donnees << 10) | reste) ^ 0x5412) & 0x7FFF;
  }

  function infoVersion(version) {
    let reste = version << 12;
    for (let i = 17; i >= 12; i--) if ((reste >> i) & 1) reste ^= 0x1F25 << (i - 12);
    return ((version << 12) | reste) & 0x3FFFF;
  }

  function ecrireInformations(m, niveau, masque, version) {
    const n = m.length;
    const format = infoFormat(niveau, masque);
    const bit = k => (format >> k) & 1;

    /* Première copie, autour du repère supérieur gauche. */
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for (let i = 9; i <= 14; i++) m[8][14 - i] = bit(i);

    /* Seconde copie, répartie sous et à droite. */
    for (let i = 0; i <= 7; i++) m[8][n - 1 - i] = bit(i);
    for (let i = 8; i <= 14; i++) m[n - 15 + i][8] = bit(i);
    m[n - 8][8] = 1;

    if (version >= 7) {
      const info = infoVersion(version);
      for (let i = 0; i < 18; i++) {
        const b = (info >> i) & 1;
        m[Math.floor(i / 3)][n - 11 + (i % 3)] = b;
        m[n - 11 + (i % 3)][Math.floor(i / 3)] = b;
      }
    }
  }

  /**
   * Encode un texte et rend la trame de modules.
   * options : { niveau: 'L' | 'M', versionMin }
   */
  function encoder(texte, options) {
    options = options || {};
    const niveau = options.niveau || 'M';
    const octets = Array.from(new TextEncoder().encode(String(texte)));

    let version = options.versionMin || 1;
    while (version <= 10 && octets.length > capaciteOctets(version, niveau)) version++;
    if (version > 10) {
      throw new Error('Contenu trop long pour un QR code de cette taille (' + octets.length + ' octets).');
    }

    const { m, fixe } = structure(version);
    const mots = motsDeCode(octets, version, niveau);
    placerDonnees(m, fixe, mots, version);

    let meilleure = null, meilleurScore = Infinity, meilleurMasque = 0;
    for (let masque = 0; masque < 8; masque++) {
      const essai = m.map((ligne, l) => ligne.map((v, c) =>
        fixe[l][c] ? v : (MASQUES[masque](l, c) ? v ^ 1 : v)));
      ecrireInformations(essai, niveau, masque, version);
      const score = penalite(essai);
      if (score < meilleurScore) { meilleurScore = score; meilleure = essai; meilleurMasque = masque; }
    }
    return { taille: meilleure.length, modules: meilleure, version, niveau, masque: meilleurMasque };
  }

  /** Rend le QR code en SVG, prêt à être imprimé. */
  function svg(texte, options) {
    options = options || {};
    const code = encoder(texte, options);
    const marge = options.marge === undefined ? 4 : options.marge;
    const total = code.taille + marge * 2;
    const taille = options.taille || 96;
    let chemin = '';
    for (let l = 0; l < code.taille; l++) {
      for (let c = 0; c < code.taille; c++) {
        if (code.modules[l][c]) chemin += 'M' + (c + marge) + ' ' + (l + marge) + 'h1v1h-1z';
      }
    }
    return '<svg class="qr" width="' + taille + '" height="' + taille + '" viewBox="0 0 ' + total + ' ' + total + '"'
      + ' xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img"'
      + ' aria-label="' + (options.description || 'Code de vérification') + '">'
      + '<rect width="' + total + '" height="' + total + '" fill="#ffffff"/>'
      + '<path d="' + chemin + '" fill="#17201B"/></svg>';
  }

  EG.QR = { encoder, svg, capaciteOctets };
})(window);
