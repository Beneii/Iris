const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  resizeWindow: (deltaWidth) => ipcRenderer.send("resize-window", deltaWidth),
})
