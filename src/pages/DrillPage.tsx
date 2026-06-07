import { useState, useEffect, useRef } from 'react';
import { Lightbulb, CheckCircle2, XCircle, ArrowRight, Bot, Loader2, MessageSquare } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { generateDrills, type DrillQuestion } from '../lib/ai';
import { Storage } from '../lib/storage';

export default function DrillPage() {
  const [questionQueue, setQuestionQueue] = useState<DrillQuestion[]>([]);
  const [question, setQuestion] = useState<DrillQuestion | null>(null);
  
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedback, setFeedback] = useState('');
  
  const [hintLevel, setHintLevel] = useState(0); // 0: none, 1: hint1, 2: hint2
  
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);
  
  const [expResult, setExpResult] = useState<{gainedExp: number, leveledUp: boolean} | null>(null);

  const startTimeRef = useRef<number>(0);
  const initialized = useRef(false);
  const navigate = useNavigate();
  
  const [searchParams] = useSearchParams();
  const subjectParam = searchParams.get('subject') || '数学';
  const topicParam = searchParams.get('topic');

  const fetchQuestions = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    let topic = topicParam || "ランダムな基礎計算や方程式";
    if (!topicParam) {
      if (subjectParam === '英語') topic = "英単語や基本文法（和訳・英訳）";
      if (subjectParam === '理科') topic = "理科の基礎知識（一問一答）";
      if (subjectParam === '社会') topic = "歴史や地理の基礎（一問一答）";
      if (subjectParam === '国語') topic = "漢字の読み書きや四字熟語、ことわざ";
    }

    const qs = await generateDrills(subjectParam, topic, 3);
    
    if (qs.length === 0 && !Storage.getSettings().apiKey) {
      qs.push({
        subject: subjectParam,
        topic: "API未設定",
        questionText: "APIキーが設定されていません。設定画面でキーを登録してください。",
        choices: ["設定画面へ", "キャンセル", "ヘルプ", "閉じる"],
        correctAnswer: "",
        explanation: "APIキーを設定すると問題が自動生成されます。",
        hint1: "設定画面を確認してください。",
        hint2: "APIキーが必要です。"
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
      const nextQ = questionQueue[0];
      setQuestion(nextQ);
      setQuestionQueue(prev => prev.slice(1));
      startTimeRef.current = Date.now();
      setIsLoading(false);
    }
  }, [question, questionQueue]);

  const handleSubmit = async (selectedAnswer: string) => {
    if (!question || isAnswered) return;
    
    const isCorrectAnswer = selectedAnswer === question.correctAnswer;
    
    setIsAnswered(true);
    setIsCorrect(isCorrectAnswer);
    setFeedback(question.explanation);
    
    // 学習記録の保存
    const timeSpentMs = Date.now() - startTimeRef.current;
    const timeSpentMin = Math.max(1, Math.round(timeSpentMs / 60000));
    const studyRecordResult = Storage.addStudyResult(subjectParam, question.topic, timeSpentMin, isCorrectAnswer);
    setExpResult(studyRecordResult);
  };

  const handleGetHint = () => {
    if (!question) return;
    setHintLevel(prev => Math.min(prev + 1, 2));
  };

  const handleNext = () => {
    setIsAnswered(false);
    setIsCorrect(false);
    setFeedback('');
    setHintLevel(0);
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
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>次の問題を解きましょう</h2>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{question.questionText}</p>
        </div>

        {hintLevel > 0 && (
          <div className="glass-panel animate-fade-in" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--accent)', background: 'rgba(245, 158, 11, 0.05)' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <Bot color="var(--accent)" size={20} style={{ marginTop: '0.25rem' }} />
              <div>
                <h4 style={{ margin: 0, color: 'var(--accent)', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                  AIヒント ({hintLevel}/2)
                </h4>
                <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {hintLevel === 1 ? question.hint1 : question.hint2}
                </p>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          {!isAnswered ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                {question.choices.map((choice, idx) => (
                  <button
                    key={idx}
                    className="btn"
                    style={{
                      padding: '1.25rem 1rem',
                      background: 'white',
                      border: '2px solid var(--primary-light)',
                      color: 'var(--primary)',
                      fontWeight: 700,
                      fontSize: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                    onClick={() => handleSubmit(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ gap: '0.5rem' }}
                  onClick={handleGetHint}
                  disabled={hintLevel >= 2}
                >
                  <Lightbulb size={18} /> {hintLevel === 0 ? 'ヒントを見る' : 'さらにヒントを見る'}
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-panel animate-slide-up" style={{ 
              padding: '2rem', 
              textAlign: 'center',
              border: `2px solid ${isCorrect ? 'var(--secondary)' : '#ef4444'}`
            }}>
              {isCorrect ? (
                <>
                  <CheckCircle2 size={56} color="var(--secondary)" style={{ margin: '0 auto 0.5rem' }} />
                  <h2 style={{ color: 'var(--secondary)', margin: '0 0 0.5rem 0' }}>正解です！</h2>
                </>
              ) : (
                <>
                  <XCircle size={56} color="#ef4444" style={{ margin: '0 auto 0.5rem' }} />
                  <h2 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>おしい！</h2>
                  <p style={{ marginBottom: '1rem' }}>正解は <strong>{question.correctAnswer}</strong> でした。</p>
                </>
              )}
              
              <div style={{ background: 'var(--bg-gradient-start)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', textAlign: 'left', borderLeft: '4px solid var(--primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>
                  <MessageSquare size={18} />
                  <strong style={{ fontSize: '0.9rem' }}>AIからの講評:</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{feedback || question.explanation}</p>
              </div>

              {expResult && (
                <div style={{ background: 'rgba(79, 70, 229, 0.05)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>
                    ✨ +{expResult.gainedExp} EXP 獲得！
                  </p>
                  {expResult.leveledUp && (
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>
                      🎉 レベルアップしました！
                    </p>
                  )}
                </div>
              )}
              
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
