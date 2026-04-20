// Las variables definidas de forma global toman el mando y limpian los datos gurdados del mismo script anterior
let focusGuardObserverOne = null;
let preventActionOne = null;
let countdownOne = null;
let originalStylesSnapshotOne = null;

function initFocusIntervention(seconds = 50) {
    const htmlElement = document.documentElement;
    const bodyElement = document.body;

    // 1. SANEAMIENTO PREVIO (Idempotencia)
    if (focusGuardObserverOne) {
        focusGuardObserverOne.disconnect();
        focusGuardObserverOne = null;
    }

    if (preventActionOne) {
        cleanupListeners();
        preventActionOne = null;
    }

    if (countdownOne) {
        clearInterval(countdownOne);
        countdownOne = null;
    }

    if (originalStylesSnapshotOne) {
        htmlElement.style.overflow = originalStylesSnapshotOne.html.overflow;
        htmlElement.style.position = originalStylesSnapshotOne.html.position;
        htmlElement.style.height = originalStylesSnapshotOne.html.height;

        if (bodyElement) {
            bodyElement.style.overflow = originalStylesSnapshotOne.body.overflow;
            bodyElement.style.position = originalStylesSnapshotOne.body.position;
            bodyElement.style.height = originalStylesSnapshotOne.body.height;
        }
        originalStylesSnapshotOne = null;
    }

    const existing = document.getElementById('focus-guard-container');
    if (existing) existing.remove();


    // 2. CAPTURA DE ESTADOS ORIGINALES
    originalStylesSnapshot = {
        html: {
            overflow: htmlElement.style.overflow,
            position: htmlElement.style.position,
            height: htmlElement.style.height
        },
        body: bodyElement ? {
            overflow: bodyElement.style.overflow,
            position: bodyElement.style.position,
            height: bodyElement.style.height
        } : null
    };

    // Aplicar bloqueo de scroll y posición (Crítico para YouTube)
    htmlElement.style.setProperty('overflow', 'hidden', 'important');
    htmlElement.style.setProperty('position', 'relative', 'important');
    htmlElement.style.setProperty('height', '100%', 'important');

    if (bodyElement) {
        bodyElement.style.setProperty('overflow', 'hidden', 'important');
        bodyElement.style.setProperty('position', 'relative', 'important');
        bodyElement.style.setProperty('height', '100%', 'important');
    }

    silenceTeasingMedia();


    // 3. CONSTRUCCIÓN DE LA INTERVENCIÓN
    const host = document.createElement('div');
    host.id = 'focus-guard-container';

    // Priorizamos el montaje en el body, si no existe, al root
    const mountPoint = document.body || document.documentElement;
    mountPoint.appendChild(host);

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

    host.getBoundingClientRect(); // Forzar reflow sincrónico


    // 4. LÓGICA DE LA INTERVENCIÓN
    const timerText = container.querySelector('#int-timer');
    const btn = container.querySelector('#int-btn');
    const progressFill = container.querySelector('.progress-fill');
    let remaining = seconds;
    const circumference = 345; // Basado en 2 * π * r (donde r=55)

    const updateProgress = () => {
        const progress = ((seconds - remaining) / seconds) * circumference;
        progressFill.style.strokeDashoffset = Math.max(0, circumference - progress);
    };

    countdownOne = setInterval(() => {
        remaining--;
        timerText.innerText = remaining;
        updateProgress();

        if (remaining <= 0) {
            clearInterval(countdownOne);
            btn.classList.add('active');
            btn.innerText = 'Continuar';
        }

        // Render hack
        timerText.style.transform = 'scale(1.001)';
        requestAnimationFrame(() => timerText.style.transform = 'scale(1)');
    }, 1000);


    // 5. GESTIÓN DE EVENTOS
    // Bloquear interacción con el resto de la página
    preventActionOne = (event) => {
        // composedPath() devuelve un arreglo con todos los nodos por los que pasó el evento [host, body, html, document, window].
        if (!event.composedPath().includes(host)) {
            event.preventDefault(); // Cancela el evento
            event.stopPropagation(); // Evita que otros listeners en elementos superiores detecten el evento.
            event.stopImmediatePropagation();
        }
    };

    // Atrapa el clic o la tecla antes de que lleguen a la página web.
    document.addEventListener('click', preventActionOne, true);
    document.addEventListener('keydown', preventActionOne, true);
    document.addEventListener('scroll', preventActionOne, true);
    window.addEventListener('scroll', preventActionOne, true);


    // 6. SISTEMA ANTI-BORRADO
    focusGuardObserverOne = new MutationObserver((mutations) => {
        // Validación de existencia física
        if (!document.documentElement.contains(host) || !host.isConnected) {
            console.log("¡Intento de evasión detectado! Reiniciando intervención...");
            if (preventActionOne) cleanupListeners();
            initFocusIntervention(remaining > 0 ? remaining : 5);
            return;
        }

        // Validación de integridad de estilo (Anti-ocultamiento)
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (mutation.target === host) {
                    host.style.cssText = `
                        position: fixed !important;
                        top: 0 !important; left: 0 !important;
                        width: 100vw !important; height: 100vh !important;
                        z-index: 2147483647 !important;
                        pointer-events: all !important;
                        display: flex !important;
                    `;
                }
            }
        }
    });

    focusGuardObserverOne.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });


    // 7. CIERRE Y LIMPIEZA
    // Liberar eventos al cerrar
    function cleanupListeners() {
        document.removeEventListener('click', preventActionOne, true);
        document.removeEventListener('keydown', preventActionOne, true);
        document.removeEventListener('scroll', preventActionOne, true);
        window.removeEventListener('scroll', preventActionOne, true);
    }

    const closeIntervention = () => {
        if (countdownOne) {
            clearInterval(countdownOne);
            countdownOne = null;
        }

        if (focusGuardObserverOne) {
            focusGuardObserverOne.disconnect();
            focusGuardObserverOne = null;
        }

        if (preventActionOne) cleanupListeners();
        preventActionOne = null;

        // Restauración Snapshot
        if (originalStylesSnapshot) {
            htmlElement.style.overflow = originalStylesSnapshot.html.overflow;
            htmlElement.style.position = originalStylesSnapshot.html.position;
            htmlElement.style.height = originalStylesSnapshot.html.height;
            if (bodyElement && originalStylesSnapshot.body) {
                bodyElement.style.overflow = originalStylesSnapshot.body.overflow;
                bodyElement.style.position = originalStylesSnapshot.body.position;
                bodyElement.style.height = originalStylesSnapshot.body.height;
            }
        }

        host.remove();
    };

    btn.onclick = () => {
        if (remaining > 0) return;
        closeIntervention();
    };

    function silenceTeasingMedia() {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            video.pause();
            video.muted = true;
            video.currentTime = 0;
        });
    }
}

//initFocusIntervention(50);