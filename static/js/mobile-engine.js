/**
 * SmartCradle — Dual-Mode Runtime & Standalone Phone Simulation Engine
 *
 * Allows SmartCradle to run either:
 *   1. Connected to the Python Flask backend (desktop browser or mobile over LAN/HTTPS), OR
 *   2. Completely standalone inside the Android Capacitor app / offline mobile storage.
 */
(function (global) {
    "use strict";

    const CONFIG_KEY = "smartcradle_connection_config_v1";
    const DB_KEY = "smartcradle_standalone_db_v1";

    function simpleHash(str) {
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
    }

    const DEMO_PASS_HASH = simpleHash("password123");

    function isNativeApp() {
        try {
            return Boolean(global.Capacitor && typeof global.Capacitor.isNativePlatform === "function" && global.Capacitor.isNativePlatform());
        } catch (e) {
            return false;
        }
    }

    function getConnectionConfig() {
        try {
            const raw = global.localStorage.getItem(CONFIG_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    mode: ["auto", "standalone", "server"].includes(parsed.mode) ? parsed.mode : "auto",
                    serverUrl: typeof parsed.serverUrl === "string" ? parsed.serverUrl.trim().replace(/\/+$/, "") : ""
                };
            }
        } catch (e) {
            // ignore storage errors
        }
        return { mode: "auto", serverUrl: "" };
    }

    function saveConnectionConfig(next) {
        const current = getConnectionConfig();
        const merged = {
            mode: ["auto", "standalone", "server"].includes(next.mode) ? next.mode : current.mode,
            serverUrl: typeof next.serverUrl === "string" ? next.serverUrl.trim().replace(/\/+$/, "") : current.serverUrl
        };
        try {
            global.localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
        } catch (e) {
            // ignore storage errors
        }
        return merged;
    }

    function resolveRuntimeMode() {
        const cfg = getConnectionConfig();
        if (cfg.mode === "standalone") return "standalone";
        if (cfg.mode === "server") return "server";
        if (isNativeApp() || global.location.protocol === "file:") {
            return cfg.serverUrl ? "server" : "standalone";
        }
        return "server";
    }

    function createInitialDb() {
        const nowTime = new Date().toTimeString().split(" ")[0];
        return {
            eventCounter: 1,
            lastSleepTickMs: Date.now(),
            state: {
                cradle_motor: { mode: "auto", state: "off" },
                cry_detected: false,
                baby_movement: false,
                wetness_detected: false,
                buzzer: "INACTIVE",
                temperature: 27.0,
                temp_threshold: 32.0,
                temp_warning: false,
                webcam_active: false,
                webcam_motion_detected: false,
                camera_vision_mode: "normal",
                optical_wetness_active: false
            },
            sleep: {
                is_sleeping: true,
                sleep_status: "NREM Deep Sleep",
                current_session_seconds: 1540,
                total_sleep_today_seconds: 29800,
                sleep_target_seconds: 50400,
                sleep_score: 94,
                respiration_rate: 34,
                deep_sleep_pct: 52,
                light_sleep_pct: 36,
                restless_pct: 12,
                night_awakenings: 2,
                soothing_success_rate: 88,
                nap_history: [
                    { id: 1, session_name: "Morning Nap", time_window: "08:30 - 10:15", duration: "1h 45m", quality: "Optimal (96%)", type: "Quiet NREM" },
                    { id: 2, session_name: "Midday Nap", time_window: "12:45 - 14:30", duration: "1h 45m", quality: "Restful (92%)", type: "Balanced" },
                    { id: 3, session_name: "Late Afternoon Nap", time_window: "16:00 - 17:10", duration: "1h 10m", quality: "Good (89%)", type: "Light REM" },
                    { id: 4, session_name: "Current Sleep", time_window: "19:40 - Active", duration: "Active Session", quality: "Deep Rest (95%)", type: "NREM Deep" }
                ]
            },
            settings: {
                rocking_speed: "gentle",
                lullaby_sound: "brahms",
                nightlight: "pink_glow",
                nightlight_brightness: 45
            },
            baby: {
                name: "Baby Liam",
                age: "4 Months",
                birth_date: "2026-07-12",
                weight_kg: 6.5,
                pediatrician: "Dr. Elena Rostova",
                clinic: "Metro Infant Care & Pediatrics",
                emergency_phone: "+1 (555) 234-5678"
            },
            users: {
                "parent@smartcradle.com": {
                    name: "Sarah Miller",
                    email: "parent@smartcradle.com",
                    password_hash: DEMO_PASS_HASH,
                    role: "Parent / Primary Caregiver",
                    cradle_id: "CRADLE-01"
                }
            },
            sessionUser: isNativeApp()
                ? {
                    logged_in: true,
                    name: "Sarah Miller",
                    email: "parent@smartcradle.com",
                    role: "Parent / Primary Caregiver",
                    cradle_id: "CRADLE-01"
                }
                : null,
            events: [
                {
                    id: 1,
                    timestamp: nowTime,
                    category: "system",
                    title: "On-Device Engine Ready",
                    message: "SmartCradle mobile runtime active. Simulation running directly on your phone.",
                    source: "SIMULATED",
                    is_simulated: true
                }
            ]
        };
    }

    function loadDb() {
        try {
            const raw = global.localStorage.getItem(DB_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.state && parsed.sleep && parsed.settings && parsed.baby && parsed.users) {
                    return parsed;
                }
            }
        } catch (e) {
            // fallback to fresh DB
        }
        const fresh = createInitialDb();
        saveDb(fresh);
        return fresh;
    }

    function saveDb(db) {
        try {
            global.localStorage.setItem(DB_KEY, JSON.stringify(db));
        } catch (e) {
            // ignore quota errors
        }
    }

    function syncSleepTimer(db) {
        const now = Date.now();
        const elapsed = Math.floor((now - (db.lastSleepTickMs || now)) / 1000);
        if (elapsed >= 1) {
            db.lastSleepTickMs = (db.lastSleepTickMs || now) + elapsed * 1000;
            if (db.sleep.is_sleeping) {
                db.sleep.current_session_seconds += elapsed;
            }
        }
    }

    function addStandaloneEvent(db, category, title, message, isSimulated = true) {
        db.eventCounter += 1;
        const entry = {
            id: db.eventCounter,
            timestamp: new Date().toTimeString().split(" ")[0],
            category,
            title,
            message,
            source: isSimulated ? "SIMULATED" : "REAL",
            is_simulated: isSimulated
        };
        db.events.unshift(entry);
        if (db.events.length > 500) db.events.pop();
        return entry;
    }

    function currentSessionUser(db) {
        if (!db.sessionUser || !db.sessionUser.logged_in) {
            return {
                logged_in: false,
                name: "Guest",
                email: "",
                role: "Unauthenticated",
                cradle_id: "None"
            };
        }
        return db.sessionUser;
    }

    function makeJsonResponse(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" }
        });
    }

    function parseBody(options) {
        if (!options || !options.body) return {};
        try {
            return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
        } catch (e) {
            return {};
        }
    }

    function buildReportText(db) {
        const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
        let report = `=======================================================
SMARTCRADLE PEDIATRIC HEALTH & SLEEP SUMMARY REPORT
Generated On: ${nowStr}
=======================================================

1. INFANT IDENTIFICATION
Name: ${db.baby.name}
Age: ${db.baby.age}
Weight: ${db.baby.weight_kg} kg
Primary Pediatrician: ${db.baby.pediatrician} (${db.baby.clinic})
Emergency Phone: ${db.baby.emergency_phone}

2. SLEEP ARCHITECTURE & VITALS
Sleep Score: ${db.sleep.sleep_score}% (Optimal Health Range)
Current State: ${db.sleep.sleep_status}
Total Observed Sleep Today: ${(db.sleep.total_sleep_today_seconds / 3600).toFixed(1)} Hours (Target: 14.0 Hours)
Estimated Respiration Rate: ${db.sleep.respiration_rate} Breaths / Minute (Normal: 30-40)

Sleep Stage Distribution:
- Deep Sleep (Quiet NREM): ${db.sleep.deep_sleep_pct}%
- Light Sleep (Active REM): ${db.sleep.light_sleep_pct}%
- Movement / Restless: ${db.sleep.restless_pct}%

Night Awakenings: ${db.sleep.night_awakenings} Times
Soothing Cradle Efficacy: ${db.sleep.soothing_success_rate}% of episodes resolved without caregiver escalation

3. RECENT NAP SESSIONS
`;
        for (const nap of db.sleep.nap_history) {
            report += `- [${nap.session_name}] ${nap.time_window} | Duration: ${nap.duration} | Quality: ${nap.quality} | Type: ${nap.type}\n`;
        }
        report += `
=======================================================
DISCLAIMER: This report is generated from prototype simulation
telemetry for academic demonstration and does not constitute a certified
medical diagnostic document.
=======================================================
`;
        return report;
    }

    function handleStandaloneApi(path, options = {}) {
        const method = ((options && options.method) || "GET").toUpperCase();
        const urlObj = new URL(path, "https://localhost");
        const route = urlObj.pathname;
        const data = parseBody(options);
        const db = loadDb();

        const publicAuthRoutes = new Set([
            "/api/auth/user",
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/guest",
            "/api/auth/logout"
        ]);

        if (!publicAuthRoutes.has(route)) {
            const u = db.sessionUser;
            const isCaregiver = Boolean(u && u.logged_in && db.users[u.email]);
            const isGuest = Boolean(u && u.logged_in && u.email === "reviewer@demo.local");
            if (!isCaregiver && !isGuest) {
                return makeJsonResponse({ error: "Sign in to access this demo data" }, 401);
            }
            const guestCameraRoutes = new Set([
                "/api/webcam/status",
                "/api/camera/vision_mode",
                "/api/motion",
                "/api/camera/optical_wetness"
            ]);
            if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !isCaregiver) {
                if (!isGuest || !guestCameraRoutes.has(route)) {
                    return makeJsonResponse({ error: "Guest access is read-only. Sign in as a caregiver to change demo settings." }, 403);
                }
            }
        }

        if (route === "/api/auth/user" && method === "GET") {
            return makeJsonResponse(currentSessionUser(db));
        }

        if (route === "/api/auth/login" && method === "POST") {
            const email = String(data.email || "").trim().toLowerCase();
            const password = String(data.password || "");
            const account = db.users[email];
            if (account && account.password_hash === simpleHash(password)) {
                db.sessionUser = {
                    logged_in: true,
                    name: account.name,
                    email: account.email,
                    role: account.role,
                    cradle_id: account.cradle_id
                };
                addStandaloneEvent(db, "system", "Caregiver Login", `System: Caregiver '${account.name}' signed in successfully.`, true);
                saveDb(db);
                return makeJsonResponse({ status: "ok", user: db.sessionUser });
            }
            return makeJsonResponse({ error: "Invalid email or password" }, 401);
        }

        if (route === "/api/auth/register" && method === "POST") {
            const name = String(data.name || "").trim() || "Caregiver";
            const email = String(data.email || "").trim().toLowerCase();
            const password = String(data.password || "");
            const role = String(data.role || "Parent / Primary Caregiver");
            if (!email || !email.includes("@") || password.length < 8) {
                return makeJsonResponse({ error: "Valid email and a password of at least 8 characters are required" }, 400);
            }
            if (db.users[email]) {
                return makeJsonResponse({ error: "An account with this email already exists" }, 409);
            }
            const cradleId = `CRADLE-${String(Object.keys(db.users).length + 1).padStart(2, "0")}`;
            db.users[email] = {
                name,
                email,
                password_hash: simpleHash(password),
                role,
                cradle_id: cradleId
            };
            db.sessionUser = { logged_in: true, name, email, role, cradle_id: cradleId };
            addStandaloneEvent(db, "system", "Account Registered", `System: New caregiver account registered for '${name}'.`, true);
            saveDb(db);
            return makeJsonResponse({ status: "ok", user: db.sessionUser });
        }

        if (route === "/api/auth/guest" && method === "POST") {
            db.sessionUser = {
                logged_in: true,
                name: "Demo Reviewer",
                email: "reviewer@demo.local",
                role: "Evaluation Guest",
                cradle_id: "CRADLE-GUEST"
            };
            addStandaloneEvent(db, "system", "Guest Session Started", "System: Guest reviewer session started.", true);
            saveDb(db);
            return makeJsonResponse({ status: "ok", user: db.sessionUser });
        }

        if (route === "/api/auth/logout" && method === "POST") {
            const prevName = (db.sessionUser && db.sessionUser.name) || "User";
            db.sessionUser = null;
            addStandaloneEvent(db, "system", "Caregiver Logout", `System: '${prevName}' signed out.`, true);
            saveDb(db);
            return makeJsonResponse({ status: "ok" });
        }

        if (route === "/api/status" && method === "GET") {
            syncSleepTimer(db);
            saveDb(db);
            return makeJsonResponse({
                ...db.state,
                user: currentSessionUser(db),
                sleep: db.sleep,
                settings: db.settings,
                baby: db.baby
            });
        }

        if (route === "/api/health/sleep" && method === "GET") {
            syncSleepTimer(db);
            saveDb(db);
            return makeJsonResponse(db.sleep);
        }

        if (route === "/api/health/export" && method === "GET") {
            syncSleepTimer(db);
            saveDb(db);
            return new Response(buildReportText(db), {
                status: 200,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }

        if (route === "/api/settings/cradle") {
            if (method === "POST") {
                const allowed = {
                    rocking_speed: new Set(["gentle", "moderate", "calming"]),
                    lullaby_sound: new Set(["brahms", "white_noise", "rain", "ocean", "off"]),
                    nightlight: new Set(["pink_glow", "warm_amber", "soft_white", "off"])
                };
                for (const [k, set] of Object.entries(allowed)) {
                    if (k in data) {
                        if (!set.has(data[k])) return makeJsonResponse({ error: `Invalid ${k}` }, 400);
                        db.settings[k] = data[k];
                    }
                }
                if ("nightlight_brightness" in data) {
                    const b = Number(data.nightlight_brightness);
                    if (!Number.isFinite(b) || b < 0 || b > 100) {
                        return makeJsonResponse({ error: "nightlight_brightness must be between 0 and 100" }, 400);
                    }
                    db.settings.nightlight_brightness = Math.round(b);
                }
                addStandaloneEvent(
                    db,
                    "system",
                    "Cradle Preferences Updated",
                    `Settings: Rocking '${db.settings.rocking_speed}', Lullaby '${db.settings.lullaby_sound}'.`,
                    true
                );
                saveDb(db);
            }
            return makeJsonResponse(db.settings);
        }

        if (route === "/api/profile/baby") {
            if (method === "POST") {
                if ("name" in data) {
                    if (typeof data.name !== "string" || !data.name.trim()) return makeJsonResponse({ error: "name must be non-empty text" }, 400);
                    db.baby.name = data.name.trim().slice(0, 80);
                }
                if ("age" in data) {
                    if (typeof data.age !== "string" || !data.age.trim()) return makeJsonResponse({ error: "age must be non-empty text" }, 400);
                    db.baby.age = data.age.trim().slice(0, 40);
                }
                if ("weight_kg" in data) {
                    const w = Number(data.weight_kg);
                    if (!Number.isFinite(w) || w < 0.1 || w > 100) return makeJsonResponse({ error: "weight_kg must be between 0.1 and 100" }, 400);
                    db.baby.weight_kg = w;
                }
                if ("pediatrician" in data) {
                    if (typeof data.pediatrician !== "string") return makeJsonResponse({ error: "pediatrician must be text" }, 400);
                    db.baby.pediatrician = data.pediatrician.trim().slice(0, 100);
                }
                addStandaloneEvent(db, "system", "Infant Profile Updated", `Profile: Infant updated to '${db.baby.name}' (${db.baby.age}).`, true);
                saveDb(db);
            }
            return makeJsonResponse(db.baby);
        }

        if (route === "/api/sensor/cry" && method === "POST") {
            if (typeof data.active !== "boolean") return makeJsonResponse({ error: "active must be a boolean" }, 400);
            syncSleepTimer(db);
            db.state.cry_detected = data.active;
            if (data.active) {
                db.sleep.is_sleeping = false;
                db.sleep.sleep_status = "Awake / Crying";
                db.sleep.respiration_rate = 46;
                addStandaloneEvent(db, "alerts", "Baby Crying", "Parent notification (simulated): Baby crying detected in cradle.", true);
                if (db.state.cradle_motor.mode === "auto") {
                    db.state.cradle_motor.state = "on";
                    addStandaloneEvent(db, "system", "Motor Automation", "Cradle Motor (simulated): Motor automatically turned ON due to crying.", true);
                }
            } else {
                db.sleep.is_sleeping = true;
                if (db.state.baby_movement) {
                    db.sleep.sleep_status = "Restless / Active Movement";
                    db.sleep.respiration_rate = 38;
                } else {
                    db.sleep.sleep_status = "NREM Deep Sleep";
                    db.sleep.respiration_rate = 34;
                }
                addStandaloneEvent(db, "sensors", "Baby Quiet", "Sensors (simulated): Baby stopped crying.", true);
                if (db.state.cradle_motor.mode === "auto") {
                    db.state.cradle_motor.state = "off";
                    addStandaloneEvent(db, "system", "Motor Automation", "Cradle Motor (simulated): Motor automatically turned OFF (crying stopped).", true);
                }
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/sensor/movement" && method === "POST") {
            if (typeof data.active !== "boolean") return makeJsonResponse({ error: "active must be a boolean" }, 400);
            db.state.baby_movement = data.active;
            if (data.active) {
                db.sleep.sleep_status = "Restless / Active Movement";
                db.sleep.respiration_rate = 38;
                addStandaloneEvent(db, "sensors", "Baby Movement", "Sensors (simulated): Baby physical movement detected in cradle.", true);
            } else {
                if (!db.state.cry_detected) {
                    db.sleep.is_sleeping = true;
                    db.sleep.sleep_status = "NREM Deep Sleep";
                    db.sleep.respiration_rate = 34;
                }
                addStandaloneEvent(db, "sensors", "Baby Still", "Sensors (simulated): Baby movement ceased (infant is still).", true);
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/sensor/wetness" && method === "POST") {
            if (typeof data.active !== "boolean") return makeJsonResponse({ error: "active must be a boolean" }, 400);
            db.state.wetness_detected = data.active;
            if (data.active) {
                db.state.buzzer = "ACTIVE";
                addStandaloneEvent(db, "alerts", "Bedding Wetness", "Parent notification (simulated): Wet bedding detected! Buzzer alarm activated.", true);
            } else {
                db.state.buzzer = "INACTIVE";
                addStandaloneEvent(db, "sensors", "Bedding Dry", "Sensors (simulated): Bedding dry or changed. Buzzer alarm deactivated.", true);
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/sensor/temperature" && method === "POST") {
            const temp = Number(data.temperature ?? db.state.temperature);
            const thresh = Number(data.threshold ?? db.state.temp_threshold);
            if (!Number.isFinite(temp) || temp < 10 || temp > 45) return makeJsonResponse({ error: "temperature must be between 10 and 45" }, 400);
            if (!Number.isFinite(thresh) || thresh < 15 || thresh > 45) return makeJsonResponse({ error: "threshold must be between 15 and 45" }, 400);
            const newTemp = Math.round(temp * 10) / 10;
            const newThresh = Math.round(thresh * 10) / 10;
            const oldWarn = db.state.temp_warning;
            const newWarn = newTemp > newThresh;
            db.state.temperature = newTemp;
            db.state.temp_threshold = newThresh;
            db.state.temp_warning = newWarn;
            if (!oldWarn && newWarn) {
                addStandaloneEvent(db, "alerts", "High Temperature Warning", `Parent notification (simulated): High temperature warning! Temp reached ${newTemp.toFixed(1)}°C (demo limit: ${newThresh.toFixed(1)}°C).`, true);
            } else if (oldWarn && !newWarn) {
                addStandaloneEvent(db, "sensors", "Temperature Normal", `Sensors (simulated): Temperature returned to normal at ${newTemp.toFixed(1)}°C (below ${newThresh.toFixed(1)}°C limit).`, true);
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/motor" && method === "POST") {
            if (data.mode === "auto" || data.mode === "manual") {
                db.state.cradle_motor.mode = data.mode;
                addStandaloneEvent(db, "system", "Motor Mode Changed", `Cradle Motor (simulated): Control mode switched to ${data.mode.toUpperCase()}.`, true);
                if (data.mode === "auto") {
                    const target = db.state.cry_detected ? "on" : "off";
                    if (db.state.cradle_motor.state !== target) {
                        db.state.cradle_motor.state = target;
                        addStandaloneEvent(db, "system", "Motor Automation", `Cradle Motor (simulated): Motor set to ${target.toUpperCase()} matching cry status.`, true);
                    }
                }
            }
            if (data.state === "on" || data.state === "off") {
                db.state.cradle_motor.state = data.state;
                addStandaloneEvent(db, "system", "Motor Manual Control", `Cradle Motor (simulated): Motor manually turned ${data.state.toUpperCase()}.`, true);
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/motion" && method === "POST") {
            if (typeof data.detected !== "boolean") return makeJsonResponse({ error: "detected must be a boolean" }, 400);
            db.state.webcam_motion_detected = data.detected;
            if (data.detected) {
                addStandaloneEvent(db, "motion", "Webcam Motion Detected", "Webcam Motion (REAL): Visual movement detected by room camera.", false);
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/camera/vision_mode" && method === "POST") {
            const mode = data.mode || "normal";
            if (!["normal", "thermal", "wet_scanner"].includes(mode)) return makeJsonResponse({ error: "Invalid mode" }, 400);
            db.state.camera_vision_mode = mode;
            addStandaloneEvent(db, "system", "Vision Mode Changed", `Webcam Vision: Switched to ${mode.replace("_", " ")} Analysis.`, false);
            saveDb(db);
            return makeJsonResponse({ status: "ok", mode });
        }

        if (route === "/api/camera/optical_wetness" && method === "POST") {
            if (typeof data.detected !== "boolean") return makeJsonResponse({ error: "detected must be a boolean" }, 400);
            db.state.optical_wetness_active = data.detected;
            if (data.detected) {
                addStandaloneEvent(db, "alerts", "Optical Moisture Detected", "Optical Camera Vision (REAL/ANALYSIS): Bedding saturation/stain anomaly detected.", false);
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/webcam/status" && method === "POST") {
            if (typeof data.active !== "boolean") return makeJsonResponse({ error: "active must be a boolean" }, 400);
            const oldActive = db.state.webcam_active;
            db.state.webcam_active = data.active;
            if (data.error) {
                addStandaloneEvent(db, "system", "Camera Error", `Webcam (REAL): Camera error - ${data.error}`, false);
            } else if (!oldActive && data.active) {
                addStandaloneEvent(db, "system", "Camera Started", "Webcam (REAL): Video stream started on device.", false);
            } else if (oldActive && !data.active) {
                addStandaloneEvent(db, "system", "Camera Stopped", "Webcam (REAL): Video stream stopped by user.", false);
            }
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        if (route === "/api/events" && method === "GET") {
            const cat = (urlObj.searchParams.get("category") || "all").toLowerCase();
            if (cat === "all") return makeJsonResponse(db.events);
            return makeJsonResponse(db.events.filter(e => e.category === cat));
        }

        if (route === "/api/events/clear" && method === "POST") {
            db.events = [];
            addStandaloneEvent(db, "system", "History Cleared", "System: Event history cleared by user.", true);
            saveDb(db);
            return makeJsonResponse({ status: "ok" });
        }

        if (route === "/api/reset" && method === "POST") {
            db.state = createInitialDb().state;
            db.sleep.is_sleeping = true;
            db.sleep.sleep_status = "NREM Deep Sleep";
            db.sleep.current_session_seconds = 1540;
            db.sleep.respiration_rate = 34;
            db.lastSleepTickMs = Date.now();
            addStandaloneEvent(db, "system", "System Reset", "System (simulated): All sensor states and motor reset to factory defaults.", true);
            saveDb(db);
            return makeJsonResponse(db.state);
        }

        return makeJsonResponse({ error: "Endpoint not found" }, 404);
    }

    async function smartFetch(path, options = {}) {
        if (resolveRuntimeMode() === "standalone") {
            return handleStandaloneApi(path, options);
        }

        const cfg = getConnectionConfig();
        const url = cfg.serverUrl ? `${cfg.serverUrl}${path}` : path;
        const capHttp = global.Capacitor?.Plugins?.CapacitorHttp;

        if (isNativeApp() && /^https?:\/\//i.test(url) && capHttp && typeof capHttp.request === "function") {
            const method = ((options && options.method) || "GET").toUpperCase();
            const headers = { ...(options.headers || {}) };
            let parsedData = undefined;
            if (options.body) {
                try {
                    parsedData = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
                } catch (e) {
                    parsedData = options.body;
                }
            }
            const res = await capHttp.request({
                method,
                url,
                headers,
                data: parsedData,
                webFetchExtra: { credentials: "include" }
            });
            const bodyText = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            return new Response(bodyText, {
                status: res.status || 200,
                headers: res.headers || {}
            });
        }

        return global.fetch(url, { credentials: "include", ...options });
    }

    async function requestNativeCameraPermission() {
        const capCamera = global.Capacitor?.Plugins?.Camera;
        if (!isNativeApp() || !capCamera || typeof capCamera.requestPermissions !== "function") {
            return true;
        }
        try {
            const status = await capCamera.requestPermissions({ permissions: ["camera"] });
            return status.camera !== "denied";
        } catch (e) {
            console.warn("Capacitor Camera permission prompt failed:", e);
            return true;
        }
    }

    async function shareOrDownloadText(filename, text) {
        if (isNativeApp() && typeof global.navigator?.share === "function") {
            try {
                await global.navigator.share({
                    title: "SmartCradle Health Summary",
                    text
                });
                return "shared";
            } catch (err) {
                if (err && err.name === "AbortError") return "cancelled";
            }
        }
        try {
            const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            return "downloaded";
        } catch (e) {
            return "preview";
        }
    }

    global.SmartCradleRuntime = {
        isNativeApp,
        getConnectionConfig,
        saveConnectionConfig,
        resolveRuntimeMode,
        smartFetch,
        requestNativeCameraPermission,
        shareOrDownloadText
    };
})(window);
