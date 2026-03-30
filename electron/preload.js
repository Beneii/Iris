const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  resizeWindow: (deltaWidth) => ipcRenderer.send("resize-window", deltaWidth),
  getProviderUsage: () => ipcRenderer.invoke("get-provider-usage"),
})
