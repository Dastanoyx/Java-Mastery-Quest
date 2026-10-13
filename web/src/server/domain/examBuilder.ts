// Assembles mock exams from the question pool.
// • Domain allocation is proportional to the number of official objectives per domain (Oracle publishes no
//   domain weights), with a floor per domain, using the largest-remainder method (docs/DECISIONS.md D-007).
// • Within a domain, objectives are visited round-robin so every objective is represented.
// • Least-exposed questions are preferred: never seen → seen fewer times → seen longest ago.
// • Question order is shuffled. A seeded RNG makes the whole process reproducible in tests.
import type { Difficulty } from "./types.ts";

export interface PoolQuestion { id: string; domainId: string; objectiveId: string; difficulty: Difficulty }
export interface Exposure { attempts: number; lastSeen: Date | null }
export interface DomainSpec { id: string; objectiveIds: string[] }

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Splits `total` across domains proportionally to weight with a floor, capped by availability. */
export function allocate(total: number, domains: { id: string; weight: number; available: number }[], floor: number): Record<string, number> {
  const out: Record<string, number> = {};
  const usable = domains.filter((d) => d.available > 0);
  if (!usable.length) return out;
  const capacity = usable.reduce((s, d) => s + d.available, 0);
  let remaining = Math.min(total, capacity);
  for (const d of usable) {
    out[d.id] = Math.min(d.available, floor, remaining);
    remaining -= out[d.id];
  }
  while (remaining > 0) {
    const open = usable.filter((d) => out[d.id] < d.available);
    if (!open.length) break;
    const wSum = open.reduce((s, d) => s + d.weight, 0);
    const shares = open.map((d) => ({ d, exact: (remaining * d.weight) / wSum }));
    let given = 0;
    for (const s of shares) {
      const n = Math.min(Math.floor(s.exact), s.d.available - out[s.d.id]);
      out[s.d.id] += n;
      given += n;
    }
    remaining -= given;
    if (remaining > 0) {
      // largest remainder, one each
      const order = shares
        .filter((s) => out[s.d.id] < s.d.available)
        .sort((x, y) => (y.exact - Math.floor(y.exact)) - (x.exact - Math.floor(x.exact)) || y.d.weight - x.d.weight);
      for (const s of order) {
        if (remaining === 0) break;
        out[s.d.id]++;
        remaining--;
      }
      if (!order.length) break;
    }
  }
  return out;
}

export interface BuildOptions {
  count: number;
  domains: DomainSpec[];
  floorPerDomain: number;
  exposure: Map<string, Exposure>;
  rng: () => number;
  difficulties?: Difficulty[];
}

export function buildExam(pool: PoolQuestion[], o: BuildOptions): string[] {
  const allowed = new Set(o.domains.map((d) => d.id));
  const candidates = pool.filter((q) => allowed.has(q.domainId) && (!o.difficulties?.length || o.difficulties.includes(q.difficulty)));
  const byDomain = new Map<string, PoolQuestion[]>();
  for (const q of candidates) byDomain.set(q.domainId, [...(byDomain.get(q.domainId) ?? []), q]);
  const alloc = allocate(
    o.count,
    o.domains.map((d) => ({ id: d.id, weight: Math.max(1, d.objectiveIds.length), available: byDomain.get(d.id)?.length ?? 0 })),
    o.floorPerDomain,
  );
  const exposureKey = (q: PoolQuestion) => {
    const e = o.exposure.get(q.id);
    return [e ? 1 : 0, e?.attempts ?? 0, e?.lastSeen?.getTime() ?? 0];
  };
  const picked: string[] = [];
  for (const d of o.domains) {
    const n = alloc[d.id] ?? 0;
    if (!n) continue;
    // Rank questions per objective by exposure, with random tie-breaking.
    const perObjective = new Map<string, PoolQuestion[]>();
    for (const q of shuffle(byDomain.get(d.id) ?? [], o.rng)) perObjective.set(q.objectiveId, [...(perObjective.get(q.objectiveId) ?? []), q]);
    for (const [k, list] of perObjective) {
      perObjective.set(k, [...list].sort((a, b) => {
        const ka = exposureKey(a), kb = exposureKey(b);
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
      }));
    }
    const objectiveOrder = shuffle([...perObjective.keys()], o.rng);
    let taken = 0;
    while (taken < n) {
      let progressed = false;
      for (const obj of objectiveOrder) {
        const list = perObjective.get(obj)!;
        if (!list.length || taken >= n) continue;
        picked.push(list.shift()!.id);
        taken++;
        progressed = true;
      }
      if (!progressed) break;
    }
  }
  return shuffle(picked, o.rng);
}
