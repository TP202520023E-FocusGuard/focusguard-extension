const API_BASE_URL = "http://127.0.0.1:8000/api/v1";
const ENDPOINTS = {
  websites: `${API_BASE_URL}/websites`,
  websiteUsers: `${API_BASE_URL}/website-users`,
  websiteVisited: `${API_BASE_URL}/website-visited`,
  contents: `${API_BASE_URL}/contents`,
  contentUsers: `${API_BASE_URL}/content-users`,
  contentVisited: `${API_BASE_URL}/content-visited`
};

const USER_ID = 1;
const DEFAULT_CATEGORY_ID = 1;
const DEFAULT_CONTENT_CATEGORY_ID = 1;
const DOUBLE_EDGE_CATEGORY_ID = 4;
const DEFAULT_ORIGIN = "default";

const tabSessions = new Map();
const websitesCache = new Map();
const websiteUserCache = new Map();
const contentCache = new Map();
let currentActiveTabId = null;

const normaliseHost = (hostname = "") => hostname.replace(/^www\./, "").toLowerCase();

const isHttpUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

const ensureWebsite = async (domain) => {
  if (websitesCache.has(domain)) {
    return websitesCache.get(domain);
  }

  const response = await fetch(`${ENDPOINTS.websites}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      dominio: domain
    })
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Error al registrar el sitio web (${response.status})`);
  }

  const data = await parseJsonSafe(response);
  const websiteId = data?.id;

  if (!websiteId) {
    throw new Error("El backend no devolvió el id del sitio web");
  }

  websitesCache.set(domain, websiteId);
  return websiteId;
};

const ensureWebsiteUser = async (websiteId, domain) => {
  const cacheKey = `${USER_ID}:${domain}`;
  if (websiteUserCache.has(cacheKey)) {
    return websiteUserCache.get(cacheKey);
  }

  const response = await fetch(`${ENDPOINTS.websiteUsers}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id_usuarios: USER_ID,
      id_sitios_web: websiteId,
      id_categorias_web: DEFAULT_CATEGORY_ID,
      origen: DEFAULT_ORIGIN
    })
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Error al vincular el sitio con el usuario (${response.status})`);
  }

  const data = await parseJsonSafe(response);
  const userWebsiteId = data?.id;

  if (!userWebsiteId) {
    throw new Error("El backend no devolvió el id del sitio web del usuario");
  }

  const userWebsite = {
    id: userWebsiteId,
    categoryId: data?.id_categorias_web ?? DEFAULT_CATEGORY_ID
  };

  websiteUserCache.set(cacheKey, userWebsite);
  return userWebsite;
};

const createWebsiteVisit = async (websiteUserId) => {
  const response = await fetch(`${ENDPOINTS.websiteVisited}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id_usuarios: USER_ID,
      id_sitios_web_usuario: websiteUserId,
      fecha_hora_ingreso: new Date().toISOString(),
      fecha_hora_salida: null
    })
  });

  if (!response.ok) {
    throw new Error(`Error al registrar la visita (${response.status})`);
  }

  const data = await parseJsonSafe(response);
  const visitId = data?.id;

  if (!visitId) {
    throw new Error("El backend no devolvió el id del registro de visita");
  }

  return visitId;
};

const endWebsiteVisit = async (visitId) => {
  const response = await fetch(`${ENDPOINTS.websiteVisited}/${visitId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fecha_hora_salida: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(`Error al cerrar la visita (${response.status})`);
  }
};

const ensureContent = async ({ title, description }) => {
  const normalisedTitle = title?.trim();
  const normalisedDescription = description?.trim() ?? null;

  if (!normalisedTitle) {
    throw new Error("El contenido requiere un título para registrarse");
  }

  const cacheKey = `${normalisedTitle}::${normalisedDescription ?? ""}`;
  if (contentCache.has(cacheKey)) {
    return contentCache.get(cacheKey);
  }

  const response = await fetch(`${ENDPOINTS.contents}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      titulo: normalisedTitle,
      descripcion: normalisedDescription
    })
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Error al registrar el contenido (${response.status})`);
  }

  const data = await parseJsonSafe(response);
  const contentId = data?.id;

  if (!contentId) {
    throw new Error("El backend no devolvió el id del contenido");
  }

  contentCache.set(cacheKey, contentId);
  return contentId;
};

const createUserContent = async ({ websiteUserId, contentId }) => {
  const response = await fetch(`${ENDPOINTS.contentUsers}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id_usuarios: USER_ID,
      id_sitios_web_usuario: websiteUserId,
      id_contenidos: contentId,
      id_categorias_contenido: DEFAULT_CONTENT_CATEGORY_ID
    })
  });

  if (!response.ok) {
    throw new Error(`Error al vincular el contenido con el usuario (${response.status})`);
  }

  const data = await parseJsonSafe(response);
  const userContentId = data?.id;

  if (!userContentId) {
    throw new Error("El backend no devolvió el id del registro contenido-usuario");
  }

  return userContentId;
};

const createContentVisit = async (contentUserId) => {
  const response = await fetch(`${ENDPOINTS.contentVisited}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id_usuarios: USER_ID,
      id_contenidos_usuario: contentUserId,
      fecha_hora_ingreso: new Date().toISOString(),
      fecha_hora_salida: null
    })
  });

  if (!response.ok) {
    throw new Error(`Error al registrar la visita del contenido (${response.status})`);
  }

  const data = await parseJsonSafe(response);
  const contentVisitId = data?.id;

  if (!contentVisitId) {
    throw new Error("El backend no devolvió el id del registro de contenido visitado");
  }

  return contentVisitId;
};

const endContentVisit = async (contentVisitId) => {
  const response = await fetch(`${ENDPOINTS.contentVisited}/${contentVisitId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fecha_hora_salida: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(`Error al cerrar la visita del contenido (${response.status})`);
  }
};

const captureContentMetadata = async (tabId) => {
  try {
    const [executionResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const getMeta = (selector) => {
          const element = document.querySelector(selector);
          return element?.getAttribute("content") ?? null;
        };

        return {
          title: document.title ?? null,
          description:
            getMeta("meta[name='description']") ??
            getMeta("meta[name='Description']") ??
            getMeta("meta[property='og:description']") ??
            null
        };
      }
    });

    return executionResult?.result ?? null;
  } catch (error) {
    console.error("No se pudo obtener los metadatos del contenido", error);
    return null;
  }
};

const endContentSessionForTab = async (tabId) => {
  const session = tabSessions.get(tabId);

  if (!session) {
    return true;
  }

  const contentSession = session.contentSession;

  if (!contentSession?.contentVisitId) {
    tabSessions.set(tabId, {
      ...session,
      contentSession: null,
      contentStatus: "idle",
      pendingContentUrl: null
    });
    return true;
  }

  try {
    await endContentVisit(contentSession.contentVisitId);

    tabSessions.set(tabId, {
      ...session,
      contentSession: null,
      contentStatus: "idle",
      pendingContentUrl: null
    });

    return true;
  } catch (error) {
    console.error(
      `No se pudo actualizar la salida del contenido visitado (ContentVisitID: ${contentSession.contentVisitId}). La sesión local se mantendrá para reintentos.`,
      error
    );
    return false;
  }
};

const startContentSessionForTab = async (tabId, url) => {
  if (!url || !isHttpUrl(url)) {
    return;
  }

  const session = tabSessions.get(tabId);

  if (!session) {
    return;
  }

  const updatedSession = {
    ...session,
    url
  };
  tabSessions.set(tabId, updatedSession);

  if (updatedSession.websiteCategoryId !== DOUBLE_EDGE_CATEGORY_ID) {
    return;
  }

  const current = tabSessions.get(tabId);

  if (current?.contentStatus === "pending" && current?.pendingContentUrl === url) {
    return;
  }

  if (current?.contentSession?.url === url) {
    return;
  }

  tabSessions.set(tabId, {
    ...current,
    contentStatus: "pending",
    pendingContentUrl: url
  });

  const contentClosed = await endContentSessionForTab(tabId);

  if (!contentClosed) {
    const afterFailure = tabSessions.get(tabId);
    if (afterFailure) {
      tabSessions.set(tabId, {
        ...afterFailure,
        contentStatus: "error-closing"
      });
    }
    return;
  }

  const afterClose = tabSessions.get(tabId);
  if (!afterClose) {
    return;
  }

  tabSessions.set(tabId, {
    ...afterClose,
    contentStatus: "pending",
    pendingContentUrl: url
  });

  const metadata = await captureContentMetadata(tabId);

  const trimmedTitle = metadata?.title?.trim();
  const trimmedDescription = metadata?.description?.trim() ?? null;

  if (!trimmedTitle) {
    const afterMetadata = tabSessions.get(tabId);
    if (afterMetadata) {
      tabSessions.set(tabId, {
        ...afterMetadata,
        contentStatus: "waiting-metadata",
        pendingContentUrl: url
      });
    }
    return;
  }

  try {
    const contentId = await ensureContent({
      title: trimmedTitle,
      description: trimmedDescription
    });

    const sessionAfterEnsure = tabSessions.get(tabId);
    if (!sessionAfterEnsure) {
      return;
    }

    const userContentId = await createUserContent({
      websiteUserId: sessionAfterEnsure.websiteUserId,
      contentId
    });

    const contentVisitId = await createContentVisit(userContentId);

    const latestSession = tabSessions.get(tabId);
    if (!latestSession) {
      return;
    }

    tabSessions.set(tabId, {
      ...latestSession,
      contentStatus: "active",
      pendingContentUrl: null,
      contentSession: {
        url,
        contentId,
        contentUserId: userContentId,
        contentVisitId,
        metadata: {
          title: trimmedTitle,
          description: trimmedDescription
        }
      }
    });
  } catch (error) {
    console.error(`No se pudo registrar el contenido para la pestaña ${tabId}`, error);
    const sessionAfterError = tabSessions.get(tabId);
    if (sessionAfterError) {
      tabSessions.set(tabId, {
        ...sessionAfterError,
        contentStatus: "error"
      });
    }
  }
};

const endVisitForTab = async (tabId) => {
  const session = tabSessions.get(tabId);

  // 1. Validar si hay una sesión y un visitId que cerrar.
  if (!session || !session.visitId) {
    // Si hay una sesión pero sin visitId (estado inválido), bórrala localmente.
    if (session) {
      tabSessions.delete(tabId);
    }
    return;
  }

  try {
    const contentClosed = await endContentSessionForTab(tabId);

    if (!contentClosed) {
      return;
    }

    // 2. Intentar actualizar la base de datos (remoto) PRIMERO.
    await endWebsiteVisit(session.visitId);

    // 3. ÉXITO: Solo si la BD se actualizó, borramos la sesión local.
    tabSessions.delete(tabId);

  } catch (error) {
    // 4. FALLO: Si la BD falla, *no* borramos la sesión local.
    // Dejamos el error en consola. La sesión local (visitId_A) se mantiene.
    console.error(`No se pudo actualizar la salida de la visita (VisitID: ${session.visitId}). La sesión local se reintentará luego.`, error);
  }
};

const registerVisitForTab = async (tabId, url) => {
  if (!isHttpUrl(url)) {
    await endVisitForTab(tabId);
    return;
  }

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    console.error("No se pudo analizar la URL de la pestaña", url);
    await endVisitForTab(tabId);
    return;
  }

  const domain = normaliseHost(hostname);
  let currentSession = tabSessions.get(tabId);

  // --- Blindajes clave (Modificados) ---

  // 1. Blindaje de Dominio: Si ya hay visita activa (visitId) para el MISMO dominio, no hacer nada.
  if (currentSession?.visitId && currentSession.domain === domain) {
    if (currentSession.url !== url) {
      await startContentSessionForTab(tabId, url);
    }
    return;
  }

  // 2. Blindaje de Condición de Carrera:
  // Si ya hay una sesión "pending" para este dominio, significa que ya estamos
  // en proceso de crear una visita. Salir para evitar duplicados.
  if (currentSession?.status === 'pending' && currentSession.domain === domain) {
    return;
  }

  // 3. Si la sesión anterior era de un dominio diferente (y tenía visitId), ciérrala.
  if (currentSession?.visitId && currentSession.domain !== domain) {
    await endVisitForTab(tabId);
    // endVisitForTab borra la sesión, así que currentSession ya no es válido localmente.
  }

  // 4. "Bloquear" la pestaña: Marcar la sesión como "pending" ANTES de cualquier await de red.
  // Esto detendrá la Llamada 2 (de onUpdated) en el blindaje #2.
  tabSessions.set(tabId, { domain: domain, status: 'pending', visitId: null });

  // --- Fin de Blindajes ---

  try {
    const websiteId = await ensureWebsite(domain);
    const { id: websiteUserId, categoryId: websiteCategoryId } = await ensureWebsiteUser(websiteId, domain);
    const visitId = await createWebsiteVisit(websiteUserId);

    const newSession = {
      domain,
      websiteUserId,
      websiteCategoryId,
      visitId,
      url: null,
      contentSession: null,
      contentStatus: "idle",
      pendingContentUrl: null
    };

    // 5. "Desbloquear": Actualizar la sesión con el visitId final.
    tabSessions.set(tabId, newSession);

    await startContentSessionForTab(tabId, url);

  } catch (error) {
    console.error(`No se pudo registrar la visita para la pestaña ${tabId}`, error);

    // 6. Limpieza en caso de error: Si falla la creación,
    // eliminar la sesión "pending" para permitir reintentos.
    const sessionAfterError = tabSessions.get(tabId);
    if (sessionAfterError?.status === 'pending') {
      tabSessions.delete(tabId);
    }
  }
};


const handleTabActivated = async (activeInfo) => {
  if (activeInfo.tabId === currentActiveTabId) return;

  // 1. Identifica el ID de la pestaña que está dejando de estar activa
  const oldActiveTabId = currentActiveTabId;

  // 2. Actualiza el ID de la pestaña activa INMEDIATAMENTE para prevenir duplicación
  currentActiveTabId = activeInfo.tabId;

  // 3. Cierra la visita de la pestaña ANTERIOR (usando el ID guardado)
  if (oldActiveTabId !== null) {
    // USO DE AWAIT ES CORRECTO. Si falla, el problema es en endVisitForTab
    await endVisitForTab(oldActiveTabId);
  }

  // 4. Inicia la visita en la nueva pestaña
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab?.url) {
      // Esto no abrirá otra visita si ya hay una activa para el mismo dominio (gracias al blindaje)
      await registerVisitForTab(activeInfo.tabId, tab.url);
    } else {
      await endVisitForTab(activeInfo.tabId);
    }
  } catch (error) {
    console.error("No se pudo recuperar la pestaña activa", error);
  }
};


const handleTabUpdate = async (tabId, changeInfo, tab) => {
  // 1) Cambio de URL detectado
  if (changeInfo.url) {
    if (!isHttpUrl(changeInfo.url)) {
      await endVisitForTab(tabId);
      return;
    }
    // Comparar dominios usando la URL NUEVA
    let newDomain;
    try {
      newDomain = normaliseHost(new URL(changeInfo.url).hostname);
    } catch {
      await endVisitForTab(tabId);
      return;
    }

    const curr = tabSessions.get(tabId);
    // Si el dominio cambió y la pestaña está activa, cerramos la visita anterior y abrimos nueva
    if (tab.active && curr?.domain !== newDomain) {
      await endVisitForTab(tabId);
      await registerVisitForTab(tabId, changeInfo.url);
      return;
    }

    if (tab.active && curr?.domain === newDomain) {
      await startContentSessionForTab(tabId, changeInfo.url);
    }
    return;
  }

  // 2) Carga completa sin cambio de URL: solo “asegurar” sesión si es la pestaña activa
  if (changeInfo.status === "complete") {
    if (tabId === currentActiveTabId && tab.active && tab.url) {
      await registerVisitForTab(tabId, tab.url);
      await startContentSessionForTab(tabId, tab.url);
    }
    return;
  }
};


const handleTabRemoved = async (tabId) => {
  if (tabId === currentActiveTabId) {
    currentActiveTabId = null;
  }

  await endVisitForTab(tabId);
};

const handleWindowFocusChanged = async (windowId) => {
  // Ignorar si la ventana pierde el foco (ej. si windowId es chrome.windows.WINDOW_ID_NONE)
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // ⚠️ Opcional: Podrías considerar aquí cerrar la visita de currentActiveTabId,
    // pero generalmente se espera al foco de la nueva ventana.
    return;
  }

  try {
    // Obtener la pestaña actualmente activa en la ventana que acaba de ser enfocada
    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });

    if (chrome.runtime.lastError) {
      console.error("Error al consultar pestañas en handleWindowFocusChanged", chrome.runtime.lastError);
      return;
    }

    const [activeTab] = tabs;

    if (activeTab?.id && activeTab.id !== currentActiveTabId) {
      // Usamos handleTabActivated para reutilizar la lógica de cierre (del ID anterior)
      // y apertura (del ID nuevo).
      await handleTabActivated({ tabId: activeTab.id, windowId: activeTab.windowId });
    }
  } catch (error) {
    console.error("Error al manejar el cambio de foco de ventana", error);
  }
};

const initialiseActiveTabTracking = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("No se pudo obtener la pestaña activa al iniciar", chrome.runtime.lastError);
      return;
    }

    const [activeTab] = tabs;

    if (!activeTab?.id) {
      return;
    }

    currentActiveTabId = activeTab.id;

    if (activeTab.url) {
      void registerVisitForTab(activeTab.id, activeTab.url);
    }
  });
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleTabUpdate(tabId, changeInfo, tab);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void handleTabActivated(activeInfo);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleTabRemoved(tabId);
});

// Nuevo Listener para manejar el cambio de foco de la ventana
chrome.windows.onFocusChanged.addListener((windowId) => {
  void handleWindowFocusChanged(windowId);
});

initialiseActiveTabTracking();
