// מערכת התראות Toast צפות, רטט עדין למובייל (Haptics) ואנימציית ספירה מתגלגלת (Count-Up)

export function showGameToast(message, type = "info", durationMs = 3200) {
  const stack = document.getElementById("game-toast-stack");
  if (!stack || !message) return;

  const toast = document.createElement("div");
  toast.className = `game-toast is-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 280);
  }, durationMs);
}

export function vibrateTap() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(14);
    }
  } catch (e) { }
}

export function vibrateWin() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([22, 45, 35]);
    }
  } catch (e) { }
}

export function vibrateError() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([45, 30, 45]);
    }
  } catch (e) { }
}

export function animateCountUp(el, fromVal, toVal, formatter = (v) => String(Math.round(v)), durationMs = 420) {
  if (!el) return;
  const start = Number(fromVal) || 0;
  const end = Number(toVal) || 0;
  if (start === end) {
    el.textContent = formatter(end);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = start + (end - start) * eased;
    el.textContent = formatter(val);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = formatter(end);
  };
  requestAnimationFrame(step);
}
