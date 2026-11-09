/**
 * Mounts Bit on every page once it has booted. Until then this renders
 * nothing and the pet's code is never fetched.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { FAMILIAR_EVENT, FAMILIAR_KEY, isUnlocked } from "./store";

const Familiar = lazy(() => import("./Familiar"));

export default function FamiliarHost() {
  const [on, setOn] = useState(isUnlocked);

  useEffect(() => {
    // Shown for this visit even if storage is blocked and the unlock can't persist.
    const boot = () => setOn(true);
    const sync = (e: StorageEvent) => {
      if (e.key === FAMILIAR_KEY && e.newValue === "1") setOn(true);
    };
    window.addEventListener(FAMILIAR_EVENT, boot);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAMILIAR_EVENT, boot);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <Familiar />
    </Suspense>
  );
}
