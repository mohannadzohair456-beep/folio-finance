# Folio — Product and Delivery Roadmap
Last updated: 2026-10-12

## Product principle
Folio is an offline-first financial companion, not a bank connection. Transactions may come from manually confirmed inputs or explicitly authorized, approved Android notification sources. Reported balances are snapshots, not live bank data. Do not imply that Folio knows actual cash available or offers regulated investment advice.

## v2.0 scope (implemented in Android project)
- Four-stage branded onboarding: welcome, optional financial baseline, optional notification permission explanation and review, completion.
- No technical listener controls on Home. Changes to notification sources and permission management after onboarding belong in Settings.
- Branded native loading indicator plus lightweight interface motion with reduced-motion support.
- Ask Folio: natural text prompts, optional Android speech recognition, user review before any changes, no paid back end.
- Supported local assistant actions: reported balance snapshot, expected monthly salary, overall monthly spending budget, per-category budget, recorded expense/income, monthly summary, affordability estimate.
- Voice recognition is provided by the Android device, may use a network and can be missing. Transcript is editable and no financial action is committed automatically.
- Notes for affordability: snapshot+subsequent recorded transactions in selected currency; planned income is not recorded cash flow. Explain uncertainty and upcoming bill risks.

## Priority acceptance criteria
1. Fresh install opens onboarding, not a dashboard of demo data or an OS permission prompt.
2. Skipping notification permission never prevents manually adding an income/expense.
3. Permission granting always goes through the platform screen; Folio provides a custom rationale first.
4. Tracking setup is only in onboarding/Settings, not on Home.
5. Opening balance snapshot does not count as monthly income; expected salary is a plan, not an income transaction.
6. Each assistant financial write has an explicit on-screen confirmation and a way to cancel.
7. Unrecognizable language or an unavailable speech provider never changes financial records.
8. Existing transactions are preserved on upgrade using the same Android signing identity.
9. Amounts are stored in minor currency units; multi-currency entries are not silently converted.
10. Startup skeleton/spinner disappears once WebView loads; navigation and forms remain responsive.

## Next release candidates (not yet implemented)
- Secure backup/restore and migration tool, verified on a real device, before collecting irreplaceable records.
- Stable APK signing and automated update retention for all future releases.
- Dedicated recurring-bills/calendar view, monthly forecast and emergency savings goal tracking.
- Fully tested Arabic/English voice-language understanding and better speech transcript error recovery.
- Per-bank parser fixture library with synthetic or properly redacted notifications.
- Optional password-protected export and local app lock.
- Consent-based account sign-in and end-to-end encrypted syncing only if requested; no bank credentials.
- More advanced AI only with an explicit privacy policy, security review, cost envelope and user control over data sent to providers.

## Financial guidance references
- Consumer Financial Protection Bureau: Your Money, Your Goals toolkit — https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/
- CFPB: Assess your spending — https://www.consumerfinance.gov/owning-a-home/prepare/assess-your-spending/
- Android documentation: Runtime permissions — https://developer.android.com/training/permissions/requesting
- Android documentation: RecognizerIntent — https://developer.android.com/reference/android/speech/RecognizerIntent

## Explicit limitations
Tests cannot guarantee a specific bank notification is captured on a specific Android phone.
Speech recognition may transmit audio to a provider; Folio does not run its own generative AI.
A debug APK built with a new GitHub runner may have a different signing certificate. Configure valid stable release-signing secrets before promising in-place updates.
