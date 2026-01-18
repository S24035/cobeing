# CoBeing タスク機能（Tasks v1）

## 概要
- Dashboard / Tasks / Templates / Calendar を追加し、タスク・目標を同一モデルで運用できるようにしました。
- 4段階達成（できなかった / やろうとした / 途中まで / 完璧）をワンタップで更新できます。
- テンプレからの一括生成、毎日/毎週/平日の繰り返し、目標の自動生成（初回のみ）に対応しています。
- チャットの「今日の状況どう？」「期限近いのある？」「優先度高いの何？」にローカル集計で回答します。

## データ構造
### Task
- id: string
- title: string
- priority: 1..5
- dueAt?: ISO date string（YYYY-MM-DD）
- category: string
- role: "normal" | "daily" | "weekly" | "goal"
- status: "not_done" | "tried" | "partial" | "perfect"
- repeat?: { freq: "daily"|"weekly", interval?: number, byweekday?: number[] }
- templateId?: string
- instanceOfTemplateId?: string
- templateItemId?: string
- generatedFor?: string
- createdAt: ISO
- updatedAt: ISO

### Template
- id: string
- name: string
- kind: "custom" | "daily" | "weekly"
- baseDate: YYYY-MM-DD
- items: TaskDraft[]
- createdAt: ISO
- updatedAt: ISO

TaskDraft
- id: string
- title: string
- priority: 1..5
- category: string
- role: "normal" | "daily" | "weekly" | "goal"
- dueOffsetDays?: number
- createdAt: ISO
- updatedAt: ISO

### GoalSettings
- autoGenerate: boolean
- goalTaskId?: string
- weeklyTemplateId?: string
- dailyTemplateId?: string
- lastWeeklyGenerated?: string
- lastDailyGenerated?: string

## ストレージ
- `cobeing_tasks_v1`（schemaVersion: 1）
- `cobeing_templates_v1`（schemaVersion: 1）
- `cobeing_goal_settings_v1`（schemaVersion: 1）

## 手動テスト（チェックリスト）
- [ ] Dashboard でクイック追加（タイトル/優先度/期限/種類）ができる
- [ ] タスクの編集/削除ができ、リロード後も残る
- [ ] 4段階ステータスが更新でき、集計に反映される
- [ ] テンプレを作成し、一括生成ができる
- [ ] 繰り返し（毎日/毎週/平日）を設定し、翌日に自動生成される
- [ ] 目標を保存すると初回のみ週/日テンプレが自動生成される（ON時）
- [ ] 週/日テンプレを編集すると次回生成に反映される
- [ ] カレンダー（月表示）で期限タスクの印が表示される
- [ ] チャットで「今日の状況どう？」にタスク集計が返る

## 既知の制約と今後の拡張
- テンプレの期限は baseDate を基準としたオフセットで管理（UIは日付入力）。
- 自動生成はアプリ起動時 or タスク画面を開いた時に実行（バックグラウンド更新は未対応）。
- iOS標準カレンダー連携は未対応（アプリ内カレンダーのみ）。
- テンプレ/繰り返しの履歴表示や詳細分析は今後の拡張候補。
