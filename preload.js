const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ilha', {
  version: '0.1.4',
  setExpanded: (expanded) => ipcRenderer.send('island:expanded', Boolean(expanded)),
  hideIsland: () => ipcRenderer.send('island:hide'),
  restoreIsland: () => ipcRenderer.send('island:restore'),
  quitApp: () => ipcRenderer.send('app:quit'),
  notify: (title, body) => ipcRenderer.send('island:notify', { title, body }),
  spotifySettings: () => ipcRenderer.invoke('spotify:settings'),
  spotifyConnect: (clientId) => ipcRenderer.invoke('spotify:connect', clientId),
  spotifyCurrent: () => ipcRenderer.invoke('spotify:current'),
  spotifyControl: (action) => ipcRenderer.invoke('spotify:control', action),
  spotifyDisconnect: () => ipcRenderer.invoke('spotify:disconnect'),
  notificationSettings: () => ipcRenderer.invoke('notifications:settings'),
  configureNotifications: (preferences) =>
    ipcRenderer.invoke('notifications:configure', preferences),
  activateNotifications: () => ipcRenderer.invoke('notifications:activate'),
  onNotification: (callback) => {
    const listener = (_event, notification) => callback(notification);
    ipcRenderer.on('notifications:incoming', listener);
    return () => ipcRenderer.removeListener('notifications:incoming', listener);
  },
  onNotificationStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('notifications:status', listener);
    return () => ipcRenderer.removeListener('notifications:status', listener);
  },
});
