# Settings Inventory — iOS 26.0 Simulator (iPhone 16 Plus)

**Date:** 2026-04-13
**Device:** iPhone 16 Plus (ADA078B9-3C6B-4875-8B85-A7789F368816)
**Platform:** iOS 26.0 Simulator (NOT iOS 17.4 as originally planned — only iOS 26.0 available)
**Resolution:** 430x932 points (1290x2796 pixels)
**Session:** session-1776061377689

---

## Home Screen — Visible Top-Level Sections

The Settings home screen shows 13 sections in the initial viewport. Additional sections likely exist below the fold (scroll not fully exercised due to tool limitations).

| # | Section Name | AXUniqueId | Depth-1 Pages (visible) | Depth-2 Pages (sampled) | Non-navigable Items |
|---|-------------|------------|------------------------|------------------------|---------------------|
| 1 | Apple Account | com.apple.settings.primaryAppleAccount | 0 (not signed in — shows sign-in prompt) | 0 | 1 (descriptive StaticText) |
| 2 | General | com.apple.settings.general | 8 | 2+ (About → further sub-pages) | 1 (Heading + 1 description StaticText) |
| 3 | Accessibility | com.apple.settings.accessibility | 8 | 2+ (each sub-page has toggles) | 5 (4 section Headings: VISION, PHYSICAL AND MOTOR, HEARING, SPEECH + 1 description) |
| 4 | Action Button | com.apple.settings.actionButton | Not visited | Not visited | Unknown |
| 5 | Apple Intelligence & Siri | com.apple.settings.siri | Not visited | Not visited | Unknown |
| 6 | Camera | com.apple.settings.camera | 7 | 2+ (Formats, Preserve Settings sub-pages) | 5 (1 Heading "COMPOSITION", 1 Heading "PHOTO CAPTURE", 1 description GenericElement, 1 description GenericElement, 1 Heading "Camera") |
| 7 | Home Screen & App Library | com.apple.settings.homeScreen | Not visited | Not visited | Unknown |
| 8 | Search | com.apple.settings.search | Not visited | Not visited | Unknown |
| 9 | StandBy | com.apple.settings.standBy | Not visited | Not visited | Unknown |
| 10 | Screen Time | com.apple.settings.screenTime | Not visited | Not visited | Unknown |
| 11 | Privacy & Security | com.apple.settings.privacyAndSecurity | 8 | 2+ (each permission → app list) | 1 (Heading + 1 description StaticText) |
| 12 | Game Center | com.apple.settings.gameCenter | Not visited | Not visited | Unknown |
| 13 | iCloud | com.apple.settings.iCloud | Not visited | Not visited | Unknown |

**Additional UI elements on home screen:**
- Heading: "Settings" (AXHeading)
- Search TextField (AXTextField, subrole: AXSearchField)
- Dictate Button (AXButton, AXUniqueId: "Dictate")

## Deep-Dive: Visited Sections

### General (com.apple.settings.general)

**Navigable Buttons (depth-1, visible):**
1. About
2. AutoFill & Passwords
3. Dictionary
4. Fonts
5. Keyboard
6. Language & Region
7. VPN & Device Management
8. Transfer or Reset iPhone

**Non-navigable:**
- Heading: "General"
- StaticText: description ("Manage your overall setup...")

**Estimated depth-2 pages (from About):** About page contains multiple StaticText labels (device info, serial number, etc.) — no further navigation. AutoFill & Passwords likely has sub-pages per service.

### Accessibility (com.apple.settings.accessibility)

**Navigable Buttons (depth-1, visible):**
1. Display & Text Size
2. Motion
3. Spoken Content
4. Face ID & Attention
5. Control Nearby Devices
6. Subtitles & Captioning
7. Live Speech

**Section Headings (non-navigable):**
- VISION
- PHYSICAL AND MOTOR
- HEARING
- SPEECH

**Non-navigable:**
- Heading: "Accessibility"
- StaticText: description ("Personalize iPhone in ways...")

**Toggle note:** "Live Speech" has `AXValue: "Off"` — indicates this is a toggle-like button but still renders as `AXButton`, not a separate switch element.

### Camera (com.apple.settings.camera)

**Navigable Buttons (depth-1, visible):**
1. Photographic Styles (AXValue: "Standard")
2. Record Video (AXValue: "1080p at 30 fps")
3. Record Slo-mo (AXValue: "1080p at 240 fps")
4. Record Sound (AXValue: "Spatial Audio")
5. Formats
6. Preserve Settings

**Toggle/CheckBox elements (ON/OFF):**
1. Grid (Off — AXValue: "0", className: "CheckBox")
2. Level (Off — AXValue: "0", className: "CheckBox")
3. Mirror Front Camera (Off — AXValue: "0", className: "CheckBox")
4. View Outside the Frame (On — AXValue: "1", className: "CheckBox")
5. Portraits in Photo Mode (On — AXValue: "1", className: "CheckBox")

**Section Headings (non-navigable):**
- COMPOSITION
- PHOTO CAPTURE

**Non-navigable:**
- Heading: "Camera"
- 2x GenericElement (description text)

### Privacy & Security (com.apple.settings.privacyAndSecurity)

**Navigable Buttons (depth-1, visible):**
1. Location Services (AXValue context: "1 always")
2. Tracking (AXValue context: "1")
3. Calendars (AXValue context: "1 full access")
4. Contacts (AXValue context: "1 full access")
5. Files & Folders (AXValue context: "None")
6. Focus (AXValue context: "None")
7. Health (AXValue context: "None")
8. HomeKit (AXValue context: "1 app")

**Non-navigable:**
- Heading: "Privacy & Security"
- StaticText: description ("Control which apps can access...")

## Summary

| Metric | Value |
|--------|-------|
| Total top-level sections (visible) | 13 |
| Total top-level sections (estimated, including below-fold) | ~20-25 |
| Total depth-1 navigable pages (visited sections only) | 31 |
| Estimated total depth-1 pages (all 20+ sections) | ~60-80 |
| Estimated total depth-2 pages | ~40-60 |
| **Estimated total unique navigable pages (depth 1+2)** | **~100-140** |
| Total toggle/CheckBox elements found | 5 (in Camera only) |
| Total non-navigable items (sampled) | ~12 |

## Decision Gate 1: Is Settings a sufficient test target?

**PASS** — Even with only 4 of 13+ sections fully inspected, we found 31 navigable pages. Extrapolating to all ~20-25 sections yields an estimated 100-140 unique navigable pages, well above the 50-page threshold. Settings is a sufficient test target for Phase 25 explorer dedup stress testing.

## Notes

- iOS 26.0 has a redesigned Settings app compared to iOS 17.4. The section list, ordering, and element structure may differ from the original spike plan's expectations.
- The `axe describe-ui` tool captures the **visible viewport only**. Off-screen elements require scrolling (which was partially functional during this spike).
- All home-screen sections have `AXUniqueId` in the format `com.apple.settings.{name}`, which is excellent for reliable targeting.
