import { useState, useEffect } from 'react'; // ← Reactの重要機能をインポート
import './App.css';

// 1. TypeScript用の「授業（Subject）」の型定義（SQLのテーブル定義のようなものです）
interface Subject {
  id: string;
  title: string;
  target_class: string;
  credits: number;
  type: 'Required' | 'Elective';
  color: string;
  instructor_id: string;
}

// 時間割用の型定義を追加（例: {"0": {"1": "数学I", "2": null, ...}}）
interface Timetable {
  [day: string]: {
    [period: string]: string | null;
  };
}

function App() {
  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

// 2. 状態（State）の定義：最初は空っぽの配列 `[]` をセットしておく
  const [subjects, setSubjects] = useState<Subject[]>([]);
  // 時間割の状態を追加（初期値は空のオブジェクト `{}`）
  const [timetable, setTimetable] = useState<Timetable>({});

  // 3. 画面が表示された瞬間に実行するロジック
  useEffect(() => {
    // Viteのプロキシ経由で、FastAPIの初期化APIを叩く
    fetch('/api/init')
      .then((response) => response.json())
      .then((data) => {
        // 取得したデータの中から「subjects（授業リスト）」を状態にセットする
        // これを実行した瞬間、下の画面（JSX）が自動で再描画されます！
        setSubjects(data.subjects);
        setTimetable(data.timetable); // ← ここを追加：時間割データもStateに格納する
      })

      .catch((error) => {
        console.error('バックエンドからのデータ取得に失敗しました:', error);
      });
  }, []); // 最後の `[]` は「最初の1回だけ実行する」というおまじないです

  return (
    <div className="app-container">
      <header>
        <h1>時間割原案作成エディタ</h1>
      </header>

      <main className="main-content">
        {/* 左側：時間割シート（ここはまだ枠だけ） */}
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
                  {days.map((day, dayIndex) => {
                    // timetable[曜日ID][何限目] の値（授業名、または None/null）を取得
                    const subjectTitle = timetable[dayIndex]?.[period];
                    return (
                      <td key={dayIndex}>
                        {subjectTitle ? (
                          <span className="allocated-slot">{subjectTitle}</span>
                        ) : (
                          <span className="empty-slot">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 右側：配置待ちの授業（FastAPIから取得した本物のデータが並びます！） */}
        <section className="sidebar-section">
          <h2>配置待ちの授業</h2>
          <p>APIから取得した本物のデータ</p>
          <div className="card-list">
            {subjects.map((subject) => (
              <div 
                key={subject.id} 
                className="subject-card"
                style={{ backgroundColor: subject.color }}
              >
                {/* バックエンドのデータ構造（target_classなど）に合わせて表示 */}
                <div>{subject.title} ({subject.target_class})</div>
                <small>担当教員ID: {subject.instructor_id}</small>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;