/**
 * The hidden page. Nothing links here and its path isn't in the bundle (see
 * familiar/gate.ts); the footer riddle is the way in. Arriving wakes Bit, and
 * the unlock is kept in storage so it follows the visitor around the site
 * from then on.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sprite } from "@/components/familiar/sprite";
import { isUnlocked, unlock } from "@/components/familiar/store";

const BOOT_MS = 2400;

const Boot = () => {
  const returning = useRef(isUnlocked()).current;
  const [online, setOnline] = useState(returning);

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
      setOnline(true);
      unlock();
    }, BOOT_MS);
    return () => window.clearTimeout(id);
  }, [returning]);

  return (
    <section className="bay" aria-labelledby="bay-title">
      <p className="bay__eyebrow">the seal is broken</p>

      <div className="bay__bay" aria-hidden="true">
        <div className={online ? "bay__bot" : "bay__bot bay__bot--off"}>
          <Sprite frame={online ? "happy" : "off"} scale={6} />
        </div>
        {!online && (
          <div className="bay__runes">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{ animationDelay: `${i * 0.45}s` }} />
            ))}
          </div>
        )}
      </div>

      <h1 id="bay-title" className="bay__title">
        {online ? "Bit" : "Waking…"}
      </h1>

      <p className="bay__line" aria-live="polite">
        {!online
          ? "Something old is stirring under the stone."
          : returning
            ? "Bit is already awake. It remembers you."
            : "It slept under the ruin for a very long time. It's awake now, and it's yours: it will follow you around the site, along the bottom of every page. Touch it to say hello."}
      </p>

      {online && (
        <Link to="/" className="bay__back">
          ← lead Bit out
        </Link>
      )}
    </section>
  );
};

export default Boot;
