# ALLAL DELIVERY — Cinematic Production Package & Storyboard

> Status: **for review/approval** before any final footage is produced.
> One continuous ALLAL experience; 7 scenes + the transitions that connect them.
> The engine is built and waiting — each scene slot accepts a `<video>` loop;
> each transition accepts a clip or runs the built-in composited effect.

---

## 0. Production bible (shared spec — this is what makes 7 sources feel like ONE film)

| Spec | Value |
|---|---|
| **Master resolution** | 2560×1440 (16:9), deliver 1080p + 720p tiers |
| **Cover strategy** | Render 16:9 with a safe-center; app uses `object-fit: cover` for any viewport (keep key action centered) |
| **Frame rate** | 24 fps (filmic) — 30 fps acceptable |
| **Loop** | Seamless (first frame = last frame); 10–14s |
| **Codec** | AV1/WebM + H.265 MP4 (H.264 MP4 fallback); **no audio track** (ambience is a separate engine), muted |
| **Weight budget** | ≤ ~4 MB/loop, ≤ ~2 MB/transition (compressed) |
| **Grade / LUT** | One ALLAL LUT: teal-cyan highlights, deep blue-black shadows, warm practical accents, slightly desaturated, gentle filmic contrast (bake in; engine adds a light matching grade + grain) |
| **Lens** | 28–50mm, shallow DoF, optional subtle anamorphic flare |
| **Atmosphere** | Light film grain + volumetric haze baked in |
| **Motion cadence** | Slow, deliberate, ease-in-out **in-scene**; snappiness lives only in transitions |
| **Brand** | ALLAL teal `#0E9AA7` (primary/signage/livery), red `#D62828` (alert accent only); logo + livery recurring |
| **No letterbox** | Cinematic feel via grade/light/motion, full screen for UI |
| **Naming** | `scene_<id>_loop.webm`, `transition_<from>_<to>.webm` |

Ambient-audio pairing (already in the engine, muted by default): Login = rain + distant city · Dashboard = ops room tone · Produits = warehouse hum · Stock = quiet scan-room · Camions = distant dock · Rapports = quiet intelligence room · Paramètres = calm office.

---

## 1. LOGIN — "Arrival" (ALLAL HQ exterior)
- **Visual purpose:** First impression / prestige — "you've arrived at a major industrial company."
- **Camera position:** Eye-level, slightly low, ~35mm, 3/4 on the glass HQ entrance; building fills the upper two-thirds; wet forecourt + gate in foreground.
- **Camera movement:** Very slow push-in toward the entrance, faint parallax; seamless loop.
- **Environment:** Modern glass-and-steel HQ at blue-hour/night, rain, illuminated ALLAL signage, reflective wet asphalt, 1–2 ALLAL trucks arriving with headlights, landscaping, perimeter lights.
- **Required assets:** HQ building (glass facade + ALLAL sign), 1–2 ALLAL trucks, gate/barrier, wet-ground reflections, rain FX, landscape/street props, night lighting rig.
- **Lighting:** Blue-hour key + warm interior window glow + teal signage glow + truck headlights; wet reflections; volumetric rain haze.
- **Mood:** Premium, calm, prestigious, anticipatory.
- **Loop duration:** 12s.
- **Transition to next:** → Dashboard — **HERO "through the glass"** (see §8).
- **Recommended method:** **AI video** (fastest for atmospheric exterior) — **Unreal/Twinmotion** if brand-exact HQ is required (rain/reflections favor a strong render).

## 2. DASHBOARD — "Command Center" (operations)
- **Visual purpose:** Control, oversight, intelligence — the operational brain.
- **Camera position:** Wide, ~28–35mm, slightly elevated, centered on a large curved data wall; operations desks in foreground.
- **Camera movement:** Slow lateral drift / gentle push; screen data animates subtly.
- **Environment:** Dark operations room, large curved LED wall (maps, KPIs, logistics globe), desk consoles with glowing UI, glass partitions, ALLAL motif.
- **Required assets:** Ops-room set, curved video wall, desk/console props, animated screen content (motion graphics), holographic map/globe, optional personnel silhouettes.
- **Lighting:** Low ambient; screens as cool teal key light; warm accent strips; subtle volumetrics.
- **Mood:** Focused, intelligent, high-tech but calm.
- **Loop duration:** 10s.
- **Transition to next:** → Produits — directional "toward the warehouse" (0.8s).
- **Recommended method:** **Motion-graphics composite over a render** (MG for the data walls; render/AI for the room).

## 3. PRODUITS — "The Warehouse" (premium inventory)
- **Visual purpose:** ALLAL's core identity — industrial fastener inventory at scale.
- **Camera position:** Down a racking aisle, ~35mm, low-ish, strong 1-point perspective into depth; a fastener detail in shallow-focus foreground.
- **Camera movement:** Slow dolly forward down the aisle; overhead light pools pass; optional forklift crossing far end.
- **Environment:** Tall pallet racking stocked with fastener bins/cartons — bolts, nuts, screws, washers — barcode labels, aisle markings, high-bay lighting, a forklift, ALLAL aisle signage.
- **Required assets:** Pallet racking; fastener bins + hero bolt/nut/screw/washer props; cartons with ALLAL labels + barcodes; forklift; aisle signage; PBR concrete floor; overhead fixtures. *(CC0 shelf/box/crate/barrel + the R3F blocking exist as reference.)*
- **Lighting:** Warm high-bay pools + cool fill + teal accent; atmospheric haze; lightly reflective floor.
- **Mood:** Premium-industrial, organized, abundant, precise.
- **Loop duration:** 12s.
- **Transition to next:** → Stock — "deeper into inventory" (0.8s).
- **Recommended method:** **Unreal / Twinmotion / Blender render** (control + existing asset refs) — AI video as alternate.

## 4. STOCK — "Inspection" (smart inventory control)
- **Visual purpose:** Accuracy, automation, smart control.
- **Camera position:** Medium, ~50mm, over a scan/inspection station; shallow DoF on a scanned bin.
- **Camera movement:** Slow push toward the station; scanner light sweep; count ticking on screen.
- **Environment:** Inspection bay — handheld/overhead scanners with beams, a stock-count screen, conveyor/sorting area, neat bins, optional AMR/robot.
- **Required assets:** Scan station, scanner + laser-beam FX, inventory screen (MG), conveyor/sorting props, bins, optional inventory robot.
- **Lighting:** Clean cool task light + scanner red/teal beams + screen glow.
- **Mood:** Precise, smart, controlled, quiet-tech.
- **Loop duration:** 10s.
- **Transition to next:** → Camions — "out to the dock" (0.8s).
- **Recommended method:** **AI video or render**, with MG for the scan UI/beams.

## 5. CAMIONS — "Dispatch Dock" (fleet & logistics)
- **Visual purpose:** Logistics in motion — the delivery end of the lifecycle.
- **Camera position:** 3/4 on a loading dock, ~35mm; an ALLAL truck backed into a bay; staged pallets foreground.
- **Camera movement:** Slow lateral drift; subtle activity (dock door, a truck easing in, hazard flashers).
- **Environment:** Loading dock with roller doors, **ALLAL trucks (brand livery)**, staged outbound pallets, dock levelers, yard floodlights, painted bay lines, dusk/light rain.
- **Required assets:** **ALLAL truck model w/ brand livery (hero asset)**, dock structure, roller doors, pallets, dock equipment, yard lighting.
- **Lighting:** Warm dock floods + cool ambient + truck lights; wet/dusk atmosphere.
- **Mood:** Active, dependable, industrial logistics.
- **Loop duration:** 12s.
- **Transition to next:** → Rapports — "up to intelligence" (0.8s).
- **Recommended method:** **Unreal / Twinmotion render** (needs brand-exact truck) — AI video struggles to keep livery consistent.

## 6. RAPPORTS — "Intelligence Room" (analytics & forecasting)
- **Visual purpose:** Analytics, forecasting, executive insight.
- **Camera position:** Wide on a data-wall analytics room, ~28mm; holographic charts; analyst desk foreground.
- **Camera movement:** Slow push toward the data wall; forecast lines draw, charts breathe.
- **Environment:** Dark analytics room, large data walls (financials, forecasts, stock-flow), holographic 3D charts, glass, AI-forecasting motif.
- **Required assets:** Analytics-room set, data walls + animated charts (MG), holographic chart elements, desk, ambient.
- **Lighting:** Screen-driven cool/teal key, minimal ambient, focused, premium.
- **Mood:** Insightful, forward-looking, calm authority.
- **Loop duration:** 10s.
- **Transition to next:** → Paramètres — "into the executive office" (0.8s).
- **Recommended method:** **Motion-graphics-led over a render.**

## 7. PARAMÈTRES — "Executive Office" (administration)
- **Visual purpose:** Administration, control, corporate stature.
- **Camera position:** Medium-wide, ~40mm; modern executive office with a facility/city view; desk foreground.
- **Camera movement:** Very slow drift/parallax toward the window view.
- **Environment:** Premium executive office — glass, wood/metal materials, facility or city view, subtle ALLAL branding, warm lamps.
- **Required assets:** Office set, desk, window-view plate (facility/city), premium materials, warm practical lights.
- **Lighting:** Warm interior key + cool window light + accent lamps; calm, balanced.
- **Mood:** Calm, authoritative, refined.
- **Loop duration:** 10s.
- **Transition to next:** → back to Dashboard/others via hub; on **logout** → pull out through the glass to the rainy forecourt (reverse arrival).
- **Recommended method:** **AI video or render** (office interiors are easy for AI).

---

## 8. Transition matrix (the connective camera moves)

| From → To | Narrative move | Duration | Method |
|---|---|---|---|
| **Login → Dashboard** ⭐ | Push to glass facade → bloom/refraction *through* the glass → reveal ops floor | ~2.0–2.5s (engine plays ≥1.4s) | **Rendered clip** (Unreal/Blender) ideal; AI-video alt; composited fallback exists |
| Dashboard → Produits | Leave command floor, whip/push toward the warehouse corridor | 0.8s | Composited push + motion-blur, or short rendered move |
| Produits → Stock | Continue down the aisle, rack → inspection station | 0.8s | Composited / short clip |
| Stock → Camions | Through a dock doorway out to the yard | 0.8s | Composited / short clip |
| Camions → Rapports | Rise to the intelligence mezzanine (vertical) | 0.8s | Composited / short clip |
| Rapports → Paramètres | Through glass doors into the executive office | 0.8s | Composited / short clip |
| **Any → non-adjacent** | Aerial **hub** pullback → push into target | ~1.2s | One reusable rendered hub establishing clip |
| **Logout** | Pull back out through the glass to the rainy forecourt | ~1.5s | Reverse of the hero clip |
| **Reduced-motion** | All transitions become **instant cuts** | 0s | engine |

---

## 9. Recommended production sequencing
1. **Hero slice (make-or-break):** Login loop + Dashboard loop + **Login→Dashboard** hero transition → grade → drop into engine → review. Prove the feeling before producing the rest.
2. **Core identity:** Produits + Camions (brand truck).
3. Stock, Rapports, Paramètres.
4. Hub clip + logout clip + remaining directional transitions.

## 10. Decisions needed before footage production
1. **Per-scene method approval** — especially **render vs AI** for **Login HQ** and **Camions truck** (brand exactness).
2. **Brand assets:** ALLAL logo vector, **truck livery spec**, HQ reference, brand fonts. (Have: teal `#0E9AA7`, red `#D62828`.)
3. **Aspect/cover** confirm: 2560×1440 16:9 + `object-fit: cover`.
4. **fps** (24 vs 30) + **codec** set.
5. **Transitions:** bespoke rendered clips vs engine composites for the non-hero moves (polish vs cost).
6. **Loop lengths** confirm (10–14s).
