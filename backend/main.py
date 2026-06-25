import os
import sys
from typing import List, Dict, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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