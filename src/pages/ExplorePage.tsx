import { useState, useEffect, useCallback } from 'react';
import { Search, Globe, Play, GitFork, Loader2, Tag, User as UserIcon } from 'lucide-react';
import { Storage, type CustomDrillSet } from '../lib/storage';
import { useNavigate } from 'react-router-dom';

export default function ExplorePage() {
  const [drills, setDrills] = useState<CustomDrillSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [forkingId, setForkingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadDrills = useCallback(async () => {
    setLoading(true);
    try {
      const result = await Storage.exploreDrills({
        search: search || undefined,
        subject: subjectFilter,
        sort: sortBy
      });
      setDrills(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, subjectFilter, sortBy]);

  useEffect(() => {
    const timeout = setTimeout(loadDrills, 300);
    return () => clearTimeout(timeout);
  }, [loadDrills]);

  const handleFork = async (id: string) => {
    setForkingId(id);
    try {
      await Storage.forkDrillSet(id);
      alert('マイセットに追加しました！「オリジナル問題」から確認できます。');
    } catch (e) {
      alert('追加に失敗しました');
    } finally {
      setForkingId(null);
    }
  };

  const subjects = ['all', '国語', '数学', '英語', '理科', '社会'];

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Globe size={28} color="var(--primary)" /> 探す
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>みんなが作った問題を発見しよう</p>
      </header>

      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="input-field"
          placeholder="キーワードで検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: '2.75rem' }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {subjects.map(s => (
          <button
            key={s}
            className={`btn ${subjectFilter === s ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
            onClick={() => setSubjectFilter(s)}
          >
            {s === 'all' ? 'すべて' : s}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <select
          className="input-field"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
          style={{ width: 'auto', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
        >
          <option value="newest">新着順</option>
          <option value="oldest">古い順</option>
        </select>
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 className="animate-spin" size={32} color="var(--primary)" />
        </div>
      ) : drills.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Globe size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <p>公開されている問題セットがありません。</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            問題を作成して公開すると、ここに表示されます。
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {drills.map(set => (
            <div key={set.id} className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>{set.subject}</span>
                  <span className="badge" style={{ background: '#e2e8f0', color: 'var(--text)', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>{set.questions.length}問</span>
                  {set.tags && set.tags.length > 0 && set.tags.map((tag, i) => (
                    <span key={i} className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent)', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                      <Tag size={10} style={{ display: 'inline', marginRight: '0.2rem' }} />{tag}
                    </span>
                  ))}
                </div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{set.title}</h3>
                {set.description && (
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{set.description}</p>
                )}
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {set.author_name && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <UserIcon size={12} /> {set.author_name}
                    </span>
                  )}
                  <span>{set.createdAt ? new Date(set.createdAt).toLocaleDateString() : ''}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.875rem' }}
                  onClick={() => navigate(`/drill?mode=custom&setId=${set.id}`)}
                >
                  <Play size={16} style={{ marginRight: '0.25rem' }} /> プレイ
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  onClick={() => handleFork(set.id)}
                  disabled={forkingId === set.id}
                  title="自分のコレクションにコピー"
                >
                  {forkingId === set.id ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <><GitFork size={16} style={{ marginRight: '0.25rem' }} /> 追加</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
