import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// 1. 下載進度範例 - 模擬下載並發送進度更新
ipcMain.handle("start-download", async (event, url: string) => {
  console.log(`start downloading: ${url}`);

  for (let i = 0; i <= 100; i += 10) {
    await new Promise((resolve) => setTimeout(resolve, 300)); // 模擬延遲
    event.sender.send("download-progress", {
      url,
      progress: i,
      status: i === 100 ? "completed" : "downloading",
    });
  }

  return { success: true, message: "下載完成", file: `downloaded-${Date.now()}.zip` };
});

// 2. 單次任務範例 - 簡單的計算任務
ipcMain.handle("calculate-task", async (_, numbers: number[]) => {
  console.log("start calculating:", numbers);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  const average = sum / numbers.length;
  const timestamp = new Date().toLocaleString();

  return { numbers, sum, average, timestamp };
});

// 3. 後端日誌範例 - 定期發送日誌訊息
let logInterval: NodeJS.Timeout | null = null;
let logCounter = 0;
const messages = ["資料庫連接檢查", "記憶體使用率: 45%", "網路連接狀態良好", "備份任務執行中"];

const startLogging = (webContents: Electron.WebContents) => {
  if (logInterval) return;

  logInterval = setInterval(() => {
    logCounter++;
    const logMessage = {
      id: logCounter,
      timestamp: new Date().toLocaleString(),
      level: ["INFO", "WARN", "ERROR"][Math.floor(Math.random() * 3)],
      message: messages[Math.floor(Math.random() * messages.length)],
    };

    webContents.send("backend-log", logMessage);
  }, 2000);
};

const stopLogging = () => {
  if (!logInterval) return;

  clearInterval(logInterval);
  logInterval = null;
};

ipcMain.handle("start-logging", (event) => {
  startLogging(event.sender);
  return { message: "日誌監控已啟動" };
});

ipcMain.handle("stop-logging", () => {
  stopLogging();
  return { message: "日誌監控已停止" };
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
