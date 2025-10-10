import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import 'primeicons/primeicons.css';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import ProgressBar from 'primevue/progressbar';
import Tag from 'primevue/tag';

const SHOW_DELAY_MS = 10_000;
const LOCK_DURATION_MS = 30_000;
const THROTTLE_MS = 200_000;
const BANNER_ROOT_ID = 'focusguard-banner';
const STYLE_TAG_ID = 'focusguard-banner-styles';

let lastUrl = location.href;
let lastBannerTime = 0;
let pendingTimeout = null;
let activeCleanup = null;
let activeRoot = null;

const MOTIVATIONAL_MESSAGES = [
  {
    headline: 'Respira y recupera tu enfoque',
    message: 'Regresa a tu intención original y elige tu siguiente paso con calma.',
    tip: 'Solo 30 segundos separan una distracción de una decisión consciente.'
  },
  {
    headline: 'Tu energía es valiosa',
    message: 'Convierte este alto en un recordatorio de por qué comenzaste hoy.',
    tip: 'Enfócate en una acción pequeña que puedas completar al salir de YouTube.'
  },
  {
    headline: 'Lo importante sigue esperando',
    message: 'Haz una pausa profunda y visualiza el avance que quieres lograr hoy.',
    tip: 'Un respiro ahora multiplica tu claridad cuando retomes tu tarea principal.'
  }
];

const ensureBannerStyles = () => {
  if (document.getElementById(STYLE_TAG_ID)) {
    return;
  }

  const style = document.createElement('style');
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

    .focusguard-overlay {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .focusguard-overlay__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(12, 18, 31, 0.72);
      backdrop-filter: blur(6px);
    }

    .focusguard-overlay__container {
      position: relative;
      width: min(92vw, 420px);
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .focusguard-overlay__tag.p-tag {
      align-self: flex-start;
    }

    .focusguard-overlay__card.p-card {
      background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92));
      border-radius: 22px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
      border: 1px solid rgba(148, 163, 184, 0.25);
      overflow: hidden;
    }

    .focusguard-overlay__card .p-card-body {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      color: #e2e8f0;
      padding: 28px 26px;
    }

    .focusguard-overlay__title {
      margin: 0;
      font-size: 1.6rem;
      line-height: 1.35;
      color: #ffffff;
    }

    .focusguard-overlay__subtitle {
      margin: 0;
      color: #cbd5f5;
      font-size: 1rem;
      line-height: 1.5;
    }

    .focusguard-overlay__tip.p-message {
      margin: 0;
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(148, 163, 184, 0.12);
      color: #a5b4fc;
      font-style: italic;
    }

    .focusguard-overlay__countdown {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      background: rgba(15, 23, 42, 0.55);
      border-radius: 16px;
      padding: 14px 16px;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }

    .focusguard-overlay__countdown-info {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
    }

    .focusguard-overlay__countdown-label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(148, 163, 184, 0.9);
      font-weight: 600;
    }

    .focusguard-overlay__countdown-value {
      font-size: 2.4rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .focusguard-overlay__progress.p-progressbar {
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
    }

    .focusguard-overlay__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
    }

    .focusguard-overlay__hint {
      margin: 0;
      color: rgba(203, 213, 225, 0.85);
      font-size: 0.9rem;
      flex: 1 1 180px;
      line-height: 1.4;
    }

    .focusguard-overlay__button.p-button {
      min-width: 190px;
      font-weight: 600;
    }

    .focusguard-overlay__button.p-button:disabled {
      opacity: 0.7;
    }
  `;

  document.head.appendChild(style);
};

const FocusGuardOverlay = defineComponent({
  name: 'FocusGuardOverlay',
  props: {
    lockDuration: {
      type: Number,
      required: true
    },
    autoCloseDelay: {
      type: Number,
      default: 8_000
    }
  },
  emits: ['close'],
  setup(props, { emit }) {
    const selection =
      MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];

    const totalSeconds = Math.max(0, Math.round(props.lockDuration / 1_000));
    const remaining = ref(totalSeconds);

    const isLocked = computed(() => remaining.value > 0);
    const statusLabel = computed(() =>
      isLocked.value ? 'Cuenta regresiva' : 'Listo para continuar'
    );
    const countdownLabel = computed(() => `${Math.max(0, remaining.value)}s`);
    const progressValue = computed(() => {
      if (totalSeconds <= 0) {
        return 100;
      }
      const completed = totalSeconds - remaining.value;
      return Math.min(100, Math.max(0, (completed / totalSeconds) * 100));
    });
    const hintMessage = computed(() =>
      isLocked.value
        ? 'Aprovecha estos segundos para respirar profundamente.'
        : 'Elige conscientemente si continuar o regresar a tu objetivo principal.'
    );

    let countdownId = null;
    let autoCloseId = null;
    let hasClosed = false;

    const clearCountdown = () => {
      if (countdownId !== null) {
        clearInterval(countdownId);
        countdownId = null;
      }
    };

    const clearAutoClose = () => {
      if (autoCloseId !== null) {
        clearTimeout(autoCloseId);
        autoCloseId = null;
      }
    };

    const requestClose = () => {
      if (hasClosed) {
        return;
      }
      hasClosed = true;
      clearCountdown();
      clearAutoClose();
      emit('close');
    };

    const scheduleAutoClose = () => {
      if (autoCloseId !== null) {
        return;
      }
      autoCloseId = setTimeout(requestClose, props.autoCloseDelay);
    };

    const tick = () => {
      if (remaining.value <= 1) {
        remaining.value = 0;
        clearCountdown();
        scheduleAutoClose();
      } else {
        remaining.value -= 1;
      }
    };

    onMounted(() => {
      if (totalSeconds <= 0) {
        scheduleAutoClose();
        return;
      }
      countdownId = setInterval(tick, 1_000);
    });

    onBeforeUnmount(() => {
      clearCountdown();
      clearAutoClose();
    });

    const handleClose = () => {
      if (!isLocked.value) {
        requestClose();
      }
    };

    return {
      headline: selection.headline,
      message: selection.message,
      tip: selection.tip,
      statusLabel,
      countdownLabel,
      progressValue,
      hintMessage,
      isLocked,
      handleClose
    };
  },
  template: `
    <div class="focusguard-overlay" role="dialog" aria-modal="true" aria-live="assertive">
      <div class="focusguard-overlay__backdrop"></div>
      <div class="focusguard-overlay__container">
        <Tag
          class="focusguard-overlay__tag"
          value="Alerta de enfoque"
          severity="info"
          rounded
        />
        <Card class="focusguard-overlay__card">
          <template #title>
            <h2 class="focusguard-overlay__title">{{ headline }}</h2>
          </template>
          <template #subtitle>
            <p class="focusguard-overlay__subtitle">{{ message }}</p>
          </template>
          <template #content>
            <Message
              class="focusguard-overlay__tip"
              severity="secondary"
              :closable="false"
            >
              “{{ tip }}”
            </Message>
            <div class="focusguard-overlay__countdown">
              <div class="focusguard-overlay__countdown-info">
                <span class="focusguard-overlay__countdown-label">{{ statusLabel }}</span>
                <span class="focusguard-overlay__countdown-value">{{ countdownLabel }}</span>
              </div>
              <ProgressBar
                class="focusguard-overlay__progress"
                :value="progressValue"
                :showValue="false"
              />
            </div>
          </template>
          <template #footer>
            <div class="focusguard-overlay__actions">
              <p class="focusguard-overlay__hint">{{ hintMessage }}</p>
              <Button
                class="focusguard-overlay__button"
                :label="isLocked ? 'Esperando…' : 'Seguir enfocado'"
                :disabled="isLocked"
                severity="danger"
                rounded
                @click="handleClose"
              />
            </div>
          </template>
        </Card>
      </div>
    </div>
  `
});

const destroyBanner = () => {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  activeRoot = null;
};

const createBanner = () => {
  if (activeRoot) {
    return;
  }

  ensureBannerStyles();

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', createBanner, { once: true });
    return;
  }

  const container = document.createElement('div');
  container.id = BANNER_ROOT_ID;
  document.body.appendChild(container);
  activeRoot = container;

  let appInstance = null;

  const cleanup = () => {
    if (appInstance) {
      appInstance.unmount();
      appInstance = null;
    }
    container.remove();
    if (activeRoot === container) {
      activeRoot = null;
      activeCleanup = null;
    }
  };

  try {
    appInstance = createApp(FocusGuardOverlay, {
      lockDuration: LOCK_DURATION_MS,
      autoCloseDelay: 8_000,
      onClose: cleanup
    });

    appInstance.use(PrimeVue, {
      theme: {
        preset: Aura
      }
    });

    appInstance.component('Button', Button);
    appInstance.component('Card', Card);
    appInstance.component('Message', Message);
    appInstance.component('ProgressBar', ProgressBar);
    appInstance.component('Tag', Tag);

    appInstance.mount(container);
    activeCleanup = cleanup;
  } catch (error) {
    console.error('No se pudo cargar el banner de FocusGuard', error);
    cleanup();
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
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
