import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import FocusGuardBanner from './src/components/FocusGuardBanner.vue';
import './src/styles/focusguard-banner.css';

const SHOW_DELAY_MS = 10_000;
const LOCK_DURATION_MS = 30_000;
const THROTTLE_MS = 200_000;
const BANNER_ROOT_ID = 'focusguard-banner-root';

let lastUrl = location.href;
let lastBannerTime = 0;
let pendingTimeout = null;
let activeCleanup = null;
let activeRoot = null;
let activeApp = null;

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

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', createBanner, { once: true });
    return;
  }

  const container = document.createElement('div');
  container.id = BANNER_ROOT_ID;
  document.body.appendChild(container);
  activeRoot = container;

  const cleanup = () => {
    if (activeApp) {
      activeApp.unmount();
      activeApp = null;
    }
    if (container.isConnected) {
      container.remove();
    }
    if (activeRoot === container) {
      activeRoot = null;
    }
    activeCleanup = null;
  };

  try {
    const app = createApp(FocusGuardBanner, {
      lockDuration: LOCK_DURATION_MS,
      messages: MOTIVATIONAL_MESSAGES,
      onRequestClose: () => {
        cleanup();
      }
    });

    app.use(PrimeVue);

    activeApp = app;
    activeCleanup = cleanup;

    app.mount(container);
  } catch (error) {
    console.error('No se pudo montar el banner de FocusGuard', error);
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
