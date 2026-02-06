const USER_ID = 1;
const DEFAULT_CATEGORY_ID = 1;
const DEFAULT_ORIGIN = "default";

async function handleUpdated(tabId, changeInfo, tabInfo) {
  // todo Caso 1: Se abre la pestaña (Creo que no importa)
  // todo Caso 3: Se cierra la pestaña

  // Caso 2: Se actualiza la pestaña
  if(changeInfo.url) {

    const input = { dominio: new URL(changeInfo.url).hostname };

    try {
      let response = await fetch(`http://127.0.0.1:8000/api/v1/websites`, {
        method: "POST",
        body: JSON.stringify(input),
        headers: {
          "Content-Type": "application/json",
        },
      });

      let data = await response.json();
      var id_web = data.id;
    } catch (e) {
      console.error("Error websites:", e)
    }

    const input2 = {
      id_usuarios: USER_ID,
      id_sitios_web: id_web,
      id_categorias_web: DEFAULT_CATEGORY_ID,
      origen: DEFAULT_ORIGIN
    };


    try {
      let response = await fetch(`http://127.0.0.1:8000/api/v1/website-users`, {
        method: "POST",
        body: JSON.stringify(input2),
        headers: {
          "Content-Type": "application/json",
        },
      });

    } catch (e) {
      console.error("Error website-users:", e)
    }

  }

}

chrome.tabs.onUpdated.addListener(handleUpdated);
