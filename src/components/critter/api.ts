/** The client half of POST /api/critter (see api/critter.ts). */
import type { Sight } from "./glance";

export type Mood = "curious" | "happy" | "thinking" | "sleepy" | "surprised";
export type Mode = "arrive" | "linger" | "ask";

export interface Turn {
  who: "visitor" | "mote";
  text: string;
}

export interface Remark {
  say: string;
  mood: Mood;
}

/** A remark, or the status code the endpoint answered with instead. */
export async function ask(
  mode: Mode,
  sight: Sight,
  extra: { question?: string; history?: Turn[] } = {},
  signal?: AbortSignal,
): Promise<Remark | number> {
  try {
    const res = await fetch("/api/critter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, ...sight, ...extra }),
      signal,
    });
    if (!res.ok) return res.status;
    return (await res.json()) as Remark;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return 0;
  }
}
