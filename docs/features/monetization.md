# Monetization

**Requires reading:** [requirements.md#monetization](../requirements.md#monetization)

---

## Overview

All monetization is client-side except for the `is_ad_free` flag, which is stored on the server account so it persists across devices for logged-in users. The server does not validate IAP receipts beyond setting the flag (receipt validation approach TBD).

---

## Components

**Banner ads** — shown during active gameplay; hidden when `is_ad_free = true`. Managed entirely in the Godot client via the ad SDK.

**Interstitial ads** — triggered by [match-completion.md](match-completion.md) after the results screen; skipped when `is_ad_free = true`.

**Remove ads IAP** — client initiates purchase via the platform store; on success, calls the server to set `is_ad_free = true`. Flag is returned in `GET /v1/users/me` so all devices sync on login.

**Donations** — voluntary tip flow; implementation TBD. No server-side tracking planned initially.

**Affiliate links** — static URLs to physical product pages; embedded in the game detail screen. No server involvement.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] IAP receipt verification → set `is_ad_free = true`

**Client**
- [ ] Banner ads during gameplay (AdMob)
- [ ] Interstitial ads after match completion (skip if ad-free)
- [ ] Remove Ads IAP purchase flow
- [ ] Affiliate links in game detail screen

---

## Related

- `is_ad_free` field: [database-schema.md#users](../database-schema.md#users)
- User profile endpoint: [api-reference.md#users](../api-reference.md#users)
