# Feature Spec — Auth, Onboarding & Profile

**Area:** Onboarding flow + Profile tab.
**Screens:** Splash → Welcome → Sign Up / Log In → OTP → Set Profile → Home; Profile → Edit / QR / Notification settings.
Tags: **[WORKING]** · **[STUB]** · **[ROADMAP]**.

> Identity stays **lightweight** (Round 1): a display name + a server-generated id, stored client-side. The full auth surface (OTP, password) is **presented but stubbed** — no real credential backend this round.

## Onboarding / Auth

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| Splash screen | Branded full-screen launch (also the PWA splash). | **[STUB]** (visual only) |
| Welcome screen | Intro + "Get started" / "Log in" entry. | **[STUB]** |
| Sign Up | Enter a display name → server issues identity → enter app. | **[WORKING]** (lightweight identity, surfaced as Sign Up) |
| Log In | Return to an existing identity. | **[STUB]** (re-entry via stored identity works; credential login stubbed) |
| OTP verification | Enter a one-time code to verify. | **[STUB]** (no SMS/email delivery) |
| Set Profile | Set display name + avatar before Home. | **[STUB]** (display name works; avatar stubbed) |

## Profile tab

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| Avatar | Show/change profile picture. | **[STUB]** |
| Display name | View (and edit) the display name. | **[WORKING]** (view) / **[STUB]** (edit) |
| Personal QR | Show a QR others scan to add me as a contact. | **[STUB]** |
| Scan QR | Scan another user's QR to add them. | **[STUB]** |
| Change password | Update account password. | **[STUB]** (no password backend) |
| Notification settings | Toggle message/call notifications, DND, ringtone. | **[STUB]** |
| Logout | Clear local identity and return to Welcome. | **[STUB]** (clearing local identity is feasible; surfaced as a labeled control) |

## Notes for Frontend
- Splash/Welcome/Sign Up/Log In/OTP/Set-Profile render as a real onboarding sequence; only Sign Up performs the working identity call, the rest are navigable stubs that proceed/announce "Coming soon".
- Profile tab is the 4th bottom tab; each row is a labeled control. Stubs announce "Coming soon"; logout (if implemented as local-clear) is the one potentially-functional control.
- Personal QR can show a placeholder QR image; Scan QR opens a stub camera sheet.
