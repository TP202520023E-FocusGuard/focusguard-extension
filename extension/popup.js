const domainElement = document.getElementById("domain");
const categoryElement = document.getElementById("category");
const breakTimeElement = document.getElementById("break-time");
const leisureClassificationElement = document.getElementById(
  "leisure-classification"
);
const correctClassificationButton = document.getElementById(
  "correct-classification"
);

const CATEGORIES = {
  "youtube.com": "Doble Filo",
  "facebook.com": "Procrastinación",
  "aulavirtual.upc.edu.pe": "Productividad",
  "google.com": "Neutral"
};

const LEISURE_KEYWORDS = ["VEGETTA777", "VEGETTA", "MINECRAFT"];

function normaliseHost(hostname = "") {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function getCategory(hostname) {
  const normalized = normaliseHost(hostname);
  return CATEGORIES[normalized] ?? "Sin categoría";
}

function renderLeisureClassification(classification, { manual } = { manual: false }) {
  const suffix = manual ? " (corregido)" : "";
  leisureClassificationElement.textContent = `Clasificación de ocio: ${classification}${suffix}`;
}

async function getPageMetadata(tabId) {
  if (
    typeof chrome === "undefined" ||
    !chrome.scripting ||
    !chrome.scripting.executeScript
  ) {
    return { title: "", metaDescription: "" };
  }

  try {
    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title ?? "";
        const metaDescription =
          document.querySelector('meta[name="description"]')?.getAttribute(
            "content"
          ) ?? "";
        return { title, metaDescription };
      }
    });

    return injectionResult?.result ?? { title: "", metaDescription: "" };
  } catch (error) {
    console.error("Error al obtener metadatos de la página", error);
    return { title: "", metaDescription: "" };
  }
}

function includesLeisureKeyword(text) {
  const upperText = text.toUpperCase();
  return LEISURE_KEYWORDS.some((keyword) => upperText.includes(keyword));
}

async function resolveLeisureClassification(tabId, category) {
  if (category !== "Doble Filo") {
    return "No Ocio";
  }

  const { title, metaDescription } = await getPageMetadata(tabId);
  const hasKeyword = includesLeisureKeyword(title) || includesLeisureKeyword(metaDescription);

  return hasKeyword ? "Ocio" : "No Ocio";
}

async function initPopup() {
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
    domainElement.textContent =
      "Esta vista previa solo está disponible dentro del navegador.";
    categoryElement.textContent = "Categoría: Desconocida";
    renderLeisureClassification("- (no disponible)");
    breakTimeElement.textContent = "Tiempo de descanso restante: 60 minutos";
    return;
  }

  let currentClassification = "-";
  let manualOverride = false;

  if (correctClassificationButton) {
    correctClassificationButton.addEventListener("click", () => {
      if (currentClassification === "-") {
        return;
      }

      currentClassification =
        currentClassification === "Ocio" ? "No Ocio" : "Ocio";
      manualOverride = true;
      renderLeisureClassification(currentClassification, { manual: manualOverride });
    });
  }

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
    const category = getCategory(hostname);

    categoryElement.textContent = `Categoría: ${category}`;

    currentClassification = await resolveLeisureClassification(
      activeTab.id,
      category
    );
    manualOverride = false;
    renderLeisureClassification(currentClassification, { manual: manualOverride });
  } catch (error) {
    console.error("Error al obtener la pestaña activa", error);
    domainElement.textContent = "Ocurrió un error al obtener la pestaña actual.";
    categoryElement.textContent = "Categoría: Desconocida";
    renderLeisureClassification("- (error)");
  }

  breakTimeElement.textContent = "Tiempo de descanso restante: 60 minutos";
}

document.addEventListener("DOMContentLoaded", initPopup);
