# DayTickles — product spec (draft)

A daily journaling app: users record the one thing that made them smile today, archived with a short animation, with an optional in-app community feed.

## Concept

- One entry per user per day: text + mood + animation style
- Personal archive: scrollable timeline of past entries
- Optional in-app community feed: entries marked public appear for other users to like
- Likes ping back to the entry owner as a notification, and surface as a counter right on the entry
- Any entry (private or public) can be shared one-to-one with a friend via a simple link — a share, not an app invite
- Users can follow other "ticklers" (marked with a feather) to see more of their tickles, via a dedicated Following tab alongside the main feed

## Data model

**users** — id, username, display_name, avatar_url, smile_streak, locale, country (nullable), trial_started_at, subscription_plan (none/monthly/annual/lifetime), subscription_expires_at (null for lifetime), created_at

**app_config** — id, active_seasonal_palette, palette_start_date, palette_end_date (global, not per-user — one row read by all clients on both DayTickles.app and DayTickles.com)

**tickle_entries** — id, user_id (FK), entry_date, text_content, media_url, animation_template_id (FK), mood_emoji, visibility (private/public), like_count (cached), created_at

**animation_templates** — id, name, style, lottie_url

**likes** — id, entry_id (FK), user_id (FK), created_at

**comments** — id, entry_id (FK), user_id (FK), text, created_at

**notifications** — id, recipient_id (FK), actor_id (FK), entry_id (FK), type (like / comment / streak_milestone), is_read, created_at

**follows** — id, follower_id (FK), followee_id (FK), created_at

**tickle_shares** — id, entry_id (FK), created_by (FK), share_token (unique), created_at

### Key relationships
- A `like` insert triggers a `notification` row in the same transaction — no polling, no external webhooks.
- `visibility` on the entry is the single switch that decides whether it appears in the feed — there's no separate "publish" step.
- Notifications reference the entry directly, so likes surface right on that day's archive card, not in a generic activity feed.
- `locale` on the user (e.g. `en`, `es`, `fr`, `ja`) drives which set of UI strings loads — a standard i18n setup, set from the Settings screen.
- The 70s retro palette is the single permanent brand skin, shared identically across DayTickles.app and DayTickles.com — no per-user theme picker.
- `app_config.active_seasonal_palette` is a global override, not a per-user setting: all screens reference the same token names (background, accent, card, text), and a seasonal palette temporarily swaps just those token values for every user on both domains at once. Same layout, same shapes — only the color values shift for the duration of the window.
- Seasonal palettes are calendar-based, not weather/hemisphere-based, and named thematically rather than literally (e.g. "harvest" rather than "autumn") so the palette reads as a mood, not a claim about the season where the user actually lives.
- Translation is on-demand, not stored: tapping "Translate" on any entry calls a translation API at read time using the entry text + the viewer's `locale`. The original `text_content` is never overwritten, so re-viewing in a different language re-translates rather than reading stale cached text.
- `country` on the user (2-letter code, e.g. `ES`, `JP`) is optional — nullable, skippable at onboarding, editable anytime in Settings. If unset, no flag shows next to that person's name anywhere in the app. Settings shows a short explanation of what it's used for right under the field, since it's the only setting that's purely social rather than functional.
- `trial_started_at` is set the moment a user signs up and drives a 30-day full-access window (personal archive + community feed both unlocked). After day 30, `subscription_plan` determines feed access: `none` reverts the user to personal-only (archive stays fully theirs, but new feed posting/browsing is locked), while `monthly`/`annual`/`lifetime` keep the feed unlocked. `subscription_expires_at` is null for `lifetime` and for `none` (nothing to expire); it's checked, not polled, at the point a user tries to view or post to the feed.
- Downgrading past the trial doesn't hide a user's already-posted feed entries or the likes they already earned — their existing public entries and `like_count` stay visible to others; only *new* feed activity (posting or browsing) is gated.
- `like_count` on `tickle_entries` is a cached counter, incremented/decremented alongside each `likes` insert/delete in the same transaction — avoids a live count query every time the archive or feed loads.
- The archive's top slot is a query, not a stored flag: whichever entry has the highest `like_count` among entries from the last 14 days is pinned above the normal chronological list. Recalculated on each load rather than stored, so it shifts automatically as likes come in and ages out cleanly after 14 days with no manual unpinning step needed.
- `tickle_shares` is separate from `visibility` on purpose: sharing a tickle one-to-one with a friend is a different action from posting it to the public feed, so a private entry can still be shared via a link without becoming public. Each share generates a unique `share_token` used in an unlisted link (e.g. `daytickles.app/t/<token>`) that opens a simple read-only web preview of that single entry — no login required, no app-install wall in front of the content. This is a share, not an invite: there's no "join DayTickles" pressure baked into the flow, just a small, secondary mention of the app once they're already looking at the tickle.
- `follows` powers a feather badge next to a followed user's name, and splits the feed into two tabs — **Following** and **Everyone** — rather than blending both into one ranked feed. Following someone doesn't require them to follow back; it's one-directional, same as the like/notification pattern.

### Palette rotation
- **70s retro** (permanent default) — warm cream, rust/mustard/coral palette
- **Seasonal palettes** (temporary, global, calendar-scheduled) — e.g. a "harvest" amber/rust variant, a "bloom" mint/pastel variant — swapped in for a few weeks at a time as a retention/marketing moment, then reverted to the 70s default
- The pastel, midnight, citrus, grey, and navy-rose explorations from earlier stay on file as a bank of ready-made seasonal candidates rather than shipping as permanent user-selectable skins

## Screens (mocked up)

1. **Home / archive** — smile streak, total tickles + new likes stat cards, most-liked entry from the last 14 days pinned at top, scrollable list of past entries each showing a like-count pill and a share action
2. **Community feed** — two tabs, Following and Everyone; followed users show a feather badge next to their name; each entry likeable
3. **Entry creation** — text prompt, animation style picker, mood selector, share-to-feed toggle
4. **Entry detail** — full entry view, like count, list of who liked it (with country flag), on-demand translate popup, "send to a friend" share action
5. **Notifications** — chronological list of likes and streak milestones, tied back to specific entries
6. **Settings** — language picker, optional country field (with short explainer text), daily reminder toggle, notify-on-likes toggle, public profile toggle
7. **Upgrade / paywall** — shown when the trial ends; lifetime/annual/monthly plans, with a clear "keep my archive, skip the feed" opt-out that never blocks personal use

## Design direction

70s retro-inspired: warm cream background, rust/mustard/coral/avocado palette, heavily rounded shapes, serif display type for headlines, sunburst/circle motifs standing in for the entry's animation.

## Monetization

**Model**: 30-day free trial with full access (personal archive + community feed). After the trial, personal journaling stays free forever — the core habit is never gated. Continued access to the community feed (posting and browsing) requires a paid plan.

**Pricing**:
- Monthly — $2.00/mo
- Annual — $19.00/yr (≈21% off monthly)
- Lifetime — $59.00 one-time

**On downgrade** (trial ends, no paid plan): the user keeps their full personal archive and any feed entries/likes they already earned stay visible to others — they just can't post to or browse the feed further until they subscribe. Nothing about their past is hidden or deleted.

## Open questions for v2
- Comments: enable on entries, or keep the feed like-only to keep it low-pressure?
- External social cross-posting (Instagram/TikTok) — bigger lift due to API approval processes, best deferred past MVP
- Promotional use of user tickles (e.g. featuring one in marketing) — considered and set aside for now; would need real per-entry, revocable, previewed consent to be worth revisiting
