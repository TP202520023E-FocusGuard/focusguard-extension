<template>
  <Card class="info-block">
    <template #content>
      <div class="info-block__header">
        <span class="info-block__icon">{{ icon }}</span>
        <span class="info-block__title">{{ title }}</span>
      </div>
      <p class="info-block__description">{{ description }}</p>
    </template>
  </Card>
</template>

<script setup lang="ts">
import Card from 'primevue/card';

defineProps<{
  icon?: string;
  title: string;
  description: string;
}>();
</script>

<style scoped>
.info-block :deep(.p-card-body) {
  padding: 0;
}

.info-block__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.info-block__icon {
  font-size: 1.5rem;
}

.info-block__title {
  font-weight: 600;
  color: #0f172a;
  font-size: 1rem;
  word-break: break-word;
}

.info-block__description {
  margin: 0;
  color: #64748b;
  line-height: 1.45;
  font-size: 0.92rem;
}
</style>
