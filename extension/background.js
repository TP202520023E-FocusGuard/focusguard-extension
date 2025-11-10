const API_BASE_URL = "http://127.0.0.1:8000/api/v1";
const ENDPOINTS = {
  websites: `${API_BASE_URL}/websites`,
  websiteUsers: `${API_BASE_URL}/website-users`,
  websiteVisited: `${API_BASE_URL}/website-visited`
};

const USER_ID = 1;
const DEFAULT_CATEGORY_ID = 1;
const DEFAULT_ORIGIN = "default";

const tabSessions = new Map();
const websitesCache = new Map();
const websiteUserCache = new Map();
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

  websiteUserCache.set(cacheKey, userWebsiteId);
  return userWebsiteId;
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

const endVisitForTab = async (tabId) => {
  const session = tabSessions.get(tabId);

  if (!session) {
    return;
  }

  tabSessions.delete(tabId);

  if (!session.visitId) {
    return;
  }

  try {
    await endWebsiteVisit(session.visitId);
  } catch (error) {
    console.error("No se pudo actualizar la salida de la visita", error);
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
  const currentSession = tabSessions.get(tabId);

  // --- Blindajes clave ---
  if (currentSession?.visitId) {
    // Si ya tenemos visita y es el mismo dominio, no dupliques
    if (currentSession.domain === domain) return;
    // Si cambia el dominio, cierra la anterior y continúa para abrir nueva
    await endVisitForTab(tabId);
  }
  // -----------------------

  try {
    const websiteId = await ensureWebsite(domain);
    const websiteUserId = await ensureWebsiteUser(websiteId, domain);
    const visitId = await createWebsiteVisit(websiteUserId);

    tabSessions.set(tabId, { domain, websiteUserId, visitId });
  } catch (error) {
    console.error(`No se pudo registrar la visita para la pestaña ${tabId}`, error);
  }
};


const handleTabActivated = async (activeInfo) => {
  if (activeInfo.tabId === currentActiveTabId) return;

  // Cierra la visita de la pestaña que DEJA de estar activa (si existía)
  if (currentActiveTabId !== null) {
    await endVisitForTab(currentActiveTabId);
  }

  currentActiveTabId = activeInfo.tabId;

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
    }
    return;
  }

  // 2) Carga completa sin cambio de URL: solo “asegurar” sesión si es la pestaña activa
  if (changeInfo.status === "complete") {
    if (tabId === currentActiveTabId && tab.active && tab.url) {
      await registerVisitForTab(tabId, tab.url);
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

initialiseActiveTabTracking();
