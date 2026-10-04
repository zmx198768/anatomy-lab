import * as THREE from 'three';
export const regions = {
  head: '头颈部',
  chest: '胸部',
  abdomen: '腹盆部',
  arms: '上肢',
  legs: '下肢',
};
export async function getCatalog() {
  const r = await fetch('./atlas/manifest.json');
  if (!r.ok) throw Error('结构清单读取失败');
  return r.json();
}
export async function loadAtlas(catalog, onChunk, onProgress) {
  const root = new THREE.Group(),
    meshes = [],
    byId = new Map(),
    byMeta = new Map(catalog.structures.map((r) => [r.id, r]));
  const materials = Object.fromEntries(
    catalog.systems.map((s) => [
      s.id,
      new THREE.MeshStandardMaterial({
        color: s.color,
        roughness: 0.64,
        metalness: 0.01,
        side: THREE.DoubleSide,
      }),
    ]),
  );
  const priority = { bone: 0, muscle: 1, artery: 2, vein: 3 };
  const queue = [...catalog.chunks].sort(
    (a, b) => (priority[a.system] ?? 4) - (priority[b.system] ?? 4),
  );
  // Small compressed batches retain all original triangles and allow progressive loading.
  let done = 0;
  const failures = [];
  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      try {
        let buffer;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await fetch('./atlas/' + c.file);
            if (!r.ok) throw Error('模型请求失败');
            const compressed = await r.arrayBuffer();
            if (compressed.byteLength !== c.bytes) throw Error('模型文件长度不符');
            if (!('DecompressionStream' in window))
              throw Error('浏览器不支持模型解压，请使用新版浏览器');
            buffer = await new Response(
              new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
            ).arrayBuffer();
            if (buffer.byteLength !== c.rawBytes) throw Error('模型解压长度不符');
            break;
          } catch (e) {
            if (attempt === 2) throw e;
          }
        }
        const added = [];
        for (const id of c.ids) {
          const d = byMeta.get(id),
            q = new Uint16Array(buffer, d.posOffset, d.vertices * 3),
            a = new Float32Array(q.length);
          for (let i = 0; i < a.length; i++) a[i] = d.min[i % 3] + (q[i] / 65535) * d.span[i % 3];
          const Index = d.indexBytes === 2 ? Uint16Array : Uint32Array;
          const indices = new Index(buffer, d.indexOffset, d.indices).slice();
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(a, 3));
          g.setIndex(new THREE.BufferAttribute(indices, 1));
          g.computeVertexNormals();
          g.computeBoundingSphere();
          g.computeBoundingBox();
          const m = new THREE.Mesh(g, materials[d.sys].clone());
          m.userData = { ...d, original: a.slice(), baseCenter: new THREE.Vector3(...d.center) };
          root.add(m);
          meshes.push(m);
          byId.set(id, m);
          added.push(m);
        }
        done += added.length;
        onChunk({ root, meshes, byId }, added);
        onProgress(done, catalog.total, failures);
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch (e) {
        failures.push({ file: c.file, ids: c.ids, message: e.message });
        onProgress(done, catalog.total, failures);
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return { root, meshes, byId, failures };
}
export function deformMeshes(meshes, { height, weight, age, sex }) {
  const h = height / 175,
    bmi = weight / (height / 100) ** 2,
    bulk = THREE.MathUtils.clamp(1 + (bmi - 70 / 1.75 ** 2) * 0.013, 0.82, 1.38),
    female = sex === 'female',
    older = Math.max(0, age - 50) / 40;
  for (const m of meshes) {
    const a = m.geometry.attributes.position.array,
      o = m.userData.original;
    const rigid = m.userData.sys === 'bone';
    for (let i = 0; i < a.length; i += 3) {
      let x = o[i],
        y = o[i + 1],
        z = o[i + 2];
      const torso = Math.exp(-(((y - 129) / 18) ** 2)),
        hip = Math.exp(-(((y - 89) / 15) ** 2));
      const sexWidth = female ? 1 - 0.085 * torso + 0.12 * hip : 1;
      const w =
        sexWidth *
        (1 + (bulk - 1) * (rigid ? 0.2 : 1)) *
        (m.userData.sys === 'muscle' ? 1 - older * 0.045 : 1);
      a[i] = x * w * h;
      a[i + 1] = y * h;
      a[i + 2] = (z * (1 + (bulk - 1) * 1.1) + older * Math.max(0, y - 93) * 0.045) * h;
    }
    m.geometry.attributes.position.needsUpdate = true;
    m.geometry.computeBoundingSphere();
    m.geometry.computeBoundingBox();
  }
}
