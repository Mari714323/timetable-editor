import json
import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Optional

app = FastAPI()

# データを保存するJSONファイルのパス
DATA_FILE = "timetable_data.json"

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


# 【ヘルパー関数】JSONファイルから時間割データを読み込む
def load_timetable_data() -> dict:
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    # ファイルが存在しない場合は、初期状態の空の時間割（月〜金：0〜4、1〜7限）を作って返す
    # フロントエンドが扱いやすいよう、キーは文字列にしておきます
    default_timetable = {}
    for day_idx in range(5):
        default_timetable[str(day_idx)] = {}
        for period in range(1, 8):
            default_timetable[str(day_idx)][str(period)] = None
    return default_timetable


# --- Pydanticの型定義（リクエストのバリデーション用） ---
class ValidationRequest(BaseModel):
    teacher_id: str
    day: int
    period: int
    current_day_assignments: List[Optional[str]]


# 新設：保存リクエスト用の型定義
class SaveTimetableRequest(BaseModel):
    timetable: Dict[str, Dict[str, Optional[str]]]


# --- エンドポイントの実装 ---


# 1. 初期データ取得API（JSONファイルからの読み込みに対応）
@app.get("/api/init")
def init_data():
    timetable = load_timetable_data()
    return {"subjects": MOCK_SUBJECTS, "timetable": timetable}


# 2. 新設：時間割の保存API（JSONファイルへの書き込み）
@app.post("/api/save")
def save_timetable(request: SaveTimetableRequest):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        # 読みやすさのためにインデントを整え、日本語が化けないように ensure_ascii=False にします
        json.dump(request.timetable, f, ensure_ascii=False, indent=2)
    return {"status": "success", "message": "時間割をJSONファイルに保存しました。"}


# 3. リアルタイム制約チェックAPI（前回作ったものをそのまま維持）
@app.post("/api/validate-slot")
def validate_slot(request: ValidationRequest):
    # 戻り値の初期値（デフォルトは警告なし）
    warning_message = ""

    # --- 1. 非常勤講師の勤務可能曜日チェック (Hard制約) ---
    if request.teacher_id == "T002":
        if request.day not in [1, 3]:
            return {
                "is_valid": False,
                "error_message": "【勤務日外エラー】ジョン先生は火曜日と木曜日のみ勤務可能です。",
                "warning_message": ""
            }

    # --- 2. 既存の制約：1日4時間上限チェック (Hard制約) ---
    current_count = sum(1 for slot in request.current_day_assignments if slot is not None)
    if current_count >= 4:
        return {
            "is_valid": False,
            "error_message": f"【1日上限エラー】担当教員({request.teacher_id})の授業がこの日に4コマ配置されています。これ以上配置できません。",
            "warning_message": ""
        }

    # --- 3. 既存の制約：3連コマ禁止チェック (Hard制約) ---
    p_idx = request.period - 1  # 1限〜7限を配列のインデックス(0〜6)に変換
    assignments = list(request.current_day_assignments)
    assignments[p_idx] = request.teacher_id
    
    for i in range(len(assignments) - 2):
        if assignments[i] == request.teacher_id and assignments[i+1] == request.teacher_id and assignments[i+2] == request.teacher_id:
            return {
                "is_valid": False,
                "error_message": f"【3連コマエラー】担当教員({request.teacher_id})の授業が3コマ連続してしまうため配置できません。",
                "warning_message": ""
            }

    # --- 4. [新規追加] Soft制約：金曜日の6限・7限のチェック ---
    # 金曜日(day == 4) かつ 6限または7限(period が 6 か 7) の場合
    if request.day == 4 and request.period in [6, 7]:
        warning_message = "【注意】金曜日の後半コマ（6・7限）への配置です。極力避けることが望ましいです。"

    # Hard制約をすべてクリアした場合（Soft制約の警告を添えて返す）
    return {
        "is_valid": True, 
        "error_message": "",
        "warning_message": warning_message
    }