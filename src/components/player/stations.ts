/**
 * What the tape deck plays. Two sources, both played by the deck's own
 * <audio> element so the cassette and its keys drive either one:
 *
 * - Tapes: audio files the site itself serves from /public/lofi, listed in
 *   /lofi/playlist.json (written by scripts/fetch-lofi.ts, which also imports
 *   our own mp3s). Only music we own, CC0 or CC-BY goes here, because
 *   shipping a file is redistributing it.
 * - Radio: SomaFM's public Icecast streams. They are plain MP3 over HTTPS,
 *   free to listen to in any player, so no third-party iframe is needed
 *   (Spotify's embed can't be restyled and YouTube's refuses the deck). The
 *   stream connects only after a click, never on page load.
 */

export interface Tape {
  src: string;
  title: string;
  artist: string;
  /** SPDX-style id, e.g. "CC0-1.0" or "CC-BY-4.0", or "All rights reserved" for our own. */
  license: string;
  /** Page the track was taken from, for the credit line. */
  source?: string;
}

export interface Playlist {
  name: string;
  tracks: Tape[];
}

export const PLAYLIST_URL = "/lofi/playlist.json";

export interface Station {
  id: string;
  name: string;
  by: string;
  stream: string;
  /** The station's own page, for the credit line. */
  home: string;
}

export const STATIONS: Station[] = [
  {
    id: "fluid",
    name: "Fluid",
    by: "SomaFM · instrumental hip hop",
    stream: "https://ice2.somafm.com/fluid-128-mp3",
    home: "https://somafm.com/fluid/",
  },
  {
    id: "groovesalad",
    name: "Groove Salad",
    by: "SomaFM · downtempo",
    stream: "https://ice2.somafm.com/groovesalad-128-mp3",
    home: "https://somafm.com/groovesalad/",
  },
  {
    id: "vaporwaves",
    name: "Vaporwaves",
    by: "SomaFM · vaporwave",
    stream: "https://ice2.somafm.com/vaporwaves-128-mp3",
    home: "https://somafm.com/vaporwaves/",
  },
];
