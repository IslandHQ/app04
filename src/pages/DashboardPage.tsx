import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock, CheckSquare, Target, AlertTriangle, Users, ChevronLeft, MessageSquare, Bot, User as UserIcon } from 'lucide-react';
import { Storage, type UserData } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';

interface ChartData {
  name: string;
  time: number;
  totalQuestions: number;
  correctAnswers: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  
  // Admin state
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adminChatLogs, setAdminChatLogs] = useState<any[]>([]);
  
  // Personal/Detailed state
  const [records, setRecords] = useState<ChartData[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (user?.role === 'admin' && !selectedUserId) {
          const usersList = await Storage.getAdminUsers();
          setAdminUsers(usersList);
          return;
        }

        let rawRecords: any[] = [];
        let targetUser: any = null;

        if (user?.role === 'admin' && selectedUserId) {
          rawRecords = await Storage.getAdminUserRecords(selectedUserId);
          const cLogs = await Storage.getAdminUserChatLogs(selectedUserId);
          setAdminChatLogs(cLogs);
          const u = adminUsers.find(x => x.id === selectedUserId);
          if (u) {
            targetUser = {
              grade: u.grade,
              name: u.name,
              streak: u.streak,
              lastStudyDate: u.last_study_date,
              level: u.level,
              exp: u.exp,
              topicStats: {},
              detailedStats: {}
            };
          }
        } else {
          rawRecords = await Storage.getDailyRecords();
          targetUser = await Storage.getUserData();
        }
        
        setUserData(targetUser);

        const today = new Date();
        const last7Days: ChartData[] = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - (6 - i));
          const dateStr = d.toISOString().split('T')[0];
          const rec = rawRecords.find(r => r.date === dateStr);
          const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
          return {
            name: dayNames[d.getDay()],
            time: rec ? rec.studyMinutes : 0,
            totalQuestions: rec ? rec.totalQuestions : 0,
            correctAnswers: rec ? rec.correctAnswers : 0
          };
        });
        
        setRecords(last7Days);
      } catch (err) {
        console.error(err);
      }
    }
    load();
  }, [user, selectedUserId]);

  // If Admin and NO user is selected, render the User List
  if (user?.role === 'admin' && !selectedUserId) {
    return (
      <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={28} color="var(--primary)" /> 全ユーザーの学習データ
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>ユーザーを選択して詳細データとチャット履歴を確認</p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {adminUsers.map(u => (
            <div key={u.id} className="glass-panel" style={{ padding: '1.25rem', cursor: 'pointer', transition: 'all 0.2s ease', borderLeft: u.role === 'admin' ? '4px solid #f59e0b' : '4px solid var(--primary)' }} onClick={() => setSelectedUserId(u.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ background: u.role === 'admin' ? '#fef3c7' : 'rgba(79, 70, 229, 0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                    {u.role === 'admin' ? <Bot size={24} color="#d97706" /> : <UserIcon size={24} color="var(--primary)" />}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {u.name} {u.role === 'admin' && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#f59e0b', color: 'white', borderRadius: '0.5rem' }}>Admin</span>}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {u.grade} | Lv.{u.level} | 連続 {u.streak}日 | 最終学習: {u.last_study_date || '未学習'}
                    </p>
                  </div>
                </div>
                <ChevronLeft size={20} color="var(--text-muted)" style={{ transform: 'rotate(180deg)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Common detailed dashboard calculation
  const totalMinutes = records.reduce((sum, r) => sum + r.time, 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  const totalQ = records.reduce((sum, r) => sum + r.totalQuestions, 0);
  const totalC = records.reduce((sum, r) => sum + r.correctAnswers, 0);
  const accuracy = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;

  let statsList: { subject: string; accuracy: number; total: number }[] = [];
  let weakTopics: { topic: string; subject: string; accuracy: number }[] = [];

  if (userData) {
    if (userData.topicStats) {
      statsList = Object.keys(userData.topicStats).map(subject => {
        const stat = userData.topicStats![subject];
        return {
          subject,
          accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
          total: stat.total
        };
      }).sort((a, b) => b.accuracy - a.accuracy);
    }

    if (userData.detailedStats) {
      weakTopics = Object.keys(userData.detailedStats)
        .map(key => {
          const [subject, topic] = key.split(':');
          const stat = userData.detailedStats![key];
          return {
            subject,
            topic,
            accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
            total: stat.total
          };
        })
        .filter(t => t.total >= 3 && t.accuracy < 70)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 3);
    }
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      {user?.role === 'admin' && selectedUserId && (
        <button onClick={() => setSelectedUserId(null)} className="btn btn-secondary" style={{ marginBottom: '1.5rem', display: 'inline-flex', padding: '0.5rem 1rem' }}>
          <ChevronLeft size={18} /> 一覧に戻る
        </button>
      )}

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {user?.role === 'admin' && selectedUserId ? `${userData?.name} さんのデータ` : '保護者用ダッシュボード'}
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>今週の学習状況</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <Clock size={18} /> <span style={{ fontSize: '0.85rem' }}>今週の学習時間</span>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            {hours}<span style={{ fontSize: '1rem', fontWeight: 600 }}>時間</span> {mins}<span style={{ fontSize: '1rem', fontWeight: 600 }}>分</span>
          </p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <CheckSquare size={18} /> <span style={{ fontSize: '0.85rem' }}>平均正答率</span>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--secondary)' }}>
            {accuracy}<span style={{ fontSize: '1rem', fontWeight: 600 }}>%</span>
          </p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>学習時間の推移 (分)</h3>
        <div style={{ height: '200px', width: '100%', marginLeft: '-15px' }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={records} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={30} />
              <Tooltip 
                cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}
              />
              <Bar dataKey="time" fill="var(--primary-light)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {weakTopics.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '2rem', borderLeft: '4px solid #ef4444' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
            <AlertTriangle size={20} /> 苦手分野の分析
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {weakTopics.map((wt, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>{wt.subject}</div>
                  <div style={{ fontWeight: 700 }}>{wt.topic}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>正答率</div>
                  <div style={{ fontWeight: 800, color: '#ef4444' }}>{wt.accuracy}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '2rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Target size={20} color="var(--primary)" /> 教科別の正答率
        </h3>
        {statsList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>まだ学習データがありません。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {statsList.map((stat, idx) => (
              <div key={stat.subject} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontWeight: 800, color: idx === 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{idx + 1}</span>
                  <span style={{ fontWeight: 600 }}>{stat.subject}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '80px', background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${stat.accuracy}%`, height: '100%', background: stat.accuracy >= 70 ? 'var(--secondary)' : (stat.accuracy >= 40 ? 'var(--primary)' : '#ef4444') }}></div>
                  </div>
                  <span style={{ fontWeight: 800, minWidth: '40px', textAlign: 'right', color: stat.accuracy >= 70 ? 'var(--secondary)' : 'inherit' }}>{stat.accuracy}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {user?.role === 'admin' && selectedUserId && (
        <div className="animate-slide-up" style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={22} color="var(--primary)" /> AIチャット履歴
          </h3>
          {adminChatLogs.length === 0 ? (
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              チャット履歴はありません。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {adminChatLogs.map((log) => (
                <div key={log.id} className="glass-panel" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div>
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', marginBottom: '0.25rem' }}>{log.subject}</span>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>{log.topic}</h4>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleString('ja-JP')}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.5)', padding: '1rem', borderRadius: '0.5rem' }}>
                    {log.chat_history.map((msg: any, idx: number) => (
                      <div key={idx} style={{ display: 'flex', gap: '0.75rem', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {msg.role === 'assistant' && (
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Bot size={16} color="var(--primary)" />
                          </div>
                        )}
                        <div style={{
                          background: msg.role === 'user' ? 'var(--primary)' : 'white',
                          color: msg.role === 'user' ? 'white' : 'var(--text)',
                          padding: '0.75rem 1rem',
                          borderRadius: '1rem',
                          borderTopRightRadius: msg.role === 'user' ? 0 : '1rem',
                          borderTopLeftRadius: msg.role === 'assistant' ? 0 : '1rem',
                          maxWidth: '85%',
                          fontSize: '0.9rem',
                          lineHeight: 1.5,
                          boxShadow: 'var(--shadow-sm)',
                          border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none'
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
