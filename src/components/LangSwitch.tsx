import { LANGS, type Lang } from "../../content/posts";
import { READING_COPY } from "../lib/readingLang";

interface LangSwitchProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
  /** Languages that can be picked; others are shown disabled. */
  available?: readonly Lang[];
  className?: string;
}

/** EN / ES toggle for reading posts in either language. */
const LangSwitch = ({ lang, onChange, available = LANGS, className }: LangSwitchProps) => (
  <div
    className={["lang-switch", className].filter(Boolean).join(" ")}
    role="group"
    aria-label={READING_COPY[lang].switchLabel}
  >
    {LANGS.map((option) => (
      <button
        key={option}
        type="button"
        lang={option}
        aria-pressed={lang === option}
        disabled={!available.includes(option)}
        title={READING_COPY[option].names[option]}
        onClick={() => onChange(option)}
        className="lang-switch__option"
      >
        {option}
      </button>
    ))}
  </div>
);

export default LangSwitch;
