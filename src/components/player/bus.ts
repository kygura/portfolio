/**
 * A small window-event bus between the tape deck (LofiPlayer) and anything
 * else that wants to put a tape in it, like the Study scene, where a cassette
 * dragged onto the deck on the desk plays through the same <audio> element.
 * The deck answers every change with its state, and answers an ask with it too.
 */

export type DeckRequest =
  | { kind: "station"; id: string }
  | { kind: "tape"; index: number }
  | { kind: "toggle" }
  | { kind: "eject" };

export interface DeckState {
  playing: boolean;
  /** The station in the deck, or null. */
  station: string | null;
  /** The playlist track in the deck, or null (no tape, or a station). */
  tape: number | null;
}

const REQUEST = "nca-deck:request";
const STATE = "nca-deck:state";
const ASK = "nca-deck:ask";

export const requestDeck = (r: DeckRequest) => window.dispatchEvent(new CustomEvent<DeckRequest>(REQUEST, { detail: r }));

export const onDeckRequest = (fn: (r: DeckRequest) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<DeckRequest>).detail);
  window.addEventListener(REQUEST, h);
  return () => window.removeEventListener(REQUEST, h);
};

export const announceDeck = (s: DeckState) => window.dispatchEvent(new CustomEvent<DeckState>(STATE, { detail: s }));

export const onDeckAsk = (fn: () => void) => {
  window.addEventListener(ASK, fn);
  return () => window.removeEventListener(ASK, fn);
};

/** Follow the deck's state; the current state arrives straight away if the deck is mounted. */
export const onDeckState = (fn: (s: DeckState) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<DeckState>).detail);
  window.addEventListener(STATE, h);
  window.dispatchEvent(new Event(ASK));
  return () => window.removeEventListener(STATE, h);
};
