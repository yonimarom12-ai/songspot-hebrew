import { dom } from "../dom.js?v=20261123b";
import { state } from "../state.js?v=20261123b";
import { loadAccountsMap, saveAccountsMap, loadUserStats, normalizeStatsObj, safeStorageSet, safeStorageRemove } from "../services/storage.js?v=20261123b";
import { cloudAuthRequest, setSessionToken } from "../services/cloud.js?v=20261123b";
import { stopGalleryPreview } from "./gallery.js?v=20261123b";
import { updateStreakDisplay, renderProfileStatsModal } from "./profile.js?v=20261123b";
import { updatePointsDisplay } from "./economy.js?v=20261123b";
import { applyEquippedCosmetics, clearShopPreview } from "./shop.js?v=20261123b";
import { applyUserPreferencesFromStats } from "./drawer.js?v=20261123b";

// מערכת הרשמה, התחברות ושחזור סיסמא במודאל הפרופיל
const USERNAME_ALLOWED_REGEX = /^[a-zA-Z\u0590-\u05FF0-9_?!]+$/;

function syncAuthUI() {
  clearShopPreview();
  updateStreakDisplay();
  updatePointsDisplay();
  applyEquippedCosmetics();
  applyUserPreferencesFromStats();
  renderProfileStatsModal();
}

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

  dom.registerForm.addEventListener("submit", async (e) => {
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

    // שומר את החשבון ומעביר אליו את הסטטיסטיקות הנוכחיות שנצברו כ"אורח" (ללא קריסטלים מאורח)
    const initialStats = normalizeStatsObj({
      ...state.userStats,
      points: 0,
      totalPointsEarned: 0
    });

    const cloudRes = await cloudAuthRequest("register", {
      username,
      email,
      password,
      stats: initialStats
    });
    if (cloudRes && !cloudRes.fallback && !cloudRes.ok) {
      setAuthMessage(cloudRes.error || "שגיאה בהרשמה בענן");
      return;
    }

    const accounts = loadAccountsMap();
    if (cloudRes?.fallback && findExistingAccountKey(accounts, username)) {
      updateLiveUsernameFeedback();
      setAuthMessage("שם המשתמש כבר תפוס, אנא בחר שם אחר.");
      return;
    }

    state.userStats = initialStats;
    accounts[username] = {
      username,
      email,
      password,
      stats: state.userStats
    };
    saveAccountsMap(accounts);
    state.currentUser = username;
    safeStorageSet("songspot_current_user_v1", username);

    dom.registerForm.reset();
    updateLiveUsernameFeedback();
    setAuthMessage(cloudRes?.ok ? "נרשמת והחשבון נשמר בענן!" : "נרשמת והתחברת בהצלחה!", "success");
    syncAuthUI();
  });

  dom.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    const cloudRes = await cloudAuthRequest("login", { username, password });
    if (cloudRes && !cloudRes.fallback) {
      if (cloudRes.ok) {
        state.currentUser = cloudRes.username;
        safeStorageSet("songspot_current_user_v1", state.currentUser);
        const accounts = loadAccountsMap();
        const localStats = accounts[state.currentUser]?.stats || {};
        const cloudStats = cloudRes.stats || {};
        const mergedStats = {
          ...localStats,
          ...cloudStats,
          customAvatarData: cloudStats.customAvatarData || localStats.customAvatarData || "",
          customBackgroundData: cloudStats.customBackgroundData || localStats.customBackgroundData || ""
        };
        state.userStats = normalizeStatsObj(mergedStats);
        accounts[state.currentUser] = {
          username: state.currentUser,
          email: accounts[state.currentUser]?.email || "",
          password,
          stats: state.userStats
        };
        saveAccountsMap(accounts);
        dom.loginForm.reset();
        setAuthMessage("");
        syncAuthUI();
        return;
      }

      // משתמש ותיק שנוצר מקומית לפני חיבור D1 — נבדוק התאמה מקומית ונעביר אותו אוטומטית לענן!
      const localAccounts = loadAccountsMap();
      const localKey = findExistingAccountKey(localAccounts, username);
      const localAcc = localKey ? localAccounts[localKey] : null;
      if (localAcc && localAcc.password === password) {
        const migratedStats = normalizeStatsObj(localAcc.stats);
        await cloudAuthRequest("register", {
          username: localAcc.username,
          email: localAcc.email || "",
          password,
          stats: migratedStats
        });
        state.currentUser = localAcc.username;
        safeStorageSet("songspot_current_user_v1", state.currentUser);
        state.userStats = migratedStats;
        dom.loginForm.reset();
        setAuthMessage("התחברת והחשבון סונכרן אוטומטית לענן!", "success");
        syncAuthUI();
        return;
      }

      setAuthMessage(cloudRes.error || "שם משתמש או סיסמא שגויים.");
      return;
    }

    const accounts = loadAccountsMap();
    const matchedKey = findExistingAccountKey(accounts, username);
    const acc = matchedKey ? accounts[matchedKey] : null;
    if (!acc || acc.password !== password) {
      setAuthMessage("שם משתמש או סיסמא שגויים.");
      return;
    }

    state.currentUser = acc.username;
    safeStorageSet("songspot_current_user_v1", state.currentUser);
    state.userStats = normalizeStatsObj(acc.stats);
    dom.loginForm.reset();
    setAuthMessage("");
    syncAuthUI();
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
    const targetEmail = accounts[foundKey].email || "";

    // בניית DOM בטוחה עם textContent (ללא innerHTML על מייל משתמש)
    dom.simulatedEmailBox.textContent = "";
    const line1 = document.createElement("strong");
    line1.textContent = `📧 נשלח קוד אימות לכתובת ${targetEmail}`;
    const br = document.createElement("br");
    const line2 = document.createElement("span");
    line2.textContent = "קוד האימות שלך לשחזור הסיסמא הוא: ";
    const codeStrong = document.createElement("strong");
    codeStrong.style.color = "var(--spotify-green)";
    codeStrong.style.fontSize = "13px";
    codeStrong.style.letterSpacing = "1px";
    codeStrong.textContent = state.pendingResetCode;
    line2.appendChild(codeStrong);
    dom.simulatedEmailBox.append(line1, br, line2);

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
      safeStorageSet("songspot_current_user_v1", state.currentUser);
      state.userStats = normalizeStatsObj(accounts[state.currentUser].stats);
    }

    state.pendingResetAccountKey = null;
    state.pendingResetCode = null;
    dom.simulatedEmailBox.classList.remove("visible");
    dom.forgotStep2.style.display = "none";
    dom.forgotForm.reset();
    setAuthMessage("הסיסמא אופסה והתחברת בהצלחה!", "success");
    syncAuthUI();
  });

  dom.logoutBtn.addEventListener("click", () => {
    stopGalleryPreview();
    state.currentUser = null;
    safeStorageRemove("songspot_current_user_v1");
    setSessionToken("");
    state.userStats = loadUserStats();
    syncAuthUI();
  });
}
