import pathlib, re

hits=[]
for p in pathlib.Path(".").rglob("*.ts"):
    s=str(p)
    if "open" in s and "new trylo cli/open" in s:
        continue
    if "node_modules" in s or ".git" in s:
        continue
    try:
        t=p.read_text(encoding="utf-8", errors="ignore")
        if 'from "open/' in t or "from 'open/" in t or 'open/00-protocols' in t:
            hits.append(str(p))
    except: pass
print(f"import hits: {hits} count {len(hits)}")

# check package.json references
import json, os
for pkg in pathlib.Path(".").rglob("package.json"):
    if "open" in str(pkg) or "node_modules" in str(pkg):
        continue
    try:
        j=json.loads(pkg.read_text(encoding="utf-8", errors="ignore"))
        deps={**j.get("dependencies",{}), **j.get("devDependencies",{})}
        for k,v in deps.items():
            if "open" in v:
                print(f"dep open in {pkg}: {k}={v}")
    except: pass

# check Q zone empty
q = pathlib.Path("new trylo cli/open/99-quarantine-mixed-license")
print(f"Q exists: {q.exists()} items {len(list(q.iterdir())) if q.exists() else 0}")
print(f"Q rglob count {len(list(q.rglob('*'))) if q.exists() else 0}")

h = pathlib.Path("new trylo cli/open/90-historical-archived")
print(f"90 exists: {h.exists()} items {len(list(h.iterdir())) if h.exists() else 0}")

# check P0 clones count
import subprocess
repos=[]
for p in pathlib.Path("new trylo cli/open").rglob(".git"):
    if p.is_dir():
        try:
            head=subprocess.check_output(["git","-C",str(p.parent),"rev-parse","HEAD"]).decode().strip()
            print(f"OK {p.parent} {head[:7]}")
            repos.append(str(p.parent))
        except: print(f"BAD {p.parent}")
print(f"total repos with .git: {len(repos)}")
