import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { AtlasState } from './dist/atlas-state.js';
const catalog = JSON.parse(
  fs.readFileSync(new URL('./dist/atlas/manifest.json', import.meta.url), 'utf8'),
);
const state = new AtlasState(catalog),
  seen = new Set();
let triangles = 0;
for (const chunk of catalog.chunks) {
  const compressed = fs.readFileSync(new URL('./dist/atlas/' + chunk.file, import.meta.url));
  assert.equal(crypto.createHash('sha256').update(compressed).digest('hex'), chunk.sha256);
  const data = zlib.gunzipSync(compressed);
  assert.equal(data.length, chunk.rawBytes);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  for (const id of chunk.ids) {
    assert(!seen.has(id));
    seen.add(id);
    const r = state.records.get(id);
    assert(r);
    assert(r.regions.length);
    const pos = new Uint16Array(buffer, r.posOffset, r.vertices * 3);
    const Index = r.indexBytes === 2 ? Uint16Array : Uint32Array;
    const indices = new Index(buffer, r.indexOffset, r.indices);
    assert.equal(r.indices / 3, r.sourceFaces);
    for (const i of indices) assert(i < r.vertices);
    for (let i = 0; i < pos.length; i++)
      assert(Number.isFinite(r.min[i % 3] + (pos[i] / 65535) * r.span[i % 3]));
    triangles += r.sourceFaces;
  }
}
assert.equal(seen.size, 3210);
assert.equal(triangles, 8647172);
assert.equal(catalog.total, seen.size);
for (const concept of catalog.concepts) for (const id of concept.ids) assert(seen.has(id));
// A switch must affect exactly one mesh, including two pieces of the same anatomy concept.
const first = catalog.structures[0].id,
  second = catalog.structures[1].id;
state.showScope();
state.setOne(first, false);
assert(!state.isVisible(first));
assert(state.isVisible(second));
assert.equal([...state.records.keys()].filter((id) => state.isVisible(id)).length, 3209);
state.isolate([first]);
assert(state.isVisible(first));
assert.equal([...state.records.keys()].filter((id) => state.isVisible(id)).length, 1);
state.isolated = null;
assert(!state.isVisible(first));
assert(state.isVisible(second));
state.region = 'arms';
state.showScope(false);
for (const r of catalog.structures)
  if (r.regions.includes('arms')) assert(!state.enabled.has(r.id));
state.showScope();
for (const r of catalog.structures) if (r.regions.includes('arms')) assert(state.isVisible(r.id));
state.region = 'all';
state.setSystem('artery', false);
assert(!catalog.structures.filter((r) => r.sys === 'artery').some((r) => state.isVisible(r.id)));
state.setSystem('artery', true);
assert(catalog.structures.filter((r) => r.sys === 'artery').every((r) => state.isVisible(r.id)));
state.query = 'FJ1245';
assert.equal(catalog.structures.filter((r) => state.matches(r)).length, 1);
state.query = '';
state.concept = catalog.concepts.find((c) => c.id === 'FMA7088');
assert(state.concept);
state.showScope();
assert.equal(
  catalog.structures.filter((r) => state.isVisible(r.id)).length,
  state.concept.ids.length,
);
const before = state.enabled.size;
assert.throws(() => state.setOne('UNKNOWN', true));
assert.throws(() => state.isolate(['UNKNOWN']));
assert.equal(state.enabled.size, before);
state.reset();
assert.equal(state.region, 'all');
assert.equal(state.isolated, null);
assert.equal(state.concept, null);
for (const f of [
  'index.html',
  'atlas-app.js',
  'atlas-loader.js',
  'atlas-state.js',
  'style.css',
  'credits.html',
  'vendor/three.module.js',
  'vendor/OrbitControls.js',
])
  assert(fs.existsSync(new URL('./dist/' + f, import.meta.url)));
console.log(
  JSON.stringify(
    {
      structures: seen.size,
      triangles,
      conceptGroups: catalog.concepts.length,
      missing: 0,
      checks: [
        'unique geometry per ID',
        'all original triangle counts preserved',
        'all indices in bounds',
        'gzip checksums',
        'individual toggle',
        'single mesh isolation',
        'regional show-all',
        'artery system toggle',
        'ID search',
        'official heart composition',
        'invalid IDs do not mutate state',
        'reset',
      ],
      webMCP: 'Not exercised by Node.js checks; requires a supported browser host',
    },
    null,
    2,
  ),
);
