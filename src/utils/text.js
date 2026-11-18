export function cleanTrackTitle(rawTitle) {
  return (rawTitle || "")
    .replace(/\s*[\(\[][^)\]]*[\)\]]\s*/g, " ")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHebrew(text) {
  return (text || "")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'״׳]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getSongKey(title, artist) {
  return `${normalizeHebrew(title)}_${normalizeHebrew(artist)}`;
}
