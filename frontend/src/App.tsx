import React, { useEffect, useState } from 'react';
import './App.css';
import type { Subject } from './types';
import { Sidebar } from './components/Sidebar';

function App() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [timetable, setTimetable] = useState<{ [key: string]: { [key: string]: string | null } }>({});
  
  // 📊 【新規追加】教員ごとの稼働コマ数を保持するState
  const [workload, setWorkload] = useState<{ [key: string]: number }>({});
  
  const [currentClass, setCurrentClass] = useState<string>('1A');

  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  // 📊 【新規追加】バックエンドから集計データを取得する関数
  const fetchWorkload = () => {
    fetch('/api/workload')
      .then(res => res.json())
      .then(data => setWorkload(data))
      .catch(err => console.error('稼働状況の取得に失敗しました:', err));
  };

  useEffect(() => {
    fetch(`/api/init?target_class=${currentClass}`)
      .then((res) => res.json())
      .then((data) => {
        setSubjects(data.subjects);
        setTimetable(data.timetable);
        setSelectedSubject(null);
        fetchWorkload(); // 💡 初期ロード時やクラス切り替え時に集計データも引っ張ってくる
      })
      .catch((err) => console.error('データの取得に失敗しました:', err));
  }, [currentClass]);

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
        fetchWorkload(); // 💡 保存に成功したら、DBが更新されたはずなので集計を取り直す！
      })
      .catch((err) => {
        console.error('保存通信に失敗しました:', err);
        alert('保存に失敗しました。');
      });
  };

  const handleDragStart = (e: React.DragEvent, subject: Subject) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'sidebar', subject }));
  };

  const handleCellDragStart = (e: React.DragEvent, subjectTitle: string, dayIndex: number, period: number) => {
    const subject = subjects.find(s => s.title === subjectTitle && s.target_class === currentClass);
    if (subject) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'timetable', subject, fromDay: dayIndex, fromPeriod: period }));
    }
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

        <div style={{ display: 'flex', gap: '10px' }}>
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
                            draggable={true}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleCellDragStart(e, subjectTitle, dayIndex, period);
                            }}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', height: '100%', cursor: 'grab' }}
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

        {/* 📊 親で取得した稼働状況（workload）をSidebarに渡す */}
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