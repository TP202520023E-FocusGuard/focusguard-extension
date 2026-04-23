{
    window.fgObserver = window.fgObserver || null;
    window.fgPreventAction = window.fgPreventAction || null;
    window.fgCountdown = window.fgCountdown || null;
    window.fgOriginalStylesSnapshot = window.fgOriginalStylesSnapshot || null;

    /*
    let focusGuardObserverTwo = null;
    let preventActionTwo = null;
    let originalStylesSnapshotLvl2 = null;
    */
    function initLevelTwoIntervention(targetText = "Siento la tentación de tomar un breve descanso, pero sé que el progreso es la clave.") {
        const htmlElement = document.documentElement;
        const bodyElement = document.body;

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

        const mountPoint = document.body || document.documentElement;
        mountPoint.appendChild(host);

        const shadow = host.attachShadow({mode: 'closed'});

        const style = document.createElement('style');
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

        const container = document.createElement('div');
        container.className = 'card';
        container.innerHTML = `
        <h2>Validación de Intención</h2>
        <div class="instruction" id="target">${targetText}</div>
        <textarea id="input" placeholder="Escribe el texto de arriba para desbloquear..."></textarea>
        <div class="progress-bar"><div class="progress-inner" id="progress"></div></div>
        <div class="footer">
            <button class="btn-cancel" id="cancel">Mejor me voy</button>
            <button class="btn-unlock" id="unlock">Desbloquear</button>
        </div>
    `;

        shadow.appendChild(style);
        shadow.appendChild(container);

        const input = shadow.getElementById('input');
        const unlockBtn = shadow.getElementById('unlock');
        const progressInner = shadow.getElementById('progress');
        const cancelBtn = shadow.getElementById('cancel');


        // 4. GESTIÓN DE EVENTOS
        window.fgPreventAction = (event) => {
            if (!event.composedPath().includes(host)) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
        };

        // Listeners globales
        document.addEventListener('click', window.fgPreventAction, true);
        document.addEventListener('keydown', window.fgPreventAction, true);
        document.addEventListener('scroll', window.fgPreventAction, true);
        window.addEventListener('scroll', window.fgPreventAction, true);

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


        // 5. SISTEMA ANTI-BORRADO
        window.fgObserver = new MutationObserver((mutations) => {
            if (!document.documentElement.contains(host) || !host.isConnected) {
                console.log("Evasión detectada en Lvl 2! Reiniciando...");
                if (window.fgPreventAction) cleanupListeners();
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


        // 6. CIERRE Y LIMPIEZA
        function cleanupListeners() {
            document.removeEventListener('click', window.fgPreventAction, true);
            document.removeEventListener('keydown', window.fgPreventAction, true);
            document.removeEventListener('scroll', window.fgPreventAction, true);
            window.removeEventListener('scroll', window.fgPreventAction, true);
        }

        const closeIntervention = () => {
            if (window.fgObserver) {
                window.fgObserver.disconnect();
                window.fgObserver = null;
            }

            if (window.fgPreventAction) cleanupListeners();
            window.fgPreventAction = null;

            if (window.fgOriginalStylesSnapshot) {
                htmlElement.style.overflow = window.fgOriginalStylesSnapshot.html.overflow;
                htmlElement.style.position = window.fgOriginalStylesSnapshot.html.position;
                htmlElement.style.height = window.fgOriginalStylesSnapshot.html.height;
                if (bodyElement && window.fgOriginalStylesSnapshot.body) {
                    bodyElement.style.overflow = window.fgOriginalStylesSnapshot.body.overflow;
                    bodyElement.style.position = window.fgOriginalStylesSnapshot.body.position;
                    bodyElement.style.height = window.fgOriginalStylesSnapshot.body.height;
                }
            }
            window.fgOriginalStylesSnapshot = null;

            chrome.runtime.sendMessage({action: "intervention-unlocked"});

            host.remove();
        };

        // 7. ACCIONES DE USUARIO
        unlockBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeIntervention();
        };

        cancelBtn.onclick = () => {
            window.location.href = "https://www.google.com";
        };

        setTimeout(() => input.focus(), 500);


        function silenceTeasingMedia() {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                video.pause();
                video.muted = true;
                video.currentTime = 0;
            });
        }
    }

    // Ahora puedes llamarla con cualquier texto desde tu backend
    //initLevelTwoIntervention("Escribe esta frase personalizada para continuar.");
}