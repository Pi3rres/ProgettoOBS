document.addEventListener('DOMContentLoaded', () => {
    // Elementi di Configurazione
    const hostInput = document.getElementById('obs-host');
    const portInput = document.getElementById('obs-port');
    const passwordInput = document.getElementById('obs-password');
    const connectButton = document.getElementById('btn-connect');
    
    // Elementi di Stato e Controllo (Mantenuti per l'interfaccia)
    const statusElement = document.getElementById('status');
    const scenesListContainer = document.getElementById('scenes-container');
    const programSceneDisplay = document.getElementById('current-program-scene');
    const previewSceneDisplay = document.getElementById('current-preview-scene');

    const projectorViewsContainer = document.getElementById('projector-views');

    // Riferimenti ai pulsanti disabilitati in HTML ma necessari per JS (ora definiti)
    const disconnectButton = document.getElementById('btn-disconnect');
    const transitionButton = document.getElementById('btn-transition');

    // Stato locale
    let obsIsConnected = false;
    let currentProgramScene = null;
    let currentPreviewScene = null;
    let allScenes = [];

    // ----------------------------------------------------
    // 1. GESTIONE STATO UI
    // ----------------------------------------------------

    // Funzione per aggiornare lo stato di connessione e l'interfaccia
    const updateStatus = (status, message) => {
        statusElement.textContent = `Stato Connessione: ${status} - ${message}`;
        
        obsIsConnected = status === 'Connesso';
        
        // Aggiorna colori stato
        if (status === 'Connesso') {
             statusElement.style.backgroundColor = '#28a745'; // Verde
        } else if (status === 'Disconnesso') {
             statusElement.style.backgroundColor = '#dc3545'; // Rosso
             projectorViewsContainer.innerHTML = '<p class="initial-message" style="text-align: center;">Connettiti a OBS per avviare il monitoraggio dei proiettori.</p>';
             statusElement.style.backgroundColor = '#ffc107'; // Giallo
        }
        
        // Aggiorna stato pulsante di connessione (disconnessione e transizione sono sempre disabilitati)
        connectButton.disabled = obsIsConnected;
        disconnectButton.disabled = true; // Sempre disabilitato per questa fase
        transitionButton.disabled = true; // Sempre disabilitato per questa fase
        transitionButton.textContent = 'TRANSIZIONE (Disabilitato)';
        
        console.log(`[RENDERER STATUS] Stato aggiornato a: ${status}`);
    };
    
    // Aggiorna i nomi delle scene nei pannelli Preview/Program
    const updateSceneDisplays = (programSceneName, previewSceneName) => {
        programSceneDisplay.textContent = programSceneName || 'Nessuna';
        // Se la Preview non è impostata, usa un testo predefinito
        previewSceneDisplay.textContent = previewSceneName || (obsIsConnected ? 'Seleziona una Scena' : 'Disconnesso');
        
        updateStatus(statusElement.textContent.includes('Connesso') ? 'Connesso' : 'Disconnesso', statusElement.textContent.split(' - ')[1]);
    };

    // ----------------------------------------------------
    // 2. RENDERING SCENE E PROIETTORI
    // ----------------------------------------------------

    const renderSceneButtons = (sceneData) => {
        scenesListContainer.innerHTML = ''; // Pulisci prima di renderizzare
        
        
        console.log('[RENDERER RENDER] Inizio rendering. Dati ricevuti:', sceneData);
        
        if (!sceneData || !sceneData.scenes || sceneData.scenes.length === 0) {
            console.warn('[RENDERER RENDER] Nessun dato scena valido. Visualizzo messaggio di fallback.');
            currentProgramScene = null;
            currentPreviewScene = null;
            allScenes = [];
            updateSceneDisplays(null, null);
            
            // CORREZIONE: Usiamo la classe CSS standard "initial-message"
            scenesListContainer.innerHTML = obsIsConnected 
                ? '<p class="initial-message">Nessuna scena trovata in OBS.</p>'
                : '<p class="initial-message">Connettiti a OBS per caricare le scene.</p>';
            return;
        }

        allScenes = sceneData.scenes;
        currentProgramScene = sceneData.currentScene;
        
        console.log(`[RENDERER RENDER] Variabili aggiornate: Program='${currentProgramScene}', Totali=${allScenes.length}`);
        
        // Mantieni la Preview attuale a meno che non sia più valida
        if (!allScenes.includes(currentPreviewScene)) {
            currentPreviewScene = null;
        }


        allScenes.forEach((sceneName, index) => {

            //window.api.openProjector(sceneName); 

            console.log(`[RENDERER RENDER] Creazione pulsante per: ${sceneName} (Indice: ${index})`);

            const button = document.createElement('button');
            button.textContent = sceneName;
            button.classList.add('scene-btn');
            
            // Aggiungi classi di stato (Program/Preview) per lo styling
            let sceneClass = '';
            if (sceneName === currentProgramScene) {
                sceneClass = 'active-program';
            } else if (sceneName === currentPreviewScene) {
                sceneClass = 'active-preview';
            }
            // Applica la classe corretta
            if (sceneClass) {
                button.classList.add(sceneClass);
            }
            
            // Evento Click: Seleziona in Preview e apri Proiettore
            button.addEventListener('click', () => {
                if (!obsIsConnected) return; 
                
                console.log(`[RENDERER CLICK] Scena selezionata per Preview: ${sceneName}`);

                // 1. Aggiorna lo stato locale della Preview
                currentPreviewScene = sceneName;
                
                // 2. Ridisegna i pulsanti per aggiornare gli stati (essenziale per rimuovere la classe 'active-preview' dalla scena precedente)
                renderSceneButtons({ 
                    scenes: allScenes,
                    currentScene: currentProgramScene // Program non cambia al click in Preview
                });
                
                // 3. Aggiorna i display
                updateSceneDisplays(currentProgramScene, currentPreviewScene);
            });
            
            scenesListContainer.appendChild(button);
        });

        // Dopo il rendering, aggiorna i display
        updateSceneDisplays(currentProgramScene, currentPreviewScene);
    };

    const loadProjectorSources = async () => {
        // Pulisci i video precedenti
        projectorViewsContainer.innerHTML = '';
        
        const result = await window.api.getProjectorSources();
        
        if (!result.success || result.sources.length === 0) {
             projectorViewsContainer.innerHTML = '<p class="initial-message" style="text-align: center;">Nessun proiettore OBS trovato. Assicurati che siano aperti.</p>';
             console.warn('[RENDERER CAPTURER] Fallita cattura sorgenti o nessuna sorgente trovata.');
             return;
        }

        console.log(`[RENDERER CAPTURER] Trovati ${result.sources.length} proiettori. Avvio stream...`);

        // Per ogni fonte trovata (Proiettore)
        for (const source of result.sources) {
            try {
                // 1. Ottieni lo stream
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false, // Nessun audio per i proiettori
                    video: {
                        mandatory: {
                            // ID della fonte (finestra) ottenuto da desktopCapturer
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id, 
                            minWidth: 100,
                            maxWidth: 1920, // Max width for capture
                            minHeight: 100,
                            maxHeight: 1080
                        }
                    }
                });

                // 2. Crea l'elemento DOM (Contenitore + Titolo + Video)
                const card = document.createElement('div');
                card.classList.add('projector-card');
                
                const title = document.createElement('h3');
                title.textContent = source.name.replace(' - Proiettore', ''); // Pulisci il nome
                title.classList.add('projector-title');

                const video = document.createElement('video');
                video.autoplay = true;
                video.muted = true;
                video.classList.add('projector-video');
                
                // 3. Assegna lo stream al tag video
                video.srcObject = stream;

                // 4. Aggiungi alla card e al contenitore principale
                card.appendChild(title);
                card.appendChild(video);
                projectorViewsContainer.appendChild(card);
                
                console.log(`[RENDERER CAPTURER] Stream avviato per: ${source.name}`);

            } catch (error) {
                console.error(`[RENDERER CAPTURER] Errore nell'ottenere stream per ${source.name}:`, error);
            }
        }
    };
    
    // ----------------------------------------------------
    // 3. GESTIONE EVENTI FORM E REGIA
    // ----------------------------------------------------

    // Evento Click: Connetti
    connectButton.addEventListener('click', async () => {
        console.log('[RENDERER INIT] Click su connetti.');
        const config = {
            host: hostInput.value,
            port: parseInt(portInput.value, 10),
            password: passwordInput.value
        };
        
        // LOG INIZIALE
        console.log(`[RENDERER CONNECT] Tentativo di connessione con: ${config.host}:${config.port}`);

        updateStatus('In Connessione', 'In attesa di risposta da OBS...');
        connectButton.disabled = true;

        const result = await window.api.connectToObs(config);
        
        if (!result.success) {
            console.error(`[RENDERER CONNECT] Connessione fallita. Messaggio: ${result.message}`);
            updateStatus('Disconnesso', `Connessione fallita: ${result.message}`);
        } else {
            console.log(`[RENDERER CONNECT] Connessione riuscita.`);
            
        }
    });

    // ----------------------------------------------------
    // 4. SOTTOSCRIZIONE EVENTI (Feedback da Main Process)
    // ----------------------------------------------------
    
    // Inizializzazione degli ascoltatori di eventi
    window.api.onObsStatusUpdate(updateStatus);
    
    window.api.onSceneListUpdate((sceneData) => {
        
        console.log('[RENDERER IPC] Evento scena ricevuto dal Main Process.');
        // Il log dettagliato dei dati avviene all'interno di renderSceneButtons
        renderSceneButtons(sceneData);
        setTimeout(() => {
             console.log('[RENDERER CAPTURER] Tentativo di caricare le fonti dopo un ritardo (1500ms)...');
             loadProjectorSources(); 
        }, 1500);
    });
    console.log('[RENDERER INIT] Listeners IPC registrati.');
    // Stato iniziale
    updateStatus('Disconnesso', 'Premi "Connetti" per avviare la regia.');
});