const { app, BrowserWindow, Menu, Tray, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object
let mainWindow;
let backendProcess;
let tray;

// Configuration
const config = {
  backendPort: 8000,
  frontendPort: 3000,
  isDev: process.env.NODE_ENV === 'development',
  appName: 'Pharma ERP',
  version: '1.0.0'
};

// Start backend server
function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = config.isDev
      ? path.join(__dirname, '../../backend')
      : path.join(process.resourcesPath, 'backend', 'backend.exe');

    if (config.isDev) {
      // Development mode - run Python directly
      backendProcess = spawn('python', [
        '-m', 'uvicorn',
        'app.main:app',
        '--host', '127.0.0.1',
        '--port', config.backendPort.toString(),
        '--reload'
      ], {
        cwd: backendPath,
        env: {
          ...process.env,
          DATABASE_URL: 'sqlite:///local_pharma.db',
          OFFLINE_MODE: 'true'
        }
      });
    } else {
      // Production mode - run compiled exe
      backendProcess = spawn(backendPath, [
        '--port', config.backendPort.toString()
      ]);
    }

    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
      if (data.toString().includes('Uvicorn running')) {
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      reject(err);
    });

    // Give backend time to start
    setTimeout(() => resolve(), 5000);
  });
}

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: config.appName,
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false // Don't show until ready
  });

  // Load the app
  const startUrl = config.isDev
    ? `http://localhost:${config.frontendPort}`
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Check for updates in production
    if (!config.isDev) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent navigation away from app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });
}

// Create system tray icon
function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/tray-icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Sync Data', click: () => syncData() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip(config.appName);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// Data synchronization
async function syncData() {
  try {
    // Send sync request to renderer process
    mainWindow.webContents.send('sync-data');
  } catch (error) {
    console.error('Sync failed:', error);
    dialog.showErrorBox('Sync Error', 'Failed to sync data with server');
  }
}

// App event handlers
app.whenReady().then(async () => {
  try {
    console.log('Starting Pharma ERP Desktop...');

    // Start backend server
    await startBackend();
    console.log('Backend started successfully');

    // Create window and tray
    createWindow();
    createTray();

    // Setup IPC handlers
    setupIPC();

  } catch (error) {
    console.error('Failed to start application:', error);
    dialog.showErrorBox('Startup Error', 'Failed to start the application. Please try again.');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Kill backend process
  if (backendProcess) {
    backendProcess.kill();
  }
});

// IPC Communication
function setupIPC() {
  // Handle database operations
  ipcMain.handle('database-operation', async (event, operation, data) => {
    // This will communicate with the local backend
    return await performDatabaseOperation(operation, data);
  });

  // Handle online/offline status
  ipcMain.handle('check-online-status', async () => {
    const isOnline = await checkInternetConnection();
    return isOnline;
  });

  // Handle sync requests
  ipcMain.handle('sync-request', async () => {
    return await syncData();
  });
}

// Helper functions
async function checkInternetConnection() {
  try {
    const response = await fetch('https://www.google.com/generate_204');
    return response.ok;
  } catch {
    return false;
  }
}

async function performDatabaseOperation(operation, data) {
  // Communicate with local backend
  try {
    const response = await fetch(`http://localhost:${config.backendPort}/api/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await response.json();
  } catch (error) {
    console.error('Database operation failed:', error);
    throw error;
  }
}

// Auto-updater events
autoUpdater.on('update-available', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. It will be downloaded in the background.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. The application will restart to apply the update.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

module.exports = { config };