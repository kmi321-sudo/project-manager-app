const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const uid = () => Math.random().toString(36).slice(2, 10);
const DATA_FILE = path.join(app.getPath('userData'), 'app-data.json');
const ATTACH_DIR = path.join(app.getPath('userData'), 'attachments');
function ensureAttachDir() { if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true }); }

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1f2430',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 開發時可開啟 DevTools（正式發布可移除）
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------------- IPC：資料持久化 ---------------------- */

ipcMain.handle('load-data', () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('讀取資料失敗', e);
  }
  return null;
});

ipcMain.handle('save-data', (event, state) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
    return { ok: true };
  } catch (e) {
    console.error('寫入資料失敗', e);
    return { ok: false, error: String(e) };
  }
});

/* ---------------------- IPC：匯出 / 匯入 ---------------------- */

ipcMain.handle('export-data', async (event, state) => {
  const result = await dialog.showSaveDialog({
    title: '匯出專案資料',
    defaultPath: `專案管理備份-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(state, null, 2), 'utf-8');
    return { ok: true, filePath: result.filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('import-data', async () => {
  const result = await dialog.showOpenDialog({
    title: '匯入專案資料',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  try {
    const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

/* ---------------------- IPC：桌面通知 ---------------------- */

ipcMain.handle('notify', (event, { title, body }) => {
  if (!Notification.isSupported()) return { ok: false };
  try {
    new Notification({ title, body, silent: false }).show();
    return { ok: true };
  } catch (e) {
    console.error('通知失敗', e);
    return { ok: false, error: String(e) };
  }
});

/* ---------------------- IPC：附件 ---------------------- */

ipcMain.handle('add-attachment', async (event, { taskId }) => {
  ensureAttachDir();
  const result = await dialog.showOpenDialog({
    title: '選擇附件',
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  const src = result.filePaths[0];
  const base = path.basename(src);
  const dest = path.join(ATTACH_DIR, `${taskId}__${base}`);
  try {
    fs.copyFileSync(src, dest);
    const size = fs.statSync(dest).size;
    return { ok: true, file: { id: uid(), name: base, path: dest, size } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('open-attachment', (event, filePath) => {
  try {
    shell.openPath(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('remove-attachment', (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
