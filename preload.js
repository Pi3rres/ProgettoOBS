// preload.js (aggiornato)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Connessione / Disconnessione
    connectToObs: (config) => ipcRenderer.invoke('obs:connect', config),
    disconnectObs: () => ipcRenderer.invoke('obs:disconnect'),

    // Scene / Projectors
    getSceneList: () => ipcRenderer.invoke('obs:getSceneList'),
    getProjectorSources: () => ipcRenderer.invoke('obs:getProjectorSources'),
    openProjector: (sceneName) => ipcRenderer.invoke('obs:openProjector', sceneName),

    // Controlli regia
    doTransition: (previewSceneName) => ipcRenderer.invoke('obs:transition', previewSceneName),
    setPreviewScene: (sceneName) => ipcRenderer.invoke('obs:setPreviewScene', sceneName),
    setProgramScene: (sceneName) => ipcRenderer.invoke('obs:setProgramScene', sceneName),
    setTransition: (transitionName) => ipcRenderer.invoke('obs:setTransition', transitionName),
    getTransitions: () => ipcRenderer.invoke('obs:getTransitions'),

    // Event listeners (dal main -> renderer)
    onObsStatusUpdate: (callback) => {
        ipcRenderer.removeAllListeners('obs:statusUpdate');
        ipcRenderer.on('obs:statusUpdate', (event, status, message) => callback(status, message));
    },

    onSceneListUpdate: (callback) => {
        ipcRenderer.removeAllListeners('obs:sceneList');
        ipcRenderer.on('obs:sceneList', (event, sceneData) => callback(sceneData));
    },

    onProgramSceneChanged: (callback) => {
        ipcRenderer.removeAllListeners('obs:programSceneChanged');
        ipcRenderer.on('obs:programSceneChanged', (event, sceneName) => callback(sceneName));
    },

    onPreviewSceneChanged: (callback) => {
        ipcRenderer.removeAllListeners('obs:previewSceneChanged');
        ipcRenderer.on('obs:previewSceneChanged', (event, sceneName) => callback(sceneName));
    }
});
