import React, { useEffect, useState } from 'react';
import './App.css';
import type { Subject } from './types';
import { Sidebar } from './components/Sidebar';

function App() {
  // 🔐 【新規追加】ログイン中のロールを管理するState
  // null = 未ログイン（ログイン画面）, 'kyomu' = 教務課, 'kyoka' = 教科主任
  const [role, setRole] = useState<'kyomu' | 'kyoka' | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [timetable, setTimetable] = useState<{ [key: string]: { [key: string]: string | null } }>({});
  const [workload, setWorkload] = useState<{ [key: string]: number }>({});
  const [currentClass, setCurrentClass] = useState<string>('1A');

  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  const fetchWorkload = () => {
    fetch('/api/workload')
      .then(res => res.json())
      .then(data => setWorkload(data))
      .catch(err => console.error('稼働状況の取得に失敗しました:', err));
  };

  useEffect(() => {
    // 💡 教務課ロールでログインしている時だけデータを取得するようにガードをかける
    if (role !== 'kyomu') return;

    fetch(`/api/init?target_class=${currentClass}`)
      .then((res) => res.json())
      .then((data) => {
        setSubjects(data.subjects);
        setTimetable(data.timetable);
        setSelectedSubject(null);
        fetchWorkload();
      })
      .catch((err) => console.error('データの取得に失敗しました:', err));
  }, [currentClass, role]);

  const executeAssignment = (subject: Subject, dayIndex: number, period: number, fromDay?: number, fromPeriod?: number) => {
    const currentDayAssignments = periods.map((p) => timetable[dayIndex]?.[p] || null);

    if (fromDay !== undefined && fromPeriod !== undefined && fromDay === dayIndex) {
      currentDayAssignments[fromPeriod - 1] = null;
    }

    fetch('/api/validate-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacher_id: subject.instructor_id,
        day: dayIndex,
        period: period,
        current_day_assignments: currentDayAssignments,
        target_class: currentClass,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.is_valid) {
          if (data.warning_message) alert(data.warning_message);
          setTimetable((prev) => {
            const newTimetable = { ...prev };
            if (fromDay !== undefined && fromPeriod !== undefined) {
              newTimetable[fromDay] = { ...newTimetable[fromDay], [fromPeriod]: null };
            }
            newTimetable[dayIndex] = { ...newTimetable[dayIndex], [period]: subject.title };
            return newTimetable;
          });
        } else {
          alert(data.error_message);
        }
      })
      .catch((err) => console.error('バリデーション通信に失敗しました:', err));
  };

  const handleCellClick = (dayIndex: number, period: number) => {
    if (!selectedSubject) return;
    executeAssignment(selectedSubject, dayIndex, period);
  };

  const handleClearCell = (dayIndex: number, period: number) => {
    setTimetable((prev) => ({ ...prev, [dayIndex]: { ...prev[dayIndex], [period]: null } }));
  };

  const handleSave = () => {
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_class: currentClass, timetable }),
    })
      .then((res) => res.json())
      .then((data) => {
        alert(data.message);
        fetchWorkload();
      })
      .catch((err) => {
        console.error('保存通信に失敗しました:', err);
        alert('保存に失敗しました。');
      });
  };

  const handleDragStart = (e: React.DragEvent, subject: Subject) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'sidebar', subject }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dayIndex: number, period: number) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;
    try {
      const parsedData = JSON.parse(rawData);
      let draggedSubject: Subject = parsedData.source ? parsedData.subject : parsedData;
      let fromDay = parsedData.source === 'timetable' ? parsedData.fromDay : undefined;
      let fromPeriod = parsedData.source === 'timetable' ? parsedData.fromPeriod : undefined;

      const isUnavailable = draggedSubject.instructor_id === 'T002' && dayIndex !== 1 && dayIndex !== 3;
      if (isUnavailable) return;
      executeAssignment(draggedSubject, dayIndex, period, fromDay, fromPeriod);
    } catch (err) {
      console.error('ドロップデータの解析に失敗しました:', err);
    }
  };

  const filteredSubjects = subjects.filter((s) => s.target_class === currentClass);

  // -------------------------------------------------------------
  // 画面のレンダリング条件分岐（ルーティング）
  // -------------------------------------------------------------

  // 🚪 パターン1: 未ログイン時の画面（役割選択画面）
  if (role === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', fontFamily: 'Arial, sans-serif' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>スマート時間割管理システム</h1>
        <p style={{ color: '#64748b', marginBottom: '40px' }}>ご利用の役割を選択してログインしてください。</p>
        
        <div style={{ display: 'flex', gap: '30px' }}>
          {/* 教務課ボタン */}
          <button 
            onClick={() => setRole('kyomu')}
            style={{ width: '220px', padding: '30px 20px', backgroundColor: '#2cc71', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'transform 0.2s' }}
          >
            🏫 教務課として<br/><span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.9 }}>（時間割の一括作成・出力）</span>
          </button>
          
          {/* 教科主任ボタン */}
          <button 
            onClick={() => setRole('kyoka')}
            style={{ width: '220px', padding: '30px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'transform 0.2s' }}
          >
            🧪 教科主任として<br/><span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.9 }}>（担当教員の割当・要望入力）</span>
          </button>
        </div>
      </div>
    );
  }

  // 📝 パターン2: 教科主任の画面（モック）
  if (role === 'kyoka') {
    return (
      <div className="app-container">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', borderBottom: '2px solid #3498db' }}>
          <div>
            <h1 style={{ fontSize: '24px', margin: '15px 0' }}>🧪 教科主任専用ポータル（理科）</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>担当クラスの割り当ておよび個別要望の入力を行います。</p>
          </div>
          <button 
            onClick={() => setRole(null)} 
            style={{ padding: '8px 16px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ログアウト
          </button>
        </header>
        
        <main style={{ padding: '40px 20px', textAlign: 'left' }}>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px', color: '#1e293b' }}>📅 【理科】担当教員の一括割当（モック表示）</h2>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
              ここに、ご提示いただいた「2年1,2,3組の生物基礎はA先生」「2年4,5組はB先生」といった、**クラスごとの担当教員を教務課へ一括送信する入力フォーム**を今後作成していきます！
            </p>
            <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#edf2f7', borderRadius: '6px', fontSize: '13px', color: '#4a5568' }}>
              ℹ️ 現在、時間割パズル本体の操作権限は「教務課」のみに制限されています。
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 🏫 パターン3: 教務課の画面（これまでのフル機能エディタ）
  return (
    <div className="app-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1>時間割原案作成エディタ</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <label htmlFor="class-select" style={{ fontWeight: 'bold', color: '#475569', fontSize: '14px' }}>対象クラス:</label>
            <select
              id="class-select"
              value={currentClass}
              onChange={(e) => setCurrentClass(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '16px', fontWeight: 'bold', borderRadius: '4px', border: '1px solid #94a3b8', cursor: 'pointer' }}
            >
              <option value="1A">1A</option>
              <option value="1B">1B</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={() => window.location.href = `/api/export-csv?target_class=${currentClass}`} 
            style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            CSVをダウンロード
          </button>
          <button 
            onClick={handleSave} 
            style={{ padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            変更を保存する
          </button>
          
          {/* 🚪 ログアウトボタンを追加 */}
          <button 
            onClick={() => setRole(null)} 
            style={{ padding: '10px 15px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="main-content">
        <section className="timetable-section">
          <table className="timetable-table">
            <thead>
              <tr>
                <th>時限</th>
                {days.map((day) => <th key={day}>{day}曜日</th>)}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period}>
                  <th>{period}限</th>
                  {days.map((_day, dayIndex) => {
                    const subjectTitle = timetable[dayIndex]?.[period];
                    const isUnavailable = selectedSubject?.instructor_id === 'T002' && dayIndex !== 1 && dayIndex !== 3;

                    return (
                      <td 
                        key={dayIndex}
                        onClick={() => {
                          if (isUnavailable) return;
                          handleCellClick(dayIndex, period);
                        }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dayIndex, period)}
                        style={{ 
                          cursor: isUnavailable ? 'not-allowed' : 'pointer',
                          backgroundColor: isUnavailable ? '#e2e8f0' : 'transparent',
                          transition: 'all 0.2s ease',
                          minWidth: '120px',
                          height: '60px',
                          padding: '0'
                        }}
                      >
                        {subjectTitle ? (
                          <div
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', height: '100%' }}
                          >
                            <span className="allocated-slot" style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                              {dayIndex === 4 && (period === 6 || period === 7) && (
                                <span style={{ marginRight: '4px', cursor: 'help' }} title="金曜後半のコマです">⚠️</span>
                              )}
                              {subjectTitle}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearCell(dayIndex, period);
                              }}
                              style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px', padding: '0 4px', fontSize: '14px' }}
                              title="この授業を外す"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <span className="empty-slot" style={{ color: isUnavailable ? '#94a3b8' : '#bdc3c7' }}>
                              {isUnavailable ? '休' : '-'}
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <Sidebar
          currentClass={currentClass}
          filteredSubjects={filteredSubjects}
          selectedSubject={selectedSubject}
          onSubjectSelect={setSelectedSubject}
          onDragStart={handleDragStart}
          workload={workload} 
        />
      </main>
    </div>
  );
}

export default App;