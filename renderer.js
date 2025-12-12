document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------
    // 1. ELEMENTI DOM
    // ---------------------------------------
    const hostInput = document.getElementById('obs-host');
    const portInput = document.getElementById('obs-port');
    const passwordInput = document.getElementById('obs-password');
    const connectButton = document.getElementById('btn-connect');
    const statusElement = document.getElementById('status');
    const scenesListContainer = document.getElementById('scenes-container');
    const programSceneDisplay = document.getElementById('current-program-scene');
    const previewSceneDisplay = document.getElementById('current-preview-scene');
    const previewVideoContainer = document.getElementById('preview-video-container');
    const programVideoContainer = document.getElementById('program-video-container');
    const transitionButton = document.getElementById('btn-take');
    const cutButton = document.getElementById('btn-transition-cut');
    const fadeButton = document.getElementById('btn-transition-fade');
    const recButton = document.getElementById('btn-start-recording');
    const streamButton = document.getElementById('btn-start-stream');
    const camButton = document.getElementById('btn-virtual-cam');
    const recStatus = document.getElementById('recording-status');
    const streamStatus = document.getElementById('streaming-status');
    const camStatus = document.getElementById('cam-status');
    
    

    // Stato locale
    let obsIsConnected = false;
    let currentProgramScene = null;
    let currentPreviewScene = null;
    let currentTransition = "Dissolvenza"
    let allScenes = [];

    let recActive = false;
    let streamActive = false;
    let camActive = false;

    let sceneButtonsRendered = false;

    // Wrapper globale per tutte le piccole preview dei proiettori delle scene
    let projectorViewsContainer = scenesListContainer;

    // ---------------------------------------
    // 2. FUNZIONI STATO UI
    // ---------------------------------------
    const updateStatus = (status, message) => {
        obsIsConnected = status === 'Connesso';
        statusElement.textContent = `Stato Connessione: ${status} - ${message}`;

        if (status === 'Connesso') {
            statusElement.style.backgroundColor = '#28a745';
            (async () => {
                const result = await window.api.getTransitions();
                console.log("Transizioni disponibili:", result.transitions);
            })();
        } else if (status === 'Disconnesso') {
            statusElement.style.backgroundColor = '#dc3545';
            projectorViewsContainer.innerHTML = '<p  style="text-align:center;">Connettiti a OBS per avviare il monitoraggio dei proiettori.</p>';
        } else if (status === 'In Connessione') {
            statusElement.style.backgroundColor = '#ffc107';
        }

        connectButton.disabled = obsIsConnected;
        transitionButton.disabled = true;
        transitionButton.textContent = 'TAKE (Disabilitato)';
    };

    const updateSceneDisplays = (programSceneName, previewSceneName) => {
        //currentProgramScene = programSceneName;
        //currentPreviewScene = previewSceneName;

        programSceneDisplay.textContent = programSceneName || 'Nessuna';
        previewSceneDisplay.textContent = previewSceneName || (obsIsConnected ? 'Seleziona una Scena' : 'Disconnesso');

        const canTransition = obsIsConnected && programSceneName && previewSceneName && programSceneName !== previewSceneName;
        transitionButton.disabled = !canTransition;
        if (canTransition) {
            const trimmedSceneName = previewSceneName.length > 20 ? previewSceneName.substring(0,17)+'...' : previewSceneName;
            transitionButton.textContent = `TAKE`;
            transitionButton.style.backgroundColor = '#2ecc71';
        } else {
            transitionButton.textContent = 'TAKE (Disabilitato)';
            transitionButton.style.backgroundColor = '';
        }
    };

    // ---------------------------------------
    // 3. RENDERING SCENE
    // ---------------------------------------
    const renderSceneButtons = (sceneData) => {
        

        if (!sceneData || !sceneData.scenes || sceneData.scenes.length === 0) {
            allScenes = [];
            currentProgramScene = null;
            currentPreviewScene = null;
            updateSceneDisplays(null, null);

            scenesListContainer.innerHTML = obsIsConnected 
                ? '<p class="initial-message">Nessuna scena trovata in OBS.</p>'
                : '<p class="initial-message">Connettiti a OBS per caricare le scene.</p>';
            return;
        }

        allScenes = sceneData.scenes;
        currentProgramScene = sceneData.currentScene;
        currentPreviewScene = sceneData.previewScene;
        if (sceneButtonsRendered) {
            // Aggiorna evidenziazione Program/Preview senza ricreare nulla
            allScenes.forEach(sceneName => {
                const sceneId = sceneName.replace(/\s/g, '-');

                // Trova pulsanti relativi a questa scena
                const previewBtn = scenesListContainer.querySelector(
                    `#scene-projector-${sceneId} ~ .scene-button-group .scene-btn-preview`
                );
                const programBtn = scenesListContainer.querySelector(
                    `#scene-projector-${sceneId} ~ .scene-button-group .scene-btn-program`
                );

                if (!previewBtn || !programBtn) return;

                // Reset classi
                previewBtn.classList.remove('active-preview');
                programBtn.classList.remove('active-program');

                // Imposta classi per la scena giusta
                if (sceneName === currentProgramScene) {
                    programBtn.classList.add('active-program');
                } 
                if (sceneName === currentPreviewScene) {
                    previewBtn.classList.add('active-preview');
                }
            });

            return;
        }

        
        scenesListContainer.innerHTML = '';

        allScenes.forEach(sceneName => {
            const sceneItem = document.createElement('div');
            sceneItem.classList.add('scene-item');

            
            const sceneId = sceneName.replace(/\s/g, '-');


            // Nome della scena
            const sceneLabel = document.createElement('div');
            sceneLabel.classList.add('scene-name-display'); // puoi riusare la tua classe CSS
            sceneLabel.textContent = sceneName;

            // Wrapper proiettore
            const projectorView = document.createElement('div');
            projectorView.id = `scene-projector-${sceneId}`;
            projectorView.classList.add('small-projector-view');
            projectorView.innerHTML = '<p class="initial-message" style="padding:10px;font-size:0.9em;">Caricamento...</p>';

            // Wrapper pulsanti
            const buttonGroup = document.createElement('div');
            buttonGroup.classList.add('scene-button-group');

            // Pulsante Anteprima
            const previewBtn = document.createElement('button');
            previewBtn.textContent = 'Anteprima';
            previewBtn.classList.add('scene-btn', 'scene-btn-preview');

            // Pulsante Programma
            const programBtn = document.createElement('button');
            programBtn.textContent = 'Programma';
            programBtn.classList.add('scene-btn', 'scene-btn-program');

            // Evidenzia se scena è attiva
            if (sceneName === currentProgramScene) programBtn.classList.add('active-program');
            else if (sceneName === currentPreviewScene) previewBtn.classList.add('active-preview');

            
            previewBtn.addEventListener('click', async () => {
                if (currentPreviewScene === sceneName) return;

                const result = await window.api.setPreviewScene(sceneName);
                if (!result.success) return;

                // Aggiorna i dati locali
                currentPreviewScene = sceneName;

                // RICHIEDI SOLO L’AGGIORNAMENTO DELLA UI
                renderSceneButtons({
                    scenes: allScenes,
                    currentScene: currentProgramScene,
                    previewScene: currentPreviewScene
                });
            });
            
            

            programBtn.addEventListener('click', async () => {
                if (currentProgramScene === sceneName) return; 

                
                const result = await window.api.setProgramScene(sceneName);
                if (!result.success) {
                    console.error(`[ERROR] Impossibile mandare in Programma: ${sceneName}`);
                    return;
                }

                // Aggiorna i dati locali
                currentProgramScene = sceneName;

                // Aggiorna solo la UI, senza toccare i proiettori
                renderSceneButtons({
                    scenes: allScenes,
                    currentScene: currentProgramScene,
                    previewScene: currentPreviewScene
                });
            });

            // Aggiungi pulsanti al gruppo
            buttonGroup.appendChild(previewBtn);
            buttonGroup.appendChild(programBtn);

            // Aggiungi proiettore e pulsanti alla card della scena
            sceneItem.appendChild(sceneLabel);
            sceneItem.appendChild(projectorView);
            sceneItem.appendChild(buttonGroup);

            // Aggiungi la scena al container
            scenesListContainer.appendChild(sceneItem);
        });

        sceneButtonsRendered = true;

        updateSceneDisplays(currentProgramScene, currentPreviewScene);
    };

    // ---------------------------------------
    // 4. CATTURA PROIETTORI E POSIZIONAMENTO
    // ---------------------------------------
    const loadProjectorSources = async () => {
        previewVideoContainer.innerHTML = '<p class="initial-message">Anteprima Proiettore</p>';
        programVideoContainer.innerHTML = '<p class="initial-message">Programma Proiettore</p>';
        document.querySelectorAll('.small-projector-view').forEach(el => {
            el.innerHTML = '<p class="initial-message" style="padding:10px;font-size:0.9em;">Caricamento...</p>';
        });

        const result = await window.api.getProjectorSources();
        if (!result.success || result.sources.length === 0) {
            projectorViewsContainer.innerHTML = '<p class="initial-message" style="text-align:center;">Nessun proiettore OBS trovato. Assicurati che siano aperti.</p>';
            return;
        }

        for (const source of result.sources) {
            try {
                let targetContainer = null;
                const name = source.name.trim();
                const lower = name.toLowerCase();

                if (lower.includes('proiettore - programma')) targetContainer = programVideoContainer;
                else if (lower.includes('proiettore - anteprima')) targetContainer = previewVideoContainer;
                else if (lower.includes('proiettore - sorgente:')) {
                    const sceneName = name.split(':')[1].trim();
                    const sceneId = sceneName.replace(/\s/g, '-');
                    targetContainer = document.getElementById(`scene-projector-${sceneId}`);
                } else if (allScenes.some(s => name.includes(s))) {
                    const matched = allScenes.find(s => name.includes(s));
                    const sceneId = matched.replace(/\s/g, '-');
                    targetContainer = document.getElementById(`scene-projector-${sceneId}`);
                }

                if (!targetContainer) continue;

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio:false,
                    video:{
                        mandatory:{
                            chromeMediaSource:'desktop',
                            chromeMediaSourceId:source.id,
                            minWidth:100,
                            maxWidth:1920,
                            minHeight:100,
                            maxHeight:1080
                        }
                    }
                });

                const cropWrapper = document.createElement('div');
                cropWrapper.style.top = '0';
                cropWrapper.style.left = '0';
                cropWrapper.style.width = '100%';
                cropWrapper.style.height = '100%';         // prende tutta l’altezza del genitore 16:9
                cropWrapper.style.overflow = 'hidden';
                cropWrapper.style.display = 'flex';
                cropWrapper.style.justifyContent = 'center';
                cropWrapper.style.alignItems = 'center';
                const video = document.createElement('video');
                video.autoplay = true;
                video.muted = true;
                video.classList.add('projector-video');
                video.srcObject = stream;
                video.style.position = 'absolute';
                video.style.overflow= "hidden";
                video.style.top = '0';
                video.style.left = '50%';
                video.style.transform = 'translateX(-50%)';
                video.style.objectFit = 'cover';
                video.style.width = '100%';
                video.style.height = 'auto';

                video.onloadedmetadata = function() {
                    const W = video.videoWidth;
                    const H = video.videoHeight;
                    const H16_9 = W*(9/16);
                    const Htitle = H - H16_9;
                    if(Htitle>0) {
                        const perc = (Htitle/H16_9)*100;
                        video.style.transform = `translate(-50%, -${perc}%)`;
                    }
                };

                cropWrapper.appendChild(video);
                targetContainer.innerHTML = '';
                targetContainer.appendChild(cropWrapper);

            } catch (err) {
                console.error(`Errore cattura stream ${source.name}:`, err);
            }
        }
    };

    // ---------------------------------------
    // 5. EVENTI FORM
    // ---------------------------------------
    connectButton.addEventListener('click', async () => {
        const config = {
            host: hostInput.value,
            port: parseInt(portInput.value,10),
            password: passwordInput.value
        };
        updateStatus('In Connessione','In attesa di risposta da OBS...');
        connectButton.disabled = true;

        const result = await window.api.connectToObs(config);
        if(!result.success) updateStatus('Disconnesso', `Connessione fallita: ${result.message}`);
    });

    transitionButton.addEventListener('click', async () => {
        if(!obsIsConnected || !currentPreviewScene || currentPreviewScene===currentProgramScene) return;
        transitionButton.disabled=true;
        const result = await window.api.doTransition(currentPreviewScene);
        if(!result.success) transitionButton.disabled=false;
    });

    cutButton.addEventListener('click', async () => {
        if (currentTransition === "Taglio") return;
        
        const result = await window.api.setTransition("Taglio");
        if (!result.success) {
            console.error("[ERROR] Impossibile impostare transizione Taglio:", result.message);
            return;
        }


        cutButton.classList.add("active-mode");
        fadeButton.classList.remove("active-mode");

        currentTransition = "Taglio";
        console.log(`Current transition: ${currentTransition}`);
    });

    fadeButton.addEventListener('click', async () => {
        if (currentTransition === "Dissolvenza") return;

        const result = await window.api.setTransition("Dissolvenza");
        if (!result.success) {
            console.error("[ERROR] Impossibile impostare transizione Dissolvenza:", result.message);
            return;
        }

        fadeButton.classList.add("active-mode");
        cutButton.classList.remove("active-mode");

        currentTransition = "Dissolvenza";
        console.log(`Current transition: ${currentTransition}`);
    });

    recButton.addEventListener('click', async () => {
        if (!recActive) {
            const res = await window.api.startRecording();
            if (!res.success) return alert("Errore: " + res.error);
            recButton.classList.add("br-btn-active");
            recActive = true;
            recStatus.innerText="● REC attiva";
            recStatus.classList.add("status-indicator-on");
            recStatus.classList.remove("status-indicator-off");
        } else {

            const conferma = confirm("Stai per fermare la registrazione, sei sicuro?");
            if (!conferma) return;
            const res = await window.api.stopRecording();
            if (!res.success) return alert("Errore: " + res.error);
            recButton.classList.remove("br-btn-active");
            recActive = false;
            recStatus.innerText="● REC non attiva";
            recStatus.classList.add("status-indicator-off");
            recStatus.classList.remove("status-indicator-on");
        }
    });

    streamButton.addEventListener('click', async () => {
        if (!streamActive) {
            const res = await window.api.startStream();
            if (!res.success) return alert("Errore: " + res.error);
            streamButton.classList.add("br-btn-active");
            streamActive = true;
            streamStatus.innerText= "● stream attiva";
            streamStatus.classList.add("status-indicator-on");
            streamStatus.classList.remove("status-indicator-off");
        } else {
            const conferma = confirm("Stai per fermare lo streaming, sei sicuro?");
            if (!conferma) return;
            const res = await window.api.stopStream();
            if (!res.success) return alert("Errore: " + res.error);
            streamButton.classList.remove("br-btn-active");
            streamActive = false;
            streamStatus.innerText ="● stream non attiva";
            streamStatus.classList.add("status-indicator-off");
            streamStatus.classList.remove("status-indicator-on");
        }
    });

    camButton.addEventListener('click', async () => {
        if (!camActive) {
            const res = await window.api.startVirtualCam();
            if (!res.success) return alert("Errore: " + res.error);
            camButton.classList.add("br-btn-active");
            camActive = true;
            camStatus.innerText="● cam attiva";
            camStatus.classList.add("status-indicator-on");
            camStatus.classList.remove("status-indicator-off");
        } else {
            const conferma = confirm("Stai per fermare la cam virtuale, sei sicuro?");
            if (!conferma) return;
            const res = await window.api.stopVirtualCam();
            if (!res.success) return alert("Errore: " + res.error);
            camButton.classList.remove("br-btn-active");
            camActive = false;
            camStatus.innerText="● cam non attiva";
            camStatus.classList.add("status-indicator-off");
            camStatus.classList.remove("status-indicator-on");
        }
    });


    // ---------------------------------------
    // 6. EVENTI IPC
    // ---------------------------------------
    window.api.onObsStatusUpdate(updateStatus);

    window.api.onSceneListUpdate((sceneData)=>{
        renderSceneButtons(sceneData);
        setTimeout(loadProjectorSources,1500);
    });

    window.api.onProgramSceneChanged((newSceneName) => {
        currentProgramScene = newSceneName;

        renderSceneButtons({
            scenes: allScenes,
            currentScene: currentProgramScene,
            previewScene: currentPreviewScene
        });

        updateSceneDisplays(currentProgramScene, currentPreviewScene);
    });

    window.api.onPreviewSceneChanged((newSceneName) => {
        currentPreviewScene = newSceneName;

        renderSceneButtons({
            scenes: allScenes,
            currentScene: currentProgramScene,
            previewScene: currentPreviewScene
        });

        updateSceneDisplays(currentProgramScene, currentPreviewScene);
    });
    // Stato iniziale
    updateStatus('Disconnesso','Premi "Connetti" per avviare la regia.');
});
