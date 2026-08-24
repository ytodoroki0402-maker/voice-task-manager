// ⚡ 完全無料・超高速リアルタイム同期エンジン (ntfy.sh SSE/PubSub)
// CORS制限なし・アカウント不要で全世界の端末間をリアルタイム双方向同期
const NTFY_TOPIC_URL = "https://ntfy.sh/ytodoroki_voice_task_share_dept_2026";

let eventSource = null;

/**
 * 直近に共有された最新タスクの取得 (Poll / Initial Sync)
 */
export async function fetchLatestSharedTasks() {
  try {
    // 直近のキャシュメッセージを1件取得
    const res = await fetch(`${NTFY_TOPIC_URL}/json?poll=1&scheduled=0`);
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const msgObj = JSON.parse(lines[i]);
          if (msgObj && msgObj.message) {
            const payload = JSON.parse(msgObj.message);
            if (payload && payload.type === 'SYNC_TASKS' && Array.isArray(payload.tasks)) {
              return payload.tasks;
            }
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("Initial sync fetch warning:", err);
  }
  return null;
}

/**
 * 部署共有タスクのリアルタイム監視 (EventSource / SSE)
 */
export function subscribeSharedTasks(onUpdate, onError) {
  // 1. 接続開始時に直近の共有タスクを即時復元
  fetchLatestSharedTasks().then((latestTasks) => {
    if (latestTasks !== null) {
      onUpdate(latestTasks);
    }
  });

  // 2. ntfy SSE (Server-Sent Events) で他人の操作をリアルタイム受信
  try {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`${NTFY_TOPIC_URL}/sse`);

    eventSource.onmessage = (event) => {
      try {
        const msgObj = JSON.parse(event.data);
        if (msgObj && msgObj.event === 'message' && msgObj.message) {
          const payload = JSON.parse(msgObj.message);
          if (payload && payload.type === 'SYNC_TASKS' && Array.isArray(payload.tasks)) {
            console.log("⚡ Realtime task update received from another user!", payload.tasks);
            onUpdate(payload.tasks);
          }
        }
      } catch (e) {
        console.error("Failed to parse SSE payload:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("NTFY SSE connection status:", err);
      if (onError) onError(err);
    };
  } catch (err) {
    console.error("NTFY SSE init error:", err);
    if (onError) onError(err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

/**
 * 部署共有タスクを他員全員の画面へ超高速リアルタイム配信
 */
export async function publishSharedTasks(tasks) {
  try {
    const payload = {
      type: 'SYNC_TASKS',
      timestamp: Date.now(),
      tasks: tasks
    };

    await fetch(NTFY_TOPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    console.log("⚡ Published task update to all department users!");
  } catch (err) {
    console.error("Failed to publish tasks to ntfy:", err);
  }
}
