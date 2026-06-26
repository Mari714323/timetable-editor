import os
import sys
from typing import List, Dict, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ==========================================
# 【罠対策】Lambda環境での実行ルートズレを先回り
# ==========================================
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(CURRENT_DIR)

# 先ほど作成したスキーマから型定義をインポート
from schemas import Teacher, Subject

app = FastAPI(title="時間割原案エディタ API")

# フロントエンド（React）との通信を許可（クロスオリジン制限の解除）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開発中はローカルからのアクセスをすべて許可
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# モックデータ（動作確認用の先生・授業データ）
# ==========================================

# 1. 教員データ（常勤のサトウ先生と、火・木しか来ない非常勤のジョン先生）
MOCK_TEACHERS = [
    Teacher(id="T001", name="サトウ先生", is_part_time=False, available_days=[0, 1, 2, 3, 4], max_lessons_per_day=4),
    Teacher(id="T002", name="ジョン先生", is_part_time=True, available_days=[1, 3], max_lessons_per_day=4)
]

# 2. 授業データ（1Aクラスの数学と英語。上で定義した教員IDと紐付け）
MOCK_SUBJECTS = [
    Subject(title="数学I", target_class="1A", credits=4, type="Required", color="#3498db", instructor_id="T001"),
    Subject(title="コミュ英語I", target_class="1A", credits=3, type="Required", color="#e74c3c", instructor_id="T002")
]

# ==========================================
# API エンドポイント
# ==========================================

@app.get("/api/init")
def init_data():
    """アプリ起動時に、教員・授業リストと、空の時間割枠をフロントに返す"""
    
    # 月(0)〜金(4) ✖️ 1限(1)〜7限(7) の空の時間割の「器（マトリクス）」を作成
    # 最初は何も授業が入っていないので、すべて None（空っぽ）で初期化します
    initial_timetable = {}
    for day in range(5):  # 0:月, 1:火, 2:水, 3:木, 4:金
        initial_timetable[day] = {}
        for period in range(1, 8):  # 1限〜7限
            initial_timetable[day][period] = None

    return {
        "teachers": MOCK_TEACHERS,
        "subjects": MOCK_SUBJECTS,
        "timetable": initial_timetable
    }

@app.get("/api/health")
def health_check():
    """インフラデプロイ時や疎通確認用のヘルスチェックエンドポイント"""
    return {"status": "ok"}

# ==========================================
# バリデーション用のデータ構造（リクエスト / レスポンス）
# ==========================================

class ValidationRequest(BaseModel):
    teacher_id: str = "T001"
    day: int = 0  # 0:月 ~ 4:金
    period: int = 1  # 1限 ~ 7限
    # 検証したい曜日の、1限から7限までの現在の教員IDの配置状況（空きはNone）
    # 例: ["T001", None, "T002", "T001", None, None, None]
    current_day_assignments: List[Optional[str]]

class ValidationResponse(BaseModel):
    is_valid: bool
    error_message: Optional[str] = None

# ==========================================
# バリデーション エンドポイント
# ==========================================

@app.post("/api/validate-slot")
def validate_slot(request: ValidationRequest):
    # --- 1. [新規追加] 非常勤講師の勤務可能曜日チェック (Hard制約) ---
    # ジョン先生 (T002) は 火曜(1) と 木曜(3) だけ勤務可能
    if request.teacher_id == "T002":
        if request.day not in [1, 3]:
            return {
                "is_valid": False,
                "error_message": "【勤務日外エラー】ジョン先生は火曜日と木曜日のみ勤務可能です。"
            }

    # --- 2. 既存の制約：1日4時間上限チェック ---
    # 現在の配置コマ数（Noneでないもの）をカウント
    current_count = sum(1 for slot in request.current_day_assignments if slot is not None)
    if current_count >= 4:
        return {
            "is_valid": False,
            "error_message": f"【1日上限エラー】担当教員({request.teacher_id})の授業がこの日に4コマ配置されています。これ以上配置できません。"
        }

    # --- 3. 既存の制約：3連コマ禁止チェック ---
    # 新しく配置しようとしている前後のコマの状況を確認
    p_idx = request.period - 1  # 1限〜7限を配列のインデックス(0〜6)に変換
    assignments = list(request.current_day_assignments)
    
    # 仮想的に仮配置してみる
    assignments[p_idx] = request.teacher_id
    
    # 3連続している箇所がないかスキャン
    for i in range(len(assignments) - 2):
        if assignments[i] == request.teacher_id and assignments[i+1] == request.teacher_id and assignments[i+2] == request.teacher_id:
            return {
                "is_valid": False,
                "error_message": f"【3連コマエラー】担当教員({request.teacher_id})の授業が3コマ連続してしまうため配置できません。"
            }

    # すべての制約をクリアした場合
    return {"is_valid": True, "error_message": ""}