{
    window.fgObserver = window.fgObserver || null;
    window.fgPreventAction = window.fgPreventAction || null;
    window.fgCountdown = window.fgCountdown || null;
    window.fgOriginalStylesSnapshot = window.fgOriginalStylesSnapshot || null;

    function initFocusIntervention(level = 1, seconds = 50, targetText = "Siento la tentación de tomar un breve descanso, pero sé que el progreso es la clave.") {
        const htmlElement = document.documentElement;
        const bodyElement = document.body;

        // --- FUNCIONES COMPARTIDAS ---
        const cleanupListeners = () => {
            if (window.fgPreventAction) {
                document.removeEventListener('click', window.fgPreventAction, true);
                document.removeEventListener('keydown', window.fgPreventAction, true);
                document.removeEventListener('scroll', window.fgPreventAction, true);
                window.removeEventListener('scroll', window.fgPreventAction, true);

                window.fgPreventAction = null;
            }
        };

        const silenceTeasingMedia = () => {
            document.querySelectorAll('video').forEach(video => {
                video.pause();
                video.muted = true;
                video.currentTime = 0;
            });
        };

        const restoreStyles = () => {
            if (window.fgOriginalStylesSnapshot) {
                const snap = window.fgOriginalStylesSnapshot;
                htmlElement.style.overflow = snap.html.overflow;
                htmlElement.style.position = snap.html.position;
                htmlElement.style.height = snap.html.height;
                if (bodyElement && snap.body) {
                    bodyElement.style.overflow = snap.body.overflow;
                    bodyElement.style.position = snap.body.position;
                    bodyElement.style.height = snap.body.height;
                }
                window.fgOriginalStylesSnapshot = null;
            }
        };

        const closeIntervention = () => {
            if (window.fgCountdown) clearInterval(window.fgCountdown);
            if (window.fgObserver) window.fgObserver.disconnect();
            cleanupListeners();
            restoreStyles();

            chrome.runtime.sendMessage({ action: "intervention-unlocked" });

            const host = document.getElementById('focus-guard-container');
            if (host) host.remove();
        };


        // 1. SANEAMIENTO PREVIO (Idempotencia)
        if (window.fgObserver) {
            window.fgObserver.disconnect();
            window.fgObserver = null;
        }

        if (window.fgPreventAction) {
            cleanupListeners();
            window.fgPreventAction = null;
        }

        if (window.fgCountdown) {
            clearInterval(window.fgCountdown);
            window.fgCountdown = null;
        }

        if (window.fgOriginalStylesSnapshot) {
            htmlElement.style.overflow = window.fgOriginalStylesSnapshot.html.overflow;
            htmlElement.style.position = window.fgOriginalStylesSnapshot.html.position;
            htmlElement.style.height = window.fgOriginalStylesSnapshot.html.height;

            if (bodyElement) {
                bodyElement.style.overflow = window.fgOriginalStylesSnapshot.body.overflow;
                bodyElement.style.position = window.fgOriginalStylesSnapshot.body.position;
                bodyElement.style.height = window.fgOriginalStylesSnapshot.body.height;
            }
            window.fgOriginalStylesSnapshot = null;
        }

        const existing = document.getElementById('focus-guard-container');
        if (existing) existing.remove();


        // 2. CAPTURA DE ESTADOS ORIGINALES
        if (!window.fgOriginalStylesSnapshot) {
            window.fgOriginalStylesSnapshot = {
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
        }

        // Aplicar bloqueo de scroll y posición (Crítico para YouTube)
        const applyLock = () => {
            htmlElement.style.setProperty('overflow', 'hidden', 'important');
            htmlElement.style.setProperty('position', 'relative', 'important');
            htmlElement.style.setProperty('height', '100%', 'important');

            if (bodyElement) {
                bodyElement.style.setProperty('overflow', 'hidden', 'important');
                bodyElement.style.setProperty('position', 'relative', 'important');
                bodyElement.style.setProperty('height', '100%', 'important');
            }
        };
        applyLock();
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
        const container = document.createElement('div');
        container.className = 'card';

        if (level === 1) {
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
        
        <button id="action-btn">Espere...</button>
        <div class="hint">Rompiendo el ciclo de procrastinación</div>
    `;
        } else if (level === 2) {
            style.textContent = `
        :host {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            display: flex; justify-content: center; align-items: center;
            z-index: 2147483647;
            background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            font-family: 'Inter', system-ui, sans-serif;
            animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .card {
            background: #1e293b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 28px;
            padding: 35px;
            width: 500px;
            max-width: 90vw;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
        }

        h2 { color: #fff; font-size: 18px; margin: 0 0 15px; text-align: center; }

        .instruction {
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 20px;
            background: rgba(255, 255, 255, 0.03);
            padding: 15px;
            border-radius: 14px;
            border-left: 4px solid #3b82f6;
            user-select: none;
        }

        textarea {
            width: 100%;
            height: 120px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 15px;
            color: #fff;
            font-family: inherit;
            font-size: 14px;
            resize: none;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.3s;
        }

        textarea:focus { border-color: #3b82f6; }

        .footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 25px; }

        button {
            padding: 10px 25px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
        }

        .btn-cancel { background: transparent; color: #94a3b8; }
        .btn-cancel:hover { color: #f1f5f9; }

        .btn-unlock {
            background: #3b82f6;
            color: white;
            opacity: 0.4;
            pointer-events: none;
        }

        .btn-unlock.ready {
            opacity: 1;
            pointer-events: auto;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .progress-bar {
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            margin-top: 10px;
            overflow: hidden;
        }

        .progress-inner {
            height: 100%;
            background: #3b82f6;
            width: 0%;
            transition: width 0.3s;
        }
    `;
            container.innerHTML = `
        <h2>Validación de Intención</h2>
        <div class="instruction" id="target">${targetText}</div>
        <textarea id="input" placeholder="Escribe el texto de arriba para desbloquear..."></textarea>
        <div class="progress-bar"><div class="progress-inner" id="progress"></div></div>
        <div class="footer">
            <button class="btn-cancel" id="cancel">Mejor me voy</button>
            <button class="btn-unlock" id="action-btn">Desbloquear</button>
        </div>
    `;
        }

        shadow.appendChild(style);
        shadow.appendChild(container);


        // --- 4. LÓGICA ESPECÍFICA ---
        const actionBtn = container.querySelector('#action-btn');

        if (level === 1){

            host.getBoundingClientRect(); // Forzar reflow sincrónico

            // LÓGICA DE LA INTERVENCIÓN
            const timerText = container.querySelector('#int-timer');
            const progressFill = container.querySelector('.progress-fill');
            let remaining = seconds;
            const circumference = 345; // Basado en 2 * π * r (donde r=55)

            const updateProgress = () => {
                const progress = ((seconds - remaining) / seconds) * circumference;
                progressFill.style.strokeDashoffset = Math.max(0, circumference - progress);
            };

            window.fgCountdown = setInterval(() => {
                remaining--;
                timerText.innerText = remaining;
                updateProgress();

                if (remaining <= 0) {
                    clearInterval(window.fgCountdown);
                    actionBtn.classList.add('active');
                    actionBtn.innerText = 'Continuar';
                }

                // Render hack
                timerText.style.transform = 'scale(1.001)';
                requestAnimationFrame(() => timerText.style.transform = 'scale(1)');
            }, 1000);


            // SISTEMA ANTI-BORRADO
            window.fgObserver = new MutationObserver((mutations) => {
                // Validación de existencia física
                if (!document.documentElement.contains(host) || !host.isConnected) {
                    console.log(`¡EVACIÓN! Reiniciando intervención ${level}...`);
                    cleanupListeners();
                    initFocusIntervention(level, seconds, targetText);
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
            window.fgObserver.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });

        }
        else if (level === 2){

            // LÓGICA DE LA INTERVENCIÓN
            const input = shadow.getElementById('input');
            const unlockBtn = shadow.getElementById('unlock');
            const progressInner = shadow.getElementById('progress');
            const cancelBtn = shadow.getElementById('cancel');

            const handleKeyEvents = (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            };

            // Listeners dentro de la intervención
            input.addEventListener('keydown', handleKeyEvents, true);
            input.addEventListener('keyup', handleKeyEvents, true);

            input.addEventListener('input', (e) => {
                e.stopPropagation();
                const val = input.value;
                if (targetText.startsWith(val)) {
                    const percent = (val.length / targetText.length) * 100;
                    progressInner.style.width = `${percent}%`;
                    progressInner.style.background = '#3b82f6';

                    if (val === targetText) {
                        unlockBtn.classList.add('ready');
                        progressInner.style.background = '#10b981';
                    } else {
                        unlockBtn.classList.remove('ready');
                    }
                } else {
                    progressInner.style.background = '#ef4444';
                    unlockBtn.classList.remove('ready');
                }
            });

            input.onpaste = (e) => e.preventDefault();
            shadow.querySelector('.card').onclick = () => input.focus();


            // SISTEMA ANTI-BORRADO
            window.fgObserver = new MutationObserver((mutations) => {
                if (!document.documentElement.contains(host) || !host.isConnected) {
                    console.log("Evasión detectada en Lvl 2! Reiniciando...");
                    if(window.fgPreventAction) cleanupListeners();
                    initLevelTwoIntervention(targetText);
                    return;
                }

                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        if (mutation.target === host) {
                            host.style.cssText = `
                        position: fixed !important;
                        top: 0 !important; left: 0 !important;
                        width: 100vw !important; height: 100vh !important;
                        z-index: 2147483647 !important;
                        display: flex !important;
                    `;
                        }
                    }
                }
            });
            window.fgObserver.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });


            // ACCIONES DE USUARIO
            cancelBtn.onclick = () => {
                window.location.href = "https://www.google.com";
            };

            setTimeout(() => input.focus(), 500);

        }

        // --- 6. EVENTOS ---
        // Bloquear interacción con el resto de la página
        window.fgPreventAction = (event) => {
            // composedPath() devuelve un arreglo con todos los nodos por los que pasó el evento [host, body, html, document, window].
            if (!event.composedPath().includes(host)) {
                event.preventDefault(); // Cancela el evento
                event.stopPropagation(); // Evita que otros listeners en elementos superiores detecten el evento.
                event.stopImmediatePropagation();
            }
        };

        // Atrapa el clic o la tecla antes de que lleguen a la página web.
        document.addEventListener('click', window.fgPreventAction, true);
        document.addEventListener('keydown', window.fgPreventAction, true);
        document.addEventListener('scroll', window.fgPreventAction, true);
        window.addEventListener('scroll', window.fgPreventAction, true);


        // // --- ACCIONES COMPARTIDAS ---
        actionBtn.onclick = () => closeIntervention();

    }
}