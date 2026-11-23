import { safeStorageGet, safeStorageSet } from "../services/storage.js?v=20261123a";
import { isIOS } from "../state.js?v=20261123a";
import { playClickSfx, playWinSfx } from "./sfx.js?v=20261123a";

// מפתח v2 — מפעיל את המדריך האינטראקטיבי החדש פעם אחת גם למשתמשים ותיקים!
const ONBOARDING_KEY = "songspot_onboarding_done_v2";
let deferredInstallPrompt = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
}

function closeAuxModalsForTour() {
  ["gifts-modal-backdrop", "quests-modal-backdrop", "profile-modal-backdrop", "shop-modal-backdrop"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
  });
}

const TOUR_STEPS = [
  {
    emoji: "🎵",
    title: "ברוכים הבאים ל״נחש את השיר״!",
    desc: "הכנו לך סיור קצר ואינטראקטיבי — תלחצו בעצמכם על הכפתורים החשובים ותכירו את כל לופ המשחק תוך 30 שניות! (אפשר לדלג בכל שלב)",
    targetId: null,
    requireAction: false,
    nextLabel: "בואו נתחיל! ▶"
  },
  {
    emoji: "🎮",
    title: "שלב 1: מצבי המשחק",
    desc: "לחצו עכשיו על לשונית ״משחקים״ למטה! שם מחכים לכם מרתון 10 שאלות, 60 שניות, הפוך על הפוך, ציר זמן, אתגר יומי והשיר השבועי.",
    targetId: "nav-modes-btn",
    requireAction: true,
    dock: "top",
    actionHint: "👆 לחצו על ״משחקים״ בסרגל למטה"
  },
  {
    emoji: "🛍️",
    title: "שלב 2: חנות הקריסטלים",
    desc: "מעולה! עכשיו לחצו על ״חנות״ למטה — כאן קונים ערכות נושא, רקעים, תמונות פרופיל ועזרים (🛡️ מגן רצף, 🎯 50/50 ו-⏸️ +5ש').",
    targetId: "nav-shop-btn",
    requireAction: true,
    dock: "top",
    actionHint: "👆 לחצו על ״חנות״ בסרגל למטה"
  },
  {
    emoji: "🏠",
    title: "שלב 3: חזרה למסך הבית",
    desc: "אלופים! עכשיו לחצו על ״בית״ באמצע כדי לחזור ללובי. טיפ: אפשר גם פשוט להחליק ימינה ושמאלה בין כל הלשוניות!",
    targetId: "nav-game-btn",
    requireAction: true,
    dock: "top",
    actionHint: "👆 לחצו על כפתור ״בית״ באמצע"
  },
  {
    emoji: "🎁",
    title: "שלב 4: מתנות יומיות",
    desc: "כל יום שנכנסים מקבלים מתנה בלוח השנה השבועי (וביום ה-7 פרס ענק!). לחצו עכשיו על כפתור ה-🎁 למעלה כדי להציץ.",
    targetId: "home-gifts-btn",
    requireAction: true,
    dock: "bottom",
    actionHint: "👆 לחצו על כפתור ה-🎁 למעלה"
  },
  {
    emoji: "🎯",
    title: "שלב 5: משימות יומיות",
    desc: "ראיתם את המתנות! עכשיו לחצו על כפתור ה-🎯 למעלה — השלמת משימות יומיות נותנת קריסטלים שנספרים גם בטבלת הדירוג העולמית.",
    targetId: "home-quests-btn",
    requireAction: true,
    dock: "bottom",
    actionHint: "👆 לחצו על כפתור ה-🎯 למעלה",
    onBeforeEnter: () => {
      document.getElementById("gifts-modal-backdrop")?.classList.remove("open");
    }
  },
  {
    emoji: "👤",
    title: "שלב 6: פרופיל, ענן וחברים",
    desc: "לחצו על ״פרופיל״ למטה — שם מתחברים כדי לשמור התקדמות ותמונות בענן, בוחרים שיר/אלבום/זמר מועדף ומשתפים פרופיל עם חברים בוואטסאפ או QR!",
    targetId: "profile-btn",
    requireAction: true,
    dock: "top",
    actionHint: "👆 לחצו על ״פרופיל״ בסרגל למטה",
    onBeforeEnter: () => {
      document.getElementById("quests-modal-backdrop")?.classList.remove("open");
    }
  },
  {
    emoji: "📲",
    title: "מוכנים לשחק! (טיפ: הוסיפו למסך הבית)",
    desc: isIOS
      ? "סיימתם את הסיור! רוצים חוויית אפליקציה מלאה? ב-Safari לחצו ⬆️ שיתוף ← ״הוסף למסך הבית״."
      : "סיימתם את הסיור! רוצים חוויית אפליקציה מלאה? ב-Chrome לחצו ⋮ ← ״הוסף למסך הבית״ / ״התקן אפליקציה״.",
    targetId: null,
    requireAction: false,
    showInstallDemo: true,
    nextLabel: "יאללה, בואו נשחק! 🎵",
    onBeforeEnter: () => {
      closeAuxModalsForTour();
      document.getElementById("nav-game-btn")?.click();
    }
  }
];

let stepIndex = 0;
let isTourOpen = false;
let highlightedEl = null;
let activeActionCleanup = null;
let listenersBound = false;

function clearHighlight() {
  if (activeActionCleanup) {
    activeActionCleanup();
    activeActionCleanup = null;
  }
  if (highlightedEl) {
    highlightedEl.classList.remove("tour-spotlight-target");
    highlightedEl = null;
  }
}

export function isOnboardingOpen() {
  return isTourOpen;
}

function finishTour({ skipped = false } = {}) {
  isTourOpen = false;
  clearHighlight();
  safeStorageSet(ONBOARDING_KEY, "1");
  const overlay = document.getElementById("onboarding-overlay");
  if (overlay) {
    overlay.classList.remove("open", "is-interactive", "dock-top", "dock-bottom");
  }
  if (skipped) {
    closeAuxModalsForTour();
    document.getElementById("nav-game-btn")?.click();
  }
}

function advanceStep() {
  if (!isTourOpen) return;
  if (stepIndex >= TOUR_STEPS.length - 1) {
    playWinSfx();
    finishTour();
  } else {
    stepIndex++;
    renderStep();
  }
}

function renderStep() {
  const step = TOUR_STEPS[stepIndex];
  if (!step) return finishTour();

  clearHighlight();
  if (typeof step.onBeforeEnter === "function") {
    step.onBeforeEnter();
  }

  const overlay = document.getElementById("onboarding-overlay");
  const emojiEl = document.getElementById("ob-emoji");
  const titleEl = document.getElementById("ob-title");
  const descEl = document.getElementById("ob-desc");
  const dotsEl = document.getElementById("ob-dots");
  const nextBtn = document.getElementById("ob-next-btn");
  const actionPill = document.getElementById("ob-action-pill");
  const skipStepBtn = document.getElementById("ob-skip-step-btn");
  const stepLabel = document.getElementById("ob-step-counter");
  const demoBox = document.getElementById("ob-install-demo");
  const installNowBtn = document.getElementById("ob-install-now-btn");

  const isInteractive = Boolean(step.requireAction && step.targetId);
  if (overlay) {
    overlay.classList.toggle("is-interactive", isInteractive);
    overlay.classList.toggle("dock-top", isInteractive && step.dock === "top");
    overlay.classList.toggle("dock-bottom", isInteractive && step.dock === "bottom");
  }

  if (step.targetId) {
    const target = document.getElementById(step.targetId);
    if (target) {
      target.classList.add("tour-spotlight-target");
      highlightedEl = target;

      if (step.requireAction) {
        const onTargetTap = () => {
          playWinSfx();
          clearHighlight();
          // לא סוגרים ולא עוברים אוטומטית — המשתמש בוחן את החלון/מסך ומאשר ידנית "הבנתי, המשך ←"
          if (actionPill) {
            actionPill.textContent = "✓ מעולה! בדקו את המסך ולחצו המשך כשמוכנים";
            actionPill.style.display = "inline-flex";
          }
          if (skipStepBtn) skipStepBtn.style.display = "none";
          if (nextBtn) {
            nextBtn.style.display = "block";
            nextBtn.textContent = "הבנתי, המשך ←";
          }
        };
        target.addEventListener("click", onTargetTap, { once: true });
        activeActionCleanup = () => target.removeEventListener("click", onTargetTap);
      }
    }
  }

  if (emojiEl) emojiEl.textContent = step.emoji;
  if (titleEl) titleEl.textContent = step.title;
  if (descEl) descEl.textContent = step.desc;
  if (stepLabel) stepLabel.textContent = `${stepIndex + 1} / ${TOUR_STEPS.length}`;

  if (demoBox) {
    demoBox.style.display = step.showInstallDemo ? "flex" : "none";
    demoBox.classList.toggle("is-android", !isIOS);
  }
  if (installNowBtn) {
    installNowBtn.style.display = (step.showInstallDemo && deferredInstallPrompt) ? "block" : "none";
  }

  if (isInteractive) {
    if (nextBtn) nextBtn.style.display = "none";
    if (actionPill) {
      actionPill.textContent = step.actionHint || "👆 לחצו על האלמנט המסומן";
      actionPill.style.display = "inline-flex";
    }
    if (skipStepBtn) skipStepBtn.style.display = "inline-block";
  } else {
    if (actionPill) actionPill.style.display = "none";
    if (skipStepBtn) skipStepBtn.style.display = "none";
    if (nextBtn) {
      nextBtn.style.display = "block";
      nextBtn.textContent = step.nextLabel || (stepIndex === TOUR_STEPS.length - 1 ? "יאללה, בואו נשחק! 🎵" : "הבא ←");
    }
  }

  if (dotsEl) {
    dotsEl.innerHTML = "";
    TOUR_STEPS.forEach((_, idx) => {
      const dot = document.createElement("span");
      dot.className = `ob-dot${idx === stepIndex ? " active" : idx < stepIndex ? " done" : ""}`;
      dotsEl.appendChild(dot);
    });
  }
}

function bindListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const skipBtn = document.getElementById("ob-skip-btn");
  const nextBtn = document.getElementById("ob-next-btn");
  const skipStepBtn = document.getElementById("ob-skip-step-btn");
  const installNowBtn = document.getElementById("ob-install-now-btn");
  const replayTourBtn = document.getElementById("replay-onboarding-btn");

  if (installNowBtn) {
    installNowBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      try {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
      } catch (e) { }
      deferredInstallPrompt = null;
      installNowBtn.style.display = "none";
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      playClickSfx();
      finishTour({ skipped: true });
    });
  }

  if (skipStepBtn) {
    skipStepBtn.addEventListener("click", () => {
      playClickSfx();
      advanceStep();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (stepIndex >= TOUR_STEPS.length - 1) {
        playWinSfx();
        finishTour();
      } else {
        playClickSfx();
        advanceStep();
      }
    });
  }

  if (replayTourBtn) {
    replayTourBtn.addEventListener("click", () => {
      document.getElementById("settings-back-btn")?.click();
      setTimeout(() => startOnboardingTour(true), 120);
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
