export class AtlasState {
  constructor(catalog) {
    this.catalog = catalog;
    this.records = new Map(catalog.structures.map((r) => [r.id, r]));
    this.enabled = new Set();
    this.region = 'all';
    this.side = 'all';
    this.query = '';
    this.isolated = null;
    this.concept = null;
    this.reset();
  }
  reset() {
    this.enabled = new Set(
      this.catalog.structures
        .filter((r) => !['skin', 'nerve', 'connective'].includes(r.sys))
        .map((r) => r.id),
    );
    this.region = 'all';
    this.side = 'all';
    this.query = '';
    this.isolated = null;
    this.concept = null;
  }
  inScope(r) {
    return (
      (this.region === 'all' || r.regions.includes(this.region)) &&
      (this.side === 'all' || r.side === this.side) &&
      (!this.concept || this.concept.ids.includes(r.id))
    );
  }
  matches(r) {
    const q = this.query.trim().toLowerCase();
    return (
      this.inScope(r) && (!q || `${r.name} ${r.en} ${r.id} ${r.fma}`.toLowerCase().includes(q))
    );
  }
  isVisible(id) {
    const r = this.records.get(id);
    if (!r) return false;
    return this.isolated ? this.isolated.has(id) : this.enabled.has(id) && this.inScope(r);
  }
  setOne(id, on) {
    if (!this.records.has(id)) throw Error('Unknown structure');
    this.isolated = null;
    on ? this.enabled.add(id) : this.enabled.delete(id);
  }
  setSystem(sys, on) {
    if (!this.catalog.systems.some((s) => s.id === sys)) throw Error('Unknown system');
    this.isolated = null;
    for (const r of this.catalog.structures)
      if (r.sys === sys && this.matches(r)) on ? this.enabled.add(r.id) : this.enabled.delete(r.id);
  }
  showScope(on = true) {
    this.isolated = null;
    for (const r of this.catalog.structures)
      if (this.inScope(r)) on ? this.enabled.add(r.id) : this.enabled.delete(r.id);
  }
  isolate(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => !this.records.has(id)))
      throw Error('Invalid structure IDs');
    this.isolated = new Set(ids);
  }
  status(sys) {
    const rr = this.catalog.structures.filter((r) => r.sys === sys && this.matches(r));
    const selected = rr.filter((r) => this.enabled.has(r.id)).length;
    return {
      total: rr.length,
      selected,
      checked: rr.length > 0 && selected === rr.length,
      indeterminate: selected > 0 && selected < rr.length,
    };
  }
}
