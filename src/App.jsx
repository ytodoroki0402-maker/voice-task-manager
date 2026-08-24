import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { useSpeech } from './hooks/useSpeech';
import { useAutoScroll } from './hooks/useAutoScroll';
import { parseAudioWithGemini, WARD_COLORS, STATUS } from './utils/commandParser';
import { logTaskEvent, exportLogs } from './utils/dataLogger';
import { ConversationPanel } from './components/ConversationPanel';
import { subscribeSharedTasks, publishSharedTasks } from './utils/syncManager';
import { playNotificationSound, requestNotificationPermission, showTaskNotification } from './utils/notificationHelper';

function App() {
  // モード管理 ('shared' | 'personal')
  const [activeTab, setActiveTab] = useState('shared');
  const [isSynced, setIsSynced] = useState(true);

  // 通知設定 (通知音 & ポップアップ)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('notify_sound_enabled') === 'true';
  });
  const [popupEnabled, setPopupEnabled] = useState(() => {
    return localStorage.getItem('notify_popup_enabled') === 'true';
  });

  // 部署共有タスク
  const [sharedTasks, setSharedTasks] = useState(() => {
    const saved = localStorage.getItem('shared_tasks_cache');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: 1, patientId: "1234", ward: "1階", content: "バイタル確認", status: "未対応", timestamp: Date.now() },
      { id: 2, patientId: "共通", ward: "指定なし", content: "来月のシフト表の作成", status: "対応中", timestamp: Date.now() - 1000 }
    ];
  });

  const prevTasksCountRef = useRef(sharedTasks.length);

  // 部署共有タスクのリアルタイム同期購読
  useEffect(() => {
    const unsubscribe = subscribeSharedTasks(
      (remoteTasks) => {
        if (Array.isArray(remoteTasks)) {
          // 他人がタスクを追加したか検知 (件数増加時)
          if (remoteTasks.length > prevTasksCountRef.current) {
            const newestTask = remoteTasks[remoteTasks.length - 1] || remoteTasks[0];
            
            // 音がオンならチャイム音再生
            if (localStorage.getItem('notify_sound_enabled') === 'true') {
              playNotificationSound();
            }

            // ポップアップがオンなら通知表示
            if (localStorage.getItem('notify_popup_enabled') === 'true' && newestTask) {
              const wardStr = newestTask.ward && newestTask.ward !== '指定なし' ? `[${newestTask.ward}] ` : '';
              const idStr = newestTask.patientId ? `(ID:${newestTask.patientId}) ` : '';
              showTaskNotification(
                "🏥 部署共有タスク追加",
                `${wardStr}${idStr}${newestTask.content}`
              );
            }
          }
          prevTasksCountRef.current = remoteTasks.length;
          setSharedTasks(remoteTasks);
          localStorage.setItem('shared_tasks_cache', JSON.stringify(remoteTasks));
        }
        setIsSynced(true);
      },
      () => {
        setIsSynced(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // 個人専用タスク (ローカルストレージのみ)
  const [personalTasks, setPersonalTasks] = useState(() => {
    const saved = localStorage.getItem('personal_tasks');
    if (saved) return JSON.parse(saved);
    return [
      { id: 101, patientId: "個人", ward: "指定なし", content: "業務報告書の作成", status: "未対応", timestamp: Date.now() }
    ];
  });

  // 音声会話履歴
  const [conversationHistory, setConversationHistory] = useState(() => {
    const saved = localStorage.getItem('voice_chat_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });

  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const DEFAULT_KEY_B64 = "QVEuQWI4Uk42SnAtcXhyTXp1aFZGMTNybjc1RW5QZ003Q244UlVhdnlQTTNsLTJPMFdNM2c=";

  const [apiKey, setApiKey] = useState(() => {
    const saved = localStorage.getItem('gemini_api_key');
    if (saved && saved.trim() !== "") return saved;
    try {
      return atob(DEFAULT_KEY_B64);
    } catch (e) {
      return "";
    }
  });

  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [manualPatientId, setManualPatientId] = useState("");
  const [manualWard, setManualWard] = useState("指定なし");
  const [manualContent, setManualContent] = useState("");

  const [autoScroll, setAutoScroll] = useState(false);
  const tableContainerRef = useAutoScroll(autoScroll, 10000);

  // 通知設定の永続保存
  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    localStorage.setItem('notify_sound_enabled', String(nextVal));
    if (nextVal) {
      playNotificationSound(); // テスト再生
    }
  };

  const togglePopup = async () => {
    if (!popupEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setPopupEnabled(true);
        localStorage.setItem('notify_popup_enabled', 'true');
        showTaskNotification("🔔 通知設定完了", "新着タスク追加時にポップアップ通知が表示されます");
      } else {
        alert("ブラウザの通知許可が得られませんでした。");
      }
    } else {
      setPopupEnabled(false);
      localStorage.setItem('notify_popup_enabled', 'false');
    }
  };

  // 個人タスクの保存
  useEffect(() => {
    localStorage.setItem('personal_tasks', JSON.stringify(personalTasks));
  }, [personalTasks]);

  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('voice_chat_history', JSON.stringify(conversationHistory));
  }, [conversationHistory]);

  const addHistoryLog = (userText, aiResponse, action, parsedDetails, isError = false) => {
    const logItem = {
      id: Date.now(),
      timestamp: Date.now(),
      userText,
      aiResponse,
      action,
      parsedDetails,
      isError
    };
    setConversationHistory(prev => [...prev, logItem]);
  };

  const clearHistory = () => {
    if (window.confirm("会話・解析履歴をすべて削除しますか？")) {
      setConversationHistory([]);
    }
  };

  const currentTasks = activeTab === 'shared' ? sharedTasks : personalTasks;

  const updateTasksForCurrentMode = (updater) => {
    if (activeTab === 'shared') {
      const nextTasks = typeof updater === 'function' ? updater(sharedTasks) : updater;
      prevTasksCountRef.current = nextTasks.length;
      setSharedTasks(nextTasks);
      publishSharedTasks(nextTasks);
    } else {
      setPersonalTasks(updater);
    }
  };

  const moveTaskStatus = (taskId, newStatus) => {
    updateTasksForCurrentMode(prev => {
      return prev.map(task => {
        if (task.id === taskId) {
          const updated = { ...task, status: newStatus };
          logTaskEvent(updated, newStatus === STATUS.DONE ? "COMPLETED" : "STARTED");
          return updated;
        }
        return task;
      });
    });
  };

  const deleteTask = (taskId) => {
    updateTasksForCurrentMode(prev => prev.filter(t => t.id !== taskId));
  };

  const handleManualAddSubmit = (e) => {
    e.preventDefault();
    if (!manualContent.trim()) return;

    const newTask = {
      id: Date.now(),
      patientId: manualPatientId.trim() || (activeTab === 'shared' ? "共通" : "個人"),
      ward: manualWard,
      content: manualContent.trim(),
      status: STATUS.TODO,
      timestamp: Date.now()
    };

    updateTasksForCurrentMode(prev => [newTask, ...prev]);
    logTaskEvent(newTask, "CREATED");

    setManualContent("");
    setManualPatientId("");
    setManualWard("指定なし");
    setShowAddModal(false);
  };

  const handleAudioRecorded = async (audioBlob) => {
    if (!apiKey) {
      alert("Gemini APIキーを設定してください（メニューの「⚙️ 設定」から入力できます）");
      setShowSettings(true);
      return;
    }

    setIsProcessing(true);
    setLastTranscript("✨ Gemini が音声を直接マルチモーダル解析中...");

    try {
      const parsed = await parseAudioWithGemini(audioBlob, apiKey);
      console.log("Gemini Parsed command:", parsed);
      
      if (parsed.transcribed_text) {
        setLastTranscript(`聞き取り結果: 「${parsed.transcribed_text}」`);
      }

      const modePrefix = activeTab === 'shared' ? '【部署共有】' : '【個人用】';
      let aiMsg = "";
      const wardStr = parsed.ward && parsed.ward !== "指定なし" ? `[${parsed.ward}] ` : "";
      const idStr = parsed.id ? `(ID:${parsed.id}) ` : "";

      if (parsed.action === "ADD") {
        aiMsg = `${modePrefix} ${wardStr}${idStr}「${parsed.content}」を『未対応』に追加しました。`;
      } else if (parsed.action === "START") {
        aiMsg = `${modePrefix} ${wardStr}${idStr}「${parsed.content}」の対応を開始しました。`;
      } else if (parsed.action === "COMPLETE") {
        aiMsg = `${modePrefix} ${wardStr}${idStr}「${parsed.content}」を『完了』に移動しました。`;
      } else {
        aiMsg = `${modePrefix} 「${parsed.transcribed_text}」を処理しました。`;
      }

      addHistoryLog(parsed.transcribed_text || "", aiMsg, parsed.action, {
        ward: parsed.ward,
        id: parsed.id,
        content: parsed.content
      });

      updateTasksForCurrentMode(prev => {
        let newTasks = [...prev];
        
        if (parsed.action === "ADD") {
          const newTask = {
            id: Date.now(),
            patientId: parsed.id || (activeTab === 'shared' ? "共通" : "個人"),
            ward: parsed.ward,
            content: parsed.content,
            status: parsed.status, 
            timestamp: Date.now()
          };
          newTasks.push(newTask);
          logTaskEvent(newTask, "CREATED");
        } 
        else if (parsed.action === "START" || parsed.action === "COMPLETE") {
          let targetIndex = -1;
          const normalize = (str) => str.replace(/[、。！？\s]/g, "");
          const parsedClean = normalize(parsed.content || "");

          if (parsed.id) {
            targetIndex = newTasks.findIndex(t => 
              t.patientId === parsed.id && 
              t.status !== STATUS.DONE && 
              (parsedClean === "詳細不明タスク" || normalize(t.content).includes(parsedClean) || parsedClean.includes(normalize(t.content)))
            );
            if (targetIndex === -1) {
              targetIndex = newTasks.findIndex(t => t.patientId === parsed.id && t.status !== STATUS.DONE);
            }
          } else {
            if (parsedClean !== "詳細不明タスク" && parsedClean !== "") {
              targetIndex = newTasks.findIndex(t => 
                t.status !== STATUS.DONE && 
                (normalize(t.content).includes(parsedClean) || parsedClean.includes(normalize(t.content)))
              );
            }
          }

          if (targetIndex !== -1) {
            newTasks[targetIndex] = {
              ...newTasks[targetIndex],
              status: parsed.status
            };
            logTaskEvent(newTasks[targetIndex], parsed.action === "START" ? "STARTED" : "COMPLETED");
          } else {
            const newTask = {
              id: Date.now(),
              patientId: parsed.id || (activeTab === 'shared' ? "共通" : "個人"),
              ward: parsed.ward,
              content: parsed.content,
              status: parsed.status,
              timestamp: Date.now()
            };
            newTasks.push(newTask);
            logTaskEvent(newTask, parsed.action === "START" ? "STARTED" : "COMPLETED");
          }
        }

        return newTasks;
      });
    } catch (err) {
      console.error(err);
      addHistoryLog("", `Gemini解析失敗: ${err.message}`, "ERROR", null, true);
      alert(`Geminiでの解析に失敗しました。\n\n詳細: ${err.message}`);
      setLastTranscript("");
    } finally {
      setIsProcessing(false);
    }
  };

  const { isListening, error, startListening, stopListening } = useSpeech(handleAudioRecorded);

  const sortedTasks = [...currentTasks].sort((a, b) => b.timestamp - a.timestamp);
  const todoTasks = sortedTasks.filter(t => t.status === STATUS.TODO);
  const inProgressTasks = sortedTasks.filter(t => t.status === STATUS.IN_PROGRESS);
  const doneTasks = sortedTasks.filter(t => t.status === STATUS.DONE);

  const renderColumn = (title, columnTasks, statusClass) => (
    <div className="kanban-column" ref={statusClass === 'TODO' ? tableContainerRef : null}>
      <h2>{title} ({columnTasks.length})</h2>
      <div className="kanban-cards">
        {columnTasks.length === 0 ? (
          <div className="empty-state">タスクなし</div>
        ) : (
          columnTasks.map(task => (
            <div key={task.id} className={`task-card status-${statusClass}`}>
              <div className="task-card-header">
                <span className={`task-id ${task.patientId === "共通" || task.patientId === "個人" ? "general" : ""}`}>
                  {task.patientId === "共通" ? "一般業務" : task.patientId === "個人" ? "個人メモ" : `ID: ${task.patientId}`}
                </span>
                {task.ward !== "指定なし" && (
                  <span 
                    className="ward-badge" 
                    style={{backgroundColor: WARD_COLORS[task.ward] || WARD_COLORS["共通"]}}
                  >
                    {task.ward}
                  </span>
                )}
              </div>
              <div className="task-content">
                {task.content}
              </div>

              <div className="task-card-actions">
                {statusClass === "TODO" && (
                  <button className="card-action-btn primary" onClick={() => moveTaskStatus(task.id, STATUS.IN_PROGRESS)}>
                    ▶ 対応中へ
                  </button>
                )}
                {statusClass === "IN_PROGRESS" && (
                  <>
                    <button className="card-action-btn default" onClick={() => moveTaskStatus(task.id, STATUS.TODO)}>
                      ◀ 未対応
                    </button>
                    <button className="card-action-btn success" onClick={() => moveTaskStatus(task.id, STATUS.DONE)}>
                      ✔ 完了へ
                    </button>
                  </>
                )}
                {statusClass === "DONE" && (
                  <button className="card-action-btn default" onClick={() => moveTaskStatus(task.id, STATUS.IN_PROGRESS)}>
                    ↩ 対応中へ戻す
                  </button>
                )}
                <button className="card-action-btn danger" onClick={() => deleteTask(task.id)} title="削除">
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className={`app-container mode-${activeTab}`}>
      {/* 最上部ヘッダー */}
      <header className="header">
        <div className="app-title-area">
          <h1>🏥 薬剤部音声タスクマネージャー</h1>
          <div className="status-sub-row">
            <span className="app-subtitle">✨ Gemini AI Powered (v2.1 通知対応版)</span>
            {activeTab === 'shared' ? (
              <span className={`sync-status ${isSynced ? 'synced' : 'syncing'}`}>
                {isSynced ? '🟢 リアルタイム共有中' : '🟡 接続中...'}
              </span>
            ) : (
              <span className="sync-status personal">
                👤 個人専用（非公開）
              </span>
            )}
          </div>
        </div>
        
        <div className="header-actions">
          {/* 音声入力ボタン */}
          <button 
            className={`btn btn-voice ${isListening ? 'active' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
          >
            {isListening ? '⏹️ 停止して解析' : '🎙️ 音声入力'}
          </button>

          {/* 通知音クイック切り替えボタン */}
          <button 
            className={`btn icon-btn ${soundEnabled ? 'active-sound' : ''}`}
            onClick={toggleSound}
            title={soundEnabled ? '通知音: ON' : '通知音: OFF'}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>

          {/* 会話履歴ボタン */}
          <button 
            className={`btn icon-btn ${showHistoryPanel ? 'active' : ''}`}
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            title="会話履歴"
          >
            💬 {conversationHistory.length > 0 && <span className="btn-badge">{conversationHistory.length}</span>}
          </button>

          {/* メニュー開閉ボタン */}
          <button 
            className="btn icon-btn"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            title="メニュー"
          >
            🍔 メニュー
          </button>
        </div>
      </header>

      {/* 2モード切替タブ (部署共有 vs 個人用) */}
      <div className="mode-switch-tabs">
        <button 
          className={`mode-tab shared-tab ${activeTab === 'shared' ? 'active' : ''}`}
          onClick={() => setActiveTab('shared')}
        >
          <span className="tab-icon">🌐</span>
          <div className="tab-text">
            <span className="tab-title">部署共有ボード</span>
            <span className="tab-desc">部員全員とリアルタイム同期</span>
          </div>
        </button>

        <button 
          className={`mode-tab personal-tab ${activeTab === 'personal' ? 'active' : ''}`}
          onClick={() => setActiveTab('personal')}
        >
          <span className="tab-icon">👤</span>
          <div className="tab-text">
            <span className="tab-title">個人用ボード</span>
            <span className="tab-desc">自分専用・完全非公開</span>
          </div>
        </button>
      </div>

      {/* サブ操作メニューパネル */}
      {showMobileMenu && (
        <div className="menu-dropdown-overlay" onClick={() => setShowMobileMenu(false)}>
          <div className="menu-dropdown-content" onClick={e => e.stopPropagation()}>
            <div className="menu-dropdown-header">
              <h3>⚙️ 操作メニュー</h3>
              <button className="close-btn" onClick={() => setShowMobileMenu(false)}>✖</button>
            </div>
            <div className="menu-dropdown-list">
              <button className="menu-item-btn" onClick={toggleSound}>
                {soundEnabled ? '🔔 新着通知音: ON (タップでOFF)' : '🔕 新着通知音: OFF (タップでON)'}
              </button>
              <button className="menu-item-btn" onClick={togglePopup}>
                {popupEnabled ? '💬 ポップアップ通知: ON (タップでOFF)' : '🔕 ポップアップ通知: OFF (タップでON)'}
              </button>
              <button className="menu-item-btn" onClick={() => { setShowAddModal(true); setShowMobileMenu(false); }}>
                ＋ 手動タスク追加 ({activeTab === 'shared' ? '共有へ' : '個人用へ'})
              </button>
              <button className="menu-item-btn" onClick={() => { setShowHistoryPanel(true); setShowMobileMenu(false); }}>
                💬 会話・解析履歴 ({conversationHistory.length})
              </button>
              <button className="menu-item-btn" onClick={() => setAutoScroll(!autoScroll)}>
                📺 サイネージ表示: {autoScroll ? 'ON' : 'OFF'}
              </button>
              <button className="menu-item-btn" onClick={() => { setTempKey(apiKey); setShowSettings(true); setShowMobileMenu(false); }}>
                ⚙️ Gemini APIキー設定
              </button>
              <button className="menu-item-btn" onClick={() => { exportLogs(); setShowMobileMenu(false); }}>
                📥 解析ログダウンロード
              </button>
              <button className="menu-item-btn danger-item" onClick={() => { 
                if (window.confirm(`現在開いている「${activeTab === 'shared' ? '部署共有' : '個人用'}」のタスクをすべて消去しますか？`)) {
                  updateTasksForCurrentMode([]);
                }
                setShowMobileMenu(false); 
              }}>
                🗑️ {activeTab === 'shared' ? '共有' : '個人用'}タスクをクリア
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={{color: '#ef4444', marginBottom: 10, textAlign: 'center'}}>{error}</div>}

      {/* カンバンボード */}
      <div className="kanban-board">
        {renderColumn(STATUS.TODO, todoTasks, "TODO")}
        {renderColumn(STATUS.IN_PROGRESS, inProgressTasks, "IN_PROGRESS")}
        {renderColumn(STATUS.DONE, doneTasks, "DONE")}
      </div>

      {isListening && (
        <div className="speech-overlay">
          🎙️ 録音中...【{activeTab === 'shared' ? '部署共有' : '個人用'}】に追加されます
        </div>
      )}

      {isProcessing && (
        <div className="speech-overlay" style={{animation: 'none', background: 'rgba(66, 133, 244, 0.9)', borderColor: '#4285F4', color: 'white'}}>
          ✨ Gemini が音声をマルチモーダル直接解析中...
        </div>
      )}

      {!isListening && !isProcessing && lastTranscript && (
        <div className="speech-overlay" style={{animation: 'none', background: 'rgba(16, 185, 129, 0.9)', borderColor: '#10b981', color: 'white'}}>
          {lastTranscript}
        </div>
      )}

      {/* 手動追加モーダル */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px'
        }}>
          <form onSubmit={handleManualAddSubmit} style={{
            background: '#1e293b', padding: '25px', borderRadius: '12px', width: '100%', maxWidth: '450px',
            border: '1px solid #334155'
          }}>
            <h2 style={{marginTop: 0, color: 'white', fontSize: '1.3rem'}}>
              ＋ タスクを手動追加 ({activeTab === 'shared' ? '部署共有' : '個人用'})
            </h2>
            
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', color: '#cbd5e1', marginBottom: '6px'}}>病棟</label>
              <select 
                value={manualWard}
                onChange={e => setManualWard(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569',
                  background: '#0f172a', color: 'white'
                }}
              >
                <option value="指定なし">指定なし（一般業務）</option>
                <option value="1階">1階</option>
                <option value="2階">2階</option>
                <option value="HCU">HCU</option>
                <option value="SCU">SCU</option>
              </select>
            </div>

            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', color: '#cbd5e1', marginBottom: '6px'}}>患者ID (任意)</label>
              <input 
                type="text" 
                value={manualPatientId}
                onChange={e => setManualPatientId(e.target.value)}
                placeholder="例: 1234 (空欄の場合は共通/個人)"
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569',
                  background: '#0f172a', color: 'white', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{marginBottom: '20px'}}>
              <label style={{display: 'block', color: '#cbd5e1', marginBottom: '6px'}}>タスク内容 (必須)</label>
              <input 
                type="text" 
                required
                value={manualContent}
                onChange={e => setManualContent(e.target.value)}
                placeholder="例: バイタル測定、点滴確認"
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569',
                  background: '#0f172a', color: 'white', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
              <button type="button" className="btn" onClick={() => setShowAddModal(false)}>キャンセル</button>
              <button type="submit" className="btn active">追加する</button>
            </div>
          </form>
        </div>
      )}

      {/* 設定モーダル */}
      {showSettings && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px'
        }}>
          <div style={{
            background: '#1e293b', padding: '25px', borderRadius: '12px', width: '100%', maxWidth: '500px',
            border: '1px solid #334155'
          }}>
            <h2 style={{marginTop: 0, color: 'white', fontSize: '1.3rem'}}>⚙️ システム設定</h2>
            <div style={{marginBottom: '20px'}}>
              <label style={{display: 'block', color: '#cbd5e1', marginBottom: '8px'}}>Gemini APIキー</label>
              <input 
                type="password" 
                value={tempKey}
                onChange={e => setTempKey(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569',
                  background: '#0f172a', color: 'white', boxSizing: 'border-box'
                }}
                placeholder="AIzaSy..."
              />
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
              <button className="btn" onClick={() => setShowSettings(false)}>キャンセル</button>
              <button className="btn active" onClick={() => {
                setApiKey(tempKey);
                setShowSettings(false);
              }}>保存して閉じる</button>
            </div>
          </div>
        </div>
      )}

      <ConversationPanel 
        history={conversationHistory}
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        onClear={clearHistory}
      />
    </div>
  );
}

export default App;
