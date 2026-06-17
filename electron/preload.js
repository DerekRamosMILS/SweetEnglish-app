'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sweetEnglish', {
  versions: {
    node:     process.versions.node,
    chrome:   process.versions.chrome,
    electron: process.versions.electron,
  },
  // Silent auto-backup of the full learner snapshot to a file in userData.
  backupSave: (json) => ipcRenderer.invoke('backup:save', json),
  backupList: ()     => ipcRenderer.invoke('backup:list'),
  backupRead: (name) => ipcRenderer.invoke('backup:read', name),
});
