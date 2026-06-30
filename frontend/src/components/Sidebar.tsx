import React from 'react';
import type { Subject } from '../types';

interface SidebarProps {
  currentClass: string;
  filteredSubjects: Subject[];
  selectedSubject: Subject | null;
  onSubjectSelect: (subject: Subject) => void;
  onDragStart: (e: React.DragEvent, subject: Subject) => void;
  workload: { [key: string]: number };
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentClass,
  filteredSubjects,
  selectedSubject,
  onSubjectSelect,
  onDragStart,
  workload,
}) => {
  return (
    <section className="sidebar-section">
      <h2>{currentClass} の配置待ち授業</h2>
      <div className="subjects-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredSubjects.map((subject) => {
          const isSelected = selectedSubject?.id === subject.id;
          return (
            <div
              key={subject.id}
              draggable={true}
              onDragStart={(e) => onDragStart(e, subject)}
              onClick={() => onSubjectSelect(subject)}
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

      <div style={{ marginTop: '30px', backgroundColor: '#e2e8f0', padding: '16px', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, fontSize: '16px', color: '#334155', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>
          📊 教員の稼働状況 (全クラス)
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {Object.entries(workload).length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748b' }}>配置済みの授業はありません</div>
          ) : (
            Object.entries(workload).map(([teacher, count]) => (
              <div key={teacher} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#fff', padding: '8px 12px', borderRadius: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <span style={{ fontWeight: 'bold', color: '#475569' }}>{teacher}</span>
                <span style={{ fontWeight: 'bold', color: count >= 5 ? '#e74c3c' : '#2ecc71' }}>{count} コマ</span>
              </div>
            ))
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '12px', textAlign: 'right' }}>
          ※「変更を保存する」と最新化されます
        </div>
      </div>
    </section>
  );
};