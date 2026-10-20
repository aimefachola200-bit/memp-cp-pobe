# Exporte les schémas des fiches de recensement de GESCOL (m_recensement.py) vers data/recensement.json :
#   python3 tools/exporter-recensement.py <dossier source GESCOL> data/recensement.json
import sys, json
sys.path.insert(0, sys.argv[1])
import m_recensement as M
def conv(o):
    if isinstance(o, set): return sorted(o)
    if isinstance(o, tuple): return list(o)
    raise TypeError(type(o))
out = {"schemas": M.SCHEMAS, "guide": M.GUIDE_PRIMAIRE, "types": M.TYPES}
s = json.dumps(out, default=conv, ensure_ascii=False, separators=(",", ":"))
open(sys.argv[2], "w").write(s); print(len(s))
