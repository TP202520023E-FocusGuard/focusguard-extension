const USER_ID = 1;
const DEFAULT_CATEGORY_ID = 1;
const DEFAULT_ORIGIN = "default";

const isHttpUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

async function handleUpdated(tabId, changeInfo, tabInfo) {
  // todo Caso 1: Se abre la pestaña (Creo que no importa)
  // todo Caso 3: Se cierra la pestaña

  // Caso 2: Se actualiza la pestaña
  if(changeInfo.status === 'complete' && tabInfo.url) {

    if (!isHttpUrl(tabInfo.url)) return;

    let new_website = { dominio: new URL(tabInfo.url).hostname };

    try {
      let response1 = await fetch(`http://127.0.0.1:8000/api/v1/websites`, {
        method: "POST",
        body: JSON.stringify(new_website),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response1.ok)
        throw new Error(`Error en websites: ${response1.status}`);

      let data = await response1.json();
      let id_web = data.id;

      const new_website_user = {
        id_usuarios: USER_ID,
        id_sitios_web: id_web,
        id_categorias_web: DEFAULT_CATEGORY_ID,
        origen: DEFAULT_ORIGIN
      };

      let response2 = await fetch(`http://127.0.0.1:8000/api/v1/website-users`, {
        method: "POST",
        body: JSON.stringify(new_website_user),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response2.ok)
        throw new Error(`Error en website-users: ${response2.status}`);

      let data2 = await response2.json();
      let id_web_user = data2.id;

      let new_web_visited = {
        id_usuarios: USER_ID,
        id_sitios_web_usuario: id_web_user,
        fecha_hora_ingreso: new Date(Date.now())
      };

      let response3 = await fetch(`http://127.0.0.1:8000/api/v1/website-visited`, {
        method: "POST",
        body: JSON.stringify(new_web_visited),
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (!response3.ok)
        throw new Error(`Error en website-user-visited: ${response3.status}`);

    } catch (e) {
      console.error(e.message);
    }

  }

}

chrome.tabs.onUpdated.addListener(handleUpdated);
