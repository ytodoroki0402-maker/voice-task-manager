// 無料・即時動作する Firebase Realtime Database SSE を使用した超軽量リアルタイム同期モジュール
const REALTIME_DB_URL = "https://voice-task-manager-default-rtdb.firebaseio.com/shared_tasks.json";

let eventSource = null;

/**
 * 部署共有タスクの変更をリアルタイム監視（購読）
 */
export function subscribeSharedTasks(onUpdate, onError) {
  if (eventSource) {
    eventSource.close();
  }

  try {
    eventSource = new EventSource(REALTIME_DB_URL);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Firebase SSE event: { path: "/", data: ... }
        if (data && data.path === "/") {
          const tasks = data.data;
          if (Array.isArray(tasks)) {
            onUpdate(tasks);
          } else if (tasks === null) {
            onUpdate([]);
          } else if (typeof tasks === 'object') {
            // オブジェクト配列変換
            onUpdate(Object.values(tasks));
          }
        }
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("Realtime DB connection info:", err);
      if (onError) onError(err);
    };
  } catch (err) {
    console.error("Failed to connect EventSource:", err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

/**
 * 部署共有タスクをクラウドへ更新・送信
 */
export async function publishSharedTasks(tasks) {
  try {
    const res = await fetch(REALTIME_DB_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tasks)
    });
    if (!res.ok) {
      console.error("Failed to publish shared tasks:", res.statusText);
    }
  } catch (err) {
    console.error("Network error publishing shared tasks:", err);
  }
}
