import { computed, createApp, onMounted, ref } from "./libs/mini-vue.js";


const CATEGORY_CATALOG = [
  {
    id: "sin-categoria",
    label: "Sin categoría",
    description: "Usa esta categoría mientras decides cómo catalogar el sitio.",
    tone: "neutral"
  },
  {
    id: "neutral",
    label: "Neutral",
    description: "No impacta directamente tu enfoque, pero conviene monitorearlo.",
    tone: "info"
  },
  {
    id: "productivo",
    label: "Productivo",
    description: "Aporta a tus objetivos laborales o académicos.",
    tone: "success"
  },
  {
    id: "doble-filo",
    label: "Doble filo",
    description: "Puede ser productivo u ocio según el contenido específico.",
    tone: "warning"
  },
  {
    id: "distractivo",
    label: "Distractivo",
    description: "Sabes que te desvía del objetivo principal.",
    tone: "danger"
  }
];

const CATEGORY_INDEX = CATEGORY_CATALOG.reduce((acc, category) => {
  acc[category.id] = category;
  return acc;
}, {});

const DEFAULT_CATEGORY_ID = "sin-categoria";

const LEISURE_KEYWORDS = ["VEGETTA777", "VEGETTA", "MINECRAFT"];
const BREAK_TIME_MINUTES = 60;

const createIdFactory = () => {
  let counter = 0;
  return (prefix) => {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
  };
};

const createId = createIdFactory();

const normaliseHost = (hostname = "") => hostname.replace(/^www\./, "").toLowerCase();

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

const inferClassificationFromCategory = (categoryId) => {
  if (categoryId === "distractivo") {
    return "Ocio";
  }
  return "No ocio";
};

const resolveLeisureClassification = async (tabId, categoryId, isBrowserContext) => {
  const category = CATEGORY_INDEX[categoryId];
  if (!category) {
    return "No ocio";
  }

  if (category.id === "distractivo") {
    return "Ocio";
  }

  if (category.id !== "doble-filo" || !isBrowserContext || !tabId) {
    return "No ocio";
  }

  const { title, metaDescription } = await getPageMetadata(tabId);
  const hasKeyword = includesLeisureKeyword(title) || includesLeisureKeyword(metaDescription);
  return hasKeyword ? "Ocio" : "No ocio";
};

const formatRelativeTime = (isoString) => {
  if (!isoString) {
    return "Sin registro";
  }

  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) {
    return "Sin registro";
  }

  const diffMs = Date.now() - target;
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes <= 0) {
    return "Hace instantes";
  }

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Hace ${diffDays} d`;
};

const formatDateTime = (isoString) => {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

const INITIAL_USERS = [
  {
    id: "user-1",
    name: "María Fernanda",
    email: "maria@focusguard.app"
  },
  {
    id: "user-2",
    name: "Luis Alberto",
    email: "luis@focusguard.app"
  }
];

const INITIAL_SITES = [
  {
    id: "site-1",
    hostname: "youtube.com",
    createdAt: "2024-07-10T09:40:00.000Z"
  },
  {
    id: "site-2",
    hostname: "notion.so",
    createdAt: "2024-07-10T09:45:00.000Z"
  },
  {
    id: "site-3",
    hostname: "facebook.com",
    createdAt: "2024-07-10T10:15:00.000Z"
  }
];

const INITIAL_USER_SITES = [
  {
    id: "link-1",
    userId: "user-1",
    siteId: "site-1",
    categoryId: "doble-filo",
    notes: "Listas de reproducción educativas",
    updatedAt: "2024-07-10T11:10:00.000Z"
  },
  {
    id: "link-2",
    userId: "user-1",
    siteId: "site-2",
    categoryId: "productivo",
    notes: "Notas de proyectos",
    updatedAt: "2024-07-10T09:50:00.000Z"
  },
  {
    id: "link-3",
    userId: "user-2",
    siteId: "site-1",
    categoryId: "sin-categoria",
    notes: "",
    updatedAt: "2024-07-10T10:30:00.000Z"
  },
  {
    id: "link-4",
    userId: "user-2",
    siteId: "site-3",
    categoryId: "distractivo",
    notes: "Limitar a 10 minutos",
    updatedAt: "2024-07-10T11:30:00.000Z"
  }
];

const INITIAL_VISITS = [
  {
    id: "visit-1",
    userId: "user-1",
    siteId: "site-1",
    classification: "Ocio",
    visitedAt: "2024-07-10T11:12:00.000Z",
    source: "manual"
  },
  {
    id: "visit-2",
    userId: "user-1",
    siteId: "site-2",
    classification: "No ocio",
    visitedAt: "2024-07-10T10:05:00.000Z",
    source: "auto"
  },
  {
    id: "visit-3",
    userId: "user-2",
    siteId: "site-3",
    classification: "Ocio",
    visitedAt: "2024-07-10T11:35:00.000Z",
    source: "auto"
  }
];

const App = {
  setup() {
    const isBrowserContext =
      typeof chrome !== "undefined" && Boolean(chrome.tabs?.query) && Boolean(chrome.scripting);

    const isLoading = ref(isBrowserContext);
    const headline = ref("Tablero de registro de visitas");
    const helperText = ref(
      "Cada interacción se sincroniza con usuarios, catálogo de sitios y visitas registradas."
    );

    const siteCatalog = ref([...INITIAL_SITES]);
    const userSiteCatalog = ref([...INITIAL_USER_SITES]);
    const visitLog = ref([...INITIAL_VISITS]);

// Nuevos estados para manejar usuarios reales
    const users = ref([]); // Almacenará la lista de usuarios reales
// El ID inicial puede ser null o una cadena vacía, pues lo cargaremos al montar
    const activeUserId = ref("");
    const apiBaseUrl = "http://localhost:8000/api/v1"; // ⚠️ Ajusta la URL base de tu API


    const domain = ref("Analizando pestaña...");
    const currentHostname = ref("");
    const currentTabId = ref(null);
    const activeSiteId = ref(null);

    //const activeUserId = ref(INITIAL_USERS[0]?.id ?? "");
    const classification = ref("-");
    const manualOverride = ref(false);
    const manualHelper = ref("");
    const errorMessage = ref("");
    const breakTimeMinutes = ref(BREAK_TIME_MINUTES);


    const findSiteById = (siteId) => siteCatalog.value.find((site) => site.id === siteId) ?? null;
    const findSiteByHostname = (hostname) =>
      siteCatalog.value.find((site) => site.hostname === hostname) ?? null;

    const ensureSiteRecord = (hostname) => {
      const normalised = normaliseHost(hostname);
      const existing = findSiteByHostname(normalised);
      if (existing) {
        return { record: existing, wasCreated: false };
      }
      const now = new Date().toISOString();
      const record = {
        id: createId("site"),
        hostname: normalised,
        createdAt: now
      };
      siteCatalog.value = [record, ...siteCatalog.value];
      return { record, wasCreated: true };
    };

    const ensureUserSiteRecord = (userId, siteId) => {
      const existing = userSiteCatalog.value.find(
        (record) => record.userId === userId && record.siteId === siteId
      );
      if (existing) {
        return { record: existing, wasCreated: false };
      }
      const now = new Date().toISOString();
      const record = {
        id: createId("link"),
        userId,
        siteId,
        categoryId: DEFAULT_CATEGORY_ID,
        notes: "",
        updatedAt: now
      };
      userSiteCatalog.value = [record, ...userSiteCatalog.value];
      return { record, wasCreated: true };
    };

    const pushVisitLog = ({ userId, siteId, classification: cls, source }) => {
      if (!userId || !siteId) {
        return;
      }
      const now = new Date().toISOString();
      const visit = {
        id: createId("visit"),
        userId,
        siteId,
        classification: cls,
        visitedAt: now,
        source
      };
      visitLog.value = [visit, ...visitLog.value].slice(0, 60);
    };

    const patchLatestVisit = (changes = {}) => {
      if (!activeSiteId.value) {
        return;
      }
      const index = visitLog.value.findIndex(
        (visit) => visit.userId === activeUserId.value && visit.siteId === activeSiteId.value
      );
      if (index === -1) {
        return;
      }
      const now = new Date().toISOString();
      const updated = {
        ...visitLog.value[index],
        ...changes,
        updatedAt: now
      };
      const clone = [...visitLog.value];
      clone[index] = updated;
      visitLog.value = clone;
    };

    // ➡️ Nueva función para obtener usuarios desde la API
    const fetchUsers = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/users`);
        if (!response.ok) {
          throw new Error("Error al obtener la lista de usuarios.");
        }
        const userList = await response.json();
        users.value = userList;
        if (userList.length > 0) {
          // 🎯 Establecer el ID del primer usuario registrado
          activeUserId.value = userList[0].id.toString();
          console.log("Usuarios cargados desde el BE:", userList);
          console.log("Primer Usuario Activo:", userList[0]);
        }
      } catch (error) {
        console.error("Fallo al cargar usuarios desde el backend:", error);
        errorMessage.value = "No se pudieron cargar los usuarios. Revisa la conexión con el BackEnd.";
        isLoading.value = false;
      }
    };

    const classifySiteForCategory = async (categoryId) => {
      if (!categoryId) {
        return "No ocio";
      }
      if (!isBrowserContext || !currentTabId.value) {
        return inferClassificationFromCategory(categoryId);
      }
      try {
        const resolved = await resolveLeisureClassification(
          currentTabId.value,
          categoryId,
          isBrowserContext
        );
        return resolved ?? inferClassificationFromCategory(categoryId);
      } catch (error) {
        console.error("Error al clasificar la pestaña", error);
        return inferClassificationFromCategory(categoryId);
      }
    };

    const syncActiveSite = async ({ hostname, tabId, logVisit }) => {
      if (!hostname) {
        return;
      }

      const normalised = normaliseHost(hostname);
      domain.value = normalised;
      currentHostname.value = normalised;
      if (tabId) {
        currentTabId.value = tabId;
      }

      const { record: siteRecord, wasCreated: siteCreated } = ensureSiteRecord(normalised);
      activeSiteId.value = siteRecord.id;

      const { record: assignmentRecord, wasCreated: assignmentCreated } = ensureUserSiteRecord(
        activeUserId.value,
        siteRecord.id
      );

      const resolvedClassification = await classifySiteForCategory(assignmentRecord.categoryId);
      classification.value = resolvedClassification;
      manualOverride.value = false;
      manualHelper.value =
        resolvedClassification === "Ocio"
          ? "Toma un respiro profundo antes de continuar."
          : "Excelente, estás dentro de los límites seguros.";

      if (logVisit) {
        pushVisitLog({
          userId: activeUserId.value,
          siteId: siteRecord.id,
          classification: resolvedClassification,
          source: "auto"
        });
      }

      if (siteCreated || assignmentCreated) {
        helperText.value = siteCreated
          ? "Registramos este dominio en tu catálogo y lo enlazamos con el usuario."
          : "Se recuperó la categoría personalizada del usuario para este sitio.";
      } else {
        helperText.value = "Sincronizamos la visita con tu configuración existente.";
      }
    };

    const resolveActiveTab = async ({ logVisit = true } = {}) => {
      if (!isBrowserContext) {
        isLoading.value = false;
        return;
      }

      try {
        isLoading.value = true;
        errorMessage.value = "";
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!activeTab?.url) {
          throw new Error("Pestaña sin URL válida");
        }
        const currentUrl = new URL(activeTab.url);
        await syncActiveSite({ hostname: currentUrl.hostname, tabId: activeTab.id, logVisit });
      } catch (error) {
        console.error("Error al obtener la pestaña activa", error);
        errorMessage.value = "No pudimos identificar la pestaña actual.";
        domain.value = "-";
        activeSiteId.value = null;
        classification.value = "-";
      } finally {
        isLoading.value = false;
      }
    };

    const onUserChange = async (newUserId) => {
      if (!newUserId || newUserId === activeUserId.value) {
        return;
      }
      activeUserId.value = newUserId;
      manualOverride.value = false;

      if (!currentHostname.value) {
        return;
      }

      const { record: siteRecord } = ensureSiteRecord(currentHostname.value);
      activeSiteId.value = siteRecord.id;
      const { record: assignmentRecord } = ensureUserSiteRecord(newUserId, siteRecord.id);
      const resolvedClassification = await classifySiteForCategory(assignmentRecord.categoryId);
      classification.value = resolvedClassification;
      manualHelper.value =
        resolvedClassification === "Ocio"
          ? "Toma un respiro profundo antes de continuar."
          : "Excelente, estás dentro de los límites seguros.";
    };

    const updateAssignmentRecord = (recordId, updates) => {
      const index = userSiteCatalog.value.findIndex((record) => record.id === recordId);
      if (index === -1) {
        return null;
      }
      const updated = {
        ...userSiteCatalog.value[index],
        ...updates
      };
      const clone = [...userSiteCatalog.value];
      clone[index] = updated;
      userSiteCatalog.value = clone;
      return updated;
    };

    const onCategoryChange = async (newCategoryId) => {
      if (!activeSiteId.value) {
        return;
      }
      const { record: assignmentRecord } = ensureUserSiteRecord(activeUserId.value, activeSiteId.value);
      if (assignmentRecord.categoryId === newCategoryId) {
        return;
      }
      const updated = updateAssignmentRecord(assignmentRecord.id, {
        categoryId: newCategoryId,
        updatedAt: new Date().toISOString()
      });
      manualOverride.value = false;
      const recalculated = await classifySiteForCategory(updated?.categoryId ?? newCategoryId);
      classification.value = recalculated;
      manualHelper.value =
        recalculated === "Ocio"
          ? "Toma un respiro profundo antes de continuar."
          : "Excelente, estás dentro de los límites seguros.";
      patchLatestVisit({ classification: recalculated, source: "auto" });
    };

    const toggleClassification = async () => {
      if (classification.value === "-" || !activeSiteId.value) {
        return;
      }

      if (!manualOverride.value) {
        const newValue = classification.value === "Ocio" ? "No ocio" : "Ocio";
        manualOverride.value = true;
        classification.value = newValue;
        manualHelper.value = "Clasificación ajustada manualmente.";
        patchLatestVisit({ classification: newValue, source: "manual" });
        return;
      }

      manualOverride.value = false;
      const recalculated = await classifySiteForCategory(selectedCategoryId.value);
      classification.value = recalculated;
      manualHelper.value =
        recalculated === "Ocio"
          ? "Toma un respiro profundo antes de continuar."
          : "Excelente, estás dentro de los límites seguros.";
      patchLatestVisit({ classification: recalculated, source: "auto" });
    };

    onMounted(async () => {
      if (!isBrowserContext) {
        isLoading.value = false;
        headline.value = "Vista previa desde el entorno de desarrollo";
        helperText.value =
          "Abre el popup dentro de Chrome para registrar visitas reales. Aquí ves datos simulados.";
        domain.value = "Disponible solo en el navegador";
        return;
      }

      isLoading.value = true; // ⬅️ Iniciar la carga

      // ➡️ 1. Obtener usuarios y establecer el activo
      await fetchUsers();

      // ➡️ 2. Si se estableció un usuario activo, sincronizar la pestaña
      if (activeUserId.value) {
        await resolveActiveTab({ logVisit: true });
      } else {
        isLoading.value = false;
        errorMessage.value = "No hay usuarios registrados en la base de datos.";
      }

    });

    const activeUser = computed(
      //() => INITIAL_USERS.find((user) => user.id === activeUserId.value) ?? null
      () => users.value.find((user) => user.id.toString() === activeUserId.value) ?? null
    );

    const displayDomain = computed(() => {
      if (isLoading.value) {
        return "Analizando pestaña...";
      }
      return domain.value || "-";
    });

    const activeAssignment = computed(() => {
      if (!activeSiteId.value) {
        return null;
      }
      return (
        userSiteCatalog.value.find(
          (record) => record.userId === activeUserId.value && record.siteId === activeSiteId.value
        ) ?? null
      );
    });

    const selectedCategoryId = computed(
      () => activeAssignment.value?.categoryId ?? DEFAULT_CATEGORY_ID
    );

    const activeCategory = computed(
      () => CATEGORY_INDEX[selectedCategoryId.value] ?? CATEGORY_INDEX[DEFAULT_CATEGORY_ID]
    );

    const activeCategoryLabel = computed(() => activeCategory.value?.label ?? "Sin categoría");
    const activeCategoryDescription = computed(() => activeCategory.value?.description ?? "");

    const classificationLabel = computed(() => {
      if (classification.value === "-") {
        return "Sin datos";
      }
      return manualOverride.value ? `${classification.value} · corregido` : classification.value;
    });

    const classificationTone = computed(() => {
      if (classification.value === "Ocio") {
        return "danger";
      }
      if (classification.value === "No ocio") {
        return "success";
      }
      return "neutral";
    });

    const categoryTone = computed(() => activeCategory.value?.tone ?? "neutral");

    const manualButtonDisabled = computed(() => classification.value === "-" || !activeSiteId.value);

    const manualButtonLabel = computed(() => {
      if (manualOverride.value) {
        return "Restaurar evaluación automática";
      }
      return classification.value === "Ocio" ? "Marcar como no ocio" : "Marcar como ocio";
    });

    const latestVisit = computed(() => {
      if (!activeSiteId.value) {
        return null;
      }
      return (
        visitLog.value.find(
          (visit) => visit.userId === activeUserId.value && visit.siteId === activeSiteId.value
        ) ?? null
      );
    });

    const manualHint = computed(() => {
      if (classification.value === "-") {
        return "Esperando datos de la pestaña activa...";
      }
      if (manualOverride.value) {
        return "Aplicaste una corrección manual. Puedes revertirla cuando quieras.";
      }
      if (!latestVisit.value) {
        return "La próxima visita se guardará automáticamente.";
      }
      const sourceLabel = latestVisit.value.source === "manual" ? "corregido manualmente" : "analizado automáticamente";
      return `Último registro ${formatRelativeTime(latestVisit.value.visitedAt)} (${sourceLabel}).`;
    });

    const siteSummary = computed(() => {
      if (!activeSiteId.value) {
        return null;
      }
      const site = findSiteById(activeSiteId.value);
      const assignments = userSiteCatalog.value.filter((record) => record.siteId === activeSiteId.value);
      const assignmentForUser = assignments.find((record) => record.userId === activeUserId.value) ?? null;
      return {
        hostname: site?.hostname ?? displayDomain.value,
        firstSeenRelative: site?.createdAt ? formatRelativeTime(site.createdAt) : "Pendiente",
        firstSeenLabel: formatDateTime(site?.createdAt ?? ""),
        usersWithCategory: assignments.length,
        notes: assignmentForUser?.notes ?? "",
        updatedRelative: assignmentForUser?.updatedAt
          ? formatRelativeTime(assignmentForUser.updatedAt)
          : "Sin actualización",
        updatedLabel: formatDateTime(assignmentForUser?.updatedAt ?? "")
      };
    });

    const totalVisitsForUser = computed(
      () => visitLog.value.filter((visit) => visit.userId === activeUserId.value).length
    );

    const totalVisitsForActiveSite = computed(() =>
      visitLog.value.filter(
        (visit) => visit.userId === activeUserId.value && visit.siteId === activeSiteId.value
      ).length
    );

    const visitsSnapshot = computed(() =>
      visitLog.value
        .filter((visit) => visit.userId === activeUserId.value)
        .slice(0, 5)
        .map((visit) => {
          const site = findSiteById(visit.siteId);
          const assignment = userSiteCatalog.value.find(
            (record) => record.userId === activeUserId.value && record.siteId === visit.siteId
          );
          const category = CATEGORY_INDEX[assignment?.categoryId ?? DEFAULT_CATEGORY_ID];
          return {
            id: visit.id,
            hostname: site?.hostname ?? "-",
            categoryLabel: category.label,
            categoryTone: category.tone ?? "neutral",
            classification: visit.classification,
            classificationTone: visit.classification === "Ocio" ? "danger" : "success",
            visitedRelative: formatRelativeTime(visit.visitedAt),
            visitedLabel: formatDateTime(visit.visitedAt),
            sourceLabel: visit.source === "manual" ? "Manual" : "Automático"
          };
        })
    );

    const userAssignments = computed(() => {
      const records = userSiteCatalog.value.filter((record) => record.userId === activeUserId.value);
      return records
        .map((record) => {
          const site = findSiteById(record.siteId);
          const category = CATEGORY_INDEX[record.categoryId] ?? CATEGORY_INDEX[DEFAULT_CATEGORY_ID];
          return {
            id: record.id,
            hostname: site?.hostname ?? "-",
            categoryLabel: category.label,
            categoryTone: category.tone ?? "neutral",
            updatedAt: record.updatedAt,
            updatedRelative: record.updatedAt ? formatRelativeTime(record.updatedAt) : "Sin actualización",
            updatedLabel: formatDateTime(record.updatedAt),
            notes: record.notes
          };
        })
        .sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 4);
    });

    const categoryDistribution = computed(() =>
      CATEGORY_CATALOG.map((category) => {
        const count = userSiteCatalog.value.filter(
          (record) => record.userId === activeUserId.value && record.categoryId === category.id
        ).length;
        return { id: category.id, label: category.label, tone: category.tone ?? "neutral", count };
      }).filter((item) => item.count > 0)
    );

    const activeUserAssignmentsCount = computed(
      () => userSiteCatalog.value.filter((record) => record.userId === activeUserId.value).length
    );

    const totalCatalogSites = computed(() => siteCatalog.value.length);

    const categoryOptions = CATEGORY_CATALOG.map((category) => ({
      id: category.id,
      label: category.label
    }));

    return {
      isLoading,
      headline,
      helperText,
      //users: INITIAL_USERS,
      activeUserId,
      activeUser,
      displayDomain,
      siteSummary,
      errorMessage,
      classificationLabel,
      classificationTone,
      categoryTone,
      activeCategoryLabel,
      activeCategoryDescription,
      categoryOptions,
      selectedCategoryId,
      breakTimeMinutes,
      manualOverride,
      manualButtonDisabled,
      manualButtonLabel,
      manualHint,
      totalVisitsForUser,
      totalVisitsForActiveSite,
      visitsSnapshot,
      userAssignments,
      categoryDistribution,
      activeUserAssignmentsCount,
      totalCatalogSites,
      onUserChange,
      onCategoryChange,
      toggleClassification
    };
  },
  render(ctx, createElement) {
    const heroSection = createElement("header", { class: "popup__hero" }, [
      createElement("div", { class: "brand-pill" }, "FocusGuard"),
      createElement("h1", { class: "popup__title" }, ctx.headline),
      createElement("p", { class: "popup__subtitle" }, ctx.helperText)
    ]);

    const statsPanel = createElement("section", { class: "stat-grid" }, [
      createElement("article", { class: `stat-card stat-card--${ctx.categoryTone}` }, [
        createElement("div", { class: "stat-card__icon" }, "🗂️"),
        createElement("div", { class: "stat-card__body" }, [
          createElement("span", { class: "stat-card__label" }, "Tabla sitios_web_usuario"),
          createElement("span", { class: "stat-card__value" }, ctx.activeCategoryLabel),
          createElement("p", { class: "stat-card__subtitle" }, ctx.activeCategoryDescription)
        ])
      ]),
      createElement("article", { class: `stat-card stat-card--${ctx.classificationTone}` }, [
        createElement("div", { class: "stat-card__icon" }, "🧭"),
        createElement("div", { class: "stat-card__body" }, [
          createElement("span", { class: "stat-card__label" }, "Clasificación de ocio"),
          createElement("span", { class: "stat-card__value" }, ctx.classificationLabel),
          createElement("p", { class: "stat-card__subtitle" }, ctx.manualHint)
        ])
      ]),
      createElement("article", { class: "stat-card" }, [
        createElement("div", { class: "stat-card__icon" }, "⏱️"),
        createElement("div", { class: "stat-card__body" }, [
          createElement("span", { class: "stat-card__label" }, "Pausa sugerida"),
          createElement("span", { class: "stat-card__value" }, `${ctx.breakTimeMinutes} min`),
          createElement(
            "p",
            { class: "stat-card__subtitle" },
            `Visitas del usuario: ${ctx.totalVisitsForUser} · Visitas a este sitio: ${ctx.totalVisitsForActiveSite}`
          )
        ])
      ])
    ]);

    const categoryOptions = ctx.categoryOptions.map((option) =>
      createElement(
        "option",
        {
          value: option.id,
          selected: option.id === ctx.selectedCategoryId
        },
        option.label
      )
    );

    const categoryPanel = createElement("section", { class: "panel" }, [
      createElement("div", { class: "panel__header" }, [
        createElement("span", { class: "panel__eyebrow" }, "Personaliza la categoría"),
        createElement("h2", { class: "panel__title" }, "Sitios por usuario")
      ]),
      createElement("div", { class: "panel__content" }, [
        createElement("label", { class: "field" }, [
          createElement("span", { class: "field__label" }, "Categoría asignada"),
          createElement(
            "select",
            {
              class: "field__control",
              value: ctx.selectedCategoryId,
              onChange: (event) => ctx.onCategoryChange(event.target.value)
            },
            categoryOptions
          )
        ]),
        createElement(
          "div",
          { class: "panel__actions" },
          [
            createElement(
              "button",
              {
                class: [
                  "action-button",
                  ctx.manualButtonDisabled ? "action-button--disabled" : ""
                ].join(" "),
                disabled: ctx.manualButtonDisabled,
                onClick: ctx.toggleClassification
              },
              ctx.manualButtonDisabled ? "Esperando datos..." : ctx.manualButtonLabel
            )
          ]
        )
      ])
    ]);

    const footer = createElement("footer", { class: "popup__footer" }, [
      createElement(
        "p",
        { class: "footer-hint" },
        "Este panel refleja la regla de negocio: catálogo global, categoría por usuario y registro histórico."
      )
    ]);

    return createElement("div", { class: "popup" }, [
      heroSection,
      statsPanel,
      categoryPanel,
      footer
    ]);
  }
};

createApp(App).mount("#app");
