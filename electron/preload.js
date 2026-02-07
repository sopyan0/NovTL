
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('novtlAPI', {
    write: (filename, content) => ipcRenderer.invoke('fs-write', { filename, content }),
    read: (filename) => ipcRenderer.invoke('fs-read', { filename }),
    list: (folder) => ipcRenderer.invoke('fs-list', { folder }),
    delete: (filename) => ipcRenderer.invoke('fs-delete', { filename }),
    getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
    readClipboard: () => ipcRenderer.invoke('clipboard-read'),
    platform: 'electron'
});
