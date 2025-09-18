# Electron Forge + Vite + React + TypeScript 開發與維護指南

以下說明該專案是如何從零開始建立的，以及各種設定的原因與目的。
若未來工具鏈有更新，可以參考此文件進行調整。

## 一、初始化與環境設置

### 初始化專案

在要初始化的資料夾中執行：

```bash
npx create-electron-app@latest
```

選擇 **vite + typescript** 模板。

### 套件安裝

```bash
npm i react react-dom
npm i -D @vitejs/plugin-react @types/react @types/react-dom eslint-plugin-react eslint-plugin-react-hooks
```

### 新增清理腳本

在 `package.json` 的 `scripts` 加上：

```json
"clean": "node -e \"['out','.vite','dist'].forEach(d=>require('fs').rmSync(d,{recursive:true,force:true}))\""
```

### 設置 TypeScript

在 `tsconfig.json` 的 `compilerOptions` 中加上：

```json
"noUnusedLocals": true,
"jsx": "react-jsx"
```

### 設置 ESLint

在 `.eslintrc.json` 中新增 React 規則：

```jsonc
"extends": [
  "plugin:react/recommended",
  "plugin:react/jsx-runtime",
  "plugin:react-hooks/recommended"
],
"parserOptions": {
  "ecmaFeatures": { "jsx": true }
},
"settings": {
  "react": { "version": "detect" }
}
```

---

## 二、Vite 設置

### 改用 `.mjs`

將 `vite.renderer.config.ts` 改成 `vite.renderer.config.mjs`，內容：

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
});
```

並修改 `forge.config.ts` 的 `renderer` 設定：

```ts
renderer: [
  {
    name: "main_window",
    config: "vite.renderer.config.mjs",
  },
],
```

### 為何要改成 `.mjs`？

* Electron Forge **共用一份 `tsconfig.json`**（`main` / `preload` / `renderer`），其中強制使用 `"module": "commonjs"` + `"moduleResolution": "node"`。
* 這會導致 `vite.renderer.config.ts` 無法解析 `@vitejs/plugin-react`：

  ```
  具有型別，不過在目前的 'moduleResolution' 設定下，無法解析此結果。
  建議更新為 'node16'、'nodenext' 或 'bundler'。ts(2307)
  ```
* 如果嘗試改成 `"moduleResolution": "nodenext"`，則會被要求 `"module": "nodenext"`，結果又導致 `vite` 的型別（例如 `defineConfig`）失效。
* 由於 **Forge 打包流程依賴這份 tsconfig**，不能隨意修改。

因此最佳解法是：
**將 config 檔案改成 `.mjs`，交由 Node/Vite 以 ESM 方式解析**，完全避開 Forge 的 tsconfig 限制。

---

## 三、開始測試

### preload 與 main

新增 `/src/ipc.d.ts`：

```ts
export {};

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        off: (channel: string, listener?: (...args: any[]) => void) => void;
        request: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}
```

修改 `/src/preload.ts`：

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (_, ...args) => listener(...args));
    },
    off: (channel: string, listener?: (...args: any[]) => void) => {
      if (listener) {
        ipcRenderer.off(channel, listener);
      } else {
        ipcRenderer.removeAllListeners(channel);
      }
    },
    request: (channel: string, ...args: any[]): Promise<any> => {
      return ipcRenderer.invoke(channel, ...args);
    },
  },
});
```

在 `/src/main.ts` 中測試 IPC：

```ts
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
```

### 修改 HTML 與入口

修改 `/index.html`：

```html
<div id="root"></div>
<script type="module" src="/src/renderer.tsx"></script>
```

### 修改 renderer

將 `/src/renderer.ts` 改成 `/src/renderer.tsx`：

```tsx
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";

const useDownload = (url: string) => {
  const [download, setDownload] = useState<{ progress: number; status: string; result: string }>({
    progress: 0,
    status: "idle",
    result: "",
  });

  useEffect(() => {
    const handleProgress = (data: { url: string; progress: number; status: string }) => {
      setDownload((prev) => ({ ...prev, progress: data.progress, status: data.status }));
    };

    window.electron.ipcRenderer.on("download-progress", handleProgress);

    return () => {
      window.electron.ipcRenderer.off("download-progress", handleProgress);
    };
  }, []);

  const startDownload = async () => {
    setDownload({ progress: 0, status: "starting", result: "" });

    try {
      const result = await window.electron.ipcRenderer.request("start-download", url);
      setDownload((prev) => ({ ...prev, result: `下載完成: ${result.file}` }));
    } catch (error) {
      setDownload((prev) => ({ ...prev, result: `下載失敗: ${error}`, status: "error" }));
    }
  };

  return { download, startDownload };
};

const useCalculation = () => {
  const [numbers, setNumbers] = useState("1,2,3,4,5");
  const [calculationResult, setCalculationResult] = useState("");

  const startTask = async () => {
    setCalculationResult("計算中...");

    try {
      const array = numbers.split(",");
      const numberArray = array.map((n) => parseFloat(n.trim())).filter((n) => !isNaN(n));
      const result = await window.electron.ipcRenderer.request("calculate-task", numberArray);

      setCalculationResult(`
        輸入: [${result.numbers.join(", ")}]
        總和: ${result.sum}
        平均: ${result.average.toFixed(2)}
        時間: ${result.timestamp}
      `);
    } catch (error) {
      setCalculationResult(`計算失敗: ${error}`);
    }
  };

  return { numbers, setNumbers, calculationResult, startTask };
};

const useLogging = () => {
  const [logs, setLogs] = useState<Array<{ id: number; timestamp: string; level: string; message: string }>>([]);
  const [isLogging, setIsLogging] = useState(false);

  const handleToggleLogging = async () => {
    try {
      if (isLogging) {
        await window.electron.ipcRenderer.request("stop-logging");
        setIsLogging(false);
        setLogs([]);
      } else {
        await window.electron.ipcRenderer.request("start-logging");
        setIsLogging(true);
      }
    } catch (error) {
      console.error("切換日誌監控失敗:", error);
    }
  };

  useEffect(() => {
    window.electron.ipcRenderer.on(
      "backend-log",
      (logData: { id: number; timestamp: string; level: string; message: string }) => {
        setLogs((prevLogs) => {
          const newLogs = [...prevLogs, logData];
          // 只保留最新的 10 條日誌
          return newLogs.slice(-10);
        });
      }
    );

    return () => {
      if (isLogging) window.electron.ipcRenderer.request("stop-logging");
      window.electron.ipcRenderer.off("backend-log");
    };
  }, [isLogging]);

  return { logs, isLogging, handleToggleLogging };
};

const App = () => {
  const [downloadUrl, setDownloadUrl] = useState("https://www.example.com/sample.zip");
  const { download, startDownload } = useDownload(downloadUrl);
  const { numbers, setNumbers, calculationResult, startTask } = useCalculation();
  const { logs, isLogging, handleToggleLogging } = useLogging();

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Electron IPC 範例應用</h1>

      {/* 1. 下載進度範例 */}
      <div style={{ marginBottom: "30px", padding: "15px", border: "1px solid #ddd", borderRadius: "5px" }}>
        <h2>1. 下載進度範例 (Request + On)</h2>
        <div style={{ marginBottom: "10px" }}>
          <label>下載 URL: </label>
          <input
            type="text"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            style={{ width: "300px", marginLeft: "10px" }}
          />
        </div>
        <button onClick={startDownload} disabled={download.status === "downloading"}>
          開始下載
        </button>
        <div style={{ marginTop: "10px" }}>
          <div>狀態: {download.status}</div>
          <div>進度: {download.progress}%</div>
          <div
            style={{
              width: "300px",
              height: "20px",
              backgroundColor: "#f0f0f0",
              borderRadius: "10px",
              marginTop: "5px",
            }}
          >
            <div
              style={{
                width: `${download.progress}%`,
                height: "100%",
                backgroundColor: download.status === "completed" ? "#4CAF50" : "#2196F3",
                borderRadius: "10px",
                transition: "width 0.3s ease",
              }}
            ></div>
          </div>
          {download.result && <div style={{ marginTop: "10px", color: "#4CAF50" }}>{download.result}</div>}
        </div>
      </div>

      {/* 2. 單次任務範例 */}
      <div style={{ marginBottom: "30px", padding: "15px", border: "1px solid #ddd", borderRadius: "5px" }}>
        <h2>2. 單次任務範例 (Request)</h2>
        <div style={{ marginBottom: "10px" }}>
          <label>輸入數字 (逗號分隔): </label>
          <input
            type="text"
            value={numbers}
            onChange={(e) => setNumbers(e.target.value)}
            style={{ width: "200px", marginLeft: "10px" }}
          />
        </div>
        <button onClick={startTask}>執行計算</button>
        <div style={{ marginTop: "10px", whiteSpace: "pre-line" }}>{calculationResult}</div>
      </div>

      {/* 3. 後端日誌範例 */}
      <div style={{ marginBottom: "30px", padding: "15px", border: "1px solid #ddd", borderRadius: "5px" }}>
        <h2>3. 後端日誌範例 (Only On)</h2>
        <button onClick={handleToggleLogging}>{isLogging ? "停止日誌監控" : "開始日誌監控"}</button>
        <div
          style={{
            marginTop: "15px",
            height: "200px",
            overflow: "auto",
            backgroundColor: "#f8f8f8",
            padding: "10px",
            borderRadius: "3px",
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: "#999" }}>暫無日誌...</div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                style={{
                  marginBottom: "5px",
                  fontSize: "12px",
                  color: log.level === "ERROR" ? "red" : log.level === "WARN" ? "orange" : "black",
                }}
              >
                <span style={{ fontWeight: "bold" }}>[{log.timestamp}]</span>
                <span style={{ fontWeight: "bold", marginLeft: "5px" }}>{log.level}:</span>
                <span style={{ marginLeft: "5px" }}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
```


### 測試指令

執行 `npm run start`，若 React 畫面能正常跑起來，則初始化完成
