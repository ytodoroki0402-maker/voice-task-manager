import React, { useState, useEffect } from 'react';
import './App.css';
import { useSpeech } from './hooks/useSpeech';
import { useAutoScroll } from './hooks/useAutoScroll';
import { parseAudioWithGemini, WARD_COLORS, STATUS } from './utils/commandParser';
import { logTaskEvent, exportLogs } from './utils/dataLogger';
import { ConversationPanel } from './components/ConversationPanel';

function App() {
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('tasks');
    if (saved) return JSON.parse(saved);
    return [
      { id: 1, patientId: "1234", ward: "1階", content: "バイタル確認", status: "未対応", timestamp: Date.now() },
      { id: 2, patientId: "共通", ward: "指定なし", content: "来月のシフト表の作成", status: "対応中", timestamp: Date.now() - 1000 }
    ];
  });
  
  const [conversationHistory, setConversationHistory] = useState(() => {
    const saved = localStorage.getItem('voice_chat_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || "";
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

  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

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

  const moveTaskStatus = (taskId, newStatus) => {
    setTasks(prev => {
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
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleManualAddSubmit = (e) => {
    e.preventDefault();
    if (!manualContent.trim()) return;

    const newTask = {
      id: Date.now(),
      patientId: manualPatientId.trim() || "共通",
      ward: manualWard,
      content: manualContent.trim(),
      status: STATUS.TODO,
      timestamp: Date.now()
    };

    setTasks(prev => [newTask, ...prev]);
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

      let aiMsg = "";
      const wardStr = parsed.ward && parsed.ward !== "指定なし" ? `[${parsed.ward}] ` : "";
      const idStr = parsed.id ? `(ID:${parsed.id}) ` : "";

      if (parsed.action === "ADD") {
        aiMsg = `${wardStr}${idStr}「${parsed.content}」を『未対応』に追加しました。`;
      } else if (parsed.action === "START") {
        aiMsg = `${wardStr}${idStr}「${parsed.content}」の対応を開始（『対応中』に移動）しました。`;
      } else if (parsed.action === "COMPLETE") {
        aiMsg = `${wardStr}${idStr}「${parsed.content}」を『完了』に移動しました。`;
      } else {
        aiMsg = parsed.transcribed_text ? `「${parsed.transcribed_text}」を認識しました。` : "音声入力コマンドを処理しました。";
      }

      addHistoryLog(parsed.transcribed_text || "", aiMsg, parsed.action, {
        ward: parsed.ward,
        id: parsed.id,
        content: parsed.content
      });

      setTasks(prev => {
        let newTasks = [...prev];
        
        if (parsed.action === "ADD") {
          const newTask = {
            id: Date.now(),
            patientId: parsed.id || "共通",
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
              patientId: parsed.id || "共通",
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

  const sortedTasks = [...tasks].sort((a, b) => b.timestamp - a.timestamp);
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
                <span className={`task-id ${task.patientId === "共通" ? "general" : ""}`}>
                  {task.patientId === "共通" ? "一般業務" : `ID: ${task.patientId}`}
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
    <div className="app-container">
      {/* 最上部ヘッダー */}
      <header className="header">
        <div className="app-title-area">
          <h1>🏥 薬剤部音声タスクマネージャー</h1>
          <span className="app-subtitle">✨ Gemini AI Powered (v2.0 モバイル版)</span>
        </div>
        
        <div className="header-actions">
          {/* 音声入力ボタン (メイン表示) */}
          <button 
            className={`btn btn-voice ${isListening ? 'active' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
          >
            {isListening ? '⏹️ 停止して解析' : '🎙️ 音声入力'}
          </button>

          {/* 会話履歴クイックボタン */}
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

      {/* サブ操作メニューパネル (モーダル風) */}
      {showMobileMenu && (
        <div className="menu-dropdown-overlay" onClick={() => setShowMobileMenu(false)}>
          <div className="menu-dropdown-content" onClick={e => e.stopPropagation()}>
            <div className="menu-dropdown-header">
              <h3>⚙️ 操作メニュー</h3>
              <button className="close-btn" onClick={() => setShowMobileMenu(false)}>✖</button>
            </div>
            <div className="menu-dropdown-list">
              <button className="menu-item-btn" onClick={() => { setShowAddModal(true); setShowMobileMenu(false); }}>
                ＋ 手動タスク追加
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
              <button className="menu-item-btn danger-item" onClick={() => { setTasks([]); setShowMobileMenu(false); }}>
                🗑️ 全タスクをクリア
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={{color: '#ef4444', marginBottom: 10, textAlign: 'center'}}>{error}</div>}

      {/* カンバンボード (画面幅に応じてレスポンシブ縦並び化) */}
      <div className="kanban-board">
        {renderColumn(STATUS.TODO, todoTasks, "TODO")}
        {renderColumn(STATUS.IN_PROGRESS, inProgressTasks, "IN_PROGRESS")}
        {renderColumn(STATUS.DONE, doneTasks, "DONE")}
      </div>

      {isListening && (
        <div className="speech-overlay">
          🎙️ 録音中... 話し終わったら「停止して解析」ボタンを押してください
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
            <h2 style={{marginTop: 0, color: 'white', fontSize: '1.3rem'}}>＋ タスクを手動追加</h2>
            
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
                placeholder="例: 1234 (空欄の場合は共通業務)"
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
