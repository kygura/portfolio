/**
 * The mascot as a 16×16 pixel grid, one character per pixel. Colours are
 * CSS variables where the site has a token, so the hat band follows the
 * accent switch. `.` is transparent.
 */
export const PALETTE: Record<string, string> = {
  H: "#cdb98a", // hat felt
  h: "#9c8a62", // hat shade
  B: "var(--accent)", // hat band
  K: "#14101c", // face void
  E: "#ffd93b", // eyes
  R: "#3d63e8", // robe
  r: "#6f93ff", // robe light
  D: "#2a40a8", // robe shade
  T: "#f3ecd8", // trim
  S: "#7a4a2b", // staff and shoes
  G: "#e84a4a", // staff gem
};

export const IDLE = [
  "......HH........",
  ".....HHHh.......",
  "....HHHHHh......",
  "...HHHHHHHh.....",
  "..BBBBBBBBBB....",
  ".HHHHHHHHHHhh...",
  "...KKKKKKKK..G..",
  "...KEEKKEEK..S..",
  "...KEEKKEEK..S..",
  "...KKKKKKKK..S..",
  "..RRRRRRRRRRRS..",
  ".RRrRRRRRRrRRS..",
  ".RRRTTTTTTRRRS..",
  ".RRRRRRRRRRRR...",
  "..DRRRRRRRRD....",
  "..SS......SS....",
];

/** Rows 7–8 with the eyes shut or happy, swapped in for blinks and cheer. */
export const BLINK = ["...KKKKKKKK..S..", "...KEEKKEEK..S.."];
export const CLOSED = ["...KKKKKKKK..S..", "...KKKKKKKK..S.."];
