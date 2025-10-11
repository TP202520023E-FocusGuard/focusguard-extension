const SHOW_DELAY_MS = 10_000;
const LOCK_DURATION_MS = 30_000;
const THROTTLE_MS = 200_000;
const BANNER_ROOT_ID = "focusguard-banner";
const STYLE_TAG_ID = "focusguard-banner-styles";

let lastUrl = location.href;
let lastBannerTime = 0;
let pendingTimeout = null;
let activeCleanup = null;
let activeRoot = null;

const ensureBannerStyles = () => {
  if (document.getElementById(STYLE_TAG_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = `
    #${BANNER_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      font-family: "Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }

    #${BANNER_ROOT_ID} * {
      box-sizing: border-box;
    }

    .focusguard-banner__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(12, 18, 31, 0.72);
      backdrop-filter: blur(6px);
    }

    .focusguard-banner__panel {
      position: relative;
      width: min(92vw, 420px);
      pointer-events: auto;
      background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92));
      border-radius: 22px;
      padding: 28px 26px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
      display: flex;
      flex-direction: column;
      gap: 18px;
      color: #e2e8f0;
    }

    .focusguard-banner__header {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .focusguard-banner__badge {
      align-self: flex-start;
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(96, 165, 250, 0.22);
      color: #bfdbfe;
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 600;
    }

    .focusguard-banner__title {
      margin: 0;
      font-size: 1.6rem;
      line-height: 1.35;
      color: #ffffff;
    }

    .focusguard-banner__message {
      margin: 0;
      color: #cbd5f5;
      font-size: 1rem;
      line-height: 1.5;
    }

    .focusguard-banner__quote {
      margin: 0;
      padding-left: 14px;
      border-left: 3px solid rgba(148, 163, 184, 0.5);
      color: #a5b4fc;
      font-size: 0.95rem;
      line-height: 1.5;
      font-style: italic;
    }

    .focusguard-countdown {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      background: rgba(15, 23, 42, 0.55);
      border-radius: 16px;
      padding: 14px 16px;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }

    .focusguard-countdown__label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(148, 163, 184, 0.9);
      font-weight: 600;
    }

    .focusguard-countdown__value {
      font-size: 2.4rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .focusguard-progress {
      position: relative;
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(148, 163, 184, 0.3);
    }

    .focusguard-progress__bar {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, #60a5fa, #a855f7);
      transition: width 0.4s ease;
    }

    .focusguard-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .focusguard-actions__hint {
      margin: 0;
      color: rgba(203, 213, 225, 0.85);
      font-size: 0.88rem;
      flex: 1 1 180px;
      line-height: 1.4;
    }

    .focusguard-actions__button {
      border: none;
      border-radius: 999px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #f97316, #ef4444);
      color: #fff;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
    }

    .focusguard-actions__button[disabled] {
      background: rgba(148, 163, 184, 0.45);
      cursor: not-allowed;
      box-shadow: none;
      filter: none;
    }

    .focusguard-actions__button:not([disabled]):hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 28px rgba(249, 115, 22, 0.3);
      filter: brightness(1.05);
    }
  `;

  document.head.appendChild(style);
};

const destroyBanner = () => {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  activeRoot = null;
};

const createBanner = async () => {
  if (activeRoot) {
    return;
  }

  ensureBannerStyles();

  if (!document.body) {
    document.addEventListener("DOMContentLoaded", createBanner, { once: true });
    return;
  }

  const container = document.createElement("div");
  container.id = BANNER_ROOT_ID;
  document.body.appendChild(container);
  activeRoot = container;

  try {
    const { computed, createApp, onMounted, ref } = await import(
      "https://unpkg.com/vue@3/dist/vue.esm-browser.js"
    );

    const MOTIVATIONAL_MESSAGES = [
      {
        headline: "Respira y recupera tu enfoque",
        message: "Regresa a tu intención original y elige tu siguiente paso con calma.",
        tip: "Solo 30 segundos separan una distracción de una decisión consciente."
      },
      {
        headline: "Tu energía es valiosa",
        message: "Convierte este alto en un recordatorio de por qué comenzaste hoy.",
        tip: "Enfócate en una acción pequeña que puedas completar al salir de YouTube."
      },
      {
        headline: "Lo importante sigue esperando",
        message: "Haz una pausa profunda y visualiza el avance que quieres lograr hoy.",
        tip: "Un respiro ahora multiplica tu claridad cuando retomes tu tarea principal."
      }
    ];

    const selection =
      MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];

    const totalSeconds = Math.round(LOCK_DURATION_MS / 1000);
    let intervalId = null;
    let autoCloseId = null;

    const cleanup = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (autoCloseId) {
        clearTimeout(autoCloseId);
        autoCloseId = null;
      }
      container.remove();
      if (activeRoot === container) {
        activeRoot = null;
        activeCleanup = null;
      }
    };

    const App = {
      setup() {
        const remaining = ref(totalSeconds);
        const isLocked = computed(() => remaining.value > 0);
        const progress = computed(() => {
          const completed = totalSeconds - remaining.value;
          return (completed / totalSeconds) * 100;
        });
        const progressStyle = computed(() => ({
          width: `${Math.min(100, Math.max(0, progress.value))}%`
        }));
        const statusLabel = computed(() =>
          remaining.value > 0 ? "Cuenta regresiva" : "Listo para continuar"
        );
        const countdownLabel = computed(() => `${Math.max(0, remaining.value)}s`);

        const closeBanner = () => {
          if (isLocked.value) {
            return;
          }
          cleanup();
        };

        onMounted(() => {
          intervalId = setInterval(() => {
            if (remaining.value <= 0) {
              remaining.value = 0;
              if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
              }
              if (!autoCloseId) {
                autoCloseId = setTimeout(() => {
                  if (activeRoot === container) {
                    cleanup();
                  }
                }, 8_000);
              }
              return;
            }
            remaining.value -= 1;
          }, 1_000);
        });

        return {
          headline: ref(selection.headline),
          message: ref(selection.message),
          tip: ref(selection.tip),
          statusLabel,
          countdownLabel,
          progressStyle,
          isLocked,
          closeBanner
        };
      },
      render(ctx, createElement) {
        return createElement("div", { class: "focusguard-banner" }, [
          createElement("div", { class: "focusguard-banner__backdrop" }),
          createElement("section", { class: "focusguard-banner__panel" }, [
            createElement("header", { class: "focusguard-banner__header" }, [
              createElement("span", { class: "focusguard-banner__badge" }, "Alerta de enfoque"),
              createElement("h2", { class: "focusguard-banner__title" }, ctx.headline)
            ]),
            createElement("p", { class: "focusguard-banner__message" }, ctx.message),
            createElement(
              "blockquote",
              { class: "focusguard-banner__quote" },
              `“${ctx.tip}”`
            ),
            createElement("div", { class: "focusguard-countdown" }, [
              createElement("span", { class: "focusguard-countdown__label" }, ctx.statusLabel),
              createElement("span", { class: "focusguard-countdown__value" }, ctx.countdownLabel)
            ]),
            createElement("div", { class: "focusguard-progress" }, [
              createElement("div", {
                class: "focusguard-progress__bar",
                style: ctx.progressStyle
              })
            ]),
            createElement("div", { class: "focusguard-actions" }, [
              createElement(
                "p",
                { class: "focusguard-actions__hint" },
                ctx.isLocked
                  ? "Aprovecha estos segundos para respirar profundamente."
                  : "Elige conscientemente si continuar o regresar a tu objetivo principal."
              ),
              createElement(
                "button",
                {
                  class: "focusguard-actions__button",
                  disabled: ctx.isLocked,
                  onClick: ctx.closeBanner
                },
                ctx.isLocked ? "Espera..." : "Seguir enfocado"
              )
            ])
          ])
        ]);
      }
    };

    createApp(App).mount(container);
    activeCleanup = cleanup;
  } catch (error) {
    console.error("No se pudo cargar el banner de FocusGuard", error);
    container.remove();
    activeRoot = null;
  }
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

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    scheduleBanner();
  }
});

new MutationObserver(() => {
  const url = location.href;
  if (url === lastUrl) {
    return;
  }
  lastUrl = url;
  scheduleBanner();
  destroyBanner();
}).observe(document, { subtree: true, childList: true });
