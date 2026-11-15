const copy = (value) => JSON.parse(JSON.stringify(value));

/** Small in-memory Supabase surface for isolated portfolio previews. */
export function createMockSupabase(seed, demoUser) {
  const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, copy(rows)]));
  let authListener = () => {};
  const session = { access_token: 'portfolio-demo', user: demoUser };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.sorts = [];
      this.operation = 'select';
      this.payload = null;
      this.one = false;
      this.head = false;
      this.countMode = false;
      this.offset = 0;
      this.limitValue = null;
    }
    select(_columns, options = {}) { this.head = Boolean(options.head); this.countMode = Boolean(options.count); return this; }
    eq(key, value) { this.filters.push((row) => value === null || value === undefined ? row[key] === null || row[key] === undefined : String(row[key]) === String(value)); return this; }
    neq(key, value) { this.filters.push((row) => value === null || value === undefined ? row[key] !== null && row[key] !== undefined : String(row[key]) !== String(value)); return this; }
    is(key, value) { this.filters.push((row) => row[key] === value); return this; }
    in(key, values) { this.filters.push((row) => values.some((value) => String(value) === String(row[key]))); return this; }
    gt(key, value) { this.filters.push((row) => row[key] > value); return this; }
    gte(key, value) { this.filters.push((row) => row[key] >= value); return this; }
    lt(key, value) { this.filters.push((row) => row[key] < value); return this; }
    lte(key, value) { this.filters.push((row) => row[key] <= value); return this; }
    filter(key, operator, value) { return typeof this[operator] === 'function' ? this[operator](key, value) : this; }
    contains(key, value) { this.filters.push((row) => Array.isArray(row[key]) && value.every((item) => row[key].includes(item))); return this; }
    order(key, options = {}) { this.sorts.push([key, options.ascending !== false]); return this; }
    limit(value) { this.limitValue = value; return this; }
    range(from, to) { this.offset = from; this.limitValue = to - from + 1; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
    upsert(payload) { this.operation = 'upsert'; this.payload = payload; return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    delete() { this.operation = 'delete'; return this; }
    execute() {
      const rows = tables[this.table] || (tables[this.table] = []);
      const matches = rows.filter((row) => this.filters.every((test) => test(row)));
      let data = matches;
      if (this.operation === 'insert' || this.operation === 'upsert') {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = input.map((row) => ({ id: row.id || `${this.table}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, created_at: new Date().toISOString(), ...row }));
        rows.push(...inserted);
        data = inserted;
      } else if (this.operation === 'update') {
        data = matches.map((row) => Object.assign(row, this.payload));
      } else if (this.operation === 'delete') {
        tables[this.table] = rows.filter((row) => !matches.includes(row));
        data = matches;
      } else {
        data = [...matches].map((row) => {
          const enriched = { ...row };
          if (row.doctor_id && tables.doctors) enriched.doctor = tables.doctors.find((doctor) => doctor.id === row.doctor_id) || null;
          if (row.rep_id && tables.profiles) enriched.rep = tables.profiles.find((profile) => profile.id === row.rep_id) || null;
          return enriched;
        });
      }
      this.sorts.forEach(([key, ascending]) => data.sort((a, b) => (a[key] > b[key] ? (ascending ? 1 : -1) : a[key] < b[key] ? (ascending ? -1 : 1) : 0)));
      const count = data.length;
      if (this.offset) data = data.slice(this.offset);
      if (this.limitValue != null) data = data.slice(0, this.limitValue);
      if (this.head) data = null;
      if (this.one) data = data && data[0] ? data[0] : null;
      return { data, error: null, count: this.countMode ? count : null };
    }
    then(resolve, reject) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
  }

  return {
    from: (table) => new Query(table),
    rpc: async (name, args = {}) => {
      if (name === 'book_item') return { data: { id: 'demo-booking', booking_id: 'demo-booking', item_id: args.p_item_id || null, status: 'confirmed', phone: args.p_phone || '' }, error: null };
      if (name === 'cancel_booking') return { data: null, error: null };
      return { data: name.includes('count') || name.includes('total') ? 1 : [], error: null };
    },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: demoUser }, error: null }),
      onAuthStateChange: (callback) => { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => { authListener('SIGNED_OUT', null); return { error: null }; },
      signInWithPassword: async () => ({ data: { session, user: demoUser }, error: null }),
      signInWithOAuth: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: demoUser }, error: null }),
    },
    storage: { from: () => ({ upload: async () => ({ data: { path: 'demo/sample.png' }, error: null }), remove: async () => ({ data: [], error: null }), download: async () => ({ data: new Blob(), error: null }), getPublicUrl: (path) => ({ data: { publicUrl: `/demo/${path || 'sample.png'}` } }) }) },
  };
}
