import { useEffect, useState } from "react";
import { GA_ID, OPEN_CONSENT_EVENT, readConsent, setConsent, type ConsentChoice } from "@/lib/analytics";

/**
 * Analytics consent, asked once and remembered for a year. Accept and
 * decline sit side by side with the same weight, and the footer's
 * "Cookies" link brings the banner back to change the answer.
 */
const ConsentBanner = () => {
  const [open, setOpen] = useState(() => Boolean(GA_ID) && readConsent() === null);

  useEffect(() => {
    if (!GA_ID) return;
    const show = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, show);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, show);
  }, []);

  if (!open) return null;

  const choose = (choice: ConsentChoice) => {
    setConsent(choice);
    setOpen(false);
  };

  return (
    <div className="consent" role="dialog" aria-live="polite" aria-label="Analytics consent">
      <p className="consent__text">
        May I count your visit? Google Analytics only: no ads, no profile, nothing sold.
      </p>
      <div className="consent__keys">
        <button type="button" className="consent__key" onClick={() => choose("denied")}>
          Decline
        </button>
        <button type="button" className="consent__key consent__key--yes" onClick={() => choose("granted")}>
          Accept
        </button>
      </div>
    </div>
  );
};

export default ConsentBanner;
