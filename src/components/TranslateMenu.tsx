import { useState, type FormEvent } from "react";
import { Check, Languages } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { LANGUAGES, findLanguage } from "../lib/languages";

type TranslateMenuProps = {
  /** Current language (code or name), or null for the original. */
  value: string | null;
  onChange: (lang: string | null) => void;
};

/** Language picker for a post: a list of common languages plus free text. */
const TranslateMenu = ({ value, onChange }: TranslateMenuProps) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const current = value ? findLanguage(value) : null;
  const label = value ? current?.native ?? value : "Translate";

  const pick = (lang: string | null) => {
    onChange(lang);
    setOpen(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = custom.trim();
    if (name) {
      pick(findLanguage(name)?.code ?? name);
      setCustom("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="post-translate__trigger" aria-label="Translate this post">
        <Languages size={13} aria-hidden="true" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="end" className="post-translate__menu">
        <button type="button" className="post-translate__item" onClick={() => pick(null)}>
          <span>English</span>
          <span className="post-translate__hint">original</span>
          {!value && <Check size={12} aria-hidden="true" />}
        </button>
        <div className="post-translate__list" role="list">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="listitem"
              className="post-translate__item"
              onClick={() => pick(lang.code)}
            >
              <span lang={lang.code}>{lang.native}</span>
              <span className="post-translate__hint">{lang.name}</span>
              {current?.code === lang.code && <Check size={12} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="post-translate__form">
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Any other language…"
            maxLength={40}
            aria-label="Translate into another language"
          />
        </form>
      </PopoverContent>
    </Popover>
  );
};

export default TranslateMenu;
