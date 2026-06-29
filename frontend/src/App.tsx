import React, { useEffect, useState } from 'react';
import './App.css';

interface Subject {
  id: string;
  title: string;
  target_class: string;
  credits: number;
  type: string;
  color: string;
  instructor_id: string;
}

function App() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [timetable, setTimetable] = useState<{ [key: string]: { [key: string]: string | null } }>({});
  
  // 🏫 【新規追加】現在選択中のクラスを管理するState（初期値は '1A'）
  const [currentClass, setCurrentClass] = useState<string>('1A');

  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  // 🔄 【修正】初期データ取得を、選択中のクラスが変わるたびに再実行するように変更
  // 依存配列（第二引数）に currentClass を入れることで、クラス切り替え時に自動でAPIが走ります
  useEffect(() => {
    fetch(`/api/init?target_class=${currentClass}`)
      .then((res) => res.json())
      .then((data) => {
        setSubjects(data.subjects);
        setTimetable(data.timetable);
        // クラスが切り替わったら、選択中の授業カードを一度クリアして誤配置を防ぐ
        setSelectedSubject(null);
      })
      .catch((err) => console.error('データの取得に失敗しました:', err));
  }, [currentClass]);

  // 共通の配置ロジック
  const executeAssignment = (subject: Subject, dayIndex: number, period: number) => {
    const currentDayAssignments = periods.map((p) => timetable[dayIndex]?.[p] || null);

    fetch('/api/validate-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacher_id: subject.instructor_id,
        day: dayIndex,
        period: period,
        current_day_assignments: currentDayAssignments,
        target_class: currentClass, // バリデーションAPIにも現在のクラスを伝える
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.is_valid) {
          if (data.warning_message) {
            alert(data.warning_message);
          }

          setTimetable((prev) => ({
            ...prev,
            [dayIndex]: {
              ...prev[dayIndex],
              [period]: subject.title,
            },
          }));
        } else {
          alert(data.error_message);
        }
      })
      .catch((err) => {
        console.error('バリデーション通信に失敗しました:', err);
      });
  };

  const handleCellClick = (dayIndex: number, period: number) => {
    if (!selectedSubject) return;
    executeAssignment(selectedSubject, dayIndex, period);
  };

  const handleClearCell = (dayIndex: number, period: number) => {
    setTimetable((prev) => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        [period]: null,
      },
    }));
  };

  // 🔄 【修正】保存時に「どのクラスの時間割か」をバックエンドに伝えるよう拡張
  const handleSave = () => {
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        target_class: currentClass, // クラス名を同梱
        timetable 
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        alert(data.message);
      })
      .catch((err) => {
        console.error('保存通信に失敗しました:', err);
        alert('保存に失敗しました。');
      });
  };

  const handleDragStart = (e: React.DragEvent, subject: Subject) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(subject));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dayIndex: number, period: number) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    try {
      const draggedSubject: Subject = JSON.parse(rawData);
      const isUnavailable = draggedSubject.instructor_id === 'T002' && dayIndex !== 1 && dayIndex !== 3;
      if (isUnavailable) return;

      executeAssignment(draggedSubject, dayIndex, period);
    } catch (err) {
      console.error('ドロップデータの解析に失敗しました:', err);
    }
  };

  // 💡 【新規追加】右側のサイドバーに表示する授業を、現在選択中のクラスの物だけにフィルターする
  const filteredSubjects = subjects.filter((s) => s.target_class === currentClass);

  return (
    <div className="app-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1>時間割原案作成エディタ</h1>
          
          {/* 🏫 【新規追加】クラス選択用のドロップダウンメニュー */}
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

        <button 
          onClick={handleSave} 
          style={{ padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
        >
          変更を保存する
        </button>
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
                  {days.map((day, dayIndex) => {
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
                          height: '60px'
                        }}
                      >
                        {subjectTitle ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
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
                          <span className="empty-slot" style={{ color: isUnavailable ? '#94a3b8' : '#bdc3c7' }}>
                            {isUnavailable ? '休' : '-'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sidebar-section">
          {/* 🏫 表示を動的に変更 */}
          <h2>{currentClass} の配置待ち授業</h2>
          <div className="subjects-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* 🔄 【修正】全授業ではなく、フィルター後の filteredSubjects をループするように変更 */}
            {filteredSubjects.map((subject) => {
              const isSelected = selectedSubject?.id === subject.id;
              return (
                <div
                  key={subject.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, subject)}
                  onClick={() => setSelectedSubject(subject)}
                  style={{
                    backgroundColor: subject.color,
                    padding: '14px',
                    borderRadius: '8px',
                    border: isSelected ? '3px solid #2c3e50' : '1px solid #cbd5e1',
                    cursor: 'grab',
                    boxShadow: isSelected ? '0 4px 6px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px', color: '#1e293b' }}>
                    {subject.title}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    クラス: {subject.target_class} | コマ数: {subject.credits} | 担当: {subject.instructor_id}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;