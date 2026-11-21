// The bridge the start screen and the studio use to call app window operations. Results come back as { ok } or { error }.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('threeStage', {
  recent: () => ipcRenderer.invoke('stage:recent'),
  defaultLocation: () => ipcRenderer.invoke('stage:default-location'),
  pickFolder: (defaultPath) => ipcRenderer.invoke('stage:pick-folder', defaultPath),
  create: (location, name, template) => ipcRenderer.invoke('stage:create', location, name, template),
  open: (dir) => ipcRenderer.invoke('stage:open', dir),
  openDialog: () => ipcRenderer.invoke('stage:open-dialog'),
  forget: (dir) => ipcRenderer.invoke('stage:forget', dir),
  home: () => ipcRenderer.invoke('stage:home'),
});
