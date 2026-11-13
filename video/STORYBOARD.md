# Cascade explainer: Gate B plan

Format: 16:9, 1920 × 1080, 30 fps, H.264 MP4, 60 s ± 0.5 s, target ≤ 30 MB, plus a poster frame and a 1280 × 720 variant. Built in HyperFrames with GSAP. The composition reads its canvas size from one variable, so a 9:16 cut stays possible later (not built now).

Palette: Cream ground, Ink type, Coral and Ember accents, Signal for failed, Lagoon for ok, Amber for at risk. No navy, no blue accent. Type: Stack Sans Headline (light) and Stack Sans Text, the site's faces.

Motion language, taken from the reference template (not its palette or branding): chaos to order, one accent word swapping in place, a hub drawing curved threads to labelled leaves, a terminal card over blurred footage with rows flipping state, a pile of tags sorting into a ranked list, hard cuts with an occasional flash-through-white or vertical blur smear, about one new scene every 3–4 s. Easing expo/power4 out, 8–12 frame settles, 40–60 ms staggers. No bounce, flares, confetti, neon grids, gradient blobs or whooshes.

Every number on screen is the engine's own output for Pune (scripts/landing-facts.ts), labelled "Simulated scenario". No real-world statistics.

## Storyboard (16 scenes)

| # | Time | Ground | What happens | Voiceover |
|---|---|---|---|---|
| 1 | 0.0–2.5 | Footage: flooded road crossing (Leine), warm grade | Scattered infrastructure labels (substation_14, pump_3, mast_07…) drift, then converge into one line: "One failure." | One failure. |
| 2 | 2.5–5.5 | Same, slow push-in | "failure" swaps in place: "Then the **next**." Coral accent word | Then the next. |
| 3 | 5.5–8.5 | Footage: city skyline at night | Kinetic type: "Cities don't fail" | Cities don't fail |
| 4 | 8.5–12.0 | Cream | "one system **at a time**." Then four words stack: Power → Water → Hospitals → Roads | one system at a time. Power feeds water, water feeds hospitals, and roads hold it all together. |
| 5 | 12.0–14.0 | Flash through white | Transition into the graph | |
| 6 | 14.0–18.0 | Ink-on-cream diagram | Hub (a real Pune substation) draws curved threads out to labelled leaves, from the real inferred edges | Cascade reads a real city from open map data |
| 7 | 18.0–22.0 | Same, grows | Second ring: pumps, towers, masts, hospitals; threads coloured by provenance (lagoon observed, dusk inferred) | and joins every substation, pump, mast and hospital into one dependency graph. |
| 8 | 22.0–26.0 | Same | One dashed thread highlighted with the label "inferred · 0.62" | Every guessed link is marked as a guess. |
| 9 | 26.0–29.0 | Footage: rushing sluice (Thun), blurred, warm | Terminal card appears: `fail("Parvati Water Treatment Plant")` | Fail one water treatment plant |
| 10 | 29.0–34.0 | Same | Rows flip one by one: `water_tower_3429 → backup 8h` (amber) then `→ FAILED T+8h` (signal); clinic T+16h; hospital T+32h | and the water towers run dry by hour eight. Clinics follow at sixteen. Hospitals hold out on their tanks until thirty-two. |
| 11 | 34.0–40.0 | Screen recording: the real dashboard, scrubber running | Map cascade playing, labelled "Simulated scenario" in the corner; count-up "312 facilities" (engine output) | Three hundred and twelve facilities, from one failure, hour by hour. |
| 12 | 40.0–43.0 | Vertical blur smear | Into cream | |
| 13 | 43.0–47.0 | Cream | Pile of intervention tags (generator, raise, repair bridge, mobile substation) snaps into a ranked list: the optimizer's top plan | Then plan around it. Let the optimizer pick the three moves that matter most, |
| 14 | 47.0–52.0 | Screen recording: plan comparison A/B/C and the "Why did this fail?" trace | Trace path highlights on the map; one count-up: "−10% simulated impact" | compare plans side by side, and click any failure to see exactly why it happened. |
| 15 | 52.0–56.0 | Flash through white into graded sky footage | CASCADE lockup, tagline "Watch a city fail. Then plan around it." | Cascade. Watch a city fail, then plan around it. |
| 16 | 56.0–60.0 | Same, hold | URL, small line: "Simulated scenario. Assumptions editable." | |

Voiceover is about 140 words, so about 140 words per minute.

## Footage shortlist

Licences are public domain, CC0 or CC BY only. Share-alike clips were left out, because they would force the whole video under CC BY-SA. No news-agency clips, no YouTube rips, no watermarks, and no identifiable people in distress. Everything is graded warm with aubergine-tinted blacks, light procedural grain, and at most a 4–6% push-in.

| Scene | Clip | Author | Licence | Source |
|---|---|---|---|---|
| 1–2 | Leine flood Hemmingen 2017-07-28, L 389 / K 221 crossing (16 s) | Marsupium | CC0 1.0 | https://commons.wikimedia.org/wiki/File:Leine_flood_Hemmingen_2017-07-28_L_389,_K_221_crossing.webm |
| 3 | City skyline (time lapse) (20 s, night) | YouTube user "Editor" (as credited on Commons) | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:City_skyline_(time_lapse).webm |
| 9–10 | Obere Schleuse in Thun (13 s, rushing water at a sluice) | Nachtbold | CC0 1.0 | https://commons.wikimedia.org/wiki/File:Obere_Schleuse_in_Thun.webm |
| alt 1–2 | Tidal flooding near the FDR Memorial, Washington DC, 2024-01-13 (34 s) | G. Edward Johnson | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Tidal_Flooding_near_the_FDR_Memorial_Tidal_Basin_Washington_DC_2024-01-13_09-34-57_1.webm |
| alt 3 | Flooded trees, East Potomac Park, Washington DC, 2024-01-14 (32 s) | G. Edward Johnson | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Flooded_trees_East_Potomac_Park_Washington_DC_2024-01-14_10-59-07_1.webm |
| alt 9 | Aerial views of flood control, Aqueduct Intertie, Kern River (105 s) | Jonathan Vegas | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:Aerial_views_of_flood_control_via_the_Aqueduct_Intertie_at_Kern_River_Terminus,_California,_USA.webm |
| alt | REN overhead power line maintenance, PT 2018 (8 s) | Fernando Moital | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:REN_overhead_power_line_maintenance_PT_2018_E.webm |
| 15–16 | 2011-08-05 timelapse clouds, Seloncourt (already on the site) | Thomas Bresson | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:2011-08-05_21-45-00-timelapse-clouds-seloncourt.ogv |

App scenes (11, 14) are screen recordings of the running CASCADE dashboard, captured with Playwright at 2× and never mock-ups.

Every clip is logged in CREDITS.md and listed in the video's end credits line.

## Audio

- **Language:** English only, for voice, captions and on-screen text.
- **Voiceover:** Gnani Vachana TTS (the user's account and key, stored in the git-ignored `.env.local`). Language fixed to `en-IN` (never `auto` or `hi-en`), WAV at 48 kHz, speed 1.0. Voice: Kaveri (female, English, model `timbre-v2.5`), chosen at Gate B. The API is credit-based; about 140 words is one short request per scene.
- **Captions:** the TTS returns no timings, so word timings come from transcribing the generated voice locally (`npx hyperframes transcribe`), matched to the script text above. They are burned in, 2 lines maximum, in the title-safe area, and also shipped as a WebVTT track for the dashboard player.
- **Music:** a sparse ambient bed under the voice, ducked about 10 dB while speaking. Source: a CC0 or CC BY track from Openverse/Freesound, credited. If none fits, a quiet pad synthesised locally (no licence needed).
- **Sound:** a soft tick on each terminal row flip and a low swell into the end card. Taken from Openverse (CC0/CC BY) or the bundled offline set. No whooshes.
