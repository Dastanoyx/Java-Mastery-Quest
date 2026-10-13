"use client";
// Shows what a learning event actually earned (XP, quests, achievements, level-ups) — always from the server's ledger.
import { toast } from "sonner";

export interface Rewards { xpGained: number; questsCompleted: { title: string; xp: number }[]; achievementsUnlocked: { id: string; title: string; xp: number }[]; levelUp: { from: number; to: number } | null }

export function showRewards(r: Rewards | null | undefined) {
  if (!r) return;
  if (r.levelUp) toast.success(`Level ${r.levelUp.to} reached`, { description: "Your level reflects verified learning events only." });
  for (const a of r.achievementsUnlocked) toast(`Achievement unlocked: ${a.title}`, { description: a.xp ? `+${a.xp} XP` : undefined });
  for (const q of r.questsCompleted) toast(`Quest complete: ${q.title}`, { description: q.xp ? `+${q.xp} XP` : undefined });
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({ error: `Unexpected response (HTTP ${res.status})` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (HTTP ${res.status})`);
  return data as T;
}
