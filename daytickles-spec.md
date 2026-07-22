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

**users** — id, username, display_name, avatar_url, smile_streak, locale, country (nullable), trial_started_at, subscription_plan (none/monthly/annual/lifetime), subscription_expires_at (null for lifetime), share_period_start, share_count_this_period, founding_post_days (distinct dates), founding_share_days (distinct dates), founding_member_badge (bool), founding_reward_granted_at (nullable), created_at

**app_config** — id, active_seasonal_palette, palette_start_date, palette_end_date, founding_member_promo_active (bool), founding_members_awarded_count (global, not per-user — one row read by all clients on both DayTickles.app and DayTickles.com)

**tickle_entries** — id, user_id (FK), entry_date, text_content, media_url, animation_template_id (FK), mood, visibility (private/public), like_count (cached), created_at

**animation_templates** — id, name, style, lottie_url

**likes** — id, entry_id (FK), user_id (FK), created_at

**comments** — id, entry_id (FK), user_id (FK), text, created_at

**notifications** — id, recipient_id (FK), actor_id (FK), entry_id (FK), type (like / comment / streak_milestone), is_read, created_at

**follows** — id, follower_id (FK), followee_id (FK), created_at

**tickle_shares** — id, entry_id (FK), created_by (FK), share_token (unique), created_at

**reports** — id, entry_id (FK), reported_by (FK), reason (spam/harassment/inappropriate/other), status (pending/reviewed/actioned), created_at

**favorites** — id, user_id (FK), entry_id (FK), created_at

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
- `follows` powers a feather badge next to a followed user's name, and splits the feed into tabs — **Everyone**, **Following**, **Mine**, and **Fav's** — rather than blending everything into one ranked feed. Following someone doesn't require them to follow back; it's one-directional, same as the like/notification pattern.
- `favorites` is a private, personal save list — distinct from `likes`. Liking is public/social (visible count, notifies the entry owner); favoriting is just for yourself (no notification, no visible count to anyone else), works on your own entries and other people's alike, and shows up in the feed's **Fav's** tab. Represented with a star icon rather than the sparkle used for likes, to keep the two concepts visually distinct.
- Reporting an entry immediately hides it from that person's own feed (client-side) and inserts a `reports` row with `status: pending` for moderator review — the reporter doesn't need to wait on a review to stop seeing the content. Report reasons are deliberately short and closed-ended (spam / harassment / inappropriate / other) rather than free text, to keep the flow to one tap.
- Sharing (native share sheet, one-to-one) uses a **declining monthly soft cap** rather than a flat number or a hard block: 20 free shares in the first 30 days, 15 in the next 30, 10 from then on (the floor) — unlimited on any paid plan. Generous early (when a new user's friends are also seeing the app for the first time, the highest-value moment for organic reach), tapering to a stable floor that still allows ongoing organic sharing. Tracked via `sharePeriodStart` + `shareCountThisPeriod` on the user, resetting every 30 days.
- Tapping an entry on Home opens it in the feed's Mine tab, scrolled to and highlighted — not just a generic "go to Mine" jump. Uses an estimated per-card height rather than precise on-screen measurement, since exact layout measurement isn't needed for a good-enough jump-to experience here.

### Palette rotation
- **70s retro** (permanent default) — warm cream, rust/mustard/coral palette
- **Seasonal palettes** (temporary, global, calendar-scheduled) — e.g. a "harvest" amber/rust variant, a "bloom" mint/pastel variant — swapped in for a few weeks at a time as a retention/marketing moment, then reverted to the 70s default
- The pastel, midnight, citrus, grey, and navy-rose explorations from earlier stay on file as a bank of ready-made seasonal candidates rather than shipping as permanent user-selectable skins

## Screens (mocked up)

0. **Onboarding** — sign-up, username picker (mockups only so far), plus a first-run "pick your colors" step that's actually wired into the app (gated on `profile.colorSetupDone`)
1. **Home / journal** — smile streak, total tickles + new likes stat cards, most-liked entry from the last 14 days pinned at top, scrollable list of past entries each showing a like-count pill and a share action; tapping an entry opens it in the feed's Mine tab, since text can be too long to read fully on Home
2. **Community feed** — four tabs: Everyone, Following (feather badge on followed users), Mine, and Fav's; each entry likeable, favoritable (star), shareable (own posts only), and reportable (everyone else's). Mine shows all of the person's own entries, public and private — unlike Everyone, it isn't visibility-filtered, since it exists partly to let someone read their own entries in full when Home's truncated view isn't enough.
3. **Entry creation** — text prompt, 4-level smile-intensity mood picker that drives the animation's color/motion directly (no separate style picker), share-to-feed toggle
4. **Entry detail** — full entry view, like count, list of who liked it (with country flag), on-demand translate popup, "send to a friend" share action
5. **Notifications** — chronological list of likes and streak milestones, tied back to specific entries
6. **Settings** — username & display name, accent-color picker (changeable anytime), language picker, optional country field (with short explainer text), daily reminder toggle, notify-on-likes toggle
7. **Upgrade / paywall** — shown when the trial ends; ad-free messaging given top billing right under the heading, journal-stays-free messaging just below it; lifetime/annual/monthly plans; a clear "keep my journal, skip the feed" opt-out that never blocks personal use

## Design direction

70s retro-inspired: warm cream background, rust/mustard/coral/avocado palette, heavily rounded shapes, serif display type for headlines, sunburst/circle motifs standing in for the entry's animation. A soft, personal accent color (five curated options, see Palette rotation) sits on top of this base and drives the mood-animation ramp and card backgrounds — same layout for everyone, personal warmth per person. A very low-opacity tiled speech-bubble pattern sits behind all screens for a touch of texture. In-app modals (share caption picker, report flow) are custom-styled to match the app rather than using the OS's default alert dialogs.

## Monetization

**Model**: 30-day free trial with full access (personal archive + community feed). After the trial, personal journaling stays free forever — the core habit is never gated. Continued access to the community feed (posting and browsing) requires a paid plan.

**Pricing**:
- Monthly — $2.00/mo
- Annual — $19.00/yr (≈21% off monthly)
- Lifetime — $59.00 one-time

**On downgrade** (trial ends, no paid plan): the user keeps their full personal archive and any feed entries/likes they already earned stay visible to others — they just can't post to or browse the feed further until they subscribe. Nothing about their past is hidden or deleted.

## Founding Member program

A launch-window growth incentive: the first 25 people who demonstrate genuine, sustained engagement (not a one-time burst) earn 3 months of any paid plan free, plus a permanent "Founding Member" badge next to their name in the feed.

**Eligibility (all conditions must be met within 14 days of signup):**
- Posted at least 1 entry to the feed on **1 or more distinct calendar days**
- Completed at least 1 share on **5 or more distinct calendar days**
- Among the first 25 accounts globally to satisfy both of the above

**Why "distinct days" rather than a raw count:** this is the anti-gaming rule. A raw count ("5 shares") is trivially gamed by firing off 5 shares in one sitting, which proves nothing about real engagement. Requiring the activity to be spread across 5 *different* days is a much stronger signal of a real, sustained habit, and there's no config to bypass — the app quietly tracks unique days, capped at counting once per day no matter how much someone does that day.

**Reward:** 3 months of any paid plan, granted automatically the moment both thresholds are met (not lifetime — see the "why not lifetime" note below). The Founding Member badge itself never expires, even after the 3 months end and the person reverts to trial-ended/subscribe status if they don't convert.

**Admin control:** the whole program is a single on/off switch (`app_config.founding_member_promo_active`, same pattern as the seasonal palette override) — no separate cap-editing needed. Turn it off once uptake data suggests it's no longer needed, or once 25 people have qualified, whichever comes first. People who already qualified keep their reward regardless of when the switch flips off.

**Why 3 months, not lifetime:** lifetime is priced specifically so it doesn't cannibalize the business (see Pricing above) — giving it away to your *most* engaged users, who are also your best future long-term customers, trades away the highest-value segment for free. 3 months is generous enough to feel like a real reward and "phase in" new users, while leaving the door open to actually convert them into paying subscribers once the free period ends — including people who signed up earlier and are still on the fence.

**Known limitation — the "first 25 globally" part isn't real yet.** This whole program assumes a live backend that can atomically count qualifying users across every device, in order. This prototype has no backend at all (`AsyncStorage` is local to one device) — so there is no way to actually know "am I the 3rd person to qualify, or the 30th?" without one. The prototype tracks each person's *own* progress toward the two thresholds accurately, and simulates the global on/off switch as a manual toggle for demo purposes, but doesn't and can't enforce the actual "first 25" ordering until a real backend exists. Worth treating the counting/ordering piece as a required v1-launch item, not a nice-to-have — the whole scarcity mechanic depends on it being real.

**A second known gap — "different recipients" for shares isn't measurable.** The original idea of requiring shares to go to different *people* (rather than just different days) can't be verified with how sharing currently works: native share sheets don't tell the app who received the message, only whether the share sheet was completed. Building real recipient-tracking would mean replacing native sharing with app-generated referral links tied to actual signups — a much bigger feature (deep linking, backend attribution) than this program needs to justify on its own. The distinct-days proxy above is the practical stand-in.

## Community guidelines (draft)

Kept short and in the app's own voice rather than legal boilerplate — long enough to set real expectations, short enough that someone would actually read it before their first share.

1. **Be kind.** This is a place for what made you smile — not a place to put anyone down, including yourself.
2. **No harassment, hate, or bullying.** Directed at another person, a group, or yourself.
3. **No spam.** Repeated posts, ads, or link-dropping that aren't a genuine tickle.
4. **Keep it appropriate.** Nothing explicit, violent, or that wouldn't be fine for a stranger of any age to read.
5. **Respect privacy.** Don't share identifying details, photos, or stories about other people without their OK.
6. **Reporting is welcome, not punished.** If something feels off, report it — it's one tap, it's private, and it immediately stops showing up for you.

Enforcement isn't designed yet (this needs a real moderation queue behind `reports.status`, plus a decision on consequences — hide entry, warn user, suspend feed access, etc.) — worth scoping properly before the feed has real user-generated content at any scale, not just demo posts.

## Open questions for v2

- Comments: enable on entries, or keep the feed like-only to keep it low-pressure?
- External social cross-posting (Instagram/TikTok) — bigger lift due to API approval processes, best deferred past MVP
- Promotional use of user tickles (e.g. featuring one in marketing) — considered and set aside for now; would need real per-entry, revocable, previewed consent to be worth revisiting
