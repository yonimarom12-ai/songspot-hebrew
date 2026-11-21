// קונפיגורציה מאוחדת לכל רמות הקושי
export const DIFFICULTIES = {
  easy: {
    label: "קל",
    color: "#1ed760",
    glow: "rgba(30, 215, 96, 0.55)",
    streamsText: "15M - 50M+ השמעות",
    pointsMultiplier: 1,
    tiers: { superstars: [0, 7] }
  },
  medium: {
    label: "בינוני",
    color: "#f5c518",
    glow: "rgba(245, 197, 24, 0.55)",
    streamsText: "5M - 15M השמעות",
    pointsMultiplier: 1.5,
    tiers: { superstars: [4, 12], established: [0, 5] }
  },
  hard: {
    label: "קשה",
    color: "#ff8c1a",
    glow: "rgba(255, 140, 26, 0.55)",
    streamsText: "1M - 5M השמעות",
    pointsMultiplier: 2,
    tiers: { superstars: [12, 24], established: [5, 15] }
  },
  very_hard: {
    label: "קשה מאוד",
    color: "#ff4d4d",
    glow: "rgba(255, 77, 77, 0.55)",
    streamsText: "300K - 1M השמעות",
    pointsMultiplier: 3,
    tiers: { established: [15, 32], indie_deep: [0, 8] }
  },
  impossible: {
    label: "בלתי אפשרי",
    color: "#b86eff",
    glow: "rgba(184, 110, 255, 0.55)",
    streamsText: "פחות מ-300K השמעות",
    pointsMultiplier: 4,
    tiers: { established: [32, 55], indie_deep: [8, 45] }
  }
};

export const DIFFICULTY_ORDER = Object.keys(DIFFICULTIES);

// נקודות בסיס לרמה הקלה לפי זמן זיהוי (בשניות)
export const BASE_POINTS_BY_DURATION = {
  "0.1": 10,
  "0.5": 5,
  "2": 2,
  "8": 1,
  "15": 0.5
};

export const GENRE_LABELS = {
  all: "כל הז'אנרים",
  pop: "פופ",
  mizrahi: "מזרחית",
  rock_classics: "רוק וקלאסיקות",
  hiphop: "היפ-הופ",
  soul_faith: "נשמה ויוצרים",
  indie: "אינדי"
};

export const DECADE_LABELS = {
  "all": "כל העשורים",
  "1970-1990": "70s-80s",
  "1990-2000": "1990–2000",
  "2000-2010": "2000–2010",
  "2010-2020": "2010–2020",
  "2020-2030": "2020+"
};

export const DURATIONS = [0.1, 0.5, 2, 8, 15];
export const STAGE_STOPS_PCT = [2.5, 8, 25, 50, 100];
export const START_OFFSET = 0.25;
