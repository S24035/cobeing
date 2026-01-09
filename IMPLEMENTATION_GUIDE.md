# CoBeing 返信中UI実装ドキュメント

## 実装概要

CoBeing チャットアプリに、AI返信待機中の UX を向上させるための「返信中… UI」を実装しました。

### 機能要件（実装済）

✅ **ステータスバー返信中表示**
- AI返信待機中、ステータスバー右側（`.status-label-sub`）に「返信中…」＋ドットアニメを表示
- 返信完了時に元の通常表示に戻る

✅ **チャット仮バブル表示**
- メッセージ欄の末尾に、bot側の一時的な仮バブルとして「返信中…」＋ドットアニメを表示
- 返信完了時に仮バブルは削除される（会話履歴に保存されない）

✅ **複数送信対策**
- `inflightToken` で現在進行中のリクエストを追跡
- 最後のリクエスト以外は UI 更新をスキップ（古い仮バブルが残らない）

✅ **アニメーション実装**
- 3点ドットが順番に跳ねるアニメーション（1.1秒ループ）
- `prefers-reduced-motion` に対応（モーション制限有効時はアニメ無効化）

✅ **UI/UX改善**
- 返信中は sendBtn を disabled に設定（連打防止）
- 入力欄(inputEl)への入力は可能（テキスト作成は続行可能）
- エラー時も同様に仮バブルを削除・ステータスを戻す

---

## ファイル変更内容

### `public/index.html`

#### 1) CSS追加（line 1284-1331）

```css
/* ==== 返信中… UI（ドットアニメ） ==== */
.replying {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.replying .dots {
  display: inline-flex;
  gap: 3px;
}

.replying .dots span {
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.35;
  animation: dotBounce 1.1s infinite ease-in-out;
}

.replying .dots span:nth-child(2) { animation-delay: 0.15s; }
.replying .dots span:nth-child(3) { animation-delay: 0.30s; }

@keyframes dotBounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-3px);
    opacity: 0.95;
  }
}

@media (prefers-reduced-motion: reduce) {
  .replying .dots span {
    animation: none;
    opacity: 0.6;
  }
}
```

#### 2) グローバル変数追加（line 3584-3585）

```javascript
let inflightToken = null;
```

複数送信時に、最後のリクエストのみが UI 更新できるようにするためのトークン。

#### 3) 補助関数追加（line 3587-3641）

**a) `createReplyingBubble()`**
- チャット欄の末尾に仮バブルを追加
- `[data-replying-bubble="true"]` 属性で識別可能

**b) `removeReplyingBubble()`**
- 仮バブルを検索して削除
- 複数あった場合は最初のものを削除

**c) `updateStatusBarReplying(isReplying)`**
- `isReplying === true` → ステータスバーを「返信中…」表示に
- `isReplying === false` → `updateStatusBar()` を呼び出して通常表示に戻す

#### 4) `handleSend()` 内の統合（line 3680-3765）

**送信前処理（line 3680-3698）**
```javascript
// inflightToken を生成（複数送信対策）
const currentToken = Symbol('inflight');
inflightToken = currentToken;

// 仮バブルを追加
createReplyingBubble();

// ステータスバーを返信中表示に
updateStatusBarReplying(true);

// 送信ボタンを無効化（オプション）
sendBtn.disabled = true;
```

**fetch成功時の後処理（line 3732-3736）**
```javascript
// 最後のリクエストのみが仮バブルを消す
if (inflightToken === currentToken) {
  removeReplyingBubble();
  updateStatusBarReplying(false);
  sendBtn.disabled = false;
}
```

**catch エラー時の後処理（line 3753-3759）**
- 同じクリーンアップ処理を実行してからエラーメッセージを表示

---

## 技術的なポイント

### 1) localStorage に保存されない

仮バブルは pure DOM 操作のみで、`conversation` 配列には追加されていません。  
→ リロード後も履歴に残らない（一時的な UI のみ）

### 2) inflightToken による複数送信対策

```javascript
// リクエストA開始
const tokenA = Symbol('inflight');
inflightToken = tokenA;
createReplyingBubble(); // 仮バブルA作成

// その直後にリクエストB開始
const tokenB = Symbol('inflight');
inflightToken = tokenB;
removeReplyingBubble(); // 古い仮バブルA削除
createReplyingBubble(); // 新しい仮バブルB作成

// リクエストAが返ってきても
if (inflightToken === tokenA) {  // false（tokenB が最新）
  // UI更新なし → 古い仮バブルが残らない
}
```

### 3) prefers-reduced-motion 対応

システム設定で「モーション制限」が有効な場合、ドットのアニメーションは停止。  
代わりにオパシティを `0.6` に固定して、視覚的な区別を保ちます。

### 4) ステータスバーの innerHTML 使用

`updateStatusBarReplying()` 内で `innerHTML` を使っていますが、固定文字列のみなので XSS 対策は不要です。

---

## テスト内容

[test-replying-ui.html](./test-replying-ui.html) で以下をテスト可能：

- ✅ ステータスバーの「返信中…」表示
- ✅ チャット仮バブルの追加/削除
- ✅ 完全フロー（送信 → 返信中 → 返信受信）
- ✅ 複数送信時の古い仮バブル削除動作

---

## 使用方法（ユーザー視点）

1. チャット欄にメッセージを入力して送信
2. 送信ボタンが disabled に
3. ステータスバーに「返信中…」が表示される
4. チャット欄の末尾に仮バブル（「返信中…」＋ドット）が表示される
5. AIからの返信が返ってくる
6. 仮バブルが消える
7. 本物の AI メッセージが表示される
8. ステータスバーが通常表示に戻る
9. 送信ボタンが enabled に戻る

---

## 仕様に対する準拠確認

### 要件A) ステータスバー側
- ✅ 既存の `.status-label-sub` を一時的に切り替え
- ✅ 返信完了後は `updateStatusBar()` で元に戻す
- ✅ HTML は固定文字列 + `<span>` タグのみ

### 要件B) チャット仮バブル側
- ✅ `messages` 末尾に DOM 追加
- ✅ `data-replying-bubble` 属性で識別
- ✅ 会話履歴（`conversation`）には入れない
- ✅ 返信完了時に削除 → 本物の bot メッセージを `addMessage()` で追加
- ✅ 複数送信時に古い仮バブルが残らない

### 要件C) 入力と送信
- ✅ 返信中は `sendBtn.disabled = true`
- ✅ `inputEl` への入力はできる
- ✅ 返信完了で `sendBtn.disabled = false`

### 要件D) アニメーション
- ✅ 3点ドットが順番に跳ねる（1.1秒ループ）
- ✅ `prefers-reduced-motion: reduce` で無効化

---

## コード品質

- ✅ 関数分割による読みやすさ
- ✅ コメント付きで意図を明確化
- ✅ 既存コードへの影響最小化
- ✅ エラーハンドリング（catch ブロック）
- ✅ メモリリーク対策（古い仮バブルは削除）
