# DayTickles Privacy Policy

**DRAFT — for your review. Not yet published. See the note at the very end before using this anywhere.**

*Last updated: [insert actual publish date]*

## Introduction

This Privacy Policy explains what information DayTickles ("we," "us," "the app") collects, how we use it, and what choices you have. DayTickles is a daily micro-journaling app for capturing small, positive moments ("tickles").

By using DayTickles, you agree to the collection and use of information as described here.

## Information We Collect

### Account information

DayTickles uses **Google Sign-In** as the only way to create an account. When you sign in, Google shares your email address and basic profile information (such as your name and profile picture) with us, via Supabase, our backend provider. We do not offer any other sign-in method, and we do not see or store your Google password.

Within the app itself, we separately store:
- A username you choose
- An avatar (currently an emoji you pick during setup)
- Your country (optional, if you choose to share it)
- Your preferred accent color theme and other display preferences
- App usage flags (e.g., whether you've completed onboarding, seen certain in-app guides)

### Content you create

- **Tickle entries**: the text, mood, and date of each entry you save, along with whether you've marked it public or private, and any goal you've tagged it with
- **Goals**: the labels and colors of any personal goals you set
- **Likes, follows, and favorites**: your interactions with other users' content
- **Shared links**: if you generate a shareable link to a specific entry, that link and its associated content

### Push notifications

If you enable notifications, we store a push notification token (provided by Expo, the service we use to deliver notifications) so we can send you reminders and like notifications. This token does not identify you personally beyond linking to your DayTickles account.

### Photos (Tickle Pics / Pin Board, and photo-only Tickles)

If you choose to add a photo — either by pinning one to your Tickle Pics board, or by creating a photo-only Tickle directly from a pinned photo — DayTickles asks for the relevant device permission at that moment (camera, or photo library access, depending on how you chose to add it).

- A photo you add is copied into the app's own private storage on your device. That copy, not the original you picked, is what the app displays, links to your entries, and shares from.
- **Photo-only Tickles are also automatically saved to your device's shared Photos/Gallery app** (not just the app's own private storage), as a backup safeguard against losing the only copy of that photo. The first time you create one, DayTickles shows a one-time notice explaining this before it happens; after that, it happens automatically and silently every time, with no further prompt.
- A photo pinned to your board that you never turn into a photo-only Tickle is not auto-saved to your gallery — only photo-only Tickles get this backup treatment.
- Deleting a photo from within DayTickles removes it from the app's own storage; it does not remove any copy already saved to your device gallery — that copy is yours from that point on, managed like any other photo on your device (through your Photos app, or whatever backup/sync service, such as Google Photos, you already have set up there).

We do not access your camera or photo library at any other time, or for any other purpose.

### On-device only — never sent to us

If you set up a PIN or use Face ID/fingerprint to lock the app, that PIN and any biometric data stay entirely on your device, in your device's secure storage. We never receive, see, or store this information.

### What we do not collect

We do not collect or access your location, contacts, or microphone. (See "Photos," above, for the one exception — camera/photo library access — and exactly when and why it happens.) DayTickles does not use any analytics, advertising, or crash-reporting services — we have no third-party tracking of any kind built into the app.

## How Content Is Shared With Other Users

DayTickles is a social app, and some of your information and content is visible to other users by design:

- **Always visible to other users**: your username, avatar, country (if set), who you follow and who follows you, and which entries you've liked
- **Visible based on your choice**: each entry you write has its own visibility setting — public entries are visible to other users; private entries are visible only to you
- **Shared links**: if you generate a share link for an entry, anyone with that link can view that entry's content, regardless of its normal visibility setting. Share links do not expose your account or profile information — only the entry content itself
- **Never visible to other users**: your goals, your favorites list, your hidden-posts list, your notifications, and any reports you file

## Third-Party Services We Use

DayTickles is built on:

- **Supabase** — our backend provider, hosting our database, authentication, and storage
- **Firebase Cloud Messaging (FCM)** and **Expo's push notification service** — used only to deliver push notifications to your device
- **Google Sign-In** — used only for authentication, as described above

We do not use any other third-party service. We do not sell, rent, or share your data with advertisers, data brokers, or any other third party for their own purposes.

## Data Retention and Deletion

Your data is retained for as long as your account exists.

**You can permanently delete your account and all associated data at any time**, directly within the app:
Settings → Delete Account → confirm the warning → type DELETE to confirm.

This is immediate and permanent — there is no waiting period, and deleted data cannot be recovered. Deleting your account removes your profile, every entry you've written, your likes, follows, favorites, goals, shared links, notifications, and all other data associated with your account.

If you're unable to access the app, you can request deletion by emailing **deleteaccount@daytickles.com** (please email from your account's address, or include your username, so we can verify the request) or by visiting **daytickles.com/delete-account**.

## Children's Privacy

DayTickles is not intended for children under the age of 13 (or the minimum age required by your country's laws, if higher), and we do not knowingly collect information from children below that age. If you believe a child has created an account, please contact us and we will delete it.

*[Open decision — see note at bottom: this app currently has no in-app age gate. This paragraph declares a policy rather than technically enforcing one. Confirm this approach is what you want before publishing.]*

## Your Choices and Rights

- You can edit your profile information, change your entry visibility, and manage your goals and notification preferences at any time within the app
- You can request a copy of your data or ask questions about what we hold by emailing us (see Contact, below)
- You can delete your account and all associated data at any time, as described above

Depending on where you live, you may have additional rights under local law (for example, the GDPR in the EU/UK, or the CCPA in California). If you'd like to exercise any such rights, contact us using the details below.

## Changes to This Policy

We may update this policy from time to time. If we make material changes, we'll update the "Last updated" date above. Continued use of DayTickles after changes take effect means you accept the updated policy.

## Contact Us

If you have questions about this policy or how your data is handled, contact us at:
**[insert your preferred contact email — e.g. privacy@daytickles.com, or reuse deleteaccount@daytickles.com if you'd rather not stand up a second address]**

---

## Notes for you (remove this section before publishing)

This draft is built directly from a real inventory of what the app actually does — every claim above should be accurate to the current codebase as of today. A few things need your input before this is ready to publish:

1. **I am not a lawyer, and this is not certified legal compliance.** This accurately describes the app's real behavior, but jurisdiction-specific requirements (GDPR if you have EU users, CCPA if you have California users, any country-specific rules) may need a real legal review, especially if you know you have or expect users in those regions.
2. **Children's privacy section** — currently drafted as a policy declaration ("not intended for children under 13") rather than a technical age gate, per our earlier discussion that Play Store doesn't require an in-app gate for most apps. Confirm this is the approach you want.
3. **Contact email** — placeholder, needs a real address filled in.
4. **Legal entity name** — this draft just says "DayTickles" throughout. If you have (or plan to register) a formal legal entity name, some jurisdictions expect that instead of just the product name.
5. Once finalized, this will need to be **hosted somewhere with a stable URL** (the same `daytickles.com` GitHub Pages setup used for the deletion page would work well) so it can be linked from the Play Store listing.
6. **New "Photos" section (2026-09-03)** — added for the new photo-only Tickle type, and in the same pass, corrected an existing inaccuracy this draft already had: it previously claimed no camera/photo library access at all, which was already false once Tickle Pics/Pin Board shipped (camera/library access for pinning a photo predates today, this draft just never reflected it). Also worth knowing: the spec for photo-only Tickles has an explicitly open decision on exactly when a public photo-only entry's image gets uploaded to real server storage — that mechanic isn't built yet, so this section deliberately only describes the private, on-device auto-save behavior that exists today. It'll need one more update once that upload mechanic actually ships.
