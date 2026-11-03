import { useEffect, useRef, useState } from "react";
import { ACCENTS, EGGS_KEY, readStored, useAccent, writeStored } from "@/theme/accent";
import { SHEETS } from "./sheets";
import type { HeroEngine } from "./engine/hero-engine";
import { createCipherField, type CipherField } from "./cipher";

/**
 * Engine + cipher wiring shared by the home hero and the /scenes viewer.
 * three.js is fetched with a dynamic import the first time a WebGL scene is
 * shown, so routes (and the Cipher-only home hero) never download it. The cipher sheet is a black stage in the engine
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

export function useHeroStage(sheet: number) {
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
  const live = useRef({ accent, sheet, motion: !cipherOn && !reduceQuery()?.matches });
  live.current = { accent, sheet, motion: !cipherOn && !reduceQuery()?.matches };

  // The WebGL engine (three.js plus every scene builder) is only fetched once a
  // scene other than Cipher is shown. Cipher is a 2D canvas, so the home hero,
  // which only ever shows Cipher, never pays for three.js.
  const [needsEngine, setNeedsEngine] = useState(!cipherOn);
  useEffect(() => {
    if (!cipherOn) setNeedsEngine(true);
  }, [cipherOn]);

  useEffect(() => {
    if (!needsEngine) return;
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
          psx: true,
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
  }, [needsEngine]);

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
    engineRef.current?.setMotion(!cipherOn && !reduceQuery()?.matches);
  }, [cipherOn]);

  return { canvasRef, cipherCanvasRef, stageRef, engineRef, noGl, egg, cipherOn };
}
