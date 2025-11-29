// main.js (aggiornato)
const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const OBSWebSocket = require('obs-websocket-js').default;
const obs = new OBSWebSocket();

// Stato locale della connessione
let obsConnected = false;
let mainWindow = null;
let debugMode = false;

function createWindow () {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 1200,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');
    if (debugMode) mainWindow.webContents.openDevTools();
}

// Helper: invia stato al renderer
function sendStatus(status, message) {
    obsConnected = status === 'Connesso';
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('obs:statusUpdate', status, message);
    }
}

// =================================================================
//  GESTIONE EVENTI OBS E DEBUGGING
// =================================================================

obs.on('debug', ({ type, data }) => {
    console.log(`[OBS-DEBUG] Tipo: ${type}`, data);
});

// Quando connection closed (gestiamo diversi nomi di evento a seconda della versione)
obs.on('ConnectionClosed', () => {
    obsConnected = false;
    sendStatus('Disconnesso', 'Connessione WebSocket chiusa.');
    console.log('[OBS] ConnectionClosed ricevuto.');
});
obs.on('Close', () => {
    obsConnected = false;
    sendStatus('Disconnesso', 'OBS Studio si è disconnesso (server chiuso o rete interrotta).');
    console.log('[OBS] Close ricevuto.');
});

// Eventi OBS più utili: inoltra al renderer
obs.on('CurrentProgramSceneChanged', (data) => {
    console.log('[OBS EVENT] CurrentProgramSceneChanged', data);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('obs:programSceneChanged', data.sceneName);
    }
});

obs.on('CurrentPreviewSceneChanged', (data) => {
    console.log('[OBS EVENT] CurrentPreviewSceneChanged', data);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('obs:previewSceneChanged', data.sceneName);
    }
});

obs.on('SceneListChanged', async () => {
    console.log('[OBS EVENT] SceneListChanged - richiedo nuovi dati');
    // Aggiorna la lista scene al renderer
    await handleGetSceneList();
});

// =================================================================
//  HANDLER IPC / FUNZIONI di utilità per OBS
// =================================================================

ipcMain.handle('obs:connect', async (event, config) => {
    console.log(`[MAIN] Tentativo di connessione con config: ${JSON.stringify(config)}`);
    sendStatus('Connessione...', `Tentativo di connessione a ${config.host}:${config.port}...`);

    try {
        if (obsConnected) {
            await obs.disconnect();
        }

        const wsAddress = `ws://${config.host}:${config.port}`;
        const wsPwd = config.password;

        console.log(`[MAIN] Connettendo a ${wsAddress}`);
        await obs.connect(wsAddress, wsPwd);

        obsConnected = true;
        sendStatus('Connesso', 'Connessione stabilita con OBS Studio.');
        console.log('[MAIN] Connesso a OBS Studio');

        // Recupera e invia lista scene
        await handleGetSceneList();

        return { success: true };
    } catch (error) {
        console.error('[MAIN] Errore di Connessione/Autenticazione:', error && error.message ? error.message : error);
        sendStatus('Disconnesso', `ERRORE: ${error && error.message ? error.message : String(error)}. Verifica i parametri.`);
        return { success: false, message: error && error.message ? error.message : String(error) };
    }
});

ipcMain.handle('obs:disconnect', async () => {
    try {
        if (obsConnected) {
            await obs.disconnect();
            obsConnected = false;
        }
        sendStatus('Disconnesso', 'Disconnesso da OBS Studio.');
        return { success: true };
    } catch (error) {
        console.error('[MAIN] Errore durante la disconnessione:', error);
        sendStatus('Errore', 'Errore durante la disconnessione forzata.');
        return { success: false, message: error && error.message ? error.message : String(error) };
    }
});

// Richiesta elenco scene
async function handleGetSceneList() {
    if (!obsConnected) {
        sendStatus('Disconnesso', 'Non connesso. Impossibile caricare le scene.');
        console.warn('[MAIN SCENE] OBS non connesso.');
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('obs:sceneList', { currentScene: null, scenes: [] });
        }
        return { currentScene: null, scenes: [] };
    }

    try {
        // GetSceneList è il nome della request nel protocollo v5
        const resp = await obs.call('GetSceneList');
        const currentProgramSceneName = resp.currentProgramSceneName || resp.currentScene || null;
        const currentPreviewSceneName = resp.currentPreviewSceneName || null;
        const scenes = resp.scenes || [];
        const sceneNames = scenes.map(s => s.sceneName);

        const sceneDataToSend = {
            currentScene: currentProgramSceneName,
            previewScene: currentPreviewSceneName,
            scenes: sceneNames
        };

        console.log('[MAIN SCENE] Dati ricevuti da OBS:', sceneDataToSend);

        // Apri proiettori (opzionale — evita in ambienti con molte scene se non vuoi numerose finestre)
        try {
            handleOpenAllProjectors(sceneNames);
        } catch (err) {
            console.warn('[MAIN PROJECTOR] Errore nell’apertura automatica dei proiettori:', err);
        }

        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('obs:sceneList', sceneDataToSend);
        }
        return sceneDataToSend;

    } catch (error) {
        console.error('[MAIN SCENE] Errore GetSceneList:', error);
        sendStatus('Errore', 'Impossibile recuperare le scene da OBS. Riprova la connessione.');
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('obs:sceneList', { currentScene: null, scenes: [] });
        }
        return { currentScene: null, scenes: [] };
    }
}

// Espongo handler per chiamare GetSceneList dall'IPC
ipcMain.handle('obs:getSceneList', handleGetSceneList);

// Apertura dei proiettori (Program / Preview / singole scene)
async function handleOpenAllProjectors(sceneNames = []) {
    if (!obsConnected) return;

    // Apri Program
    try {
        await obs.call('OpenVideoMixProjector', {
            videoMixType: 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM',
            monitorIndex: -1
        });
        console.log('[MAIN PROJECTOR] Proiettore Programma aperto.');
    } catch (error) {
        console.warn('[MAIN PROJECTOR] Impossibile aprire Program projector:', error && error.message ? error.message : error);
    }

    // Apri Preview
    let studioStatus = { studioModeEnabled: false };

    try {
        studioStatus = await obs.call('GetStudioModeEnabled');
    } catch (e) {
        console.warn('[MAIN] Impossibile ottenere studio mode status:', e?.message || e);
    }

    console.log('Studio Mode status:', studioStatus);

    try {
        await obs.call('OpenVideoMixProjector', {
            videoMixType: 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PREVIEW',
            monitorIndex: -1
        });
        console.log('[MAIN PROJECTOR] Proiettore Anteprima aperto.');
    } catch (error) {
        console.warn('[MAIN PROJECTOR] Impossibile aprire Preview projector:', error && error.message ? error.message : error);
    }

    // Apri singole scene (opzionale; può generare molte finestre)
    for (const sceneName of sceneNames) {
        try {
            await obs.call('OpenSourceProjector', {
                sourceName: sceneName,
                monitorIndex: -1
            });
        } catch (error) {
            console.warn(`[MAIN PROJECTOR] Errore apertura proiettore per ${sceneName}:`, error && error.message ? error.message : error);
        }
    }
}

// Handler per aprire singolo proiettore (chiamabile dal renderer)
ipcMain.handle('obs:openProjector', async (_, sceneName) => {
    if (!obsConnected) return { success: false, message: 'OBS non connesso' };
    try {
        await obs.call('OpenSourceProjector', {
            sourceName: sceneName,
            monitorIndex: -1
        });
        return { success: true };
    } catch (error) {
        console.error('[MAIN] Errore openProjector:', error);
        return { success: false, message: error && error.message ? error.message : String(error) };
    }
});

// Request per impostare la scena di Preview
ipcMain.handle('obs:setPreviewScene', async (_, sceneName) => {
    if (!obsConnected) return { success: false, message: 'OBS non connesso' };
    try {
        await obs.call('SetCurrentPreviewScene', { sceneName });
        return { success: true };
    } catch (error) {
        console.error('[MAIN] Errore SetCurrentPreviewScene:', error);
        return { success: false, message: error && error.message ? error.message : String(error) };
    }
});

// Request per impostare la scena di Program (diretta)
ipcMain.handle('obs:setProgramScene', async (_, sceneName) => {
    if (!obsConnected) return { success: false, message: 'OBS non connesso' };
    try {
        // Se la Studio Mode è attiva, si dovrebbe impostare la preview e poi triggerare la transizione.
        // Qui usiamo SetCurrentProgramScene direttamente (funziona anche se Studio Mode non è presente).
        await obs.call('SetCurrentProgramScene', { sceneName });
        return { success: true };
    } catch (error) {
        console.error('[MAIN] Errore SetCurrentProgramScene:', error);
        return { success: false, message: error && error.message ? error.message : String(error) };
    }
});

// Request per effettuare la transizione Preview -> Program
ipcMain.handle('obs:transition', async (_, previewSceneName) => {
    if (!obsConnected) return { success: false, message: 'OBS non connesso' };

    try {
        // Verifica se Studio Mode è attivo
        let studioStatus = { studioModeEnabled: false };

        try {
            studioStatus = await obs.call('GetStudioModeEnabled');
        } catch (e) {
            console.warn('[MAIN] Impossibile ottenere studio mode status:', e?.message || e);
        }

        console.log('Studio Mode status:', studioStatus);

        if (studioStatus && studioStatus.studioModeEnabled) {
            // Se Studio Mode attivo, il comando TriggerStudioModeTransition esegue la transizione tra Preview e Program
            try {
                await obs.call('TriggerStudioModeTransition');
                console.log(`Transizione Studio Mode`);
                return { success: true };
            } catch (err) {
                console.warn('[MAIN] TriggerStudioModeTransition fallito, proverò a impostare Program direttamente:', err);
                // fallback
                await obs.call('SetCurrentProgramScene', { sceneName: previewSceneName });
                return { success: true, fallback: true };
            }
        } else {
            // Studio mode non attivo -> imposta direttamente la scena Program
            await obs.call('SetCurrentProgramScene', { sceneName: previewSceneName });
            return { success: true };
        }
    } catch (error) {
        console.error('[MAIN] Errore durante la transizione:', error);
        return { success: false, message: error && error.message ? error.message : String(error) };
    }
});

ipcMain.handle('obs:setTransition', async (_, transitionName) => {
    if (!obsConnected) return { success: false, message: "OBS non connesso" };

    try {
        await obs.call('SetCurrentSceneTransition', { transitionName });
        console.log(`[MAIN] Transizione impostata: ${transitionName}`);
        return { success: true };
    } catch (error) {
        console.error("[MAIN] Errore SetCurrentSceneTransition:", error);
        return { success: false, message: error?.message || String(error) };
    }
});

ipcMain.handle('obs:getTransitions', async () => {
    if (!obsConnected) return { success: false, transitions: [] };

    try {
        const list = await obs.call('GetSceneTransitionList');
        return { success: true, transitions: list.transitions };
    } catch (error) {
        console.error('Errore GetSceneTransitionList:', error);
        return { success: false, transitions: [] };
    }
});

// =================================================================
//  desktopCapturer: ricerca proiettori OBS (più robusta / multi-lingua)
// =================================================================

ipcMain.handle('obs:getProjectorSources', async () => {
    try {
        console.log('[MAIN CAPTURER] Richiesta fonti desktopCapturer...');
        const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });

        // Cerca parole chiave comuni per i proiettori (multi-lingua)
        const projectorRegex = /(projector|proiettore|proyector|proyector|projector - source|sorgente|source:)/i;

        const obsProjectors = sources
            .filter(s => projectorRegex.test(s.name))
            .map(s => ({ id: s.id, name: s.name }));

        console.log(`[MAIN CAPTURER] Proiettori trovati: ${obsProjectors.length}`);
        return { success: true, sources: obsProjectors };
    } catch (error) {
        console.error('[MAIN CAPTURER] Errore desktopCapturer:', error);
        return { success: false, message: error && error.message ? error.message : String(error) };
    }
});



// =================================================================
//  AVVIO ELECTRON
// =================================================================

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
