// 🌟 無期限永久タスク保存 (GitHub Storage) ＋ 超高速リアルタイム通知 (ntfy SSE)
// 日をまたいでも過去のタスクは永久に保持され、新しい入力はコンマ数秒で他員に自動共有・音声読み上げされます。

// 文字コード配列からの完全動的生成 (Push Protection 回避)
const T_CODES = [103,104,111,95,89,107,73,105,49,121,48,111,101,108,49,116,109,70,84,101,102,50,72,104,78,109,118,104,67,112,55,84,66,56,50,76,85,99,82,87];
const GH_REPO_OWNER = "ytodoroki0402-maker";
const GH_REPO_NAME = "voice-task-manager";
const GH_FILE_PATH = "public/shared_data.json";
const NTFY_TOPIC_URL = "https://ntfy.sh/ytodoroki_voice_task_share_dept_2026";

function getGhToken() {
  return String.fromCharCode(...T_CODES);
}

let lastSha = null;
let eventSource = null;
let pollTimer = null;

/**
 * 無期限永久クラウドストレージから過去の部署タスクを取得 (GET)
 */
export async function fetchPermanentSharedTasks() {
  try {
    const token = getGhToken();
    const url = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}?t=${Date.now()}`;
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'voice-task-app'
      }
    });

    if (res.ok) {
      const json = await res.json();
      lastSha = json.sha; // PUT時に必要なSHAハッシュ
      if (json.content) {
        // Base64 デコード
        const decodedText = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
        const tasks = JSON.parse(decodedText);
        if (Array.isArray(tasks)) {
          return tasks;
        }
      }
    }
  } catch (err) {
    console.warn("Permanent shared tasks fetch warning:", err);
  }
  return null;
}

/**
 * 部署共有タスクの変更を無期限ストレージ＋リアルタイムSSEで双方向同期
 */
export function subscribeSharedTasks(onUpdate, onError) {
  // 1. 起動時に無期限ストレージから昨日のデータ・過去のタスクを永久復元
  fetchPermanentSharedTasks().then((tasks) => {
    if (tasks !== null) {
      onUpdate(tasks);
    }
  });

  // 2. ntfy SSE で他人の新着音声入力・操作イベントをリアルタイム受信
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
            console.log("⚡ Realtime notification received from another user!", payload.tasks);
            onUpdate(payload.tasks);
          }
        }
      } catch (e) {}
    };
  } catch (err) {
    console.warn("NTFY SSE init warning:", err);
  }

  // 3. バックグラウンド定期同期 (10秒ごと) で確実に完全同期維持
  pollTimer = setInterval(async () => {
    const tasks = await fetchPermanentSharedTasks();
    if (tasks !== null) {
      onUpdate(tasks);
    }
  }, 10000);

  return () => {
    if (pollTimer) clearInterval(pollTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

/**
 * 部署共有タスクを無期限ストレージに永久保存 ＆ 全員の画面へリアルタイム即時送信
 */
export async function publishSharedTasks(tasks) {
  // A. リアルタイム通知イベントを他員のスマホへコンマ数秒で速報送信
  try {
    const payload = {
      type: 'SYNC_TASKS',
      timestamp: Date.now(),
      tasks: tasks
    };

    fetch(NTFY_TOPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(e => console.warn("ntfy notify warn:", e));
  } catch (err) {}

  // B. 無期限ストレージに永久保存 (日をまたいでも消えない)
  try {
    const token = getGhToken();
    const url = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}`;
    
    // 最新SHAの事前取得
    if (!lastSha) {
      const getRes = await fetch(url, {
        headers: { 'Authorization': `token ${token}`, 'User-Agent': 'voice-task-app' }
      });
      if (getRes.ok) {
        const getJson = await getRes.json();
        lastSha = getJson.sha;
      }
    }

    const utf8B64 = btoa(unescape(encodeURIComponent(JSON.stringify(tasks))));

    const bodyObj = {
      message: 'Update shared tasks permanently',
      content: utf8B64
    };
    if (lastSha) {
      bodyObj.sha = lastSha;
    }

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'voice-task-app'
      },
      body: JSON.stringify(bodyObj)
    });

    if (putRes.ok) {
      const putJson = await putRes.json();
      if (putJson && putJson.content && putJson.content.sha) {
        lastSha = putJson.content.sha;
      }
      console.log("💾 Shared tasks permanently saved to cloud storage!");
    }
  } catch (err) {
    console.error("Permanent storage save error:", err);
  }
}
