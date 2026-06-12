document.addEventListener('DOMContentLoaded', () => {
  // --- ENVÍO DE FORMULARIO (REGISTRO) ---
  document.getElementById('registration-form').addEventListener('submit', async (event) => {
    event.preventDefault(); // Evita que la página se recargue

    const first_name = document.getElementById('r-fname').value;
    const lastname = document.getElementById('r-lname').value;
    const phone = document.getElementById('r-phone').value;
    const email = document.getElementById('r-email').value;
    const password = document.getElementById('r-pwd').value;
    const confirm_password = document.getElementById('r-pwd2').value;
    const security_phrase = document.getElementById('r-phrase').value;

    if (first_name.length < 1) {
      alert("No se ha ingresado el nombre");
      return;
    }
    if (lastname.length < 1) {
      alert("No se ha ingresado el apellido");
      return;
    }
    if (phone.length !== 9) {
      alert("El telefono debe tener 9 digitos");
      return;
    }
    if (password.length < 1) {
      alert("La contraseña debe tener al menos 1 caracter.");
      return;
    }
    if (password !== confirm_password) {
      alert("Las contraseñas no coinciden. Por favor, verifica.");
      return;
    }
    if (security_phrase.length < 1) {
      alert("La frase de seguridad debe tener al menos 1 caracter.");
      return;
    }

    const new_user = {
      correo: email,
      nombres: first_name,
      apellidos: lastname,
      telefono: phone,
      password: password,
      frase_seguridad: security_phrase
    };

    try {
      /*
      const response = await fetch('http://127.0.0.1:8000/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(new_user)
      });
       */

      const response = await fetch('https://focusguard-api-d7ayede7fufnbshq.eastus-01.azurewebsites.net/api/v1/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(new_user)
      });

      if (!response.ok)
        throw new Error(`Error al registrar usuario: ${response.status}`);

      const result = await response.json();
      await chrome.storage.local.set({ "user_id": result.id });
      await loadScreen();

    } catch (error) {
      console.error(error.message);
    }
  });

  // --- ENVÍO DE FORMULARIO (INICIO DE SESIÓN) ---
  document.getElementById('auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('a-email').value;
    const password = document.getElementById('a-pwd').value;

    if (password.length < 1) {
      alert("La contraseña debe tener al menos 1 caracter.");
      return;
    }

    const user = {
      correo: email,
      password: password,
    };

    await login(user);
  });

  // --- NAVEGACIÓN ENTRE PAGINAS ---
  document.getElementById('btn-go-to-register')?.addEventListener('click', showRegister);
  document.getElementById('btn-go-to-auth')?.addEventListener('click', showAuth);

  // --- CERRRAR SESIÓN ---
  document.getElementById('btn-logout')?.addEventListener('click', logout);
});



// :::: FUNCIONES DOM ::::

async function loadScreen() {
  let { user_id, assigned_rest_time = 0, accumulated_leisure_time = 0 } = await chrome.storage.local.get(["user_id", "assigned_rest_time", "accumulated_leisure_time"]);

  const registerScreen = document.getElementById('register-screen');
  const authScreen = document.getElementById('auth-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');

  if (user_id) { // Usuario logeado
    registerScreen.hidden = true;
    authScreen.hidden = true;
    dashboardScreen.hidden = false;

    const domain = await getCurrentDomain();
    const domainElement = document.getElementById("domain");
    if (domainElement) domainElement.innerHTML = domain;

    const catWeb = domain ? await getCategoryWeb(domain) : "-";
    const catWebElement = document.getElementById("category-web");
    if (catWebElement) catWebElement.innerHTML = catWeb;

    const title = domain ? await getCurrentTitle() : null;
    const catContent = title ? await getCategoryContent(domain, title) : "-";
    const catContentElement = document.getElementById("category-content");
    if (catContentElement) {
      if (catContent === "-")
        catContentElement.innerHTML = "-";
      else if (catContent === true)
        catContentElement.innerHTML = "Ocio";
      else
        catContentElement.innerHTML = "No Ocio";
    }

    const resttime_left = Math.max(0, assigned_rest_time * 60 - accumulated_leisure_time);
    const timerElement = document.getElementById("display-timer");
    if (timerElement) timerElement.textContent = formatMinutes(resttime_left);

  } else {
    registerScreen.hidden = true;
    authScreen.hidden = false;
    dashboardScreen.hidden = true;
  }
}

async function login(user) {
  try {
    /*
    const response = await fetch('http://127.0.0.1:8000/api/v1/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    */

    const response = await fetch('https://focusguard-api-d7ayede7fufnbshq.eastus-01.azurewebsites.net/api/v1/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });

    if (!response.ok)
      throw new Error(`Error al iniciar sesión: ${response.status}`);

    const data = await response.json();
    const payload = parseJwt(data.access_token);

    if (payload && payload.sub) {
      const userId = payload.sub;
      const expirationTime = Date.now() + (data.expires_in * 1000);

      await chrome.storage.local.set({
        "access_token": data.access_token,
        "user_id": userId,
        "expires_at": expirationTime
      });

      await initializeStorage();
      await loadScreen();

    } else {
      alert("Token inválido: No se pudo obtener la identidad del usuario.");
    }
  } catch (error) {
    console.error(error.message);
  }
}
async function logout() {

  // Mostramos la pantalla de Registro
  showRegister();

  await updateTimeSpent(); // Subimos los datos del Storage al Backend
  await deleteAlarms(); // Eliminar pulso
  await clearAllStorage(); // Limpiamos el Storage completo

}

function showRegister() {
  document.getElementById('register-screen').hidden = false;
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('dashboard-screen').hidden = true;
}
function showAuth() {
  document.getElementById('register-screen').hidden = true;
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('dashboard-screen').hidden = true;
}
function showDashboard() {
  document.getElementById('register-screen').hidden = true;
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('dashboard-screen').hidden = false;
}


// :::: FUNCIONES ON-MESSAGE ::::

function initializeStorage() {
  /*
  chrome.runtime.sendMessage({ action: "initialize-storage" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error:", chrome.runtime.lastError);
      return;
    }
    if (response.status === "success")
      console.log("Storage inicializado exitosamente");
    else
      console.error("Storage no se pudo inicializar", response.message);
  });
  */

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "initialize-storage" }, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (response.status === "success") {
        console.log("Storage inicializado exitosamente");
        resolve();
      } else {
        reject(new Error(response.message));
      }
    });
  });
}
function updateTimeSpent() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "update-time-spent" }, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (response.status === "success") {
        console.log("Tiempo usado actualizado en la BD exitosamente");
        resolve();
      } else {
        reject(new Error(response.message));
      }
    });
  });
}
function deleteAlarms() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "delete-alarms" }, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (response.status === "success") {
        console.log("Alarmas eliminadas exitosamente");
        resolve();
      } else {
        reject(new Error(response.message));
      }
    });
  });
}
function clearAllStorage() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "clear-all-storage" }, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (response.status === "success") {
        console.log("Storage limpiado exitosamente");
        resolve();
      } else {
        reject(new Error(response.message));
      }
    });
  });
}
function getCategoryWeb(domain) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "get-category-web", hostname: domain }, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (response.status === "success") {
        console.log("Categoría web obtenida exitosamente");
        resolve(response.data);
      } else {
        reject(new Error(response.message));
      }
    });
  });
}
function getCategoryContent(domain, title) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "get-category-content", hostname: domain, title: title }, (response) => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            if (response.status === "success") {
                console.log("Categoría de contenido obtenida exitosamente");
                resolve(response.data);
            } else {
                reject(new Error(response.message));
            }
        });
    });
}


// :::: OTRAS FUNCIONES ::::

function isHttpUrl(url) {
    try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}
function parseJwt(token) {
  try {
    // 1. Obtenemos la parte del medio (Payload)
    const base64Url = token.split('.')[1];

    // 2. Reemplazamos caracteres de Base64Url a Base64 estándar
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    // 3. Decodificamos y manejamos caracteres especiales (UTF-8)
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error decodificando el token:", error);
    return null;
  }
}
function formatMinutes(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  // Usamos padStart para asegurar que siempre haya 2 dígitos (ej: 02:05:00)
  const hDisplay = String(hours).padStart(2, '0');
  const mDisplay = String(minutes).padStart(2, '0');
  const sDisplay = String(seconds).padStart(2, '0');

  return `${hDisplay}:${mDisplay}:${sDisplay}`;
}
function getHostname(tab) {
  const hostname = new URL(tab.url).hostname;
  return hostname.replace(/^www\./, '');
}

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}
async function getCurrentDomain() {
  let currentTab = await getCurrentTab();
  if (!currentTab?.url || !isHttpUrl(currentTab.url)) return null;

  try {
    return getHostname(currentTab);
  } catch (error) {
    console.error("No se pudo obtener el dominio de:", currentTab.url);
    return null;
  }
}
async function getCurrentTitle() {
    let currentTab = await getCurrentTab();
    if (!currentTab?.url || !isHttpUrl(currentTab.url) || !currentTab?.title) return null;

    try {
        return currentTab.title;
    } catch (error) {
        console.error("No se pudo obtener el titulo de:", currentTab.url);
        return null;
    }
}


await loadScreen();
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  // TODO[Mejora]: cuando en el local storage se cambie la categoria de algun sitio o contenido, actualizar el Dashboard
  const keysToWatch = ["accumulated_leisure_time", "assigned_rest_time"];
  const hasRevelantChange = keysToWatch.some(key => key in changes);

  if (hasRevelantChange) {
    await loadScreen();
  }
});
