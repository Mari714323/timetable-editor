import sqlite3
import os
import csv 
import io
import uuid
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

# 💡 3つのマスタ用初期データ
MOCK_CLASSES = [
    {"id": "1A", "grade": 1, "room": 1, "track_name": "普通"},
    {"id": "1B", "grade": 1, "room": 2, "track_name": "特進"},
]
MOCK_TRACKS = [
    {"track_name": "普通", "total_hours": 30},
    {"track_name": "特進", "total_hours": 32},
]
MOCK_CURRICULUM = [
    {"id": "C001", "track_name": "普通", "subject_large": "国語", "subject_small": "現代文", "hours_per_week": 2},
    {"id": "C002", "track_name": "普通", "subject_large": "国語", "subject_small": "古文", "hours_per_week": 2},
    {"id": "C003", "track_name": "普通", "subject_large": "数学", "subject_small": "数学I", "hours_per_week": 4},
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
    
    # 💡 古いテーブルを削除して3つのテーブルを新設（開発用リセット）
    cursor.execute("DROP TABLE IF EXISTS curriculum")
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS classes (
            id TEXT PRIMARY KEY, grade INTEGER, room INTEGER, track_name TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            track_name TEXT PRIMARY KEY, total_hours INTEGER
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS curriculum (
            id TEXT PRIMARY KEY, track_name TEXT, subject_large TEXT, subject_small TEXT, hours_per_week INTEGER
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

    cursor.execute("SELECT COUNT(*) FROM classes")
    if cursor.fetchone()[0] == 0:
        for c in MOCK_CLASSES:
            cursor.execute("INSERT INTO classes VALUES (?, ?, ?, ?)", (c["id"], c["grade"], c["room"], c["track_name"]))

    cursor.execute("SELECT COUNT(*) FROM tracks")
    if cursor.fetchone()[0] == 0:
        for t in MOCK_TRACKS:
            cursor.execute("INSERT INTO tracks VALUES (?, ?)", (t["track_name"], t["total_hours"]))

    cursor.execute("SELECT COUNT(*) FROM curriculum")
    if cursor.fetchone()[0] == 0:
        for c in MOCK_CURRICULUM:
            cursor.execute("INSERT INTO curriculum VALUES (?, ?, ?, ?, ?)", (c["id"], c["track_name"], c["subject_large"], c["subject_small"], c["hours_per_week"]))
            
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

class TeacherUpdateInput(BaseModel):
    id: str
    available_days: List[int]
    max_periods_per_day: int

# 💡 各種マスタ用スキーマ
class ClassInput(BaseModel):
    id: str
    grade: int
    room: int
    track_name: str

class TrackInput(BaseModel):
    track_name: str
    total_hours: int

class CurriculumDetailInput(BaseModel):
    subject_large: str
    subject_small: str
    hours_per_week: int

class CurriculumSaveRequest(BaseModel):
    track_name: str
    curricula: List[CurriculumDetailInput]

@app.get("/api/init")
def init_timetable(target_class: str = "1A"):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 💡 1. データベースからクラス系統を取得
    cursor.execute("SELECT track_name FROM classes WHERE id = ?", (target_class,))
    row = cursor.fetchone()
    track_name = row[0] if row else "普通"
    
    # 💡 2. カリキュラムテーブルから「科目（小分類）」と「必要時間数」を取得
    cursor.execute("SELECT subject_small, hours_per_week FROM curriculum WHERE track_name = ?", (track_name,))
    curriculum_map = {r[0]: r[1] for r in cursor.fetchall()}
    
    cursor.execute("SELECT title, instructor_id, color, id FROM subjects WHERE target_class = ?", (target_class,))
    subject_info = {row[0]: {"instructor_id": row[1], "color": row[2], "id": row[3]} for row in cursor.fetchall()}
    
    subjects_list = []
    for subj_title, hours in curriculum_map.items():
        info = subject_info.get(subj_title, {"instructor_id": "未定", "color": "#e2e8f0", "id": f"temp_{subj_title}"})
        subjects_list.append({
            "id": info["id"],
            "title": subj_title,
            "target_class": target_class,
            "credits": hours,
            "instructor_id": info["instructor_id"],
            "color": info["color"]
        })
    
    cursor.execute("SELECT id, name, available_days, max_periods_per_day FROM teachers")
    teachers_list = [{"id": r[0], "name": r[1], "available_days": [int(d) for d in r[2].split(',')], "max_periods": r[3]} for r in cursor.fetchall()]
    
    timetable = load_timetable_from_db(target_class)

    # 💡 フロントのプルダウン用に全クラス一覧も動的に返す
    cursor.execute("SELECT id FROM classes ORDER BY grade, room")
    classes_list = [r[0] for r in cursor.fetchall()]

    conn.close()
    return {"subjects": subjects_list, "timetable": timetable, "teachers": teachers_list, "classes": classes_list}

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

@app.post("/api/update-teacher")
def update_teacher(update: TeacherUpdateInput):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    days_str = ",".join(map(str, update.available_days))
    try:
        cursor.execute("UPDATE teachers SET available_days = ?, max_periods_per_day = ? WHERE id = ?", (days_str, update.max_periods_per_day, update.id))
        conn.commit()
        return {"status": "success", "message": "教員ルールを更新しました！"}
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": f"更新に失敗しました: {str(e)}"}
    finally:
        conn.close()

# 💡 【新規】クラスマスタ関連API
@app.get("/api/classes")
def get_classes():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, grade, room, track_name FROM classes ORDER BY grade, room")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "grade": r[1], "room": r[2], "track_name": r[3]} for r in rows]

@app.post("/api/classes")
def save_class(cls: ClassInput):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO classes (id, grade, room, track_name) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET grade=excluded.grade, room=excluded.room, track_name=excluded.track_name
        """, (cls.id, cls.grade, cls.room, cls.track_name))
        conn.commit()
        return {"status": "success", "message": f"クラス {cls.id} を保存しました。"}
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

# 💡 【新規】系統マスタ関連API
@app.get("/api/tracks")
def get_tracks():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT track_name, total_hours FROM tracks")
    rows = cursor.fetchall()
    conn.close()
    return [{"track_name": r[0], "total_hours": r[1]} for r in rows]

@app.post("/api/tracks")
def save_track(track: TrackInput):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO tracks (track_name, total_hours) VALUES (?, ?)
            ON CONFLICT(track_name) DO UPDATE SET total_hours=excluded.total_hours
        """, (track.track_name, track.total_hours))
        conn.commit()
        return {"status": "success", "message": f"系統 {track.track_name} を保存しました。"}
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

# 💡 【修正】カリキュラム詳細マスタ取得・保存API
@app.get("/api/curriculum")
def get_curriculum():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, track_name, subject_large, subject_small, hours_per_week FROM curriculum")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "track_name": r[1], "subject_large": r[2], "subject_small": r[3], "hours_per_week": r[4]} for r in rows]

@app.post("/api/curriculum")
def save_curriculum(req: CurriculumSaveRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        # 分母と分子の自動チェック！
        cursor.execute("SELECT total_hours FROM tracks WHERE track_name = ?", (req.track_name,))
        row = cursor.fetchone()
        if not row:
            return {"status": "error", "message": f"系統 '{req.track_name}' が見つかりません。"}
        
        target_hours = row[0]
        current_hours = sum(c.hours_per_week for c in req.curricula)
        
        if current_hours != target_hours:
            return {"status": "error", "message": f"【エラー】合計コマ数が一致しません！ (目標: {target_hours}コマ, 現在: {current_hours}コマ)"}

        cursor.execute("DELETE FROM curriculum WHERE track_name = ?", (req.track_name,))
        for c in req.curricula:
            new_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO curriculum (id, track_name, subject_large, subject_small, hours_per_week)
                VALUES (?, ?, ?, ?, ?)
            """, (new_id, req.track_name, c.subject_large, c.subject_small, c.hours_per_week))
        conn.commit()
        return {"status": "success", "message": f"{req.track_name} のカリキュラムを保存しました！"}
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": f"エラーが発生しました: {str(e)}"}
    finally:
        conn.close()