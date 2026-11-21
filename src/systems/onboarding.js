import { safeStorageGet, safeStorageSet } from "../services/storage.js?v=20261122g";
import { playClickSfx, playWinSfx } from "./sfx.js?v=20261122g";

const ONBOARDING_KEY = "songspot_onboarding_done_v1";

const TOUR_STEPS = [
  {
    emoji: "🎵",
    title: "ברוכים הבאים ל״נחש את השיר״!",
    desc: "זהו להיטים ישראליים משבריר שנייה, צברו קריסטלים, פתחו עיצובים ושברו שיאים מול חברים.",
    targetId: null
  },
  {
    emoji: "▶️",
    title: "מתחילים לשחק בלחיצה אחת",
    desc: "לחצו על הכפתור הגדול כדי להתחיל מיד! מתחתיו תראו את השיא שלכם וכפתור להחלפת מצב משחק או סינון ז'אנרים.",
    targetId: "home-quickplay-btn"
  },
  {
    emoji: "🎮",
    title: "מצבי משחק והחלקה מהירה",
    desc: "בלשונית ״משחקים״ מחכים לכם מרתון 10 שאלות, הפוך על הפוך, ציר זמן, 60 שניות ואתגר יומי. טיפ: אפשר גם פשוט להחליק ימינה ושמאלה במסך הבית!",
    targetId: "nav-modes-btn"
  },
  {
    emoji: "💎",
    title: "קריסטלים, חנות ומשימות יומיות",
    desc: "כל זיהוי ומשימה יומית נותנים קריסטלים — היכנסו לחנות לרכוש ערכות נושא, רקעים ועזרים כמו מגן רצף ו-50/50!",
    targetId: "home-points-btn"
  },
  {
    emoji: "👥",
    title: "חברים, פרופיל ודירוג עולמי",
    desc: "הירשמו בפרופיל כדי לשמור התקדמות בענן, לקבל Player ID אישי, להוסיף חברים ולהתחרות בדירוג העולמי!",
    targetId: "home-friends-btn"
  }
];

let stepIndex = 0;
let isTourOpen = false;
let highlightedEl = null;
let listenersBound = false;

function clearHighlight() {
  if (highlightedEl) {
    highlightedEl.classList.remove("tour-spotlight-target");
    highlightedEl = null;
  }
}

export function isOnboardingOpen() {
  return isTourOpen;
}

function finishTour() {
  isTourOpen = false;
  clearHighlight();
  safeStorageSet(ONBOARDING_KEY, "1");
  const overlay = document.getElementById("onboarding-overlay");
  if (overlay) overlay.classList.remove("open");
}

function renderStep() {
  const step = TOUR_STEPS[stepIndex];
  if (!step) return finishTour();

  clearHighlight();
  if (step.targetId) {
    const target = document.getElementById(step.targetId);
    if (target) {
      target.classList.add("tour-spotlight-target");
      highlightedEl = target;
    }
  }

  const emojiEl = document.getElementById("ob-emoji");
  const titleEl = document.getElementById("ob-title");
  const descEl = document.getElementById("ob-desc");
  const dotsEl = document.getElementById("ob-dots");
  const nextBtn = document.getElementById("ob-next-btn");
  const stepLabel = document.getElementById("ob-step-counter");

  if (emojiEl) emojiEl.textContent = step.emoji;
  if (titleEl) titleEl.textContent = step.title;
  if (descEl) descEl.textContent = step.desc;
  if (stepLabel) stepLabel.textContent = `${stepIndex + 1} / ${TOUR_STEPS.length}`;
  if (nextBtn) {
    nextBtn.textContent = stepIndex === TOUR_STEPS.length - 1 ? "בואו נשחק! 🎵" : "הבא ←";
  }

  if (dotsEl) {
    dotsEl.innerHTML = "";
    TOUR_STEPS.forEach((_, idx) => {
      const dot = document.createElement("span");
      dot.className = `ob-dot${idx === stepIndex ? " active" : ""}`;
      dotsEl.appendChild(dot);
    });
  }
}

function bindListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const skipBtn = document.getElementById("ob-skip-btn");
  const nextBtn = document.getElementById("ob-next-btn");

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      playClickSfx();
      finishTour();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (stepIndex >= TOUR_STEPS.length - 1) {
        playWinSfx();
        finishTour();
      } else {
        playClickSfx();
        stepIndex++;
        renderStep();
      }
    });
  }
}

export function startOnboardingTour(force = false) {
  bindListenersOnce();
  if (!force && safeStorageGet(ONBOARDING_KEY) === "1") return;
  stepIndex = 0;
  isTourOpen = true;
  const overlay = document.getElementById("onboarding-overlay");
  if (overlay) overlay.classList.add("open");
  renderStep();
}
