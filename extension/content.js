// Alerta al cargar la página (primer ingreso)
alert("Estás en YouTube — cuidado con procrastinar.");

// YouTube es SPA; detectamos cambios de URL internos para volver a alertar (con throttle)
let lastUrl = location.href;
let lastAlert = 0;

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
