import { ReactNode } from "react";
import { AnimatePresence, motion, steps, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: ReactNode;
}

// Blunt page change: the old page is cut, the new one is stamped down in
// three frames (the same --ease-step / --dur-blunt as the CSS panels).
const variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.14, ease: steps(3, "end") } },
  exit: { opacity: 0, transition: { duration: 0.05, ease: "linear" as const } },
};

// Reduced motion: a plain swap, nothing moves and nothing fades.
const still = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 1, transition: { duration: 0 } },
};

export default function PageTransition({ children }: PageTransitionProps) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  // Every scene has its own URL, but the viewer must stay mounted between them:
  // remounting would rebuild the engine and lose its dither dissolve.
  const key = pathname.startsWith("/scenes") ? "/scenes" : pathname;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={key} variants={reduce ? still : variants} initial="initial" animate="animate" exit="exit">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
