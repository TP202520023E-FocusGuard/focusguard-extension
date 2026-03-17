const USER_ID = 1;
const DEFAULT_CATEGORY_ID = 1;
const DEFAULT_CATEGORY_CONTENT_ID = 1;
const DEFAULT_ORIGIN = "default";
// TODO[Do]: Cambiar variable estatica por obtención dinámica desde la BD
const WEBSITES_DOBLE_FILO = ["www.youtube.com", "facebook.com"];
let timerContent = null;
let processingTabId = null;
let focusTimeout = null;


chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await handleOnStartup();

  if (reason === 'install')
    await chrome.alarms.create('pulse', { periodInMinutes: 1 });
});

async function handleUpdated(tabId, changeInfo, tabInfo) {

  if(changeInfo.status === 'complete' && tabInfo.url) {

    if (!isHttpUrl(tabInfo.url)) return;

    let { tabs_tracking = {}, last_domain, last_web_activated} = await chrome.storage.local.get(null);
    let id_web_before = tabs_tracking[tabId.toString()];

    // Si el update está ocurriendo en una pestaña inactiva. Ej. Abrir varios websites rápido o refrescar una pestaña inactiva con click derecho
    if (last_web_activated !== tabId) return;

    let hostname = new URL(tabInfo.url).hostname;

    if (id_web_before) { // Si ya existía esta pestaña
      if (last_domain !== hostname) { // Cambio de sitio web en la misma pestaña
        await register_departuretime_web(id_web_before, {fecha_hora_salida: new Date(Date.now())});
        await complete_register_web(tabId, hostname);
      }
    } else { // Si es el primer sitio web que visita
      await complete_register_web(tabId, hostname);
    }

    await chrome.storage.local.set({"last_domain": hostname});
  }

  if (changeInfo.title && tabInfo.url) {
    if (timerContent) {
      clearTimeout(timerContent);
      timerContent = null;
    }

    let hostname = new URL(tabInfo.url).hostname;
    let { content_tracking = {}, last_web_activated } = await chrome.storage.local.get(null);
    if (last_web_activated !== tabId) return;

    if (WEBSITES_DOBLE_FILO.includes(hostname)) {
      timerContent = setTimeout(async () => {
        timerContent = null;

        let { content_tracking = {} } = await chrome.storage.local.get("content_tracking");
        let id_content_before = content_tracking[tabId.toString()];
        if (id_content_before) // Si cambió de contenido dentro de la misma pestaña
          await register_departuretime_content(id_content_before, {fecha_hora_salida: new Date(Date.now())});

        await complete_register_content(tabId, tabInfo.title, hostname);
      }, 3000);
    } else { // Si no es contenido doble filo entonces eliminarlo del tracking
      let id_content_before = content_tracking[tabId.toString()];
      if (id_content_before) await register_departuretime_content(id_content_before, {fecha_hora_salida: new Date(Date.now())});

      delete content_tracking[tabId.toString()];
      await chrome.storage.local.set({content_tracking});
    }



    /*if (WEBSITES_DOBLE_FILO.includes(hostname)) {
      let id_content_before = content_tracking[tabId.toString()];
      if (id_content_before) // Si cambió de contenido dentro de la misma pestaña
        await register_departuretime_content(id_content_before, {fecha_hora_salida: new Date(Date.now())});

      await complete_register_content(tabId, tabInfo.title, hostname);
    } else { // Si no es contenido doble filo entonces eliminarlo del tracking
      let id_content_before = content_tracking[tabId.toString()];
      if (id_content_before) await register_departuretime_content(id_content_before, {fecha_hora_salida: new Date(Date.now())});

      delete content_tracking[tabId.toString()];
      await chrome.storage.local.set({content_tracking});
    }*/


  }

}
async function handleRemoved(tabId, removeInfo) {

  // TODO: Cuando se cierra la ventana entera (todas las pestañas)

  let { last_web_activated, content_tracking = {}, tabs_tracking = {} } = await chrome.storage.local.get(null);
  let db_id_visited = tabs_tracking[tabId.toString()];
  if (!db_id_visited) return; // verificamos si el db_id_visited existe

  /* Solo se registra la salida de la web si la pestaña que estamos cerrando es la ACTIVA sino esto
     quiere decir que hemos cerrado una pestaña que estaba en 2do plano y por ende su salida ya se
     registró al momento que cambio de pestaña ACTIVA */
  if (tabId === last_web_activated) {
    await register_departuretime_web(db_id_visited, { fecha_hora_salida: new Date(Date.now()) });

    let id_content_before = content_tracking[tabId.toString()];
    if (id_content_before) // Si cambió de contenido dentro de la misma pestaña...
      await register_departuretime_content(id_content_before, {fecha_hora_salida: new Date(Date.now())});
  }

  delete tabs_tracking[tabId.toString()];
  delete content_tracking[tabId.toString()];
  await chrome.storage.local.set({tabs_tracking, content_tracking});
}
async function handleActivated(activeInfo) {

  // Bloqueo instantáneo (Compartido con handleWindowsChanged()): Si ya estamos procesando este ID, abortamos sin esperar al storage
  if (processingTabId === activeInfo.tabId) return;
  processingTabId = activeInfo.tabId;

  // --- REGISTRO DE SALIDA DE LA PESTAÑA ANTERIOR ---

  let { last_web_activated, focus_chrome, tabs_tracking = {}, content_tracking = {} } = await chrome.storage.local.get(null);

  await chrome.storage.local.set({ "last_web_activated": activeInfo.tabId });
  if (!last_web_activated) return; // verificamos si existe alguna web anterior o si esta será la primera

  // Si focus_chrome es false significa que el usuario clickeo otra pestaña al reenfocarse a Chrome
  if (focus_chrome) {
    let id_web_visited = tabs_tracking[last_web_activated?.toString()];

    if (id_web_visited) {
      await register_departuretime_web(id_web_visited, {fecha_hora_salida: new Date(Date.now())});

      // Si la pestaña anterior era Youtube entonces debo registra la salida de su contenido
      let id_content_visited = content_tracking[last_web_activated?.toString()];

      if (id_content_visited) {
        console.log("Se ejecuta el handleActivated para id_visited", id_content_visited);
        await register_departuretime_content(id_content_visited, {fecha_hora_salida: new Date(Date.now())});
      }
    }

  } else await setFocusChrome(true);

  // --- REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE ---

  let tab_info = await chrome.tabs.get(activeInfo.tabId);

  if(tab_info.url) {
    let hostname = new URL(tab_info.url).hostname;
    await chrome.storage.local.set({"last_domain": hostname});

    if (isHttpUrl(tab_info.url)) {
      await complete_register_web(activeInfo.tabId, hostname);
      if (WEBSITES_DOBLE_FILO.includes(hostname)) await complete_register_content(activeInfo.tabId, tab_info.title, hostname);
    }
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

async function complete_register_content(tabId, title, hostname) {
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
    let resWebUser = await fetch(`http://127.0.0.1:8000/api/v1/website-users/users/${USER_ID}/sites/${id_web}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!resWebUser.ok) throw new Error(`Error en obtener el id_sitios_web_usuario para contents: ${resWebUser.status}`);

    let data_web_user = await resWebUser.json();
    let id_web_user = data_web_user.id;

    const new_content_user = {
      id_usuarios: USER_ID,
      id_sitios_web_usuario: id_web_user,
      id_contenidos: id_content,
      id_categorias_contenido: DEFAULT_CATEGORY_CONTENT_ID,
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
      id_usuarios: USER_ID,
      id_contenidos_usuario: id_content_user,
      fecha_hora_ingreso: new Date(Date.now())
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
async function register_departuretime_content(id_content, content_updated) {
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

async function handleAlarm(alarm) {

  if (alarm.name !== "pulse") return;
  let { focus_chrome, last_web_activated, tabs_tracking = {}, content_tracking = {} } = await chrome.storage.local.get(null);
  const was_focused = focus_chrome; // Almacena si el usuario estubo en Chrome al momento de ejecutar el PULSO

  try {
    const windows = await chrome.windows.getAll({ populate: false });
    const anyWindowFocused = windows.some(win => win.focused === true);

    if (was_focused) { // Si estabas dentro de Chrome...
      if (!anyWindowFocused) { // Y ahora se nota que ya no estas, se registra tu salida
        await setFocusChrome(false);
        await chrome.storage.local.set({ "last_domain": "-" });
      }

      // Tanto si el usuario se fue o si sigue dentro de Chrome, se registra/actualiza su salida
      let id_web_visited = tabs_tracking[last_web_activated?.toString()];
      if (id_web_visited) {
        await register_departuretime_web(id_web_visited, {fecha_hora_salida: new Date(Date.now())});

        let id_content_visited = content_tracking[last_web_activated?.toString()];
        if (id_content_visited) await register_departuretime_content(id_content_visited, {fecha_hora_salida: new Date(Date.now())});
      }

    } else { // Si NO estabas dentro de Chrome...
      if (!anyWindowFocused) { // Y sigues fuera, no se hace nada
        return;
      } else { // Y has vuelto a la MISMA pestaña, se registra una nueva visita
        await setFocusChrome(true);
        const active_tab = chrome.tabs.query({active: true, currentWindow: true});

        if(active_tab.url) {
          let hostname = new URL(active_tab.url).hostname;
          await chrome.storage.local.set({"last_domain": hostname});

          if (isHttpUrl(active_tab.url)) {
            await complete_register_web(active_tab.id, hostname);
            if (WEBSITES_DOBLE_FILO.includes(hostname)) await complete_register_content(active_tab.id, active_tab.title, hostname);
          }
        }
      }
    }

/*
    if (!anyWindowFocused) {
      await setFocusChrome(false);
      await chrome.storage.local.set({ "last_domain": "-" });
    } else await setFocusChrome(true);

    let id_web_visited = tabs_tracking[last_web_activated?.toString()];
    if (id_web_visited) {
      await register_departuretime_web(id_web_visited, {fecha_hora_salida: new Date()});

      let id_content_visited = content_tracking[last_web_activated?.toString()];
      //console.log("Se debería ejecutar el Pulso y el id_visited es", id_content_visited);
      if (id_content_visited) await register_departuretime_content(id_content_visited, {fecha_hora_salida: new Date(Date.now())});
    }

 */

  } catch (e) {
    console.error("Error en auditoría de alarma:", e);
  }
}
async function checkAlarmState() {
  const alarm = await chrome.alarms.get("pulse");

  if (!alarm) {
    await chrome.alarms.create("pulse", { periodInMinutes: 1 });
  }
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

  let { focus_chrome, last_web_activated, tabs_tracking = {}, content_tracking = {} } = await chrome.storage.local.get(null);

  // CONTEXTO: Si el usuario, según parece, ya no está dentro de Chrome
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // TODO[Improve]: Creo que cuando vuelvo a Chrome y voy a una nueva pestaña al mismo tiempo se me registra 2 veces la visita por el hancleActivated y el WINDOW_ID_NONE
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
        contextTypes: ['POPUP', 'SIDE_PANEL', 'DEVELOPER_TOOLS'] // ['POPUP', 'TAB', 'BACKGROUND', 'OFFSCREEN_DOCUMENT', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
      }).catch(() => []);
      const isPopupOpen = contexts.length > 0;

      if (anyWindowFocused || isPopupOpen) {
        await setFocusChrome(true);

        const activeWindow = windows.find(win => win.focused === true);
        let [activeTab] = await chrome.tabs.query({ active: true, windowId: activeWindow.id });

        if (activeTab && activeTab?.id !== last_web_activated) {
          // El last_web_activated seguirá siendo el mismo si, por ejemplo, abres el popup de una extensión

          // --- REGISTRO DE SALIDA DE LA PESTAÑA ANTERIOR ---

          let db_id_visited = tabs_tracking[last_web_activated?.toString()];
          if (db_id_visited) {
            await register_departuretime_web(db_id_visited, {fecha_hora_salida: new Date(Date.now())});

            let id_content_visited = content_tracking[last_web_activated?.toString()];
            if (id_content_visited) await register_departuretime_content(id_content_visited, {fecha_hora_salida: new Date(Date.now())});
          }
          // --- REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE ---

          await chrome.storage.local.set({"last_web_activated": activeTab.id});

          if(activeTab.url) {
            let hostname = new URL(activeTab.url).hostname;
            await chrome.storage.local.set({"last_domain": hostname});

            if (isHttpUrl(activeTab.url)) {
              await complete_register_web(activeTab.id, hostname);
              if (WEBSITES_DOBLE_FILO.includes(hostname)) await complete_register_content(activeTab.id, activeTab.title, hostname);
            }
          }
        }

        return;
      }

      // --- REGISTRO DE SALIDA ---

      await setFocusChrome(false);

      let db_id_visited = tabs_tracking[last_web_activated?.toString()];
      if (db_id_visited) {
        await chrome.storage.local.set({"last_domain": "-"});
        await register_departuretime_web(db_id_visited, {fecha_hora_salida: new Date(Date.now())});

        let id_content_visited = content_tracking[last_web_activated?.toString()];
        if (id_content_visited) await register_departuretime_content(id_content_visited, {fecha_hora_salida: new Date(Date.now())});
      }
    }, 500);

  } else if (focus_chrome === false) {
    // CONTEXTO: Si el usuario volvió a Chrome después de estar en otra app

    let [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
    await chrome.storage.local.set({ "last_web_activated": tab.id });

    if(tab && tab.url) {
      let hostname = new URL(tab.url).hostname;
      await chrome.storage.local.set({"last_domain": hostname});

      if (isHttpUrl(tab.url)) {
        await complete_register_web(tab.id, hostname);
        if (WEBSITES_DOBLE_FILO.includes(hostname)) await complete_register_content(activeTab.id, activeTab.title, hostname);
      }
    }

    await setFocusChrome(true);
    /* TODO[Si se considera necesario]: Cuando estas fuera y vuelves a Chrome pero a una pestaña
        distinta de dónde lo dejaste entonces se activa el handleUpdated y el handleWindowsChanged,
        esto registra 2 veces la visita pero no cierra la 1era visita. Tal vez se podría solucionar
        si preguntaramos a la BD si la ultima visita es de la misma web para ya no registralo otra vez */
  } else {
    // CONTEXTO: Si el usuario solo se movió entre ventanas de Chrome

    let [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });

    if (activeTab && activeTab.id !== last_web_activated ) {

      if (processingTabId === activeTab.id) return; // Lógica compartida con handleActivated()
      processingTabId = activeTab.id;

      // --- REGISTRO DE SALIDA DE LA PESTAÑA ANTERIOR ---

      let db_id_visited = tabs_tracking[last_web_activated?.toString()];
      if (db_id_visited) {
        await register_departuretime_web(db_id_visited, {fecha_hora_salida: new Date(Date.now())});

        let id_content_visited = content_tracking[last_web_activated?.toString()];
        if (id_content_visited) await register_departuretime_content(id_content_visited, {fecha_hora_salida: new Date(Date.now())});
      }
      // --- REGISTRO DE INGRESO A PESTAÑA YA EXISTENTE ---

      await chrome.storage.local.set({"last_web_activated": activeTab.id});

      if(activeTab.url) {
        let hostname = new URL(activeTab.url).hostname;
        await chrome.storage.local.set({"last_domain": hostname});

        if (isHttpUrl(activeTab.url)) {
          await complete_register_web(activeTab.id, hostname);
          if (WEBSITES_DOBLE_FILO.includes(hostname)) await complete_register_content(activeTab.id, activeTab.title, hostname);
        }
      }
    }
  }

}
async function handleOnStartup() {
  try {
    await chrome.storage.local.remove([
      "tabs_tracking", "last_web_activated", "focus_chrome",
      "content_tracking", "last_domain"]);
  } catch (e) {
    console.error(e.message);
  }
  await chrome.storage.local.set({"focus_chrome": true});
}

const isHttpUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};
async function setFocusChrome(isFocused) {
  await chrome.storage.local.set({"focus_chrome": isFocused});
  let { focus_chrome } = await chrome.storage.local.get("focus_chrome");
  console.log("Esta en chrome?: ", focus_chrome);
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

