// Alerta al cargar la página (primer ingreso)
// alert("Estás en YouTube — cuidado con procrastinar.");

// YouTube es SPA; detectamos cambios de URL internos para volver a alertar (con throttle)
/*
let lastUrl = location.href;
let lastAlert = Date.now();

const maybeAlert = () => {
  const now = Date.now();
  // Evita spamear: máx. una alerta cada 60s
  if (now - lastAlert > 60_000) {
    lastAlert = now;
    alert("Estás navegando en YouTube — foco, foco");
  }
};

new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    maybeAlert();
  }
}).observe(document, { subtree: true, childList: true });
*/

const SHOW_DELAY_MS = 10_000;
const LOCK_DURATION_MS = 30_000;
const THROTTLE_MS = 60_000;
const BANNER_ID = "focusguard-banner";

let lastUrl = location.href;
let lastBannerTime = 0;
let pendingTimeout = null;

const createBanner = () => {
  if (document.getElementById(BANNER_ID)) {
    return;
  }

  if (!document.body) {
    document.addEventListener("DOMContentLoaded", createBanner, { once: true });
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = BANNER_ID;
  overlay.setAttribute(
    "style",
    [
      "position: fixed",
      "inset: 0",
      "background: rgba(0, 0, 0, 0.65)",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "z-index: 2147483647",
      "font-family: 'Roboto', Arial, sans-serif",
      "color: #111",
      "padding: 16px",
      "box-sizing: border-box"
    ].join("; ")
  );

  const card = document.createElement("div");
  card.setAttribute(
    "style",
    [
      "background: #fff",
      "border-radius: 16px",
      "box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35)",
      "max-width: 420px",
      "width: 100%",
      "text-align: center",
      "padding: 32px 28px",
      "position: relative"
    ].join("; ")
  );

  const title = document.createElement("h2");
  title.textContent = "Respira y recupera tu enfoque";
  title.setAttribute(
    "style",
    [
      "margin: 0 0 12px",
      "font-size: 22px",
      "font-weight: 700",
      "color: #c62828"
    ].join("; ")
  );

  const message = document.createElement("p");
  message.textContent = "Recuerda tu objetivo y avanza un paso a la vez.";
  message.setAttribute(
    "style",
    [
      "margin: 0 0 20px",
      "font-size: 16px",
      "line-height: 1.5",
      "color: #333"
    ].join("; ")
  );

  const countdown = document.createElement("div");
  countdown.setAttribute(
    "style",
    [
      "font-size: 24px",
      "font-weight: 600",
      "margin-bottom: 24px",
      "color: #111"
    ].join("; ")
  );

  const closeButton = document.createElement("button");
  closeButton.textContent = "Cerrar";
  closeButton.disabled = true;
  closeButton.setAttribute(
    "style",
    [
      "padding: 10px 24px",
      "font-size: 16px",
      "border-radius: 999px",
      "border: none",
      "background: #bdbdbd",
      "color: #fff",
      "cursor: not-allowed",
      "transition: background 0.3s, cursor 0.3s"
    ].join("; ")
  );

  let remaining = LOCK_DURATION_MS / 1000;
  const updateCountdown = () => {
    if (remaining > 0) {
      countdown.textContent = `Cuenta regresiva: ${remaining}s`;
    } else {
      countdown.textContent = "Cuenta regresiva finalizada";
    }
  };

  updateCountdown();

  const intervalId = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      updateCountdown();
      return;
    }

    clearInterval(intervalId);
    updateCountdown();
    closeButton.disabled = false;
    closeButton.style.background = "#d32f2f";
    closeButton.style.cursor = "pointer";
    closeButton.style.boxShadow = "0 8px 20px rgba(211, 47, 47, 0.35)";
  }, 1_000);

  closeButton.addEventListener("click", () => {
    if (closeButton.disabled) {
      return;
    }
    clearInterval(intervalId);
    overlay.remove();
  });

  card.appendChild(title);
  card.appendChild(message);
  card.appendChild(countdown);
  card.appendChild(closeButton);
  overlay.appendChild(card);

  document.body.appendChild(overlay);
};

const maybeShowBanner = () => {
  const now = Date.now();
  if (now - lastBannerTime < THROTTLE_MS) {
    return;
  }
  lastBannerTime = now;
  createBanner();
};

const scheduleBanner = () => {
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
  }
  pendingTimeout = setTimeout(() => {
    pendingTimeout = null;
    maybeShowBanner();
  }, SHOW_DELAY_MS);
};

scheduleBanner();

new MutationObserver(() => {
  const url = location.href;
  if (url === lastUrl) {
    return;
  }
  lastUrl = url;
  scheduleBanner();
}).observe(document, { subtree: true, childList: true });
