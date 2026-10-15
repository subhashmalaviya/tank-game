import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import type { MatchResult } from '../../../shared/src/types';
const scrypt = promisify(scryptCallback);
type Account = { id: string; name: string; salt: string; hash: string; created: number };
type Session = { accountId: string; expires: number };
type RecordEntry = {
  id: string;
  at: number;
  result: MatchResult;
  accounts: Record<string, string>;
};
export class Store {
  private accounts: Account[] = [];
  private sessions: Record<string, Session> = {};
  private matches: RecordEntry[] = [];
  private pool?: Pool;
  private queue = Promise.resolve();
  constructor(
    private file: string | null = null,
    databaseUrl?: string,
  ) {
    if (databaseUrl) this.pool = new Pool({ connectionString: databaseUrl });
  }
  async init() {
    if (this.pool) {
      await this.pool.query(
        'CREATE TABLE IF NOT EXISTS arena_accounts (id text PRIMARY KEY, name text UNIQUE NOT NULL, data jsonb NOT NULL); CREATE TABLE IF NOT EXISTS arena_sessions (token text PRIMARY KEY, data jsonb NOT NULL); CREATE TABLE IF NOT EXISTS arena_matches (id text PRIMARY KEY, data jsonb NOT NULL)',
      );
      this.accounts = (await this.pool.query('SELECT data FROM arena_accounts')).rows.map(
        (r) => r.data,
      );
      this.sessions = Object.fromEntries(
        (await this.pool.query('SELECT token,data FROM arena_sessions')).rows.map((r) => [
          r.token,
          r.data,
        ]),
      );
      this.matches = (
        await this.pool.query(
          "SELECT data FROM arena_matches ORDER BY (data->>'at')::bigint DESC LIMIT 2000",
        )
      ).rows.map((r) => r.data);
    } else if (this.file) {
      try {
        const d = JSON.parse(await readFile(this.file, 'utf8'));
        this.accounts = d.accounts;
        this.sessions = d.sessions;
        this.matches = d.matches;
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  }
  private persist() {
    if (!this.file || this.pool) return Promise.resolve();
    const payload = JSON.stringify({
        accounts: this.accounts,
        sessions: this.sessions,
        matches: this.matches,
      }),
      file = this.file;
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file + '.tmp', payload, { mode: 0o600 });
        await rename(file + '.tmp', file);
      });
    return this.queue;
  }
  async register(name: string, password: string) {
    const normalized = name.toLowerCase();
    if (this.accounts.some((a) => a.name.toLowerCase() === normalized))
      throw new Error('That callsign already has an account.');
    const salt = randomBytes(16).toString('hex'),
      hash = ((await scrypt(password, salt, 64)) as Buffer).toString('hex');
    if (this.accounts.some((a) => a.name.toLowerCase() === normalized))
      throw new Error('That callsign already has an account.');
    const account = {
      id: randomBytes(16).toString('hex'),
      name: normalized,
      salt,
      hash,
      created: Date.now(),
    };
    if (this.pool)
      await this.pool.query('INSERT INTO arena_accounts VALUES ($1,$2,$3)', [
        account.id,
        normalized,
        account,
      ]);
    this.accounts.push(account);
    await this.persist();
    return this.session(account);
  }
  async login(name: string, password: string) {
    const a = this.accounts.find((a) => a.name === name.toLowerCase());
    const hash = (await scrypt(password, a?.salt ?? 'dummy-salt', 64)) as Buffer;
    if (!a || !timingSafeEqual(hash, Buffer.from(a.hash, 'hex')))
      throw new Error('Incorrect callsign or password.');
    return this.session(a);
  }
  private async session(a: Account) {
    const token = randomBytes(32).toString('hex'),
      key = this.key(token),
      session = { accountId: a.id, expires: Date.now() + 30 * 86400000 };
    this.sessions[key] = session;
    if (this.pool)
      await this.pool.query('INSERT INTO arena_sessions VALUES ($1,$2)', [key, session]);
    await this.persist();
    return { token, name: a.name };
  }
  private key(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  account(token: unknown) {
    if (typeof token !== 'string' || token.length > 128) return undefined;
    const s = this.sessions[this.key(token)];
    if (!s || s.expires < Date.now()) return undefined;
    return this.accounts.find((a) => a.id === s.accountId);
  }
  async record(id: string, result: MatchResult, accounts: Record<string, string>) {
    if (this.matches.some((m) => m.id === id)) return;
    const entry = { id, at: Date.now(), result, accounts };
    if (this.pool)
      await this.pool.query('INSERT INTO arena_matches VALUES ($1,$2) ON CONFLICT DO NOTHING', [
        id,
        entry,
      ]);
    this.matches.unshift(entry);
    this.matches = this.matches.slice(0, 2000);
    await this.persist();
  }
  profile(token: string) {
    const a = this.account(token);
    if (!a) throw new Error('Sign in to view your career.');
    const matches = this.matches.filter((m) => Object.values(m.accounts).includes(a.id));
    const rows = matches.map((m) => {
      const pid = Object.keys(m.accounts).find((id) => m.accounts[id] === a.id)!;
      return {
        at: m.at,
        won: m.result.winnerIds.includes(pid),
        draw: m.result.draw,
        duration: m.result.duration,
        stats: m.result.rankings.find((r) => r.id === pid),
      };
    });
    return {
      name: a.name,
      games: rows.length,
      wins: rows.filter((r) => r.won).length,
      damage: rows.reduce((n, r) => n + (r.stats?.damage ?? 0), 0),
      history: rows.slice(0, 20),
    };
  }
  async close() {
    await this.queue;
    if (this.pool) await this.pool.end();
  }
}
