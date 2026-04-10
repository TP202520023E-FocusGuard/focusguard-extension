const DEFAULT_ORIGIN = "default";
let timerContent = null;
let processingTabId = null;
let focusTimeout = null;


// :::::: FUNCIONES HANDLERS ::::::

async function handleOnStartup() {
  console.log("---- STARTUP ----");

  /*
  let allStorageKeys= [
    "user_id",
    "tabs_tracking",
    "content_tracking",
    "last_web_activated",
    "focus_chrome",
    "last_domain",
    "assigned_rest_time",
    "interventions_allowed",
    "leisure_start",
    "accumulated_leisure_time"
  ]
  */

  try {
    // LIMPIAR STORAGE NECESARIO
    await chrome.storage.local.remove([
      "tabs_tracking",
      "content_tracking",
      "last_web_activated",
      "focus_chrome",
      "last_domain",
      "assigned_rest_time",
      "interventions_allowed",
      "leisure_start"
    ]); // No eliminamos al user_id, accumulated_leisure_time

    // INICIALIZAR STORAGE
    await initializeStorage();

  } catch (e) {
    console.error("Error en el handleOnStartup: ", e.message);
  }

}
async function handleOnMessage2(message, sender, sendResponse) {
  if (message === "initialize-storage") {
    await initializeStorage()
      .then(() => sendResponse({ status: "success" }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));
    return true;
  }
  else if (message === "update-time-spent") {
    await updateTimeSpent()
      .then(() => sendResponse({ status: "success" }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));
    return true;
  }
  else if (message === "delete-alarms") {
    await deleteAlarms()
      .then(() => sendResponse({ status: "success" }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));
    return true;
  }
}
async function handleOnMessage(message, sender, sendResponse) {

  const actions = {
    "initialize-storage": initializeStorage,
    "update-time-spent": updateTimeSpent,
    "delete-alarms": deleteAlarms,
    "clear-all-storage": clearAllStorage
  };

  const action = actions[message];

  if (action) {

    action()
      .then(() => sendResponse({ status: "success" }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));

    return true; // Mantenemos el canal abierto para la respuesta asíncrona
  }

  return false; // Opcional: manejar mensajes no reconocidos
}

async function handleWindowsChangedAnterior(windowId) {

  console.log("LISTENER -> Window Changed", windowId);

  /* Si se cambia de ventana tan rápido que el temporizador de 500ms aún no ha terminado,
     cancelamos el anterior para que no se registren dos eventos de salida/entrada cruzados */
  if (focusTimeout) {
    clearTimeout(focusTimeout);
    focusTimeout = null;
  }

  const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome", "leisure_start"];
  let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome, leisure_start} = await chrome.storage.local.get(storageKeys);

  // ESCENARIO 1: Salida de Chrome (o posible salida rápida)
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Esperamos 500ms antes de ejecutar el código para confirmar que no haya sido una "salida rápida de carga"
    focusTimeout = setTimeout(async () => {
      focusTimeout = null;
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
        if (db_id_visited) await updateWebDeparture(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });
        focusTimeout = null;
        return;
      }*/

      // VERIFICACIÓN 3: Si alguna ventana tiene el foco actualmente
      const windows = await chrome.windows.getAll({ populate: false });
      const anyWindowFocused = windows.some(win => win.focused === true);

      // VERIFICACIÓN 4: Si se a abierto un subelemento dentro de Chrome
      /* Clickear una extensión se considera salida total de chrome, por eso verificamos si hay algún
         contexto abierto (un popup de extensión se considera contexto). Si lo hay significa que
         el usuario siguen en chrome y simplemente a abierto una extensión */
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['POPUP', 'SIDE_PANEL', 'DEVELOPER_TOOLS'] // ['POPUP', 'TAB', 'BACKGROUND', 'OFFSCREEN_DOCUMENT', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
      }).catch(() => []);
      const isPopupOpen = contexts.length > 0;

      if (anyWindowFocused || isPopupOpen) { // Falso positivo: El usuario sigue en Chrome (ej. abrió nuestro popup)
        await setFocusChrome(true);

        const activeWindow = windows.find(win => win.focused === true);
        let [activeTab] = await chrome.tabs.query({ active: true, windowId: activeWindow?.id });

        let { last_web_activated } = await chrome.storage.local.get("last_web_activated");
        if (activeTab && activeTab?.id !== last_web_activated) {
          // El last_web_activated seguirá siendo el mismo si, por ejemplo, abres el popup de una extensión

          await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);
          await openNewWebAndContent(activeTab, leisure_start);
        }

      } else { // Salida real de Chrome
        await setFocusChrome(false);
        await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);
      }
    }, 500);

  }
  else if (focus_chrome === false) {
    // ESCENARIO 2: El usuario volvió a Chrome después de estar en otra app

    let [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });

    await setFocusChrome(true);
    await openNewWebAndContent(activeTab, leisure_start);

    /* TODO[Si se considera necesario]: Cuando estas fuera y vuelves a Chrome pero a una pestaña
        distinta de dónde lo dejaste entonces se activa el handleUpdated y el handleWindowsChanged,
        esto registra 2 veces la visita pero no cierra la 1era visita. Tal vez se podría solucionar
        si preguntaramos a la BD si la ultima visita es de la misma web para ya no registralo otra vez */
  }
  else {
    // ESCENARIO 3: El usuario solo se movió entre ventanas o pestañas de Chrome

    let [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });

    if (activeTab && activeTab.id !== last_web_activated ) {
      await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);
      await openNewWebAndContent(activeTab, leisure_start);
    }

  }

}
async function handleWindowsChanged(windowId) {
  /* NOTA: Esta función está pensada para que cuando el usuario cambie entre ventanas de Chrome o se mueva a otra aplicación (Ej. Excel)
     se registre la hora de salida del ultimo sitio web que estaba visitando. Sin embargo, ciertas
     acciones dentro de Chrome también son interpretadas como "salidas" rapidas de carga (ej. clickear una extensión,
     cerrar pestañas, cambiar entre pestañas, etc), ya que el flujo que siguen es Ventana A -> Salida -> Ventana A.
     Es por ello, que se utilizarán focusTimeout y setTimeout para verificar que realmente sea una
     salida de chrome y no una "salida rápida de carga". */

  /* Si se cambia de ventana tan rápido que el temporizador de 500ms aún no ha terminado,
     cancelamos el anterior para que no se registren dos eventos de salida/entrada cruzados */
  if (focusTimeout) {
    clearTimeout(focusTimeout);
    focusTimeout = null;
  }

  /* Esperamos 500ms antes de ejecutar el código para que el handleActivated se ejecute primero si
     es que le toca. Y así este actualice el local storage y se eviten dobles registros */
  focusTimeout = setTimeout(async () => {
    focusTimeout = null;
    console.log("---- WINDOW CHANGED ----", windowId);

    const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome", "leisure_start"];
    let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome, leisure_start} = await chrome.storage.local.get(storageKeys);

    // ESCENARIO 1: Salida de Chrome (o posible salida rápida)
    if (windowId === chrome.windows.WINDOW_ID_NONE) {

      // VERIFICACIÓN 3: Si alguna ventana tiene el foco actualmente -> minimizar Chrome
      const windows = await chrome.windows.getAll({ populate: false });
      const anyWindowFocused = windows.some(win => win.focused === true);

      // VERIFICACIÓN 4: Si se a abierto un subelemento dentro de Chrome -> abrir una extensión
      /* Clickear una extensión se considera salida total de chrome, por eso verificamos si hay algún
         contexto abierto (un popup de extensión se considera contexto). Si lo hay significa que
         el usuario siguen en chrome y simplemente a abierto una extensión */
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['POPUP', 'SIDE_PANEL', 'DEVELOPER_TOOLS'] // ['POPUP', 'TAB', 'BACKGROUND', 'OFFSCREEN_DOCUMENT', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
      }).catch(() => []);
      const isPopupOpen = contexts.length > 0;

      if (anyWindowFocused || isPopupOpen) { // Falso positivo: El usuario sigue en Chrome (ej. cambió de pestaña o abrió nuestro popup)
        await setFocusChrome(true);

        const activeWindow = windows.find(win => win.focused === true);
        let [activeTab] = await chrome.tabs.query({ active: true, windowId: activeWindow?.id });

        if (activeTab && activeTab?.id !== last_web_activated) { // Fue un cambio estre pestañas. Sino significa que se abrió una extensión
          await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);
          await openNewWebAndContent(activeTab, leisure_start);
          console.log("ESCENARIO 1: Cambio entre pestañas");
        } else console.log("ESCENARIO 1: Se abrió una EXT | Se cancela el registro de cambio de pestaña");

      } else { // Salida real de Chrome (ej. Se minimiza Chrome)
        await setFocusChrome(false);
        await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);
        console.log("ESCENARIO 1: Salida real de Chrome");
      }

    }
    else if (focus_chrome === false) {
      // ESCENARIO 2: El usuario volvió a Chrome después de estar en otra app

      let [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });

      await setFocusChrome(true);
      await openNewWebAndContent(activeTab, leisure_start);
      console.log("ESCENARIO 2: Volvió a Chrome después de estar fuera");

      /* TODO[Si se considera necesario]: Cuando estas fuera y vuelves a Chrome pero a una pestaña
          distinta de dónde lo dejaste entonces se activa el handleUpdated y el handleWindowsChanged,
          esto registra 2 veces la visita pero no cierra la 1era visita. Tal vez se podría solucionar
          si preguntaramos a la BD si la ultima visita es de la misma web para ya no registralo otra vez */
    }
    else {
      // ESCENARIO 3: El usuario solo se movió entre ventanas o pestañas de Chrome

      let [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });

      // El handleActivated no actualiza el "last_web_activated" cuando solo se cambia entre pestañas activas de sus respectivas ventanas
      if (activeTab && activeTab.id !== last_web_activated ) {
        await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);
        await openNewWebAndContent(activeTab, leisure_start);
        console.log("ESCENARIO 3: Cambio de ventana");
      } else console.log("ESCENARIO 3: Cerró una EXT. | Ya no registra cambio de pestaña | Se actualiza su -1");
      // NOTA -> Cuando abres una nueva ventana, se ejecuta el handleActivated y ya no se registra cambio de pestaña en aquí, pero si tu siguiente click es fuera de la nueva ventana serás -1 y false, sino serás -1 y true

    }
  }, 500);

}

async function handleUpdated(tabId, changeInfo, tabInfo) {

  if (!tabInfo.url || !isHttpUrl(tabInfo.url)) return;

  console.log("---- UPDATED ----");

  const storageKeys = ["tabs_tracking", "content_tracking", "last_domain", "last_web_activated", "leisure_start", "focus_chrome"];
  let { tabs_tracking = {}, content_tracking = {}, last_domain, last_web_activated, leisure_start, focus_chrome } = await chrome.storage.local.get(storageKeys);

  // Si el update está ocurriendo en una pestaña inactiva. Ej. Abrir varios websites rápido o refrescar una pestaña inactiva con click derecho
  if (last_web_activated !== tabId) return;

  let hostname = new URL(tabInfo.url).hostname;

  // --- BLOQUE A: RASTREO DE DOMINIO (WEB) ---
  if(changeInfo.status === 'complete') {
    let id_web_before = tabs_tracking[tabId.toString()];

/*
    if (id_web_before) { // Si ya existía esta pestaña
      if (focus_chrome) {
        if (last_domain !== hostname) { // Cambio de sitio web en la misma pestaña
          await updateWebDeparture(id_web_before, {fecha_hora_salida: new Date(Date.now())});
          await setWebComplete(tabId, hostname);
        }
      } else { // Si estabas fuera de chrome y volviste, ya sea por haber presionado el botón de recargar página o de acceso directo a otra web, igual no se te debe registrar salida xq ya estabas fuera desde antes
        await setWebComplete(tabId, hostname);
        await setFocusChrome(true);
      }
    } else { // Si es el primer sitio web que visita
      await setWebComplete(tabId, hostname);
    }
*/

    if (!id_web_before) { // Pestaña recién creada
      await setWebComplete(tabId, hostname);
    } else if (focus_chrome) { // Estabas dentro de Chrome y ya existía esta pestaña
      if (last_domain !== hostname) {
        await updateWebDeparture(id_web_before, { fecha_hora_salida: new Date() });
        await setWebComplete(tabId, hostname);
      }
    } else { // Estabas fuera de Chrome y volviste (recargando la página o usando un acceso directo a otra web)
      await setWebComplete(tabId, hostname);
      await setFocusChrome(true);
    }

    await chrome.storage.local.set({"last_domain": hostname});
  }

  // --- BLOQUE B: RASTREO DE CONTENIDO DE OCIO (DOBLE FILO) ---
  // Usamos changeInfo.title porque en sitios como YouTube, la URL no siempre cambia al navegar
  if (changeInfo.title) {
    // Cancelamos timer previo si el usuario cambió de contenido antes que termine el timer
    if (timerContent) {
      clearTimeout(timerContent);
      timerContent = null;
    }

    const websites_doble_filo = await getWebsDobleFilo();
    const is_dobleFilo = websites_doble_filo.includes(hostname);

    if (is_dobleFilo) {
      // Inicio o cambio de contenido de ocio
      timerContent = setTimeout(async () => {
        timerContent = null;

        // 1. CRONÓMETRO: Si no estaba en ocio antes, empezamos ahora
        if (!leisure_start) await chrome.storage.local.set({ "leisure_start": Date.now()});

        // 2. REGISTRO DE CONTENIDO
        let id_content_before = content_tracking[tabId.toString()];

        if (id_content_before && focus_chrome) // Estabas dentro de Chrome y ya estaba viendo contenido DF antes
          await updateContentDeparture(id_content_before, {fecha_hora_salida: new Date()});

        await setContentComplete(tabId, tabInfo.title, hostname);

      }, 3000);

    } else { // Si no es contenido DF entonces eliminarlo del tracking
      let id_content_before = content_tracking[tabId.toString()];

      if (id_content_before) { // Si se estaba viendo contenido DF antes
        if (focus_chrome) // Registrar salida SOLO si Chrome tiene el foco
          await updateContentDeparture(id_content_before, { fecha_hora_salida: new Date() });

        // Siempre eliminar el contenido previo del tracking (con o sin foco)
        delete content_tracking[tabId.toString()];
        await chrome.storage.local.set({ content_tracking });
      }

      // TEMPORIZADOR -> Si existe entonces el contenido anterior era ocio pero ya no.
      if (leisure_start) await finishOcioSession();

    }

    // VERSIÓN SIN ESPERA DE 3 SEGUNDOS
    /*if (WEBSITES_DOBLE_FILO.includes(hostname)) {
      let id_content_before = content_tracking[tabId.toString()];
      if (id_content_before) // Si cambió de contenido dentro de la misma pestaña
        await updateContentDeparture(id_content_before, {fecha_hora_salida: new Date(Date.now())});

      await setContentComplete(tabId, tabInfo.title, hostname);
    } else { // Si no es contenido doble filo entonces eliminarlo del tracking
      let id_content_before = content_tracking[tabId.toString()];
      if (id_content_before) await updateContentDeparture(id_content_before, {fecha_hora_salida: new Date(Date.now())});

      delete content_tracking[tabId.toString()];
      await chrome.storage.local.set({content_tracking});
    }*/

  }

}
async function handleRemoved(tabId, removeInfo) {

  // TODO[Tal vez]: Cuando se cierra la ventana entera (todas las pestañas)

  const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome"];
  let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome } = await chrome.storage.local.get(storageKeys);

  /* Solo se registra la salida de la web si la pestaña que estamos cerrando es la ACTIVA sino esto
     quiere decir que hemos cerrado una pestaña que estaba en 2do plano y por ende su salida ya se
     registró al momento que cambio de pestaña ACTIVA.
     Además, no queremos registrar la salida en la BD si el cierre de la ventana se hizo desde fuera
     de Chrome xq ese registro ya se habría hecho por el PULSO.*/
  if (focus_chrome && tabId === last_web_activated) {
    console.log("---- REMOVED ----");
    await closeOldWebAndContent(tabs_tracking, content_tracking, tabId);
  }

  // Siempre limpiar el tracking
  delete tabs_tracking[tabId.toString()];
  delete content_tracking[tabId.toString()];
  await chrome.storage.local.set({tabs_tracking, content_tracking});
}
async function handleActivated(activeInfo) {
  // Bloqueo instantáneo (Compartido con handleWindowsChanged()): Si ya estamos procesando este ID, abortamos sin esperar al storage

  console.log("---- ACTIVATED ----");

  try {
    const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome", "leisure_start"]
    let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome, leisure_start } = await chrome.storage.local.get(storageKeys);

    const oldTabId = last_web_activated;
    const newTabId = activeInfo.tabId;

    // Guardamos el nuevo ID activo de inmediato
    await chrome.storage.local.set({ "last_web_activated": newTabId });

    if (!oldTabId) return; // verificamos si existe alguna web anterior o si esta será la primera

    // --- REGISTRO DE SALIDA ---
    // Si focus_chrome es false significa que el usuario clickeo otra pestaña al reenfocarse a Chrome
    if (focus_chrome)
      await closeOldWebAndContent(tabs_tracking, content_tracking, oldTabId);
    else
      await setFocusChrome(true);


    // --- REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE ---
    let tab_info = await chrome.tabs.get(newTabId);

    await openNewWebAndContent(tab_info, leisure_start);

  } catch (e) {
    console.error("Error en handleActivated:", e);
  }
}

async function handleAlarm(alarm) {

  if (alarm.name !== "pulse") return;
  console.log (":::: PULSO de 1m ::::")

  // await updateAssignedRestTimeAndInterventionsState(); // ::: CREO QUE YA NO VA :::

  const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome", "leisure_start"];
  let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome, leisure_start } = await chrome.storage.local.get(storageKeys);

  try {
    const windows = await chrome.windows.getAll({ populate: false });
    const anyWindowFocused = windows.some(win => win.focused === true);

    if (focus_chrome) { // Si estabas dentro de Chrome...

      // Tanto si el usuario se fue o si sigue dentro de Chrome, se registra/actualiza su salida
      await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);

      // Y ahora se nota que ya no estas
      if (!anyWindowFocused)
        await setFocusChrome(false);
      else {
        // Se renueva solo si ya se estaba en ocio antes de actualizar el leisure_start
        if (leisure_start) await chrome.storage.local.set({ "leisure_start": Date.now() });
      }

    } else { // Si NO estabas dentro de Chrome...
      if (!anyWindowFocused) { // Y sigues fuera, no se hace nada
        return;
      }
      else { // Y has vuelto a la MISMA pestaña, se registra una nueva visita
        const [active_tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

        await openNewWebAndContent(active_tab, leisure_start);
        await setFocusChrome(true);
      }
    }

  } catch (e) {
    console.error("Error en auditoría de alarma:", e);
  }
}



// :::::: FUNCIONES DE LA BASE DE DATOS ::::::

async function setWebComplete(tabId, hostname) {
// Registro completo en las tablas sitios_web, sitios_web_usuario y sitios_web_visitados

  let new_web = { dominio: hostname };

  try {

    // REGISTRAMOS EL WEBSITE EN LA BD

    let response1 = await fetch(`http://127.0.0.1:8000/api/v1/websites`, {
      method: "POST",
      body: JSON.stringify(new_web),
      headers: {"Content-Type": "application/json"}
    });

    if (!response1.ok)
      throw new Error(`Error en websites: ${response1.status}`);

    let data = await response1.json();
    let id_web = data.id;

    const id_user = await getUserLogged();
    const id_default_category_web = await getDefaultCategoryWeb();

    const new_website_user = {
      id_usuarios: id_user,
      id_sitios_web: id_web,
      id_categorias_web: id_default_category_web,
      origen: DEFAULT_ORIGIN
    };

    // REGISTRAMOS EL WEBSITE POR USUARIO EN LA BD

    let response2 = await fetch(`http://127.0.0.1:8000/api/v1/website-users`, {
      method: "POST",
      body: JSON.stringify(new_website_user),
      headers: {"Content-Type": "application/json"},
    });

    if (!response2.ok)
      throw new Error(`Error en website-users: ${response2.status}`);

    let data2 = await response2.json();
    let id_web_user = data2.id;

    let new_web_visited = {
      id_usuarios: id_user,
      id_sitios_web_usuario: id_web_user,
      fecha_hora_ingreso: new Date()
    };

    // REGISTRAMOS LA FECHA DE ENTRADA AL WEBSITE EN LA BD

    let response3 = await fetch(`http://127.0.0.1:8000/api/v1/website-visited`, {
      method: "POST",
      body: JSON.stringify(new_web_visited),
      headers: {"Content-Type": "application/json"}
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
async function updateWebDeparture(id_web, web_updated) {
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

async function setContentComplete(tabId, title, hostname) {
  let new_content = { titulo: title };

  try {

    // OBTENEMOS EL SITIO WEB POR SU DOMINIO
    let resWeb = await fetch(`http://127.0.0.1:8000/api/v1/websites/by-domain/${hostname}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!resWeb.ok) throw new Error(`Error en obtener id_web para registrar el contenido: ${resWeb.status}`);

    let dataWeb = await resWeb.json();
    let id_web = dataWeb.id;

    // REGISTRAMOS EL CONTENIDO
    let resContent = await fetch(`http://127.0.0.1:8000/api/v1/contents`, {
      method: "POST",
      body: JSON.stringify(new_content),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!resContent.ok) throw new Error(`Error en contents: ${resContent.status}`);

    let dataContent = await resContent.json();
    let id_content = dataContent.id;

    // OBTENEMOS LA WEB DEL USUARIO
    const user_id = await getUserLogged();
    let resWebUser = await fetch(`http://127.0.0.1:8000/api/v1/website-users/users/${user_id}/sites/${id_web}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!resWebUser.ok) throw new Error(`Error en obtener el id_sitios_web_usuario para contents: ${resWebUser.status}`);

    let data_web_user = await resWebUser.json();
    let id_web_user = data_web_user.id;

    const id_default_category_content = await getDefaultCategoryContent();
    const new_content_user = {
      id_usuarios: user_id,
      id_sitios_web_usuario: id_web_user,
      id_contenidos: id_content,
      id_categorias_contenido: id_default_category_content,
    };

    //console.log("Enviando a content-users:", JSON.stringify(new_content_user, null, 2));

    // REGISTRAMOS EL CONTENIDO POR USUARIO
    let resContentUser = await fetch(`http://127.0.0.1:8000/api/v1/content-users`, {
      method: "POST",
      body: JSON.stringify(new_content_user),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!resContentUser.ok) throw new Error(`Error en content-users: ${resContentUser.status}`);

    let dataContentUser = await resContentUser.json();
    let id_content_user = dataContentUser.id;

    let new_content_visited = {
      id_usuarios: user_id,
      id_contenidos_usuario: id_content_user,
      fecha_hora_ingreso: new Date()
    };

    // REGISTRAMOS LA FECHA DE ENTRADA AL CONTENIDO

    let resContentVisited = await fetch(`http://127.0.0.1:8000/api/v1/content-visited`, {
      method: "POST",
      body: JSON.stringify(new_content_visited),
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!resContentVisited.ok) throw new Error(`Error en content-user-visited: ${resContentVisited.status}`);

    let dataContentVisited = await resContentVisited.json();

    // GUARDAMOS EL ID DE LA PESTAÑA JUNTO CON SU ID DE CONTENT_VISITADO EN LA BD
    let { content_tracking = {} } = await chrome.storage.local.get("content_tracking");
    content_tracking[tabId.toString()] = dataContentVisited.id;

    await chrome.storage.local.set({"content_tracking": content_tracking});

  } catch (e) {
    console.error(e.message);
  }
}
async function updateContentDeparture(id_content, content_updated) {
  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/content-visited/${id_content}`, {
      method: "PATCH",
      body: JSON.stringify(content_updated),
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!response.ok)
      throw new Error(`Error al actualizar la salida en content-user-visited: ${response.status}`);

  } catch (e) {
    console.error(e.message);
  }
}

async function getDefaultCategoryWeb() {
  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/categories/web/codigo/sin-categoria`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error en obtener la categoría web por default: ${response.status}`);

    let data = await response.json();
    return data.id;

  } catch (e) {
    console.error(e.message);
  }
}
async function getDefaultCategoryContent() {
  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/categories/content/codigo/incierto`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error en obtener la categoría web por default: ${response.status}`);

    let data = await response.json();
    return data.id;

  } catch (e) {
    console.error(e.message);
  }
}

async function getCategoryIdDobleFilo() {
  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/categories/web/codigo/doble-filo`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error en obtener el ID de la categoría Doble Filo: ${response.status}`);

    let data = await response.json();
    return data.id || null;

  } catch (e) {
    console.error(e.message);
    return null;
  }
}
async function getWebsDobleFilo() {
  let id_user = await getUserLogged();
  let id_doble_filo = await getCategoryIdDobleFilo();

  if (!id_user) {
    console.warn("No se puede obtener el id_user.");
    return [];
  }
  if (!id_doble_filo) {
    console.error("No se puede obtener el ID de categoría 'Doble Filo'.");
    return [];
  }

  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/website-users/users/${id_user}/categories/${id_doble_filo}/domains`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Error al obtener la lista de sitios Doble Filo del usuario: ${response.status}`);

    const data = await response.json();
    return Array.isArray(data) ? data : [];

  } catch (e) {
    console.error(e.message);
    return [];
  }
}

async function getAssignedRestTime(userId) {

  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/rest-time/${userId}`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error en obtener el tiempo de descanso establecido: ${response.status}`);

    let data = await response.json();
    return data.tiempo_total;

  } catch (e) {
    console.error(e.message);
  }

}

async function updateTimeSpent() {
  const id_user = await getUserLogged();
  let { accumulated_leisure_time } = await chrome.storage.local.get("accumulated_leisure_time");

  if (accumulated_leisure_time) {
    const rest_time_spent = { tiempo_usado: accumulated_leisure_time };

    try {
      let response = await fetch(`http://127.0.0.1:8000/api/v1/rest-time/${id_user}`, {
        method: "UPDATE",
        body: JSON.stringify(rest_time_spent),
        headers: {"Content-Type": "application/json"}
      });

      if (!response.ok) throw new Error(`Error al actualizar el tiempo usado de descanso en la BD: ${response.status}`);

    } catch (e) {
      console.error(e.message);
      throw e;
    }
  }
}

async function updateAssignedRestTimeAndInterventionsState() {

  let assigned_rest_time = null;
  const id_user = await getUserLogged();

  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/rest-time/${id_user}`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error en obtener el tiempo de descanso del usuario: ${response.status}`);

    let data = await response.json();
    assigned_rest_time = data.tiempo_total;

  } catch (e) {
    console.error(e.message);
  }

  await chrome.storage.local.set(assigned_rest_time ? { assigned_rest_time, "interventionsAllowed": false } : { "interventionsAllowed": true });
}



// :::::: FUNCIONES OPERATIVAS ::::::

const isHttpUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

function withAuth(handler) {
  return async (...args) => {
    const { user_id } = await chrome.storage.local.get("user_id");
    if (user_id) {
      return handler(...args);
    }
  };
}
async function setFocusChrome(isFocused) {
  await chrome.storage.local.set({"focus_chrome": isFocused});
  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  console.log("Esta en chrome?: ", focus_chrome);
}
async function checkAlarmState() {
  const alarm = await chrome.alarms.get("pulse");

  if (!alarm) await chrome.alarms.create("pulse", { periodInMinutes: 5 });
}

async function initializeStorage() {

  try {
    await checkAlarmState();

    let { accumulated_leisure_time = 0 } = await chrome.storage.local.get("accumulated_leisure_time");

    let user_id = await getUserLogged();
    const [active_tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    let updates = {"focus_chrome": true};
    updates.last_web_activated = active_tab ? active_tab.id : null;
    updates.last_domain = (active_tab && active_tab.url) ? (new URL(active_tab.url).hostname) : null;
    updates.assigned_rest_time = await getAssignedRestTime(user_id) || 0;
    updates.interventions_allowed = ((accumulated_leisure_time ?? 0) >= (updates.assigned_rest_time * 60));

    await chrome.storage.local.set(updates);
    console.log("Inicialización del Storage: ", updates);

  } catch (e) {
    console.error("Error al inicializar el Storage: ", e.message);
    throw e;
  }

}
async function getUserLogged() {
  try {
    const { user_id } = await chrome.storage.local.get("user_id");
    return user_id || null;
  } catch (e) {
    console.error("Error al acceder al storage para obtener el id_user:", e);
    return null;
  }
}

async function finishOcioSession() {
  let { leisure_start = null, accumulated_leisure_time, assigned_rest_time } = await chrome.storage.local.get(["leisure_start", "accumulated_leisure_time", "assigned_rest_time"]);

  if (leisure_start) {// Si existe un registro de Ocio

    // Calculamos el tiempo de ocio acumulado
    const leisure_out = Date.now();
    const seconds_interval = Math.floor((leisure_out - leisure_start) / 1000); // Convertimos a segundos
    const new_accumulated = (accumulated_leisure_time || 0) + seconds_interval;

    // Determinamos si se permiten intervenciones
    const interventionsAllowed = assigned_rest_time && new_accumulated >= (assigned_rest_time * 60);

    await chrome.storage.local.set({
      "accumulated_leisure_time": new_accumulated,
      "leisure_start": null,
      interventionsAllowed
    });
  }
}
async function deleteAlarms(){
  try {
    const areDeleted = await chrome.alarms.clearAll()

    if (areDeleted) console.log("Alarmas borradas exitosamente")
    else console.log("No se pudieron eliminar las alarmas")

  } catch (e) {
    console.error("Error al eliminar las alarmas", e.message);
    throw e;
  }
}
async function clearAllStorage() {
  try {
    await chrome.storage.local.clear();
    console.log("Storage local limpiado exitosamente.");
  } catch (error) {
    console.error("Error al limpiar el storage:", error);
    throw error;
  }
}

async function closeOldWebAndContent(tabs_tracking, content_tracking, oldTabId) {
  const now = new Date();

  // CIERRE de la pestaña anterior
  if (oldTabId) {
    let id_web_visited = tabs_tracking[oldTabId.toString()];
    if (id_web_visited) await updateWebDeparture(id_web_visited, { fecha_hora_salida: now });

    let id_content_visited = content_tracking[oldTabId.toString()];
    if (id_content_visited) await updateContentDeparture(id_content_visited, { fecha_hora_salida: now });
  }
  await finishOcioSession();

}
async function openNewWebAndContent(newTab, leisure_start) {
  // APERTURA de la nueva pestaña (si existe y es válida)
  if (newTab) {
    let updates = { last_web_activated: newTab.id };

    if (isHttpUrl(newTab.url)) {
      const hostname = new URL(newTab.url).hostname;
      const websites_doble_filo = await getWebsDobleFilo();
      const isLeisure = websites_doble_filo.includes(hostname);

      updates.last_domain = hostname;

      await setWebComplete(newTab.id, hostname);

      if (isLeisure) {
        await setContentComplete(newTab.id, newTab.title, hostname);

        // Solo iniciamos si no hay un cronómetro ya corriendo
        if (!leisure_start) updates.leisure_start = Date.now();
      } else {
        // Si existe, entonces el contenido anterior era ocio pero ya no.
        if (leisure_start) updates.leisure_start = null;
      }
    }

    await chrome.storage.local.set(updates);
  }
}

async function init() {
  const isLogged = await getUserLogged();
  if (isLogged) await checkAlarmState();
}



// :::::: LISTENERS ::::::

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log("Installed");
  // await handleOnStartup();

  if (reason === 'install') {
    // CREAMOS ALARMA (PULSO)
    //await chrome.alarms.create('pulse', {periodInMinutes: 5});

    // GUARDAMOS EL TIEMPO LIBRE ASIGNADO  Y  PERMITIMOS LAS INTERVENCIONES O NO
    // await updateAssignedRestTimeAndInterventionsState();
  }
});
chrome.runtime.onStartup.addListener(withAuth(handleOnStartup));
chrome.runtime.onMessage.addListener(handleOnMessage);

chrome.windows.onFocusChanged.addListener(withAuth(handleWindowsChanged));

chrome.tabs.onUpdated.addListener(withAuth(handleUpdated));
chrome.tabs.onRemoved.addListener(withAuth(handleRemoved));
chrome.tabs.onActivated.addListener(withAuth(handleActivated));

chrome.alarms.onAlarm.addListener(withAuth(handleAlarm));

chrome.idle.onStateChanged.addListener(withAuth(async (state) => {
  // Si el usuario bloquea su pantalla, se registra la salida de la ultima web que estaba viendo
  if (state === "locked") {
    const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome"];
    let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome } = await chrome.storage.local.get(storageKeys);

    if (focus_chrome) {
      await setFocusChrome(false);
      await closeOldWebAndContent(tabs_tracking, content_tracking, last_web_activated);
    }
  }
}));

init();


