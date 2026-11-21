import { dom } from "../dom.js?v=20261122e";

// אפקט קונפטי בניצחון
const confettiCtx = dom.confettiCanvas ? dom.confettiCanvas.getContext("2d") : null;
let confettiParticles = [];
let confettiAnimId = null;

export function launchWinConfetti() {
  if (!confettiCtx || !dom.confettiCanvas) return;
  cancelAnimationFrame(confettiAnimId);
  dom.confettiCanvas.width = window.innerWidth;
  dom.confettiCanvas.height = window.innerHeight;
  const colors = ["#1DB954", "#1ed760", "#f5c518", "#b86eff", "#ffffff", "#ff8c1a"];
  confettiParticles = Array.from({ length: 95 }, () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 180,
    y: window.innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 15,
    vy: -Math.random() * 14 - 5,
    size: Math.random() * 7 + 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 11,
    gravity: 0.34,
    opacity: 1
  }));

  function stepConfetti() {
    confettiCtx.clearRect(0, 0, dom.confettiCanvas.width, dom.confettiCanvas.height);
    let activeCount = 0;
    for (const p of confettiParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.rotSpeed;
      if (p.y > dom.confettiCanvas.height * 0.75) {
        p.opacity = Math.max(0, p.opacity - 0.025);
      }
      if (p.opacity > 0 && p.y < dom.confettiCanvas.height + 30) {
        activeCount++;
        confettiCtx.save();
        confettiCtx.globalAlpha = p.opacity;
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        confettiCtx.restore();
      }
    }
    if (activeCount > 0) {
      confettiAnimId = requestAnimationFrame(stepConfetti);
    } else {
      confettiCtx.clearRect(0, 0, dom.confettiCanvas.width, dom.confettiCanvas.height);
    }
  }
  confettiAnimId = requestAnimationFrame(stepConfetti);
}
