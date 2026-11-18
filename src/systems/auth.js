import { dom } from "../dom.js";
import { state } from "../state.js";
import { loadAccountsMap, saveAccountsMap, loadUserStats, normalizeStatsObj } from "../services/storage.js";
import { stopGalleryPreview } from "./gallery.js";
import { updateStreakDisplay, renderProfileStatsModal } from "./profile.js";
import { updatePointsDisplay } from "./economy.js";

// מערכת הרשמה, התחברות ושחזור סיסמא במודאל הפרופיל
const USERNAME_ALLOWED_REGEX = /^[a-zA-Z\u0590-\u05FF0-9_?!]+$/;

export function findExistingAccountKey(accounts, rawUsername) {
  const target = (rawUsername || "").trim().toLowerCase();
  if (!target) return null;
  return Object.keys(accounts).find(k => k.toLowerCase() === target) || null;
}

export function validateRegistrationUsername(rawUsername) {
  const username = (rawUsername || "").trim();
  if (!username) {
    return { valid: false, empty: true, message: "" };
  }
  if (!USERNAME_ALLOWED_REGEX.test(username)) {
    return {
      valid: false,
      empty: false,
      message: "ניתן להשתמש רק באותיות בעברית, אנגלית, מספרים והתווים _ ? ! (ללא רווחים)."
    };
  }
  if (username.length < 2) {
    return {
      valid: false,
      empty: false,
      message: "שם המשתמש חייב להכיל לפחות 2 תווים."
    };
  }
  const accounts = loadAccountsMap();
  if (findExistingAccountKey(accounts, username)) {
    return {
      valid: false,
      empty: false,
      message: "שם המשתמש כבר תפוס, אנא בחר שם אחר."
    };
  }
  return {
    valid: true,
    empty: false,
    message: "✓ שם משתמש פנוי ותקין"
  };
}

export function updateLiveUsernameFeedback() {
  if (!dom.regUsernameInput || !dom.regUsernameHint) return;
  const res = validateRegistrationUsername(dom.regUsernameInput.value);
  if (res.empty) {
    dom.regUsernameHint.textContent = "";
    dom.regUsernameHint.className = "username-live-hint";
    dom.regUsernameInput.classList.remove("input-valid", "input-invalid");
    return;
  }
  dom.regUsernameHint.textContent = res.message;
  dom.regUsernameHint.className = `username-live-hint ${res.valid ? "valid" : "invalid"}`;
  dom.regUsernameInput.classList.toggle("input-valid", res.valid);
  dom.regUsernameInput.classList.toggle("input-invalid", !res.valid);
}

export function setAuthMessage(text, type = "error") {
  dom.authMsg.textContent = text;
  dom.authMsg.className = `auth-msg ${type}`;
}

export function initAuthListeners() {
  if (dom.regUsernameInput) {
    dom.regUsernameInput.addEventListener("input", updateLiveUsernameFeedback);
  }

  dom.authTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.authTab;
      dom.authTabs.forEach(t => t.classList.toggle("active", t === tab));
      dom.loginForm.classList.toggle("active", target === "login");
      dom.registerForm.classList.toggle("active", target === "register");
      dom.forgotForm.classList.toggle("active", target === "forgot");
      setAuthMessage("");
    });
  });

  dom.registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawUsername = dom.regUsernameInput.value;
    const username = rawUsername.trim();
    const email = document.getElementById("reg-email").value.trim().toLowerCase();
    const password = document.getElementById("reg-password").value;

    // בדיקה שאין רווחים בתחילת/סוף/אמצע או תווים אסורים
    if (rawUsername !== username || !USERNAME_ALLOWED_REGEX.test(username)) {
      updateLiveUsernameFeedback();
      setAuthMessage("שם משתמש לא תקין: מותר להשתמש רק בעברית, אנגלית, מספרים והתווים _ ? ! (ללא רווחים).");
      return;
    }

    const validation = validateRegistrationUsername(username);
    if (!validation.valid) {
      updateLiveUsernameFeedback();
      setAuthMessage(validation.message);
      return;
    }

    if (password.length < 4) {
      setAuthMessage("הסיסמא חייבת להכיל לפחות 4 תווים.");
      return;
    }

    const accounts = loadAccountsMap();
    if (findExistingAccountKey(accounts, username)) {
      updateLiveUsernameFeedback();
      setAuthMessage("שם המשתמש כבר תפוס, אנא בחר שם אחר.");
      return;
    }

    // שומר את החשבון ומעביר אליו את הסטטיסטיקות הנוכחיות שנצברו כ"אורח"
    accounts[username] = {
      username,
      email,
      password,
      stats: state.userStats
    };
    saveAccountsMap(accounts);
    state.currentUser = username;
    localStorage.setItem("songspot_current_user_v1", username);

    dom.registerForm.reset();
    updateLiveUsernameFeedback();
    setAuthMessage("נרשמת והתחברת בהצלחה!", "success");
    updateStreakDisplay();
    updatePointsDisplay();
    renderProfileStatsModal();
  });

  dom.loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const accounts = loadAccountsMap();

    const matchedKey = findExistingAccountKey(accounts, username);
    const acc = matchedKey ? accounts[matchedKey] : null;
    if (!acc || acc.password !== password) {
      setAuthMessage("שם משתמש או סיסמא שגויים.");
      return;
    }

    state.currentUser = acc.username;
    localStorage.setItem("songspot_current_user_v1", state.currentUser);
    state.userStats = normalizeStatsObj(acc.stats);
    dom.loginForm.reset();
    setAuthMessage("");
    updateStreakDisplay();
    updatePointsDisplay();
    renderProfileStatsModal();
  });

  dom.sendResetCodeBtn.addEventListener("click", () => {
    const identifier = document.getElementById("forgot-identifier").value.trim();
    if (!identifier) {
      setAuthMessage("הזן שם משתמש או אימייל לשחזור.");
      return;
    }

    const accounts = loadAccountsMap();
    const foundKey = Object.keys(accounts).find(
      k => k.toLowerCase() === identifier.toLowerCase() || (accounts[k].email && accounts[k].email.toLowerCase() === identifier.toLowerCase())
    );

    if (!foundKey) {
      setAuthMessage("לא נמצא משתמש רשום עם פרטים אלו.");
      return;
    }

    state.pendingResetAccountKey = foundKey;
    state.pendingResetCode = String(Math.floor(100000 + Math.random() * 900000));
    const targetEmail = accounts[foundKey].email;

    dom.simulatedEmailBox.innerHTML = `
      📧 <strong>נשלח קוד אימות לכתובת ${targetEmail}</strong><br/>
      <span>קוד האימות שלך לשחזור הסיסמא הוא: <strong style="color:var(--spotify-green); font-size:13px; letter-spacing:1px;">${state.pendingResetCode}</strong></span>
    `;
    dom.simulatedEmailBox.classList.add("visible");
    dom.forgotStep2.style.display = "flex";
    setAuthMessage("קוד אימות בן 6 ספרות נשלח למייל שלך!", "success");
  });

  dom.forgotForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const codeEntered = document.getElementById("reset-code-input").value.trim();
    const newPass = document.getElementById("reset-new-password").value;

    if (!state.pendingResetAccountKey || !state.pendingResetCode) {
      setAuthMessage("בקש קוד אימות תחילה.");
      return;
    }
    if (codeEntered !== state.pendingResetCode) {
      setAuthMessage("קוד האימות שגוי. בדוק את הקוד שנשלח.");
      return;
    }
    if (newPass.length < 4) {
      setAuthMessage("הסיסמא החדשה חייבת להכיל לפחות 4 תווים.");
      return;
    }

    const accounts = loadAccountsMap();
    if (accounts[state.pendingResetAccountKey]) {
      accounts[state.pendingResetAccountKey].password = newPass;
      saveAccountsMap(accounts);
      state.currentUser = state.pendingResetAccountKey;
      localStorage.setItem("songspot_current_user_v1", state.currentUser);
      state.userStats = normalizeStatsObj(accounts[state.currentUser].stats);
    }

    state.pendingResetAccountKey = null;
    state.pendingResetCode = null;
    dom.simulatedEmailBox.classList.remove("visible");
    dom.forgotStep2.style.display = "none";
    dom.forgotForm.reset();
    setAuthMessage("הסיסמא אופסה והתחברת בהצלחה!", "success");
    updateStreakDisplay();
    updatePointsDisplay();
    renderProfileStatsModal();
  });

  dom.logoutBtn.addEventListener("click", () => {
    stopGalleryPreview();
    state.currentUser = null;
    localStorage.removeItem("songspot_current_user_v1");
    state.userStats = loadUserStats();
    updateStreakDisplay();
    updatePointsDisplay();
    renderProfileStatsModal();
  });
}
