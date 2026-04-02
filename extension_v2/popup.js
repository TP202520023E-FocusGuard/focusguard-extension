async function isUserConnected() {
  let { user_id } = await chrome.storage.local.get("user_id");
  const registerScreen = document.getElementById('register-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');

  if (user_id) { // Usuario logeado
    registerScreen.hidden = true;
    dashboardScreen.hidden = false;

    const domain = await getCurrentDomain();
    const domainElement = document.getElementById("domain");
    if (domainElement) domainElement.innerHTML = domain;

  } else {
    registerScreen.hidden = false;
    dashboardScreen.hidden = true;
  }
}

document.getElementById('registration-form').addEventListener('submit', async (event) => {
  event.preventDefault(); // Evita que la página se recargue

  // 1. Capturamos los datos de los inputs
  const first_name = document.getElementById('r-fname').value;
  const lastname = document.getElementById('r-lname').value;
  const phone = document.getElementById('r-phone').value;
  const email = document.getElementById('r-email').value;
  const password = document.getElementById('r-pwd').value;
  const password2 = document.getElementById('r-pwd2').value;
  const security_phrase = document.getElementById('r-phrase').value;

  // TODO[Necesary]: Validar que las contraseñas sean iguales

  const new_user = {
    correo: email,
    nombres: first_name,
    apellidos: lastname,
    telefono: phone,
    password: password,
    frase_seguridad: security_phrase
  };

  try {
    // 2. Enviamos a la Base de Datos (API)
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
