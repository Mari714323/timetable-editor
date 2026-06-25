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

@app.post("/api/validate-slot", response_model=ValidationResponse)
def validate_slot(request: ValidationRequest):
    """特定のコマに教員を配置できるか、Hard制約をチェックする"""
    
    t_id = request.teacher_id
    schedule = request.current_day_assignments
    
    # 時限（1〜7限）を、配列のインデックス（0〜6）に変換
    target_idx = request.period - 1

    # --------------------------------------------------
    # 制約1: 1日最大4時間以内ルール
    # --------------------------------------------------
    current_count = schedule.count(t_id)
    if current_count >= 4:
        return ValidationResponse(
            is_valid=False,
            error_message="【1日上限エラー】選択された教員は、この曜日にすでに4コマ配置されています。"
        )

    # --------------------------------------------------
    # 制約2: 3時間連続授業の禁止ルール
    # --------------------------------------------------
    # 現在のスケジュールをコピーし、新しく配置したいコマに「仮配置」してみる
    temp_schedule = list(schedule)
    temp_schedule[target_idx] = t_id

    # 1限から7限（インデックス0〜6）の配列をスキャンし、3連続している箇所がないか調べる
    for i in range(len(temp_schedule) - 2):
        if temp_schedule[i] == t_id and temp_schedule[i+1] == t_id and temp_schedule[i+2] == t_id:
            return ValidationResponse(
                is_valid=False,
                error_message=f"【3連コマエラー】ここを埋めると、{i+1}限目から{i+3}限目まで3時間連続の授業になってしまいます。"
            )

    # すべてのHard制約をクリアした場合
    return ValidationResponse(is_valid=True)