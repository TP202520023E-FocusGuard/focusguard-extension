const domainElement = document.getElementById("domain");
const categoryElement = document.getElementById("category");
const breakTimeElement = document.getElementById("break-time");

const CATEGORIES = {
  "youtube.com": "Doble Filo",
  "facebook.com": "Procrastinación",
  "aulavirtual.upc.edu.pe": "Productividad",
  "google.com": "Neutral"
};

function normaliseHost(hostname = "") {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function getCategory(hostname) {
  const normalized = normaliseHost(hostname);
  return CATEGORIES[normalized] ?? "Sin categoría";
}

async function initPopup() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });

    if (!activeTab || !activeTab.url) {
      domainElement.textContent = "No se pudo identificar el sitio actual.";
      categoryElement.textContent = "Categoría: Desconocida";
      return;
    }

    const url = new URL(activeTab.url);
    const hostname = url.hostname;

    domainElement.textContent = `El sitio en el que estás es: ${hostname}`;
    categoryElement.textContent = `Categoría: ${getCategory(hostname)}`;
  } catch (error) {
    console.error("Error al obtener la pestaña activa", error);
    domainElement.textContent = "Ocurrió un error al obtener la pestaña actual.";
    categoryElement.textContent = "Categoría: Desconocida";
  }

  breakTimeElement.textContent = "Tiempo de descanso restante: 60 minutos";
}

document.addEventListener("DOMContentLoaded", initPopup);
