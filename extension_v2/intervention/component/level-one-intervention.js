// Las variables definidas de forma global toman el mando y limpian los datos gurdados del mismo script anterior
let focusGuardObserverOne = null;
let preventActionOne = null;
let countdown = null;

function initFocusIntervention(seconds = 50) {

    // 1. SANEAMIENTO PREVIO (Idempotencia)
    if (focusGuardObserverOne) {
        focusGuardObserverOne.disconnect();
        focusGuardObserverOne = null;
    }

    if (preventActionOne) {
        document.removeEventListener('click', preventActionOne, true);
        document.removeEventListener('keydown', preventActionOne, true);
    }

    if (countdown) clearInterval(countdown);

    const existing = document.getElementById('focus-guard-container');
    if (existing) existing.remove();


    // 2. CONSTRUCCIÓN DE LA INTERVENCIÓN
    const host = document.createElement('div');
    host.id = 'focus-guard-container';
    document.body.appendChild(host);

    // Deniega el acceso a los nodos desde fuera
    // Impide que el estilo del sitio web original (ej. YouTube) afecte al temporizador, y viceversa.
    const shadow = host.attachShadow({mode: 'closed'});

    const style = document.createElement('style');
    style.textContent = `
        :host {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            display: flex; justify-content: center; align-items: center;
            z-index: 2147483647;
            /* Fondo más sutil para no ocupar visualmente toda la pantalla */
            background: rgba(15, 23, 42, 0.4); 
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            font-family: 'Inter', system-ui, sans-serif;
            animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }

        .card {
            background: #1e293b; /* Fondo oscuro sólido y elegante */
            background: linear-gradient(145deg, #1e293b, #0f172a);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 30px;
            width: 320px; /* Tamaño reducido */
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: float 5s ease-in-out infinite;
        }

        .badge {
            display: inline-block;
            background: rgba(59, 130, 246, 0.2);
            color: #60a5fa;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            padding: 4px 12px;
            border-radius: 12px;
            margin-bottom: 15px;
        }

        .quote {
            font-size: 15px;
            color: #f1f5f9;
            line-height: 1.5;
            margin: 20px 0;
            font-style: italic;
        }

        .timer-container {
            position: relative;
            width: 120px; 
            height: 120px;
            margin: 20px auto;
        }

        .circular-progress {
            width: 120px;
            height: 120px;
            transform: rotate(-90deg);
        }

        .progress-bg { fill: none; stroke: rgba(255, 255, 255, 0.05); stroke-width: 6; }
        .progress-fill {
            fill: none;
            stroke: #3b82f6;
            stroke-width: 6;
            stroke-linecap: round;
            stroke-dasharray: 345; /* 2 * PI * 55 */
            stroke-dashoffset: 345;
            transition: stroke-dashoffset 1s linear;
        }

        .timer-display {
            position: absolute;
            top: 50%; 
            left: 50%;
            transform: translate(-50%, -50%);
        }

        .countdown-number {
            font-size: 32px;
            font-weight: 800;
            color: #fff;
            display: block;
        }

        .seconds-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; }

        button {
            background: rgba(255, 255, 255, 0.05);
            color: #64748b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 12px 0;
            width: 100%;
            border-radius: 14px;
            font-size: 14px;
            font-weight: 600;
            cursor: not-allowed;
            transition: all 0.3s ease;
        }

        button.active {
            background: #3b82f6;
            color: white;
            cursor: pointer;
            border: none;
            box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4);
        }

        button.active:hover { background: #2563eb; transform: translateY(-2px); }

        .hint { font-size: 11px; color: #475569; margin-top: 20px; }
    `;

    const container = document.createElement('div');
    container.className = 'card';
    container.innerHTML = `
        <div class="badge">Enfoque</div>
        <div class="quote">"El trabajo que nunca se empieza es el que más tarda en finalizarse."</div>
        
        <div class="timer-container">
            <svg class="circular-progress">
                <circle class="progress-bg" cx="60" cy="60" r="55"/>
                <circle class="progress-fill" cx="60" cy="60" r="55"/>
            </svg>
            <div class="timer-display">
                <span class="countdown-number" id="int-timer">${seconds}</span>
                <span class="seconds-label">seg</span>
            </div>
        </div>
        
        <button id="int-btn">Espere...</button>
        <div class="hint">Rompiendo el ciclo de procrastinación</div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    const timerText = container.querySelector('#int-timer');
    const btn = container.querySelector('#int-btn');
    const progressFill = container.querySelector('.progress-fill');
    let remaining = seconds;
    const circumference = 345; // Basado en 2 * π * r (donde r=55)

    // Bloqueo de Interacción: el usuario ya no puede bajar ni subir en la página.
    const bodyStyle = document.body.style.cssText;
    document.body.style.cssText += 'overflow: hidden !important;';

    // Temporizador Circular
    const updateProgress = () => {
        const progress = ((seconds - remaining) / seconds) * circumference;
        progressFill.style.strokeDashoffset = circumference - progress;
    };

    countdown = setInterval(() => {
        remaining--;
        timerText.innerText = remaining;
        updateProgress();

        if (remaining <= 0) {
            clearInterval(countdown);
            btn.classList.add('active');
            btn.innerText = 'Continuar';
        }
    }, 1000);


    // 3. GESTIÓN DE EVENTOS
    // Bloquear interacción con el resto de la página
    preventActionOne = (event) => {
        // composedPath() devuelve un arreglo con todos los nodos por los que pasó el evento [host, body, html, document, window].
        if (!event.composedPath().includes(host)) {
            event.preventDefault(); // Cancela el evento
            event.stopPropagation(); // Evita que otros listeners en elementos superiores detecten el evento.
        }
    };
    // Atrapa el clic o la tecla antes de que lleguen a la página web.
    document.addEventListener('click', preventActionOne, true);
    document.addEventListener('keydown', preventActionOne, true);


    // 4. LÓGICA DE CIERRE Y LIMPIEZA
    // Liberar eventos al cerrar
    const cleanupListeners = () => {
        document.removeEventListener('click', preventActionOne, true);
        document.removeEventListener('keydown', preventActionOne, true);
    };

    const closeIntervention = () => {
        if (countdown) clearInterval(countdown);

        if (focusGuardObserverOne) {
            focusGuardObserverOne.disconnect();
            focusGuardObserverOne = null;
        }

        cleanupListeners();
        preventActionOne = null;
        document.body.style.cssText = bodyStyle;
        host.remove();
    };


    // 5. SISTEMA ANTI-BORRADO
    focusGuardObserverOne = new MutationObserver(() => {
        if (!document.body.contains(host)) {
            console.log("¡Intento de evasión detectado! Reiniciando intervención...");
            cleanupListeners();
            initFocusIntervention(remaining > 0 ? remaining : 5);
        }
    });
    focusGuardObserverOne.observe(document.body, { childList: true });


    // 6. ACCIONES DE USUARIO
    btn.onclick = () => {
        if (remaining > 0) return;
        closeIntervention();
    };
}

//initFocusIntervention(50);