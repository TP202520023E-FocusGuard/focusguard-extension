<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

type CategoryTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'default'

interface Category {
  id: string
  nombre: string
  descripcion: string
  tone: CategoryTone
}

interface Site {
  id: string
  nombre: string
  dominio: string
  url: string
}

interface Usuario {
  id: string
  nombre: string
  correo: string
}

interface SitioUsuarioCategoria {
  id: string
  sitioId: string
  categoriaId: string
  notas?: string
}

interface Visita {
  id: string
  sitioId: string
  visitadoEn: string
}

interface DetalleSitioUsuario {
  relacion: SitioUsuarioCategoria
  sitio: Site
  categoria: Category
}

interface DetalleVisitaUsuario {
  visita: Visita
  sitio: Site
  categoria: Category
}

const usuarioActivo: Usuario = reactive({
  id: 'user-1',
  nombre: 'Laura Torres',
  correo: 'laura.torres@example.com',
})

const categorias = reactive<Category[]>([
  {
    id: 'sin-categoria',
    nombre: 'Sin Categoría',
    descripcion: 'Estado inicial para sitios que aún no tienen clasificación personalizada.',
    tone: 'default',
  },
  {
    id: 'neutral',
    nombre: 'Neutral',
    descripcion: 'Sitios informativos o que requieren revisión manual.',
    tone: 'neutral',
  },
  {
    id: 'productivo',
    nombre: 'Productivo',
    descripcion: 'Aporta directamente al trabajo o estudio del usuario.',
    tone: 'positive',
  },
  {
    id: 'doble-filo',
    nombre: 'Doble Filo',
    descripcion: 'Puede ser útil o distractor dependiendo del uso.',
    tone: 'warning',
  },
  {
    id: 'distractivo',
    nombre: 'Distractivo',
    descripcion: 'Generalmente resta foco al usuario.',
    tone: 'negative',
  },
])

const catalogoSitios = reactive<Site[]>([
  {
    id: 'sitio-1',
    nombre: 'Google Calendar',
    dominio: 'calendar.google.com',
    url: 'https://calendar.google.com',
  },
  {
    id: 'sitio-2',
    nombre: 'Notion',
    dominio: 'www.notion.so',
    url: 'https://www.notion.so',
  },
  {
    id: 'sitio-3',
    nombre: 'YouTube',
    dominio: 'www.youtube.com',
    url: 'https://www.youtube.com',
  },
])

const sitiosUsuarioCategorias = reactive<SitioUsuarioCategoria[]>([
  {
    id: 'rel-1',
    sitioId: 'sitio-1',
    categoriaId: 'productivo',
    notas: 'Agenda compartida con el equipo.',
  },
  {
    id: 'rel-2',
    sitioId: 'sitio-2',
    categoriaId: 'productivo',
    notas: 'Repositorio de documentación personal.',
  },
  {
    id: 'rel-3',
    sitioId: 'sitio-3',
    categoriaId: 'doble-filo',
    notas: 'Tutoriales y ocio, depende de la lista de reproducción.',
  },
])

const visitas = reactive<Visita[]>([
  {
    id: 'visita-1',
    sitioId: 'sitio-3',
    visitadoEn: new Date('2024-12-09T10:35:00').toISOString(),
  },
  {
    id: 'visita-2',
    sitioId: 'sitio-2',
    visitadoEn: new Date('2024-12-09T09:10:00').toISOString(),
  },
  {
    id: 'visita-3',
    sitioId: 'sitio-1',
    visitadoEn: new Date('2024-12-08T17:45:00').toISOString(),
  },
])

const defaultCategoryId = 'sin-categoria'

let idSeed = Date.now()
const createId = (prefijo: string) => {
  idSeed += 1
  return `${prefijo}-${idSeed}`
}

const visitForm = reactive({
  url: '',
  visitadoEn: formatDatetimeLocal(new Date()),
  categoriaSeleccionada: defaultCategoryId,
  notas: '',
})

const filtros = reactive({
  categoriaId: 'todas',
  termino: '',
})

const pasosUltimoRegistro = ref<string[]>([])
const mensajeFormulario = ref('')
const errorFormulario = ref('')

const catalogoDetallado = computed<DetalleSitioUsuario[]>(() =>
  sitiosUsuarioCategorias
    .map((relacion) => {
      const sitio = catalogoSitios.find((item) => item.id === relacion.sitioId)
      const categoria = categorias.find((item) => item.id === relacion.categoriaId)
      if (!sitio || !categoria) {
        return undefined
      }
      return {
        relacion,
        sitio,
        categoria,
      }
    })
    .filter((item): item is DetalleSitioUsuario => Boolean(item))
)

const catalogoFiltrado = computed<DetalleSitioUsuario[]>(() =>
  catalogoDetallado.value
    .filter((item) => {
      if (filtros.categoriaId !== 'todas' && item.categoria.id !== filtros.categoriaId) {
        return false
      }
      if (filtros.termino.trim().length > 0) {
        const termino = filtros.termino.trim().toLowerCase()
        return (
          item.sitio.nombre.toLowerCase().includes(termino) ||
          item.sitio.dominio.toLowerCase().includes(termino)
        )
      }
      return true
    })
    .sort((a, b) => a.sitio.nombre.localeCompare(b.sitio.nombre))
)

const visitasDetalladas = computed<DetalleVisitaUsuario[]>(() =>
  visitas
    .map((visita) => {
      const sitio = catalogoSitios.find((item) => item.id === visita.sitioId)
      const relacion = sitiosUsuarioCategorias.find((item) => item.sitioId === visita.sitioId)
      const categoria = relacion
        ? categorias.find((item) => item.id === relacion.categoriaId)
        : categorias.find((item) => item.id === defaultCategoryId)
      if (!sitio || !categoria) return undefined
      return {
        visita,
        sitio,
        categoria,
      }
    })
    .filter((item): item is DetalleVisitaUsuario => Boolean(item))
    .sort((a, b) => new Date(b.visita.visitadoEn).getTime() - new Date(a.visita.visitadoEn).getTime())
)

const conteoPorCategoria = computed(() =>
  catalogoDetallado.value.reduce<Record<string, number>>((acumulador, item) => {
    acumulador[item.categoria.id] = (acumulador[item.categoria.id] ?? 0) + 1
    return acumulador
  }, {})
)

const visitasPorCategoria = computed(() =>
  visitasDetalladas.value.reduce<Record<string, number>>((acumulador, item) => {
    acumulador[item.categoria.id] = (acumulador[item.categoria.id] ?? 0) + 1
    return acumulador
  }, {})
)

function formatDatetimeLocal(date: Date) {
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000
  const localISOTime = new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16)
  return localISOTime
}

function normalizarUrl(valor: string) {
  if (!valor.trim()) return null
  const candidato = valor.includes('://') ? valor : `https://${valor}`
  try {
    const url = new URL(candidato)
    return {
      dominio: url.hostname,
      url: `${url.protocol}//${url.hostname}`,
      nombre: url.hostname.replace(/^www\./, ''),
    }
  } catch (error) {
    console.error('URL inválida', error)
    return null
  }
}

function asegurarSitioEnCatalogo(dominio: string, nombre: string, url: string) {
  const existente = catalogoSitios.find((sitio) => sitio.dominio === dominio)
  if (existente) {
    return { sitio: existente, esNuevo: false }
  }
  const nuevoSitio: Site = {
    id: createId('sitio'),
    nombre,
    dominio,
    url,
  }
  catalogoSitios.push(nuevoSitio)
  return { sitio: nuevoSitio, esNuevo: true }
}

function asegurarRelacionUsuarioSitio(sitioId: string) {
  let relacion = sitiosUsuarioCategorias.find((item) => item.sitioId === sitioId)
  if (!relacion) {
    relacion = {
      id: createId('rel'),
      sitioId,
      categoriaId: defaultCategoryId,
    }
    sitiosUsuarioCategorias.push(relacion)
    return { relacion, esNueva: true }
  }
  return { relacion, esNueva: false }
}

function registrarVisita() {
  mensajeFormulario.value = ''
  errorFormulario.value = ''
  pasosUltimoRegistro.value = []

  const normalizado = normalizarUrl(visitForm.url)
  if (!normalizado) {
    errorFormulario.value = 'Ingresa una URL válida para registrar la visita.'
    return
  }

  const pasos: string[] = []
  const { sitio, esNuevo } = asegurarSitioEnCatalogo(
    normalizado.dominio,
    normalizado.nombre,
    normalizado.url,
  )
  if (esNuevo) {
    pasos.push('Se agregó un nuevo sitio al catálogo general (sitios_web).')
  }

  const { relacion, esNueva } = asegurarRelacionUsuarioSitio(sitio.id)
  if (esNueva) {
    pasos.push('Se creó la relación personalizada en sitios_web_usuario.')
  }
  if (visitForm.categoriaSeleccionada !== relacion.categoriaId) {
    const mensaje = esNueva
      ? 'Se personalizó la categoría para este usuario.'
      : 'Se actualizó la categoría personalizada existente.'
    relacion.categoriaId = visitForm.categoriaSeleccionada
    relacion.notas = visitForm.notas || undefined
    pasos.push(mensaje)
  } else if (visitForm.notas.trim().length > 0) {
    relacion.notas = visitForm.notas
  }

  const visita: Visita = {
    id: createId('visita'),
    sitioId: sitio.id,
    visitadoEn: new Date(visitForm.visitadoEn).toISOString(),
  }
  visitas.unshift(visita)
  pasos.push('Se registró la visita en sitios_web_visitados.')

  pasosUltimoRegistro.value = pasos
  mensajeFormulario.value = '¡Visita registrada correctamente!'

  visitForm.url = ''
  visitForm.visitadoEn = formatDatetimeLocal(new Date())
  visitForm.categoriaSeleccionada = relacion.categoriaId
  visitForm.notas = relacion.notas ?? ''
}

function etiquetaCategoriaTone(tone: CategoryTone) {
  switch (tone) {
    case 'positive':
      return 'pill pill--positive'
    case 'negative':
      return 'pill pill--negative'
    case 'warning':
      return 'pill pill--warning'
    case 'neutral':
      return 'pill pill--neutral'
    default:
      return 'pill'
  }
}

function actualizarCategoria(relacion: SitioUsuarioCategoria, categoriaId: string, nombreSitio: string) {
  if (relacion.categoriaId === categoriaId) return
  relacion.categoriaId = categoriaId
  pasosUltimoRegistro.value = [`Se actualizó manualmente la categoría de ${nombreSitio}.`]
  mensajeFormulario.value = ''
  errorFormulario.value = ''
}

function actualizarNotas(relacion: SitioUsuarioCategoria, nombreSitio: string, notas: string) {
  const valor = notas.trim()
  relacion.notas = valor ? valor : undefined
  pasosUltimoRegistro.value = [`Notas actualizadas para ${nombreSitio}.`]
  mensajeFormulario.value = ''
  errorFormulario.value = ''
}
</script>

<template>
  <div class="app">
    <header class="header">
      <div>
        <h1>Panel de Control de la Extensión</h1>
        <p>
          Visualiza cómo la interfaz respalda la lógica de negocio entre las tablas <strong>usuarios</strong>,
          <strong>sitios_web</strong>, <strong>categorias_web</strong>, <strong>sitios_web_usuario</strong> y
          <strong>sitios_web_visitados</strong>.
        </p>
      </div>
      <div class="header__user">
        <p class="header__user-label">Usuario activo</p>
        <p class="header__user-name">{{ usuarioActivo.nombre }}</p>
        <p class="header__user-email">{{ usuarioActivo.correo }}</p>
      </div>
    </header>

    <section class="grid">
      <article class="card card--highlight">
        <h2>Resumen del modelo de datos</h2>
        <ul class="summary">
          <li>
            <span class="summary__number">{{ catalogoSitios.length }}</span>
            <span class="summary__label">Sitios registrados en <code>sitios_web</code></span>
          </li>
          <li>
            <span class="summary__number">{{ sitiosUsuarioCategorias.length }}</span>
            <span class="summary__label">Relaciones en <code>sitios_web_usuario</code></span>
          </li>
          <li>
            <span class="summary__number">{{ visitas.length }}</span>
            <span class="summary__label">Eventos en <code>sitios_web_visitados</code></span>
          </li>
        </ul>
        <p class="summary__hint">
          Cada registro de visita se asegura de respetar el flujo de negocio: catálogo general → categorización
          personalizada → historial de visitas.
        </p>
      </article>

      <article class="card">
        <h2>Categorías disponibles (<code>categorias_web</code>)</h2>
        <ul class="category-list">
          <li v-for="categoria in categorias" :key="categoria.id" class="category-list__item">
            <span :class="etiquetaCategoriaTone(categoria.tone)">{{ categoria.nombre }}</span>
            <p>{{ categoria.descripcion }}</p>
          </li>
        </ul>
      </article>
    </section>

    <section class="card">
      <div class="card__header">
        <h2>Catálogo del usuario (<code>sitios_web_usuario</code>)</h2>
        <div class="filters">
          <label class="field">
            <span>Filtrar por categoría</span>
            <select v-model="filtros.categoriaId">
              <option value="todas">Todas</option>
              <option v-for="categoria in categorias" :key="categoria.id" :value="categoria.id">
                {{ categoria.nombre }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>Buscar por nombre o dominio</span>
            <input v-model="filtros.termino" type="search" placeholder="Ej. notion" />
          </label>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Dominio</th>
              <th>Categoría personalizada</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="catalogoFiltrado.length === 0">
              <td colspan="4" class="empty">No hay sitios que coincidan con los filtros actuales.</td>
            </tr>
            <tr v-for="item in catalogoFiltrado" :key="item.relacion.id">
              <td>
                <strong>{{ item.sitio.nombre }}</strong>
              </td>
              <td>
                <a :href="item.sitio.url" target="_blank" rel="noopener">{{ item.sitio.dominio }}</a>
              </td>
              <td>
                <select
                  v-model="item.relacion.categoriaId"
                  @change="actualizarCategoria(item.relacion, item.relacion.categoriaId, item.sitio.nombre)"
                >
                  <option v-for="categoria in categorias" :key="categoria.id" :value="categoria.id">
                    {{ categoria.nombre }}
                  </option>
                </select>
              </td>
              <td>
                <textarea
                  v-model="item.relacion.notas"
                  placeholder="Contexto para la clasificación"
                  rows="2"
                  @blur="
                    actualizarNotas(
                      item.relacion,
                      item.sitio.nombre,
                      item.relacion.notas ?? '',
                    )
                  "
                ></textarea>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="card__footer">
        <h3>Distribución por categoría</h3>
        <ul class="stats">
          <li v-for="categoria in categorias" :key="categoria.id">
            <span class="stats__label">{{ categoria.nombre }}</span>
            <span class="stats__value">{{ conteoPorCategoria[categoria.id] ?? 0 }}</span>
          </li>
        </ul>
      </footer>
    </section>

    <section class="card">
      <h2>Registrar una nueva visita</h2>
      <p class="card__intro">
        El formulario replica la lógica del backend: primero valida si el sitio existe en el catálogo general,
        luego garantiza la relación personalizada y, finalmente, persiste el evento en
        <code>sitios_web_visitados</code>.
      </p>
      <form class="form" @submit.prevent="registrarVisita">
        <label class="field">
          <span>URL visitada</span>
          <input v-model="visitForm.url" type="url" placeholder="https://app.ejemplo.com" required />
        </label>
        <label class="field">
          <span>Fecha y hora</span>
          <input v-model="visitForm.visitadoEn" type="datetime-local" required />
        </label>
        <label class="field">
          <span>Categoría para este usuario</span>
          <select v-model="visitForm.categoriaSeleccionada">
            <option v-for="categoria in categorias" :key="categoria.id" :value="categoria.id">
              {{ categoria.nombre }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Notas internas (opcional)</span>
          <textarea
            v-model="visitForm.notas"
            rows="2"
            placeholder="Ej. Visita para preparar presentación"
          ></textarea>
        </label>
        <button type="submit" class="button">Registrar visita</button>
      </form>
      <p v-if="mensajeFormulario" class="message message--success">{{ mensajeFormulario }}</p>
      <p v-if="errorFormulario" class="message message--error">{{ errorFormulario }}</p>

      <div v-if="pasosUltimoRegistro.length" class="steps">
        <h3>Pasos aplicados en el backend</h3>
        <ol>
          <li v-for="paso in pasosUltimoRegistro" :key="paso">{{ paso }}</li>
        </ol>
      </div>
    </section>

    <section class="card">
      <h2>Historial de visitas (<code>sitios_web_visitados</code>)</h2>
      <p class="card__intro">
        Cada fila muestra la unión entre el sitio global, la categoría personalizada para el usuario activo y el
        momento exacto de la visita.
      </p>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Dominio</th>
              <th>Categoría del usuario</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="visitasDetalladas.length === 0">
              <td colspan="4" class="empty">No se han registrado visitas aún.</td>
            </tr>
            <tr v-for="visita in visitasDetalladas" :key="visita.visita.id">
              <td>{{ new Date(visita.visita.visitadoEn).toLocaleString() }}</td>
              <td>
                <a :href="visita.sitio.url" target="_blank" rel="noopener">{{ visita.sitio.dominio }}</a>
              </td>
              <td>
                <span :class="etiquetaCategoriaTone(visita.categoria.tone)">{{ visita.categoria.nombre }}</span>
              </td>
              <td>
                <button
                  type="button"
                  class="button button--ghost"
                  @click="
                    filtros.termino = visita.sitio.dominio
                    filtros.categoriaId = visita.categoria.id
                  "
                >
                  Ver relación en catálogo
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="card__footer">
        <h3>Visitas por categoría</h3>
        <ul class="stats">
          <li v-for="categoria in categorias" :key="categoria.id">
            <span class="stats__label">{{ categoria.nombre }}</span>
            <span class="stats__value">{{ visitasPorCategoria[categoria.id] ?? 0 }}</span>
          </li>
        </ul>
      </footer>
    </section>
  </div>
</template>

<style scoped>
:global(body) {
  margin: 0;
  background: #0f172a;
  color: #e2e8f0;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
  padding: 1.5rem;
  border-radius: 1rem;
  background: linear-gradient(135deg, #1e3a8a, #1e40af);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.45);
}

.header h1 {
  margin: 0 0 0.5rem;
  font-size: 1.8rem;
}

.header p {
  margin: 0;
  color: #cbd5f5;
  line-height: 1.6;
}

.header__user {
  text-align: right;
  background: rgba(15, 23, 42, 0.55);
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  min-width: 220px;
}

.header__user-label {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #93c5fd;
}

.header__user-name {
  margin: 0.25rem 0 0;
  font-weight: 600;
  font-size: 1.1rem;
}

.header__user-email {
  margin: 0;
  color: #bfdbfe;
  font-size: 0.9rem;
}

.grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.card {
  background: rgba(15, 23, 42, 0.8);
  border-radius: 1rem;
  padding: 1.75rem;
  box-shadow: 0 18px 45px rgba(8, 16, 37, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.card--highlight {
  background: linear-gradient(160deg, rgba(30, 64, 175, 0.9), rgba(30, 58, 138, 0.92));
  border: 1px solid rgba(219, 234, 254, 0.2);
}

.card h2 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.4rem;
}

.card__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.card__intro {
  margin-top: 0;
  color: #cbd5f5;
  line-height: 1.6;
}

.card__footer {
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  margin-top: 1.5rem;
  padding-top: 1.25rem;
}

.summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.summary__number {
  display: block;
  font-size: 2.2rem;
  font-weight: 600;
  color: #f8fafc;
}

.summary__label {
  color: #cbd5f5;
  font-size: 0.9rem;
}

.summary__hint {
  margin-top: 1rem;
  color: #bfdbfe;
}

.category-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.category-list__item p {
  margin: 0.25rem 0 0;
  color: #cbd5f5;
  line-height: 1.5;
}

.table-wrapper {
  overflow-x: auto;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
}

thead {
  background: rgba(30, 41, 59, 0.85);
}

thead th {
  text-align: left;
  padding: 0.75rem 1rem;
  color: #bfdbfe;
  font-weight: 500;
  font-size: 0.9rem;
}

tbody td {
  padding: 0.75rem 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  vertical-align: top;
}

tbody tr:hover {
  background: rgba(30, 41, 59, 0.55);
}

tbody a {
  color: #60a5fa;
}

.empty {
  text-align: center;
  padding: 1.5rem !important;
  color: #94a3b8;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.stats__label {
  color: #94a3b8;
}

.stats__value {
  font-size: 1.4rem;
  font-weight: 600;
  color: #f8fafc;
}

.filters {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  min-width: 200px;
  color: #cbd5f5;
}

input,
select,
textarea {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  color: #e2e8f0;
  font-family: inherit;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.25);
}

textarea {
  resize: vertical;
}

.form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem 1.5rem;
  margin-bottom: 1.5rem;
}

.button {
  grid-column: 1 / -1;
  justify-self: flex-start;
  background: #60a5fa;
  color: #0f172a;
  border: none;
  border-radius: 0.75rem;
  padding: 0.75rem 1.5rem;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 30px rgba(96, 165, 250, 0.35);
}

.button:active {
  transform: translateY(0);
}

.button--ghost {
  background: transparent;
  color: #93c5fd;
  border: 1px solid rgba(148, 163, 184, 0.4);
  padding: 0.5rem 0.75rem;
  border-radius: 0.6rem;
}

.button--ghost:hover {
  background: rgba(148, 163, 184, 0.1);
}

.message {
  margin: 0.5rem 0 0;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  font-weight: 500;
}

.message--success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(134, 239, 172, 0.4);
  color: #bbf7d0;
}

.message--error {
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.steps {
  margin-top: 1.5rem;
  padding: 1.25rem;
  border-radius: 0.9rem;
  background: rgba(30, 41, 59, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.steps h3 {
  margin-top: 0;
}

.steps ol {
  margin: 0.75rem 0 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 500;
  background: rgba(148, 163, 184, 0.3);
  color: #f8fafc;
}

.pill--positive {
  background: rgba(74, 222, 128, 0.25);
  color: #bbf7d0;
}

.pill--negative {
  background: rgba(248, 113, 113, 0.25);
  color: #fecaca;
}

.pill--warning {
  background: rgba(250, 204, 21, 0.25);
  color: #fef08a;
}

.pill--neutral {
  background: rgba(148, 163, 184, 0.35);
  color: #e2e8f0;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: stretch;
  }

  .header__user {
    text-align: left;
  }

  table {
    min-width: unset;
  }

  .form {
    grid-template-columns: 1fr;
  }
}
</style>
