// Web Audio API & Web Speech API (音声読み上げ) モジュール

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
 * 新着タスクを自然な日本語音声で読み上げる
 * 例: 「新しいタスクが入りました。1階、患者ID1234、バイタル確認です。」
 */
export function speakTaskNotification(task) {
  if (!('speechSynthesis' in window)) {
    console.warn("SpeechSynthesis not supported in this browser.");
    return;
  }

  try {
    // 既存の発声をキャンセルして最新をクリアに喋らせる
    window.speechSynthesis.cancel();

    const wardText = task.ward && task.ward !== "指定なし" ? `${task.ward}、` : "";
    const idText = task.patientId === "共通" ? "一般業務、" : task.patientId === "個人" ? "個人メモ、" : task.patientId ? `患者ID ${task.patientId}、` : "";
    const contentText = task.content || "タスク";

    const fullSpeechText = `新しいタスクが入りました。${wardText}${idText}${contentText}です。`;

    const uttr = new SpeechSynthesisUtterance(fullSpeechText);
    uttr.lang = 'ja-JP';
    uttr.rate = 1.0; // 読み上げ速度
    uttr.pitch = 1.0; // 声の高さ

    window.speechSynthesis.speak(uttr);
  } catch (err) {
    console.warn("Failed to speak task:", err);
  }
}

/**
 * 音声読み上げテスト
 */
export function testSpeechNotification() {
  speakTaskNotification({
    ward: "1階",
    patientId: "1234",
    content: "音声読み上げ機能を有効にしました"
  });
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
