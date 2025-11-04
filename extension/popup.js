import { computed, createApp, onMounted, ref } from "./libs/mini-vue.js";

// TODO: Enlazar con la tabla de Sitios Web
const CATEGORIES = {
  "youtube.com": "Doble filo",
  "facebook.com": "Procrastinación",
  "aulavirtual.upc.edu.pe": "Productividad",
  "google.com": "Neutral"
};

// TODO: Investigar como identificar palabras de ocio con la BD
const LEISURE_KEYWORDS = ["VEGETTA777", "VEGETTA", "MINECRAFT"];
const BREAK_TIME_MINUTES = 60;
// const BACKEND_ENDPOINT = "https://tu-backend.com/api/registrar-dominio";
const BACKEND_ENDPOINT = "http://localhost:8000/api/v1/websites";

// Obtenemos el URL sin el www.
const normaliseHost = (hostname = "") => hostname.replace(/^www\./, "").toLowerCase();

// Obtenemos la categoría asociada a la web consultada
const getCategory = (hostname) => {
  const normalised = normaliseHost(hostname);
  return CATEGORIES[normalised] ?? "Sin categoría";
};

// Se valida si el texto enviado contiene palabras de ocio o no
const includesLeisureKeyword = (text) => {
  if (!text) {
    return false;
  }
  const upper = text.toUpperCase();
  return LEISURE_KEYWORDS.some((keyword) => upper.includes(keyword));
};

const sendDomainToBackend = async (domain) => {
  if (!domain || typeof fetch === "undefined") {
    return;
  }

  try {
    const response = await fetch(BACKEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dominio: domain
      })
    });

    if (!response.ok && response.status !== 409) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    // Se ignora la respuesta del backend, pero se mantiene la promesa para posibles usos futuros.
    return response;
  } catch (error) {
    console.error("Error al enviar el dominio al backend", error);
    throw error;
  }
};

const getPageMetadata = async (tabId) => {
  if (typeof chrome === "undefined" || !chrome.scripting?.executeScript) {
    return { title: "", metaDescription: "" };
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title ?? "";
        const metaDescription =
          document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
        return { title, metaDescription };
      }
    });
    return result?.result ?? { title: "", metaDescription: "" };

  } catch (error) {
    console.error("Error al obtener metadatos de la página", error);
    return { title: "", metaDescription: "" };
  }
};

// Clasificamos si el contenido es de OCIO o NO OCIO
const resolveLeisureClassification = async (tabId, category) => {
  if (category !== "Doble filo") {
    return "No ocio"; // TODO: Actualizar para el caso en que sea PROCRASTINATIVA la categoría
  }

  const { title, metaDescription } = await getPageMetadata(tabId);
  const hasKeyword = includesLeisureKeyword(title) || includesLeisureKeyword(metaDescription);
  return hasKeyword ? "Ocio" : "No ocio";
};

// Elemento HTML compartido para la sección Categoría, Clasificación y Descanso
const StatHighlight = {
  setup(props) {
    return { props };
  },
  render(ctx, createElement) {
    const tone = ctx.props.tone ?? "neutral";
    const classes = ["stat-card", `stat-card--${tone}`].join(" ");
    return createElement("article", { class: classes }, [
      createElement("div", { class: "stat-card__icon" }, ctx.props.icon ?? ""),
      createElement("div", { class: "stat-card__body" }, [
        createElement("span", { class: "stat-card__label" }, ctx.props.label ?? ""),
        createElement("span", { class: "stat-card__value" }, ctx.props.value ?? ""),
        ctx.props.subtitle
          ? createElement("p", { class: "stat-card__subtitle" }, ctx.props.subtitle)
          : null
      ])
    ]);
  }
};

// Elemento HTML para la sección de Información del sitio
const InfoBlock = {
  setup(props) {
    return { props };
  },
  render(ctx, createElement) {
    return createElement("div", { class: "info-block" }, [
      createElement("div", { class: "info-block__header" }, [
        createElement("span", { class: "info-block__icon" }, ctx.props.icon ?? ""),
        createElement("span", { class: "info-block__title" }, ctx.props.title ?? "")
      ]),
      createElement(
        "p",
        { class: "info-block__description" },
        ctx.props.description ?? ""
      )
    ]);
  }
};

const App = {
  setup() {
    /* Averigua si ¿Soy una extensión de Chrome?
     * 1. Comprueba si existe el objeto global chrome
     * 2. Comprueba si existen funciones de API de Chrome (Estas funciones solo están disponibles
     *    para una extensión, no para las páginas web normales)
     */
    const isBrowserContext =
      typeof chrome !== "undefined" && Boolean(chrome.tabs?.query) && Boolean(chrome.scripting);

    const isLoading = ref(isBrowserContext);
    const headline = ref("Mantén tu enfoque");
    const helperText = ref(
      "Identificamos el contexto de tu pestaña activa para ayudarte a decidir si vale la pena seguir aquí."
    );

    const domain = ref("Analizando pestaña...");
    const category = ref("-");
    const classification = ref("-");
    const breakTimeMinutes = ref(BREAK_TIME_MINUTES);
    const manualOverride = ref(false);
    const errorMessage = ref("");
    const manualHelper = ref("");

    // Muestra si la clasificación fue corregida o no
    const classificationLabel = computed(() => {
      const base = classification.value;
      if (base === "-") {
        return "Sin datos";
      }
      return manualOverride.value ? `${base} · corregido` : base;
    });

    // Elige el color de la etiqueta del tipo de contenido
    const classificationTone = computed(() => {
      const value = classification.value;
      if (value === "Ocio") {
        return "danger";
      }
      if (value === "No ocio") {
        return "success";
      }
      return "neutral";
    });

    // Elige el color de la etiqueta del tipo de sitio web
    const categoryTone = computed(() => {
      const value = category.value.toLowerCase();
      if (value.includes("productividad")) {
        return "success";
      }
      if (value.includes("procrastinación")) {
        return "danger";
      }
      if (value.includes("doble filo")) {
        return "warning";
      }
      return "neutral";
    });

    // TODO: Posible cambio para dar feedback al contenido neutral
    // Botón de feedback inhabilidado si el contenido es neutral
    const manualButtonDisabled = computed(() => classification.value === "-");

    // Mensaje del botón de feedback
    const manualButtonLabel = computed(() =>
      manualOverride.value ? "Marcar como ocio" : "Marcar como no ocio"
    );

    // Mini mensaje que acompaña a la sección de tipo de contenido
    const manualHint = computed(() => {
      if (classification.value === "-") {
        return "Esperando datos de la pestaña activa...";
      }
      if (manualOverride.value) {
        return "Aplicaste una corrección manual. Puedes revertirla cuando quieras.";
      }
      return manualHelper.value;
    });

    // Se obtienen los datos de la ventana actual
    const resolveActiveTab = async () => {
      try {
        errorMessage.value = "";
        // Se usa la API de Chrome para saber qué pestaña está activa y enfocada
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!activeTab?.url) { // Verifica si tiene una URL válida
          errorMessage.value = "No se pudo identificar la pestaña actual.";
          domain.value = "-";
          category.value = "Sin datos";
          classification.value = "-";
          return;
        }

        // Obtenemos dominio
        const currentUrl = new URL(activeTab.url);
        const hostname = currentUrl.hostname;
        domain.value = hostname;

        // TODO: Registramos el dominio en la tabla "sitios_web" si es que no existe

        // Obtenemos categoría del sitio
        const tabCategory = getCategory(hostname);
        category.value = tabCategory;

        // Obtenemos si el contenido es de ocio o no
        const resolved = await resolveLeisureClassification(activeTab.id, tabCategory);
        classification.value = resolved;

        try {
          await sendDomainToBackend(hostname);
        } catch (backendError) {
          errorMessage.value =
            "Se identificó la pestaña, pero no se pudo comunicar con el servidor.";
        }

        // Actualizamos los minimensajes del popup
        manualOverride.value = false;
        manualHelper.value =
          resolved === "Ocio"
            ? "Toma un respiro profundo antes de continuar."
            : "Excelente, estás dentro de los límites seguros.";
      } catch (error) {
        console.error("Error al obtener la pestaña activa", error);
        errorMessage.value = "Ocurrió un error al recuperar la pestaña actual.";
        domain.value = "-";
        category.value = "Sin datos";
        classification.value = "-";
      } finally {
        isLoading.value = false;
      }
    };

    // Cambio manual de la clasificación del contenido
    const toggleClassification = () => {
      if (classification.value === "-") {
        return;
      }
      classification.value = classification.value === "Ocio" ? "No ocio" : "Ocio";
      manualOverride.value = !manualOverride.value;
      if (manualOverride.value) {
        manualHelper.value = "Clasificación ajustada manualmente.";
      } else {
        manualHelper.value =
          classification.value === "Ocio"
            ? "Toma un respiro profundo antes de continuar."
            : "Excelente, estás dentro de los límites seguros.";
      }
    };

    onMounted(() => {
      if (!isBrowserContext) {
        isLoading.value = false;
        headline.value = "Vista previa no disponible";
        helperText.value =
          "Abre la extensión desde el navegador para analizar la pestaña activa y personalizar tu enfoque.";
        domain.value = "Disponible solo en el navegador";
        category.value = "Sin datos";
        classification.value = "-";
        return;
      }

      resolveActiveTab();
    });

    return {
      isLoading,
      headline,
      helperText,
      domain,
      category,
      classification,
      classificationLabel,
      classificationTone,
      categoryTone,
      breakTimeMinutes,
      manualOverride,
      manualButtonDisabled,
      manualButtonLabel,
      manualHint,
      errorMessage,
      toggleClassification
    };
  },
  render(ctx, createElement) {
    const heroSection = createElement("header", { class: "popup__hero" }, [
      createElement("div", { class: "brand-pill" }, "FocusGuard"),
      createElement("h1", { class: "popup__title" }, ctx.headline),
      createElement("p", { class: "popup__subtitle" }, ctx.helperText)
    ]);

    const contextSection = createElement("section", { class: "popup__context" }, [
      createElement(InfoBlock, {
        icon: "🌐",
        title: ctx.domain,
        description: ctx.isLoading ? "Analizando la pestaña activa..." : ctx.errorMessage ? ctx.errorMessage : "Este es el sitio que estás visitando en este momento."
      })
    ]);

    const statGrid = createElement("section", { class: "popup__stats" }, [
      createElement(StatHighlight, {
        icon: "🎯",
        label: "Categoría",
        value: ctx.category,
        tone: ctx.categoryTone
      }),
      createElement(StatHighlight, {
        icon: "🧭",
        label: "Clasificación ocio",
        value: ctx.classificationLabel,
        subtitle: ctx.manualHint,
        tone: ctx.classificationTone
      }),
      createElement(StatHighlight, {
        icon: "⏱️",
        label: "Descanso restante",
        value: `${ctx.breakTimeMinutes} min`,
        subtitle: "Planifica pausas breves para seguir con energía."
      })
    ]);

    const actionsSection = createElement("section", { class: "popup__actions" }, [
      createElement(
        "button",
        {
          class: ["action-button", ctx.manualButtonDisabled ? "action-button--disabled" : ""].join(" "),
          disabled: ctx.manualButtonDisabled,
          onClick: ctx.toggleClassification
        },
        ctx.manualButtonDisabled ? "Esperando datos..." : ctx.manualButtonLabel
      ),
      createElement(
        "p",
        { class: "action-hint" },
        ctx.manualButtonDisabled
          ? "Necesitamos identificar la pestaña antes de permitir ajustes."
          : "Usa este botón si la evaluación automática no se ajusta a tu realidad."
      )
    ]);

    const footer = createElement("footer", { class: "popup__footer" }, [
      createElement(
        "a",
        {
          class: "dashboard-link",
          href: "http://localhost:5173",
          target: "_blank",
          rel: "noopener noreferrer"
        },
        "Abrir panel de control"
      ),
      createElement(
        "p",
        { class: "footer-hint" },
        "Cultiva hábitos conscientes: pequeños ajustes constantes construyen grandes logros."
      )
    ]);

    return createElement("div", { class: "popup" }, [
      heroSection,
      contextSection,
      statGrid,
      actionsSection,
      footer
    ]);
  }
};

createApp(App).mount("#app");
