const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lofi', {
  getLives: (force) => ipcRenderer.invoke('lives:get', force),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  resetPosition: () => ipcRenderer.invoke('window:resetPosition'),
  reportState: (state) => ipcRenderer.send('player:state', state),
  hide: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('app:quit'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onCommand: (cb) => ipcRenderer.on('command', (_e, name, arg) => cb(name, arg)),
  onShown: (cb) => ipcRenderer.on('window:shown', () => cb()),
  onLivesUpdated: (cb) => ipcRenderer.on('lives:updated', (_e, res) => cb(res)),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
});
