import { useState, useEffect } from 'react';
import { Save, Server, Key, Cpu } from 'lucide-react';
import { Storage, type AISettings } from '../lib/storage';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AISettings>({
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o'
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(Storage.getSettings());
  }, []);

  const handleChange = (field: keyof AISettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    Storage.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          システム設定
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>AI自動問題生成・チューターの設定</p>
      </header>

      <form onSubmit={handleSave} className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            <Server size={18} color="var(--primary)" />
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

        <div style={{ marginBottom: '2rem' }}>
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

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
          <Save size={20} />
          {saved ? '保存しました！' : '設定を保存'}
        </button>
      </form>
    </div>
  );
}
