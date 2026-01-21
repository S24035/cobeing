# CoBeing タスク機能（Daily v2）

## 概要
- タスク画面に Daily / Goal 切替を追加（Goal は Coming Soon の案内のみ）。
- Daily 内は「一覧 / タスク作成 / 達成状況分析」の3タブ構成。
- 期限は dueAt（ISO datetime）で保持し、一覧は残り時間表示。
- 報告ボタン → 4段階（できなかった / やろうとした / 途中まで / 完璧）選択で更新。
- テンプレ作成と一括追加に対応。
- チャットの「今日の状況どう？」「期限近いのある？」「優先度高いの何？」にローカル集計で回答。

## データ構造
### Task
- id: string
- title: string
- priority: 1..5
- dueAt?: ISO datetime string（YYYY-MM-DDTHH:mm）
- category: string
- status: "not_done" | "tried" | "partial" | "perfect"
- statusUpdatedAt?: ISO string
- createdAt: ISO
- updatedAt: ISO

### Template
- id: string
- name: string
- items: { title: string, priority: number, dueAt?: ISO datetime, category: string }[]

## ストレージ
- `cobeing_tasks_v1`（schemaVersion: 2）
- `cobeing_templates_v1`（schemaVersion: 2）
- 旧 `YYYY-MM-DD` 形式の dueAt は読み込み時に `23:59` を付与して互換保持。

## 手動テスト（チェックリスト）
- [ ] タスク画面に Daily / Goal 切替が表示され、Goal は案内のみで壊れない
- [ ] Daily のタブが「一覧 / タスク作成 / 達成状況分析」になっている
- [ ] クイック追加でタイトル/優先度/期限/カテゴリが保存され、リロード後も残る
- [ ] 一覧に「タイトル / 残り時間 / 優先度 / 報告ボタン」だけ表示される
- [ ] 報告ボタン → 4段階選択で即時反映され、Undo が動く
- [ ] テンプレ作成 → 項目追加 → 今日に一括追加ができる
- [ ] 達成状況分析で今日の4段階件数とカテゴリ内訳が表示される
- [ ] カレンダー（月表示）に期限タスク件数が表示される
- [ ] チャットで「今日の状況どう？」に集計回答が返る

## 既知の制約と今後の拡張
- Goal モードは UI 枠のみ（自動生成ロジックは未実装）。
- テンプレの期限は時刻中心（適用時に今日の日付へ変換）。
- 達成状況分析は「dueAt が今日のタスク」を対象。
- iOS標準カレンダー連携は未対応（アプリ内カレンダーのみ）。
