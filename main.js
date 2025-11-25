const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const OBSWebSocket = require('obs-websocket-js').default;
const obs = new OBSWebSocket();

// Stato locale della connessione
let obsConnected = false;
let mainWindow; 

function createWindow () {
    // Crea la finestra del browser.
    mainWindow = new BrowserWindow({ 
        width: 1200,
        height: 800,
        webPreferences: {
            // Usa il file preload.js per il ponte IPC sicuro
            preload: path.join(__dirname, 'preload.js'), 
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Carica l'index.html
    mainWindow.loadFile('index.html');

    // Apre gli strumenti di sviluppo (devtools) per il debug
    mainWindow.webContents.openDevTools(); 
}

// Funzione helper per inviare lo stato della connessione al Renderer
function sendStatus(status, message) {
    obsConnected = status === 'Connesso';
    if (mainWindow) { 
        // mainWindow è ora accessibile grazie alla dichiarazione globale
        mainWindow.webContents.send('obs:statusUpdate', status, message);
    }
}

// =================================================================
//  GESTIONE EVENTI OBS E DEBUGGING
// =================================================================

// Log di debug della libreria obs-websocket-js
obs.on('debug', ({ type, data }) => {
    console.log(`[OBS-DEBUG] Tipo: ${type}`, data);
});

// Gestisce quando OBS si disconnette inaspettatamente (es. chiusura di OBS Studio)
obs.on('Close', () => {
    // Reimposta lo stato interno e notifica il frontend
    obsConnected = false;
    sendStatus('Disconnesso', 'OBS Studio si è disconnesso (server chiuso o rete interrotta).');
    console.log('OBS server connection closed.');
});

// =================================================================
//  GESTORI IPC
// =================================================================

// Gestore IPC: Connessione a OBS
ipcMain.handle('obs:connect', async (event, config) => {
    // Log esplicito dei parametri ricevuti dal frontend
    console.log(`[MAIN] Tentativo di connessione con config: ${JSON.stringify(config)}`);
    sendStatus('Connessione...', `Tentativo di connessione a ${config.host}:${config.port}...`);
    
    try {
        // Se già connessi, disconnetti prima
        if (obsConnected) {
            await obs.disconnect();
        }
        
        // Tentativo di connessione
        const wsAddress = `ws://${config.host}:${config.port}`;
        const wsPwd = config.password;
        console.log(`[MAIN] Indirizzo WebSocket costruito: ${wsAddress}`);
        // console.log(`[MAIN] PAssword WebSocket costruito: ${wsPwd}`);

        await obs.connect(wsAddress, wsPwd);
        
        sendStatus('Connesso', 'Connessione stabilita con OBS Studio.');
        console.log('[MAIN] Connesso a OBS Studio');
        
        // Appena connessi, recuperiamo la lista delle scene
        handleGetSceneList();

        return { success: true };
    } catch (error) {
        // Questo è il blocco più importante per il debug
        console.error('[MAIN] Errore di Connessione/Autenticazione:', error.message);
        
        // Invia l'errore esatto al frontend
        sendStatus('Disconnesso', `ERRORE: ${error.message}. Verifica i parametri.`);
        return { success: false, message: error.message };
    }
});

// Gestore IPC: Disconnessione da OBS
ipcMain.handle('obs:disconnect', async () => {
    if (!obsConnected) {
        return { success: true };
    }
    
    try {
        await obs.disconnect();
        sendStatus('Disconnesso', 'Disconnesso da OBS Studio.');
        return { success: true };
    } catch (error) {
        console.error('[MAIN] Errore durante la disconnessione:', error);
        sendStatus('Errore', 'Errore durante la disconnessione forzata.');
        return { success: false, message: error.message };
    }
});

// Apre i proiettori per tutte le scene, Programma e Anteprima
async function handleOpenAllProjectors(sceneNames) {
    if (!obsConnected) return;

    // 1. Apri il proiettore per la scena Programma (LIVE) usando OpenSourceProjector con il nome 'Program'
    try {
        await obs.call('OpenVideoMixProjector', {
            videoMixType: 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM',
            monitorIndex: -1  
         });
        //await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[MAIN PROJECTOR] Proiettore Programma aperto con successo.');
    } catch (error) {
        console.error(`[MAIN PROJECTOR] Errore nell'apertura Proiettore Programma: ${error.message}. Prova ad attivare la modalità Studio.`);
    }

    // 2. Apri il proiettore per la scena Anteprima (PREVIEW) usando OpenSourceProjector con il nome 'Preview'
    try {
        await obs.call('OpenVideoMixProjector', {
            videoMixType: 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PREVIEW',
            monitorIndex: -1 
        });
        //await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[MAIN PROJECTOR] Proiettore Anteprima aperto con successo.');
    } catch (error) {
        console.error(`[MAIN PROJECTOR] Errore nell'apertura Proiettore Anteprima: ${error.message}`);
    }

    // 3. Apri il proiettore per OGNI scena (come finestra di monitoraggio)
    console.log(`[MAIN PROJECTOR] Apertura di ${sceneNames.length} proiettori scena...`);
    for (const sceneName of sceneNames) {
        try {
            // OBS richiede di chiamare 'OpenSourceProjector' sul nome della scena
            await obs.call('OpenSourceProjector', {
                sourceName: sceneName,
                monitorIndex: -1 // -1 indica di aprire la finestra come floating window
            });
            //await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`[MAIN PROJECTOR] Errore nell'apertura proiettore per ${sceneName}: ${error.message}`);
        }
    }
    console.log('[MAIN PROJECTOR] Apertura di TUTTI i proiettori completata.');
}

// Gestore IPC: Richiesta elenco scene 
async function handleGetSceneList() {
    if (!obsConnected) {
        sendStatus('Disconnesso', 'Non connesso. Impossibile caricare le scene.');
        console.warn('[MAIN SCENE] Tentativo di recupero scene fallito: OBS non connesso.');
        return;
    }
    
    console.log('[MAIN SCENE] Richiesta GetSceneList a OBS API...');

    try {
        const { currentProgramSceneName, scenes } = await obs.call('GetSceneList');
        
        const sceneNames = scenes.map(s => s.sceneName);
        
        // Dati da inviare al Renderer
        const sceneDataToSend = {
             currentScene: currentProgramSceneName,
             scenes: sceneNames
        };
        
        console.log(`[MAIN SCENE] Dati ricevuti da OBS: Program='${currentProgramSceneName}', Totali=${sceneNames.length}`);
        
        // 💡 CHIAMATA: Apri tutti i proiettori subito dopo aver recuperato l'elenco delle scene
        handleOpenAllProjectors(sceneNames); 

        if (mainWindow) {
             // 💡 INVIA IL MESSAGGIO AL RENDERER
             mainWindow.webContents.send('obs:sceneList', sceneDataToSend);
             console.log('[MAIN SCENE] IPC "obs:sceneList" inviato con successo.');
        } else {
             console.error('[MAIN SCENE] Errore: mainWindow non definita. Impossibile inviare dati al Renderer.');
        }
        
        return sceneDataToSend;
        
    } catch (error) {
        console.error('[MAIN SCENE] Errore nel recupero dell\'elenco scene da OBS:', error);
        sendStatus('Errore', 'Impossibile recuperare le scene da OBS. Riprova la connessione.');
        return { currentScene: null, scenes: [] };
    }
}


// Gestore IPC: Richiesta elenco scene 
async function handleGetSceneList() {
    if (!obsConnected) {
        sendStatus('Disconnesso', 'Non connesso. Impossibile caricare le scene.');
        console.warn('[MAIN SCENE] Tentativo di recupero scene fallito: OBS non connesso.');
        return;
    }
    
    console.log('[MAIN SCENE] Richiesta GetSceneList a OBS API...');

    try {
        const { currentProgramSceneName, scenes } = await obs.call('GetSceneList');
        
        const sceneNames = scenes.map(s => s.sceneName);
        
        // Dati da inviare al Renderer
        const sceneDataToSend = {
             currentScene: currentProgramSceneName,
             scenes: sceneNames
        };
        
        console.log(`[MAIN SCENE] Dati ricevuti da OBS: Program='${currentProgramSceneName}', Totali=${sceneNames.length}`);
        console.log('[MAIN SCENE] Dati IPC pronti per l\'invio al Renderer:', sceneDataToSend);

        handleOpenAllProjectors(sceneNames); 

        if (mainWindow) {
             // 💡 INVIA IL MESSAGGIO AL RENDERER
             mainWindow.webContents.send('obs:sceneList', sceneDataToSend);
             console.log('[MAIN SCENE] IPC "obs:sceneList" inviato con successo.');
        } else {
             console.error('[MAIN SCENE] Errore: mainWindow non definita. Impossibile inviare dati al Renderer.');
        }
        
        return sceneDataToSend;
        
    } catch (error) {
        console.error('[MAIN SCENE] Errore nel recupero dell\'elenco scene da OBS:', error);
        sendStatus('Errore', 'Impossibile recuperare le scene da OBS. Riprova la connessione.');
        return { currentScene: null, scenes: [] };
    }
}
/*
// Gestore IPC: Apre un proiettore di scena su OBS (per l'anteprima)
ipcMain.handle('obs:openProjector', async (event, sceneName) => {
    if (!obsConnected) {
        return { success: false, message: 'Non connesso a OBS.' };
    }
    try {
        // OpenSourceProjector usa il nome della scena come nome della sorgente per aprire un proiettore dedicato.
        await obs.call('OpenSourceProjector', {
            sourceName: sceneName,
            monitorIndex: -1 // -1 indica di aprire la finestra come floating window (non su un monitor specifico)
        });
        console.log(`[MAIN] Proiettore aperto per la scena: ${sceneName}`);
        return { success: true };
    } catch (error) {
        console.error(`[MAIN] Errore nell'apertura del proiettore per ${sceneName}:`, error);
        return { success: false, message: `Errore proiettore: ${error.message}` };
    }
});*/

async function handleGetProjectorSources() {
    try {
        console.log('[MAIN CAPTURER] Richiesta fonti desktop capturer...');
        // Richiedi tutte le finestre
        const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });

        // Filtra le fonti: cerca i proiettori OBS. 
        // I titoli dei proiettori di scena, Anteprima e Programma contengono tipicamente "Projector"
        const obsProjectors = sources
            .filter(source => source.name.includes('Proiettore'))
            .map(source => ({
                id: source.id,
                name: source.name,
                //thumbnail: source.thumbnail.toDataURL() // Invia l'immagine in base64
            }));
            
        console.log(`[MAIN CAPTURER] Trovati ${obsProjectors.length} proiettori OBS.`);
        return { success: true, sources: obsProjectors };

    } catch (error) {
        console.error('[MAIN CAPTURER] Errore durante la cattura delle fonti:', error);
        return { success: false, message: error.message };
    }
}




// =================================================================
//  CICLO DI VITA DI ELECTRON E AVVIO
// =================================================================

ipcMain.handle('obs:getSceneList', handleGetSceneList);

ipcMain.handle('obs:getProjectorSources', handleGetProjectorSources); 

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});