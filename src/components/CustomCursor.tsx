import { useEffect, useState } from "react";
import { motion, steps, useMotionValue, useReducedMotion, useSpring, AnimatePresence } from "framer-motion";

/**
 * Returns true only for devices that actually have a hovering pointer.
 * On touch there is no cursor to replace, so the whole component — three
 * fixed layers plus two springs driven by every mouse move — stays
 * unmounted rather than animating invisibly.
 */
function useHasPointer() {
  const [hasPointer, setHasPointer] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setHasPointer(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  return hasPointer;
}

export default function CustomCursor() {
  const hasPointer = useHasPointer();
  return hasPointer ? <Cursor /> : null;
}

const SIZE = { rest: 20, hover: 38 };
// --ease-blunt in index.css.
const BLUNT = [0.2, 0, 0, 1] as const;

function Cursor() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  // Tight and critically damped: the ring trails by a frame or two and
  // stops dead, with no float or overshoot.
  const ringX = useSpring(cursorX, { stiffness: 900, damping: 60 });
  const ringY = useSpring(cursorY, { stiffness: 900, damping: 60 });
  const reduce = useReducedMotion();
  const [isHovering, setIsHovering] = useState(false);
  const [isDown, setIsDown] = useState(false);
  // Inside an iframe the page gets no mouse events, so the cursor would
  // freeze at the frame's edge; it steps aside and the native one shows.
  const [inFrame, setInFrame] = useState(false);
  const [accentColor, setAccentColor] = useState<string>("var(--accent-amber)");
  const [clicks, setClicks] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    let id = 0;
    const onMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };

    const onEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      setInFrame(target.tagName === "IFRAME");
      const closest = target.closest("a, button, [data-cursor]");
      if (closest) {
        const dataColor = (closest as HTMLElement).dataset.cursorColor;
        setAccentColor(dataColor || "var(--accent-amber)");
        setIsHovering(true);
      }
    };

    const onLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button, [data-cursor]")) {
        setIsHovering(false);
        setAccentColor("var(--accent-amber)");
      }
    };

    // Press squeezes the ring; the click stamps a square that snaps outward.
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      setIsDown(true);
      if (reduce) return;
      const n = ++id;
      setClicks((c) => [...c.slice(-3), { id: n, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => setClicks((c) => c.filter((k) => k.id !== n)), 260);
    };
    const onUp = () => setIsDown(false);

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });
    window.addEventListener("mouseup", onUp, { passive: true });
    document.addEventListener("mouseover", onEnter, { passive: true });
    document.addEventListener("mouseout", onLeave, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseover", onEnter);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [cursorX, cursorY, reduce]);

  const ring = isHovering ? SIZE.hover : SIZE.rest;
  return (
    <>
      {/* Dot: painted in the theme's ink rather than mix-blend-difference,
          which would force re-blending against the animating hero canvas. */}
      <motion.div
        style={{ x: cursorX, y: cursorY, opacity: inFrame ? 0 : 1 }}
        className="fixed top-0 left-0 z-[99999] pointer-events-none"
        animate={{ width: isHovering ? 4 : 6, height: isHovering ? 4 : 6, scale: isDown ? 0.6 : 1 }}
        transition={{ duration: reduce ? 0 : 0.09, ease: BLUNT }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2" style={{ width: "100%", height: "100%", background: "var(--text-primary)" }} />
      </motion.div>

      {/* One square ring: small at rest, grows and takes the accent over
          links and buttons, squeezes while the button is down. */}
      <motion.div
        style={{ x: ringX, y: ringY, opacity: inFrame ? 0 : 1 }}
        className="fixed top-0 left-0 z-[99998] pointer-events-none"
        animate={{ width: ring, height: ring, scale: isDown ? 0.82 : 1 }}
        transition={{ duration: reduce ? 0 : 0.09, ease: BLUNT }}
      >
        <div
          className="-translate-x-1/2 -translate-y-1/2"
          style={{
            width: "100%",
            height: "100%",
            // Colour cuts with no fade; over a target the frame doubles to 2px.
            border: isHovering
              ? `2px solid ${accentColor}`
              : "1px solid color-mix(in srgb, var(--text-primary) 35%, transparent)",
            background: isHovering ? `color-mix(in srgb, ${accentColor} 7%, transparent)` : "transparent",
          }}
        />
      </motion.div>

      <AnimatePresence>
        {clicks.map((c) => (
          <motion.div
            key={c.id}
            className="fixed top-0 left-0 z-[99997] pointer-events-none"
            style={{ x: c.x, y: c.y }}
          >
            <motion.div
              className="-translate-x-1/2 -translate-y-1/2"
              initial={{ width: 14, height: 14, opacity: 1 }}
              animate={{ width: 44, height: 44, opacity: 0 }}
              transition={{ duration: 0.22, ease: steps(4, "end") }}
              style={{ border: "2px solid var(--accent)" }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}
