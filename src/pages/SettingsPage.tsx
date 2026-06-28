import { useState, useEffect } from 'react';
import { Save, Server, Key, Cpu, User, LogOut } from 'lucide-react';
import { Storage, type AISettings, type UserData } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  
  const [settings, setSettings] = useState<AISettings>({
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
    duplicatePreventionMode: 'seed'
  });
  const [userData, setUserData] = useState<UserData>({
    grade: '中1',
    name: '',
    streak: 0,
    lastStudyDate: '',
    level: 1,
    exp: 0,
    topicStats: {},
    detailedStats: {}
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const currentSettings = await Storage.getSettings();
        setSettings(currentSettings);
        // In Phase 3, this will be fetched from API, but for now we sync basic fields
        const localUser = await Storage.getUserData();
        if (user) {
          localUser.name = user.name;
          if (user.grade) localUser.grade = user.grade;
        }
        setUserData(localUser);
      } catch(e) {
        console.error(e);
      }
    }
    load();
  }, [user]);

  const handleChange = (field: keyof AISettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSettings(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleUserChange = (field: keyof UserData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setUserData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (user?.role === 'admin') {
        await Storage.saveSettings(settings);
      }
      await Storage.saveUserData(userData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      alert('設定の保存に失敗しました');
    }
  };

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            設定
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>アカウントとシステムの設定</p>
        </div>
        <button onClick={logout} className="action-btn" style={{ background: '#fee2e2', color: '#ef4444' }}>
          <LogOut size={20} /> ログアウト
        </button>
      </header>

      <form onSubmit={handleSave} className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <User size={18} color="var(--primary)" /> ユーザー設定
        </h3>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>ニックネーム</label>
          <input
            type="text"
            className="input-field"
            value={userData.name}
            onChange={handleUserChange('name')}
            placeholder="たろう"
            required
          />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>学年</label>
          <select
            className="input-field"
            value={userData.grade}
            onChange={handleUserChange('grade')}
            style={{ width: '100%', background: 'white' }}
          >
            <option value="中1">中学1年生</option>
            <option value="中2">中学2年生</option>
            <option value="中3">中学3年生</option>
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            学年に合わせた難易度の問題が生成されます。
          </p>
        </div>

        {user?.role === 'admin' && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '2rem 0' }} />

            <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={18} color="var(--primary)" /> AIエンジン設定 (管理者のみ)
            </h3>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                API エンドポイント
              </label>
              <input 
                type="url" 
                className="input-field" 
                value={settings.endpoint}
                onChange={handleChange('endpoint')}
                placeholder="https://api.openai.com/v1"
                required
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                ローカルLLMや他のプロバイダーを利用する場合はOpenAI互換のURLに変更してください。
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                <Key size={18} color="var(--primary)" />
                API キー
              </label>
              <input 
                type="password" 
                className="input-field" 
                value={settings.apiKey}
                onChange={handleChange('apiKey')}
                placeholder="sk-..."
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                <Cpu size={18} color="var(--primary)" />
                使用モデル名
              </label>
              <input 
                type="text" 
                className="input-field" 
                value={settings.model}
                onChange={handleChange('model')}
                placeholder="gpt-4o, llama-3-70b-instruct, etc."
                required
              />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                重複防止モード
              </label>
              <select
                className="input-field"
                value={settings.duplicatePreventionMode}
                onChange={handleChange('duplicatePreventionMode')}
                style={{ width: '100%', background: 'white' }}
              >
                <option value="seed">シード値ベース（軽量・推奨）</option>
                <option value="history">履歴ベース（より確実・通信量増）</option>
              </select>
            </div>
          </>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
          <Save size={20} />
          {saved ? '保存しました！' : '設定を保存'}
        </button>
      </form>
    </div>
  );
}
