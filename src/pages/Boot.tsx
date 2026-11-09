/**
 * The hidden page. Nothing links here and its path isn't in the bundle (see
 * familiar/gate.ts); the footer riddle is the way in. Arriving boots Bit, and
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
      <p className="bay__eyebrow">you weren't supposed to find this</p>

      <div className="bay__bay" aria-hidden="true">
        <div className={online ? "bay__bot" : "bay__bot bay__bot--off"}>
          <Sprite frame={online ? "happy" : "off"} scale={6} />
        </div>
        {!online && (
          <div className="bay__bar">
            <span />
          </div>
        )}
      </div>

      <h1 id="bay-title" className="bay__title">
        {online ? "Bit" : "Booting…"}
      </h1>

      <p className="bay__line" aria-live="polite">
        {!online
          ? "Something small is powering on."
          : returning
            ? "Bit is already with you. It never powered down."
            : "Bit is online and it's yours now. It will follow you around the site from here on, along the bottom of every page. Press it to say hello."}
      </p>

      {online && (
        <Link to="/" className="bay__back">
          ← take Bit home
        </Link>
      )}
    </section>
  );
};

export default Boot;
