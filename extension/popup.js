import { computed, createApp, onMounted, ref } from "./libs/mini-vue.js";

// Representación de la BD: CATEGORY_CATALOG, INITIAL_USERS, INITIAL_SITES, INITIAL_USER_SITES, INITIAL_VISITS

const CATEGORY_CATALOG = [
  {
    id: 1, // ID numérico (int)
    nombre: "Sin categoria",
    peso: 1,
  },
  {
    id: 2,
    nombre: "Distractivo",
    peso: 5, // Mayor peso, implica mayor riesgo/impacto
  },
  {
    id: 3,
    nombre: "Doble filo",
    peso: 3,
  },
  {
    id: 4,
    nombre: "Neutral",
    peso: 2,
  },
  {
    id: 5,
    nombre: "Productivo",
    peso: 1, // Menor peso, implica menor riesgo/mayor beneficio
  }
];

const INITIAL_USERS = [
  {
    id: 1,
    correo: "maria@focusguard.app",
    contrasenia_hash: "hashedpassword123", // Solo para simulación
    nombres: "María Fernanda",
    apellidos: "Pérez Soto",
    telefono: "987654321",
    fecha_registro: "2024-07-10T09:30:00.000Z"
  },
  {
    id: 2,
    correo: "luis@focusguard.app",
    contrasenia_hash: "hashedpassword456",
    nombres: "Luis Alberto",
    apellidos: "Gómez Salas",
    telefono: "912345678",
    fecha_registro: "2024-07-10T09:35:00.000Z"
  }
];

const INITIAL_SITES = [
  {
    id: 1,
    dominio: "youtube.com"
  },
  {
    id: 2,
    dominio: "notion.so"
  },
  {
    id: 3,
    dominio: "facebook.com"
  }
];

const INITIAL_USER_SITES = [
  {
    id: 1, // ID del registro de asignación
    id_usuarios: 1, // María Fernanda
    id_sitios_web: 1, // youtube.com
    id_categorias_web: 1, // 1: doble filo, 2: productivo, 3: distractivo
    origen: "custom",
  },
  {
    id: 2,
    id_usuarios: 1, // María Fernanda
    id_sitios_web: 2, // notion.so
    id_categorias_web: 2,
    origen: "custom",
  },
  {
    id: 3,
    id_usuarios: 2, // Luis Alberto
    id_sitios_web: 3, // facebook.com
    id_categorias_web: 3,
    origen: "custom",
  }
];

const INITIAL_VISITS = [
  {
    id: 1,
    id_usuarios: 1, // María Fernanda
    id_sitios_web_usuario: 1, // Link youtube.com de María
    fecha_hora_ingreso: "2024-07-10T11:12:00.000Z",
    fecha_hora_salida: "2024-07-10T11:15:00.000Z",
  },
  {
    id: 2,
    id_usuarios: 1, // María Fernanda
    id_sitios_web_usuario: 2, // Link notion.so de María
    fecha_hora_ingreso: "2024-07-10T10:05:00.000Z",
    fecha_hora_salida: "2024-07-10T10:08:00.000Z",
  },
  {
    id: 3,
    id_usuarios: 2, // Luis Alberto
    id_sitios_web_usuario: 3, // Link facebook.com de Luis
    fecha_hora_ingreso: "2024-07-10T11:35:00.000Z",
    fecha_hora_salida: null, // Visita activa/en curso
  }
];

const CATEGORY_INDEX = CATEGORY_CATALOG.reduce((acc, category) => {
  acc[category.id] = category;
  return acc;
}, {});

const DEFAULT_CATEGORY_ID = 1;

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
  if (categoryId === 2) {
    return "Ocio";
  }
  return "No ocio";
};

const resolveLeisureClassification = async (tabId, categoryId, isBrowserContext) => {
  const category = CATEGORY_INDEX[categoryId];
  if (!category) {
    return "No ocio";
  }

  if (category.id === 2) {
    return "Ocio";
  }

  if (category.id !== 3 || !isBrowserContext || !tabId) {
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

    const users = ref([]); // Almacenará la lista de usuarios reales
    const activeUserId = ref("");
    const apiBaseUrl = "http://localhost:8000/api/v1";


    const domain = ref("Analizando pestaña...");
    const currentHostname = ref("");
    const currentTabId = ref(null);
    const activeSiteId = ref(null);

    const classification = ref("-");
    const manualOverride = ref(false);
    const manualHelper = ref("");
    const errorMessage = ref("");
    const breakTimeMinutes = ref(BREAK_TIME_MINUTES);


    const findSiteByHostname = (hostname) =>
      siteCatalog.value.find((site) => site.dominio === hostname) ?? null;

    const ensureSiteRecord = (hostname) => {
      const normalised = normaliseHost(hostname);
      const existing = findSiteByHostname(normalised);
      if (existing) {
        return { record: { ...existing, hostname: existing.dominio }, wasCreated: false };
      }

      const record = {
        id: createId("site"),
        dominio: normalised,
      };
      siteCatalog.value = [record, ...siteCatalog.value];
      return { record: { ...record, hostname: record.dominio }, wasCreated: true };
    };
/*
    const ensureUserSiteRecord = (userId, siteId) => {
      const existing = userSiteCatalog.value.find(
        (record) => record.id_usuarios === userId && record.id_sitios_web === siteId
      );
      if (existing) {
        return { record: {
            ...existing,
            categoryId: existing.id_categorias_web,
            userId: existing.id_usuarios,
            siteId: existing.id_sitios_web
          },
          wasCreated: false
        };
      }

      const record = {
        id: createId("link"),
        id_usuarios: Number(userId),
        id_sitios_web: Number(siteId),
        id_categorias_web: DEFAULT_CATEGORY_ID,
        notes: "",
      };
      userSiteCatalog.value = [record, ...userSiteCatalog.value];
      return {
        record: {
          ...record,
          categoryId: record.id_categorias_web,
          userId: record.id_usuarios,
          siteId: record.id_sitios_web
        },
        wasCreated: true
      };
    };
*/


    const ensureUserSiteRecord = async (userIdStr, siteIdStr) => {
      const userId = Number(userIdStr);
      const siteId = Number(siteIdStr);

      if (Number.isNaN(userId) || Number.isNaN(siteId)) {
        throw new Error("ID de usuario o sitio web inválido.");
      }

      const endpoint = `${apiBaseUrl}/website-users/users/${userId}/sites/${siteId}`;

      try {
        // 1. INTENTAR OBTENER el registro de asignación
        const response = await fetch(endpoint);

        if (response.ok) {
          const record = await response.json();
          // Mapear claves del BE (id_categorias_web, etc.) a las claves internas del FE (categoryId, etc.)
          return {
            record: {
              ...record,
              categoryId: record.id_categorias_web,
              userId: record.id_usuarios,
              siteId: record.id_sitios_web
            },
            wasCreated: false
          };
        }

        // Si la respuesta no es OK y es 404, crear el registro.
        if (response.status === 404) {
          console.log(`Asignación no encontrada para user ${userId} y site ${siteId}. Creando...`);

          // 2. CREAR el nuevo registro de asignación
          const createData = {
            id_usuarios: userId,
            id_sitios_web: siteId,
            id_categorias_web: DEFAULT_CATEGORY_ID, // 1: Sin Categoría
            origen: "custom"
          };

          const createResponse = await fetch(`${apiBaseUrl}/website-users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createData),
          });

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Fallo al crear la asignación: ${errorText}`);
          }

          const newRecord = await createResponse.json();
          // Mapear claves del BE
          return {
            record: {
              ...newRecord,
              categoryId: newRecord.id_categorias_web,
              userId: newRecord.id_usuarios,
              siteId: newRecord.id_sitios_web
            },
            wasCreated: true
          };
        }

        // Error diferente a 404
        throw new Error(`Error inesperado al obtener asignación: ${response.status}`);

      } catch (error) {
        console.error("Fallo en ensureUserSiteRecord:", error);
        throw error;
      }
    };

    const pushVisitLog = ({ userId, siteId, classification: cls, source }) => {
      const assignment = userSiteCatalog.value.find(
        (record) => record.id_usuarios == userId && record.id_sitios_web == siteId
      );
      if (!userId || !siteId) {
        return;
      }
      const now = new Date().toISOString();
      const visit = {
        id: createId("visit"),
        id_usuarios: Number(userId),
        id_sitios_web_usuario: assignment.id, // ⬅️ Usar ID de asignación
        fecha_hora_ingreso: now, // ⬅️ Usar clave del mock
        classification: cls, // Lógica FE
        source: source // Lógica FE
      };
      visitLog.value = [visit, ...visitLog.value].slice(0, 60);
    };

    const patchLatestVisit = (changes = {}) => {
      if (!activeSiteId.value) {
        return;
      }
      const index = visitLog.value.findIndex(
        (visit) => visit.id_usuarios === activeUserId.value && visit.id_sitios_web_usuario === activeSiteId.value
      );
      if (index === -1) {
        return;
      }
      const now = new Date().toISOString();
      const currentVisit = visitLog.value[index];
      const updated = {
        ...currentVisit,
        fecha_hora_salida: now, // Usar la clave de la DB para la hora de actualización/salida
        ...changes,
      };
      const clone = [...visitLog.value];
      clone[index] = updated;
      visitLog.value = clone;
    };

    // Nueva función para obtener usuarios desde la API
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

    const activeCategoryLabel = computed(() => activeCategory.value?.nombre ?? "Sin categoria");

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

    const categoryOptions = CATEGORY_CATALOG.map((category) => ({
      id: category.id,
      nombre: category.nombre
    }));

    return {
      isLoading,
      headline,
      helperText,
      activeUserId,
      activeUser,
      displayDomain,
      errorMessage,
      classificationLabel,
      classificationTone,
      categoryTone,
      activeCategoryLabel,
      categoryOptions,
      selectedCategoryId,
      breakTimeMinutes,
      manualOverride,
      manualButtonDisabled,
      manualButtonLabel,
      manualHint,
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
          createElement("span", { class: "stat-card__value" }, ctx.activeCategoryLabel)
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
          createElement("span", { class: "stat-card__value" }, `${ctx.breakTimeMinutes} min`)
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
        option.nombre
      )
    );

    const categoryPanel = createElement("section", { class: "panel" }, [
      createElement("div", { class: "panel__header" }, [
        createElement("span", { class: "panel__eyebrow" }, "Personaliza la categoría"),
        createElement("h2", { class: "panel__title" }, "Sitios por usuario")
      ]),
      createElement("div", { class: "panel__content" }, [
        createElement("div", { class: "field" }, [
          createElement("span", { class: "field__label" }, "Categoría asignada"),
          createElement(
            "select",
            {
              class: "field__control",
              value: ctx.selectedCategoryId,
              onChange: (event) => ctx.onCategoryChange(Number(event.target.value))
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
