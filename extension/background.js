const BACKEND_ENDPOINT = "http://localhost:8000/api/v1/websites";
const tabDomains = new Map();

const normaliseHost = (hostname = "") => hostname.replace(/^www\./, "").toLowerCase();

const isHttpUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const sendDomainToBackend = async (domain) => {
  if (!domain) {
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
  } catch (error) {
    console.error("Error al enviar el dominio al backend", error);
  }
};

const registerDomainForTab = async (tabId, url) => {
  if (!isHttpUrl(url)) {
    return;
  }

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch (error) {
    console.error("No se pudo analizar la URL de la pestaña", error);
    return;
  }

  const normalised = normaliseHost(hostname);
  const cached = tabDomains.get(tabId);
  if (cached === normalised) {
    return;
  }

  tabDomains.set(tabId, normalised);
  await sendDomainToBackend(normalised);
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab?.url) {
    void registerDomainForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab?.url) {
      void registerDomainForTab(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.error("No se pudo recuperar la pestaña activa", error);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabDomains.delete(tabId);
});
