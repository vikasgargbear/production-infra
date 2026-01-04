const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process
// to communicate with the main process
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  database: {
    query: (operation, data) => ipcRenderer.invoke('database-operation', operation, data)
  },

  // Sync operations
  sync: {
    syncData: () => ipcRenderer.invoke('sync-request'),
    onSyncUpdate: (callback) => ipcRenderer.on('sync-update', callback)
  },

  // Network status
  network: {
    checkOnlineStatus: () => ipcRenderer.invoke('check-online-status'),
    onStatusChange: (callback) => ipcRenderer.on('network-status-changed', callback)
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    getConfig: () => ipcRenderer.invoke('get-app-config')
  },

  // File operations
  file: {
    saveReport: (data, filename) => ipcRenderer.invoke('save-file', data, filename),
    openFile: () => ipcRenderer.invoke('open-file-dialog')
  },

  // Printing
  print: {
    printInvoice: (invoiceData) => ipcRenderer.invoke('print-invoice', invoiceData),
    printReport: (reportData) => ipcRenderer.invoke('print-report', reportData)
  }
});

// Handle sync events from main process
ipcRenderer.on('sync-data', () => {
  // Notify the React app to start syncing
  window.postMessage({ type: 'SYNC_INITIATED' }, '*');
});