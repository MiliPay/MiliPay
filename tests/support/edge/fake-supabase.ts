/**
 * An in-memory stand-in for the parts of supabase-js the Edge Functions use:
 * from().select/insert/update + eq/is/in/lt/order/limit + maybeSingle/single,
 * rpc() (answered per test through rpcAnswers), and auth.getUser() (tokens
 * mapped to users through `users`).
 *
 * Deliberately small and deliberately literal. It applies equality filters
 * and patches exactly as written and does nothing clever, so a test failure
 * points at the function under test rather than at the fake. Anything it does
 * not implement throws, instead of quietly returning nothing.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private mode: "select" | "update" | "insert" = "select";
  private patch: Row = {};
  private inserted: Row[] = [];
  private limitTo: number | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(_columns?: string): this {
    // After update/insert, select() only asks for the affected rows back.
    return this;
  }

  insert(values: Row | Row[]): this {
    this.mode = "insert";
    this.inserted = (Array.isArray(values) ? values : [values]).map((v) => ({ ...v }));
    return this;
  }

  update(patch: Row): this {
    this.mode = "update";
    this.patch = { ...patch };
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) < String(value));
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) <= String(value));
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) >= String(value));
    return this;
  }

  order(): this {
    return this;
  }

  limit(n: number): this {
    this.limitTo = n;
    return this;
  }

  private run(): Row[] {
    const rows = this.db.table(this.table);

    if (this.mode === "insert") {
      const failure = this.db.failInsertInto.get(this.table);
      if (failure) throw Object.assign(new Error(failure.message), { __result: failure });
      // A unique index, enforced the way Postgres reports it: code 23505.
      const key = this.db.uniqueKeys.get(this.table);
      if (key) {
        for (const row of this.inserted) {
          const clash = rows.some((existing) => key.every((col) => existing[col] === row[col]));
          if (clash) {
            const error = { message: "duplicate key value violates unique constraint", code: "23505" };
            throw Object.assign(new Error(error.message), { __result: error });
          }
        }
      }
      // Returned as stored, id included, the way insert().select() does.
      const stored: Row[] = [];
      for (const row of this.inserted) {
        const withId = { id: `${this.table}-${rows.length + 1}`, ...row };
        rows.push(withId);
        stored.push(withId);
      }
      return stored;
    }

    const matched = rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.mode === "update") {
      for (const row of matched) Object.assign(row, this.patch);
    }
    return this.limitTo === null ? matched : matched.slice(0, this.limitTo);
  }

  private settle(shape: "many" | "maybeSingle" | "single"): Result {
    try {
      const rows = this.run();
      if (shape === "many") return { data: rows.map((r) => ({ ...r })), error: null };
      if (shape === "single" && rows.length !== 1) {
        return { data: null, error: { message: `expected one row, got ${rows.length}` } };
      }
      return { data: rows[0] ? { ...rows[0] } : null, error: null };
    } catch (err) {
      const result = (err as { __result?: Result["error"] }).__result;
      if (result) return { data: null, error: result };
      throw err;
    }
  }

  maybeSingle(): Promise<Result> {
    return Promise.resolve(this.settle("maybeSingle"));
  }

  single(): Promise<Result> {
    return Promise.resolve(this.settle("single"));
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return Promise.resolve(this.settle("many")).then(onFulfilled, onRejected);
  }
}

export class FakeSupabase {
  private readonly tables = new Map<string, Row[]>();
  /** Make an insert into this table fail with this error. */
  readonly failInsertInto = new Map<string, { message: string; code?: string }>();
  readonly rpcCalls: { name: string; args: unknown }[] = [];
  /** Columns that together must be unique per table, like a unique index. */
  readonly uniqueKeys = new Map<string, string[]>();
  /** What each rpc answers. An rpc with no answer here throws, as before. */
  readonly rpcAnswers = new Map<string, (args: unknown) => unknown>();
  /** Bearer token -> user, for requireCaller's auth.getUser(). */
  readonly users = new Map<string, { id: string; email?: string | null }>();

  readonly auth = {
    getUser: async (token: string) => {
      const user = this.users.get(token);
      return user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: "invalid token" } };
    },
  };

  constructor(seed: Record<string, Row[]> = {}, unique: Record<string, string[]> = {}) {
    for (const [name, columns] of Object.entries(unique)) this.uniqueKeys.set(name, columns);
    for (const [name, rows] of Object.entries(seed)) {
      this.tables.set(name, rows.map((r) => ({ ...r })));
    }
  }

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  from(name: string): Query {
    return new Query(this, name);
  }

  rpc(name: string, args: unknown): Promise<Result> {
    this.rpcCalls.push({ name, args });
    const answer = this.rpcAnswers.get(name);
    if (answer) return Promise.resolve({ data: answer(args), error: null });
    throw new Error(`fake-supabase: rpc ${name} is not implemented`);
  }
}
