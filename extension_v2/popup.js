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
      const response = await fetch('http://127.0.0.1:8000/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(new_user)
      });

      if (!response.ok)
        throw new Error(`Error al registrar usuario: ${response.status}`);

      const result = await response.json();
      await chrome.storage.local.set({ "user_id": result.id });
      await isUserConnected();

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

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/users/login', {
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

        await isUserConnected();
      } else {
        alert("Token inválido: No se pudo obtener la identidad del usuario.");
      }
    } catch (error) {
      console.error(error.message);
    }
  });

  // --- NAVEGACIÓN ENTRE PAGINAS ---
  document.getElementById('btn-go-to-register')?.addEventListener('click', showRegister);
  document.getElementById('btn-go-to-auth')?.addEventListener('click', showAuth);
});

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

const showRegister = () => {
  document.getElementById('register-screen').hidden = false;
  document.getElementById('auth-screen').hidden = true;
};
const showAuth = () => {
  document.getElementById('register-screen').hidden = true;
  document.getElementById('auth-screen').hidden = false;
};

async function isUserConnected() {
  let { user_id } = await chrome.storage.local.get("user_id");

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

  } else {
    registerScreen.hidden = false;
    authScreen.hidden = true;
    dashboardScreen.hidden = true;
  }
}

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}
async function getCurrentDomain() {
  let currentTab = await getCurrentTab();
  if (!currentTab?.url) return null;

  try {
    return new URL(currentTab.url).hostname;
  } catch (error) {
    console.error("No se pudo obtener el dominio de:", currentTab.url);
    return null;
  }
}

await isUserConnected();
