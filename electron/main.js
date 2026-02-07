
import { app, BrowserWindow, ipcMain, shell, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ESM Workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FOLDER PENYIMPANAN UTAMA (DATABASE & CACHE): Documents/NovTL
const BASE_DIR = path.join(app.getPath('documents'), 'NovTL');

// Pastikan folder ada saat aplikasi dibuka
if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
}

// SECURITY: Validasi Path untuk mencegah Traversal Attack (../..)
const isSafePath = (targetPath) => {
    const resolvedPath = path.resolve(BASE_DIR, targetPath);
    return resolvedPath.startsWith(BASE_DIR);
};

function createWindow() {
    // Determine icon path based on environment
    const iconPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar', 'icon.png')
        : path.join(__dirname, '../icon.png'); 

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false 
        },
        icon: iconPath,
        autoHideMenuBar: true
    });

    // Load dist in production, localhost in dev
    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
    mainWindow.loadURL(startUrl);

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

ipcMain.handle('fs-write', async (event, { filename, content }) => {
    try {
        if (!isSafePath(filename)) throw new Error("Access Denied: Invalid file path.");
        const filePath = path.join(BASE_DIR, filename);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('fs-read', async (event, { filename }) => {
    try {
        if (!isSafePath(filename)) return null;
        const filePath = path.join(BASE_DIR, filename);
        if (!fs.existsSync(filePath)) return null;
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        return null;
    }
});

ipcMain.handle('fs-list', async (event, { folder }) => {
    try {
        if (!isSafePath(folder || '')) return [];
        const dirPath = path.join(BASE_DIR, folder || '');
        if (!fs.existsSync(dirPath)) return [];
        return fs.readdirSync(dirPath);
    } catch (err) {
        return [];
    }
});

ipcMain.handle('fs-delete', async (event, { filename }) => {
    try {
        if (!isSafePath(filename)) return { success: false, error: "Access Denied" };
        const filePath = path.join(BASE_DIR, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-storage-path', () => BASE_DIR);

ipcMain.handle('clipboard-read', () => clipboard.readText());

ipcMain.handle('save-to-downloads', async (event, { filename, base64Data }) => {
    try {
        const downloadFolder = app.getPath('downloads');
        const exportFolder = path.join(downloadFolder, 'NovTL_Exports');
        
        if (!fs.existsSync(exportFolder)) {
            fs.mkdirSync(exportFolder, { recursive: true });
        }

        const filePath = path.join(exportFolder, filename);
        const buffer = Buffer.from(base64Data, 'base64');
        
        fs.writeFileSync(filePath, buffer);
        shell.showItemInFolder(filePath);
        
        return { success: true, path: filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
