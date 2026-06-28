import { useState, useEffect } from 'react';
import { Storage, type CustomDrillSet } from '../lib/storage';
import { generateDrills, type DrillQuestion } from '../lib/ai';
import { Loader2, Plus, Edit3, Trash2, Save, Play, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CustomDrillPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'edit'>('list');
  const [savedSets, setSavedSets] = useState<CustomDrillSet[]>([]);
  const navigate = useNavigate();

  // Create Form State
  const [subjectType, setSubjectType] = useState('英語');
  const [customSubject, setCustomSubject] = useState('');
  const actualSubject = subjectType === 'custom' ? customSubject : subjectType;

  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [count, setCount] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<DrillQuestion[]>([]);
  
  // Editor State
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [setTitle, setSetTitle] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const loadSavedSets = async () => {
    setSavedSets(await Storage.getCustomDrillSets());
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSavedSets();
  }, []);

  const getErrorMessage = (error: unknown) => {
    return error instanceof Error ? error.message : String(error);
  };

  const handleGenerate = async () => {
    if (subjectType === 'custom' && !customSubject) return alert('カスタム教科名を入力してください');
    if (!topic) return alert('単元を入力してください');
    setIsGenerating(true);
    setGeneratedQuestions([]);
    setCurrentQuestionIndex(0);
    
    try {
      const qs = await generateDrills(actualSubject, topic, count, [], undefined, instructions);
      if (qs.length > 0) {
        setGeneratedQuestions(qs);
        setSetTitle(`${actualSubject} - ${topic} のオリジナル問題`);
      } else {
        alert('問題の生成に失敗しました。');
      }
    } catch (err: unknown) {
      alert(`エラー: ${getErrorMessage(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMore = async () => {
    if (subjectType === 'custom' && !customSubject) return alert('カスタム教科名を入力してください');
    if (!topic) return alert('単元を入力してください');
    setIsGenerating(true);
    try {
      const qs = await generateDrills(actualSubject, topic, count, [], undefined, instructions);
      if (qs.length > 0) {
        setGeneratedQuestions(prev => [...prev, ...qs]);
        setCurrentQuestionIndex(generatedQuestions.length);
      } else {
        alert('問題の生成に失敗しました。');
      }
    } catch (err: unknown) {
      alert(`エラー: ${getErrorMessage(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSet = async () => {
    if (!setTitle) return alert('タイトルを入力してください');
    if (generatedQuestions.length === 0) return alert('問題がありません');
    
    const newSet: CustomDrillSet = {
      id: editingSetId || Date.now().toString(),
      title: setTitle,
      subject: actualSubject,
      topic,
      createdAt: editingSetId ? savedSets.find(s => s.id === editingSetId)?.createdAt || Date.now() : Date.now(),
      questions: generatedQuestions
    };
    await Storage.saveCustomDrillSet(newSet);
    await loadSavedSets();
    setActiveTab('list');
    setEditingSetId(null);
    setGeneratedQuestions([]);
    setTopic('');
    setInstructions('');
  };

  const handleEdit = (set: CustomDrillSet) => {
    setEditingSetId(set.id);
    const isStandardSubject = ['国語', '数学', '英語', '理科', '社会'].includes(set.subject);
    if (isStandardSubject) {
      setSubjectType(set.subject);
      setCustomSubject('');
    } else {
      setSubjectType('custom');
      setCustomSubject(set.subject);
    }
    setTopic(set.topic);
    setSetTitle(set.title);
    setGeneratedQuestions(set.questions);
    setCurrentQuestionIndex(0);
    setActiveTab('edit');
  };

  const handleDelete = (id: string) => {
    if (window.confirm('本当に削除しますか？')) {
      void (async () => {
        await Storage.deleteCustomDrillSet(id);
        await loadSavedSets();
      })();
    }
  };

  const handleDeleteQuestion = () => {
    if (generatedQuestions.length <= 1) {
      alert('問題は最低1問必要です。');
      return;
    }
    if (window.confirm('この問題を削除しますか？')) {
      const newQs = [...generatedQuestions];
      newQs.splice(currentQuestionIndex, 1);
      setGeneratedQuestions(newQs);
      if (currentQuestionIndex >= newQs.length) {
        setCurrentQuestionIndex(newQs.length - 1);
      }
    }
  };

  const updateCurrentQuestion = (field: keyof DrillQuestion, value: DrillQuestion[keyof DrillQuestion]) => {
    const newQs = [...generatedQuestions];
    newQs[currentQuestionIndex] = { ...newQs[currentQuestionIndex], [field]: value };
    setGeneratedQuestions(newQs);
  };

  const updateChoice = (index: number, value: string) => {
    const newQs = [...generatedQuestions];
    const newChoices = [...newQs[currentQuestionIndex].choices];
    newChoices[index] = value;
    newQs[currentQuestionIndex].choices = newChoices;
    
    // If the correct answer matches the old choice, update it too?
    // Kept simple for now. User must ensure correctAnswer matches one of the choices.
    setGeneratedQuestions(newQs);
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          オリジナル問題をつくる
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>AIを使って自分専用のドリルセットを作成・管理</p>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button 
          className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('list')}
          style={{ flex: 1 }}
        >
          保存済みセット
        </button>
        <button 
          className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setActiveTab('create');
            setEditingSetId(null);
            setGeneratedQuestions([]);
            setTopic('');
            setSetTitle('');
          }}
          style={{ flex: 1 }}
        >
          <Plus size={18} /> 新しく作る
        </button>
      </div>

      {activeTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {savedSets.length === 0 ? (
            <div className="glass-panel" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Edit3 size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <p>まだ保存された問題セットがありません。<br/>「新しく作る」からAIに問題を作ってもらいましょう！</p>
            </div>
          ) : (
            savedSets.map(set => (
              <div key={set.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>{set.subject}</span>
                      <span className="badge" style={{ background: '#e2e8f0', color: 'var(--text)', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>{set.questions.length}問</span>
                    </div>
                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{set.title}</h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>作成日: {new Date(set.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn" style={{ background: 'transparent', color: 'var(--primary)', padding: '0.5rem' }} onClick={() => handleEdit(set)} title="編集">
                      <Edit3 size={18} />
                    </button>
                    <button className="btn" style={{ background: 'transparent', color: '#ef4444', padding: '0.5rem' }} onClick={() => handleDelete(set.id)} title="削除">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1, padding: '0.5rem' }}
                    onClick={() => navigate(`/drill?mode=custom&setId=${set.id}`)}
                  >
                    <Play size={16} style={{ marginRight: '0.25rem' }} /> プレイ
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'create' && generatedQuestions.length === 0 && (
        <div className="glass-panel animate-slide-up" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>どんな問題を作りますか？</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>教科</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select 
                className="input-field" 
                value={subjectType} 
                onChange={e => setSubjectType(e.target.value)}
                disabled={isGenerating}
                style={{ flex: subjectType === 'custom' ? '0 0 120px' : '1' }}
              >
                <option value="国語">国語</option>
                <option value="数学">数学</option>
                <option value="英語">英語</option>
                <option value="理科">理科</option>
                <option value="社会">社会</option>
                <option value="custom">カスタム</option>
              </select>
              {subjectType === 'custom' && (
                <input
                  type="text"
                  className="input-field"
                  placeholder="例: プログラミング"
                  value={customSubject}
                  onChange={e => setCustomSubject(e.target.value)}
                  disabled={isGenerating}
                  style={{ flex: 1 }}
                />
              )}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>単元・テーマ <span style={{ color: '#ef4444' }}>*</span></label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="例: 中1 英語 疑問詞" 
              value={topic}
              onChange={e => setTopic(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>問題数 (1〜10問)</label>
            <input 
              type="number" 
              className="input-field" 
              min="1" 
              max="10" 
              value={count}
              onChange={e => setCount(parseInt(e.target.value) || 1)}
              disabled={isGenerating}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>追加の指示（オプション）</label>
            <textarea 
              className="input-field" 
              placeholder="例: 恐竜に関する英単語の問題にしてください。&#10;例: 難しめの引っ掛け問題を含めてください。"
              rows={3}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '1rem' }}
            onClick={handleGenerate}
            disabled={isGenerating || !topic}
          >
            {isGenerating ? (
              <><Loader2 className="animate-spin" size={20} style={{ marginRight: '0.5rem' }} /> AIが問題を生成中...</>
            ) : (
              'AIで問題を生成する'
            )}
          </button>
        </div>
      )}

      {((activeTab === 'create' && generatedQuestions.length > 0) || activeTab === 'edit') && (
        <div className="animate-slide-up">
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1rem', border: '2px solid var(--primary-light)' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>セットのタイトル <span style={{ color: '#ef4444' }}>*</span></label>
              <input 
                type="text" 
                className="input-field" 
                value={setTitle}
                onChange={e => setSetTitle(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveSet}>
              <Save size={18} style={{ marginRight: '0.5rem' }} /> この問題セットを保存する
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.5rem' }}
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex(i => i - 1)}
              >
                <ChevronLeft size={20} />
              </button>
              <div style={{ fontWeight: 800, color: 'var(--primary)' }}>
                {currentQuestionIndex + 1} / {generatedQuestions.length} 問目
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.5rem' }}
                disabled={currentQuestionIndex === generatedQuestions.length - 1}
                onClick={() => setCurrentQuestionIndex(i => i + 1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button className="btn" style={{ background: 'transparent', color: '#ef4444', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={handleDeleteQuestion}>
                <Trash2 size={16} style={{ marginRight: '0.25rem' }} /> この問題を削除
              </button>
            </div>

            {(() => {
              const q = generatedQuestions[currentQuestionIndex];
              return (
                <div className="animate-fade-in" key={currentQuestionIndex}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>問題文</label>
                    <textarea 
                      className="input-field" 
                      rows={3} 
                      value={q.questionText}
                      onChange={e => updateCurrentQuestion('questionText', e.target.value)}
                    />
                  </div>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>選択肢 (正解は必ずこの中の1つと一致させてください)</label>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {q.choices.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-muted)', width: '20px' }}>{i+1}.</span>
                          <input 
                            type="text" 
                            className="input-field" 
                            value={c}
                            onChange={e => updateChoice(i, e.target.value)}
                            style={{ flex: 1, padding: '0.5rem', border: c === q.correctAnswer ? '2px solid var(--secondary)' : undefined }}
                          />
                          <button 
                            className="btn" 
                            style={{ padding: '0.5rem', background: c === q.correctAnswer ? 'var(--secondary)' : '#e2e8f0', color: c === q.correctAnswer ? 'white' : 'var(--text-muted)' }}
                            onClick={() => updateCurrentQuestion('correctAnswer', c)}
                            title="これを正解にする"
                          >
                            <Check size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>解説</label>
                    <textarea 
                      className="input-field" 
                      rows={3} 
                      value={q.explanation}
                      onChange={e => updateCurrentQuestion('explanation', e.target.value)}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ヒント1</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={q.hint1}
                      onChange={e => updateCurrentQuestion('hint1', e.target.value)}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ヒント2</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={q.hint2}
                      onChange={e => updateCurrentQuestion('hint2', e.target.value)}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem' }}>
            <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>更に問題を追加生成</h4>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>追加数 (1〜10問)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  min="1" 
                  max="10" 
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value) || 1)}
                  disabled={isGenerating}
                />
              </div>
              <div style={{ flex: 2, minWidth: '300px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>追加の指示（オプション）</label>
                <input 
                  type="text"
                  className="input-field" 
                  placeholder="追加生成時の指示があれば入力"
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  disabled={isGenerating}
                />
              </div>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', padding: '0.75rem', marginTop: '1rem' }}
              onClick={handleGenerateMore}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <><Loader2 className="animate-spin" size={18} style={{ marginRight: '0.5rem' }} /> AIが追加生成中...</>
              ) : (
                <><Plus size={18} style={{ marginRight: '0.5rem' }} /> {count}問 追加生成する</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
