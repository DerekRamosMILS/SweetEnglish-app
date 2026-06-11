'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('sweetEnglish', {
  versions: {
    node:     process.versions.node,
    chrome:   process.versions.chrome,
    electron: process.versions.electron,
  },
});
