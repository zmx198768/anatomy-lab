"""Convert every official 4.3 mesh, preserving every triangle and distinct FJ ID."""

import csv, json, re, gzip, hashlib, struct, collections
from pathlib import Path
import numpy as np

BASE = Path(__file__).parent
OUT = BASE.parent / "dist" / "atlas"
OUT.mkdir(exist_ok=True)
rows = list(csv.DictReader((BASE / "MANIFEST-4.3.csv").open()))
refs = json.loads((BASE / "chinese-reference.json").read_text(encoding="utf8"))
ref = {r["id"]: r for group in refs.values() for r in group}
refsys = {r["id"]: s for s, group in refs.items() for r in group}
cn_by_en = {r["nameEn"].lower(): r["nameCn"] for r in ref.values()}
groups = {}
for line in (BASE / "official/FMA2Obj.txt").read_text().splitlines():
    c = line.split("\t")
    if not line.startswith("#") and len(c) > 2:
        groups.setdefault(c[0], set()).update(c[2].split("+"))
expected = set().union(*groups.values())
assert expected == {r["fj_id"] for r in rows}
CONFIG = [
    ("bone", "骨骼", "Skeletal structures", "#ded4b6"),
    ("muscle", "肌肉", "Muscles", "#b96c59"),
    ("artery", "动脉", "Arteries", "#d86063"),
    ("vein", "静脉", "Veins", "#679bc0"),
    ("nerve", "神经", "Nervous system", "#e0c376"),
    ("connective", "软骨与连接组织", "Cartilage & connective tissue", "#a0c6bb"),
    ("heart", "心脏", "Heart", "#b56981"),
    ("respiratory", "呼吸系统", "Respiratory system", "#c49da1"),
    ("digestive", "消化系统", "Digestive system", "#bb936d"),
    ("urinary", "泌尿系统", "Urinary system", "#ad7381"),
    ("reproductive", "生殖系统", "Reproductive system", "#bd929e"),
    ("endocrine", "内分泌系统", "Endocrine system", "#b4a1c5"),
    ("lymph", "淋巴系统", "Lymphatic structures", "#8fbb94"),
    ("skin", "皮肤与感觉器官", "Integument & sensory structures", "#c0a28a"),
    ("other", "其他细分结构", "Other anatomical structures", "#9aaeb8"),
]


def category(fj, name):
    n = name.lower()
    if re.search(
        r"ansa cervicalis|cauda equina|precuneus|cuneus|parietal lobule|mammillary|red nucleus|preoptic nucleus|suprachiasmatic|supraoptic|optic chiasm",
        n,
    ):
        return "nerve"
    if "thyro-arytenoid proper" in n:
        return "muscle"
    if re.search(r"cystic duct|sublingual gland|mesoappendix|peritoneum", n):
        return "digestive"
    if re.search(r"sinus confluence|pterygoid plexus", n):
        return "vein"
    if "carotid sinus" in n:
        return "artery"
    if re.search(r"xiphoid process|manubrium|perpendicular plate of ethmoid", n):
        return "bone"
    # Specific tissue terms precede broad source system assignments.
    if re.search(
        r"cartilage|ligament|tendon|aponeurosis|interosseous membrane|meniscus|retinaculum|intervertebral disc",
        n,
    ):
        return "connective"
    for f, s in [("FMA5018", "bone"), ("FMA50720", "artery"), ("FMA50723", "vein")]:
        if fj in groups.get(f, set()):
            return s
    if re.search(r"artery|arterial|aorta|arteriosus|arteriosum", n):
        return "artery"
    if re.search(
        r"vein|venous|vena cava|coronary sinus|sagittal sinus|transverse sinus|sigmoid sinus|petrosal sinus|cavernous sinus|confluence of sinuses",
        n,
    ):
        return "vein"
    if re.search(
        r"nerve|ganglion|spinal cord|cerebr|cerebell|thalam|medulla|pons|olfactory tract|optic tract|dura mater|arachnoid|choroid plexus|brain|corpus callosum|fornix|putamen|pallid|caudate|amygdal|hippocamp|substantia|collicul|gyrus|sulcus|commissure|ventricle of brain",
        n,
    ):
        return "nerve"
    if re.search(r"thyroid|parathyroid|pituitary|adrenal|pineal", n):
        return "endocrine"
    if re.search(r"lymph|spleen|thymus|tonsil", n):
        return "lymph"
    if re.search(
        r"cardiac|heart|atrium|ventricular|ventricle|aortic valve|pulmonary valve|mitral|tricuspid|chordae tendineae|papillary muscle",
        n,
    ):
        return "heart"
    if fj in groups.get("FMA5022", set()) or re.search(
        r"muscle|biceps|triceps|quadriceps|deltoid|trapezius", n
    ):
        return "muscle"
    if re.search(
        r"tooth|teeth|molar|incisor|canine|mandible|maxilla|rib|vertebra|bone|sternum|sacrum|coccyx|scapula|clavicle|humerus|femur|tibia|fibula|patella|talus|calcaneus|phalange|phalanx|cuneiform|trapezoid|trapezium|pisiform|hamate|capitate|lunate|scaphoid|triquetr",
        n,
    ):
        return "bone"
    s = refsys.get(fj)
    if s:
        return {
            "skeletal": "connective",
            "muscular": "muscle",
            "cardiovascular": "heart",
            "nervous": "nerve",
            "lymphatic": "lymph",
            "integumentary": "skin",
        }.get(s, s)
    if re.search(r"lung|bronch|trachea|laryn|vocal|nasal|pharyn", n):
        return "respiratory"
    if re.search(r"kidney|renal|ureter|bladder|urethra", n):
        return "urinary"
    if re.search(
        r"penis|testis|testicle|epididym|deferens|prostate|seminal|bulbourethral|scrot|spermatic|prepuce",
        n,
    ):
        return "reproductive"
    if re.search(
        r"esophag|stomach|intestin|colon|rectum|liver|hepatic|gallbladder|pancrea|duoden|cecum|jejun|ileum|tongue|gingiv|salivary|parotid|palat|oral|anal canal|anus",
        n,
    ):
        return "digestive"
    if re.search(
        r"skin|eye|eyelid|cornea|iris|retina|lens|ear|cochlea|vestibul|tympan|sclera|lacrim", n
    ):
        return "skin"
    return "other"


records = []
global_min = np.full(3, np.inf)
global_max = np.full(3, -np.inf)
for r in rows:
    p = BASE / "objs" / (r["fj_id"] + ".obj")
    assert p.exists(), p
    with p.open() as f:
        header = "".join(next(f) for _ in range(10))
    name = re.search(r"# English name\s*:\s*(.+)", header).group(1).strip()
    fma = re.search(r"# Concept ID\s*:\s*(.+)", header).group(1).strip()
    nums = [
        float(x)
        for x in re.search(r"# Bounds\(mm\):\s*(.*)", header)
        .group(1)
        .replace(")-(", ",")
        .replace("(", "")
        .replace(")", "")
        .split(",")
    ]
    lo = np.array(nums[:3])
    hi = np.array(nums[3:])
    global_min = np.minimum(global_min, lo)
    global_max = np.maximum(global_max, hi)
    records.append(
        {
            "id": r["fj_id"],
            "fma": fma,
            "en": name,
            "name": cn_by_en.get(name.lower(), ""),
            "sys": category(r["fj_id"], name),
            "sourceFaces": int(r["faces"]),
        }
    )
height = global_max[2] - global_min[2]
factor = 175 / height
cx = (global_min[0] + global_max[0]) / 2
cy = (global_min[1] + global_max[1]) / 2
for r in records:
    # Direct names take precedence over the mirror's concept-level names.
    if not r["name"] and r["id"] in ref:
        candidate = ref[r["id"]]
        if candidate["nameEn"].lower() == r["en"].lower():
            r["name"] = candidate["nameCn"]
allchunks = []
totalfaces = 0
maxerror = 0
system_counts = collections.Counter()
for sys, label, en, color in CONFIG:
    subset = [r for r in records if r["sys"] == sys]
    buf = bytearray()
    chunkno = 0
    current = []

    def flush():
        global buf, chunkno, current
        if not current:
            return
        filename = f"{sys}-{chunkno}.bin.gz"
        data = gzip.compress(bytes(buf), compresslevel=7, mtime=0)
        (OUT / filename).write_bytes(data)
        allchunks.append(
            {
                "file": filename,
                "system": sys,
                "bytes": len(data),
                "rawBytes": len(buf),
                "sha256": hashlib.sha256(data).hexdigest(),
                "ids": [r["id"] for r in current],
            }
        )
        for r in current:
            r["file"] = filename
        buf = bytearray()
        current = []
        chunkno += 1

    for r in subset:
        vv = []
        ff = []
        for line in (BASE / "objs" / (r["id"] + ".obj")).read_text().splitlines():
            if line.startswith("v "):
                vv.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("f "):
                idx = [int(x.split("/")[0]) - 1 for x in line.split()[1:]]
                for i in range(1, len(idx) - 1):
                    ff.append([idx[0], idx[i], idx[i + 1]])
        v = np.array(vv, dtype=np.float32)
        f = np.array(ff, dtype=np.uint32)
        assert len(v) > 0 and len(f) > 0 and np.isfinite(v).all()
        assert int(f.max()) < len(v) and int(f.min()) >= 0
        assert len(f) == r["sourceFaces"], (r["id"], len(f), r["sourceFaces"])
        v = np.stack(
            [(v[:, 0] - cx) * factor, (v[:, 2] - global_min[2]) * factor, -(v[:, 1] - cy) * factor],
            axis=1,
        )
        low = v.min(axis=0)
        high = v.max(axis=0)
        span = np.maximum(high - low, 1e-8)
        q = np.rint((v - low) / span * 65535).astype("<u2")
        err = float(np.max(span) / 65535 / 2 / factor)
        maxerror = max(maxerror, err)
        inds = f.astype("<u2" if len(v) < 65536 else "<u4")
        pbytes = q.tobytes()
        ibytes = inds.tobytes()
        if len(buf) + len(pbytes) + len(ibytes) > 8_000_000:
            flush()
        while len(buf) % 4:
            buf.append(0)
        r["posOffset"] = len(buf)
        buf.extend(pbytes)
        while len(buf) % 4:
            buf.append(0)
        r["indexOffset"] = len(buf)
        buf.extend(ibytes)
        center = (low + high) / 2
        x, y, z = center
        region = (
            "head"
            if y > 143
            else (
                "legs"
                if y < 81
                else "arms" if abs(x) > 18 and y < 141 else "chest" if y > 112 else "abdomen"
            )
        )
        r.update(
            {
                "vertices": len(v),
                "indices": int(f.size),
                "indexBytes": inds.itemsize,
                "min": low.round(5).tolist(),
                "span": span.round(5).tolist(),
                "center": center.round(5).tolist(),
                "region": region,
                "side": "right" if x < -1.3 else "left" if x > 1.3 else "midline",
            }
        )
        current.append(r)
        totalfaces += len(f)
        system_counts[sys] += 1
    flush()
    print(sys, len(subset), "converted", flush=True)
manifest = {
    "version": "BodyParts3D 4.3",
    "source": "https://lifesciencedb.jp/bp3d/",
    "license": "CC BY 4.0 (official archive license updated 2025-02-27)",
    "total": len(records),
    "triangles": totalfaces,
    "maxQuantizationErrorMM": maxerror,
    "systems": [
        {"id": s, "name": n, "en": e, "color": c, "count": system_counts[s]}
        for s, n, e, c in CONFIG
        if system_counts[s]
    ],
    "chunks": allchunks,
    "structures": records,
}
conceptnames = {}
for filename in ["isa-parts.txt", "partof-parts.txt"]:
    for line in (BASE / "official" / filename).read_text().splitlines()[1:]:
        c = line.split("\t")
        if len(c) > 2:
            conceptnames[c[0]] = c[2]
for r in records:
    conceptnames[r["fma"]] = r["en"]
manifest["concepts"] = [
    {
        "id": fma,
        "en": conceptnames[fma],
        "name": cn_by_en.get(conceptnames[fma].lower(), ""),
        "ids": sorted(ids),
    }
    for fma, ids in groups.items()
    if fma in conceptnames and 1 < len(ids) < 1500
]
regionconcepts = {
    "head": ["FMA7154", "FMA7155"],
    "chest": ["FMA9576"],
    "abdomen": ["FMA9577", "FMA9578"],
    "arms": ["FMA7185", "FMA7186"],
    "legs": ["FMA7187", "FMA7188"],
}
for r in records:
    r["regions"] = [
        k
        for k, ids in regionconcepts.items()
        if r["region"] == k or any(r["id"] in groups.get(fma, set()) for fma in ids)
    ]
(OUT / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf8"
)
with (OUT / "structure-inventory.csv").open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(
        f,
        fieldnames=["id", "fma", "name", "en", "sys", "region", "side", "vertices", "sourceFaces"],
    )
    w.writeheader()
    w.writerows({k: r[k] for k in w.fieldnames} for r in records)
report = {
    "expected": len(expected),
    "actual": len(records),
    "missing": sorted(expected - {r["id"] for r in records}),
    "trianglesPreserved": totalfaces,
    "maxQuantizationErrorMM": maxerror,
    "systems": dict(system_counts),
    "archiveMB": sum(c["bytes"] for c in allchunks) / 1e6,
    "untranslated": sum(not r["name"] for r in records),
}
(OUT / "coverage.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8"
)
print(json.dumps(report), flush=True)
