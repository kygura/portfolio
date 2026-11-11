import { useRef, ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

interface MagneticButtonProps {
  children: ReactNode;
  strength?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  [key: string]: unknown;
}

export default function MagneticButton({
  children,
  strength = 0.2,
  className = "",
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  // Stiff and critically damped: the pull snaps to the pointer and lets go
  // without a wobble. Under reduced motion it does not pull at all.
  const reduce = useReducedMotion();
  const x = useSpring(rawX, { stiffness: 700, damping: 52 });
  const y = useSpring(rawY, { stiffness: 700, damping: 52 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduce) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    rawX.set(dx * strength);
    rawY.set(dy * strength);
  };

  const handleLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      style={{ x, y, display: "inline-block" }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
