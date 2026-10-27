# -*- coding: utf-8 -*-
"""Pédagogie — export du corpus pédagogique de SCOLARIS vers les applications web (CS Pobè, Mon école, MEMP-CP, DOSP,
MEMP-CP Pobè, ÉduGestion Pro / Master).

Sortie (dossier --sortie, ex. <app>/data/pedagogie) : petits fichiers JSON chargés à la demande par js/pedagogie.js
  index.json      version, matières, cours (taille, nombre d'éléments), modèles de fiche
  guides.json     guides méthodologiques (HTML) — communs à plusieurs cours
  <COURS>.json    programmes, progression annuelle, emploi du temps, fiches, résumés, épreuves (sujet + corrigé),
                  planification précalculée (mois → semaines → fiches / résumés par matière)

Le contenu est exactement celui que SCOLARIS publie (fiches conçues selon l'APC, fiches de la CS non marquées avec leur
crédit, guides officiels MEMP / INFRE) : aucune pièce tierce filigranée, aucun mot de passe. La logique de planification et
le générateur d'épreuves sont ceux de SCOLARIS (modules importés en lecture seule) : mêmes fiches, mêmes résumés.

Usage : python3 -I exporter.py --scolaris /home/claude/scolaris --sortie DOSSIER [--sortie DOSSIER2 …] [--pack PACK.json.gz]
  --pack : paquet exporté par SCOLARIS (outils/pedafiche/pack/pedagogie-<version>.json.gz) ; ses listes remplacent celles
           du corpus (fiches, résumés, programmes, guides, modèles, épreuves) quand il les fournit.
Conception : Maître Aimé FACHE
"""
import argparse
import gzip
import hashlib
import json
import os
import shutil
import sys
from datetime import date

COURS = ["CI", "CP", "CE1", "CE2", "CM1", "CM2"]
MOIS_SCO = ["Septembre", "Octobre", "Novembre", "Décembre", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin"]
CHAMPS_EXCLUS_FICHE = {"fichier"}          # noms de fichiers d'origine : inutiles dans l'application


def charger(scolaris, pack):
    sys.path.insert(0, scolaris)
    os.environ.setdefault("SCOLARIS_EDITION", "privee")
    import m_preparation as MP            # noqa: E402
    import m_evalprep as EP               # noqa: E402
    import m_synoptique as S              # noqa: E402
    import banque_epreuves as B           # noqa: E402
    C = MP.corpus()
    epreuves_pack = None
    version_pack = None
    if pack:
        with gzip.open(pack, "rt", encoding="utf-8") as f:
            P = json.load(f)
        version_pack = P.get("version") or P.get("version_scolaris")
        for k in ("fiches", "resumes", "programmes", "guides", "modeles"):
            if isinstance(P.get(k), list) and P[k]:
                C[k] = P[k]
                if k == "fiches":
                    C["fiche_par_id"] = {x["id"]: x for x in P[k]}
        if isinstance(P.get("epreuves"), list) and P["epreuves"]:
            epreuves_pack = P["epreuves"]
        for x in C["fiches"] + C["programmes"]:
            for kk in ("sa", "seance", "num", "dossier"):
                v = x.get(kk)
                if isinstance(v, str):
                    x[kk] = int(v) if v.strip().isdigit() else None
    return MP, EP, S, B, C, epreuves_pack, version_pack


def plan_cours(MP, EP, S, cours):
    """Planification précalculée : pour chaque mois et chaque semaine (1 à 4) du mois, les fiches de chaque matière
    (planification annuelle officielle × bibliothèque, comme SCOLARIS) et les résumés qui les accompagnent."""
    niv = EP.COURS_NIV[cours]
    lignes = S.planification_defaut(niv)
    par_mois = {l.get("mois"): l for l in lignes}
    out = {}
    for mois in MOIS_SCO:
        ligne = par_mois.get(mois)
        if not ligne:
            continue
        semaines = []
        for k in range(4):
            jour = date(2026, 10, 1 + 7 * k)          # seul le jour du mois compte (semaine k du mois)
            fiches, ann = {}, {}
            for m in MP.ORDRE_MAT:
                texte = "; ".join(str(ligne.get(c) or "") for c, mm in MP.COL_MATIERE.items() if mm == m and ligne.get(c))
                if not texte:
                    continue
                ann[m] = texte
                refs = MP.refs_de_la_semaine(MP.references(texte), m, jour)
                fs = MP.correspondances(cours, m, refs)
                if fs:
                    fiches[m] = fs
            res = MP.resumes_semaine(cours, fiches)
            semaines.append({"fiches": {m: [f["id"] for f in fs] for m, fs in fiches.items()},
                             "resumes": {m: [r["id"] for r in rs] for m, rs in res.items()}})
        rm = MP.resumes_mois(cours, mois)
        out[mois] = {"trimestre": ligne.get("trimestre"), "semaines": semaines, "annuel": ann,
                     "resumes": {m: [r["id"] for r in rs] for m, rs in rm.items()}}
    return lignes, out


def edt_cours(EP, S, cours):
    """Emploi du temps officiel du cours, créneaux déjà découpés (matière, sous-matière, durée) jour par jour."""
    edt = S.edt_defaut(EP.COURS_NIV[cours])
    jours = {j: [] for j in EP.JOURS}
    for ligne in edt.get("lignes") or []:
        for j in EP.JOURS:
            for c in EP.creneaux(ligne.get(j)):
                jours[j].append(dict(c, horaire=ligne.get("horaire", "")))
    return {"lignes": edt.get("lignes") or [], "jours": jours}


def epreuves_cours(EP, B, cours, epreuves_pack):
    if epreuves_pack is not None:
        return [e for e in epreuves_pack if e.get("cours") == cours]
    out = []
    for p in B.periodes_du_cours(cours):
        try:
            # même progression que SCOLARIS (planification annuelle officielle, sans base de données) : on la rejoue ici
            prog = progression(EP, cours, p[0])
            for d in B.jeu_complet(cours, p[0], prog):
                d["total"] = B.total_bareme(d)
                out.append(d)
        except Exception as e:  # noqa: BLE001
            print("épreuve ignorée", cours, p[0], e, file=sys.stderr)
    return out


def progression(EP, cours, per):
    """Copie de m_evalprep.enregistrer().progression sans la base : planification annuelle officielle du cours."""
    import banque_epreuves as B
    import m_preparation as MP
    import m_synoptique as S
    lignes_plan = {}
    for l in S.planification_defaut(EP.COURS_NIV[cours]):
        m = next((k for k, v in B.MOIS_LIB.items() if MP._sans_accent(v) == MP._sans_accent(l.get("mois", ""))), None)
        if m:
            lignes_plan[m] = l
    mois = EP.mois_jusqua(per)
    out = {}
    C = MP.corpus()
    for mat, cols in EP.PLAN_COLS.items():
        textes = [str(lignes_plan.get(m, {}).get(c) or "") for m in mois for c in cols]
        texte = " ; ".join(t for t in textes if t.strip())
        refs = MP.references(texte)
        fiches = MP.correspondances(cours, mat, refs) if (refs["sa"] or refs["u"] or refs["d"]) else []
        par_sa = {}
        for f in fiches:
            if f.get("sa"):
                par_sa.setdefault(f["sa"], []).append(f)
        titres = {}
        for p in C["programmes"]:
            if p["cours"] == cours and p["matiere"] == mat and p.get("type") == "sa" and p.get("num"):
                titres.setdefault(p["num"], p["titre"])
        for n, fs in par_sa.items():
            titres.setdefault(n, fs[0].get("intitule") or fs[0].get("titre"))
        sas = [(n, titres.get(n, f"SA {n}")) for n in sorted(set(refs["sa"]) | set(par_sa))]
        out[mat] = {"refs": texte[:300], "sas": sas, "fiches": par_sa}
    return out


# puces et symboles que certains téléphones affichent en émoji : remplacés par des signes typographiques simples
SIGNES = {"\u25aa": "\u2022", "\u25ab": "\u2022", "\u25b6": "\u25b8", "\u2194": "\u27f7", "\u2605": "\u2731", "\u2606": "\u2731", "\u2714": "\u2713",
          "\u2716": "\u00d7", "\u2764": "", "\ufe0f": "", "\u2600": "", "\u260e": ""}


def ecrire(dossier, nom, obj):
    t = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    for a, b in SIGNES.items():
        t = t.replace(a, b)
    with open(os.path.join(dossier, nom), "w", encoding="utf-8") as f:
        f.write(t)
    return len(t.encode("utf-8")), hashlib.sha256(t.encode("utf-8")).hexdigest()[:12]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scolaris", required=True)
    ap.add_argument("--sortie", required=True, action="append")
    ap.add_argument("--pack")
    a = ap.parse_args()
    MP, EP, S, B, C, epp, vpack = charger(os.path.abspath(a.scolaris), a.pack)
    import config as CFG  # noqa: E402  (SCOLARIS)
    tmp = a.sortie[0] + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    empreintes, cours_info = [], []
    for c in COURS:
        lignes, plan = plan_cours(MP, EP, S, c)
        fiches = [{k: v for k, v in f.items() if k not in CHAMPS_EXCLUS_FICHE} for f in MP.fiches_filtrees(cours=c)]
        resumes = sorted([r for r in C.get("resumes") or [] if r["cours"] == c], key=MP.ordre_resume)
        progs = [p for p in C["programmes"] if p["cours"] == c]
        ep = epreuves_cours(EP, B, c, epp)
        d = {"cours": c, "programmes": progs, "progression": lignes, "edt": edt_cours(EP, S, c), "fiches": fiches,
             "resumes": resumes, "epreuves": ep, "plan": plan, "guides": [g["id"] for g in C["guides"] if c in (g.get("cours") or [])]}
        octets, e = ecrire(tmp, c + ".json", d)
        empreintes.append(e)
        cours_info.append({"cours": c, "fichier": c + ".json", "octets": octets, "empreinte": e,
                           "nb": {"fiches": len(fiches), "resumes": len(resumes), "epreuves": len(ep), "programmes": len(progs)}})
    guides = [{k: g.get(k) for k in ("id", "matiere", "cours", "titre", "groupe", "html", "source", "niveau", "mention")} for g in C["guides"]]
    og, eg = ecrire(tmp, "guides.json", guides)
    empreintes.append(eg)
    version = hashlib.sha256("|".join(empreintes).encode()).hexdigest()[:12]
    index = {"version": version, "genere": date.today().isoformat(), "scolaris": getattr(CFG, "VERSION", ""), "pack": vpack,
             "source": C.get("source"), "mention": "Contenus de SCOLARIS : fiches conçues selon l'APC (à valider par le conseiller pédagogique), "
             "fiches transmises par la CS (crédit de l'auteur conservé), guides officiels MEMP / INFRE.",
             "matieres": {k: v for k, v in C["matieres"].items() if k != "dg"}, "cours": cours_info,
             "guides": {"fichier": "guides.json", "octets": og, "nb": len(guides)},
             "modeles": C.get("modeles") or [],
             "periodes": [{"code": p[0], "libelle": p[1], "type": p[2]} for p in B.PERIODES], "types": B.TYPES}
    ecrire(tmp, "index.json", index)
    for s in a.sortie:
        shutil.rmtree(s, ignore_errors=True)
        os.makedirs(os.path.dirname(os.path.abspath(s)), exist_ok=True)
        shutil.copytree(tmp, s)
    shutil.rmtree(tmp, ignore_errors=True)
    print("version", version, "| SCOLARIS", index["scolaris"], "| pack", vpack)
    for ci in cours_info:
        print(f"  {ci['cours']}: {ci['octets'] // 1024} Ko — {ci['nb']}")
    print(f"  guides: {og // 1024} Ko — {len(guides)}")


if __name__ == "__main__":
    main()
