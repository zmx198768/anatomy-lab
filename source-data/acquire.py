import csv, json, zipfile, io, time, requests, re
from pathlib import Path

BASE = Path(__file__).parent
out = BASE / "objs"
out.mkdir(exist_ok=True)
chunks = BASE / "chunks"
chunks.mkdir(exist_ok=True)
rows = list(csv.DictReader((BASE / "MANIFEST-4.3.csv").open()))
expected = set()
for line in (BASE / "official/FMA2Obj.txt").read_text().splitlines():
    if line.startswith("#"):
        continue
    c = line.split("\t")
    if len(c) > 2:
        expected.update(x for x in c[2].split("+") if x.startswith("FJ"))
assert expected == {r["fj_id"] for r in rows}
s = requests.Session()
s.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://lifesciencedb.jp/bp3d/?lng=en"})
s.get("https://lifesciencedb.jp/bp3d/?lng=en", timeout=30)
for start in range(0, len(rows), 100):
    batch = rows[start : start + 100]
    dst = chunks / f"{start:04}.zip"
    if not dst.exists() or not zipfile.is_zipfile(dst):
        for attempt in range(3):
            try:
                r = s.post(
                    "https://lifesciencedb.jp/bp3d/download.cgi",
                    data={
                        "ids": json.dumps([r["fj_id"] for r in batch]),
                        "rep_id": json.dumps(sorted({r["bp_id"] for r in batch})),
                        "type": "art_file",
                        "all_downloads": "1",
                        "filename": f"anatomy-{start}",
                    },
                    timeout=180,
                )
                r.raise_for_status()
                assert zipfile.is_zipfile(io.BytesIO(r.content))
                dst.write_bytes(r.content)
                break
            except Exception as e:
                print("retry", start, attempt, str(e), flush=True)
                time.sleep(2)
        else:
            raise RuntimeError("download failed " + str(start))
    with zipfile.ZipFile(dst) as z:
        for n in z.namelist():
            name = Path(n).name
            fj = name.split("_")[0]
            if fj in expected and name.endswith(".obj"):
                (out / (fj + ".obj")).write_bytes(z.read(n))
    print(
        "downloaded",
        min(start + 100, len(rows)),
        "/",
        len(rows),
        round(dst.stat().st_size / 1e6, 2),
        "MB",
        flush=True,
    )
    time.sleep(0.15)
have = {p.stem for p in out.glob("*.obj")}
assert expected == have, (len(expected - have), sorted(expected - have)[:20])
print("verified file coverage", len(have), flush=True)
