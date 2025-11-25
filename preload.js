const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // 
    connectToObs: (config) => ipcRenderer.invoke('obs:connect', config),
    disconnectObs: () => ipcRenderer.invoke('obs:disconnect'),

    
    getSceneList: () => ipcRenderer.invoke('obs:getSceneList'),
    
    openProjector: (sceneName) => ipcRenderer.invoke('obs:openProjector', sceneName),

    onObsStatusUpdate: (callback) => ipcRenderer.on('obs:statusUpdate', (event, ...args) => callback(...args)),
    onSceneListUpdate: (callback) => {
        ipcRenderer.removeAllListeners('obs:sceneList'); 
        ipcRenderer.on('obs:sceneList', (event, sceneData) => callback(sceneData));
    },
    
    getProjectorSources: () => ipcRenderer.invoke('obs:getProjectorSources'),
    
   
});