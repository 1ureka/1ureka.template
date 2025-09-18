import "./index.css";
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
