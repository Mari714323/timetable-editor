// frontend/src/types.ts
// 授業データの型定義を外部ファイルに切り出し、どこからでもインポートできるようにします
export interface Subject {
  id: string;
  title: string;
  target_class: string;
  credits: number;
  type: string;
  color: string;
  instructor_id: string;
}