import sqlite3
import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Optional

app = FastAPI()

DB_FILE = "timetable.db"

# 🏫 複数クラスに対応した配置待ちの授業マスタ（1Aと1Bを用意）
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
    # --- ここから1Bの授業を追加 ---
    {
        "id": "S003",
        "title": "化学基礎",
        "target_class": "1B",
        "credits": 2,
        "type": "Required",
        "color": "#fef08a",
        "instructor_id": "T001",
    },
    {
        "id": "S004",
        "title": "現代の国語",
        "target_class": "1B",
        "credits": 3,
        "type": "Required",
        "color": "#bbf7d0",
        "instructor_id": "T003",
    },
]

# --- ⚙️ データベース初期化処理（スキーマ拡張版） ---
def init_db():
    """アプリ起動時にテーブルを作成し、1A・1Bそれぞれの空枠（35コマ×2クラス = 70レコード）を準備する"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 🔑 target_class を含めた3つの複合主キー（PK）に変更
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS timetable (
            target_class TEXT,
            day_idx INTEGER,
            period INTEGER,
            subject_title TEXT,
            PRIMARY KEY (target_class, day_idx, period)
        )
    """)
    
    # クラスごとに初期枠がなければインサート（今回は1Aと1B）
    cursor.execute("SELECT COUNT(*) FROM timetable")
    if cursor.fetchone()[0] == 0:
        for target_class in ["1A", "1B"]:
            for day in range(5):
                for prd in range(1, 8):
                    cursor.execute(
                        "INSERT INTO timetable (target_class, day_idx, period, subject_title) VALUES (?, ?, ?, NULL)",
                        (target_class, day, prd)
                    )
    
    conn.commit()
    conn.close()

# サーバー起動時に新しいスキーマでDBを初期化
init_db()


# --- 🔄 データ変換ヘルパー関数（クラス指定版） ---
def load_timetable_from_db(target_class: str) -> dict:
    """指定されたクラスの時間割のみをSELECTし、Reactが扱いやすい辞書型にマッピングする"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 🔍 WHERE句でクラスを絞り込む
    cursor.execute("""
        SELECT day_idx, period, subject_title 
        FROM timetable 
        WHERE target_class = ?
    """, (target_class,))
    rows = cursor.fetchall()
    conn.close()

    timetable_dict = {}
    for day_idx in range(5):
        timetable_dict[str(day_idx)] = {}
        for period in range(1, 8):
            timetable_dict[str(day_idx)][str(period)] = None

    for day_idx, period, subject_title in rows:
        timetable_dict[str(day_idx)][str(period)] = subject_title
        
    return timetable_dict


# --- Pydanticの型定義 ---
class ValidationRequest(BaseModel):
    teacher_id: str
    day: int
    period: int
    current_day_assignments: List[Optional[str]]
    target_class: str  # 🏫 【新規追加】バリデーション時にも対象クラスを受け取る

# 保存リクエストにどのクラスのデータかを格納する target_class を追加
class SaveTimetableRequest(BaseModel):
    target_class: str
    timetable: Dict[str, Dict[str, Optional[str]]]


# --- 🚀 エンドポイントの実装 ---

# 1. 初期データ取得API（クエリパラメータでクラスを受け取るよう拡張）
# 例: /api/init?target_class=1A
@app.get("/api/init")
def init_data(target_class: str = "1A"):
    # 指定されたクラスの時間割データを取得
    timetable = load_timetable_from_db(target_class)
    # 授業マスタは全クラス分をそのまま返して、フロント側でフィルタリングさせます
    return {"subjects": MOCK_SUBJECTS, "timetable": timetable}


# 2. 時間割の保存API（クラスを指定したUPDATE文に進化）
@app.post("/api/save")
def save_timetable(request: SaveTimetableRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    for day_str, periods in request.timetable.items():
        day_idx = int(day_str)
        for prd_str, subject_title in periods.items():
            period = int(prd_str)
            
            # WHERE句に target_class を指定して、他のクラスのデータを汚さないように安全にUPDATE
            cursor.execute("""
                UPDATE timetable
                SET subject_title = ?
                WHERE target_class = ? AND day_idx = ? AND period = ?
            """, (subject_title, request.target_class, day_idx, period))
            
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"{request.target_class}クラスの時間割をデータベースに保存しました。"}


# 3. リアルタイム制約チェックAPI（前回までのHard/Soft制約を完全維持）
@app.post("/api/validate-slot")
def validate_slot(request: ValidationRequest):
    warning_message = ""

    # 他クラスでのダブルブッキング検知 (Hard制約)
    # DBに直接アクセスし、画面に見えていない別クラスの状況を確認する
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT target_class, subject_title
        FROM timetable
        WHERE day_idx = ? AND period = ? AND target_class != ? AND subject_title IS NOT NULL
    """, (request.day, request.period, request.target_class))
    concurrent_classes = cursor.fetchall()
    conn.close()

    # DBから取得した他クラスの授業について、先生が重複していないかチェック
    for other_class, title in concurrent_classes:
        # 授業タイトルから、MOCK_SUBJECTS内の担当教員を割り出す
        for subject in MOCK_SUBJECTS:
            if subject["title"] == title and subject["instructor_id"] == request.teacher_id:
                return {
                    "is_valid": False,
                    "error_message": f"【重複エラー】担当教員({request.teacher_id})は、同じコマにすでに {other_class} クラスで「{title}」を担当しています。先生の体が足りません！",
                    "warning_message": ""
                }

    # 以降は既存のロジックそのまま
    if request.teacher_id == "T002":
        if request.day not in [1, 3]:
            return {
                "is_valid": False,
                "error_message": "【勤務日外エラー】ジョン先生は火曜日と木曜日のみ勤務可能です。",
                "warning_message": ""
            }

    current_count = sum(1 for slot in request.current_day_assignments if slot is not None)
    if current_count >= 4:
        return {
            "is_valid": False,
            "error_message": f"【1日上限エラー】担当教員({request.teacher_id})の授業がこの日に4コマ配置されています。これ以上配置できません。",
            "warning_message": ""
        }

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

    if request.day == 4 and request.period in [6, 7]:
        warning_message = "【注意】金曜日の後半コマ（6・7限）への配置です。極力避けることが望ましいです。"

    return {
        "is_valid": True, 
        "error_message": "",
        "warning_message": warning_message
    }