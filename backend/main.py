import sqlite3
import os
import csv 
import io
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional

app = FastAPI()

DB_FILE = "timetable.db"

MOCK_SUBJECTS = [
    {"id": "S001", "title": "数学I", "target_class": "1A", "credits": 4, "type": "Required", "color": "#e0f2fe", "instructor_id": "T001"},
    {"id": "S002", "title": "コミュ英語I", "target_class": "1A", "credits": 3, "type": "Required", "color": "#fee2e2", "instructor_id": "T002"},
    {"id": "S003", "title": "化学基礎", "target_class": "1B", "credits": 2, "type": "Required", "color": "#fef08a", "instructor_id": "T001"},
    {"id": "S004", "title": "現代の国語", "target_class": "1B", "credits": 3, "type": "Required", "color": "#bbf7d0", "instructor_id": "T003"},
]

MOCK_TEACHERS = [
    {"id": "T001", "name": "山田先生", "available_days": "0,1,2,3,4", "max_periods_per_day": 4},
    {"id": "T002", "name": "ジョン先生", "available_days": "1,3", "max_periods_per_day": 4},
    {"id": "T003", "name": "佐藤先生", "available_days": "0,1,2,3,4", "max_periods_per_day": 4},
]

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS timetable (
            target_class TEXT, day_idx INTEGER, period INTEGER, subject_title TEXT,
            PRIMARY KEY (target_class, day_idx, period)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            id TEXT PRIMARY KEY, title TEXT, target_class TEXT, credits INTEGER, instructor_id TEXT, color TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS teachers (
            id TEXT PRIMARY KEY, name TEXT, available_days TEXT, max_periods_per_day INTEGER
        )
    """)
    
    cursor.execute("SELECT COUNT(*) FROM subjects")
    if cursor.fetchone()[0] == 0:
        for s in MOCK_SUBJECTS:
            cursor.execute("INSERT INTO subjects VALUES (?, ?, ?, ?, ?, ?)", (s["id"], s["title"], s["target_class"], s["credits"], s["instructor_id"], s["color"]))
            
    cursor.execute("SELECT COUNT(*) FROM teachers")
    if cursor.fetchone()[0] == 0:
        for t in MOCK_TEACHERS:
            cursor.execute("INSERT INTO teachers VALUES (?, ?, ?, ?)", (t["id"], t["name"], t["available_days"], t["max_periods_per_day"]))
            
    conn.commit()
    conn.close()

init_db() 

def load_timetable_from_db(target_class: str) -> dict:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT day_idx, period, subject_title FROM timetable WHERE target_class = ?", (target_class,))
    rows = cursor.fetchall()
    conn.close()
    timetable_dict = {str(d): {str(p): None for p in range(1, 8)} for d in range(5)}
    for day_idx, period, subject_title in rows:
        timetable_dict[str(day_idx)][str(period)] = subject_title
    return timetable_dict

class ValidationRequest(BaseModel):
    teacher_id: str
    day: int
    period: int
    current_day_assignments: List[Optional[str]]
    target_class: str

class SaveTimetableRequest(BaseModel):
    target_class: str
    timetable: Dict[str, Dict[str, Optional[str]]]

class TeacherAssignmentInput(BaseModel):
    subject_id: str
    instructor_id: str

# 💡 教員ルール更新用のデータモデル
class TeacherUpdateInput(BaseModel):
    id: str
    available_days: List[int]
    max_periods_per_day: int

@app.get("/api/init")
def init_timetable(target_class: str = "1A"):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, target_class, credits, instructor_id, color FROM subjects WHERE target_class = ?", (target_class,))
    subjects_list = [{"id": r[0], "title": r[1], "target_class": r[2], "credits": r[3], "instructor_id": r[4], "color": r[5]} for r in cursor.fetchall()]
    
    cursor.execute("SELECT id, name, available_days, max_periods_per_day FROM teachers")
    teachers_list = [{"id": r[0], "name": r[1], "available_days": [int(d) for d in r[2].split(',')], "max_periods": r[3]} for r in cursor.fetchall()]
    
    timetable = load_timetable_from_db(target_class)
    conn.close()
    return {"subjects": subjects_list, "timetable": timetable, "teachers": teachers_list}

@app.post("/api/save")
def save_timetable(request: SaveTimetableRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    for day_str, periods in request.timetable.items():
        day_idx = int(day_str)
        for prd_str, subject_title in periods.items():
            period = int(prd_str)
            cursor.execute("""
                INSERT INTO timetable (target_class, day_idx, period, subject_title)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(target_class, day_idx, period) 
                DO UPDATE SET subject_title = excluded.subject_title
            """, (request.target_class, day_idx, period, subject_title))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "保存しました。"}

@app.post("/api/validate-slot")
def validate_slot(request: ValidationRequest):
    warning_message = ""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name, available_days, max_periods_per_day FROM teachers WHERE id = ?", (request.teacher_id,))
    teacher_row = cursor.fetchone()
    
    cursor.execute("SELECT target_class, subject_title FROM timetable WHERE day_idx = ? AND period = ? AND target_class != ? AND subject_title IS NOT NULL", (request.day, request.period, request.target_class))
    concurrent_classes = cursor.fetchall()
    
    cursor.execute("SELECT title, instructor_id FROM subjects")
    subject_teacher_map = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()

    for other_class, title in concurrent_classes:
        if subject_teacher_map.get(title) == request.teacher_id:
            return {"is_valid": False, "error_message": f"【重複エラー】すでに {other_class} クラスを担当しています。", "warning_message": ""}

    if teacher_row:
        teacher_name, available_days_str, max_periods = teacher_row
        available_days = [int(d) for d in available_days_str.split(',')]
        if request.day not in available_days:
            return {"is_valid": False, "error_message": f"【勤務日外エラー】{teacher_name}はこの曜日に出勤しません。", "warning_message": ""}
        current_count = sum(1 for slot in request.current_day_assignments if slot is not None)
        if current_count >= max_periods:
            return {"is_valid": False, "error_message": f"【1日上限エラー】{teacher_name}はこれ以上配置できません。", "warning_message": ""}

    p_idx = request.period - 1
    assignments = list(request.current_day_assignments)
    assignments[p_idx] = request.teacher_id
    for i in range(len(assignments) - 2):
        if assignments[i] == request.teacher_id and assignments[i+1] == request.teacher_id and assignments[i+2] == request.teacher_id:
            return {"is_valid": False, "error_message": "【3連コマエラー】3連続になるため配置できません。", "warning_message": ""}

    if request.day == 4 and request.period in [6, 7]:
        warning_message = "【注意】金曜日の後半コマ（6・7限）への配置です。"

    return {"is_valid": True, "error_message": "", "warning_message": warning_message}

@app.get("/api/export-csv")
def export_csv(target_class: str = "1A"):
    timetable = load_timetable_from_db(target_class)
    output = io.StringIO()
    writer = csv.writer(output)
    days_kanji = ['月', '火', '水', '木', '金']
    writer.writerow(['時限'] + days_kanji)
    for period in range(1, 8):
        row = [f"{period}限"]
        for day_idx in range(5):
            subject = timetable[str(day_idx)][str(period)]
            row.append(subject if subject else "空き")
        writer.writerow(row)
    output.seek(0)
    headers = {'Content-Disposition': f'attachment; filename="timetable_{target_class}.csv"'}
    return StreamingResponse((line.encode('utf-8-sig') for line in output), media_type="text/csv", headers=headers)

@app.get("/api/workload")
def get_workload():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT subject_title, COUNT(*) as count FROM timetable WHERE subject_title IS NOT NULL GROUP BY subject_title")
    rows = cursor.fetchall()
    
    cursor.execute("SELECT subjects.title, teachers.name FROM subjects JOIN teachers ON subjects.instructor_id = teachers.id")
    subject_teacher_map = {r[0]: r[1] for r in cursor.fetchall()}
    conn.close()
    
    workload = {}
    for title, count in rows:
        teacher = subject_teacher_map.get(title)
        if teacher: workload[teacher] = workload.get(teacher, 0) + count
    return workload

@app.post("/api/auto-assign")
def auto_assign(target_class: str = "1A"):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, available_days, max_periods_per_day FROM teachers")
    teachers_db = {row[0]: {"available_days": [int(d) for d in row[1].split(',')], "max_periods": row[2]} for row in cursor.fetchall()}
        
    cursor.execute("SELECT id, title, target_class, credits, instructor_id, color FROM subjects")
    db_subjects = [{"id": r[0], "title": r[1], "target_class": r[2], "credits": r[3], "instructor_id": r[4], "color": r[5]} for r in cursor.fetchall()]
    
    cursor.execute("SELECT day_idx, period, subject_title FROM timetable WHERE target_class = ?", (target_class,))
    current_timetable_rows = cursor.fetchall()
    assigned_titles = [row[2] for row in current_timetable_rows if row[2] is not None]
    
    unassigned_subjects = [s for s in db_subjects if s["target_class"] == target_class and s["title"] not in assigned_titles]
    if not unassigned_subjects:
        conn.close()
        return {"status": "success", "message": "配置待ちの授業はありませんでした。"}

    cursor.execute("SELECT day_idx, period, subject_title FROM timetable WHERE target_class != ? AND subject_title IS NOT NULL", (target_class,))
    other_classes_rows = cursor.fetchall()
    
    other_class_teachers = {}
    for day, period, title in other_classes_rows:
        for subj in db_subjects:
            if subj["title"] == title:
                key = (day, period)
                if key not in other_class_teachers:
                    other_class_teachers[key] = []
                other_class_teachers[key].append(subj["instructor_id"])
                break

    timetable_matrix = {d: {p: None for p in range(1, 8)} for d in range(5)}
    for day, period, title in current_timetable_rows:
        timetable_matrix[day][period] = title

    assigned_count = 0
    for subject in unassigned_subjects:
        teacher_id = subject["instructor_id"]
        t_info = teachers_db.get(teacher_id, {"available_days": [0,1,2,3,4], "max_periods": 4})
        placed = False
        
        for day in range(5):
            if placed: break
            if day not in t_info["available_days"]: continue
                
            current_day_count = sum(1 for p in range(1, 8) if timetable_matrix[day][p] is not None and next((s["instructor_id"] for s in db_subjects if s["title"] == timetable_matrix[day][p]), "") == teacher_id)
            if current_day_count >= t_info["max_periods"]: continue
                
            for period in range(1, 8):
                if timetable_matrix[day][period] is not None: continue 
                if teacher_id in other_class_teachers.get((day, period), []): continue
                    
                prev_teacher = next((s["instructor_id"] for s in db_subjects if s["title"] == timetable_matrix[day].get(period - 1)), "") if period > 1 else ""
                next_teacher = next((s["instructor_id"] for s in db_subjects if s["title"] == timetable_matrix[day].get(period + 1)), "") if period < 7 else ""
                if prev_teacher == teacher_id and next_teacher == teacher_id: continue 
                
                timetable_matrix[day][period] = subject["title"]
                cursor.execute("""
                    INSERT INTO timetable (target_class, day_idx, period, subject_title)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(target_class, day_idx, period) 
                    DO UPDATE SET subject_title = excluded.subject_title
                """, (target_class, day, period, subject["title"]))
                placed = True
                assigned_count += 1
                break
                
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"未配置の授業のうち、{assigned_count}件を自動配置しました！"}

@app.post("/api/assign-teachers")
def assign_teachers(assignments: List[TeacherAssignmentInput]):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        for assign in assignments:
            cursor.execute("UPDATE subjects SET instructor_id = ? WHERE id = ?", (assign.instructor_id, assign.subject_id))
        conn.commit()
        return {"status": "success", "message": "担当教員の割り当てを更新しました！"}
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": f"更新に失敗しました: {str(e)}"}
    finally:
        conn.close()

# 💡 【新規追加】教員ルールの個別更新API
@app.post("/api/update-teacher")
def update_teacher(update: TeacherUpdateInput):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # [1, 3] のようなリストを "1,3" という文字列に変換してDBに保存
    days_str = ",".join(map(str, update.available_days))
    try:
        cursor.execute("""
            UPDATE teachers
            SET available_days = ?, max_periods_per_day = ?
            WHERE id = ?
        """, (days_str, update.max_periods_per_day, update.id))
        conn.commit()
        return {"status": "success", "message": "教員ルールを更新しました！"}
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": f"更新に失敗しました: {str(e)}"}
    finally:
        conn.close()