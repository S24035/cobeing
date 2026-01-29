# Required Info (Phase 1) — CoBeing

このファイルは、Phase 1（Supabase作成→SQL適用→認証&同期API実装）に入るための最小決定事項です。
未確定の項目は TBD/TODO のままでOK。ただし Bundle ID / ドメインは早めに確定推奨。

---

## 1) Apple Developer Program status
- Status: 加入手続き中（Purchase直前まで確認済み / 反映に最大48hの可能性）
- Enrollment ID: SV95UR826M（画面上の「登録ID」）
- Team ID: TBD（加入反映後に取得）
- Bundle ID: com.cobeing.app（仮決定 / App Store Connect作成前に最終確定）
- App name (JP): CoBeing
- App name (EN): CoBeing

---

## 2) Domain / Hosting
- Production domain (for privacy policy + terms): https://cobeing.app（確定）
- API host domain: https://api.cobeing.app（確定）

---

## 3) IAP product plan
- Subscription duration: monthly only（まずは月額のみ）
- Product ID string:
  - com.cobeing.app.premium.monthly（※Bundle ID確定後、整合を確認）

---

## 4) Privacy / Legal
- Support email: tyokokukkimicchi@gmail.com
- Privacy policy URL: https://cobeing.app/privacy（予定）
- Terms of service URL: https://cobeing.app/terms（予定）

---

## 5) AI usage
- Provider: OpenAI
- Model name: gpt-4o-mini（現状の実装/想定）
  - NOTE: VSCodeで `Ctrl+Shift+F` → "model:" / "gpt-" で検索して最終確認
- Token pricing (input/output) or provider:
  - 方針: 公式料金ページ参照（数値は後で確定）
  - input: TBD
  - output: TBD

---

## 6) Data retention preference
- Free retention (days/items): 30 days
- Paid retention (days/items): 365 days

---

## 7) Localization
- Primary language: JP
- Secondary languages: EN

---

## Next actions（埋める優先順）
1. Apple加入が反映されたら Team ID を追記
2. Bundle ID を最終確定（これが一番重要 / 現在は仮で com.cobeing.app）
3. privacy/terms のURL（置き場所）を確定
