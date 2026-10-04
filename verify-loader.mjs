import fs from 'node:fs';
import assert from 'node:assert/strict';
const originalFetch = globalThis.fetch;
globalThis.window = globalThis;
globalThis.fetch = async (url) => {
  const p = new URL(String(url).replace('./', './dist/'), import.meta.url);
  return new Response(fs.readFileSync(p));
};
const source = fs
  .readFileSync(new URL('./dist/atlas-loader.js', import.meta.url), 'utf8')
  .replace(
    "from 'three'",
    `from '${new URL('./dist/vendor/three.module.js', import.meta.url).href}'`,
  );
const { getCatalog, loadAtlas, deformMeshes } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
const c = await getCatalog();
let progress = 0;
const m = await loadAtlas(
  c,
  () => {},
  (done) => (progress = done),
);
assert.equal(m.failures.length, 0);
assert.equal(m.byId.size, 3210);
assert.equal(progress, 3210);
for (const mesh of m.meshes) {
  assert(Number.isFinite(mesh.geometry.boundingSphere.radius));
  assert(mesh.geometry.attributes.normal.array.every(Number.isFinite));
}
const sample = m.meshes.filter((m, i) => i % 40 === 0);
deformMeshes(sample, { height: 210, weight: 150, age: 90, sex: 'female' });
for (const mesh of sample) assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
deformMeshes(sample, { height: 175, weight: 70, age: 30, sex: 'male' });
for (const mesh of sample) {
  const a = mesh.geometry.attributes.position.array,
    o = mesh.userData.original;
  for (let i = 0; i < a.length; i++) assert(Math.abs(a[i] - o[i]) < 0.001);
}
console.log(
  JSON.stringify({
    loaded: m.byId.size,
    failures: m.failures.length,
    normals: 'finite',
    parameterExtremes: 'finite',
    reset: 'within 0.001 model units',
  }),
);
globalThis.fetch = originalFetch;
