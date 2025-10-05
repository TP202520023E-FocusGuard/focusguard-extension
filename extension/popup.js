import { computed, createApp, h, onMounted, ref } from "./libs/mini-vue.js";

const CATEGORIES = {
  "youtube.com": "Doble filo",
  "facebook.com": "Procrastinación",
  "aulavirtual.upc.edu.pe": "Productividad",
  "google.com": "Neutral"
};

const LEISURE_KEYWORDS = ["VEGETTA777", "VEGETTA", "MINECRAFT"];
const BREAK_TIME_MINUTES = 60;

const normaliseHost = (hostname = "") => hostname.replace(/^www\./, "").toLowerCase();

const getCategory = (hostname) => {
  const normalised = normaliseHost(hostname);
  return CATEGORIES[normalised] ?? "Sin categoría";
};

const includesLeisureKeyword = (text) => {
  if (!text) {
    return false;
  }
  const upper = text.toUpperCase();
  return LEISURE_KEYWORDS.some((keyword) => upper.includes(keyword));
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

const resolveLeisureClassification = async (tabId, category) => {
  if (category !== "Doble filo") {
    return "No ocio";
  }

  const { title, metaDescription } = await getPageMetadata(tabId);
  const hasKeyword = includesLeisureKeyword(title) || includesLeisureKeyword(metaDescription);
  return hasKeyword ? "Ocio" : "No ocio";
};

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

    const classificationLabel = computed(() => {
      const base = classification.value;
      if (base === "-") {
        return "Sin datos";
      }
      return manualOverride.value ? `${base} · corregido` : base;
    });

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

    const manualButtonDisabled = computed(() => classification.value === "-");

    const manualButtonLabel = computed(() =>
      manualOverride.value ? "Marcar como ocio" : "Marcar como no ocio"
    );

    const manualHint = computed(() => {
      if (classification.value === "-") {
        return "Esperando datos de la pestaña activa...";
      }
      if (manualOverride.value) {
        return "Aplicaste una corrección manual. Puedes revertirla cuando quieras.";
      }
      return manualHelper.value;
    });

    const resolveActiveTab = async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!activeTab?.url) {
          errorMessage.value = "No se pudo identificar la pestaña actual.";
          domain.value = "-";
          category.value = "Sin datos";
          classification.value = "-";
          return;
        }

        const currentUrl = new URL(activeTab.url);
        const hostname = currentUrl.hostname;
        domain.value = hostname;

        const tabCategory = getCategory(hostname);
        category.value = tabCategory;

        const resolved = await resolveLeisureClassification(activeTab.id, tabCategory);
        classification.value = resolved;
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
        description: ctx.isLoading
          ? "Analizando la pestaña activa..."
          : ctx.errorMessage
            ? ctx.errorMessage
            : "Este es el sitio que estás visitando en este momento."
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
          href: "https://www.imdb.com/es/list/ls074769189/",
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
