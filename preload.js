const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (state) => ipcRenderer.invoke('save-data', state),
  exportData: (state) => ipcRenderer.invoke('export-data', state),
  importData: () => ipcRenderer.invoke('import-data'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  addAttachment: (taskId) => ipcRenderer.invoke('add-attachment', { taskId }),
  openAttachment: (filePath) => ipcRenderer.invoke('open-attachment', filePath),
  removeAttachment: (filePath) => ipcRenderer.invoke('remove-attachment', filePath)
});
