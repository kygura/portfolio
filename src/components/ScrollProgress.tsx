import { useScroll, motion } from "framer-motion";

/**
 * Reading progress as a hard 3px accent bar. It reads the scroll position
 * directly: no spring trailing behind the page (Lenis already eases the
 * scroll itself), so the bar is always exactly where the page is.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      style={{ scaleX: scrollYProgress, transformOrigin: "left" }}
      className="fixed top-0 left-0 right-0 h-[3px] z-[99997] pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full w-full"
        style={{ background: "var(--accent-amber)" }}
      />
    </motion.div>
  );
}
