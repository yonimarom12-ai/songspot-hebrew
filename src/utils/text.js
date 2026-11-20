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

// נרמול סלחני לכתיב מלא/חסר ואותיות סופיות בעברית (למשל "תישאר" <-> "תשאר")
export function normalizeHebrewFuzzy(text) {
  return normalizeHebrew(text)
    .replace(/ך/g, "כ")
    .replace(/ם/g, "מ")
    .replace(/ן/g, "נ")
    .replace(/ף/g, "פ")
    .replace(/ץ/g, "צ")
    .replace(/[יו]+/g, "")
    .replace(/\s+/g, "");
}

export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// בדיקת התאמה חכמה לשם שיר (כתיב מלא/חסר + שגיאות הקלדה קלות)
export function isFuzzySongMatch(rawGuess, rawTarget) {
  const guess = normalizeHebrew(rawGuess);
  const target = normalizeHebrew(rawTarget);
  if (!guess || !target) return false;
  if (guess === target) return true;

  // תת-מחרוזת משמעותית
  if (
    guess.length >= 4 &&
    guess.length >= Math.ceil(target.length * 0.65) &&
    (target.includes(guess) || guess.includes(target))
  ) {
    return true;
  }

  // השוואת כתיב מלא/חסר בעברית
  const fGuess = normalizeHebrewFuzzy(guess);
  const fTarget = normalizeHebrewFuzzy(target);
  if (fGuess.length >= 3 && fGuess === fTarget) return true;

  // שגיאת הקלדה קלה (Levenshtein)
  const compactGuess = guess.replace(/\s+/g, "");
  const compactTarget = target.replace(/\s+/g, "");
  const maxLen = Math.max(compactGuess.length, compactTarget.length);
  const maxAllowedDist = maxLen >= 9 ? 2 : (maxLen >= 4 ? 1 : 0);
  if (maxAllowedDist > 0 && levenshteinDistance(compactGuess, compactTarget) <= maxAllowedDist) {
    return true;
  }
  if (fGuess.length >= 4 && fTarget.length >= 4) {
    const fMaxDist = Math.max(fGuess.length, fTarget.length) >= 8 ? 2 : 1;
    if (levenshteinDistance(fGuess, fTarget) <= fMaxDist) return true;
  }

  return false;
}

export function getSongKey(title, artist) {
  return `${normalizeHebrew(title)}_${normalizeHebrew(artist)}`;
}
