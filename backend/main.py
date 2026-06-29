import sqlite3
import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Optional

app = FastAPI()

# 🗄️ データベースファイルのパス
DB_FILE = "timetable.db"

# 初期データ（配置待ちの授業リスト）
MOCK_SUBJECTS = [
    {
        "id": "S001",
        "title": "数学I",
        "target_class": "1A",
        "credits": 4,
        "type": "Required",
        "color": "#e0f2fe",
        "instructor_id": "T001",
    },
    {
        "id": "S002",
        "title": "コミュ英語I",
        "target_class": "1A",
        "credits": 3,
        "type": "Required",
        "color": "#fee2e2",
        "instructor_id": "T002",
    },
]

# --- ⚙️ データベース初期化処理 ---
def init_db():
    """アプリ起動時にテーブルを作成し、35コマ分の空枠を準備する"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 1. テーブルの作成（曜日と時限の組み合わせを主キーにする）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS timetable (
            day_idx INTEGER,
            period INTEGER,
            subject_title TEXT,
            PRIMARY KEY (day_idx, period)
        )
    """)
    
    # 2. 初期データ（35コマ分の空データ）がなければインサート
    cursor.execute("SELECT COUNT(*) FROM timetable")
    if cursor.fetchone()[0] == 0:
        for day in range(5):
            for prd in range(1, 8):
                cursor.execute(
                    "INSERT INTO timetable (day_idx, period, subject_title) VALUES (?, ?, NULL)",
                    (day, prd)
                )
    
    conn.commit()
    conn.close()

# サーバー起動時に必ずDBを初期化する
init_db()


# --- 🔄 データ変換ヘルパー関数 ---
def load_timetable_from_db() -> dict:
    """DBから時間割を取得し、フロントエンド（React）が扱いやすい辞書型に整形する"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT day_idx, period, subject_title FROM timetable")
    rows = cursor.fetchall()
    conn.close()

    # 初期構造を辞書型で定義（React側の都合上、キーは文字列にします）
    timetable_dict = {}
    for day_idx in range(5):
        timetable_dict[str(day_idx)] = {}
        for period in range(1, 8):
            timetable_dict[str(day_idx)][str(period)] = None

    # DBから取得したデータを辞書にマッピング
    for day_idx, period, subject_title in rows:
        timetable_dict[str(day_idx)][str(period)] = subject_title
        
    return timetable_dict


# --- Pydanticの型定義 ---
class ValidationRequest(BaseModel):
    teacher_id: str
    day: int
    period: int
    current_day_assignments: List[Optional[str]]

class SaveTimetableRequest(BaseModel):
    timetable: Dict[str, Dict[str, Optional[str]]]


# --- 🚀 エンドポイントの実装 ---

# 1. 初期データ取得API（SQLiteからの読込に切り替え）
@app.get("/api/init")
def init_data():
    timetable = load_timetable_from_db()
    return {"subjects": MOCK_SUBJECTS, "timetable": timetable}


# 2. 時間割の保存API（JSON上書きから、SQLのUPDATE文に切り替え）
@app.post("/api/save")
def save_timetable(request: SaveTimetableRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # フロントから届いたマトリクスデータをループして、1コマずつUPDATE文を発行
    for day_str, periods in request.timetable.items():
        day_idx = int(day_str)
        for prd_str, subject_title in periods.items():
            period = int(prd_str)
            
            cursor.execute("""
                UPDATE timetable
                SET subject_title = ?
                WHERE day_idx = ? AND period = ?
            """, (subject_title, day_idx, period))
            
    conn.commit()
    conn.close()
    return {"status": "success", "message": "時間割をSQLiteデータベースに保存しました。"}


# 3. リアルタイム制約チェックAPI（Hard制約 ＆ Soft制約を完全維持）
@app.post("/api/validate-slot")
def validate_slot(request: ValidationRequest):
    warning_message = ""

    # ジョン先生の勤務曜日制限 (Hard)
    if request.teacher_id == "T002":
        if request.day not in [1, 3]:
            return {
                "is_valid": False,
                "error_message": "【勤務日外エラー】ジョン先生は火曜日と木曜日のみ勤務可能です。",
                "warning_message": ""
            }

    # 1日4時間上限チェック (Hard)
    current_count = sum(1 for slot in request.current_day_assignments if slot is not None)
    if current_count >= 4:
        return {
            "is_valid": False,
            "error_message": f"【1日上限エラー】担当教員({request.teacher_id})の授業がこの日に4コマ配置されています。これ以上配置できません。",
            "warning_message": ""
        }

    # 3連コマ禁止チェック (Hard)
    p_idx = request.period - 1
    assignments = list(request.current_day_assignments)
    assignments[p_idx] = request.teacher_id
    
    for i in range(len(assignments) - 2):
        if assignments[i] == request.teacher_id and assignments[i+1] == request.teacher_id and assignments[i+2] == request.teacher_id:
            return {
                "is_valid": False,
                "error_message": f"【3連コマエラー】担当教員({request.teacher_id})の授業が3コマ連続してしまうため配置できません。",
                "warning_message": ""
            }

    # 金曜日の6限・7限チェック (Soft)
    if request.day == 4 and request.period in [6, 7]:
        warning_message = "【注意】金曜日の後半コマ（6・7限）への配置です。極力避けることが望ましいです。"

    return {
        "is_valid": True, 
        "error_message": "",
        "warning_message": warning_message
    }