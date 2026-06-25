import './App.css';

function App() {
  // 時間割の軸となる配列を定義
  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  // 仮の授業データ（本来はAPIから取得するもの）
  const mockSubjects = [
    { id: '1', title: '数学I', class: '1A', teacher: 'サトウ先生', color: '#3498db' },
    { id: '2', title: 'コミュ英語I', class: '1A', teacher: 'ジョン先生', color: '#e74c3c' },
  ];

  return (
    <div className="app-container">
      <header>
        <h1>時間割原案作成エディタ</h1>
      </header>

      <main className="main-content">
        {/* 左側：5日間 ✖️ 7時限の時間割シート */}
        <section className="timetable-section">
          <h2>1年A組 時間割</h2>
          <table className="timetable-table">
            <thead>
              <tr>
                <th>時限</th>
                {days.map((day) => (
                  <th key={day}>{day}曜日</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period}>
                  <th>{period}限</th>
                  {days.map((day, dayIndex) => (
                    <td key={dayIndex}>
                      {/* ここに配置された授業カードが入る（最初は空っぽ） */}
                      <span className="empty-slot">-</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 右側：配置を待つ授業コマのサイドバー */}
        <section className="sidebar-section">
          <h2>配置待ちの授業</h2>
          <p>ドラッグして時間割へ配置（予定）</p>
          <div className="card-list">
            {mockSubjects.map((subject) => (
              <div 
                key={subject.id} 
                className="subject-card"
                style={{ backgroundColor: subject.color }} // カラーコードだけ例外的にインライン適用
              >
                <div>{subject.title} ({subject.class})</div>
                <small>{subject.teacher}</small>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;