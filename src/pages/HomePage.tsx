import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Flame, Settings, BookOpen, Globe, Beaker, Library } from 'lucide-react';
import { Storage, type UserData } from '../lib/storage';

export default function HomePage() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    setUserData(Storage.getUserData());
    setHasApiKey(!!Storage.getSettings().apiKey);
  }, []);

  if (!userData) return null;

  const expNeeded = userData.level * 50;
  const expPercent = Math.min(100, Math.round((userData.exp / expNeeded) * 100));

  const subjects = [
    { id: 'math', name: '数学', icon: <BookOpen size={24} color="var(--primary)" />, color: 'rgba(79, 70, 229, 0.1)' },
    { id: 'english', name: '英語', icon: <Globe size={24} color="#ec4899" />, color: 'rgba(236, 72, 153, 0.1)' },
    { id: 'science', name: '理科', icon: <Beaker size={24} color="#10b981" />, color: 'rgba(16, 185, 129, 0.1)' },
    { id: 'social', name: '社会', icon: <Library size={24} color="#f59e0b" />, color: 'rgba(245, 158, 11, 0.1)' },
    { id: 'japanese', name: '国語', icon: <BookOpen size={24} color="#6366f1" />, color: 'rgba(99, 102, 241, 0.1)' },
  ];

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          おかえりなさい、<span style={{ color: 'var(--primary)' }}>{userData.name}</span>さん！
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>今日のミッションをクリアしよう🚀</p>
      </header>

      {!hasApiKey && (
        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Settings color="#ef4444" size={24} />
            <div>
              <h4 style={{ margin: 0, color: '#ef4444' }}>API設定が必要です</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', marginTop: '0.25rem' }}>
                設定画面からOpenAI APIキーを設定すると、AIドリルが始まります。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'var(--primary)', color: 'white', padding: '0.5rem 1rem', borderRadius: '1rem', fontWeight: 800 }}>
              Lv. {userData.level}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              あと {expNeeded - userData.exp} EXP
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Flame color={userData.streak > 0 ? "var(--accent)" : "var(--text-muted)"} size={24} />
            <span style={{ fontWeight: 800, fontSize: '1.25rem', color: userData.streak > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
              {userData.streak}
            </span>
          </div>
        </div>
        <div style={{ background: '#e2e8f0', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ width: `${expPercent}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary-light), var(--primary))', borderRadius: '6px', transition: 'width 0.5s ease' }}></div>
        </div>
      </div>

      <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>教科を選ぶ</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {subjects.map(subject => (
          <Link 
            key={subject.id} 
            to={`/drill?subject=${encodeURIComponent(subject.name)}`} 
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ background: subject.color, padding: '0.75rem', borderRadius: '50%' }}>
                  {subject.icon}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.125rem' }}>{userData.grade} {subject.name}</h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>AIおすすめ単元</p>
                </div>
              </div>
              <div className="btn btn-primary" style={{ padding: '0.5rem 1rem', borderRadius: '1rem' }}>
                <Play size={16} /> スタート
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
