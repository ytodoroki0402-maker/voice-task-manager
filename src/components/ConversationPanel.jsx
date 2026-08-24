import React, { useEffect, useRef } from 'react';

export function ConversationPanel({ history, isOpen, onClose, onClear }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, isOpen]);

  if (!isOpen) return null;

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getActionBadgeClass = (action) => {
    switch (action) {
      case 'ADD': return 'badge-add';
      case 'START': return 'badge-start';
      case 'COMPLETE': return 'badge-complete';
      case 'ERROR': return 'badge-error';
      default: return 'badge-default';
    }
  };

  const getActionText = (action) => {
    switch (action) {
      case 'ADD': return 'タスク追加';
      case 'START': return '対応開始';
      case 'COMPLETE': return 'タスク完了';
      case 'ERROR': return 'エラー';
      default: return '認識ログ';
    }
  };

  return (
    <div className="conversation-drawer">
      <div className="drawer-header">
        <div className="drawer-title">
          <span>💬 音声会話・解析履歴</span>
          <span className="history-count-badge">{history.length} 件</span>
        </div>
        <div className="drawer-actions">
          {history.length > 0 && (
            <button className="btn btn-sm danger-text" onClick={onClear} title="履歴を消去">
              🗑️ クリア
            </button>
          )}
          <button className="close-btn" onClick={onClose} title="閉じる">
            ✖
          </button>
        </div>
      </div>

      <div className="drawer-body">
        {history.length === 0 ? (
          <div className="empty-history">
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🎙️</div>
            <p>音声入力の会話履歴はまだありません。</p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
              マイクボタンを押して喋ると、発言内容とGemini AIの分類結果がここに記録されます。
            </p>
          </div>
        ) : (
          <div className="chat-timeline">
            {history.map((item) => (
              <div key={item.id} className={`chat-item ${item.isError ? 'has-error' : ''}`}>
                <div className="chat-timestamp">{formatTime(item.timestamp)}</div>

                <div className="user-bubble">
                  <span className="bubble-icon">🎙️</span>
                  <div className="bubble-content">
                    <div className="bubble-label">音声入力</div>
                    <div className="bubble-text">「{item.userText || "（音声認識なし）"}」</div>
                  </div>
                </div>

                <div className="ai-bubble">
                  <span className="bubble-icon">✨</span>
                  <div className="bubble-content">
                    <div className="ai-header">
                      <span className="bubble-label">Gemini AI 解析</span>
                      {item.action && (
                        <span className={`action-badge ${getActionBadgeClass(item.action)}`}>
                          {getActionText(item.action)}
                        </span>
                      )}
                    </div>

                    <div className="ai-result-text">
                      {item.aiResponse}
                    </div>

                    {item.parsedDetails && !item.isError && (
                      <div className="parsed-details">
                        {item.parsedDetails.ward && item.parsedDetails.ward !== '指定なし' && (
                          <span className="detail-tag ward">病棟: {item.parsedDetails.ward}</span>
                        )}
                        {item.parsedDetails.id && (
                          <span className="detail-tag patient">ID: {item.parsedDetails.id}</span>
                        )}
                        {item.parsedDetails.content && (
                          <span className="detail-tag content">内容: {item.parsedDetails.content}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
