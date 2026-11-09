/**
 * The hidden route. Nothing links here: not the nav, the chords, the command
 * palette or the 404 list. Arriving hatches Moss, and the unlock is kept in
 * storage so it follows the visitor around the site from then on.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sprite } from "@/components/familiar/sprite";
import { isUnlocked, unlock } from "@/components/familiar/store";

const HATCH_MS = 2400;

const Hollow = () => {
  const returning = useRef(isUnlocked()).current;
  const [hatched, setHatched] = useState(returning);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (returning) return;
    const id = window.setTimeout(() => {
      setHatched(true);
      unlock();
    }, HATCH_MS);
    return () => window.clearTimeout(id);
  }, [returning]);

  return (
    <section className="hollow" aria-labelledby="hollow-title">
      <p className="hollow__eyebrow">you weren't supposed to find this</p>

      <div className="hollow__nest" data-hatched={hatched || undefined} aria-hidden="true">
        {hatched ? (
          <div className="hollow__moss">
            <Sprite frame="happy" scale={8} />
          </div>
        ) : (
          <div className="hollow__egg" />
        )}
      </div>

      <h1 id="hollow-title" className="hollow__title">
        {hatched ? "Moss" : "Something is hatching…"}
      </h1>

      <p className="hollow__line" aria-live="polite">
        {!hatched
          ? "Hold still."
          : returning
            ? "Moss is already with you. It never left."
            : "It hatched, and it's yours now. Moss will follow you around the site from here on, along the bottom of every page. Press it to say hello."}
      </p>

      {hatched && (
        <Link to="/" className="hollow__back">
          ← take Moss home
        </Link>
      )}
    </section>
  );
};

export default Hollow;
