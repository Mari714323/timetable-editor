import React, { useEffect, useState } from 'react';
import './App.css';
import type { Subject } from './types';
import { Sidebar } from './components/Sidebar';

function App() {
  const [role, setRole] = useState<'kyomu' | 'kyoka' | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [timetable, setTimetable] = useState<{ [key: string]: { [key: string]: string | null } }>({});
  const [workload, setWorkload] = useState<{ [key: string]: number }>({});
  const [currentClass, setCurrentClass] = useState<string>('1A');
  
  // 💡 【復旧】ドラッグ中の状態管理
  const [draggingSubject, setDraggingSubject] = useState<Subject | null>(null);

  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  const fetchWorkload = () => {
    fetch('/api/workload')
      .then(res => res.json())
      .then(data => setWorkload(data))
      .catch(err => console.error('稼働状況の取得に失敗しました:', err));
  };

  useEffect(() => {
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

  // 💡 【復旧】サイドバーからのドラッグ開始時にStateをセット
  const handleDragStart = (e: React.DragEvent, subject: Subject) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'sidebar', subject }));
    setDraggingSubject(subject);
  };

  // 💡 【復旧】セルからのドラッグ開始時にStateをセット
  const handleCellDragStart = (e: React.DragEvent, subjectTitle: string, dayIndex: number, period: number) => {
    const subject = subjects.find(s => s.title === subjectTitle && s.target_class === currentClass);
    if (subject) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'timetable', subject, fromDay: dayIndex, fromPeriod: period }));
      setDraggingSubject(subject);
    }
  };

  // 💡 【復旧】ドラッグ終了時のリセット
  const handleDragEnd = () => {
    setDraggingSubject(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dayIndex: number, period: number) => {
    e.preventDefault();
    setDraggingSubject(null); // ドロップ時もリセット

    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;
    try {
      const parsedData = JSON.parse(rawData);
      let draggedSubject: Subject = parsedData.source ? parsedData.subject : parsedData;
      let fromDay = parsedData.source === 'timetable' ? parsedData.fromDay : undefined;
      let fromPeriod = parsedData.source === 'timetable' ? parsedData.fromPeriod : undefined;

      const isUnavailable = draggedSubject.instructor_id === 'T002' && dayIndex !== 1 && dayIndex !== 3;
      if (isUnavailable) return;
      
      // 💡 移動先がすでに埋まっている場合は何もしない
      if (timetable[dayIndex]?.[period]) return;

      executeAssignment(draggedSubject, dayIndex, period, fromDay, fromPeriod);
    } catch (err) {
      console.error('ドロップデータの解析に失敗しました:', err);
    }
  };

  const filteredSubjects = subjects.filter((s) => s.target_class === currentClass);

  if (role === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', fontFamily: 'Arial, sans-serif' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>スマート時間割管理システム</h1>
        <p style={{ color: '#64748b', marginBottom: '40px' }}>ご利用の役割を選択してログインしてください。</p>
        <div style={{ display: 'flex', gap: '30px' }}>
          <button onClick={() => setRole('kyomu')} style={{ width: '220px', padding: '30px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            🏫 教務課として<br/><span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.9 }}>（時間割の一括作成・出力）</span>
          </button>
          <button onClick={() => setRole('kyoka')} style={{ width: '220px', padding: '30px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            🧪 教科主任として<br/><span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.9 }}>（担当教員の割当・要望入力）</span>
          </button>
        </div>
      </div>
    );
  }

  if (role === 'kyoka') {
    return (
      <div className="app-container">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', borderBottom: '2px solid #3498db' }}>
          <div>
            <h1 style={{ fontSize: '24px', margin: '15px 0' }}>🧪 教科主任専用ポータル</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>担当クラスへの教員割り当てを行います。</p>
          </div>
          <button onClick={() => setRole(null)} style={{ padding: '8px 16px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            ログアウト
          </button>
        </header>
        <main style={{ padding: '30px 20px', textAlign: 'left', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px', color: '#1e293b', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>
              📅 クラス別・担当教員の割り当て
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '25px' }}>
              各クラスの科目に配置する担当教員を選択してください。「割り当てを確定する」を押すと、教務課の時間割作成画面にリアルタイムで反映されます。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <div><span style={{ fontWeight: 'bold', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', marginRight: '10px' }}>1A</span><span style={{ fontWeight: 'bold', color: '#334155' }}>数学I</span></div>
                <select id="assign-1a-math" defaultValue="T001" style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                  <option value="T001">山田先生 (T001)</option>
                  <option value="T002">ジョン先生 (T002)</option>
                  <option value="T003">佐藤先生 (T003)</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <div><span style={{ fontWeight: 'bold', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', marginRight: '10px' }}>1A</span><span style={{ fontWeight: 'bold', color: '#334155' }}>コミュ英語I</span></div>
                <select id="assign-1a-eng" defaultValue="T002" style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                  <option value="T001">山田先生 (T001)</option>
                  <option value="T002">ジョン先生 (T002)</option>
                  <option value="T003">佐藤先生 (T003)</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <div><span style={{ fontWeight: 'bold', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', marginRight: '10px' }}>1B</span><span style={{ fontWeight: 'bold', color: '#334155' }}>数学I</span></div>
                <select id="assign-1b-math" defaultValue="T001" style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                  <option value="T001">山田先生 (T001)</option>
                  <option value="T002">ジョン先生 (T002)</option>
                  <option value="T003">佐藤先生 (T003)</option>
                </select>
              </div>
            </div>
            <button 
              onClick={() => {
                const aMath = (document.getElementById('assign-1a-math') as HTMLSelectElement).value;
                const aEng = (document.getElementById('assign-1a-eng') as HTMLSelectElement).value;
                const bMath = (document.getElementById('assign-1b-math') as HTMLSelectElement).value;
                const payload = [
                  { subject_id: "S001", instructor_id: aMath },
                  { subject_id: "S002", instructor_id: aEng },
                  { subject_id: "S004", instructor_id: bMath },
                ];
                fetch('/api/assign-teachers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                .then(res => res.json()).then(data => alert(data.message)).catch(_err => alert('割り当ての更新に失敗しました。'));
              }}
              style={{ marginTop: '30px', width: '100%', padding: '12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
            >
              割り当てを確定する
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1>時間割原案作成エディタ</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <label htmlFor="class-select" style={{ fontWeight: 'bold', color: '#475569', fontSize: '14px' }}>対象クラス:</label>
            <select id="class-select" value={currentClass} onChange={(e) => setCurrentClass(e.target.value)} style={{ padding: '4px 8px', fontSize: '16px', fontWeight: 'bold', borderRadius: '4px', border: '1px solid #94a3b8', cursor: 'pointer' }}>
              <option value="1A">1A</option>
              <option value="1B">1B</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* 💡 【復旧】自動配置ボタン */}
          <button 
            onClick={() => {
              if (window.confirm(`${currentClass}クラスの未配置の授業を自動で割り当てます。よろしいですか？`)) {
                fetch(`/api/auto-assign?target_class=${currentClass}`, { method: 'POST' })
                  .then(res => res.json())
                  .then(data => { alert(data.message); window.location.reload(); })
                  .catch(_err => alert('自動配置に失敗しました。'));
              }
            }}
            style={{ padding: '10px 20px', backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            ✨ 自動配置
          </button>
          <button onClick={() => window.location.href = `/api/export-csv?target_class=${currentClass}`} style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            CSVをダウンロード
          </button>
          <button onClick={handleSave} style={{ padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            変更を保存する
          </button>
          <button onClick={() => setRole(null)} style={{ padding: '10px 15px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
            ログアウト
          </button>
        </div>
      </header>
      <main className="main-content">
        <section className="timetable-section">
          {/* 💡 【復旧】テーブル全体での onDragEnd 検知 */}
          <table className="timetable-table" onDragEnd={handleDragEnd}>
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
                    // 💡 【復旧】ドラッグ中のハイライト判定
                    const activeSubject = draggingSubject || selectedSubject;
                    const isInstructorUnavailable = activeSubject?.instructor_id === 'T002' && dayIndex !== 1 && dayIndex !== 3;
                    const isDropDisabled = draggingSubject && (subjectTitle !== null || isInstructorUnavailable);

                    return (
                      <td 
                        key={dayIndex}
                        onClick={() => {
                          if (isInstructorUnavailable) return;
                          handleCellClick(dayIndex, period);
                        }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dayIndex, period)}
                        style={{ 
                          cursor: isInstructorUnavailable ? 'not-allowed' : 'pointer',
                          backgroundColor: isDropDisabled ? '#e2e8f0' : 'transparent',
                          backgroundImage: isDropDisabled ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)' : 'none',
                          transition: 'all 0.2s ease',
                          minWidth: '120px',
                          height: '60px',
                          padding: '0'
                        }}
                      >
                        {subjectTitle ? (
                          <div
                            draggable={true}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleCellDragStart(e, subjectTitle, dayIndex, period);
                            }}
                            onDragEnd={handleDragEnd}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', height: '100%', cursor: 'grab' }}
                          >
                            <span className="allocated-slot" style={{ fontWeight: 'bold', color: '#2c3e50', opacity: isDropDisabled ? 0.5 : 1 }}>
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
                              style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px', padding: '0 4px', fontSize: '14px', opacity: isDropDisabled ? 0.5 : 1 }}
                              title="この授業を外す"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <span className="empty-slot" style={{ color: isInstructorUnavailable ? '#94a3b8' : '#bdc3c7' }}>
                              {isInstructorUnavailable ? '休' : '-'}
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