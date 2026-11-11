import { ReactNode, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: ReactNode;
}

// Hard in-out curve: motion snaps between states instead of drifting.
const HARD = [0.85, 0, 0.15, 1] as const;

const variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

export default function PageTransition({ children }: PageTransitionProps) {
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  // Every scene has its own URL, but the viewer must stay mounted between them:
  // remounting would rebuild the engine and lose its dither dissolve.
  const key = pathname.startsWith("/scenes") ? "/scenes" : pathname;

  // No shutter on the first paint, only on navigation.
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  const shutter = !first.current && !reduced;

  return (
    <>
      {shutter && (
        // An ink slab wipes in from the left, holds on the destination,
        // then clears to the right. Keyed by route so it replays each time.
        <motion.div
          key={`shutter:${key}`}
          className="route-shutter"
          aria-hidden="true"
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)", "inset(0 0% 0 0)", "inset(0 0 0 100%)"] }}
          transition={{ duration: 0.62, times: [0, 0.38, 0.55, 1], ease: HARD }}
        >
          {key === "/" ? "/index" : key}
        </motion.div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: HARD }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
