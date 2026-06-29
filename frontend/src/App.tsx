import { useEffect, useState } from 'react';
import './App.css';

// 授業データの型定義
interface Subject {
  id: str;
  title: str;
  target_class: str;
  credits: number;
  type: str;
  color: str;
  instructor_id: str;
}

function App() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [timetable, setTimetable] = useState<{ [key: str]: { [key: str]: str | null } }>({});

  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  // 1. 初期データの取得（サーバー起動時に読み込み）
  useEffect(() => {
    fetch('/api/init')
      .then((res) => res.json())
      .then((data) => {
        setSubjects(data.subjects);
        setTimetable(data.timetable);
      })
      .catch((err) => console.error('初期データの取得に失敗しました:', err));
  }, []);

  // 共通の配置ロジック（バリデーションAPIを叩く）
  const executeAssignment = (subject: Subject, dayIndex: number, period: number) => {
    // 現在の該当曜日の全コマの状況を1限〜7限まで配列に並べる
    const currentDayAssignments = periods.map((p) => timetable[dayIndex]?.[p] || null);

    fetch('/api/validate-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacher_id: subject.instructor_id,
        day: dayIndex,
        period: period,
        current_day_assignments: currentDayAssignments,
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

  // クリック配置用の関数
  const handleCellClick = (dayIndex: number, period: number) => {
    if (!selectedSubject) return;
    executeAssignment(selectedSubject, dayIndex, period);
  };

  // 指定されたマスの授業を消去するロジック
  const handleClearCell = (dayIndex: number, period: number) => {
    setTimetable((prev) => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        [period]: null,
      },
    }));
  };

  // 時間割の保存ロジック
  const handleSave = () => {
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timetable }),
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

  // --- 🫴 ドラッグ＆ドロップ用のイベントハンドラー ---
  
  // ドラッグが始まった瞬間（カードを掴んだ時）
  const handleDragStart = (e: React.DragEvent, subject: Subject) => {
    // 掴んだ授業データを文字列（JSON）にしてブラウザのポケットに保存
    e.dataTransfer.setData('text/plain', JSON.stringify(subject));
  };

  // マス目の上を通過している時（ドロップを許可する）
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // これを呼ばないとドロップイベントが発動しません
  };

  // マス目にドロップされた瞬間（手を離した時）
  const handleDrop = (e: React.DragEvent, dayIndex: number, period: number) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    try {
      const draggedSubject: Subject = JSON.parse(rawData);
      
      // ジョン先生の曜日制限など、グレーアウトされているマスへのドロップはフロント側でもブロック
      const isUnavailable = draggedSubject.instructor_id === 'T002' && dayIndex !== 1 && dayIndex !== 3;
      if (isUnavailable) return;

      // 配置ロジックを実行
      executeAssignment(draggedSubject, dayIndex, period);
    } catch (err) {
      console.error('ドロップデータの解析に失敗しました:', err);
    }
  };

  return (
    <div className="app-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
        <h1>時間割原案作成エディタ</h1>
        <button onClick={handleSave} style={{ padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px',自动重量: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          変更を保存する
        </button>
      </header>

      <main className="main-content">
        {/* 左側：時間割シート */}
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
                        // 【新規追加】ドロップを受け付けるためのイベントを設定
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

        {/* 右側：授業マスタ（ドラッグ元） */}
        <section className="sidebar-section">
          <h2>配置待ちの授業</h2>
          <div className="subjects-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {subjects.map((subject) => {
              const isSelected = selectedSubject?.id === subject.id;
              return (
                <div
                  key={subject.id}
                  // 【新規追加】この要素をドラッグ可能にするマジックワード
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, subject)}
                  onClick={() => setSelectedSubject(subject)}
                  style={{
                    backgroundColor: subject.color,
                    padding: '14px',
                    borderRadius: '8px',
                    border: isSelected ? '3px solid #2c3e50' : '1px solid #cbd5e1',
                    cursor: 'grab', // 掴めるよ！という手の形のマウスカーソルにする
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