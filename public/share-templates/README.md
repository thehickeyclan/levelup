# Session share graphics (Instagram)

Portrait feed backgrounds for auto-generated session posts. **1080×1440 PNG**, no text, no people.

| File | School / brand |
|------|----------------|
| `nc-state-feed.png` | NC State ✓ |
| `unc-feed.png` | UNC ✓ |
| `app-state-feed.png` | App State ✓ |
| `guild-feed.png` | The Guild black + gold — optional (fallback gradient if missing) |

The app overlays coach photo, session details, and footer text at `/api/sessions/[id]/share-image`.

If a file is missing, a themed fallback gradient is used until the asset is added.
