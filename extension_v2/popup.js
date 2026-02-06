async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

async function getCurrentDomain() {
  let currentTab = await getCurrentTab();
  if (!currentTab?.url) return null;

  try {
    return new URL(currentTab.url).hostname;
  } catch (error) {
    console.error("No se pudo obtener el dominio de:", currentTab.url);
    return null;
  }
}

// Mandamos al DOM el dominio de la pagina actual
document.getElementById("domain").innerHTML = await getCurrentDomain();
