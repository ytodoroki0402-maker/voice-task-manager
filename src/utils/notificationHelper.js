// Web Audio API を使用した外部ファイル不要の通知音・ポップアップ通知モジュール

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 爽やかな通知チャイム音（ピローン♪）を鳴らす
 */
export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // 第1音 (G5 - 783.99 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // 第2音 (C6 - 1046.50 Hz) 0.1秒後
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.50, now + 0.1);
    gain2.gain.setValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);
  } catch (err) {
    console.warn("Could not play notification sound:", err);
  }
}

/**
 * ブラウザの通知権限をリクエスト
 */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("お使いのブラウザはポップアップ通知に対応していません。");
    return false;
  }
  
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (e) {
    console.warn("Notification permission error:", e);
    return false;
  }
}

/**
 * ポップアップ通知を発行
 */
export function showTaskNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body: body,
        icon: './favicon.svg',
        tag: 'voice-task-new'
      });
    } catch (e) {
      console.warn("Failed to trigger Notification:", e);
    }
  }
}
