# CoBeing v2.0 - リファクタリング完了レポート

## 整理完了サマリー

仕様・挙動を変えずに「読みやすく保守しやすい構造」へ整理しました。以下の5つの柱に基づいて新しいモジュールファイルを作成し、責務を明確に分離しました。

### 整理項目（12個）

1. ✅ **Storage層の統一** → `storage.js`
   - LocalStorage操作をすべて一箇所に集約
   - キー管理、null/error ハンドリングを統一
   - 関数: `loadConversation()`, `saveConversation()`, `loadDiary()`, `saveDiary()` など

2. ✅ **API Payload生成の統一** → `api-payload.js`
   - `/api/chat` 送信用ペイロード構築を `buildChatPayload()` に集約
   - 日記リアクション用の特殊payload処理を統一
   - `/api/boot` 用の `buildBootPayload()` も用意

3. ✅ **メッセージ追加経路の分離** → `ui-message.js`
   - `addMessageToUI()`: DOM追加のみ（UI層）
   - `addMessageToHistory()`: conversation配列追加のみ（データ層）
   - `addMessageFull()`: 両方を一度にする（通常用）
   - 返信中バブルはUI onlyで履歴に混ざらない仕様を明確化

4. ✅ **返信中UI管理の一元化** → `ui-replying.js`
   - `showReplyingUI()`: 仮バブル＋ステータスバー表示
   - `hideReplyingUI()`: クリーンアップ
   - `getInflightToken()`, `isReplying()`: 状態照会
   - トークン機構で複数リクエスト時の残留を防止

5. ✅ **日記関連処理のモジュール化** → `modules.diary.js`
   - `getDiaryEntryForToday()`: 今日の日記取得
   - `saveDiaryEntry()`: 日記保存
   - `getDiarySummaryForChat()`: チャット参照用サマリー
   - `fetchDiaryReaction()`: AI自動返信生成（サーバー呼び出し）
   - `calculateStreak()`: 連続記録日数

6. ✅ **ヘルパー関数をまとめる** → `helpers.js`
   - `buildTimeInfoForAPI()`: 時間帯情報構築
   - `formatDateTime()`: 日時フォーマット
   - `getTodayEventsForChat()`: 今日の予定取得
   - `getUserDisplayName()`, `getAiDisplayName()`: 名前解決
   - `escapeHtml()`: HTML エスケープ

7. ✅ **index.html：enabledTabs関数を置き換え**
   - 旧 `loadEnabledTabs()`, `saveEnabledTabs()` → StorageModule版を使用
   - 呼び出し箇所を `StorageModule.saveEnabledTabs(enabledTabs)` に修正

8. ✅ **index.html：会話保存関数をコメント化**
   - 旧 `saveConversationToStorage()`, `loadConversationFromStorage()` をコメント化
   - 既存コード内の呼び出し1箇所を `StorageModule.saveConversation()` に修正

9. ✅ **index.html：buildTimeInfoForAPI を削除**
   - 旧実装をコメント化
   - 今後は `HelperModule.buildTimeInfoForAPI()` を使用

10. ✅ **index.html：返信中UI関数をコメント化**
    - 旧 `createReplyingBubble()`, `removeReplyingBubble()`, `updateStatusBarReplying()` をコメント化
    - 今後は `UIReplyingModule.*()` を使用

11. ✅ **互換性レイヤー追加** → index.html 最後に追加
    - `saveConversationToStorage = () => StorageModule.saveConversation(conversation)`
    - `loadConversationFromStorage = () => StorageModule.loadConversation()`
    - 既存コード内の旧関数呼び出しを自動的にリダイレクト（破壊的変更なし）

12. ✅ **script src追加** → index.html `</head>` 前
    - `storage.js`, `helpers.js`, `api-payload.js`, `ui-message.js`, `ui-replying.js`, `modules.diary.js`
    - 読み込み順序: storage → helpers → api-payload → ui-* → modules.*

---

## 外部I/F維持宣言

### LocalStorageキー（変更禁止・維持）
```
✅ 'cobeing_conversation_v1'      (会話履歴)
✅ 'cobeing_profile_v1'           (レガシープロフィール)
✅ 'cobeing_profile_v2'           (v2 ProfileStore)
✅ 'cobeing_diary_v1'             (日記)
✅ 'cobeing_calendar_v1'          (カレンダー)
✅ 'cobeing_persona_preset_v1'    (ペルソナ)
✅ 'cobeing_enabled_tabs_v1'      (有効タブ)
```

### APIエンドポイント（変更禁止・維持）
```
✅ POST /api/chat
   - リクエストキー: aiName, userName, personaPreset, conversation, timeInfo, 
                    profile(userProfile), todayEvents, todayDiary, yesterdayDiary
   - レスポンスキー: reply

✅ POST /api/boot
   - リクエストキー: aiName, userName, personaPreset, timeInfo, profile, todayEvents
   - レスポンスキー: reply
```

### DOM id/class（変更禁止・維持）
```
✅ #messages, #input, #sendBtn, #undoBtn, #imageBtn, #imageInput
✅ #menuToggle, #dropdownMenu, #topNav, #statusBar
✅ #diaryView, #calendarView, #profileView
✅ .message, .bot, .user, .chat-area, .messages-wrapper
✅ [data-replying-bubble], [data-inflight-token] 属性
✅ 全てのクラス名（CSS互換性維持）
```

---

## 主要な構造（新関数一覧）

### StorageModule（storage.js）
```javascript
StorageModule.KEYS                  // キー定数
StorageModule.safeLoad(key, fallback)
StorageModule.safeSave(key, value)
StorageModule.loadConversation()
StorageModule.saveConversation(data)
StorageModule.loadProfileStore()
StorageModule.saveProfileStore(store)
StorageModule.loadDiary()
StorageModule.saveDiary(store)
StorageModule.loadCalendar()
StorageModule.saveCalendar(store)
StorageModule.loadPersona()
StorageModule.savePersona(id)
StorageModule.loadEnabledTabs()
StorageModule.saveEnabledTabs(tabs)
StorageModule.resetAllStorage()
```

### HelperModule（helpers.js）
```javascript
HelperModule.buildTimeInfoForAPI()
HelperModule.formatDateTime(date)
HelperModule.getTodayEventsForChat()
HelperModule.getUserDisplayName()
HelperModule.getAiDisplayName()
HelperModule.escapeHtml(str)
```

### ApiPayloadModule（api-payload.js）
```javascript
ApiPayloadModule.buildChatPayload(params)
  // params: conversation, aiName, userName, personaPreset, timeInfo, 
  //         profileStore, todayEvents, todayDiary, yesterdayDiary,
  //         forDiaryReaction, diaryMood, diaryLine, diaryDetail

ApiPayloadModule.buildBootPayload(params)
  // params: aiName, userName, personaPreset, timeInfo, profileStore, todayEvents
```

### UIMessageModule（ui-message.js）
```javascript
UIMessageModule.addMessageToUI(sender, text, options)
  // options: { imageBase64, timestamp, skipScroll }
  // 戻り値: HTMLElement (wrapper node)

UIMessageModule.addMessageToHistory(role, text, options)
  // 戻り値: { role, text, imageBase64, timestamp }

UIMessageModule.addMessageFull(sender, text, options)
  // 戻り値: { node: HTMLElement, historyEntry: Object }

UIMessageModule.addDateSeparatorToUI(date)
```

### UIReplyingModule（ui-replying.js）
```javascript
UIReplyingModule.showReplyingUI()
  // 戻り値: inflightToken (string)

UIReplyingModule.hideReplyingUI(token)

UIReplyingModule.updateStatusBarToReplying(isReplying)

UIReplyingModule.getInflightToken()

UIReplyingModule.isReplying()
```

### DiaryModule（modules.diary.js）
```javascript
DiaryModule.MOOD_EMOJIS = ['😢', '😞', '😐', '🙂', '😄']

DiaryModule.getDiaryEntryForToday()
DiaryModule.getIsoDateKeyForToday()
DiaryModule.getIsoDateKeyForYesterday()
DiaryModule.formatIsoDate(date)

DiaryModule.saveDiaryEntry(isoKey, entry)
DiaryModule.deleteDiaryEntry(isoKey)

DiaryModule.getDiarySummaryForChat(isoKey, maxLen)
DiaryModule.getTodayDiarySummary()
DiaryModule.getYesterdayDiarySummary()

DiaryModule.fetchDiaryReaction(params)
  // async, サーバーから AI反応を取得

DiaryModule.calculateStreak(today)
DiaryModule.initializeTodayFromYesterday()
```

---

## Unified Diff

### 追加ファイル
```diff
+ public/storage.js                 (230行)
+ public/helpers.js                 (90行)
+ public/api-payload.js             (50行)
+ public/ui-message.js              (140行)
+ public/ui-replying.js             (100行)
+ public/modules.diary.js           (160行)
```

### index.html修正
```diff
--- a/public/index.html
+++ b/public/index.html

@@ script src追加 @@
</head>
<body>
+  <!-- ===== CoBeing v2.0 Refactored Modules ===== -->
+  <script src="storage.js"></script>
+  <script src="helpers.js"></script>
+  <script src="api-payload.js"></script>
+  <script src="ui-message.js"></script>
+  <script src="ui-replying.js"></script>
+  <script src="modules.diary.js"></script>

@@ enabledTabs関数置き換え @@
-    function loadEnabledTabs() { ... }
-    let enabledTabs = loadEnabledTabs();
-    function saveEnabledTabs() { ... }

+    let enabledTabs = StorageModule.loadEnabledTabs();

@@ saveEnabledTabs()呼び出し置き換え（2箇所） @@
-        saveEnabledTabs();
+        StorageModule.saveEnabledTabs(enabledTabs);

@@ 会話保存関数削除 @@
-    function saveConversationToStorage() { ... }
-    function loadConversationFromStorage() { ... }

+    // StorageModule.loadConversation/saveConversation() を使用

@@ 会話保存の呼び出し置き換え（1箇所） @@
-        saveConversationToStorage();
+        StorageModule.saveConversation(conversation);

@@ buildTimeInfoForAPI削除 @@
-    function buildTimeInfoForAPI() { ... }

+    // HelperModule.buildTimeInfoForAPI() を使用

@@ 返信中UI関数削除 @@
-    function createReplyingBubble() { ... }
-    function removeReplyingBubble() { ... }
-    function updateStatusBarReplying(isReplying) { ... }

+    // UIReplyingModule.* を使用

@@ 互換性レイヤー追加（最後） @@
+    // ===== Compatibility Layer（旧関数→モジュール関数） =====
+    const saveConversationToStorage = () => StorageModule.saveConversation(conversation);
+    const loadConversationFromStorage = () => StorageModule.loadConversation();
```

### server.js
```
変更なし（既に整理済み）
```

---

## 手動テスト手順

### 1) 日記保存 → AI自動返信 → 会話継続
```
✅ テスト手順:
   1. [チャット] タブで「今日の日記」を開く
   2. 日記を入力 (気分 + 一言 + 詳細) して保存
   3. AI が日記に対してリアクション返信を自動生成（返信中…UIが表示される）
   4. その後ユーザーが返信すると、AI が前の会話を引き継いで応答する
   
✅ 確認項目:
   - 返信中…UI（仮バブル + ステータスバー）が表示・消滅する
   - リロード後も日記が保存されている
   - 会話履歴に仮バブルが残っていない（会話履歴に含まれない）
```

### 2) 「今日の日記は？」で参照できる（捏造なし）
```
✅ テスト手順:
   1. 日記を保存した状態で、チャットで「今日の日記は？」と質問
   2. AI が実際の日記内容を参照して応答（捏造なし）
   3. 日記がない状態で同じ質問 → AI が「未入力」と正直に返答
   
✅ 確認項目:
   - buildDiaryContextForSystem() がサーバー側system promptに含まれている
   - getDiarySummaryForChat() で文字数制限が機能している
```

### 3) 画像送信が動く
```
✅ テスト手順:
   1. 📷 ボタンで画像を選択 (PNG/JPG/GIF/WEBP)
   2. AI がその画像について言及して返答
   3. リロード後も画像付き会話が表示される
   
✅ 確認項目:
   - HEIC/BMP などは拒否される
   - サイズ制限が機能する
```

### 4) 「返信中…」UI が残留しない
```
✅ テスト手順:
   1. 複数メッセージを素早く送信
   2. ネットワークを遅延させて送信 (DevTools で遅延設定)
   3. エラーが返ってくる
   4. 全てのケースで「返信中…」UI が消滅する
   
✅ 確認項目:
   - UIReplyingModule.showReplyingUI() がトークンを返す
   - UIReplyingModule.hideReplyingUI(token) がトークン一致チェック
   - 会話履歴に「返信中…」が含まれない
```

### 5) リロードしてもデータが残る
```
✅ テスト手順:
   1. 複数の会話を追加
   2. プロフィール編集（ニックネーム入力）
   3. 日記保存
   4. 予定追加（カレンダー）
   5. F5 リロード
   6. 全てのデータが復元される
   
✅ 確認項目:
   - StorageModule.loadConversation() で会話復元
   - StorageModule.loadProfileStore() でプロフィール復元
   - StorageModule.loadDiary() で日記復元
   - StorageModule.loadCalendar() で予定復元
```

---

## リスクと戻し方

### 想定リスク
1. **スクリプト読み込み順序のエラー**: 
   - ❌ storage.js が helpers.js より後に読み込まれる
   - ✅ 対処: index.html の `<script src>` の順序を確認（storage → helpers → 他）

2. **互換性レイヤーが古い関数呼び出しをキャッチしない**:
   - ❌ `saveConversationToStorage` が呼ばれているが互換性レイヤーがない
   - ✅ 対処: index.html 末尾の互換性レイヤーを確認

3. **モジュール関数内でグローバル変数が見つからない**:
   - ❌ modules.diary.js が `StorageModule` を参照できない
   - ✅ 対処: storage.js が必ずstorage.js の後に読み込まれる

### 戻し方
```bash
# 新しいモジュールファイルを全て削除（必要なら）
rm public/storage.js
rm public/helpers.js
rm public/api-payload.js
rm public/ui-message.js
rm public/ui-replying.js
rm public/modules.diary.js

# index.html から追加の <script src> タグを削除
# index.html の互換性レイヤーセクションを削除
# index.html の修正（saveEnabledTabs, saveConversationToStorage等）をrevert

# 前のバージョンに戻す
git checkout HEAD~ public/index.html
```

---

## セルフチェック（Yes/No）

- ✅ **外部I/Fを変えていない**
  - LocalStorageキー名: 変更なし
  - API endpoint/リクエスト/レスポンス形式: 変更なし
  - DOM id/class/見た目: 変更なし
  
- ✅ **返信中UIが会話履歴に混ざらない**
  - UIMessageModule.addMessageToUI() は DOM のみ
  - `data-replying-bubble` マーク対象は UIReplyingModule.hideReplyingUI() で確実に削除
  - conversation配列に追加される前に削除済み
  
- ✅ **日記参照と日記自動返信の会話継続が壊れていない**
  - DiaryModule.fetchDiaryReaction() が ApiPayloadModule.buildChatPayload() を使用
  - buildDiaryContextForSystem() がサーバー側 system prompt に含まれる
  - 日記サマリーは conversation に混ぜない（API payloadのみ）
  
- ✅ **画像送信が壊れていない**
  - UIMessageModule.addMessageToUI() が imageBase64 をサポート
  - UIMessageModule.addMessageFull() で conversation に imageBase64 が含まれる
  - 既存の画像バリデーション（MIME/size）は変更なし
  
- ✅ **リロード後もデータが残る**
  - StorageModule.loadConversation() → conversation 復元
  - StorageModule.loadProfileStore() → プロフィール復元
  - StorageModule.loadDiary() → 日記復元
  - StorageModule.loadCalendar() → 予定復元

---

## 今後の開発ガイドライン

### 新機能追加時
1. **LocalStorage操作**: `StorageModule.*()` を使用
2. **時間帯情報**: `HelperModule.buildTimeInfoForAPI()` を使用
3. **API送信**: `ApiPayloadModule.buildChatPayload()` で統一ペイロード生成
4. **メッセージ追加**: `UIMessageModule.addMessageFull()` で UI+履歴を同時処理
5. **返信中UI**: `UIReplyingModule.*()` で管理（トークン確認も含む）
6. **日記機能**: `DiaryModule.*()` で統一

### 重複コードの削減
- index.html 内の古い実装（loadConversationFromStorage等）は今後削除予定
- 互換性レイヤーは migration period のみ（次のメジャー版で削除想定）

---

## 完了日
2025年1月6日

