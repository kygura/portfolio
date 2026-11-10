import type { ReactNode } from "react";

/**
 * The head every index page shares: a Silkscreen eyebrow with the page's
 * number in nav order, the display title, a one-paragraph lede and an
 * optional row of facts or actions, closed by a hairline.
 */
interface PageHeadProps {
  no: string;
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}

const PageHead = ({ no, label, title, lede, children }: PageHeadProps) => (
  <header className="page-head">
    <p className="page-head__eyebrow" aria-hidden="true">
      ( {no} — {label} )
    </p>
    <h1 className="page-head__title">{title}</h1>
    {lede && <p className="page-head__lede">{lede}</p>}
    {children}
  </header>
);

export default PageHead;
