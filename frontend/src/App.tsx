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

  /// 2. 状態（State）の定義：最初は空っぽの配列 `[]` をセットしておく
  const [subjects, setSubjects] = useState<Subject[]>([]);
  // 時間割の状態を追加（初期値は空のオブジェクト `{}`）
  const [timetable, setTimetable] = useState<Timetable>({});
  // 現在選択されている授業カードの情報を保持するStateを追加
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  // 3. 画面が表示された瞬間に実行するロジック
  useEffect(() => {
    fetch('/api/init')
      .then((response) => response.json())
      .then((data) => {
        // バックエンドから届いた授業リストと時間割マトリクスをStateに格納
        setSubjects(data.subjects);
        setTimetable(data.timetable);
      })
      .catch((error) => {
        console.error('バックエンドからのデータ取得に失敗しました:', error);
      });
  }, []);

  // マス目がクリックされた時のバリデーション＆配置ロジック
  const handleCellClick = (dayIndex: number, period: number) => {
    // 授業カードが選ばれていない場合は何もしない
    if (!selectedSubject) {
      alert('まずは右側の「配置待ちの授業」からカードを1つ選択してください！');
      return;
    }

    // バックエンドが求める「その曜日の現在の教員配置状況（1〜7限の配列）」をフロントのStateから復元
    const currentDayAssignments = periods.map((p) => {
      const title = timetable[dayIndex]?.[p];
      if (!title) return null;
      // 授業名から担当教員ID（T001など）を逆引きする
      const found = subjects.find((s) => s.title === title);
      return found ? found.instructor_id : null;
    });

    // バックエンドの ValidationRequest 型に合わせたリクエストボディの作成
    const requestBody = {
      teacher_id: selectedSubject.instructor_id,
      day: dayIndex,
      period: period,
      current_day_assignments: currentDayAssignments,
    };

    // バックエンドのバリデーションAPIにPOSTリクエストを送信
    fetch('/api/validate-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.is_valid) {
          // 【制約クリア！】時間割のStateを更新して、画面に授業名をセットする
          setTimetable((prev) => ({
            ...prev,
            [dayIndex]: {
              ...prev[dayIndex],
              [period]: selectedSubject.title,
            },
          }));
          // 配置に成功したら、カードの選択状態を綺麗にリセットする
          setSelectedSubject(null);
        } else {
          // 【制約違反！】バックエンドから返ってきたエラーメッセージをそのまま画面にアラート表示
          alert(data.error_message);
        }
      })
      .catch((err) => {
        console.error('バリデーション通信に失敗しました:', err);
      });
  };

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
                      <td 
                        key={dayIndex}
                        onClick={() => handleCellClick(dayIndex, period)} // クリックされたら関数を発動
                        style={{ cursor: 'pointer' }} // マウスを乗せたらポインターの形にする
                      >
                        {subjectTitle ? (
                          <span className="allocated-slot" style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                            {subjectTitle}
                          </span>
                        ) : (
                          <span className="empty-slot" style={{ color: '#bdc3c7' }}>-</span>
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
            {subjects.map((subject) => {
              // 今このカードが選択されているかどうかを判定
              const isSelected = selectedSubject?.id === subject.id;
              
              return (
                <div 
                  key={subject.id} 
                  className="subject-card"
                  onClick={() => setSelectedSubject(subject)} // クリックされたら選択状態にする
                  style={{ 
                    backgroundColor: subject.color,
                    // 選択されている場合は太い黒枠を表示、そうでない場合はなし
                    border: isSelected ? '3px solid #2c3e50' : '3px solid transparent',
                    transform: isSelected ? 'scale(1.02)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div>{subject.title} ({subject.target_class})</div>
                  <small>担当教員ID: {subject.instructor_id}</small>
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