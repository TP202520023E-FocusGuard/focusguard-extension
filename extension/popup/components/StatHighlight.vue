<template>
  <Card class="stat-highlight" :class="toneClass">
    <template #header>
      <div class="stat-highlight__header">
        <span class="stat-highlight__icon">{{ icon }}</span>
        <span class="stat-highlight__label">{{ label }}</span>
      </div>
    </template>
    <template #content>
      <div class="stat-highlight__value-line">
        <Tag :severity="tagSeverity" rounded class="stat-highlight__tag">
          {{ value }}
        </Tag>
      </div>
      <p v-if="subtitle" class="stat-highlight__subtitle">{{ subtitle }}</p>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Card from 'primevue/card';
import Tag from 'primevue/tag';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

const props = defineProps<{
  icon?: string;
  label: string;
  value: string;
  subtitle?: string;
  tone?: Tone;
}>();

const toneClass = computed(() => (props.tone ? `stat-highlight--${props.tone}` : null));

const tagSeverity = computed(() => {
  switch (props.tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warn';
    case 'danger':
      return 'danger';
    default:
      return 'secondary';
  }
});
</script>

<style scoped>
.stat-highlight {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.05);
  background: rgba(248, 250, 252, 0.9);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.stat-highlight:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 24px rgba(15, 23, 42, 0.12);
}

.stat-highlight :deep(.p-card-header) {
  padding: 16px 18px 0;
  border-bottom: none;
}

.stat-highlight :deep(.p-card-body) {
  padding: 16px 18px 20px;
}

.stat-highlight__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-highlight__icon {
  font-size: 1.5rem;
}

.stat-highlight__label {
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 600;
}

.stat-highlight__value-line {
  margin-bottom: 10px;
}

.stat-highlight__tag {
  font-size: 1.05rem;
  font-weight: 600;
  padding: 0.35rem 0.9rem;
}

.stat-highlight__subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.4;
}

.stat-highlight--success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(34, 197, 94, 0));
  border-color: rgba(34, 197, 94, 0.35);
}

.stat-highlight--danger {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(239, 68, 68, 0));
  border-color: rgba(239, 68, 68, 0.35);
}

.stat-highlight--warning {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(249, 115, 22, 0));
  border-color: rgba(249, 115, 22, 0.35);
}
</style>
