const USER_ID = 1;
const DEFAULT_CATEGORY_ID = 1;
const DEFAULT_ORIGIN = "default";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await handleOnStartup();

  if (reason === 'install')
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

    let { tabs_tracking } = await chrome.storage.local.get("tabs_tracking");

    if (tabs_tracking) {
      let id_web_before = tabs_tracking[tabId.toString()];

      if (!(id_web_before === undefined))
        await register_departuretime_web(id_web_before, { fecha_hora_salida: new Date(Date.now()) });
    }

    await complete_register_web(tabId, new URL(tabInfo.url).hostname);

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

  // 1. REGISTRO DE SALIDA DE LA PESTAÑA ANTERIOR

  let { last_web_activated } = await chrome.storage.local.get("last_web_activated");

  // verificamos si existe alguna web anterior o si esta será la primera
  if (!last_web_activated) {
    await chrome.storage.local.set({ "last_web_activated": activeInfo.tabId });
    return;
  }

  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  if (focus_chrome) {

    let { tabs_tracking = {} } = await chrome.storage.local.get("tabs_tracking");
    let db_id_visited = tabs_tracking[last_web_activated.toString()];

    // Si el ultimo web_visited existe en el local storage entonces se hace el try-catch
    // Cuando puede no existir?: Cuando la ultima web no es http
    if (db_id_visited)
      await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });

  } else await setFocusChrome(true);

  await chrome.storage.local.set({ "last_web_activated": activeInfo.tabId });

  // 2. REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE

  let tab_info = await chrome.tabs.get(activeInfo.tabId);

  if(tab_info.url) {
    if (!isHttpUrl(tab_info.url)) return;
    await complete_register_web(activeInfo.tabId, new URL(tab_info.url).hostname);
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

/*
async function handleAlarm(alarm) {

  const { focus_chrome, last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);

  if (alarm.name !== "pulse" || focus_chrome === false) return;

  if (!last_web_activated) return;

  let db_id_visited = tabs_tracking[last_web_activated.toString()];
  if (!db_id_visited) return;

  await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });
}
*/

async function handleAlarm(alarm) {
  if (alarm.name !== "pulse") return;

  // 1. AUDITORÍA FORZADA DE FOCO (Polling)
  let anyWindowFocused = false;
  try {
    const windows = await chrome.windows.getAll({ populate: false });
    anyWindowFocused = windows.some(win => win.focused === true);
    let { focus_chrome } = await chrome.storage.local.get("focus_chrome");

    // Si ninguna ventana tiene foco real, forzamos la salida aunque el evento fallara
    if (!anyWindowFocused) {
      if (focus_chrome === false) {
        console.log("[Policía de Foco] Sigue fuera de chrome, no se registra salida otra vez");
        return;
      } // No volvemos a registrar salida para el mismo last_web
      console.log("[Policía de Foco] Detectada salida omitida por el sistema.");
      await setFocusChrome(false);

      // Registramos la salida en la BD si el estado anterior era true
      let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
      if (last_web_activated) {
        let db_id = tabs_tracking[last_web_activated.toString()];
        if (db_id) await register_departuretime_web(db_id, { fecha_hora_salida: new Date() });
      }
      return; // Salimos, no hay nada que pulsar
    } else await setFocusChrome(true);
  } catch (e) {
    console.error("Error en auditoría de alarma:", e);
  }

  // 2. LÓGICA DE PULSO NORMAL (Si hay foco)
  const { focus_chrome, last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
  if (focus_chrome === false || !last_web_activated) return;

  let db_id_visited = tabs_tracking[last_web_activated.toString()];
  if (db_id_visited) {
    await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date() });
  }
}

async function checkAlarmState() {
  const alarm = await chrome.alarms.get("pulse");

  if (!alarm) {
    await chrome.alarms.create("pulse", { periodInMinutes: 1 });
  }
}

async function handleOnStartup() {
  try {
    await chrome.storage.local.remove(["tabs_tracking", "last_web_activated", "focus_chrome"]);
  } catch (e) {
    console.error(e.message);
  }
  await chrome.storage.local.set({"focus_chrome": true});
}

/* "temporizador de salida": Si el foco vuelve a Chrome antes de que el tiempo se cumpla,
    abortamos el registro de salida en la BD. */
let focusTimeout = null;

async function setFocusChrome(isFocused) {
  await chrome.storage.local.set({"focus_chrome": isFocused});
  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  console.log("Esta en chrome?: ", focus_chrome);
}

/* NOTA: Esta función está pensada para que cuando el usuario se mueva a otra aplicación (Ej. Excel),
   se registre la hora de salida del ultimo sitio web que estaba visitando. Sin embargo, ciertas
   acciones dentro de Chrome también son interpretadas como "salidas" rapidas de carga (ej. clickear una extensión,
   cerrar pestañas, cambiar entre pestañas, etc), ya que el flujo que siguen es Ventana A -> Salida -> Ventana A.
   Es por ello, que se utilizarán focusTimeout y setTimeout para verificar que realmente sea una
   salida de chrome y no una "salida rápida de carga". */
async function handleWindowsChanged(windowId) {

  // Cancelamos cualquier salida que estuviera "en cola"
  if (focusTimeout) {
    clearTimeout(focusTimeout);
    focusTimeout = null;
  }

  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  console.log("Se ejecutó el handleWindowsChanged");

  // Si el usuario ya no está dentro de Chrome
  if (windowId === chrome.windows.WINDOW_ID_NONE) {

    // Esperamos 500ms para confirmar que no sea una "salida rápida de carga"
    focusTimeout = setTimeout(async () => {
      // --- VERIFICACIÓN DE SEGURIDAD ---

      let lastWin;

      try {
        // Intentamos obtener la última ventana que tuvo el foco
        lastWin = await chrome.windows.getLastFocused();
      } catch (e) {
        // Si da error, significa que NO HAY ventanas (Chrome se cerró)
        console.warn("[Apagado] No hay ventanas activas. Registrando salida final...");
        await setFocusChrome(false);

        return;
      }

      // 2. FILTRO DE MINIMIZACIÓN (Prioridad 1)
      // Si la ventana está minimizada, el usuario NO está viendo Chrome.
      if (lastWin.state === 'minimized') {
        console.warn("[Confirmado] Salida por MINIMIZACIÓN o cierre.");
        await setFocusChrome(false);

        return;
      }

      // Pedimos todas las ventanas y vemos si alguna tiene el foco actualmente
      const windows = await chrome.windows.getAll({ populate: false });
      const anyWindowFocused = windows.some(win => win.focused === true);

      /* Clickear una extensión se considera salida total de chrome, por eso verificamos si hay algún
         contexto abierto (un popup de extensión se considera contexto). Si lo hay significa que
         el usuario siguen en chrome y simplemente a abierto una extensión*/
      const contexts = await chrome.runtime.getContexts({
        //contextTypes: ['POPUP', 'TAB', 'BACKGROUND', 'OFFSCREEN_DOCUMENT', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
        contextTypes: ['POPUP', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
      }).catch(() => []);
      const isPopupOpen = contexts.length > 0;

      if (anyWindowFocused || isPopupOpen) {
        console.log("[Resiliencia] Salida cancelada: Se detectó una ventana con foco real.");
        focusTimeout = null;

        await setFocusChrome(true)

        return;
      }

      console.warn("[Confirmado] Usuario fuera de Chrome. Registrando salida...");

      // --- REGISTRO DE SALIDA EN LA BD ---
      await setFocusChrome(false);

      let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
      if (!last_web_activated) return;
      let db_id_visited = tabs_tracking[last_web_activated.toString()];

      if (db_id_visited)
        await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });

      focusTimeout = null;
    }, 500);

  } else if (focus_chrome === false) {
    // Si el usuario volvió a Chrome después de estar en otra app

    const win = await chrome.windows.get(windowId);
    console.log("Has vuelto a una ventana de tipo:", win.type);

    let [tab] = await chrome.tabs.query({ active: true, windowId: windowId });

    if(tab && tab.url && isHttpUrl(tab.url))
      await complete_register_web(tab.id, new URL(tab.url).hostname);

    await chrome.storage.local.set({"focus_chrome": true});
    let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
    console.log("Esta en chrome?: ", focus_chrome);
  }

}

chrome.idle.onStateChanged.addListener(async (state) => {
  //console.log("Estado de inactividad:", state);
  if (state === "locked") {
    console.log("Se bloqueo la computadora");
    let { focus_chrome } = await chrome.storage.local.get("focus_chrome");

    if (focus_chrome) {
      await setFocusChrome(false);

      let { last_web_activated } = await chrome.storage.local.get("last_web_activated");
      let { tabs_tracking = {} } = await chrome.storage.local.get("tabs_tracking");
      let db_id_visited = tabs_tracking[last_web_activated.toString()];

      if (db_id_visited)
        await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });
    }
  }
});

chrome.runtime.onStartup.addListener(handleOnStartup);

chrome.windows.onFocusChanged.addListener(handleWindowsChanged);

chrome.tabs.onUpdated.addListener(handleUpdated);

chrome.tabs.onRemoved.addListener(handleRemoved);

chrome.tabs.onActivated.addListener(handleActivated);

chrome.alarms.onAlarm.addListener(handleAlarm);
checkAlarmState();

/*
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
      console.log(`[STORAGE] Key "${key}" cambió:`, oldValue, "->", newValue);
    }
  }
});
*/
