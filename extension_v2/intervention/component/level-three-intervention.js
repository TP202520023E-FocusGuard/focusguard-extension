let focusGuardObserverThree = null;
let preventActionThree = null;
let countdownThree = null;
let originalStylesSnapshot = null;

function initLevelThreeIntervention(durationSeconds = 60) {
    const htmlElement = document.documentElement;
    const bodyElement = document.body;

    // 1. SANEAMIENTO PREVIO (Idempotencia)
    if (focusGuardObserverThree) {
        focusGuardObserverThree.disconnect();
        focusGuardObserverThree = null;
    }

    if (preventActionThree) {
        cleanupListeners();
        preventActionThree = null;
    }

    if (countdownThree) {
        clearInterval(countdownThree);
        countdownThree = null;
    }

    if (originalStylesSnapshot) {
        htmlElement.style.overflow = originalStylesSnapshot.html.overflow;
        htmlElement.style.position = originalStylesSnapshot.html.position;
        htmlElement.style.height = originalStylesSnapshot.html.height;

        if (bodyElement) {
            bodyElement.style.overflow = originalStylesSnapshot.body.overflow;
            bodyElement.style.position = originalStylesSnapshot.body.position;
            bodyElement.style.height = originalStylesSnapshot.body.height;
        }

        originalStylesSnapshot = null;
    }

    const globalStyleElem = document.getElementById('focus-guard-global-style');
    if (globalStyleElem) globalStyleElem.remove();

    const existing = document.getElementById('focus-guard-lvl3');
    if (existing) existing.remove();


    // 2. CALCULAR EL TIEMPO
    const STORAGE_KEY = "focus_block_until";
    const now = Date.now();
    let blockedUntil = parseInt(localStorage.getItem(STORAGE_KEY)); // milisegundos

    if (!blockedUntil || blockedUntil < now) {
        blockedUntil = now + durationSeconds * 1000;
        localStorage.setItem(STORAGE_KEY, String(blockedUntil));
    }

    let remaining = Math.ceil((blockedUntil - now) / 1000); // segundos

    if (remaining <= 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
    }


    // 3. GUARDAR ESTILOS ORIGINALES Y CAMBIAR LOS ESTILOS
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

    // 4. CONSTRUCCIÓN DE LA INTERVENCIÓN
    const host = document.createElement('div');
    host.id = 'focus-guard-lvl3';
    
    const mountPoint = document.body || document.documentElement;
    mountPoint.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        :host {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            height: 100% !important;
            min-width: 100vw !important;
            min-height: 100vh !important;
            z-index: 2147483647 !important;
            background: #020617 !important;
            color: white !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            pointer-events: all !important;
            transform: translateZ(0) !important;
            will-change: transform !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            isolation: isolate !important;
        }
        
        .card {
            text-align: center;
            max-width: 400px;
            padding: 40px;
            font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            background: transparent !important;
            color: white !important;
            position: relative !important;
            z-index: 1 !important;
        }
        
        .title {
            font-size: 20px !important;
            font-weight: 700 !important;
            margin-bottom: 10px !important;
            color: white !important;
            background: transparent !important;
        }
        
        .subtitle {
            font-size: 14px !important;
            color: #94a3b8 !important;
            margin-bottom: 30px !important;
            background: transparent !important;
        }
        
        .timer {
            font-size: 48px !important;
            font-weight: 800 !important;
            letter-spacing: 2px !important;
            color: white !important;
            background: transparent !important;
        }
        
        .label {
            margin-top: 10px !important;
            font-size: 12px !important;
            color: #475569 !important;
            text-transform: uppercase !important;
            background: transparent !important;
        }
        
        .footer {
            margin-top: 40px !important;
            font-size: 11px !important;
            color: #334155 !important;
            background: transparent !important;
        }
    `;

    const container = document.createElement('div');
    container.className = 'card';
    container.innerHTML = `
        <div class="title">Sitio bloqueado</div>
        <div class="subtitle">
            Has decidido enfocarte.<br>
            Este sitio no estará disponible temporalmente.
        </div>
        <div class="timer" id="timer">${formatTime(remaining)}</div>
        <div class="label">Tiempo restante</div>
        <div class="footer">
            Esta decisión no se puede revertir
        </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    // Se fuerza un reflow sincrónico. Esto garantiza que el motor de renderizado del navegador
    // aplique los estilos críticos y las dimensiones del Shadow Host de forma inmediata
    host.getBoundingClientRect();

    const globalStyle = document.createElement('style');
    globalStyle.id = 'focus-guard-global-style';
    globalStyle.textContent = `
        body > :not(#focus-guard-lvl3) {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
        
        #movie_player, .html5-video-container, video, 
        ytd-app, ytd-page-manager, #content, #page-manager {
            opacity: 0 !important;
            visibility: hidden !important;
        }
    `;
    const head = document.head || document.getElementsByTagName('head')[0];

    if (head) {
        head.appendChild(globalStyle);
    } else {
        document.documentElement.appendChild(globalStyle);
    }

    // 5. GESTIÓN DE EVENTOS
    preventActionThree = (event) => {
        if (!event.composedPath().includes(host)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    };

    document.addEventListener('click', preventActionThree, true);
    document.addEventListener('keydown', preventActionThree, true);
    document.addEventListener('scroll', preventActionThree, true);
    window.addEventListener('scroll', preventActionThree, true);

    let timerEl = container.querySelector('#timer');
    
    function updateTimer() {
        const now = Date.now();
        remaining = Math.ceil((blockedUntil - now) / 1000);
        
        if (remaining <= 0) {
            localStorage.removeItem(STORAGE_KEY);
            closeIntervention();
            return;
        }
        
        if (!timerEl || !document.contains(timerEl)) {
            timerEl = container.querySelector('#timer');
        }
        
        if (timerEl) {
            timerEl.textContent = formatTime(remaining);

            timerEl.style.transform = 'scale(1.001)';
            requestAnimationFrame(() => {
                timerEl.style.transform = 'scale(1)';
            });
        }
    }
    
    updateTimer();
    
    countdownThree = setInterval(() => {
        updateTimer();
    }, 1000);

    // 6. SISTEMA ANTI-BORRADO
    focusGuardObserverThree = new MutationObserver((mutations) => {
        if (!document.documentElement.contains(host) || !host.isConnected) {
            console.log("Intento de evasión detectado (Nivel 3)");
            if (preventActionThree) cleanupListeners();
            initLevelThreeIntervention(remaining);
            return;
        }
        
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const target = mutation.target;
                if (target === host || target === host.shadowRoot) {
                    host.style.cssText = `
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        bottom: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        z-index: 2147483647 !important;
                        background: #020617 !important;
                        display: flex !important;
                        pointer-events: all !important;
                    `;
                }
            }
        }
    });

    focusGuardObserverThree.observe(document.documentElement, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });


    // 7. LÓGICA DE CIERRE Y LIMPIEZA
    function cleanupListeners() {
        document.removeEventListener('click', preventActionThree, true);
        document.removeEventListener('keydown', preventActionThree, true);
        document.removeEventListener('scroll', preventActionThree, true);
        window.removeEventListener('scroll', preventActionThree, true);
    }

    function closeIntervention() {
        if (countdownThree) {
            clearInterval(countdownThree);
            countdownThree = null;
        }

        if (focusGuardObserverThree) {
            focusGuardObserverThree.disconnect();
            focusGuardObserverThree = null;
        }

        if (preventActionThree) cleanupListeners();

        preventActionThree = null;

        htmlElement.style.overflow = originalStylesSnapshot.html.overflow;
        htmlElement.style.position = originalStylesSnapshot.html.position;
        htmlElement.style.height = originalStylesSnapshot.html.height;

        if (bodyElement) {
            bodyElement.style.overflow = originalStylesSnapshot.body.overflow;
            bodyElement.style.position = originalStylesSnapshot.body.position;
            bodyElement.style.height = originalStylesSnapshot.body.height;
        }

        originalStylesSnapshot = null;
        
        const globalStyleElem = document.getElementById('focus-guard-global-style');
        if (globalStyleElem) globalStyleElem.remove();

        chrome.runtime.sendMessage({ action: "intervention-unlocked" });

        host.remove();
    }


    // FUNCIONES DE AYUDA
    function formatTime(sec) {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }
    function silenceTeasingMedia() {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            video.pause();
            video.muted = true;
            video.currentTime = 0;
        });
    }
}

// Iniciar bloqueo
// initLevelThreeIntervention(60);