import React, { useEffect, useState } from 'react';
import './App.css';
import type { Subject } from './types';
import { Sidebar } from './components/Sidebar';

interface Teacher {
  id: string;
  name: string;
  available_days: number[];
  max_periods: number;
}

// 💡 カリキュラムの型定義
interface Curriculum {
  id: string;
  track_name: string;
  subject_name: string;
  hours_per_week: number;
}

function TeacherRuleItem({ teacher, daysList, onSave }: { teacher: Teacher, daysList: string[], onSave: (id: string, days: number[], max: number) => void }) {
  const [localDays, setLocalDays] = useState<number[]>(teacher.available_days);
  const [localMax, setLocalMax] = useState<number>(teacher.max_periods);

  const handleDayToggle = (dayIdx: number) => {
    if (localDays.includes(dayIdx)) {
      setLocalDays(localDays.filter(d => d !== dayIdx));
    } else {
      setLocalDays([...localDays, dayIdx].sort());
    }
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#334155' }}>
          {teacher.name} <span style={{ fontSize: '12px', color: '#94a3b8' }}>({teacher.id})</span>
        </span>
        <button 
          onClick={() => onSave(teacher.id, localDays, localMax)}
          style={{ padding: '6px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          保存
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#475569' }}>出勤曜日:</span>
          {daysList.map((dayName, idx) => (
            <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={localDays.includes(idx)} onChange={() => handleDayToggle(idx)} />
              {dayName}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#475569' }}>1日の上限コマ数:</span>
          <input type="number" min="1" max="7" value={localMax} onChange={(e) => setLocalMax(parseInt(e.target.value) || 4)} style={{ width: '50px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [role, setRole] = useState<'kyomu' | 'kyoka' | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  // 💡 タブ切り替えとカリキュラム用のState
  const [kyomuTab, setKyomuTab] = useState<'timetable' | 'curriculum'>('timetable');
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<string>('普通');
  const [editingCurricula, setEditingCurricula] = useState<{subject_name: string, hours_per_week: number}[]>([]);

  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [timetable, setTimetable] = useState<{ [key: string]: { [key: string]: string | null } }>({});
  const [workload, setWorkload] = useState<{ [key: string]: number }>({});
  const [currentClass, setCurrentClass] = useState<string>('1A');
  const [draggingSubject, setDraggingSubject] = useState<Subject | null>(null);
  
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);

  const days = ['月', '火', '水', '木', '金'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  const fetchWorkload = () => {
    fetch('/api/workload')
      .then(res => res.json())
      .then(data => setWorkload(data))
      .catch(err => console.error('稼働状況の取得に失敗しました:', err));
  };

  const fetchCurriculum = () => {
    fetch('/api/curriculum')
      .then(res => res.json())
      .then(data => setCurricula(data))
      .catch(err => console.error('カリキュラム取得失敗:', err));
  };

  const fetchAllData = () => {
    fetch(`/api/init?target_class=${currentClass}`)
      .then((res) => res.json())
      .then((data) => {
        setSubjects(data.subjects);
        setTimetable(data.timetable);
        setTeachers(data.teachers || []);
        setSelectedSubject(null);
        fetchWorkload();
      })
      .catch((err) => console.error('データの取得に失敗しました:', err));
    fetchCurriculum(); // 💡 カリキュラムも取得
  };

  useEffect(() => {
    if (role === null) return;
    fetchAllData();
  }, [currentClass, role]);

  // 💡 系統が切り替わったときに編集用リストを更新
  useEffect(() => {
    const trackData = curricula.filter(c => c.track_name === selectedTrack);
    setEditingCurricula(trackData.map(c => ({subject_name: c.subject_name, hours_per_week: c.hours_per_week})));
  }, [selectedTrack, curricula]);

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
    setDraggingSubject(subject);
  };

  const handleCellDragStart = (e: React.DragEvent, subjectTitle: string, dayIndex: number, period: number) => {
    const subject = subjects.find(s => s.title === subjectTitle && s.target_class === currentClass);
    if (subject) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'timetable', subject, fromDay: dayIndex, fromPeriod: period }));
      setDraggingSubject(subject);
    }
  };

  const handleDragEnd = () => setDraggingSubject(null);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent, dayIndex: number, period: number) => {
    e.preventDefault();
    setDraggingSubject(null);

    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;
    try {
      const parsedData = JSON.parse(rawData);
      let draggedSubject: Subject = parsedData.source ? parsedData.subject : parsedData;
      let fromDay = parsedData.source === 'timetable' ? parsedData.fromDay : undefined;
      let fromPeriod = parsedData.source === 'timetable' ? parsedData.fromPeriod : undefined;

      let isUnavailable = false;
      const teacher = teachers.find(t => t.id === draggedSubject.instructor_id);
      if (teacher) {
        isUnavailable = !teacher.available_days.includes(dayIndex);
      }
      if (isUnavailable) return;
      
      if (timetable[dayIndex]?.[period]) return;
      executeAssignment(draggedSubject, dayIndex, period, fromDay, fromPeriod);
    } catch (err) {
      console.error('ドロップデータの解析に失敗しました:', err);
    }
  };

  const filteredSubjects = subjects.filter((s) => s.target_class === currentClass);

  const saveTeacherRule = (teacherId: string, updatedDays: number[], maxPeriods: number) => {
    fetch('/api/update-teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: teacherId, available_days: updatedDays, max_periods_per_day: maxPeriods })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        fetchAllData(); 
        alert('ルールを更新しました！');
      } else {
        alert('エラーが発生しました。');
      }
    })
    .catch(err => alert('通信エラーが発生しました。'));
  };

  // 💡 カリキュラム編集用の関数
  const handleCurriculumChange = (index: number, field: 'subject_name' | 'hours_per_week', value: string | number) => {
    const updated = [...editingCurricula];
    updated[index] = { ...updated[index], [field]: value };
    setEditingCurricula(updated);
  };

  const addCurriculumRow = () => {
    setEditingCurricula([...editingCurricula, { subject_name: '', hours_per_week: 1 }]);
  };

  const removeCurriculumRow = (index: number) => {
    const updated = [...editingCurricula];
    updated.splice(index, 1);
    setEditingCurricula(updated);
  };

  const saveCurriculum = () => {
    const payload = editingCurricula
      .filter(c => c.subject_name.trim() !== '')
      .map(c => ({
        track_name: selectedTrack,
        subject_name: c.subject_name,
        hours_per_week: c.hours_per_week
      }));
    
    fetch('/api/curriculum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      fetchCurriculum();
    })
    .catch(err => alert('保存に失敗しました'));
  };

  const renderTeacherModal = () => {
    if (!isTeacherModalOpen) return null;
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
        <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '700px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>
            <h2 style={{ margin: 0, color: '#1e293b' }}>⚙️ 個別ルール設定（教員マスタ）</h2>
            <button onClick={() => setIsTeacherModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✖</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {teachers.map(teacher => (
              <TeacherRuleItem key={teacher.id} teacher={teacher} daysList={days} onSave={saveTeacherRule} />
            ))}
          </div>
        </div>
      </div>
    );
  };

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
        {renderTeacherModal()}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', borderBottom: '2px solid #3498db' }}>
          <div>
            <h1 style={{ fontSize: '24px', margin: '15px 0' }}>🧪 教科主任専用ポータル</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>担当クラスへの教員割り当てを行います。</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={() => setIsTeacherModalOpen(true)} style={{ padding: '8px 16px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              ⚙️ 教員ルール設定
            </button>
            <button onClick={() => setRole(null)} style={{ padding: '8px 16px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              ログアウト
            </button>
          </div>
        </header>
        <main style={{ padding: '30px 20px', textAlign: 'left', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px', color: '#1e293b', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>
              📅 クラス別・担当教員の割り当て
            </h2>
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
            </div>
            <button 
              onClick={() => {
                const aMath = (document.getElementById('assign-1a-math') as HTMLSelectElement).value;
                const aEng = (document.getElementById('assign-1a-eng') as HTMLSelectElement).value;
                const payload = [
                  { subject_id: "S001", instructor_id: aMath },
                  { subject_id: "S002", instructor_id: aEng },
                ];
                fetch('/api/assign-teachers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                .then(res => res.json()).then(data => alert(data.message)).catch(_err => alert('更新に失敗しました。'));
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

  // 教務課
  return (
    <div className="app-container">
      {renderTeacherModal()}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          
          {/* 💡 タブ切り替えボタン */}
          <div style={{ display: 'flex', gap: '5px', backgroundColor: '#e2e8f0', padding: '4px', borderRadius: '6px' }}>
            <button 
              onClick={() => setKyomuTab('timetable')} 
              style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: kyomuTab === 'timetable' ? 'white' : 'transparent', fontWeight: kyomuTab === 'timetable' ? 'bold' : 'normal', boxShadow: kyomuTab === 'timetable' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              📅 時間割エディタ
            </button>
            <button 
              onClick={() => setKyomuTab('curriculum')} 
              style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: kyomuTab === 'curriculum' ? 'white' : 'transparent', fontWeight: kyomuTab === 'curriculum' ? 'bold' : 'normal', boxShadow: kyomuTab === 'curriculum' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              📚 カリキュラム管理
            </button>
          </div>
          
          {kyomuTab === 'timetable' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              <label htmlFor="class-select" style={{ fontWeight: 'bold', color: '#475569', fontSize: '14px' }}>対象クラス:</label>
              <select id="class-select" value={currentClass} onChange={(e) => setCurrentClass(e.target.value)} style={{ padding: '4px 8px', fontSize: '16px', fontWeight: 'bold', borderRadius: '4px', border: '1px solid #94a3b8', cursor: 'pointer' }}>
                <option value="1A">1A</option>
                <option value="1B">1B</option>
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => setIsTeacherModalOpen(true)} style={{ padding: '10px 15px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
            ⚙️ 教員ルール設定
          </button>
          
          {kyomuTab === 'timetable' && (
            <>
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
            </>
          )}
          <button onClick={() => setRole(null)} style={{ padding: '10px 15px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
            ログアウト
          </button>
        </div>
      </header>
      
      <main className="main-content">
        {/* 💡 タブに応じた画面の出し分け */}
        {kyomuTab === 'timetable' ? (
          <>
            <section className="timetable-section">
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
                        
                        const activeSubject = draggingSubject || selectedSubject;
                        let isInstructorUnavailable = false;
                        
                        if (activeSubject) {
                          const teacher = teachers.find(t => t.id === activeSubject.instructor_id);
                          if (teacher) {
                            isInstructorUnavailable = !teacher.available_days.includes(dayIndex);
                          }
                        }
                        
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
            {/* 🌟 timetable={timetable} を最後に追加して引き渡す */}
            <Sidebar currentClass={currentClass} filteredSubjects={filteredSubjects} selectedSubject={selectedSubject} onSubjectSelect={setSelectedSubject} onDragStart={handleDragStart} workload={workload} timetable={timetable} />
          </>
        ) : (
          // 💡 カリキュラム管理タブのUI
          <section style={{ padding: '20px', width: '100%', maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
            <h2 style={{ fontSize: '24px', marginBottom: '20px', color: '#1e293b' }}>📚 カリキュラム管理</h2>
            
            <div style={{ marginBottom: '20px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontWeight: 'bold', marginRight: '10px' }}>対象の系統:</label>
              <select 
                value={selectedTrack} 
                onChange={(e) => setSelectedTrack(e.target.value)}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '16px' }}
              >
                <option value="普通">普通科</option>
                <option value="特進">特進科</option>
                <option value="理系">理系</option>
                <option value="文系">文系</option>
              </select>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>科目名</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>週あたりのコマ数</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {editingCurricula.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px' }}>
                      <input 
                        type="text" 
                        value={item.subject_name} 
                        onChange={(e) => handleCurriculumChange(idx, 'subject_name', e.target.value)} 
                        style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #cbd5e1' }} 
                        placeholder="例: 数学I" 
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input 
                        type="number" 
                        min="1" max="15" 
                        value={item.hours_per_week} 
                        onChange={(e) => handleCurriculumChange(idx, 'hours_per_week', parseInt(e.target.value) || 1)} 
                        style={{ padding: '8px', width: '80px', borderRadius: '4px', border: '1px solid #cbd5e1' }} 
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button 
                        onClick={() => removeCurriculumRow(idx)} 
                        style={{ color: '#e74c3c', cursor: 'pointer', border: 'none', background: 'none', fontWeight: 'bold' }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
                {editingCurricula.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                      この系統にはまだ科目が設定されていません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={addCurriculumRow} 
                style={{ padding: '10px 20px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ＋ 科目を追加
              </button>
              <button 
                onClick={saveCurriculum} 
                style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
              >
                変更を保存
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;