"""
SmartCradle - Flask Backend
Title: A Smart IoT and AI-Based Cradle for Baby Health and Safety
App Name: SmartCradle

In-memory state and JSON API for simulated sensors, cradle motor control,
real webcam multi-modal computer vision (motion, pseudo-thermal, optical wetness),
infant sleep & health analytics tracking, cradle settings, and caregiver authentication.
"""

from datetime import datetime
import math
import os
import threading
import time
from flask import Flask, jsonify, render_template, request, Response, session
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SMARTCRADLE_SECRET_KEY") or os.urandom(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SMARTCRADLE_HTTPS") == "1",
)

# State lock for thread safety (RLock to allow re-entrancy from helper functions)
state_lock = threading.RLock()

# Central in-memory state
event_counter = 0

state = {
    "cradle_motor": {
        "mode": "auto",     # "auto" or "manual"
        "state": "off"      # "on" or "off"
    },
    "cry_detected": False,          # Simulated cry sensor (True/False)
    "baby_movement": False,         # Simulated baby PIR movement (True/False)
    "wetness_detected": False,      # Simulated moisture sensor (True/False)
    "buzzer": "INACTIVE",           # Simulated buzzer: ACTIVE only when wetness is detected
    "temperature": 27.0,            # Simulated temperature in °C (10.0 to 45.0)
    "temp_threshold": 32.0,         # Configurable threshold (°C)
    "temp_warning": False,          # True when temperature > temp_threshold
    "webcam_active": False,         # Real webcam streaming status
    "webcam_motion_detected": False,# Real webcam motion status
    "camera_vision_mode": "normal", # "normal", "thermal", "wet_scanner"
    "optical_wetness_active": False # Optical wetness detected via camera
}

# Infant Sleep & Health Analytics Data
sleep_data = {
    "is_sleeping": True,
    "sleep_status": "NREM Deep Sleep", # "NREM Deep Sleep", "REM Light Sleep", "Restless", "Awake"
    "current_session_seconds": 1540,    # ~25 minutes in active sleep
    "total_sleep_today_seconds": 29800, # ~8h 16m total today
    "sleep_target_seconds": 50400,      # 14h target for infant
    "sleep_score": 94,                  # 0 to 100 quality score
    "respiration_rate": 34,             # Estimated breaths per minute (30-40 normal)
    "deep_sleep_pct": 52,
    "light_sleep_pct": 36,
    "restless_pct": 12,
    "night_awakenings": 2,
    "soothing_success_rate": 88,
    "nap_history": [
        {"id": 1, "session_name": "Morning Nap", "time_window": "08:30 - 10:15", "duration": "1h 45m", "quality": "Optimal (96%)", "type": "Quiet NREM"},
        {"id": 2, "session_name": "Midday Nap", "time_window": "12:45 - 14:30", "duration": "1h 45m", "quality": "Restful (92%)", "type": "Balanced"},
        {"id": 3, "session_name": "Late Afternoon Nap", "time_window": "16:00 - 17:10", "duration": "1h 10m", "quality": "Good (89%)", "type": "Light REM"},
        {"id": 4, "session_name": "Current Sleep", "time_window": "19:40 - Active", "duration": "Active Session", "quality": "Deep Rest (95%)", "type": "NREM Deep"}
    ]
}

# Cradle Preferences & Automation Settings
cradle_settings = {
    "rocking_speed": "gentle",    # "gentle", "moderate", "calming"
    "lullaby_sound": "brahms",    # "brahms", "white_noise", "rain", "ocean", "off"
    "nightlight": "pink_glow",    # "pink_glow", "warm_amber", "soft_white", "off"
    "nightlight_brightness": 45
}

# Infant Profile & Healthcare Details
baby_profile = {
    "name": "Baby Liam",
    "age": "4 Months",
    "birth_date": "2026-07-12",
    "weight_kg": 6.5,
    "pediatrician": "Dr. Elena Rostova",
    "clinic": "Metro Infant Care & Pediatrics",
    "emergency_phone": "+1 (555) 234-5678"
}

# User accounts database (in-memory)
users = {
    "parent@smartcradle.com": {
        "name": "Sarah Miller",
        "email": "parent@smartcradle.com",
        # This credential is intentionally a demo-only account.
        "password_hash": generate_password_hash("password123"),
        "role": "Parent / Primary Caregiver",
        "cradle_id": "CRADLE-01"
    }
}

def get_session_user():
    return {"logged_in": bool(session.get("email")), "name": session.get("name", "Guest"),
            "email": session.get("email", ""), "role": session.get("role", "Unauthenticated"),
            "cradle_id": session.get("cradle_id", "None")}


TRUSTED_MOBILE_ORIGINS = {"https://localhost", "http://localhost", "capacitor://localhost"}
_sleep_last_monotonic = time.monotonic()


def _sync_sleep_timer_locked():
    """Advance sleep timer while sleeping so server and browser timers stay aligned."""
    global _sleep_last_monotonic
    now = time.monotonic()
    elapsed = int(now - _sleep_last_monotonic)
    if elapsed >= 1:
        _sleep_last_monotonic += elapsed
        if sleep_data.get("is_sleeping"):
            sleep_data["current_session_seconds"] += elapsed


@app.before_request
def protect_api():
    """Keep private demo data signed-in and allow only caregivers to mutate it."""
    if not request.path.startswith("/api/"):
        return None
    if request.method == "OPTIONS" and request.headers.get("Origin") in TRUSTED_MOBILE_ORIGINS:
        return Response(status=204)
    public_auth_routes = {"/api/auth/user", "/api/auth/login", "/api/auth/register", "/api/auth/guest", "/api/auth/logout"}
    if request.path in public_auth_routes:
        return None
    email = session.get("email")
    is_caregiver = email in users
    is_guest = email == "reviewer@demo.local"
    if not (is_caregiver or is_guest):
        return jsonify({"error": "Sign in to access this demo data"}), 401
    guest_camera_routes = {
        "/api/webcam/status", "/api/camera/vision_mode", "/api/motion",
        "/api/camera/optical_wetness",
    }
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and not is_caregiver:
        if is_guest and request.path in guest_camera_routes:
            return None
        return jsonify({"error": "Guest access is read-only. Sign in as a caregiver to change demo settings."}), 403
    return None


@app.after_request
def add_mobile_cors(response):
    """Allow native Capacitor WebView shell on localhost origins to call API when configured."""
    origin = request.headers.get("Origin")
    if request.path.startswith("/api/") and origin in TRUSTED_MOBILE_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers.add("Vary", "Origin")
    return response

# Event log storage (in-memory)
events = []


def parse_bool(value):
    return value if isinstance(value, bool) else None


def parse_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


def add_event(category, title, message, is_simulated=True):
    """
    Append an event to the in-memory event log with unique ID and timestamp.
    Categories: 'alerts', 'motion', 'sensors', 'system'
    """
    global event_counter
    with state_lock:
        event_counter += 1
        now_str = datetime.now().strftime("%H:%M:%S")
        entry = {
            "id": event_counter,
            "timestamp": now_str,
            "category": category,
            "title": title,
            "message": message,
            "source": "SIMULATED" if is_simulated else "REAL",
            "is_simulated": is_simulated
        }
        events.insert(0, entry)
        if len(events) > 500:
            events.pop()
        return entry


# Initialize default system boot event
add_event("system", "System Initialized", "SmartCradle server online. Ready for monitoring.", is_simulated=True)


@app.route("/")
def index():
    """Serve the single-page application containing all views."""
    return render_template("index.html")


@app.route("/api/status", methods=["GET"])
def get_status():
    """Return the current cradle system status, active indicators, and sleep data."""
    with state_lock:
        _sync_sleep_timer_locked()
        response_data = dict(state)
        response_data["user"] = get_session_user()
        response_data["sleep"] = sleep_data
        response_data["settings"] = cradle_settings
        response_data["baby"] = baby_profile
        return jsonify(response_data)


# ================= SLEEP & HEALTH ANALYTICS ENDPOINTS =================
@app.route("/api/health/sleep", methods=["GET"])
def get_sleep_health():
    """Return comprehensive infant sleep tracking and health telemetry."""
    with state_lock:
        _sync_sleep_timer_locked()
        return jsonify(sleep_data)


@app.route("/api/settings/cradle", methods=["GET", "POST"])
def handle_cradle_settings():
    """Get or update cradle preferences (rocking speed, lullaby sound, nightlight)."""
    with state_lock:
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            allowed = {
                "rocking_speed": {"gentle", "moderate", "calming"},
                "lullaby_sound": {"brahms", "white_noise", "rain", "ocean", "off"},
                "nightlight": {"pink_glow", "warm_amber", "soft_white", "off"},
            }
            for key, choices in allowed.items():
                if key in data:
                    if data[key] not in choices:
                        return jsonify({"error": f"Invalid {key}"}), 400
                    cradle_settings[key] = data[key]
            if "nightlight_brightness" in data:
                brightness = parse_number(data["nightlight_brightness"])
                if brightness is None or not 0 <= brightness <= 100:
                    return jsonify({"error": "nightlight_brightness must be between 0 and 100"}), 400
                cradle_settings["nightlight_brightness"] = int(brightness)

            add_event(
                category="system",
                title="Cradle Preferences Updated",
                message=f"Settings: Rocking '{cradle_settings['rocking_speed']}', Lullaby '{cradle_settings['lullaby_sound']}'.",
                is_simulated=True
            )
        return jsonify(cradle_settings)


@app.route("/api/profile/baby", methods=["GET", "POST"])
def handle_baby_profile():
    """Get or update infant profile information."""
    with state_lock:
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            if "name" in data:
                if not isinstance(data["name"], str) or not data["name"].strip():
                    return jsonify({"error": "name must be non-empty text"}), 400
                baby_profile["name"] = data["name"].strip()[:80]
            if "age" in data:
                if not isinstance(data["age"], str) or not data["age"].strip():
                    return jsonify({"error": "age must be non-empty text"}), 400
                baby_profile["age"] = data["age"].strip()[:40]
            if "weight_kg" in data:
                weight = parse_number(data["weight_kg"])
                if weight is None or not 0.1 <= weight <= 100:
                    return jsonify({"error": "weight_kg must be between 0.1 and 100"}), 400
                baby_profile["weight_kg"] = weight
            if "pediatrician" in data:
                if not isinstance(data["pediatrician"], str):
                    return jsonify({"error": "pediatrician must be text"}), 400
                baby_profile["pediatrician"] = data["pediatrician"].strip()[:100]

            add_event(
                category="system",
                title="Infant Profile Updated",
                message=f"Profile: Infant updated to '{baby_profile['name']}' ({baby_profile['age']}).",
                is_simulated=True
            )
        return jsonify(baby_profile)


@app.route("/api/health/export", methods=["GET"])
def export_health_report():
    """Generate a downloadable pediatric health and sleep summary report."""
    with state_lock:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        report_text = f"""=======================================================
SMARTCRADLE PEDIATRIC HEALTH & SLEEP SUMMARY REPORT
Generated On: {now_str}
=======================================================

1. INFANT IDENTIFICATION
Name: {baby_profile['name']}
Age: {baby_profile['age']}
Weight: {baby_profile['weight_kg']} kg
Primary Pediatrician: {baby_profile['pediatrician']} ({baby_profile['clinic']})
Emergency Phone: {baby_profile['emergency_phone']}

2. SLEEP ARCHITECTURE & VITALS
Sleep Score: {sleep_data['sleep_score']}% (Optimal Health Range)
Current State: {sleep_data['sleep_status']}
Total Observed Sleep Today: {round(sleep_data['total_sleep_today_seconds'] / 3600, 1)} Hours (Target: 14.0 Hours)
Estimated Respiration Rate: {sleep_data['respiration_rate']} Breaths / Minute (Normal: 30-40)

Sleep Stage Distribution:
- Deep Sleep (Quiet NREM): {sleep_data['deep_sleep_pct']}%
- Light Sleep (Active REM): {sleep_data['light_sleep_pct']}%
- Movement / Restless: {sleep_data['restless_pct']}%

Night Awakenings: {sleep_data['night_awakenings']} Times
Soothing Cradle Efficacy: {sleep_data['soothing_success_rate']}% of episodes resolved without caregiver escalation

3. RECENT NAP SESSIONS
"""
        for nap in sleep_data["nap_history"]:
            report_text += f"- [{nap['session_name']}] {nap['time_window']} | Duration: {nap['duration']} | Quality: {nap['quality']} | Type: {nap['type']}\n"

        report_text += """
=======================================================
DISCLAIMER: This report is generated from prototype simulation
telemetry for academic demonstration and does not constitute a certified
medical diagnostic document.
=======================================================
"""
        return Response(
            report_text,
            mimetype="text/plain",
            headers={"Content-Disposition": "attachment; filename=SmartCradle_Demo_Report.txt"}
        )


# ================= AUTHENTICATION ENDPOINTS =================
@app.route("/api/auth/user", methods=["GET"])
def get_current_user():
    """Return current logged in caregiver details."""
    with state_lock:
        return jsonify(get_session_user())


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """Sign in an existing parent account."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    with state_lock:
        if email in users and check_password_hash(users[email]["password_hash"], password):
            account = users[email]
            session.clear()
            session.update({"name": account["name"], "email": account["email"],
                            "role": account["role"], "cradle_id": account["cradle_id"]})

            add_event(
                category="system",
                title="Caregiver Login",
                message=f"System: Caregiver '{account['name']}' signed in successfully.",
                is_simulated=True
            )
            return jsonify({"status": "ok", "user": get_session_user()})

        return jsonify({"error": "Invalid email or password"}), 401


@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    """Create a new parent / caregiver account."""
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip() or "Caregiver"
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "Parent / Primary Caregiver")

    if not email or "@" not in email or not password or len(password) < 8:
        return jsonify({"error": "Valid email and a password of at least 8 characters are required"}), 400

    with state_lock:
        if email in users:
            return jsonify({"error": "An account with this email already exists"}), 409
        users[email] = {
            "name": name,
            "email": email,
            "password_hash": generate_password_hash(password),
            "role": role,
            "cradle_id": f"CRADLE-{len(users) + 1:02d}"
        }

        session.clear()
        session.update({"name": name, "email": email, "role": role, "cradle_id": users[email]["cradle_id"]})

        add_event(
            category="system",
            title="Account Registered",
            message=f"System: New caregiver account registered for '{name}'.",
            is_simulated=True
        )
        return jsonify({"status": "ok", "user": get_session_user()})


@app.route("/api/auth/guest", methods=["POST"])
def auth_guest():
    """Quick 1-click guest access for reviews and testing."""
    with state_lock:
        session.clear()
        session.update({"name": "Demo Reviewer", "email": "reviewer@demo.local",
                        "role": "Evaluation Guest", "cradle_id": "CRADLE-GUEST"})

        add_event(
            category="system",
            title="Guest Session Started",
            message="System: Guest reviewer session started.",
            is_simulated=True
        )
        return jsonify({"status": "ok", "user": get_session_user()})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    """Sign out the current caregiver."""
    with state_lock:
        name = session.get("name", "User")
        session.clear()

        add_event(
            category="system",
            title="Caregiver Logout",
            message=f"System: '{name}' signed out.",
            is_simulated=True
        )
        return jsonify({"status": "ok"})


# ================= SIMULATED SENSOR ENDPOINTS =================
@app.route("/api/sensor/cry", methods=["POST"])
def set_cry_sensor():
    """
    Toggle simulated cry sensor.
    In Auto mode, crying starts the cradle motor and quiet stops it.
    Updates sleep and respiration state dynamically.
    """
    data = request.get_json(silent=True) or {}
    active = parse_bool(data.get("active"))
    if active is None: return jsonify({"error": "active must be a boolean"}), 400

    with state_lock:
        _sync_sleep_timer_locked()
        state["cry_detected"] = active

        if active:
            sleep_data["is_sleeping"] = False
            sleep_data["sleep_status"] = "Awake / Crying"
            sleep_data["respiration_rate"] = 46  # Elevated breathing during crying

            add_event(
                category="alerts",
                title="Baby Crying",
                message="Parent notification (simulated): Baby crying detected in cradle.",
                is_simulated=True
            )
            # Automatic mode action: turn motor ON
            if state["cradle_motor"]["mode"] == "auto":
                state["cradle_motor"]["state"] = "on"
                add_event(
                    category="system",
                    title="Motor Automation",
                    message="Cradle Motor (simulated): Motor automatically turned ON due to crying.",
                    is_simulated=True
                )
        else:
            sleep_data["is_sleeping"] = True
            if state["baby_movement"]:
                sleep_data["sleep_status"] = "Restless / Active Movement"
                sleep_data["respiration_rate"] = 38
            else:
                sleep_data["sleep_status"] = "NREM Deep Sleep"
                sleep_data["respiration_rate"] = 34

            add_event(
                category="sensors",
                title="Baby Quiet",
                message="Sensors (simulated): Baby stopped crying.",
                is_simulated=True
            )
            # Automatic mode action: turn motor OFF
            if state["cradle_motor"]["mode"] == "auto":
                state["cradle_motor"]["state"] = "off"
                add_event(
                    category="system",
                    title="Motor Automation",
                    message="Cradle Motor (simulated): Motor automatically turned OFF (crying stopped).",
                    is_simulated=True
                )

        return jsonify(state)


@app.route("/api/sensor/movement", methods=["POST"])
def set_movement_sensor():
    """Toggle simulated baby physical movement (PIR sensor)."""
    data = request.get_json(silent=True) or {}
    active = parse_bool(data.get("active"))
    if active is None: return jsonify({"error": "active must be a boolean"}), 400

    with state_lock:
        state["baby_movement"] = active
        if active:
            sleep_data["sleep_status"] = "Restless / Active Movement"
            sleep_data["respiration_rate"] = 38
            add_event(
                category="sensors",
                title="Baby Movement",
                message="Sensors (simulated): Baby physical movement detected in cradle.",
                is_simulated=True
            )
        else:
            if not state["cry_detected"]:
                sleep_data["is_sleeping"] = True
                sleep_data["sleep_status"] = "NREM Deep Sleep"
                sleep_data["respiration_rate"] = 34
            add_event(
                category="sensors",
                title="Baby Still",
                message="Sensors (simulated): Baby movement ceased (infant is still).",
                is_simulated=True
            )
        return jsonify(state)


@app.route("/api/sensor/wetness", methods=["POST"])
def set_wetness_sensor():
    """
    Toggle simulated bedding wetness sensor.
    Buzzer is ACTIVE only while wetness is detected.
    """
    data = request.get_json(silent=True) or {}
    active = parse_bool(data.get("active"))
    if active is None: return jsonify({"error": "active must be a boolean"}), 400

    with state_lock:
        state["wetness_detected"] = active
        if active:
            state["buzzer"] = "ACTIVE"
            add_event(
                category="alerts",
                title="Bedding Wetness",
                message="Parent notification (simulated): Wet bedding detected! Buzzer alarm activated.",
                is_simulated=True
            )
        else:
            state["buzzer"] = "INACTIVE"
            add_event(
                category="sensors",
                title="Bedding Dry",
                message="Sensors (simulated): Bedding dry or changed. Buzzer alarm deactivated.",
                is_simulated=True
            )
        return jsonify(state)


@app.route("/api/sensor/temperature", methods=["POST"])
def set_temperature_sensor():
    """
    Update simulated temperature and threshold setting.
    Logs transition events only (normal -> warning, warning -> normal).
    """
    data = request.get_json(silent=True) or {}
    new_temp = parse_number(data.get("temperature", state["temperature"]))
    new_thresh = parse_number(data.get("threshold", state["temp_threshold"]))
    if new_temp is None or not 10 <= new_temp <= 45:
        return jsonify({"error": "temperature must be between 10 and 45"}), 400
    if new_thresh is None or not 15 <= new_thresh <= 45:
        return jsonify({"error": "threshold must be between 15 and 45"}), 400
    new_temp, new_thresh = round(new_temp, 1), round(new_thresh, 1)

    with state_lock:
        old_warning = state["temp_warning"]
        new_warning = new_temp > new_thresh

        state["temperature"] = new_temp
        state["temp_threshold"] = new_thresh
        state["temp_warning"] = new_warning

        if not old_warning and new_warning:
            add_event(
                category="alerts",
                title="High Temperature Warning",
                message=f"Parent notification (simulated): High temperature warning! Temp reached {new_temp:.1f}°C (demo limit: {new_thresh:.1f}°C).",
                is_simulated=True
            )
        elif old_warning and not new_warning:
            add_event(
                category="sensors",
                title="Temperature Normal",
                message=f"Sensors (simulated): Temperature returned to normal at {new_temp:.1f}°C (below {new_thresh:.1f}°C limit).",
                is_simulated=True
            )

        return jsonify(state)


# ================= CRADLE MOTOR ENDPOINT =================
@app.route("/api/motor", methods=["POST"])
def control_motor():
    """
    Control cradle motor mode (auto/manual) and direct manual ON/OFF state.
    Manual ON/OFF buttons always take immediate effect.
    """
    data = request.get_json(silent=True) or {}
    mode = data.get("mode")
    cmd_state = data.get("state")

    with state_lock:
        if mode in ["auto", "manual"]:
            state["cradle_motor"]["mode"] = mode
            add_event(
                category="system",
                title="Motor Mode Changed",
                message=f"Cradle Motor (simulated): Control mode switched to {mode.upper()}.",
                is_simulated=True
            )
            if mode == "auto":
                target_state = "on" if state["cry_detected"] else "off"
                if state["cradle_motor"]["state"] != target_state:
                    state["cradle_motor"]["state"] = target_state
                    add_event(
                        category="system",
                        title="Motor Automation",
                        message=f"Cradle Motor (simulated): Motor set to {target_state.upper()} matching cry status.",
                        is_simulated=True
                    )

        if cmd_state in ["on", "off"]:
            state["cradle_motor"]["state"] = cmd_state
            add_event(
                category="system",
                title="Motor Manual Control",
                message=f"Cradle Motor (simulated): Motor manually turned {cmd_state.upper()}.",
                is_simulated=True
            )

        return jsonify(state)


# ================= COMPUTER VISION & WEBCAM ENDPOINTS =================
@app.route("/api/motion", methods=["POST"])
def log_webcam_motion():
    """
    Receive real webcam visual motion detection from browser.
    Rate-limited by browser to prevent alert spam.
    Does NOT move the simulated motor.
    """
    data = request.get_json(silent=True) or {}
    detected = parse_bool(data.get("detected"))
    if detected is None: return jsonify({"error": "detected must be a boolean"}), 400

    with state_lock:
        state["webcam_motion_detected"] = detected
        if detected:
            add_event(
                category="motion",
                title="Webcam Motion Detected",
                message="Webcam Motion (REAL): Visual movement detected by room camera.",
                is_simulated=False
            )
        return jsonify(state)


@app.route("/api/camera/vision_mode", methods=["POST"])
def set_vision_mode():
    """Change the camera computer vision processing mode."""
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "normal")
    if mode in ["normal", "thermal", "wet_scanner"]:
        with state_lock:
            state["camera_vision_mode"] = mode
            add_event(
                category="system",
                title="Vision Mode Changed",
                message=f"Webcam Vision: Switched to {mode.replace('_', ' ').title()} Analysis.",
                is_simulated=False
            )
            return jsonify({"status": "ok", "mode": mode})
    return jsonify({"error": "Invalid mode"}), 400


@app.route("/api/camera/optical_wetness", methods=["POST"])
def log_optical_wetness():
    """Receive optical moisture/stain detection analysis event from browser canvas."""
    data = request.get_json(silent=True) or {}
    detected = parse_bool(data.get("detected"))
    if detected is None: return jsonify({"error": "detected must be a boolean"}), 400

    with state_lock:
        state["optical_wetness_active"] = detected
        if detected:
            add_event(
                category="alerts",
                title="Optical Moisture Detected",
                message="Optical Camera Vision (REAL/ANALYSIS): Bedding saturation/stain anomaly detected.",
                is_simulated=False
            )
        return jsonify(state)


@app.route("/api/webcam/status", methods=["POST"])
def update_webcam_status():
    """Update camera streaming state and log errors or status transitions."""
    data = request.get_json(silent=True) or {}
    active = parse_bool(data.get("active"))
    if active is None: return jsonify({"error": "active must be a boolean"}), 400
    error = data.get("error")

    with state_lock:
        old_active = state["webcam_active"]
        state["webcam_active"] = active

        if error:
            add_event(
                category="system",
                title="Camera Error",
                message=f"Webcam (REAL): Camera error - {error}",
                is_simulated=False
            )
        elif not old_active and active:
            add_event(
                category="system",
                title="Camera Started",
                message="Webcam (REAL): Video stream started in browser.",
                is_simulated=False
            )
        elif old_active and not active:
            add_event(
                category="system",
                title="Camera Stopped",
                message="Webcam (REAL): Video stream stopped by user.",
                is_simulated=False
            )

        return jsonify(state)


# ================= EVENTS & SYSTEM ENDPOINTS =================
@app.route("/api/events", methods=["GET"])
def get_events():
    """Return filtered or full event history."""
    category = request.args.get("category", "all").lower()
    with state_lock:
        if category == "all":
            return jsonify(events)
        filtered = [e for e in events if e["category"] == category]
        return jsonify(filtered)


@app.route("/api/events/clear", methods=["POST"])
def clear_events():
    """Clear all historical events with an acknowledgment record."""
    with state_lock:
        events.clear()
    add_event(
        category="system",
        title="History Cleared",
        message="System: Event history cleared by user.",
        is_simulated=True
    )
    return jsonify({"status": "ok"})


@app.route("/api/reset", methods=["POST"])
def reset_all():
    """Reset all simulated sensors, motor, and values back to defaults."""
    global _sleep_last_monotonic
    with state_lock:
        state["cradle_motor"]["mode"] = "auto"
        state["cradle_motor"]["state"] = "off"
        state["cry_detected"] = False
        state["baby_movement"] = False
        state["wetness_detected"] = False
        state["buzzer"] = "INACTIVE"
        state["temperature"] = 27.0
        state["temp_threshold"] = 32.0
        state["temp_warning"] = False
        state["webcam_motion_detected"] = False
        state["camera_vision_mode"] = "normal"
        state["optical_wetness_active"] = False

        sleep_data["is_sleeping"] = True
        sleep_data["sleep_status"] = "NREM Deep Sleep"
        sleep_data["current_session_seconds"] = 1540
        sleep_data["respiration_rate"] = 34
        _sleep_last_monotonic = time.monotonic()

    add_event(
        category="system",
        title="System Reset",
        message="System (simulated): All sensor states and motor reset to factory defaults.",
        is_simulated=True
    )
    return jsonify(state)


if __name__ == "__main__":
    # Opt into LAN access explicitly; loopback is safer for the default demo run.
    host = "0.0.0.0" if os.environ.get("SMARTCRADLE_ALLOW_LAN") == "1" else "127.0.0.1"
    app.run(host=host, port=5000, debug=False)
