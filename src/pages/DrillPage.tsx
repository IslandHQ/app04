import { useState, useEffect, useRef } from 'react';
import { Lightbulb, CheckCircle2, XCircle, ArrowRight, Bot, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { generateDrills, generateHint, type DrillQuestion } from '../lib/ai';
import { Storage } from '../lib/storage';

export default function DrillPage() {
  const [questionQueue, setQuestionQueue] = useState<DrillQuestion[]>([]);
  const [question, setQuestion] = useState<DrillQuestion | null>(null);
  
  const [answer, setAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const isFetchingRef = useRef(false);
  
  const [expResult, setExpResult] = useState<{gainedExp: number, leveledUp: boolean} | null>(null);

  const startTimeRef = useRef<number>(Date.now());
  const initialized = useRef(false);
  const navigate = useNavigate();
  
  const [searchParams] = useSearchParams();
  const subjectParam = searchParams.get('subject') || '数学';

  const fetchQuestions = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    const userData = Storage.getUserData();
    let topic = "ランダムな基礎計算や方程式";
    if (subjectParam === '英語') topic = "英単語や基本文法（和訳・英訳）";
    if (subjectParam === '理科') topic = "理科の基礎知識（一問一答）";
    if (subjectParam === '社会') topic = "歴史や地理の基礎（一問一答）";
    if (subjectParam === '国語') topic = "漢字の読み書きや四字熟語、ことわざ";

    const qs = await generateDrills(`${userData.grade} ${subjectParam}`, topic, 3);
    
    if (qs.length === 0 && !Storage.getSettings().apiKey) {
      qs.push({
        subject: subjectParam,
        topic: "API未設定",
        questionText: "APIキーが設定されていません。設定画面でキーを登録してください。",
        correctAnswer: "",
        explanation: "APIキーを設定すると問題が自動生成されます。"
      });
    }

    setQuestionQueue(prev => [...prev, ...qs]);
    isFetchingRef.current = false;
  };

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetchQuestions();
    }
  }, []);

  // キューから問題を取り出す
  useEffect(() => {
    if (!question && questionQueue.length > 0) {
      setQuestion(questionQueue[0]);
      setQuestionQueue(prev => prev.slice(1));
      startTimeRef.current = Date.now();
      setIsLoading(false);
    }
  }, [question, questionQueue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer || !question) return;
    
    setIsAnswered(true);
    
    // 正誤判定
    const normalizedUser = answer.trim().toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const normalizedCorrect = question.correctAnswer.trim().toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    
    const correct = normalizedUser === normalizedCorrect;
    setIsCorrect(correct);
    
    // 学習記録の保存
    const timeSpentMs = Date.now() - startTimeRef.current;
    const timeSpentMin = Math.max(1, Math.round(timeSpentMs / 60000));
    const result = Storage.addStudyResult(subjectParam, timeSpentMin, correct);
    setExpResult(result);
  };

  const handleGetHint = async () => {
    if (!question) return;
    setShowHint(true);
    setIsHintLoading(true);
    const hint = await generateHint(question, answer || "わからない");
    setHintText(hint);
    setIsHintLoading(false);
  };

  const handleNext = () => {
    setAnswer('');
    setIsAnswered(false);
    setIsCorrect(false);
    setShowHint(false);
    setHintText('');
    setExpResult(null);
    setQuestion(null); // useEffectによって次の問題がキューから自動的に取り出される
    
    // 残りのキューが少なくなったら裏で追加フェッチしておく（待ち時間ゼロにするため）
    if (questionQueue.length <= 1) {
      fetchQuestions();
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 className="animate-spin" size={48} color="var(--primary)" />
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>AIが {subjectParam} の問題を生成しています...</p>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100vh - 8rem)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div className="badge badge-primary">{question.subject} - {question.topic}</div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>次の問題を解きましょう</h2>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{question.questionText}</p>
        </div>

        {showHint && (
          <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', marginBottom: '2rem', borderLeft: '4px solid var(--accent)' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <Bot color="var(--accent)" size={24} style={{ marginTop: '0.25rem' }} />
              <div>
                <h4 style={{ margin: 0, color: 'var(--accent)', marginBottom: '0.5rem' }}>AIチューターからのヒント</h4>
                {isHintLoading ? (
                  <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Loader2 className="animate-spin" size={16} /> ヒントを考え中...
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {hintText}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          {!isAnswered ? (
            <form onSubmit={handleSubmit}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="答えを入力..." 
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                style={{ fontSize: '1.25rem', textAlign: 'center', marginBottom: '1rem', padding: '1rem' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={handleGetHint}
                  disabled={showHint || isHintLoading}
                >
                  <Lightbulb size={20} /> ヒント
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  解答する
                </button>
              </div>
            </form>
          ) : (
            <div className="glass-panel animate-slide-up" style={{ 
              padding: '2rem', 
              textAlign: 'center',
              border: `2px solid ${isCorrect ? 'var(--secondary)' : '#ef4444'}`
            }}>
              {isCorrect ? (
                <>
                  <CheckCircle2 size={64} color="var(--secondary)" style={{ margin: '0 auto 0.5rem' }} />
                  <h2 style={{ color: 'var(--secondary)', margin: 0 }}>大正解！</h2>
                </>
              ) : (
                <>
                  <XCircle size={64} color="#ef4444" style={{ margin: '0 auto 0.5rem' }} />
                  <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>おしい！</h2>
                  <p style={{ marginBottom: '1rem' }}>正解は <strong>{question.correctAnswer}</strong> です。</p>
                </>
              )}
              
              {expResult && (
                <div style={{ background: 'var(--bg-gradient-start)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>
                    ✨ +{expResult.gainedExp} EXP 獲得！ ✨
                  </p>
                  {expResult.leveledUp && (
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)', animation: 'pulse-glow 2s infinite' }}>
                      🎉 レベルアップしました！ 🎉
                    </p>
                  )}
                </div>
              )}

              <div style={{ background: isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                <strong>AI解説:</strong>
                <p style={{ margin: 0, fontSize: '0.9rem', marginTop: '0.5rem', lineHeight: 1.5 }}>{question.explanation}</p>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => navigate('/')}>
                  終了する
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleNext}>
                  次の問題へ <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
