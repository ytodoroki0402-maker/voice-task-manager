// 高堅牢・マルチ環境対応 リアルタイム同期モジュール
// CORS制限や院内・社内ネットワークでも確実に同期されるハイブリッド通信
const SHARED_API_URL = "https://voice-task-manager-default-rtdb.firebaseio.com/shared_tasks.json";

let pollTimer = null;
let eventSource = null;

/**
 * 共有タスクの取得 (GET)
 */
export async function fetchSharedTasks() {
  try {
    const res = await fetch(`${SHARED_API_URL}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (data === null) return [];
      if (typeof data === 'object') return Object.values(data);
    }
  } catch (err) {
    console.warn("Shared tasks fetch warning:", err);
  }
  return null;
}

/**
 * 部署共有タスクの変更をリアルタイム監視・自動同期
 */
export function subscribeSharedTasks(onUpdate, onError) {
  let isConnected = false;

  // 1. 即時取得
  fetchSharedTasks().then((tasks) => {
    if (tasks !== null) {
      onUpdate(tasks);
      isConnected = true;
    }
  });

  // 2. 高速定期同期 (ポーリング: 2秒ごと) - ネットワーク環境に左右されず確実に同期
  pollTimer = setInterval(async () => {
    const tasks = await fetchSharedTasks();
    if (tasks !== null) {
      onUpdate(tasks);
      if (!isConnected) {
        isConnected = true;
      }
    }
  }, 2000);

  // 3. SSE (Server-Sent Events) リアルタイムプッシュ試行
  try {
    eventSource = new EventSource(SHARED_API_URL);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.path === "/") {
          const tasks = data.data;
          if (Array.isArray(tasks)) onUpdate(tasks);
          else if (tasks === null) onUpdate([]);
          else if (typeof tasks === 'object') onUpdate(Object.values(tasks));
        }
      } catch (e) {}
    };
  } catch (e) {}

  return () => {
    if (pollTimer) clearInterval(pollTimer);
    if (eventSource) eventSource.close();
  };
}

/**
 * 部署共有タスクをクラウドへ即時送信
 */
export async function publishSharedTasks(tasks) {
  try {
    await fetch(SHARED_API_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tasks)
    });
  } catch (err) {
    console.error("Network error publishing shared tasks:", err);
  }
}
