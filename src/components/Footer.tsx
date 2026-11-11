import { ArrowLeft, ArrowRight } from "lucide-react";
import { QUOTES_ARRAY } from "../lib/consts";
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { isTyping } from "@/theme/keymap";
import { cv } from "../../content/cv";

function initQuote(list: string[]) {
  const r = Math.floor(Math.random() * list.length);
  return { index: r, content: list[r] };
}

const Footer = () => {
  const [currentQuote, setCurrentQuote] = useState(() => initQuote(QUOTES_ARRAY));
  const [direction, setDirection] = useState<-1 | 1>(1);

  const longestQuote = QUOTES_ARRAY.reduce((longest, q) =>
    q.length > longest.length ? q : longest
  ).split("<br>");

  const handlePrev = useCallback(() => {
    setCurrentQuote((prev) => {
      if (prev.index <= 0) return prev;
      setDirection(-1);
      const i = prev.index - 1;
      return { index: i, content: QUOTES_ARRAY[i] };
    });
  }, []);

  const handleNext = useCallback(() => {
    setCurrentQuote((prev) => {
      if (prev.index >= QUOTES_ARRAY.length - 1) return prev;
      setDirection(1);
      const i = prev.index + 1;
      return { index: i, content: QUOTES_ARRAY[i] };
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A key already claimed (the second half of a g-chord) or typed into
      // a field is not a quote key.
      if (e.defaultPrevented || isTyping(e.target)) return;
      if (e.key === "a" || e.key === "A") handlePrev();
      else if (e.key === "d" || e.key === "D") handleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePrev, handleNext]);

  const hasPrev = currentQuote.index > 0;
  const hasNext = currentQuote.index < QUOTES_ARRAY.length - 1;
  const lines = currentQuote.content.split("<br>");

  // Blunt carousel: the old quote is cut, the new one shifts in a short
  // step from the side it came from. Reduced motion swaps them in place.
  const reduce = useReducedMotion();
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 12 }),
    center: { opacity: 1, x: 0, transition: { duration: reduce ? 0 : 0.14, ease: [0.2, 0, 0, 1] as const } },
    exit: { opacity: 0, transition: { duration: reduce ? 0 : 0.05, ease: "linear" as const } },
  };

  return (
    <footer className="w-full relative overflow-hidden flex flex-col mt-auto bg-background">
      {/* Divider line */}
      <div
        className="w-full h-[2px] mx-auto"
        style={{
          background: "var(--rule-2)",
          maxWidth: "900px",
        }}
      />

      <div className="relative w-full max-w-4xl mx-auto py-6 sm:py-8 md:py-10 px-4 sm:px-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:gap-x-0 sm:flex items-center justify-center">
        {/* Left */}
        <div className="justify-self-end sm:justify-self-auto sm:absolute sm:left-6 z-10 flex flex-col items-center gap-1 sm:gap-2">
          <motion.button
            onClick={hasPrev ? handlePrev : undefined}
            disabled={!hasPrev}
            whileTap={hasPrev && !reduce ? { x: -2, y: 2 } : undefined}
            transition={{ duration: 0.06, ease: "linear" }}
            className={`group p-2 border-2 border-transparent transition-none ${
              hasPrev
                ? "hover:border-[var(--accent-terracotta)] hover:text-[var(--accent-terracotta)]"
                : "opacity-20 cursor-not-allowed hidden sm:block"
            }`}
            aria-label="Previous quote"
          >
            <ArrowLeft
              className="w-5 h-5 md:w-6 md:h-6 transition-transform duration-100 ease-out group-hover:-translate-x-1 group-active:-translate-x-1.5"
              strokeWidth={1.5}
            />
          </motion.button>
          <span className="hidden sm:block text-[9px] font-mono text-muted-foreground tracking-widest">
            [A]
          </span>
        </div>

        {/* Quote */}
        <div className="col-span-2 order-first w-full px-0 sm:px-16 md:px-24 overflow-hidden relative z-0 flex items-center">
          {/* Hidden sizer: renders the tallest quote to reserve consistent height */}
          <div
            className="w-full flex flex-col items-center invisible"
            aria-hidden="true"
          >
            <p
              className="font-serif font-normal text-base sm:text-xl md:text-2xl tracking-[0.04em] leading-relaxed max-w-3xl break-words px-1 sm:px-4 text-center"
              style={{ fontStyle: "italic" }}
            >
              {longestQuote.map((line, i) => (
                <span
                  key={i}
                  className={`block last:mb-0 ${
                      i === 0 && longestQuote.length > 1
                        ? "mb-4"
                        : i > 0
                          ? "text-muted-foreground font-light text-sm sm:text-lg md:text-xl"
                          : ""
                    }`}
                >
                  {line}
                </span>
              ))}
            </p>
          </div>

          {/* Animated quote overlay */}
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={currentQuote.index}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0 w-full flex flex-col items-center justify-center"
            >
              <p
                className="font-serif font-normal text-base sm:text-xl md:text-2xl text-foreground tracking-[0.04em] leading-relaxed max-w-3xl break-words px-1 sm:px-4 text-center"
                style={{ fontStyle: "italic" }}
              >
                {lines.map((line, i) => (
                  <span
                    key={i}
                    className={`block last:mb-0 ${
                      i === 0 && lines.length > 1
                        ? "mb-4"
                        : i > 0
                          ? "text-muted-foreground font-light text-sm sm:text-lg md:text-xl"
                          : ""
                    }`}
                  >
                    {line}
                  </span>
                ))}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right */}
        <div className="justify-self-start sm:justify-self-auto sm:absolute sm:right-6 z-10 flex flex-col items-center gap-1 sm:gap-2">
          <motion.button
            onClick={hasNext ? handleNext : undefined}
            disabled={!hasNext}
            whileTap={hasNext && !reduce ? { x: 2, y: 2 } : undefined}
            transition={{ duration: 0.06, ease: "linear" }}
            className={`group p-2 border-2 border-transparent transition-none ${
              hasNext
                ? "hover:border-[var(--accent-sage)] hover:text-[var(--accent-sage)]"
                : "opacity-20 cursor-not-allowed hidden sm:block"
            }`}
            aria-label="Next quote"
          >
            <ArrowRight
              className="w-5 h-5 md:w-6 md:h-6 transition-transform duration-100 ease-out group-hover:translate-x-1 group-active:translate-x-1.5"
              strokeWidth={1.5}
            />
          </motion.button>
          <span className="hidden sm:block text-[9px] font-mono text-muted-foreground tracking-widest">
            [D]
          </span>
        </div>
      </div>

      {/* Colophon: who and where on the left, the quote's place in the
          deck in the middle, ways out on the right. */}
      <div className="colophon">
        <p className="colophon__who">
          <span>NCA.ink</span>
          <span>M&aacute;laga</span>
          <span>{new Date().getFullYear()}</span>
        </p>
        <p className="colophon__count" aria-label={`Quote ${currentQuote.index + 1} of ${QUOTES_ARRAY.length}`}>
          <b>{String(currentQuote.index + 1).padStart(2, "0")}</b>/{QUOTES_ARRAY.length}
        </p>
        <p className="colophon__links">
          <a href={`https://${cv.contact.github}`} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href={`mailto:${cv.contact.email}`}>Email</a>
          <Link to="/cv">CV</Link>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
