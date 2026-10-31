import { useEffect, useRef, useState } from "react";
import { ACCENTS, EGGS_KEY, readStored, useAccent, writeStored } from "@/theme/accent";
import { SHEETS } from "./sheets";
import type { HeroEngine } from "./engine/hero-engine";
import { createCipherField, type CipherField } from "./cipher";

/**
 * Engine + cipher wiring shared by the home hero and the /scenes viewer.
 * three.js is fetched with a dynamic import on mount, so routes without a
 * stage never download it. The cipher sheet is a black stage in the engine
 * with a 2D glyph canvas over it; the engine's clock stops while it is up.
 */

export interface EggNote {
  n: number;
  total: number;
  fresh: boolean;
  key: number;
}

const readFound = (): string[] => {
  try {
    const v = JSON.parse(readStored(EGGS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export const reduceQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function useHeroStage(sheet: number, opts: { paused?: boolean; psx?: boolean } = {}) {
  const { paused = false, psx = true } = opts;
  const accent = useAccent();
  const [noGl, setNoGl] = useState(false);
  const [egg, setEgg] = useState<EggNote | null>(null);
  const found = useRef<Set<string> | null>(null);
  const eggTimer = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cipherCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HeroEngine | null>(null);
  const cipherRef = useRef<CipherField | null>(null);
  const cipherOn = SHEETS[sheet].id === "cipher";
  const motionOn = () => !paused && !cipherOn && !reduceQuery()?.matches;
  const live = useRef({ accent, sheet, motion: motionOn(), psx });
  live.current = { accent, sheet, motion: motionOn(), psx };

  useEffect(() => {
    let dead = false;
    let engine: HeroEngine | null = null;
    import("./engine/hero-engine")
      .then(({ createHeroEngine }) => {
        if (dead || !canvasRef.current || !stageRef.current) return;
        engine = createHeroEngine({
          canvas: canvasRef.current,
          host: stageRef.current,
          readKeys: [],
          readVals: [],
          compass: null,
          accent: ACCENTS[live.current.accent],
          sheet: live.current.sheet,
          motion: live.current.motion,
          psx: live.current.psx,
          reducedMotion: Boolean(reduceQuery()?.matches),
          onContextLost: () => setNoGl(true),
          onEgg: ({ id, total }) => {
            found.current ??= new Set(readFound());
            const fresh = !found.current.has(id);
            if (fresh) {
              found.current.add(id);
              writeStored(EGGS_KEY, JSON.stringify([...found.current]));
            }
            setEgg({ n: found.current.size, total, fresh, key: Date.now() });
            window.clearTimeout(eggTimer.current);
            eggTimer.current = window.setTimeout(() => setEgg(null), 5000);
          },
        });
        engineRef.current = engine;
      })
      .catch(() => {
        if (!dead) setNoGl(true);
      });
    return () => {
      dead = true;
      window.clearTimeout(eggTimer.current);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Glyph field: plain 2D canvas, built eagerly so switching to it is instant.
  useEffect(() => {
    if (!cipherCanvasRef.current) return;
    const field = createCipherField(cipherCanvasRef.current, {
      accent: ACCENTS[live.current.accent].hex,
      reducedMotion: Boolean(reduceQuery()?.matches),
    });
    cipherRef.current = field;
    return () => {
      field.dispose();
      cipherRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setAccent(ACCENTS[accent]);
    cipherRef.current?.setAccent(ACCENTS[accent].hex);
  }, [accent]);
  useEffect(() => {
    engineRef.current?.setSheet(sheet);
  }, [sheet]);
  useEffect(() => {
    cipherRef.current?.setActive(cipherOn);
  }, [cipherOn]);
  useEffect(() => {
    engineRef.current?.setMotion(!paused && !cipherOn && !reduceQuery()?.matches);
  }, [paused, cipherOn]);
  useEffect(() => {
    engineRef.current?.setPsx(psx);
  }, [psx]);

  return { canvasRef, cipherCanvasRef, stageRef, engineRef, noGl, egg, cipherOn };
}
