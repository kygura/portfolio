/**
 * The window you go through and the stage you land on share one
 * view-transition name, so the browser morphs one into the other. Only one
 * element per page may carry it: on the hall that is the window last
 * travelled through (or the one just clicked), on the viewer the stage.
 */
export const PORTAL = "scene-portal";

let last: string | null = null;
export const lastPortal = () => last;
export const setLastPortal = (id: string) => {
  last = id;
};

/** Move the name onto `el` before the browser snapshots the page. */
export function claimPortal(el: HTMLElement, id: string) {
  document.querySelectorAll<HTMLElement>("[data-portal]").forEach((n) => (n.style.viewTransitionName = ""));
  el.style.viewTransitionName = PORTAL;
  last = id;
}
