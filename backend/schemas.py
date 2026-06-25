from typing import Literal, List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

# ==========================================
# 1. 教員（Teacher）の定義
# ==========================================
class Teacher(BaseModel):
    id: str = Field(..., description="教員コード（例: T001）")
    name: str = Field(..., description="教員名")
    is_part_time: bool = Field(False, description="非常勤講師フラグ")
    # 0:月, 1:火, 2:水, 3:木, 4:金, 5:土
    available_days: List[int] = Field([0, 1, 2, 3, 4], description="出勤可能曜日（非常勤用）")
    max_lessons_per_day: int = Field(4, description="1日の最大授業数（共通ルールは4）")

# ==========================================
# 2. 授業（Subject / カリキュラム）の定義
# ==========================================
class Subject(BaseModel):
    id: UUID = Field(default_factory=uuid4, description="授業一意識別ID")
    title: str = Field(..., description="教科・科目名（例: 数学I）")
    target_class: str = Field(..., description="対象クラス（例: 1A）")
    credits: int = Field(..., description="週あたりの必要コマ数（例: 4）")
    type: Literal['Required', 'Elective'] = Field('Required', description="必修 / 選択")
    color: str = Field('#3498db', description="UI表示用のカラーコード")
    instructor_id: str = Field(..., description="担当教員のID（Teacher.idと紐付け）")

# ==========================================
# 3. 時間枠スロット（Slot）の定義
# ==========================================
class Slot(BaseModel):
    day: int = Field(..., description="曜日（0:月〜5:土）")
    period: int = Field(..., description="時限（1〜7限）")

# ==========================================
# 4. 制約（Constraint）の定義（将来の拡張用）
# ==========================================
class Constraint(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    type: Literal['Hard', 'Soft']
    description: str
    weight: int = Field(0, description="Soft制約の重みスコア")