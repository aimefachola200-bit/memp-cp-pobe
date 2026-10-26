# Exporte les schémas des fiches de rapport de rentrée et de fin d'année de GESCOL / SCOLARIS (m_rapports.py)
# vers data/rapports.json :   python3 tools/exporter-rapports.py <dossier source GESCOL ou SCOLARIS> data/rapports.json
import json
import sys

sys.path.insert(0, sys.argv[1])
import m_rapports as M  # noqa: E402


def conv(o):
    if isinstance(o, (set, tuple)):
        return list(o)
    raise TypeError(type(o))


out = {"docs": M.DOCS, "soeur": M.SOEUR, "statuts_agent": M.STATUTS_AGENT, "niv_ep": M.NIV_EP, "pers_max": M.PERS_MAX,
       "schemas": {d: M.schema(d) for d in M.DOCS},
       "cols_pdf": {d: M.colonnes_pdf_personnel(d) for d in M.DOCS},
       "notes_personnel": M.NOTES_PERSONNEL}
s = json.dumps(out, default=conv, ensure_ascii=False, separators=(",", ":"))
open(sys.argv[2], "w", encoding="utf-8").write(s)
print(len(s))
