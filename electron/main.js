const { app, BrowserWindow, Tray, nativeImage, screen, shell, globalShortcut, Menu, Notification, protocol, net, ipcMain } = require("electron")
const path = require("path")
const fs = require("fs")
const { spawn } = require("child_process")
const WebSocket = require("ws")

let mainWindow
let tray
let bridgeProcess
let bridgeWs
let overlayWindow = null

const BRIDGE_PORT = 8643
const DEV_PORT = 3001
const IS_DEV = process.env.NODE_ENV !== "production"
const LOG_FILE = path.join(__dirname, "..", "electron-debug.log")

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFileSync(LOG_FILE, line)
  console.log(msg)
}

log("[iris] Starting Iris Electron app")
log("[iris] IS_DEV: " + IS_DEV)

// ─── Computer Use Overlay ───
function createOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return
  const { width, height } = screen.getPrimaryDisplay().bounds
  overlayWindow = new BrowserWindow({
    x: 0, y: 0, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    type: "panel",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.loadURL(`data:text/html,${encodeURIComponent(`<!DOCTYPE html>
<html><body style="margin:0;overflow:hidden">
<div style="position:fixed;inset:0;border:3px solid rgba(91,246,200,0.5);box-shadow:inset 0 0 60px rgba(91,246,200,0.08);border-radius:12px;pointer-events:none;animation:pulse 2.5s ease-in-out infinite"></div>
<div style="position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);padding:5px 16px;border-radius:20px;border:1px solid rgba(91,246,200,0.3);font-family:-apple-system,sans-serif;font-size:12px;font-weight:500;color:rgba(91,246,200,0.9);pointer-events:none;display:flex;align-items:center;gap:6px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(91,246,200,0.8);animation:dotpulse 1.5s ease-in-out infinite"></span>
Iris has control
</div>
<style>
@keyframes pulse{0%,100%{border-color:rgba(91,246,200,0.5);box-shadow:inset 0 0 60px rgba(91,246,200,0.08)}50%{border-color:rgba(91,246,200,0.2);box-shadow:inset 0 0 30px rgba(91,246,200,0.03)}}
@keyframes dotpulse{0%,100%{opacity:1}50%{opacity:0.3}}
</style>
</body></html>`)}`)

  // Register Escape kill switch only while overlay is active
  globalShortcut.register("Escape", () => {
    if (overlayWindow) {
      destroyOverlay()
      // Send cancel to bridge
      if (bridgeWs && bridgeWs.readyState === WebSocket.OPEN) {
        bridgeWs.send(JSON.stringify({ action: "cancel_response", session_id: "default" }))
      }
    }
  })
}

function destroyOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
  }
  overlayWindow = null
  // Unregister Escape so it doesn't permanently capture the key
  globalShortcut.unregister("Escape")
}

// ─── Bridge ───
function startBridge() {
  // Check if bridge is already running on the port
  const http = require("http")
  const req = http.get(`http://localhost:${BRIDGE_PORT}/health`, (res) => {
    log("[iris] Bridge already running on port " + BRIDGE_PORT + ", skipping spawn")
  })
  req.on("error", () => {
    // Not running — start it
    const isWin = process.platform === "win32"
    const hermesDir = isWin
      ? path.join(process.env.LOCALAPPDATA || path.join(require("os").homedir(), "AppData", "Local"), "hermes-agent")
      : "/tmp/hermes-agent"
    const pythonPath = isWin
      ? path.join(hermesDir, "venv", "Scripts", "python.exe")
      : path.join(hermesDir, "venv", "bin", "python")
    const bridgePath = path.join(__dirname, "..", "bridge", "server.py")

    log("[iris] Starting bridge:", pythonPath, bridgePath)

    bridgeProcess = spawn(pythonPath, [bridgePath], {
      stdio: "pipe",
      env: { ...process.env, IRIS_BRIDGE_PORT: String(BRIDGE_PORT) },
    })

    bridgeProcess.stdout.on("data", (data) => {
      log(`[bridge] ${data.toString().trim()}`)
    })

    bridgeProcess.stderr.on("data", (data) => {
      log(`[bridge] err: ${data.toString().trim()}`)
    })

    bridgeProcess.on("close", (code) => {
      log(`[bridge] exited with code ${code}`)
    })
  })
  req.setTimeout(2000, () => { req.destroy() })
}

// ─── Tray icon ───
function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none">
      <path d="M2.5 12C2.5 12 6 6.5 12 6.5C18 6.5 21.5 12 21.5 12C21.5 12 18 17.5 12 17.5C6 17.5 2.5 12 2.5 12Z" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="white" stroke-width="1.8"/>
      <circle cx="12" cy="12" r="1" fill="white"/>
    </svg>
  `.trim()

  const img = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  )
  img.setTemplateImage(true)
  return img
}

// ─── Main Window ───
async function createWindow() {
  log("[iris] Creating BrowserWindow")

  const isMac = process.platform === "darwin"
  const isWin = process.platform === "win32"

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0C0C0E",
    ...(isMac
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } }
      : { titleBarStyle: "hidden", titleBarOverlay: { color: "#0C0C0E", symbolColor: "#888", height: 36 } }),
    icon: path.join(__dirname, isMac ? "icon.icns" : "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  })

  // Try: 1) dev server, 2) bridge static serving, 3) iris:// protocol
  const devUrl = `http://localhost:${DEV_PORT}`
  const bridgeUrl = `http://localhost:${BRIDGE_PORT}`
  const prodUrl = "iris://app/"

  const checkUrl = (url) => new Promise((resolve) => {
    const http = require("http")
    const req = http.get(url, () => resolve(true))
    req.on("error", () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })

  let loadUrl
  if (await checkUrl(devUrl)) {
    loadUrl = devUrl
    log("[iris] Loading dev server:", devUrl)
  } else if (await checkUrl(bridgeUrl)) {
    loadUrl = bridgeUrl
    log("[iris] Loading from bridge:", bridgeUrl)
  } else {
    loadUrl = prodUrl
    log("[iris] Loading static export via iris:// protocol")
  }

  const loadPromise = mainWindow.loadURL(loadUrl)

  loadPromise.then(() => {
    log("[iris] URL loaded successfully")
    mainWindow.show()
    mainWindow.focus()
  }).catch((err) => {
    log("[iris] ERROR: Failed to load URL:", err.message)
    mainWindow.show()
    mainWindow.loadURL(`data:text/html,<html><body style="background:#0C0C0E;color:white;font-family:sans-serif;padding:40px"><h2>Iris failed to load</h2><p>${err.message}</p><p>Make sure dev server is running on port ${DEV_PORT}</p></body></html>`)
  })

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    log("[iris] ERROR: did-fail-load:", errorCode, errorDescription)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

// ─── IPC: Window resize from renderer ───
ipcMain.on("resize-window", (event, deltaWidth) => {
  if (!mainWindow) return
  const [w, h] = mainWindow.getSize()
  const newWidth = Math.max(800, w + deltaWidth)
  mainWindow.setSize(newWidth, h, false)
})

// ─── Custom protocol for serving static files in production ───
// This lets file:// work with absolute /_next/ paths
protocol.registerSchemesAsPrivileged([
  { scheme: "iris", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

// ─── App lifecycle ───
app.whenReady().then(() => {
  log("[iris] App ready")

  // Register custom protocol to serve from out/ directory
  const outDir = path.join(__dirname, "..", "out")
  protocol.handle("iris", (request) => {
    const url = new URL(request.url)
    let filePath = path.join(outDir, url.pathname === "/" ? "index.html" : url.pathname)
    // Strip query params from path
    filePath = filePath.split("?")[0]
    return net.fetch("file://" + filePath)
  })

  startBridge()

  // Tray icon (use .icns for tray as well)
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, "icon.icns")).resize({ width: 22, height: 22 })
  trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip("Iris — Hermes Agent")

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    } else {
      createWindow()
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Iris", click: () => { if (mainWindow) mainWindow.show(); else createWindow() } },
    { type: "separator" },
    { label: "Quit Iris", click: () => { app.isQuitting = true; app.quit() } },
  ])
  tray.on("right-click", () => tray.popUpContextMenu(contextMenu))

  // Global hotkey
  globalShortcut.register("Control+Shift+I", () => {
    if (mainWindow) { mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show() }
    else createWindow()
  })

  setTimeout(createWindow, 1500)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (bridgeProcess) bridgeProcess.kill()
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  app.isQuitting = true
  if (bridgeProcess) bridgeProcess.kill()
  if (bridgeWs) bridgeWs.close()
  globalShortcut.unregisterAll()
})

// ─── Bridge WebSocket for notifications ───
function connectBridgeWs() {
  const wsUrl = `ws://localhost:${BRIDGE_PORT}/ws`
  try {
    bridgeWs = new WebSocket(wsUrl)
  } catch (err) {
    log("[ws] Failed to create WebSocket: " + err.message)
    scheduleReconnect()
    return
  }

  bridgeWs.on("open", () => {
    log("[ws] Connected to bridge for notifications")
  })

  bridgeWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      handleBridgeEvent(msg)
    } catch (err) {
      log("[ws] Failed to parse message: " + err.message)
    }
  })

  bridgeWs.on("close", () => {
    log("[ws] Bridge connection closed, will reconnect")
    scheduleReconnect()
  })

  bridgeWs.on("error", (err) => {
    log("[ws] WebSocket error: " + err.message)
  })
}

function scheduleReconnect() {
  setTimeout(() => {
    if (!app.isQuitting) connectBridgeWs()
  }, 5000)
}

function handleBridgeEvent(msg) {
  // ─── Computer Use Overlay triggers ───
  if (msg.type === "tool.started") {
    const toolName = (msg.tool_name || msg.name || "").toLowerCase()
    if (toolName.includes("computer_use") || toolName.includes("computer") || toolName.includes("screenshot")) {
      createOverlay()
    }
  }
  if (msg.type === "response.completed" || msg.type === "response.cancelled" || msg.type === "response.error") {
    destroyOverlay()
  }

  // Only show notifications when the window is NOT focused
  if (mainWindow && mainWindow.isFocused()) return

  let title = null
  let body = null

  if (msg.type === "response.completed" || msg.event === "response.completed") {
    title = "Hermes finished"
    const text = msg.response || msg.text || msg.data || ""
    body = typeof text === "string" ? text.slice(0, 80) : JSON.stringify(text).slice(0, 80)
  } else if (msg.type === "response.error" || msg.event === "response.error") {
    title = "Hermes error"
    body = msg.error || msg.message || msg.text || "Unknown error"
  } else if (msg.kind === "approval") {
    title = "Approval needed"
    body = msg.summary || msg.message || msg.text || "Action requires approval"
  }

  if (title && Notification.isSupported()) {
    const notification = new Notification({
      title,
      body: typeof body === "string" ? body : String(body),
      icon: path.join(__dirname, "icon.icns"),
    })
    notification.on("click", () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      } else {
        createWindow()
      }
    })
    notification.show()
    log(`[notify] ${title}: ${body}`)
  }
}

// Start WebSocket connection after a delay to let the bridge start
setTimeout(connectBridgeWs, 3000)
