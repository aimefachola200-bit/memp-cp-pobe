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
Conception : Maître Aimé FACHOLA
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
# Fiches : la liste (filtres, recherche, planification) n'a besoin que de ces champs ; le corps de chaque fiche (déroulement,
# objectifs, stratégies…) est rangé à part, un fichier par cours et par matière, chargé à l'ouverture d'une fiche ou d'un classeur.
CHAMPS_LISTE_FICHE = ("id", "cours", "matiere", "sous_matiere", "unite", "intitule", "sa", "seance", "semaine", "duree", "titre", "statut", "contenus")
# Résumés : même principe ; ces champs (exercices, méthode, exemples…) ne servent qu'à l'affichage d'un résumé et vont dans <COURS>.resumes.json
# Maternelle (SCOLARIS 2.1.0) : la liste porte en plus la section, le domaine et le calendrier (filtres section → domaine → composante → mois / semaine)
CHAMPS_LISTE_MAT = CHAMPS_LISTE_FICHE + ("section", "sections", "domaine_code", "domaine_nom", "mois", "trimestre", "a_verifier")
CHAMPS_CORPS_RESUME = {"exercices", "mention", "methode", "exemple", "vocabulaire", "manuel_note", "sources", "je_retiens", "questions_reponses",
                       "message", "actualisation", "situation", "engagement", "mots_cles", "lecture", "bilan"}


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
        for k in ("maternelle", "programme_en_vigueur"):
            if P.get(k):
                C[k] = P[k]
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


def revisions_cours(C, cours):
    """SCOLARIS 1.31 : les cahiers de révision des disciplines d'éveil (CM1, CM2) deviennent des fiches de révision dans l'onglet Résumés."""
    out = []
    for rv in C.get("revisions") or []:
        if rv.get("cours") != cours:
            continue
        for k, sec in enumerate(rv.get("sections") or [], 1):
            qr = sec.get("qr") or []
            out.append({"id": f"{rv['id']}-{k:02d}", "cours": cours, "matiere": sec["matiere"], "domaine": "",
                        "collection": "Révisions d'éveil (type CEP)", "titre": "Révision — " + sec["titre"], "regle": sec.get("je_retiens") or "",
                        "methode": "Schéma : " + sec["schema"] if sec.get("schema") else "",
                        "exemple": " ".join(f"{x['q']} — {x['r']}" for x in qr[:3]),
                        "questions_reponses": qr, "exercices": sec.get("exercices") or [], "sa": [sec["sa"]] if sec.get("sa") else [],
                        "mois": "Mai", "trimestre": "III", "ordre": [8, 900 + k, 0], "revision": True, "mention": rv.get("mention") or ""})
    return out


def exporter_maternelle(C, tmp, empreintes):
    """École maternelle (pack 2.1.0) : MAT.json (sections, domaines, progressions, emplois du temps, grilles d'observation,
    liste des fiches et des repères) ; corps des fiches dans MAT.fiches.dg.json et des repères dans MAT.resumes.json."""
    M = C["maternelle"]
    fiches = [{k: v for k, v in f.items() if k not in CHAMPS_EXCLUS_FICHE} for f in C["fiches"] if f.get("cours") == "MAT"]
    fiches.sort(key=lambda f: (MOIS_SCO.index(f["mois"]) if f.get("mois") in MOIS_SCO else 99, f.get("semaine") or 0,
                               f.get("domaine_code") or "", f.get("sous_matiere") or "", f.get("titre") or ""))
    legeres = [{k: f[k] for k in CHAMPS_LISTE_MAT if k in f} for f in fiches]
    corps = {str(f["id"]): {k: v for k, v in f.items() if k not in CHAMPS_LISTE_MAT} for f in fiches}
    info = {}
    oc, ec = ecrire(tmp, "MAT.fiches.dg.json", corps)
    empreintes.append(ec)
    info["dg"] = {"fichier": "MAT.fiches.dg.json", "octets": oc, "empreinte": ec, "nb": len(corps)}
    reperes = [dict(r, cours="MAT", matiere="dg", domaine=r.get("domaine") or r.get("domaine_code")) for r in M.get("reperes") or []]
    res_leg = [{k: v for k, v in r.items() if k not in CHAMPS_CORPS_RESUME} for r in reperes]
    res_corps = {str(r["id"]): {k: v for k, v in r.items() if k in CHAMPS_CORPS_RESUME} for r in reperes}
    orr, err = ecrire(tmp, "MAT.resumes.json", res_corps)
    empreintes.append(err)
    info["_resumes"] = {"fichier": "MAT.resumes.json", "octets": orr, "empreinte": err, "nb": len(res_corps)}
    mat = {k: M.get(k) for k in ("annee", "sections", "domaines", "progressions", "emplois_du_temps", "grilles", "sources", "note_domaines")}
    d = {"cours": "MAT", "maternelle": mat, "programmes": [], "progression": [], "edt": None, "fiches": legeres, "resumes": res_leg,
         "epreuves": [], "plan": {}, "guides": [g["id"] for g in C["guides"] if "MAT" in (g.get("cours") or [])],
         "corps": {m: x["fichier"] for m, x in info.items()}}
    octets, e = ecrire(tmp, "MAT.json", d)
    empreintes.append(e)
    return {"cours": "MAT", "libelle": "Maternelle", "fichier": "MAT.json", "octets": octets, "empreinte": e, "corps": info,
            "nb": {"fiches": len(fiches), "resumes": len(reperes), "epreuves": 0, "programmes": 0,
                   "progressions": len(M.get("progressions") or []), "grilles": len(M.get("grilles") or [])}}


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
        resumes += revisions_cours(C, c)
        progs = [p for p in C["programmes"] if p["cours"] == c]
        ep = epreuves_cours(EP, B, c, epp)
        legeres, corps = [], {}
        for f in fiches:
            legeres.append({k: f[k] for k in CHAMPS_LISTE_FICHE if k in f})
            corps.setdefault(f.get("matiere") or "autre", {})[str(f["id"])] = {k: v for k, v in f.items() if k not in CHAMPS_LISTE_FICHE}
        info_corps = {}
        for m, o in sorted(corps.items()):
            nomf = f"{c}.fiches.{m}.json"
            oc, ec = ecrire(tmp, nomf, o)
            empreintes.append(ec)
            info_corps[m] = {"fichier": nomf, "octets": oc, "empreinte": ec, "nb": len(o)}
        res_leg, res_corps = [], {}
        for r in resumes:
            res_leg.append({k: v for k, v in r.items() if k not in CHAMPS_CORPS_RESUME})
            res_corps[str(r["id"])] = {k: v for k, v in r.items() if k in CHAMPS_CORPS_RESUME}
        nomr = f"{c}.resumes.json"
        orr, err = ecrire(tmp, nomr, res_corps)
        empreintes.append(err)
        info_corps["_resumes"] = {"fichier": nomr, "octets": orr, "empreinte": err, "nb": len(res_corps)}
        d = {"cours": c, "programmes": progs, "progression": lignes, "edt": edt_cours(EP, S, c), "fiches": legeres,
             "resumes": res_leg, "epreuves": ep, "plan": plan, "guides": [g["id"] for g in C["guides"] if c in (g.get("cours") or [])],
             "corps": {m: x["fichier"] for m, x in info_corps.items()}}
        octets, e = ecrire(tmp, c + ".json", d)
        empreintes.append(e)
        cours_info.append({"cours": c, "fichier": c + ".json", "octets": octets, "empreinte": e, "corps": info_corps,
                           "nb": {"fiches": len(fiches), "resumes": len(resumes), "epreuves": len(ep), "programmes": len(progs)}})
    if C.get("maternelle"):
        cours_info.append(exporter_maternelle(C, tmp, empreintes))
    guides = [{k: g.get(k) for k in ("id", "matiere", "cours", "titre", "groupe", "html", "source", "niveau", "mention")} for g in C["guides"]]
    og, eg = ecrire(tmp, "guides.json", guides)
    empreintes.append(eg)
    ecrire(tmp, "modeles.json", C.get("modeles") or [])
    version = hashlib.sha256("|".join(empreintes).encode()).hexdigest()[:12]
    index = {"version": version, "genere": date.today().isoformat(), "scolaris": getattr(CFG, "VERSION", ""), "pack": vpack,
             "source": C.get("source"), "mention": "Contenus de SCOLARIS : fiches conçues selon l'APC (à valider par le conseiller pédagogique), "
             "fiches transmises par la CS (crédit de l'auteur conservé), guides officiels MEMP / INFRE.",
             "matieres": {k: v for k, v in C["matieres"].items() if k != "dg" or C.get("maternelle")}, "cours": cours_info,
             "programme_en_vigueur": C.get("programme_en_vigueur"),
             "guides": {"fichier": "guides.json", "octets": og, "nb": len(guides)},
             # modèles de fiche vierges (non affichés par les applications) : fichier à part, hors du premier chargement
             "modeles": {"fichier": "modeles.json", "nb": len(C.get("modeles") or [])},
             "periodes": [{"code": p[0], "libelle": p[1], "type": p[2]} for p in B.PERIODES], "types": B.TYPES}
    ecrire(tmp, "index.json", index)
    for s in a.sortie:
        shutil.rmtree(s, ignore_errors=True)
        os.makedirs(os.path.dirname(os.path.abspath(s)), exist_ok=True)
        shutil.copytree(tmp, s)
    shutil.rmtree(tmp, ignore_errors=True)
    print("version", version, "| SCOLARIS", index["scolaris"], "| pack", vpack)
    for ci in cours_info:
        print(f"  {ci['cours']}: {ci['octets'] // 1024} Ko + corps {sum(x['octets'] for x in ci['corps'].values()) // 1024} Ko — {ci['nb']}")
    print(f"  guides: {og // 1024} Ko — {len(guides)}")


if __name__ == "__main__":
    main()
