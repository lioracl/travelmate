# Scenic icon provenance

The canonical master is master.png (1254 px). It is a generated restoration from the user's approved scenic design board, not an extraction of original source pixels. foreground.png and background.png are derived image edits. Original generated files remain in the Codex generated_images folder. sources.json locks all three SHA-256 hashes. No notification badge is in the static assets.

Tool mode: image_gen edits. Master prompt: faithfully restore the large upper-left approved icon from 08_approved_icon_ai_reference.png; retain turquoise sky, blue mountains, winding river, warm right-hand sun, white location pin, blue center, white airplane and small blue sparkle/AI plaque. Full-bleed square; no board, wordmark, outer frame or red badge. Requested 2048 square; tool returned 1254 square.

Foreground prompt: extract only the complete pin/blue center/airplane and sparkle/AI plaque from that master; preserve relative composition; remove all scenic pixels to transparent alpha. Background prompt: remove only those foreground objects and their shadows; fill with the existing scene; preserve palette, sun, mountains and river; opaque square with no text or badges.

Run node tools/generate-android-launcher.mjs to regenerate Android, PWA and shared iOS assets. Run with --check for byte-exact verification without writes. Derived foreground is centered and scaled by alpha bounds into a 0.298-radius Android safe circle; maskable PWA uses 0.385. Legacy/regular uses 0.445. Background fills every platform mask. All generated raster alpha is opaque except adaptive foreground and legacy round exterior. The 1024 iOS icon has no transparent pixels.

Reviewed at 192 px: landscape, white pin/plane and AI plaque are visible. Automated geometry and raster-integrity tests pass. Samsung Home/App Drawer mask, theme and small-size perception still require physical-device acceptance. Do not delete user data to refresh launcher artwork.
