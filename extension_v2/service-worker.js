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

    let new_hostname = new URL(tabInfo.url).hostname;

    await complete_register_web(tabId, new_hostname);

  }

}

async function handleRemoved(tabId, removeInfo) {
  // TODO: Cuando se cierra la pestaña dónde estoy
  // TODO: Cuando se cierra una pestaña dónde no estoy
  // TODO: Cuando se cierra la ventana entera (todas las pestañas)

  let web_visited = await chrome.storage.local.get(tabId.toString());
  let last_web = await chrome.storage.local.get("last_web_activated");

  if (web_visited[tabId] === undefined) return; // verificamos si el web_visited existe
  if (last_web["last_web_activated"] === undefined) return;

  let id_web_visited = web_visited[tabId];

  let web_visited_updated = {fecha_hora_salida: new Date(Date.now())};

  // Solo se registra la salida de la web si la pestaña que estamos cerrando es la activa sino esto
  // quiere decir que ya hemos registrado su salida al cambiar a otra pestaña
  if (tabId === last_web["last_web_activated"]) {
    try {
      let response = await fetch(`http://127.0.0.1:8000/api/v1/website-visited/${id_web_visited}`, {
        method: "PATCH",
        body: JSON.stringify(web_visited_updated),
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (!response.ok)
        throw new Error(`Error al actualizar la salida en website-user-visited: ${response.status}`);

    } catch (e) {
      console.error(e.message);
    }
  }

  chrome.storage.local.remove(tabId.toString());

}

async function handleActivated(activeInfo) {

  let last_web = await chrome.storage.local.get("last_web_activated");

  // verificamos si existe alguna web anterior o si esta será la primera
  if (last_web["last_web_activated"] === undefined) {
    chrome.storage.local.set({ last_web_activated: activeInfo.tabId });
    return;
  }

  let last_tabId = last_web["last_web_activated"];
  let web_visited = await chrome.storage.local.get(last_tabId.toString());

  let id_web_visited = web_visited[last_tabId.toString()];
  let web_visited_updated = {fecha_hora_salida: new Date(Date.now())};

  // Si el ultimo web_visited existe en el local storage entonces se hace el try-catch
  // Cuando puede no existir?: Cuando la ultima web no es http
  if (!(web_visited[last_tabId.toString()] === undefined)) {
    try {
      let response = await fetch(`http://127.0.0.1:8000/api/v1/website-visited/${id_web_visited}`, {
        method: "PATCH",
        body: JSON.stringify(web_visited_updated),
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (!response.ok)
        throw new Error(`Error en handleActivated() al actualizar la salida en website-user-visited: ${response.status}`);

      //chrome.storage.local.remove(last_tabId.toString());

    } catch (e) {
      console.error(e.message);
    }
  }

  chrome.storage.local.set({ last_web_activated: activeInfo.tabId });

  // __________________________________________
  // REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE
  // __________________________________________

  let tab_info = await chrome.tabs.get(activeInfo.tabId);

  if(tab_info.status === 'complete' && tab_info.url) {

    if (!isHttpUrl(tab_info.url)) return;

    let activated_hostname = new URL(tab_info.url).hostname;

    await complete_register_web(activeInfo.tabId, activated_hostname);

  }

}

// Registro completo en las tablas sitios_web, sitios_web_usuario y sitios_web_visitados
async function complete_register_web(tabId, hostname) {

  let new_web = { dominio: hostname };

  try {

    // REGISTRAMOS EL WEBSITE EN LA BD

    let response1 = await fetch(`http://127.0.0.1:8000/api/v1/websites`, {
      method: "POST",
      body: JSON.stringify(new_web),
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

    // REGISTRAMOS EL WEBSITE POR USUARIO EN LA BD

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

    // REGISTRAMOS LA FECHA DE ENTRADA AL WEBSITE EN LA BD

    let response3 = await fetch(`http://127.0.0.1:8000/api/v1/website-visited`, {
      method: "POST",
      body: JSON.stringify(new_web_visited),
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!response3.ok)
      throw new Error(`Error en website-user-visited: ${response3.status}`);

    let data3 = await response3.json();

    // GUARDAMOS EL ID DE LA PESTAÑA JUNTO CON SU ID DE WEBSITE_VISITADO EN LA BD
    chrome.storage.local.set({ [tabId.toString()]: data3.id }); // key -> tabId, value -> data3.id

  } catch (e) {
    console.error(e.message);
  }
}

chrome.tabs.onUpdated.addListener(handleUpdated);

chrome.tabs.onRemoved.addListener(handleRemoved);

chrome.tabs.onActivated.addListener(handleActivated);
