import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, MessageCircle } from 'lucide-react';
import { chatWithTutor, type ChatMessage, type DrillQuestion } from '../lib/ai';

interface AIChatModalProps {
  currentQuestion: DrillQuestion;
}

export default function AIChatModal({ currentQuestion }: AIChatModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // If question changes, reset chat
  useEffect(() => {
    setMessages([]);
    setIsOpen(false);
  }, [currentQuestion]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    const reply = await chatWithTutor(newMessages, currentQuestion);
    
    if (reply) {
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } else {
      setMessages([...newMessages, { role: 'assistant', content: 'エラーが発生しました。設定画面でAPIキーを確認してください。' }]);
    }
    
    setIsLoading(false);
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          className="btn btn-primary animate-fade-in"
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '4rem',
            height: '4rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.4)',
            zIndex: 50
          }}
          onClick={() => setIsOpen(true)}
          title="AIに質問する"
        >
          <MessageCircle size={32} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="glass-panel animate-slide-up"
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '350px',
            maxWidth: 'calc(100vw - 4rem)',
            height: '500px',
            maxHeight: 'calc(100vh - 4rem)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            zIndex: 50,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '1rem',
            background: 'var(--primary)',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTopLeftRadius: '0.75rem',
            borderTopRightRadius: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bot size={20} />
              <strong style={{ fontSize: '1rem' }}>AIチューター</strong>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.25rem'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            background: 'rgba(255, 255, 255, 0.5)'
          }}>
            {messages.length === 0 && (
              <div style={{
                textAlign: 'center',
                color: 'var(--text-muted)',
                marginTop: 'auto',
                marginBottom: 'auto',
                fontSize: '0.9rem'
              }}>
                この問題についてわからないことを質問してください。<br />
                （答えは直接教えませんが、ヒントを出してサポートします）
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: msg.role === 'user' ? 'var(--primary)' : 'white',
                color: msg.role === 'user' ? 'white' : 'var(--text)',
                padding: '0.75rem 1rem',
                borderRadius: '1rem',
                borderBottomRightRadius: msg.role === 'user' ? '0' : '1rem',
                borderBottomLeftRadius: msg.role === 'assistant' ? '0' : '1rem',
                boxShadow: 'var(--shadow-sm)',
                fontSize: '0.9rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div style={{
                alignSelf: 'flex-start',
                background: 'white',
                padding: '0.75rem 1rem',
                borderRadius: '1rem',
                borderBottomLeftRadius: '0',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <Loader2 size={16} className="animate-spin" color="var(--primary)" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{
            padding: '1rem',
            borderTop: '1px solid var(--border)',
            background: 'white',
            borderBottomLeftRadius: '0.75rem',
            borderBottomRightRadius: '0.75rem'
          }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="input-field"
                style={{ flex: 1, marginBottom: 0, padding: '0.5rem 1rem', borderRadius: '1.5rem' }}
                placeholder="質問を入力..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                disabled={isLoading}
              />
              <button
                className="btn btn-primary"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  padding: 0,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
