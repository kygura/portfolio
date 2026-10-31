import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: ReactNode;
}

const variants = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -10 },
};

export default function PageTransition({ children }: PageTransitionProps) {
  const { pathname } = useLocation();
  // Every scene has its own URL, but the viewer must stay mounted between them:
  // remounting would rebuild the engine and lose its dither dissolve.
  const key = pathname.startsWith("/scenes") ? "/scenes" : pathname;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
