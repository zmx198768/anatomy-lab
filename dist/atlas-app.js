import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { getCatalog, loadAtlas, deformMeshes, regions } from './atlas-loader.js';
import { AtlasState } from './atlas-state.js';
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
let catalog,
  state,
  model,
  renderer,
  scene,
  camera,
  controls,
  selected,
  activeRoot,
  loaded = 0,
  failed = [],
  bodyTimer,
  dirty = true,
  viewName = 'front';
const body = { height: 175, weight: 70, age: 30, sex: 'male' },
  opacity = {},
  expanded = new Set(['bone']),
  regionExpanded = new Set(),
  clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
let cutaway = true,
  explode = 0,
  showLabels = true;
const focusLabel = document.createElement('button');
focusLabel.className = 'annotation';
focusLabel.hidden = true;
$('#annotations').appendChild(focusLabel);
function statusText(message) {
  $('#mesh-status').textContent = message;
}
function renderTree() {
  const container = $('#layers');
  container.innerHTML = catalog.systems
    .map((sys) => {
      const rows = catalog.structures.filter((r) => r.sys === sys.id && state.matches(r));
      if (!rows.length) return '';
      const st = state.status(sys.id);
      return `<details class="layer atlas-layer" data-tree="${sys.id}" ${expanded.has(sys.id) || state.query ? 'open' : ''} style="--color:${sys.color}"><summary class="layer-head"><span class="swatch"></span><span class="layer-name">${sys.name}<small>${st.selected} / ${st.total} 个独立组件</small></span><input class="switch" type="checkbox" data-system="${sys.id}" aria-label="显示${sys.name}的所有匹配结构" ${st.checked ? 'checked' : ''}><span class="chevron">⌄</span></summary><div class="atlas-children"><label class="opacity">不透明度<input type="range" min="5" max="100" value="${opacity[sys.id] * 100}" data-opacity="${sys.id}" aria-label="${sys.name}不透明度"></label>${Object.entries(
        regions,
      )
        .map(([key, name]) => {
          const members = rows.filter((r) => r.region === key);
          if (!members.length) return '';
          const rk = sys.id + '-' + key;
          return `<details class="region-tree" data-region-tree="${rk}" ${regionExpanded.has(rk) || state.query ? 'open' : ''}><summary>${name}<small>${members.length}</small></summary><div class="structure-list">${members.map((r) => `<div class="structure-row ${selected === r.id ? 'selected' : ''}" data-row="${r.id}"><input type="checkbox" data-part="${r.id}" aria-label="显示 ${esc(r.name || r.en)} ${r.id}" ${state.enabled.has(r.id) ? 'checked' : ''}><button data-pick="${r.id}" title="${esc(r.en)}"><span>${esc(r.name || r.en)}</span><small>${r.id} · ${r.side === 'left' ? '左' : r.side === 'right' ? '右' : '中线'}${model?.byId.has(r.id) ? '' : ' · 载入中'}</small></button></div>`).join('')}</div></details>`;
        })
        .join('')}</div></details>`;
    })
    .join('');
  if (!container.children.length)
    container.innerHTML = '<p class="empty-state">没有匹配结构。可清除搜索或更换身体部位。</p>';
  $$('[data-tree]').forEach(
    (d) =>
      (d.ontoggle = () =>
        d.open ? expanded.add(d.dataset.tree) : expanded.delete(d.dataset.tree)),
  );
  $$('[data-region-tree]').forEach(
    (d) =>
      (d.ontoggle = () =>
        d.open
          ? regionExpanded.add(d.dataset.regionTree)
          : regionExpanded.delete(d.dataset.regionTree)),
  );
  $$('[data-system]').forEach((e) => {
    e.indeterminate = state.status(e.dataset.system).indeterminate;
    e.onclick = (event) => event.stopPropagation();
    e.onchange = () => {
      state.setSystem(e.dataset.system, e.checked);
      renderTree();
      updateVisibility();
    };
  });
  $$('[data-part]').forEach(
    (e) =>
      (e.onchange = () => {
        state.setOne(e.dataset.part, e.checked);
        updateTreeChecks();
        updateVisibility();
      }),
  );
  $$('[data-pick]').forEach((e) => (e.onclick = () => selectRecord(e.dataset.pick, true)));
  $$('[data-opacity]').forEach(
    (e) =>
      (e.oninput = () => {
        opacity[e.dataset.opacity] = +e.value / 100;
        updateVisibility();
      }),
  );
  $('#layer-count').textContent = catalog.structures.filter((r) => state.matches(r)).length + ' 项';
}
function updateTreeChecks() {
  for (const e of $$('[data-part]')) e.checked = state.enabled.has(e.dataset.part);
  for (const e of $$('[data-system]')) {
    const st = state.status(e.dataset.system);
    e.checked = st.checked;
    e.indeterminate = st.indeterminate;
    e.closest('summary').querySelector('small').textContent =
      st.selected + ' / ' + st.total + ' 个独立组件';
  }
}
function updateVisibility() {
  if (!model) return;
  let visible = 0;
  for (const m of model.meshes) {
    const d = m.userData;
    m.visible = state.isVisible(d.id);
    if (m.visible) visible++;
    m.material.opacity = opacity[d.sys];
    m.material.transparent = opacity[d.sys] < 1;
    m.material.depthWrite = opacity[d.sys] > 0.5;
    const shouldClip = cutaway && !state.isolated && ['muscle', 'skin'].includes(d.sys);
    const changed = !!m.material.clippingPlanes?.length !== shouldClip;
    m.material.clippingPlanes = shouldClip ? [clip] : [];
    if (changed) m.material.needsUpdate = true;
    m.material.emissive.set(d.id === selected ? '#544321' : '#000000');
    const t = explode / 100,
      offset = catalog.systems.findIndex((s) => s.id === d.sys) * 2.8;
    const base = d.baseCenter;
    m.position.set(Math.sign(base.x) * offset * t, 0, offset * t * 0.65);
  }
  $('#unfocus').hidden = !state.isolated;
  $('#isolate').hidden = !selected;
  for (const id of ['hide-selected', 'focus-selected', 'select-context'])
    $('#' + id).hidden = !selected;
  if (!selected) {
    $('#related-groups').hidden = true;
    $('#detail-name').textContent = '探索每个独立结构';
    $('#detail-en').textContent = 'SELECT A STRUCTURE';
    $('#detail-text').textContent = '点击模型或列表中的条目，查看其名称、编号和组成关系。';
    $('#detail-meta').textContent = '';
  }
  $('#loaded-count').textContent = loaded + ' / ' + catalog.total;
  statusText(
    failed.length
      ? `有 ${failed.length} 个模型批次未载入，点击重试`
      : `${visible} 个可见 / ${loaded} 个已加载 / ${catalog.total} 个总结构`,
  );
  $('#retry-load').hidden = !failed.length;
  dirty = true;
}
function applyBody() {
  clearTimeout(bodyTimer);
  for (const key of ['height', 'weight', 'age']) {
    $('#' + key + '-num').value = body[key];
    $('#' + key + '-range').value = body[key];
  }
  $$('[data-sex]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sex === body.sex);
    b.setAttribute('aria-pressed', String(b.dataset.sex === body.sex));
  });
  $('#bmi').textContent = (body.weight / (body.height / 100) ** 2).toFixed(1);
  $('#body-summary').textContent =
    `${body.sex === 'male' ? '男性参考' : '女性体型模拟'} · ${body.height} cm · ${body.weight} kg · ${body.age} 岁`;
  $('#height-label').textContent = body.height + ' cm';
  $('#female-note').hidden = body.sex !== 'female';
  if (model) {
    deformMeshes(model.meshes, body);
    updateVisibility();
  }
}
function setBody(values) {
  Object.assign(body, values);
  applyBody();
}
function setView(view = 'front') {
  viewName = view;
  const y = body.height * 0.51;
  controls.target.set(0, y, 0);
  camera.position.set(
    view === 'side' ? 275 : 0,
    y,
    view === 'front' ? 275 : view === 'back' ? -275 : 0,
  );
  controls.autoRotate = false;
  $('#rotate').classList.remove('active');
  $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  controls.update();
  dirty = true;
}
function zoom(f) {
  const v = camera.position.clone().sub(controls.target).multiplyScalar(f).clampLength(1, 650);
  camera.position.copy(controls.target).add(v);
  controls.update();
  dirty = true;
}
function syncMode() {
  $('#cutaway').classList.toggle('active', cutaway);
  $('#complete').classList.toggle('active', !cutaway);
  $('#cutaway').setAttribute('aria-pressed', String(cutaway));
  $('#complete').setAttribute('aria-pressed', String(!cutaway));
}
function focusMeshes(ids) {
  if (!model) return;
  const box = new THREE.Box3();
  ids.forEach((id) => {
    const m = model.byId.get(id);
    if (m) box.union(m.geometry.boundingBox.clone().translate(m.position));
  });
  if (box.isEmpty()) return;
  const target = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3());
  const distance = Math.max(3, Math.max(size.y, size.x / camera.aspect, size.z) * 1.7);
  const direction = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.near = Math.max(0.02, distance / 1000);
  camera.updateProjectionMatrix();
  controls.update();
  dirty = true;
}
function selectRecord(id, fromList = false) {
  if (!state.records.has(id)) return;
  selected = id;
  const r = state.records.get(id),
    sys = catalog.systems.find((s) => s.id === r.sys);
  $('#detail-name').textContent = r.name || r.en;
  $('#detail-en').textContent = r.en;
  $('#detail-dot').style.background = sys.color;
  $('#detail-text').textContent =
    `${sys.name}中的独立模型。${r.name ? '中文名称供检索；' : '当前保留数据源英文名称；'}英文名称和编号可用于逐项核对。`;
  $('#detail-meta').innerHTML =
    `<div>模型编号 <b>${esc(r.id)}</b></div><div>解剖概念 <b>${esc(r.fma)}</b></div><div>三角面 <b>${r.sourceFaces.toLocaleString()}</b></div><div>所在部位 <b>${r.regions.map((k) => regions[k]).join('、')}</b></div><div>载入状态 <b>${model?.byId.has(id) ? '已载入' : '等待载入'}</b></div>`;
  const parentGroups = catalog.concepts
    .filter((c) => c.ids.includes(id))
    .sort((a, b) => a.ids.length - b.ids.length)
    .slice(0, 10);
  $('#related-groups').innerHTML =
    '<option value="">查看所属组合的全部组成</option>' +
    parentGroups
      .map((c) => `<option value="${c.id}">${esc(c.name || c.en)} · ${c.ids.length} 项</option>`)
      .join('');
  $('#related-groups').hidden = !parentGroups.length;
  $('#hide-selected').hidden = false;
  $('#isolate').hidden = false;
  $('#focus-selected').hidden = false;
  $('#select-context').hidden = false;
  if (fromList) {
    state.setOne(id, true);
    if (!state.inScope(r)) {
      state.region = 'all';
      state.side = 'all';
      state.concept = null;
      syncScopes();
    }
    focusMeshes([id]);
    updateTreeChecks();
  }
  $$('[data-row]').forEach((e) => e.classList.toggle('selected', e.dataset.row === id));
  focusLabel.textContent = r.name || r.en;
  updateVisibility();
}
function syncScopes() {
  $('#region').value = state.region;
  $('#side').value = state.side;
  $('#concept').value = state.concept?.id || '';
  $('#search').value = state.query;
}
function showConcept(id) {
  const concept = catalog.concepts.find((c) => c.id === id);
  if (!concept) return;
  state.concept = concept;
  state.region = 'all';
  state.side = 'all';
  state.query = '';
  state.showScope();
  state.isolated = null;
  cutaway = false;
  syncMode();
  syncScopes();
  renderTree();
  updateVisibility();
  focusMeshes(concept.ids);
  $('#scope-note').textContent =
    `官方组成关系：${concept.name || concept.en}，${concept.ids.length} 个模型。`;
}
function initUI() {
  $('#layers').insertAdjacentHTML(
    'beforebegin',
    '<label class="search-box"><span>⌕</span><input id="search" type="search" placeholder="搜索名称 / FJ 编号 / FMA" aria-label="搜索所有独立解剖结构"></label><div class="scope-note" id="scope-note">每一项对应一个独立模型，可逐个选取。</div>',
  );
  $('#region-controls').insertAdjacentHTML(
    'beforeend',
    '<label for="side">侧别</label><select id="side"><option value="all">左右两侧</option><option value="left">左侧</option><option value="right">右侧</option><option value="midline">中线</option></select><label for="concept">官方组合结构</label><select id="concept"><option value="">按身体区域查看</option></select>',
  );
  const curated = [
    'FMA7088',
    'FMA9713',
    'FMA9714',
    'FMA11343',
    'FMA11344',
    'FMA7185',
    'FMA7186',
    'FMA7187',
    'FMA7188',
    'FMA7154',
    'FMA7155',
  ];
  const names = {
    FMA7088: '心脏',
    FMA9713: '右手',
    FMA9714: '左手',
    FMA11343: '右足',
    FMA11344: '左足',
    FMA7185: '右上肢',
    FMA7186: '左上肢',
    FMA7187: '右下肢',
    FMA7188: '左下肢',
    FMA7154: '头部',
    FMA7155: '颈部',
  };
  $('#concept').innerHTML += curated
    .map((id) => {
      const c = catalog.concepts.find((c) => c.id === id);
      return c ? `<option value="${id}">${names[id]} · ${c.ids.length} 项</option>` : '';
    })
    .join('');
  $('#search').oninput = (e) => {
    state.query = e.target.value;
    renderTree();
  };
  $('#region').onchange = (e) => {
    state.region = e.target.value;
    state.concept = null;
    state.isolated = null;
    $('#concept').value = '';
    renderTree();
    updateVisibility();
    $('#scope-note').textContent = '区域按空间位置与官方组成关系归集；跨区结构可属于多个区域。';
  };
  $('#side').onchange = (e) => {
    state.side = e.target.value;
    state.isolated = null;
    renderTree();
    updateVisibility();
  };
  $('#concept').onchange = (e) => {
    if (e.target.value) showConcept(e.target.value);
    else {
      state.concept = null;
      renderTree();
      updateVisibility();
    }
  };
  $('#system-tab').onclick = () => {
    state.region = 'all';
    state.side = 'all';
    state.concept = null;
    state.isolated = null;
    $('#region-controls').hidden = true;
    $('#system-tab').classList.add('active');
    $('#region-tab').classList.remove('active');
    syncScopes();
    renderTree();
    updateVisibility();
  };
  $('#region-tab').onclick = () => {
    $('#region-controls').hidden = false;
    $('#region-tab').classList.add('active');
    $('#system-tab').classList.remove('active');
  };
  $('#show-all').onclick = () => {
    state.showScope();
    cutaway = false;
    syncMode();
    renderTree();
    updateVisibility();
  };
  $('#region-all').onclick = () => {
    state.showScope();
    cutaway = false;
    syncMode();
    renderTree();
    updateVisibility();
  };
  $('#reset-layers').onclick = () => {
    state.reset();
    selected = null;
    explode = 0;
    cutaway = true;
    $('#explode').value = 0;
    $('#explode-value').value = '0%';
    syncScopes();
    syncMode();
    renderTree();
    updateVisibility();
    setView('front');
  };
  const params = [
    ['height', '身高', 'cm', 120, 210],
    ['weight', '体重', 'kg', 30, 150],
    ['age', '年龄', '岁', 18, 90],
  ];
  $('#parameters').innerHTML = params
    .map(
      ([id, name, unit, min, max]) =>
        `<div class="param"><div class="param-head"><label for="${id}-num">${name}</label><div class="number-wrap"><input id="${id}-num" type="number" min="${min}" max="${max}" value="${body[id]}" data-number="${id}"><span>${unit}</span></div></div><input type="range" aria-label="${name}" id="${id}-range" min="${min}" max="${max}" value="${body[id]}" data-param="${id}"><div class="endpoints"><span>${min} ${unit}</span><span>${max} ${unit}</span></div></div>`,
    )
    .join('');
  $$('[data-param]').forEach((e) => {
    e.oninput = () => {
      body[e.dataset.param] = +e.value;
      $('#' + e.dataset.param + '-num').value = e.value;
      clearTimeout(bodyTimer);
      bodyTimer = setTimeout(applyBody, 180);
    };
    e.onchange = applyBody;
  });
  $$('[data-number]').forEach(
    (e) =>
      (e.onchange = () => {
        const v = e.valueAsNumber;
        setBody({
          [e.dataset.number]: Number.isFinite(v)
            ? Math.max(+e.min, Math.min(+e.max, v))
            : body[e.dataset.number],
        });
      }),
  );
  $$('[data-sex]').forEach((e) => (e.onclick = () => setBody({ sex: e.dataset.sex })));
  $('#reset-body').onclick = () => setBody({ height: 175, weight: 70, age: 30, sex: 'male' });
  $('#cutaway').onclick = () => {
    cutaway = true;
    syncMode();
    updateVisibility();
  };
  $('#complete').onclick = () => {
    cutaway = false;
    syncMode();
    updateVisibility();
  };
  $('#explode').oninput = (e) => {
    explode = +e.target.value;
    $('#explode-value').value = explode + '%';
    updateVisibility();
  };
  $('#labels').onchange = (e) => {
    showLabels = e.target.checked;
    dirty = true;
  };
  $('#rotate').onclick = () => {
    controls.autoRotate = !controls.autoRotate;
    $('#rotate').classList.toggle('active', controls.autoRotate);
  };
  $('#zoom-in').onclick = () => zoom(0.8);
  $('#zoom-out').onclick = () => zoom(1.25);
  $('#reset-view').onclick = () => setView('front');
  $$('[data-view]').forEach((e) => (e.onclick = () => setView(e.dataset.view)));
  $('#isolate').onclick = () => {
    if (!selected) return;
    state.isolate([selected]);
    cutaway = false;
    syncMode();
    updateVisibility();
    focusMeshes([selected]);
  };
  $('#unfocus').onclick = () => {
    state.isolated = null;
    updateVisibility();
    setView('front');
  };
  $('#detail-meta').insertAdjacentHTML(
    'afterend',
    '<select id="related-groups" hidden></select><button id="focus-selected" class="outline full" hidden>定位并放大</button><button id="hide-selected" class="text-button full" hidden>隐藏这个结构</button><button id="select-context" class="text-button full" hidden>显示所在区域的全部结构</button>',
  );
  $('#related-groups').onchange = (e) => showConcept(e.target.value);
  $('#focus-selected').onclick = () => focusMeshes([selected]);
  $('#hide-selected').onclick = () => {
    state.setOne(selected, false);
    updateTreeChecks();
    updateVisibility();
  };
  $('#select-context').onclick = () => {
    state.concept = null;
    state.region = state.records.get(selected).region;
    state.side = 'all';
    state.query = '';
    state.showScope();
    cutaway = false;
    syncScopes();
    syncMode();
    renderTree();
    updateVisibility();
    focusMeshes(catalog.structures.filter((r) => state.inScope(r)).map((r) => r.id));
  };
  $('#retry-load').onclick = () => location.reload();
  renderTree();
  applyBody();
  syncMode();
}
function initRenderer() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(43, 1, 0.05, 2000);
  camera.position.set(0, 89, 275);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  $('#scene').appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    '真实分体人体解剖模型，拖动旋转，点击选取独立结构',
  );
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 89, 0);
  controls.enableDamping = true;
  controls.minDistance = 0.8;
  controls.maxDistance = 700;
  controls.autoRotateSpeed = 0.45;
  controls.addEventListener('change', () => (dirty = true));
  scene.add(new THREE.HemisphereLight('#e5e9e9', '#526075', 2));
  const key = new THREE.DirectionalLight('#fff0df', 2.7);
  key.position.set(-70, 160, 110);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#b8d8f4', 1.7);
  rim.position.set(70, 130, -60);
  scene.add(rim);
  const grid = new THREE.GridHelper(140, 14, '#475e69', '#283b45');
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  scene.add(grid);
  const resize = () => {
    const box = $('#scene');
    camera.aspect = box.clientWidth / box.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(box.clientWidth, box.clientHeight);
    dirty = true;
  };
  new ResizeObserver(resize).observe($('#scene'));
  resize();
  let down;
  renderer.domElement.onpointerdown = (e) => (down = [e.clientX, e.clientY]);
  renderer.domElement.onpointerup = (e) => {
    if (!model || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const b = renderer.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        (-(e.clientY - b.top) / b.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray
      .intersectObjects(model.meshes.filter((m) => m.visible && m.material.opacity > 0.2))
      .find((h) => !h.object.material.clippingPlanes?.length || clip.distanceToPoint(h.point) >= 0);
    if (hit) selectRecord(hit.object.userData.id);
  };
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    statusText('图形资源已中断，请刷新后减少同时显示的系统。');
  });
  let last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    controls.update();
    if (!dirty && !controls.autoRotate) return;
    if (t - last < 30) return;
    last = t;
    renderer.render(scene, camera);
    dirty = false;
    const m = model?.byId.get(selected);
    focusLabel.hidden = !showLabels || !m?.visible;
    if (!focusLabel.hidden) {
      const p = m.geometry.boundingSphere.center.clone().add(m.position).project(camera);
      focusLabel.hidden = Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9 || p.z > 1;
      if (!focusLabel.hidden) {
        focusLabel.style.left = (p.x * 0.5 + 0.5) * $('#scene').clientWidth + 12 + 'px';
        focusLabel.style.top =
          (-p.y * 0.5 + 0.5) * $('#scene').clientHeight + $('#scene').offsetTop + 'px';
      }
    }
  }
  requestAnimationFrame(frame);
}
function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tools = [
    {
      name: 'set_anatomy_structures',
      description: '按真实模型编号批量显示、隐藏或单独查看解剖结构。',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          action: { enum: ['show', 'hide', 'isolate'] },
        },
        required: ['ids', 'action'],
        additionalProperties: false,
      },
      execute(input) {
        if (
          !input ||
          !Array.isArray(input.ids) ||
          !input.ids.length ||
          input.ids.some((id) => !state.records.has(id)) ||
          !['show', 'hide', 'isolate'].includes(input.action)
        )
          throw Error('结构编号或操作无效');
        if (input.action === 'isolate') state.isolate(input.ids);
        else input.ids.forEach((id) => state.setOne(id, input.action === 'show'));
        renderTree();
        updateVisibility();
        return {
          ids: input.ids,
          action: input.action,
          loaded: input.ids.filter((id) => model?.byId.has(id)),
        };
      },
    },
    {
      name: 'search_anatomy_structures',
      description: '按中文、英文或编号检索实际收录的解剖结构。',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      execute(input) {
        if (typeof input?.query !== 'string') throw Error('需要搜索词');
        const q = input.query.toLowerCase();
        const found = catalog.structures.filter((r) =>
          `${r.name} ${r.en} ${r.id} ${r.fma}`.toLowerCase().includes(q),
        );
        return {
          total: found.length,
          structures: found
            .slice(0, 50)
            .map((r) => ({ id: r.id, name: r.name, en: r.en, fma: r.fma })),
        };
      },
    },
  ];
  for (const t of tools)
    try {
      Promise.resolve(context.registerTool(t, { signal: lifecycle.signal })).catch(console.warn);
    } catch (e) {
      console.warn(e);
    }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
async function boot() {
  try {
    catalog = await getCatalog();
    state = new AtlasState(catalog);
    for (const s of catalog.systems) opacity[s.id] = s.id === 'skin' ? 0.15 : 1;
    initRenderer();
    initUI();
    registerTools();
    $('#dataset-name').textContent = catalog.version;
    $('#loading').innerHTML =
      '<strong>正在载入真实解剖模型</strong><span id="load-progress">0 / ' +
      catalog.total +
      '</span>';
    model = await loadAtlas(
      catalog,
      (partial, added) => {
        model = partial;
        if (!activeRoot) {
          activeRoot = partial.root;
          scene.add(activeRoot);
        }
        if (body.height !== 175 || body.weight !== 70 || body.age !== 30 || body.sex !== 'male')
          deformMeshes(added, body);
        updateVisibility();
      },
      (done, total, errors) => {
        loaded = done;
        failed = errors;
        $('#load-progress').textContent = done + ' / ' + total;
        $('#loading').classList.toggle('compact-loading', done > 0);
        updateVisibility();
      },
    );
    failed = model.failures;
    $('#loading').hidden = !failed.length;
    if (failed.length) $('#loading').textContent = `${failed.length} 个批次加载失败，可点击重试。`;
    renderTree();
    updateVisibility();
  } catch (e) {
    console.error(e);
    $('#loading').textContent = '模型加载失败：' + e.message;
    $('#retry-load').hidden = false;
    $('#retry-load').onclick = () => location.reload();
    statusText('模型尚未完整载入');
  }
}
boot();
