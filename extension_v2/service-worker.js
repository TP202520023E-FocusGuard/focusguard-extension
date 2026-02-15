const USER_ID = 1;
const DEFAULT_CATEGORY_ID = 1;
const DEFAULT_ORIGIN = "default";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;

  await chrome.alarms.create('pulse', { periodInMinutes: 1 });
});

const isHttpUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

async function handleUpdated(tabId, changeInfo, tabInfo) {

  if(changeInfo.status === 'complete' && tabInfo.url) {

    if (!isHttpUrl(tabInfo.url)) return;

    //let same_tab = await chrome.storage.local.get(tabId.toString());
    let { tabs_tracking } = await chrome.storage.local.get("tabs_tracking");

    if (tabs_tracking) {

      let id_web_before = tabs_tracking[tabId.toString()];

      if (!(id_web_before === undefined)) {
        let web_before_updated = { fecha_hora_salida: new Date(Date.now()) };
        await register_departuretime_web(id_web_before, web_before_updated);
      }

    }

    let new_hostname = new URL(tabInfo.url).hostname;
    await complete_register_web(tabId, new_hostname);

  }

}

async function handleRemoved(tabId, removeInfo) {

  // TODO: Cuando se cierra la ventana entera (todas las pestañas)

  let { tabs_tracking = {} } = await chrome.storage.local.get("tabs_tracking");
  let db_id_visited = tabs_tracking[tabId.toString()];
  if (!db_id_visited) return; // verificamos si el db_id_visited existe

  let { last_web_activated } = await chrome.storage.local.get("last_web_activated");
  let web_visited_updated = { fecha_hora_salida: new Date(Date.now()) };

  // Solo se registra la salida de la web si la pestaña que estamos cerrando es la activa sino esto
  // quiere decir que ya hemos registrado su salida al cambiar a otra pestaña
  if (tabId === last_web_activated) {
    await register_departuretime_web(db_id_visited, web_visited_updated);
  }

  delete tabs_tracking[tabId.toString()];
  await chrome.storage.local.set({"tabs_tracking": tabs_tracking});

}

async function handleActivated(activeInfo) {

  let { last_web_activated } = await chrome.storage.local.get("last_web_activated");

  // verificamos si existe alguna web anterior o si esta será la primera
  if (!last_web_activated) {
    await chrome.storage.local.set({ "last_web_activated": activeInfo.tabId });
    return;
  }

  let { tabs_tracking = {} } = await chrome.storage.local.get("tabs_tracking");
  let db_id_visited = tabs_tracking[last_web_activated.toString()];

  // Si el ultimo web_visited existe en el local storage entonces se hace el try-catch
  // Cuando puede no existir?: Cuando la ultima web no es http
  if (db_id_visited) {
    let web_visited_updated = { fecha_hora_salida: new Date(Date.now()) };
    await register_departuretime_web(db_id_visited, web_visited_updated);
  }

  await chrome.storage.local.set({ "last_web_activated": activeInfo.tabId });

  // __________________________________________
  // REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE
  // __________________________________________

  let tab_info = await chrome.tabs.get(activeInfo.tabId);

  if(tab_info.url) {

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
    let { tabs_tracking = {} } = await chrome.storage.local.get("tabs_tracking");
    tabs_tracking[tabId.toString()] = data3.id;

    await chrome.storage.local.set({"tabs_tracking": tabs_tracking});

  } catch (e) {
    console.error(e.message);
  }
}

async function register_departuretime_web(id_web, web_updated) {
  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/website-visited/${id_web}`, {
      method: "PATCH",
      body: JSON.stringify(web_updated),
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

async function handleAlarm(alarm) {

  if (alarm.name !== "pulse") return;

  let { last_web_activated } = await chrome.storage.local.get("last_web_activated");
  if (!last_web_activated) return;

  let { tabs_tracking = {} } = await chrome.storage.local.get("tabs_tracking");
  let db_id_visited = tabs_tracking[last_web_activated.toString()];
  if (!db_id_visited) return;

  let web_visited_updated = { fecha_hora_salida: new Date(Date.now()) };

  await register_departuretime_web(db_id_visited, web_visited_updated);

}

async function checkAlarmState() {
  const alarm = await chrome.alarms.get("pulse");

  if (!alarm) {
    await chrome.alarms.create("pulse", { periodInMinutes: 1 });
  }
}

async function handleOnStartup() {
  try {
    await chrome.storage.local.remove(["tabs_tracking", "last_web_activated"]);
  } catch (e) {
    console.error(e.message);
  }
}

chrome.runtime.onStartup.addListener(handleOnStartup);

chrome.tabs.onUpdated.addListener(handleUpdated);

chrome.tabs.onRemoved.addListener(handleRemoved);

chrome.tabs.onActivated.addListener(handleActivated);

chrome.alarms.onAlarm.addListener(handleAlarm);
checkAlarmState();
