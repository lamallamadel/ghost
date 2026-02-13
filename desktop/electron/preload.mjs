import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ghost', {
  repoSelect: () => ipcRenderer.invoke('repo.select'),
  repoValidate: (repoPath) => ipcRenderer.invoke('repo.validate', { repoPath }),
  commandRun: (req) => ipcRenderer.invoke('command.run', req),
  historyList: (req) => ipcRenderer.invoke('history.list', req),
  gitValidateBefore: (req) => ipcRenderer.invoke('git.validateBefore', req),
  gitExecute: (req) => ipcRenderer.invoke('git.execute', req),
  logsList: (req) => ipcRenderer.invoke('logs.list', req),
  logsExport: (req) => ipcRenderer.invoke('logs.export', req),
  appInfo: () => ipcRenderer.invoke('app.info'),
})

