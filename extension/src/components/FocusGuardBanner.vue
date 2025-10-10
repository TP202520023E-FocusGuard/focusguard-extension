<template>
  <div class="focusguard-banner__overlay">
    <div class="focusguard-banner__backdrop" />
    <Card class="focusguard-banner__panel">
      <template #title>
        <div class="focusguard-banner__header">
          <Tag severity="info" value="Alerta de enfoque" class="focusguard-banner__badge" />
          <h2 class="focusguard-banner__title">{{ headline }}</h2>
        </div>
      </template>
      <template #content>
        <p class="focusguard-banner__message">{{ message }}</p>
        <blockquote class="focusguard-banner__quote">“{{ tip }}”</blockquote>
        <div class="focusguard-countdown">
          <span class="focusguard-countdown__label">{{ statusLabel }}</span>
          <span class="focusguard-countdown__value">{{ countdownLabel }}</span>
        </div>
        <ProgressBar class="focusguard-progress" :value="progressValue" />
        <div class="focusguard-actions">
          <p class="focusguard-actions__hint">{{ actionHint }}</p>
          <Button
            class="focusguard-actions__button"
            severity="warning"
            :disabled="isLocked"
            @click="closeBanner"
          >
            {{ ctaLabel }}
          </Button>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import ProgressBar from 'primevue/progressbar';
import Tag from 'primevue/tag';

const AUTO_CLOSE_DELAY_MS = 8_000;

const props = defineProps({
  lockDuration: {
    type: Number,
    required: true
  },
  messages: {
    type: Array,
    default: () => []
  },
  onRequestClose: {
    type: Function,
    default: null
  }
});

const totalSeconds = Math.max(1, Math.round(props.lockDuration / 1000));
const remaining = ref(totalSeconds);
const selection = ref(
  props.messages.length
    ? props.messages[Math.floor(Math.random() * props.messages.length)]
    : {
        headline: 'Respira y recupera tu enfoque',
        message: 'Regresa a tu intención original y elige tu siguiente paso con calma.',
        tip: 'Solo 30 segundos separan una distracción de una decisión consciente.'
      }
);

const isLocked = computed(() => remaining.value > 0);
const progressValue = computed(() => {
  const completed = totalSeconds - remaining.value;
  return Math.min(100, Math.max(0, (completed / totalSeconds) * 100));
});
const statusLabel = computed(() => (isLocked.value ? 'Cuenta regresiva' : 'Listo para continuar'));
const countdownLabel = computed(() => `${Math.max(0, remaining.value)} s`);
const actionHint = computed(() =>
  isLocked.value
    ? 'Aprovecha estos segundos para respirar profundamente.'
    : 'Elige conscientemente si continuar o regresar a tu objetivo principal.'
);
const ctaLabel = computed(() => (isLocked.value ? 'Espera…' : 'Seguir enfocado'));

let countdownIntervalId = null;
let autoCloseTimeoutId = null;

const stopTimers = () => {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
  if (autoCloseTimeoutId) {
    clearTimeout(autoCloseTimeoutId);
    autoCloseTimeoutId = null;
  }
};

const requestClose = () => {
  if (typeof props.onRequestClose === 'function') {
    props.onRequestClose();
  }
};

const closeBanner = () => {
  if (isLocked.value) {
    return;
  }
  stopTimers();
  requestClose();
};

onMounted(() => {
  countdownIntervalId = window.setInterval(() => {
    if (remaining.value <= 0) {
      remaining.value = 0;
      stopTimers();
      autoCloseTimeoutId = window.setTimeout(() => {
        requestClose();
      }, AUTO_CLOSE_DELAY_MS);
      return;
    }
    remaining.value -= 1;
  }, 1_000);
});

onBeforeUnmount(() => {
  stopTimers();
});

const headline = computed(() => selection.value.headline);
const message = computed(() => selection.value.message);
const tip = computed(() => selection.value.tip);
</script>

<style scoped>
.focusguard-banner__overlay {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
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
  border-radius: 22px;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92));
  color: #e2e8f0;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
}

.focusguard-banner__panel :deep(.p-card-body) {
  padding: 28px 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.focusguard-banner__header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.focusguard-banner__badge {
  align-self: flex-start;
  letter-spacing: 0.06em;
  font-weight: 600;
  text-transform: uppercase;
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
  border-radius: 999px;
  overflow: hidden;
  height: 6px;
  background: rgba(148, 163, 184, 0.3);
}

.focusguard-progress :deep(.p-progressbar-value) {
  background: linear-gradient(90deg, #60a5fa, #a855f7);
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
  border-radius: 999px;
  padding: 12px 20px;
  font-weight: 600;
  font-size: 0.95rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
  border: none;
}

.focusguard-actions__button:enabled:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(249, 115, 22, 0.3);
  filter: brightness(1.05);
}
</style>
