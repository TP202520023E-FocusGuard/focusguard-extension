const DEFAULT_ORIGIN = "default";
let timerContent = null;
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
function handleOnMessage(message, sender, sendResponse) {

  const actions = {
    "initialize-storage": initializeStorage,
    "update-time-spent": updateTimeSpent,
    "delete-alarms": deleteAlarms,
    "clear-all-storage": clearAllStorage
  };

  const action = actions[message];

  if (action) {

    try {
      action();
      sendResponse({ status: "success" });
    } catch (error) {
      console.error("Error en la acción:", error);
      sendResponse({ status: "error", message: error.message });
    }

    return true; // Mantenemos el canal abierto para la respuesta asíncrona
  }

  return false; // Opcional: manejar mensajes no reconocidos
}
function handleOnMessageExternal(request, sender, sendResponse) {
  if (request.action === "GET_CONSUMED_TIME") {
    chrome.storage.local.get(["accumulated_leisure_time"], (data) => {
      sendResponse({
        status: "success",
        timeUsed: Math.floor((data.accumulated_leisure_time || 0) / 60) // convertir a minutos
      });
    });
    return true;
  }
  else if (request.action === "update-rest-time") {

    updateRestTimeLocal(request.newRestTime)
      .then(() => sendResponse({ status: "success" }))
      .catch((error) => sendResponse({ status: "error", message: error.message }));

    return true;
  }
  else if (request.action === "web-category-updated") {
    getWebsDobleFiloAndDistractive(true)
      .then((hostnames) => {
        console.log("Web Category updated: ", hostnames);
        sendResponse({status: "success"})
      })
      .catch((error) => sendResponse({ status: "error", message: error.message }));

    return true;
  }
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

    const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome", "leisure_start", "user_id"];
    let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome, leisure_start, user_id = null} = await chrome.storage.local.get(storageKeys);

    if (user_id === null) return; // Cuando se cierra sesión, el WindowsChanged se ejecuta despues de haber limpiado el Storage debido al focusTimeout(500)

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

    const webs_doblefilo_distractive = await getWebsDobleFiloAndDistractive();
    const is_dobleFilo = webs_doblefilo_distractive.includes(hostname);

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

  console.log("---- ACTIVATED ----");

  try {
    const storageKeys = ["tabs_tracking", "content_tracking", "last_web_activated", "focus_chrome", "leisure_start"]
    let { tabs_tracking = {}, content_tracking = {}, last_web_activated, focus_chrome, leisure_start } = await chrome.storage.local.get(storageKeys);

    const oldTabId = last_web_activated;
    const newTabId = activeInfo.tabId;

    // Guardamos el nuevo ID activo de inmediato
    await chrome.storage.local.set({ "last_web_activated": newTabId });

    // verificamos si existe alguna web anterior o si esta será la primera
    /*
    if (!oldTabId) {
      try {
        const tab_info = await chrome.tabs.get(newTabId);
        if (!tab_info?.url) return;

        let domain;

        if (isHttpUrl(tab_info.url)) {
          domain = new URL(tab_info.url).hostname;
        } else {
          const urlObj = new URL(tab_info.url);
          domain = `${urlObj.protocol}//${urlObj.hostname}`;
        }

        await chrome.storage.local.set({ "last_domain": domain, "focus_chrome": true });

      } catch (error) {
        console.error("Error si esta es la primera pestaña en registrarse:", error.message);
      }

      return;
    }
*/

    if (!oldTabId) {
      let hostname = null;
      try {
        let tab_info = await chrome.tabs.get(newTabId);
        hostname = (tab_info?.url) ? new URL(tab_info.url).hostname : null;
      } catch (e) {
        console.error("Error de lógica en el Activated cuando es la primera pestaña. ", e.message);
      }

      await chrome.storage.local.set({ "last_domain": hostname, "focus_chrome": true });

      return;
    }

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

  if (alarm.name === "pulse") {
    console.log (":::: PULSE ALARM de 1m ::::")

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
  else if (alarm.name === "upload") {
    console.log (":::: UPLOAD ALARM de 1hr ::::")
    await uploadDataStorage();
  }

}



// :::::: FUNCIONES DE LA BASE DE DATOS ::::::

async function setWebComplete(tabId, hostname) {
// Registro completo en las tablas sitios_web, sitios_web_usuario y sitios_web_visitados

  let new_web = { dominio: hostname };

  try {

    // 1. REGISTRAMOS EL WEBSITE

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

    // 2. REGISTRAMOS EL WEBSITE POR USUARIO

    let response2 = await fetch(`http://127.0.0.1:8000/api/v1/website-users`, {
      method: "POST",
      body: JSON.stringify(new_website_user),
      headers: {"Content-Type": "application/json"},
    });

    if (!response2.ok)
      throw new Error(`Error en website-users: ${response2.status}`);

    let data2 = await response2.json();
    let id_web_user = data2.id;
    let id_cat_web_user = data2.id_categorias_web;

    let new_web_visited = {
      id_usuarios: id_user,
      id_sitios_web_usuario: id_web_user,
      id_categorias_web: id_cat_web_user,
      fecha_hora_ingreso: new Date()
    };

    // 3. REGISTRAMOS LA VISITA AL WEBSITE

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

async function getCategoryIdByCode(code) {
  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/categories/web/codigo/${code}`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error en obtener el ID de la categoría ${code}: ${response.status}`);

    let data = await response.json();
    return data.id || null;

  } catch (e) {
    console.error(e.message);
    return null;
  }
}
async function getWebsDobleFiloAndDistractive(shouldThrow = false) {
  let id_user = await getUserLogged();
  let id_doble_filo = await getCategoryIdByCode("doble-filo");
  let id_distractivo = await getCategoryIdByCode("distractivo");

  if (!id_user || !id_doble_filo || !id_distractivo) {
    const msg = "Faltan IDs críticos (user o categorías).";
    console.error(msg);
    if (shouldThrow) throw new Error(msg);
    return [];
  }

  try {
    // OBTENEMOS LOS HOSTNAMES DE LOS SITIOS DOBLE FILO DEL USUARIO
    let res_doblefilo = await fetch(`http://127.0.0.1:8000/api/v1/website-users/users/${id_user}/categories/${id_doble_filo}/domains`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (res_doblefilo.status === 404) return [];
    if (!res_doblefilo.ok) throw new Error(`Error al obtener la lista de sitios Doble Filo del usuario: ${res_doblefilo.status}`);

    const data_doblefilo = await res_doblefilo.json();
    let array_doblefilo = Array.isArray(data_doblefilo) ? data_doblefilo : [];

    // OBTENEMOS LOS HOSTNAMES DE LOS SITIOS DISTRACTIVOS DEL USUARIO
    let res_distractivo = await fetch(`http://127.0.0.1:8000/api/v1/website-users/users/${id_user}/categories/${id_distractivo}/domains`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (res_distractivo.status === 404) return [];
    if (!res_distractivo.ok) throw new Error(`Error al obtener la lista de sitios Distractivos del usuario: ${res_distractivo.status}`);

    const data_distractivo = await res_distractivo.json();
    let array_distractivo = Array.isArray(data_distractivo) ? data_distractivo : [];

    return array_distractivo.concat(array_doblefilo);

  } catch (e) {
    console.error(e.message);
    if (shouldThrow) throw e;
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
async function getRestTimeUsed(userId) {

  try {
    let response = await fetch(`http://127.0.0.1:8000/api/v1/rest-time/${userId}`, {
      method: "GET",
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error en obtener el tiempo de descanso establecido: ${response.status}`);

    let data = await response.json();
    return data.tiempo_usado;

  } catch (e) {
    console.error(e.message);
    return 0;
  }

}
async function updateTimeSpentAntiguo() {
  try {
    let { accumulated_leisure_time } = await chrome.storage.local.get("accumulated_leisure_time");
    if (!accumulated_leisure_time) return;
    const time_spent_local = Math.floor(accumulated_leisure_time / 60);

    const id_user = await getUserLogged();
    const time_spent_db = await getRestTimeUsed(id_user);
    let new_time_spent = 0;
    // Seguro para cuando se desinstala la extensión o similares
    if (time_spent_local >= time_spent_db)
      new_time_spent = time_spent_db + Math.abs(time_spent_local - time_spent_db);


    const timeUpdated = { tiempo_usado: new_time_spent };

    let response = await fetch(`http://127.0.0.1:8000/api/v1/rest-time/${id_user}`, {
      method: "PUT",
      body: JSON.stringify(timeUpdated),
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error al actualizar el tiempo usado en el BACKEND: ${response.status}`);

  } catch (e) {
    console.error("Error al subir la data del storage al backend", e.message);
    throw e;
  }
}
async function updateTimeSpent() {
  try {
    let { accumulated_leisure_time, last_synced_time = 0 } = await chrome.storage.local.get(["accumulated_leisure_time", "last_synced_time"]);
    if (!accumulated_leisure_time) return;

    const time_spent_local = Math.floor(accumulated_leisure_time / 60);
    if (time_spent_local < last_synced_time) last_synced_time = 0;

    const minutes_to_add = time_spent_local - last_synced_time;
    if (minutes_to_add <= 0) return;

    const id_user = await getUserLogged();
    const time_spent_db = await getRestTimeUsed(id_user);
    const new_total = time_spent_db + minutes_to_add;

    const timeUpdated = { tiempo_usado: new_total };

    let response = await fetch(`http://127.0.0.1:8000/api/v1/rest-time/${id_user}`, {
      method: "PUT",
      body: JSON.stringify(timeUpdated),
      headers: {"Content-Type": "application/json"}
    });

    if (!response.ok) throw new Error(`Error al actualizar el tiempo usado en el BACKEND: ${response.status}`);

    await chrome.storage.local.set({ "last_synced_time": time_spent_local });

  } catch (e) {
    console.error("Error al subir la data del storage al backend", e.message);
  }
}

async function uploadDataStorage() {

  await updateTimeSpent();

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
function withAuthMessage(handler) {
  // Wrapper especial para Mensajes (onMessage y onMessageExternal)

  return (message, sender, sendResponse) => {
    chrome.storage.local.get("user_id", ({ user_id }) => {
      if (user_id) {
        handler(message, sender, sendResponse);
      } else {
        sendResponse({ status: "error", message: "Usuario no autenticado en la extensión" });
      }
    });

    return true;
  };
}

async function setFocusChrome(isFocused) {
  await chrome.storage.local.set({"focus_chrome": isFocused});
  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  console.log("Esta en chrome?: ", focus_chrome);
}
async function checkAlarmState() {
  const allAlarms = await chrome.alarms.getAll();

  const hasPulse = allAlarms.some(a => a.name === "pulse");
  const hasUpload = allAlarms.some(a => a.name === "upload");

  if (!hasPulse) await chrome.alarms.create("pulse", { periodInMinutes: 1 });
  if (!hasUpload) await chrome.alarms.create("upload", { periodInMinutes: 2 });
}

async function initializeStorage() {

  try {
    await checkAlarmState();

    let user_id = await getUserLogged();

    let { accumulated_leisure_time = 0 } = await chrome.storage.local.get("accumulated_leisure_time");
    const time_spent_local = accumulated_leisure_time;
    console.log("tiempo usado en el local: ", time_spent_local);
    const time_spent_db_min = await getRestTimeUsed(user_id);
    const time_spent_db = time_spent_db_min * 60;
    console.log("tiempo usado en la BD: ", time_spent_db);

    const accumulated_time = time_spent_local >= time_spent_db ? time_spent_local : time_spent_db;

    const [active_tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    let updates = {"focus_chrome": true};
    updates.last_web_activated = active_tab ? active_tab.id : null;
    updates.last_domain = (active_tab?.url) ? new URL(active_tab.url).hostname : null;
    updates.assigned_rest_time = await getAssignedRestTime(user_id) || 0;
    updates.interventions_allowed = ((accumulated_time ?? 0) >= (updates.assigned_rest_time * 60));
    updates.accumulated_leisure_time = accumulated_time;

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
    const hostname = new URL(newTab.url).hostname;
    let updates = {
      last_web_activated: newTab.id,
      last_domain: hostname
    };

    if (isHttpUrl(newTab.url)) {

      const webs_doblefilo_distractive = await getWebsDobleFiloAndDistractive();
      const isLeisure = webs_doblefilo_distractive.includes(hostname);

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

async function updateRestTimeLocal(newRestTime) {

  try {
    if (newRestTime)
      await chrome.storage.local.set({ "assigned_rest_time": newRestTime });
    else
      throw new Error("El tiempo proporcionado no es válido");
  } catch (e) {
    console.error("No se pudo actualizar el tiempo de descanso: ", e.message);
    throw e;
  }

}

async function init() {
  const isLogged = await getUserLogged();
  if (isLogged) await checkAlarmState();
}



// :::::: LISTENERS ::::::

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log("Installed");

  if (reason === 'install') {

  }
});
chrome.runtime.onStartup.addListener(withAuth(handleOnStartup));
chrome.runtime.onMessage.addListener(withAuthMessage(handleOnMessage));
chrome.runtime.onMessageExternal.addListener(withAuthMessage(handleOnMessageExternal));

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


