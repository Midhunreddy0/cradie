# SmartCradle Pro Vision
### *A Smart IoT and AI-Based Cradle for Baby Health and Safety*

A prototype smart nursery dashboard combining browser-based image effects and simulated cradle controls. Built with Python Flask, vanilla JavaScript, and a responsive glass-style interface.

> **HONESTY NOTICE:**
> **DEMO ONLY:** Camera motion uses simple image heuristics; face and pose landmarks use browser-run vision models. Smile and frown labels are uncertain visual cues, not a reliable reading of an infant's feelings. The camera does not measure body temperature, detect medical conditions, or reliably detect wetness. Sleep metrics and health insights are sample values, not observations. Physical sensors, alarms, and motor actions are simulated. No physical hardware is connected. Do not use for infant monitoring or care decisions.

### Multi-device demo behavior
The demo uses one shared in-memory cradle state and event feed, so signed-in browsers pointed at the same running server see the same simulated sensor changes and activity (the page refreshes this data by polling). Caregiver sign-in identity is stored separately in each browser session. Guests can view but cannot change the demo. Accounts and activity are not durable: restarting the server clears them. This is not cloud sync or a production account system.

---

## 1. Quick Start

### Installation
Ensure Python 3.8+ is installed. Install Flask:

```bash
pip install -r requirements.txt
```

### Running the Application
Launch the Flask development server:

```bash
python app.py
```

Open your browser and navigate to:
```
http://127.0.0.1:5000
```
*(or `http://localhost:5000`)*. The server listens on this computer only by default. To allow access from another device on your trusted Wi-Fi, opt in before starting it:

```powershell
$env:SMARTCRADLE_ALLOW_LAN = "1"
python app.py
```

Then open the computer's local network address on the other device, for example `http://192.168.1.20:5000`.

> **Network and browser safety:** This is Flask's development server, not for internet exposure. LAN opt-in permits other devices on the same network to connect; API data requires sign-in, and guest controls are read-only. Camera and system notifications generally require HTTPS outside localhost. Alerts are in-app while open; closed-app/background push delivery is not implemented. For HTTPS deployment, set `SMARTCRADLE_HTTPS=1` so session cookies use the Secure flag, and configure a stable `SMARTCRADLE_SECRET_KEY` before starting the server.

---

## 2. Navy, Cream & Coral UI

### A. Floating Top Menu Bar
- **Left Island:** SmartCradle brand glyph, Pro Vision badge, and live demo status pill.
- **Center Segmented Dock:** Seamless floating glass navigation dock with 7 pill tabs:
  - 📊 Dashboard
  - 📹 Camera
  - 🎛️ Sensors
  - ⚙️ Motor
  - 😴 Sleep & Health
  - 🔔 Activity (with unread alert counter badge)
  - ⋯ More
- **Right Action Island:**
  - 🌙 / ☀️ **Dark & Light Mode Toggle:** Seamless instant theme switching with preference saved in `localStorage`.
  - 🔔 **Notifications Drawer:** Instant jump to timestamped activity log.
  - 👤 **Caregiver Profile Pill:** Displays user avatar, name, and opens the caregiver modal.
  - ⋮ **Quick Menu:** Fast access to 1-Click Guest Demo, Sleep Analytics, Cradle Preferences, and System Reset.

### B. Dark & Light Mode Themes
- **Dark Mode (Default):** Navy (`#14213D`) surfaces, cream (`#F4EDE0`) text, and coral (`#FF6B5B`) actions and highlights.
- **Light Mode:** Cream surfaces, navy text, and coral actions and highlights.

### C. Decluttering & Progressive Disclosure
- Unwanted visual clutter has been hidden in favor of clean, purposeful widgets:
  - **Apple Home-style circular power toggle** on the dashboard for instant motor control.
  - **Apple Health-style Quad Metric Cards** with bold numbers and status badges.
  - **Discreet, non-intrusive disclaimer bar** replacing harsh full-screen warning banners.
  - **Floating cinematic HUD** over the camera viewfinder that displays real-time FPS, clock, and spot temperature.

---

## 3. Multi-Modal Camera Vision Modes

1. **Normal RGB Mode:** Live camera monitoring for visual room inspection.
2. **Thermal-Style Heatmap (Illustrative):** An Ironbow-style false-color effect maps image brightness to colors. It does not measure temperature; any displayed temperature is an arbitrary visual estimate and must not be used for care decisions.
3. **Optical Scanner (Illustrative):** A simple pixel-color heuristic highlights image regions. It cannot reliably identify moisture or liquid stains.

---

## 4. Anti-Spam Motion Filtering

To eliminate false alarm spam from camera digital sensor noise or auto-gain flicker:
- **Pixel Difference Noise Gate ($34$):** Low-amplitude lighting fluctuations are discarded.
- **Consecutive Frame Confirmation:** Motion must persist for **at least 3 consecutive frames** (~$375\text{ ms}$) before registering.
- **Notification Cooldown Slider ($3\text{ s} - 30\text{ s}$, default $10\text{ s}$):** Sets the quiet period between logged server events.
- **Sensitivity Presets:** 1-click quick presets: *High (6%)*, *Balanced (14% - Recommended)*, *Quiet (24%)*.
- **Mute Motion Toasts:** Checkbox to keep visual motion tracking active while muting popup toasts.

---

## 5. Caregiver Authentication & Guest Access

- Click the user profile pill in the menu bar to open the Caregiver Account modal:
- **Sign In:** Demo account (`parent@smartcradle.com` / `password123`). Other credentials are rejected. This is demo authentication only and is not suitable for protecting real accounts or data.
  - **Register:** Create customized caregiver accounts (Parent, Pediatric Nurse, Guardian).
  - **1-Click Quick Demo:** Instant guest evaluation access with zero typing required.

---

## 6. The 7 Application Views

1. **📊 Dashboard:** Child status overview, motor controls, camera preview, simulated sensor summary, activity feed, and per-device browser alert opt-in.
2. **📹 Camera:** Live camera preview with motion tracking, browser-side face landmarks, approximate body-pose lines, and smile/frown expression cues. Video stays on the device; the vision library and model files are loaded from Google when camera analysis starts. Pose and expression labels are approximate visual cues, not feelings, medical findings, or safety monitoring.
3. **🎛️ Sensors (`SIMULATED`):** Simulated Cry detection, baby movement (PIR), temperature slider & number box ($10^\circ\text{C} - 45^\circ\text{C}$ with $32^\circ\text{C}$ demo limit, logging transitions only), and bedding wetness with buzzer alarm active *only* while wet.
4. **⚙️ Cradle Motor (`SIMULATED`):** Automatic vs. Manual mode. In Automatic mode, infant crying activates the motor and quiet stops it; manual ON/OFF buttons always work. Suspended swinging cradle vector animation.
5. **😴 Sleep & Health Analytics (New!):**
   - **Hero Sleep Score Ring:** Circular glowing metric showing daily infant sleep quality (e.g. `94%`).
   - **Live Active Sleep Timer:** Dynamically ticks upward second-by-second while the infant is sleeping (`00h 25m 40s`).
   - **Daily Sleep Goal Progress:** Visual progress bar tracking progress toward the 14-hour pediatric target.
   - **Estimated Respiration Rate:** Real-time respiratory rate monitoring ($30 - 40\text{ BPM}$ normal range, elevates during crying).
   - **Sleep Architecture Hypnogram Bar:** Tri-color segmented bar displaying Quiet Deep Sleep (52% NREM), Active Light Sleep (36% REM), and Awakenings/Movement (12%).
   - **Today's Nap History:** Audit rows for morning, midday, afternoon, and active night sessions with duration and quality tags.
   - **Sample Sleep Insights:** Static illustrative text only; no clinical assessment, AI inference, or soothing efficacy measurement is performed.
   - **1-Click Export:** Downloadable `.txt` pediatric health and sleep summary report.
6. **🔔 Activity & Notifications:** Timestamped audit trail with filter chips (`All`, `Alerts`, `Motion`, `Sensors`, `System`) and a "Clear History" button with confirmation.
7. **⋯ More Settings & Infant Profile (New!):**
   - **Infant Biometric Profile:** Active child card (Baby Liam, 4 months old, 6.5 kg, Dr. Elena Rostova).
   - **Cradle Automation Preferences:** Rocking servo speeds (*Gentle 18 RPM*, *Moderate 24 RPM*, *Calming 30 RPM*).
   - **Audio Soothing Sound:** Selectable ambient tracks (*Brahms Lullaby*, *White Noise*, *Gentle Rain*, *Ocean Waves*, *Muted*).
   - **Ambient Nursery Nightlight:** Color swatches (*Coral Glow*, *Warm Amber*, *Soft White*, *Turn Off*) and a 0-100% brightness slider.
   - **Pediatric Healthcare Contacts:** Direct pediatrician call shortcut with simulated dialing toast.
   - **Hardware System Diagnostics:** Real-time power supply status, Wi-Fi link dBm, and computer vision engine health.

---

## 7. REST JSON API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/status` | `GET` | Returns full system status, sleep vitals, preferences, and profile |
| `/api/health/sleep` | `GET` | Detailed infant sleep tracking and respiratory telemetry |
| `/api/health/export` | `GET` | Generates downloadable pediatric health & sleep summary `.txt` report |
| `/api/settings/cradle` | `GET`, `POST` | Get or update rocking speed, lullaby sound, and nightlight |
| `/api/profile/baby` | `GET`, `POST` | Get or update infant name, age, weight, and pediatrician |
| `/api/sensor/cry` | `POST` | Toggle crying sensor (`{"active": true/false}`) |
| `/api/sensor/movement` | `POST` | Toggle infant movement sensor (`{"active": true/false}`) |
| `/api/sensor/wetness` | `POST` | Toggle bedding moisture sensor (`{"active": true/false}`) |
| `/api/sensor/temperature` | `POST` | Update temperature and alert threshold |
| `/api/motor` | `POST` | Update motor mode (`auto`/`manual`) or manual state (`on`/`off`) |
| `/api/vision/mode` | `POST` | Set camera vision mode (`normal`, `thermal`, `wet_scanner`) |
| `/api/vision/motion` | `POST` | Signal camera-detected motion start or end |
| `/api/events` | `GET` | Fetch audit event log (supports `?category=` filter) |
| `/api/events/clear` | `POST` | Clear in-memory event history |
| `/api/reset` | `POST` | Reset all simulation parameters to defaults |
| `/api/auth/login` | `POST` | Caregiver email/password login |
| `/api/auth/register` | `POST` | Register a new caregiver account |
| `/api/auth/guest` | `POST` | 1-click evaluation guest login |
| `/api/auth/logout` | `POST` | Sign out current caregiver session |

---

## 8. Privacy & Security

- **Client-Side Video Processing:** Video frames are processed in browser memory via HTML5 canvas.
- **Zero Video Transmission:** No video frames, images, or audio are ever transmitted to or stored on the Flask server.
- **Honesty & Transparency:** Simulation and camera-analysis labels identify prototype features. Camera-derived values are heuristics and must not be interpreted as measurements. This app is not a medical device or safety monitor.
