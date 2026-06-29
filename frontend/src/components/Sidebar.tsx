// frontend/src/components/Sidebar.tsx
import React from 'react';
import type { Subject } from '../types';

// 1. 親（App.tsx）から受け取る引数（Props）の型を定義します
interface SidebarProps {
  currentClass: string;
  filteredSubjects: Subject[];
  selectedSubject: Subject | null;
  onSubjectSelect: (subject: Subject) => void;
  onDragStart: (e: React.DragEvent, subject: Subject) => void;
}

// 2. コンポーネント本体
// 親から渡されたデータを受け取って、HTML（JSX）を組み立てて返します
export const Sidebar: React.FC<SidebarProps> = ({
  currentClass,
  filteredSubjects,
  selectedSubject,
  onSubjectSelect,
  onDragStart,
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
    </section>
  );
};