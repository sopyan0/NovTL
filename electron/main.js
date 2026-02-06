
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// FOLDER PENYIMPANAN UTAMA: Documents/NovTL
const BASE_DIR = path.join(app.getPath('documents'), 'NovTL');

// Pastikan folder ada saat aplikasi dibuka
if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
}

function createWindow() {
    // Determine icon path based on environment
    // In production (asar), __dirname is inside the archive. The icon is unpacked or at root.
    const iconPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar', 'icon-512.png') // Try inside asar first if packed
        : path.join(__dirname, '../icon-512.png'); // Dev mode

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false // Diperlukan untuk akses file system via preload
        },
        icon: iconPath,
        autoHideMenuBar: true // Menyembunyikan menu bar default electron yang kurang estetis
    });

    // Load dari dist saat production, atau localhost saat dev
    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
    mainWindow.loadURL(startUrl);

    // Buka link eksternal di browser default, bukan di dalam app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- API UNTUK RENDERER (REACT) ---

// 1. Tulis File
ipcMain.handle('fs-write', async (event, { filename, content }) => {
    try {
        const filePath = path.join(BASE_DIR, filename);
        const dir = path.dirname(filePath);
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true };
    } catch (err) {
        console.error("Write Error:", err);
        return { success: false, error: err.message };
    }
});

// 2. Baca File
ipcMain.handle('fs-read', async (event, { filename }) => {
    try {
        const filePath = path.join(BASE_DIR, filename);
        if (!fs.existsSync(filePath)) return null;
        const data = fs.readFileSync(filePath, 'utf8');
        return data;
    } catch (err) {
        return null;
    }
});

// 3. List File di Folder
ipcMain.handle('fs-list', async (event, { folder }) => {
    try {
        const dirPath = path.join(BASE_DIR, folder || '');
        if (!fs.existsSync(dirPath)) return [];
        const files = fs.readdirSync(dirPath);
        return files;
    } catch (err) {
        return [];
    }
});

// 4. Hapus File
ipcMain.handle('fs-delete', async (event, { filename }) => {
    try {
        const filePath = path.join(BASE_DIR, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 5. Cek Path Penyimpanan (Untuk Debug)
ipcMain.handle('get-storage-path', () => BASE_DIR);
