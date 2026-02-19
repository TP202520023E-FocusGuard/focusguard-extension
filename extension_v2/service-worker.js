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

    // Si se viaja a otro sitio web pero en la misma pestaña entonces se considera como 2 registros en la BD
    let { tabs_tracking } = await chrome.storage.local.get("tabs_tracking");
    if (tabs_tracking) {
      let id_web_before = tabs_tracking[tabId.toString()];

      if (id_web_before)
        await register_departuretime_web(id_web_before, { fecha_hora_salida: new Date(Date.now()) });
    }

    /* TODO: Se puede, si lo consideramos necesario, agregar logica para que cuando el usuario abra
        varios sitios web rápido, se registre su salida inmediantamente si el tabID != last_web ,
        de esta forma no habra registros de salida NULL */
    await complete_register_web(tabId, new URL(tabInfo.url).hostname);

  }

}

async function handleRemoved(tabId, removeInfo) {

  // TODO: Cuando se cierra la ventana entera (todas las pestañas)

  let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
  let db_id_visited = tabs_tracking[tabId.toString()];
  if (!db_id_visited) return; // verificamos si el db_id_visited existe

  /* Solo se registra la salida de la web si la pestaña que estamos cerrando es la ACTIVA sino esto
     quiere decir que hemos cerrado una pestaña que estaba en 2do plano y por ende su salida ya se
     registró al momento que cambio de pestaña ACTIVA */
  if (tabId === last_web_activated) {
    await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });
  }

  delete tabs_tracking[tabId.toString()];
  await chrome.storage.local.set({"tabs_tracking": tabs_tracking});

}

let processingTabId = null;
async function handleActivated(activeInfo) {

  // BLOQUEO INSTANTÁNEO: Si ya estamos procesando este ID, abortamos sin esperar al storage
  if (processingTabId === activeInfo.tabId) return;
  processingTabId = activeInfo.tabId;

  console.log("Se ejecuta el handleActivated", activeInfo.tabId);

  // --- REGISTRO DE SALIDA DE LA PESTAÑA ANTERIOR ---

  let { last_web_activated } = await chrome.storage.local.get("last_web_activated");

  // verificamos si existe alguna web anterior o si esta será la primera
  if (!last_web_activated) {
    await chrome.storage.local.set({ "last_web_activated": activeInfo.tabId });
    return;
  }

  await chrome.storage.local.set({ "last_web_activated": activeInfo.tabId });

  // Si focus_chrome es false significa que el usuario clickeo otra pestaña al reenfocarse a Chrome
  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  if (focus_chrome) {

    let { tabs_tracking = {} } = await chrome.storage.local.get("tabs_tracking");
    let db_id_visited = tabs_tracking[last_web_activated?.toString()];

    // Si el ultimo web_visited existe en el local storage entonces se hace el try-catch
    // Cuando puede no existir?: Cuando la ultima web no es http
    if (db_id_visited)
      await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });

  } else await setFocusChrome(true);

  // --- REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE ---

  let tab_info = await chrome.tabs.get(activeInfo.tabId);

  if(tab_info.url && isHttpUrl(tab_info.url))
    await complete_register_web(activeInfo.tabId, new URL(tab_info.url).hostname);

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

  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  if (alarm.name !== "pulse" || focus_chrome === false) return;

  // 1. AUDITORÍA FORZADA DE FOCO (Polling)
  let anyWindowFocused = false;
  try {
    const windows = await chrome.windows.getAll({ populate: false });
    anyWindowFocused = windows.some(win => win.focused === true);

    // Si ninguna ventana tiene foco real, forzamos la salida aunque el evento fallara
    if (!anyWindowFocused) {
      console.log("[Policía de Foco] Detectada salida omitida por el sistema.");
      await setFocusChrome(false);

      // Registramos la salida en la BD
      let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
      let db_id = tabs_tracking[last_web_activated?.toString()];
      if (db_id) await register_departuretime_web(db_id, { fecha_hora_salida: new Date() });

      return;
    } else await setFocusChrome(true);
  } catch (e) {
    console.error("Error en auditoría de alarma:", e);
  }

  // 2. LÓGICA DE PULSO NORMAL (Si hay foco)
  let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
  let db_id_visited = tabs_tracking[last_web_activated?.toString()];
  if (db_id_visited) await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date() });

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

  /* Si se cambia de ventana tan rápido que el temporizador de 500ms aún no ha terminado,
     cancelamos el anterior para que no se registren dos eventos de salida/entrada cruzados */
  if (focusTimeout) {
    clearTimeout(focusTimeout);
    focusTimeout = null;
  }

  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");

  // CONTEXTO: Si el usuario ya no está dentro de Chrome
  if (windowId === chrome.windows.WINDOW_ID_NONE) {

    // Esperamos 500ms antes de ejecutar el código para confirmar que no haya sido una "salida rápida de carga"
    focusTimeout = setTimeout(async () => {
      // --- VERIFICACIÓN DE SEGURIDAD ---
      /* Descomentar en caso se use contextType BACKGROUND
      // VERIFICACIÓN 1: Si hay alguna ventana activa
      let lastWin;
      try {
        lastWin = await chrome.windows.getLastFocused();
      } catch (e) {
        console.warn("[Apagado] No hay ventanas activas. Registrando salida final...");
        await setFocusChrome(false);
        return;
      }

      // VERIFICACIÓN 2: Si la ventana ha sido minimizada xq entonces el usuario ya NO estaría viendo Chrome
      if (lastWin.state === 'minimized') {
        console.warn("Salida por MINIMIZACIÓN o cierre.");
        await setFocusChrome(false);
        let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
        let db_id_visited = tabs_tracking[last_web_activated?.toString()];
        if (db_id_visited) await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });
        focusTimeout = null;
        return;
      }*/

      // VERIFICACIÓN 3: Si alguna ventana tiene el foco actualmente
      const windows = await chrome.windows.getAll({ populate: false });
      const anyWindowFocused = windows.some(win => win.focused === true);

      // VERIFICACIÓN 4: Si se a abierto un subelemento dentro de Chrome
      /* Clickear una extensión se considera salida total de chrome, por eso verificamos si hay algún
         contexto abierto (un popup de extensión se considera contexto). Si lo hay significa que
         el usuario siguen en chrome y simplemente a abierto una extensión*/
      const contexts = await chrome.runtime.getContexts({
        //contextTypes: ['POPUP', 'TAB', 'BACKGROUND', 'OFFSCREEN_DOCUMENT', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
        contextTypes: ['POPUP', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
      }).catch(() => []);
      const isPopupOpen = contexts.length > 0;

      if (anyWindowFocused || isPopupOpen) {
        await setFocusChrome(true);

        console.log("[Resiliencia] Salida cancelada: Se detectó una ventana con foco real.");
        focusTimeout = null;

        const activeWindow = windows.find(win => win.focused === true);

        let [activeTab] = await chrome.tabs.query({ active: true, windowId: activeWindow.id });
        let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);

        if (activeTab && activeTab.id !== last_web_activated ) {

          console.log("Se ejecuta el handleActivated V4", activeTab.id);

          // --- REGISTRO DE SALIDA DE LA PESTAÑA ANTERIOR ---

          let db_id_visited = tabs_tracking[last_web_activated?.toString()];
          if (db_id_visited)
            await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });

          // --- REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE ---

          await chrome.storage.local.set({"last_web_activated": activeTab.id});

          if(activeTab.url && isHttpUrl(activeTab.url))
            await complete_register_web(activeTab.id, new URL(activeTab.url).hostname);

        }
        return;
      }

      // --- REGISTRO DE SALIDA EN LA BD ---

      console.warn("[Confirmado] Usuario fuera de Chrome. Registrando salida...");
      await setFocusChrome(false);

      let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
      let db_id_visited = tabs_tracking[last_web_activated?.toString()];
      if (db_id_visited) await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });

      focusTimeout = null;
    }, 500);

  } else if (focus_chrome === false) {
    // CONTEXTO: Si el usuario volvió a Chrome después de estar en otra app

    let [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
    await chrome.storage.local.set({ "last_web_activated": tab.id });

    if(tab && tab.url && isHttpUrl(tab.url))
      await complete_register_web(tab.id, new URL(tab.url).hostname);

    console.log("Se ejecuta el handleActivated V3", tab.id);
    await setFocusChrome(true);
    /* TODO[Si se considera necesario]: Cuando estas fuera y vuelves a Chrome pero a una pestaña
        distinta de dónde lo dejaste entonces se activa el handleUpdated y el handleWindowsChanged,
        esto registra 2 veces la visita pero no cierra la 1era visita. Tal vez se podría solucionar
        si preguntaramos a la BD si la ultima visita es de la misma web para ya no registralo otra vez */
  } else {
    // CONTEXTO: Si el usuario solo se movió entre ventanas de Chrome

    let [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });
    let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);

    if (activeTab && activeTab.id !== last_web_activated ) {

      if (processingTabId === activeTab.id) return;
      processingTabId = activeTab.id;

      console.log("Se ejecuta el handleActivated V2", activeTab.id);

      // --- REGISTRO DE SALIDA DE LA PESTAÑA ANTERIOR ---

      let db_id_visited = tabs_tracking[last_web_activated?.toString()];
      if (db_id_visited)
        await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });

      // --- REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE ---

      await chrome.storage.local.set({"last_web_activated": activeTab.id});

      if(activeTab.url && isHttpUrl(activeTab.url))
        await complete_register_web(activeTab.id, new URL(activeTab.url).hostname);

    }
  }

}


chrome.idle.onStateChanged.addListener(async (state) => {
  // Si el usuario bloquea su pantalla, se registra la salida de la ultima web que estaba viendo
  if (state === "locked") {
    console.log("Se bloqueo la computadora");
    let { focus_chrome } = await chrome.storage.local.get("focus_chrome");

    if (focus_chrome) {
      await setFocusChrome(false);

      let { last_web_activated, tabs_tracking = {} } = await chrome.storage.local.get(null);
      let db_id_visited = tabs_tracking[last_web_activated?.toString()];

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

