/**
 * SmartCradle — Frontend Application Script
 * Apple-Inspired Design with Dark & Light Mode, Floating Menu Bar,
 * Multi-Modal Computer Vision, Anti-Spam Motion Filtering, and Caregiver Authentication.
 */

// Global System Status
let currentStatus = {
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
};

// Caregiver User Session
let currentUser = {
    logged_in: true,
    name: "Sarah Miller",
    email: "parent@smartcradle.com",
    role: "Parent / Primary Caregiver",
    cradle_id: "CRADLE-01"
};

// Computer Vision & Webcam State
let webcamStream = null;
let visionIntervalId = null;
let currentVisionMode = "normal"; // "normal", "thermal", "wet_scanner"
let preferredCameraFacing = "environment"; // "environment" (rear) or "user" (front)
let previousMotionFrame = null;
let cameraStartTime = 0;
let motionDetectedUntil = 0;
let lastMotionLoggedTime = 0;
let lastOpticalWetLoggedTime = 0;

// Anti-Spam Motion Calibrations
let motionSensitivity = 14.0; // Calibrated nursery default
let alertCooldownMs = 10000;  // 10-second default cooldown
let motionFrameStreak = 0;    // 3 consecutive frame confirmation
let muteMotionToasts = false; // Toast mute toggle

// FPS & Diagnostic Counters
let frameCount = 0;
let lastFpsTime = Date.now();
let currentFps = 0;
let faceLandmarker = null;
let poseLandmarker = null;
let visionModelsPromise = null;
let lastLandmarkRun = 0;
let landmarkCount = 0;
let cameraVisionRun = 0;
let expressionCueHistory = [];

// Events & Polling Tracking
let activeFilter = "all";
let lastSeenEventId = 0;
let isInitialLoad = true;
let alertUnreadCount = 0;

// Sleep Telemetry & Cradle Preferences State
let currentSleepState = null;
let nightlightDebounce = null;

/**
 * Route API calls through the mobile standalone/server dispatcher when loaded.
 */
async function apiRequest(path, options) {
    if (window.SmartCradleRuntime && typeof window.SmartCradleRuntime.smartFetch === "function") {
        return window.SmartCradleRuntime.smartFetch(path, options);
    }
    return fetch(path, options);
}

document.addEventListener("DOMContentLoaded", function () {
    // 1. Initialize Theme (Dark / Light Mode) & Mobile Runtime Connection UI
    initTheme();
    initRuntimeConnectionUI();

    // 2. Fetch User & System State
    fetchUserSession();
    pollStatus();
    fetchEvents();
    syncNotificationButton();

    // 3. Regular polling intervals
    setInterval(pollStatus, 1000);
    setInterval(fetchEvents, 1500);

    // 4. Update HUD clock & Live Sleep Timer
    setInterval(updateHudClock, 1000);
    setInterval(tickSleepTimer, 1000);

    // 5. Close quick menu when clicking outside
    document.addEventListener("click", function (e) {
        const container = document.querySelector(".quick-menu-container");
        const dropdown = document.getElementById("quick-dropdown");
        if (dropdown && container && !container.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
});

/* ================= 1. THEME SWITCHER (DARK & LIGHT MODE) ================= */
/**
 * Initialize theme based on user's saved preference or system preference.
 */
function initTheme() {
    const savedTheme = localStorage.getItem("smartcradle-theme") || "dark";
    setTheme(savedTheme);
}

/**
 * Toggle between Dark and Light mode.
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(newTheme);
}

/**
 * Apply theme to document root and update icon.
 */
function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("smartcradle-theme", theme);

    const icon = document.getElementById("theme-icon");
    if (icon) {
        // Moon for Dark Mode, Sun for Light Mode
        icon.innerHTML = theme === "dark" ? "&#9789;" : "&#9728;";
    }
}

/* ================= 2. QUICK MENU & FULLSCREEN ================= */
function toggleQuickMenu() {
    const dropdown = document.getElementById("quick-dropdown");
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.warn("Fullscreen request error:", err);
        });
    } else {
        document.exitFullscreen().catch(err => {
            console.warn("Exit fullscreen error:", err);
        });
    }
}

/* ================= 3. SPA VIEW NAVIGATION ================= */
/**
 * Switch view tabs seamlessly while preserving the live camera stream.
 */
function switchView(viewName) {
    // Update Dock Tabs
    document.querySelectorAll(".dock-tab").forEach(tab => {
        if (tab.dataset.view === viewName) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    // Update Views Visibility
    document.querySelectorAll(".spa-view").forEach(view => {
        if (view.id === `view-${viewName}`) {
            view.classList.add("active");
        } else {
            view.classList.remove("active");
        }
    });

    // If switching to alerts view, clear the unread badge
    if (viewName === "alerts") {
        alertUnreadCount = 0;
        const badge = document.getElementById("alert-counter-badge");
        if (badge) badge.style.display = "none";
    }

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ================= 4. CAREGIVER AUTHENTICATION ================= */
async function fetchUserSession() {
    try {
        const res = await apiRequest("/api/auth/user");
        if (res.ok) {
            const user = await res.json();
            updateUserUI(user);
            if (!user.logged_in) openAuthModal();
        }
    } catch (e) {
        console.error("Auth session fetch error:", e);
    }
}

function updateUserUI(user) {
    if (!user) return;
    currentUser = user;

    const navAvatar = document.getElementById("nav-user-avatar");
    const navName = document.getElementById("nav-user-name");
    const authStatus = document.getElementById("auth-status-msg");

    if (user.logged_in) {
        const initials = user.name
            .split(" ")
            .map(n => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase() || "CR";

        navAvatar.textContent = initials;
        navName.textContent = user.name.split(" ")[0] || user.name;
        if (authStatus) authStatus.textContent = `Signed in as ${user.name} (${user.email || "Guest"})`;
    } else {
        navAvatar.textContent = "?";
        navName.textContent = "Sign In";
        if (authStatus) authStatus.textContent = "Currently signed out.";
    }
    syncRolePermissions(user);
}

function syncRolePermissions(user) {
    const canWrite = Boolean(user && user.logged_in && user.role !== "Evaluation Guest");
    const mutationPattern = /toggleSensor|setMotor|quickToggleMotor|clearEventHistory|resetSystem|updateLullabySound|updateNightlightColor|updateRockingSpeed|updateTemperatureSlider|simulateDoctorCall/;
    document.querySelectorAll(".spa-view button[onclick], .quick-dropdown .dropdown-item[onclick]").forEach(control => {
        if (!mutationPattern.test(control.getAttribute("onclick") || "")) return;
        control.disabled = !canWrite;
        control.classList.toggle("readonly-control", !canWrite);
        control.title = canWrite ? "" : "Caregiver sign-in is required to change demo settings";
    });
    document.querySelectorAll(".temp-control-side input, .temp-threshold-side input, #nightlight-slider, .spa-view select[onchange]").forEach(control => {
        if (control.id === "runtime-mode-select") return;
        control.disabled = !canWrite;
        control.classList.toggle("readonly-control", !canWrite);
        control.title = canWrite ? "" : "Caregiver sign-in is required to change demo settings";
    });
}

function openAuthModal() {
    document.getElementById("auth-modal").style.display = "flex";
}

function closeAuthModal() {
    document.getElementById("auth-modal").style.display = "none";
}

function switchAuthTab(tabName) {
    document.querySelectorAll(".modal-tab-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`tab-btn-${tabName}`).classList.add("active");

    document.getElementById("form-signin").style.display = (tabName === "signin") ? "block" : "none";
    document.getElementById("form-register").style.display = (tabName === "register") ? "block" : "none";
    document.getElementById("panel-guest").style.display = (tabName === "guest") ? "block" : "none";
}

async function handleSignIn(e) {
    e.preventDefault();
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;

    try {
        const res = await apiRequest("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            updateUserUI(data.user);
            closeAuthModal();
            showToast("Welcome Back", `Signed in as ${data.user.name}.`, false);
            pollStatus();
            fetchEvents();
        } else {
            showToast("Sign In Failed", data.error || "Invalid credentials", true);
        }
    } catch (err) {
        showToast("Error", "Network error during sign in.", true);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const role = document.getElementById("reg-role").value;

    try {
        const res = await apiRequest("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, role })
        });
        const data = await res.json();
        if (res.ok) {
            updateUserUI(data.user);
            closeAuthModal();
            showToast("Account Created", `Welcome, ${data.user.name}!`, false);
            pollStatus();
            fetchEvents();
        } else {
            showToast("Registration Failed", data.error || "Could not register.", true);
        }
    } catch (err) {
        showToast("Error", "Network error during registration.", true);
    }
}

async function handleGuestDemo() {
    try {
        const res = await apiRequest("/api/auth/guest", { method: "POST" });
        const data = await res.json();
        if (res.ok) {
            updateUserUI(data.user);
            closeAuthModal();
            showToast("Evaluation Guest", "Signed in with 1-click evaluation access.", false);
            pollStatus();
            fetchEvents();
        } else {
            showToast("Guest Access Failed", data.error || "Unable to start guest session.", true);
        }
    } catch (err) {
        showToast("Error", "Failed to start guest session.", true);
    }
}

async function handleSignOut() {
    try {
        await apiRequest("/api/auth/logout", { method: "POST" });
        updateUserUI({ logged_in: false, name: "Guest", role: "Unauthenticated" });
        lastSeenEventId = 0;
        isInitialLoad = true;
        alertUnreadCount = 0;
        const navBadge = document.getElementById("nav-alert-badge");
        if (navBadge) {
            navBadge.textContent = "0";
            navBadge.style.display = "none";
        }
        const dashFeed = document.getElementById("dashboard-activity-feed");
        if (dashFeed) dashFeed.innerHTML = `<div class="empty-state">Sign in to view activity events.</div>`;
        const fullEvents = document.getElementById("full-events-list");
        if (fullEvents) fullEvents.innerHTML = `<div class="empty-state">Sign in to inspect the activity log.</div>`;
        closeAuthModal();
        showToast("Signed Out", "Caregiver session ended.", false);
        pollStatus();
        fetchEvents();
    } catch (err) {
        console.error("Sign out error:", err);
    }
}

/* ================= 5. MULTI-MODAL CAMERA VISION ================= */
function syncFlipCameraButtonLabel() {
    const flipBtn = document.getElementById("btn-flip-camera");
    if (!flipBtn) return;
    const facingLabel = preferredCameraFacing === "environment" ? "Rear" : "Front";
    flipBtn.textContent = `Flip Camera (${facingLabel})`;
}

async function flipCameraFacing() {
    preferredCameraFacing = preferredCameraFacing === "environment" ? "user" : "environment";
    syncFlipCameraButtonLabel();
    const label = preferredCameraFacing === "environment" ? "rear" : "front";
    if (webcamStream) {
        stopWebcam(true);
        await startWebcam();
    } else {
        showToast("Camera Selection", `Next start will use the ${label} camera.`, false);
    }
}

async function openCameraMediaStream() {
    const preferredConstraints = {
        video: {
            facingMode: { ideal: preferredCameraFacing },
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    };
    try {
        return await navigator.mediaDevices.getUserMedia(preferredConstraints);
    } catch (err) {
        if (err.name === "OverconstrainedError" || err.name === "NotFoundError") {
            return navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
        }
        throw err;
    }
}

async function startWebcam() {
    const errorBox = document.getElementById("camera-error-box");
    const errorText = document.getElementById("camera-error-text");
    errorBox.style.display = "none";

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        const userMsg = "This page cannot access the camera from this address. Open it on localhost or use HTTPS, then allow camera access in your browser.";
        errorText.textContent = userMsg;
        errorBox.style.display = "block";
        showToast("Camera unavailable", userMsg, true);
        return;
    }

    try {
        if (window.SmartCradleRuntime?.requestNativeCameraPermission) {
            await window.SmartCradleRuntime.requestNativeCameraPermission();
        }
        const stream = await openCameraMediaStream();

        webcamStream = stream;
        const videoEl = document.getElementById("webcam-video");
        videoEl.srcObject = stream;
        await videoEl.play();

        document.getElementById("camera-placeholder").style.display = "none";
        document.getElementById("btn-start-camera").disabled = true;
        document.getElementById("btn-stop-camera").disabled = false;
        syncFlipCameraButtonLabel();

        const pill = document.getElementById("cam-status-pill");
        pill.textContent = "[CAMERA STREAMING]";
        pill.className = "status-chip live";

        document.getElementById("cam-live-indicator").className = "live-status-dot on";

        cameraStartTime = Date.now();
        const visionRun = ++cameraVisionRun;
        previousMotionFrame = null;
        motionFrameStreak = 0;
        frameCount = 0;
        lastFpsTime = Date.now();

        if (visionIntervalId) clearInterval(visionIntervalId);
        visionIntervalId = setInterval(processVisionFrame, 125);
        setBabyVisionStatus("Loading on-device face and pose models…");
        initializeBabyVision().then(() => {
            if (visionRun !== cameraVisionRun || !webcamStream) return;
            setBabyVisionStatus("On-device analysis ready");
        }).catch(err => {
            if (visionRun !== cameraVisionRun || !webcamStream) return;
            console.warn("Face/pose model could not load:", err);
            setBabyVisionStatus("Analysis unavailable · check internet, then restart camera");
            updateBabyInsight("unknown", "Face analysis unavailable", "Body position: unavailable");
        });

        await apiRequest("/api/webcam/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: true })
        });

        showToast("Camera Connected", "Live video & computer vision pipeline active.", false);

    } catch (err) {
        console.error("Camera access error:", err);
        let userMsg = "Unable to access camera.";

        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            userMsg = "Camera access denied. Please allow camera permission for SmartCradle in your browser or Android app settings.";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            userMsg = "No camera hardware detected on this device.";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            userMsg = "Camera is currently busy or in use by another application.";
        } else if (err.name === "SecurityError" || err.name === "TypeError") {
            userMsg = "Camera access requires a secure context (localhost, HTTPS, or installed mobile app).";
        }

        errorText.textContent = userMsg;
        errorBox.style.display = "block";

        apiRequest("/api/webcam/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: false, error: userMsg })
        }).catch(() => {});

        showToast("Camera Error", userMsg, true);
    }
}

function stopWebcam(silent = false) {
    cameraVisionRun++;
    if (visionIntervalId) {
        clearInterval(visionIntervalId);
        visionIntervalId = null;
    }

    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }

    const videoEl = document.getElementById("webcam-video");
    videoEl.srcObject = null;

    document.getElementById("camera-placeholder").style.display = "flex";
    document.getElementById("btn-start-camera").disabled = false;
    document.getElementById("btn-stop-camera").disabled = true;

    const pill = document.getElementById("cam-status-pill");
    pill.textContent = "[CAMERA DISCONNECTED]";
    pill.className = "status-chip offline";

    document.getElementById("cam-live-indicator").className = "live-status-dot off";
    document.getElementById("camera-error-box").style.display = "none";
    document.getElementById("hud-fps").textContent = "FPS: 0";
    clearBabyAnalysis();

    updateMotionUI(false, 0.0);

    apiRequest("/api/webcam/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false })
    }).catch(() => {});

    if (!silent) {
        showToast("Camera Stopped", "Video stream disconnected.", false);
    }
}

function setVisionMode(mode) {
    currentVisionMode = mode;

    document.querySelectorAll(".vision-dock-btn").forEach(btn => btn.classList.remove("active"));
    if (mode === "normal") document.getElementById("btn-vis-normal").classList.add("active");
    if (mode === "thermal") document.getElementById("btn-vis-thermal").classList.add("active");
    if (mode === "wet_scanner") document.getElementById("btn-vis-wet").classList.add("active");

    const tag = document.getElementById("cam-mode-tag");
    tag.textContent = `MODE: ${mode.replace("_", " ").toUpperCase()}`;

    document.getElementById("hud-crosshair").style.display = (mode === "thermal") ? "flex" : "none";
    document.getElementById("hud-thermal-spot").style.display = (mode === "thermal") ? "inline" : "none";
    document.getElementById("hud-wetness-box").style.display = (mode === "wet_scanner") ? "flex" : "none";

    fetch("/api/camera/vision_mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
    });
}

function processVisionFrame() {
    const videoEl = document.getElementById("webcam-video");
    const motionCanvas = document.getElementById("motion-canvas");
    const visionCanvas = document.getElementById("vision-canvas");

    if (!videoEl || videoEl.readyState < 2 || !motionCanvas || !visionCanvas) return;

    frameCount++;
    const now = Date.now();
    if (now - lastFpsTime >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        document.getElementById("hud-fps").textContent = `FPS: ${currentFps}`;
    }

    // 1. Motion Differencing with Anti-Spam
    analyzeMotion(videoEl, motionCanvas, now);

    // 2. Vision Render
    renderVisionCanvas(videoEl, visionCanvas, now);

    // 3. Face landmarks, expression cues, and approximate body pose (browser only)
    analyzeBabyFrame(videoEl);
}

async function initializeBabyVision() {
    if (faceLandmarker && poseLandmarker) return;
    if (visionModelsPromise) return visionModelsPromise;

    visionModelsPromise = (async () => {
        const { FilesetResolver, FaceLandmarker, PoseLandmarker } = await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
        );
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const faceModelUrl = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
        const poseModelUrl = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
        const build = async delegate => {
            const results = await Promise.allSettled([
                FaceLandmarker.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: faceModelUrl, delegate },
                    runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true
                }),
                PoseLandmarker.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: poseModelUrl, delegate },
                    runningMode: "VIDEO", numPoses: 1
                })
            ]);
            const [face, pose] = results;
            if (face.status === "fulfilled" && pose.status === "fulfilled") {
                return [face.value, pose.value];
            }
            if (face.status === "fulfilled") face.value.close();
            if (pose.status === "fulfilled") pose.value.close();
            throw face.status === "rejected" ? face.reason : pose.reason;
        };
        try {
            [faceLandmarker, poseLandmarker] = await build("GPU");
        } catch (gpuError) {
            console.info("GPU vision unavailable; retrying on CPU.", gpuError);
            [faceLandmarker, poseLandmarker] = await build("CPU");
        }
    })();

    try {
        await visionModelsPromise;
    } catch (err) {
        visionModelsPromise = null;
        throw err;
    }
}

function analyzeBabyFrame(videoEl) {
    if (!faceLandmarker || !poseLandmarker || videoEl.readyState < 2) return;
    const now = performance.now();
    if (now - lastLandmarkRun < 350) return;
    lastLandmarkRun = now;

    try {
        const faceResult = faceLandmarker.detectForVideo(videoEl, now);
        const poseResult = poseLandmarker.detectForVideo(videoEl, now);
        drawBabyLandmarks(faceResult, poseResult);

        const face = faceResult.faceLandmarks?.[0];
        if (face) {
            const cue = stabilizeExpressionCue(classifyExpressionCue(faceResult.faceBlendshapes?.[0]?.categories || []));
            const position = estimateBodyPosition(poseResult.poseLandmarks?.[0]);
            landmarkCount = face.length;
            updateBabyInsight(cue.expression, cue.label, position);
        } else {
            landmarkCount = 0;
            expressionCueHistory = [];
            updateBabyInsight("unknown", "Face not in view", estimateBodyPosition(poseResult.poseLandmarks?.[0]));
        }
        setBabyVisionStatus(landmarkCount ? `Face landmarks · ${landmarkCount} points` : "Searching for face and body…");
    } catch (err) {
        console.warn("Live face/pose analysis frame skipped:", err);
    }
}

function classifyExpressionCue(categories) {
    const scores = Object.fromEntries(categories.map(item => [item.categoryName, item.score]));
    const smile = ((scores.mouthSmileLeft || 0) + (scores.mouthSmileRight || 0)) / 2;
    const frown = ((scores.mouthFrownLeft || 0) + (scores.mouthFrownRight || 0)) / 2;
    if (smile >= 0.42 && smile > frown + 0.12) return { expression: "happy", label: "Happy cue · smile detected" };
    if (frown >= 0.42 && frown > smile + 0.1) return { expression: "sad", label: "Sad cue · frown detected" };
    return { expression: "neutral", label: "No clear smile or frown" };
}

function stabilizeExpressionCue(cue) {
    expressionCueHistory.push(cue);
    if (expressionCueHistory.length > 5) expressionCueHistory.shift();
    if (expressionCueHistory.length < 3) return { expression: "neutral", label: "Reading expression cues…" };

    const counts = expressionCueHistory.reduce((total, item) => {
        total[item.expression] = (total[item.expression] || 0) + 1;
        return total;
    }, {});
    if ((counts.happy || 0) >= 3) return { expression: "happy", label: "Happy cue · smile detected" };
    if ((counts.sad || 0) >= 3) return { expression: "sad", label: "Sad cue · frown detected" };
    return { expression: "neutral", label: "No clear smile or frown" };
}

function estimateBodyPosition(pose) {
    if (!pose || pose.length < 25) return "Body position: not in view";
    const visible = index => (pose[index]?.visibility ?? 0) >= 0.35;
    if (![11, 12, 23, 24].every(visible)) return "Body position: partial view";
    const shoulder = { x: (pose[11].x + pose[12].x) / 2, y: (pose[11].y + pose[12].y) / 2 };
    const hip = { x: (pose[23].x + pose[24].x) / 2, y: (pose[23].y + pose[24].y) / 2 };
    const dx = hip.x - shoulder.x;
    const dy = hip.y - shoulder.y;
    const orientation = Math.abs(dx) > Math.abs(dy) * 1.25 ? "Horizontal pose estimate" : "Angled pose estimate";
    const centerX = (shoulder.x + hip.x) / 2;
    const region = centerX < 0.38 ? "left" : centerX > 0.62 ? "right" : "center";
    return `Body position: ${orientation.toLowerCase()} · ${region}`;
}

function drawBabyLandmarks(faceResult, poseResult) {
    const canvas = document.getElementById("landmark-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const poses = poseResult.poseLandmarks?.[0];
    if (poses) drawPoseSkeleton(ctx, poses, width, height);
    const face = faceResult.faceLandmarks?.[0];
    if (!face) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 184, 151, .92)";
    ctx.fillStyle = "rgba(255, 184, 151, .9)";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(20, 33, 61, .75)";
    ctx.shadowBlur = 3;
    const contours = [
        [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109],
        [33,160,158,133,153,144,145,153,133],
        [362,385,387,263,373,380,374,380,263],
        [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78,61],
        [168,6,197,195,5,4,1,19,94,2]
    ];
    contours.forEach(points => traceLandmarkPath(ctx, face, points, width, height));
    [1,4,10,152,33,263,61,291].forEach(index => {
        const point = face[index];
        if (!point) return;
        ctx.beginPath();
        ctx.arc(point.x * width, point.y * height, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function traceLandmarkPath(ctx, points, indices, width, height) {
    const first = points[indices[0]];
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(first.x * width, first.y * height);
    for (let i = 1; i < indices.length; i++) {
        const point = points[indices[i]];
        if (point) ctx.lineTo(point.x * width, point.y * height);
    }
    ctx.stroke();
}

function drawPoseSkeleton(ctx, pose, width, height) {
    const bones = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32],[15,17],[15,19],[16,18],[16,20]];
    ctx.save();
    ctx.strokeStyle = "rgba(151, 218, 232, .78)";
    ctx.fillStyle = "rgba(226, 246, 248, .9)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(20, 33, 61, .8)";
    ctx.shadowBlur = 3;
    bones.forEach(([a, b]) => {
        const p1 = pose[a], p2 = pose[b];
        if (!p1 || !p2 || (p1.visibility ?? 0) < .4 || (p2.visibility ?? 0) < .4) return;
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
    });
    pose.forEach(point => {
        if ((point.visibility ?? 0) < .55) return;
        ctx.beginPath();
        ctx.arc(point.x * width, point.y * height, 2.2, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function updateBabyInsight(expression, label, position) {
    const panel = document.getElementById("baby-insight-panel");
    if (!panel) return;
    panel.dataset.expression = expression;
    document.getElementById("baby-expression-label").textContent = label;
    document.getElementById("baby-position-label").textContent = position;
}

function setBabyVisionStatus(message) {
    const status = document.getElementById("baby-vision-status");
    if (status) status.textContent = message;
}

function clearBabyAnalysis() {
    const canvas = document.getElementById("landmark-canvas");
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    updateBabyInsight("unknown", "Waiting for face", "Body position: waiting");
    setBabyVisionStatus("Camera off");
    lastLandmarkRun = 0;
    expressionCueHistory = [];
}

function analyzeMotion(videoEl, motionCanvas, now) {
    const ctx = motionCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(videoEl, 0, 0, 160, 120);

    const imgData = ctx.getImageData(0, 0, 160, 120);
    const pixels = imgData.data;
    const totalPixels = 160 * 120;

    const currentGrayscale = new Uint8Array(totalPixels);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
        currentGrayscale[j] = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    }

    let changedPixels = 0;
    const pixelDiffThreshold = 34; // Noise gate

    if (previousMotionFrame) {
        for (let k = 0; k < totalPixels; k++) {
            if (Math.abs(currentGrayscale[k] - previousMotionFrame[k]) > pixelDiffThreshold) {
                changedPixels++;
            }
        }
    }

    previousMotionFrame = currentGrayscale;
    const motionPercentage = (changedPixels / totalPixels) * 100.0;

    const isWarmedUp = (now - cameraStartTime) > 1500;

    if (isWarmedUp && motionPercentage >= motionSensitivity) {
        motionFrameStreak++;
        // 3 consecutive frames confirmation to reject single-frame flicker
        if (motionFrameStreak >= 3) {
            motionDetectedUntil = now + 1000;

            if (now - lastMotionLoggedTime >= alertCooldownMs) {
                lastMotionLoggedTime = now;
                postMotionDetection();
            }
        }
    } else {
        motionFrameStreak = Math.max(0, motionFrameStreak - 1);
    }

    const isCurrentlyActive = (now < motionDetectedUntil);
    updateMotionUI(isCurrentlyActive, motionPercentage);
}

function renderVisionCanvas(videoEl, visionCanvas, now) {
    const ctx = visionCanvas.getContext("2d", { willReadFrequently: true });
    const width = 640;
    const height = 480;

    if (currentVisionMode === "normal") {
        ctx.drawImage(videoEl, 0, 0, width, height);
        return;
    }

    ctx.drawImage(videoEl, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height);
    const d = frame.data;

    if (currentVisionMode === "thermal") {
        let centerLuminanceSum = 0;
        let centerSampleCount = 0;
        const centerX = width / 2;
        const centerY = height / 2;

        for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            const px = (i / 4) % width;
            const py = Math.floor((i / 4) / width);
            if (Math.abs(px - centerX) < 26 && Math.abs(py - centerY) < 26) {
                centerLuminanceSum += lum;
                centerSampleCount++;
            }

            // Ironbow Thermal False-Color Shader
            if (lum < 64) {
                d[i] = Math.round(lum * 1.5);
                d[i + 1] = Math.round(lum * 0.2);
                d[i + 2] = Math.round(lum * 3.5);
            } else if (lum < 140) {
                const factor = (lum - 64) / 76;
                d[i] = Math.round(96 + factor * 159);
                d[i + 1] = Math.round(15 + factor * 5);
                d[i + 2] = Math.round(220 - factor * 73);
            } else if (lum < 210) {
                const factor = (lum - 140) / 70;
                d[i] = 255;
                d[i + 1] = Math.round(20 + factor * 150);
                d[i + 2] = Math.round(147 - factor * 147);
            } else {
                const factor = (lum - 210) / 45;
                d[i] = 255;
                d[i + 1] = Math.round(170 + factor * 85);
                d[i + 2] = Math.round(factor * 255);
            }
        }

        ctx.putImageData(frame, 0, 0);

        if (centerSampleCount > 0) {
            const avgLum = centerLuminanceSum / centerSampleCount;
            const estimatedTemp = (36.0 + (avgLum - 128) * 0.018).toFixed(1);
            document.getElementById("hud-thermal-spot").textContent = `SPOT TEMP: ${estimatedTemp}°C (EST)`;
        }

    } else if (currentVisionMode === "wet_scanner") {
        let wetPixelsDetected = 0;
        const scanStartY = Math.floor(height * 0.55);

        for (let i = 0; i < d.length; i += 4) {
            const px = (i / 4) % width;
            const py = Math.floor((i / 4) / width);

            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            if (py > scanStartY && lum < 70 && b > (r * 1.15)) {
                d[i] = 255;
                d[i + 1] = 20;
                d[i + 2] = 147;
                wetPixelsDetected++;
            } else {
                d[i] = Math.round(lum * 0.7);
                d[i + 1] = Math.round(lum * 0.7);
                d[i + 2] = Math.round(lum * 0.85);
            }
        }

        ctx.putImageData(frame, 0, 0);

        if (wetPixelsDetected > 450) {
            document.getElementById("hud-wetness-box").style.display = "flex";
            if (now - lastOpticalWetLoggedTime >= 15000) {
                lastOpticalWetLoggedTime = now;
                fetch("/api/camera/optical_wetness", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ detected: true })
                });
                if (!muteMotionToasts) {
                    showToast("Optical Scanner", "Bedding moisture anomaly detected via camera vision.", true);
                }
            }
        } else {
            document.getElementById("hud-wetness-box").style.display = "none";
        }
    }
}

function updateMotionUI(isDetected, motionPercent) {
    const badge = document.getElementById("motion-indicator-badge");
    const levelText = document.getElementById("motion-level-text");
    const levelBar = document.getElementById("motion-level-bar");
    const cameraMotion = document.getElementById("camera-motion-pill");

    if (isDetected) {
        badge.textContent = "[MOTION DETECTED]";
        badge.className = "motion-state-pill motion-detected";
        if (cameraMotion) {
            cameraMotion.textContent = "MOTION DETECTED";
            cameraMotion.className = "camera-motion-pill active";
        }
    } else {
        badge.textContent = "[NO MOTION]";
        badge.className = "motion-state-pill no-motion";
        if (cameraMotion) {
            cameraMotion.textContent = "NO MOTION";
            cameraMotion.className = "camera-motion-pill off";
        }
    }

    const clamped = Math.min(100.0, motionPercent).toFixed(1);
    levelText.textContent = `${clamped}%`;
    levelBar.style.width = `${Math.min(100, clamped * 2)}%`;
}

async function postMotionDetection() {
    try {
        await fetch("/api/motion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ detected: true })
        });
        if (!muteMotionToasts) {
            showToast("Camera Vision", "Visual motion detected in room camera.", false);
        }
        fetchEvents();
    } catch (e) {
        console.error("Failed to post motion event:", e);
    }
}

function applyMotionPreset(value) {
    document.querySelectorAll(".preset-pill").forEach(btn => btn.classList.remove("active"));
    if (value === 14) document.getElementById("preset-btn-balanced")?.classList.add("active");

    updateMotionSensitivity(value);
    document.getElementById("motion-sensitivity").value = value;
}

function updateMotionSensitivity(val) {
    motionSensitivity = parseFloat(val);
    document.getElementById("motion-sensitivity-val").textContent = `${val}%`;
}

function updateAlertCooldown(seconds) {
    alertCooldownMs = parseInt(seconds, 10) * 1000;
    document.getElementById("cooldown-val").textContent = `${seconds}s`;
}

function toggleMuteToasts(isMuted) {
    muteMotionToasts = isMuted;
    showToast("Notifications", isMuted ? "Motion toasts muted (recorded in log only)." : "Motion toasts unmuted.", false);
}

function updateHudClock() {
    const hudTime = document.getElementById("hud-time");
    if (hudTime) {
        const now = new Date();
        hudTime.textContent = now.toTimeString().split(" ")[0];
    }
}

/* ================= 6. SIMULATED SENSOR CONTROLS ================= */
async function toggleSensorCry() {
    const nextState = !currentStatus.cry_detected;
    try {
        const res = await fetch("/api/sensor/cry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: nextState })
        });
        const data = await res.json();
        updateUIState(data);
        fetchEvents();
    } catch (e) {
        console.error("Failed to toggle cry sensor:", e);
    }
}

async function toggleSensorMovement() {
    const nextState = !currentStatus.baby_movement;
    try {
        const res = await fetch("/api/sensor/movement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: nextState })
        });
        const data = await res.json();
        updateUIState(data);
        fetchEvents();
    } catch (e) {
        console.error("Failed to toggle movement sensor:", e);
    }
}

async function toggleSensorWetness() {
    const nextState = !currentStatus.wetness_detected;
    try {
        const res = await fetch("/api/sensor/wetness", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: nextState })
        });
        const data = await res.json();
        updateUIState(data);
        fetchEvents();
    } catch (e) {
        console.error("Failed to toggle wetness sensor:", e);
    }
}

function updateTemperatureSlider(val) {
    document.getElementById("temp-number").value = parseFloat(val).toFixed(1);
    sendTemperatureUpdate(val, document.getElementById("thresh-number").value);
}

function updateTemperatureInput(val) {
    let numeric = parseFloat(val);
    if (isNaN(numeric)) numeric = 27.0;
    numeric = Math.max(10.0, Math.min(45.0, numeric));
    document.getElementById("temp-slider").value = numeric;
    sendTemperatureUpdate(numeric, document.getElementById("thresh-number").value);
}

function updateThresholdInput(val) {
    let numeric = parseFloat(val);
    if (isNaN(numeric)) numeric = 32.0;
    numeric = Math.max(15.0, Math.min(45.0, numeric));
    sendTemperatureUpdate(document.getElementById("temp-slider").value, numeric);
}

let tempDebounceTimer = null;
function sendTemperatureUpdate(temp, thresh) {
    if (tempDebounceTimer) clearTimeout(tempDebounceTimer);
    tempDebounceTimer = setTimeout(async () => {
        try {
            const res = await fetch("/api/sensor/temperature", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    temperature: parseFloat(temp),
                    threshold: parseFloat(thresh)
                })
            });
            const data = await res.json();
            updateUIState(data);
            fetchEvents();
        } catch (e) {
            console.error("Failed to update temperature:", e);
        }
    }, 200);
}

/* ================= 7. CRADLE MOTOR CONTROLS ================= */
async function setMotorMode(mode) {
    try {
        const res = await fetch("/api/motor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: mode })
        });
        const data = await res.json();
        updateUIState(data);
        fetchEvents();
    } catch (e) {
        console.error("Failed to set motor mode:", e);
    }
}

async function setMotorManual(state) {
    try {
        const res = await fetch("/api/motor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: state })
        });
        const data = await res.json();
        updateUIState(data);
        fetchEvents();
    } catch (e) {
        console.error("Failed to set manual motor state:", e);
    }
}

function quickToggleMotor() {
    const motor = currentStatus.cradle_motor || {};
    const nextState = motor.state === "on" ? "off" : "on";
    setMotorManual(nextState);
}

/* ================= 8. STATUS POLLING & UI SYNC ================= */
async function pollStatus() {
    try {
        const res = await fetch("/api/status");
        if (res.ok) {
            setConnectionState("connected");
            const data = await res.json();
            updateUIState(data);
        } else if (res.status === 401) {
            setConnectionState("auth-required");
        } else {
            setConnectionState("disconnected");
        }
    } catch (e) {
        setConnectionState("disconnected");
        console.error("Status polling failed:", e);
    }
}

function setConnectionState(status) {
    const banner = document.getElementById("connection-banner");
    const label = document.getElementById("connection-banner-text");
    if (!banner || !label) return;
    banner.className = `connection-banner ${status}`;
    if (status === "connected") label.textContent = "Connected to shared demo server · updates are live";
    else if (status === "auth-required") label.textContent = "Sign in to view the shared demo status and activity";
    else label.textContent = "Connection lost · trying to reconnect to the demo server";
}

function updateUIState(state) {
    if (!state) return;
    currentStatus = state;

    // 1. Cradle Motor
    const motor = state.cradle_motor || { mode: "auto", state: "off" };
    const isMotorOn = (motor.state === "on");
    const isAuto = (motor.mode === "auto");

    // Dashboard Hero Widget
    const dashMotorState = document.getElementById("dash-motor-state");
    const dashMotorSub = document.getElementById("dash-motor-sub");
    const dashPowerBtn = document.getElementById("dash-motor-power-btn");

    dashMotorState.textContent = isMotorOn ? "Motor Running" : "Motor Stopped";
    dashMotorSub.textContent = `${motor.mode.toUpperCase()} Mode • ${isMotorOn ? "Gentle rocking active" : "Activates on infant cry"}`;

    if (isMotorOn) {
        dashPowerBtn.classList.add("active");
    } else {
        dashPowerBtn.classList.remove("active");
    }

    // Motor View Tabs & Banner
    const btnAuto = document.getElementById("btn-mode-auto");
    const btnManual = document.getElementById("btn-mode-manual");
    if (isAuto) {
        btnAuto.classList.add("active");
        btnManual.classList.remove("active");
    } else {
        btnAuto.classList.remove("active");
        btnManual.classList.add("active");
    }

    const motorBanner = document.getElementById("motor-status-banner");
    motorBanner.textContent = isMotorOn ? "[MOTOR RUNNING]" : "[MOTOR STOPPED]";
    motorBanner.className = `motor-state-text ${isMotorOn ? "running" : "stopped"}`;

    // Cradle Rig Swinging Animation
    const cradleRig = document.getElementById("cradle-rig");
    const cradleText = document.getElementById("cradle-visual-text");
    if (isMotorOn) {
        cradleRig.classList.add("swinging");
        cradleText.textContent = "Cradle is rocking smoothly (servo active)";
        cradleText.style.color = "var(--hot-pink)";
    } else {
        cradleRig.classList.remove("swinging");
        cradleText.textContent = "Cradle is stationary";
        cradleText.style.color = "var(--text-muted)";
    }

    // 2. Cry Sensor
    const isCry = state.cry_detected;
    document.getElementById("dash-cry-val").textContent = isCry ? "Crying!" : "Quiet";
    document.getElementById("dash-cry-tag").textContent = isCry ? "[CRY ALERT]" : "[NORMAL]";
    document.getElementById("dash-cry-tag").className = `quad-status ${isCry ? "alert" : ""}`;

    updatePill("sensor-cry-badge", isCry, "[CRYING DETECTED]", "[QUIET]", "alert");
    const btnCry = document.getElementById("btn-toggle-cry");
    btnCry.textContent = isCry ? "Simulate Baby Quiet" : "Simulate Baby Crying";
    btnCry.className = `btn w-100 ${isCry ? "btn-pink" : "btn-pink-outline"}`;

    // 3. Baby Movement
    const isMove = state.baby_movement;
    document.getElementById("dash-move-val").textContent = isMove ? "Active" : "Still";
    document.getElementById("dash-move-tag").textContent = isMove ? "[RESTLESS]" : "[SLEEPING]";
    document.getElementById("dash-move-tag").className = `quad-status ${isMove ? "alert" : ""}`;

    updatePill("sensor-movement-badge", isMove, "[MOVEMENT DETECTED]", "[STILL]", "warning");
    const btnMove = document.getElementById("btn-toggle-movement");
    btnMove.textContent = isMove ? "Simulate Stillness" : "Simulate Infant Movement";
    btnMove.className = `btn w-100 ${isMove ? "btn-pink" : "btn-pink-outline"}`;

    // 4. Temperature
    const temp = state.temperature !== undefined ? state.temperature : 27.0;
    const isTempWarn = state.temp_warning;

    document.getElementById("dash-temp-val").textContent = `${temp.toFixed(1)}°C`;
    document.getElementById("dash-temp-tag").textContent = isTempWarn ? "[DEMO ALERT]" : "[DEMO VALUE]";
    document.getElementById("dash-temp-tag").className = `quad-status ${isTempWarn ? "alert" : ""}`;

    const sensorTempBadge = document.getElementById("sensor-temp-badge");
    sensorTempBadge.textContent = isTempWarn ? `[HIGH TEMP WARNING: ${temp.toFixed(1)}°C]` : `[NORMAL: ${temp.toFixed(1)}°C]`;
    sensorTempBadge.className = `sensor-pill ${isTempWarn ? "warning" : "normal"}`;

    // 5. Wetness & Buzzer
    const isWet = state.wetness_detected;
    document.getElementById("dash-wet-val").textContent = isWet ? "Damp / Wet" : "Clean & Dry";
    document.getElementById("dash-wet-tag").textContent = isWet ? "[DEMO ALERT]" : "[DEMO DRY]";
    document.getElementById("dash-wet-tag").className = `quad-status ${isWet ? "alert" : ""}`;

    updatePill("sensor-wetness-badge", isWet, "[WET BEDDING]", "[DRY]", "alert");
    const btnWet = document.getElementById("btn-toggle-wetness");
    btnWet.textContent = isWet ? "Simulate Bedding Dry" : "Simulate Wet Bedding";
    btnWet.className = `btn ${isWet ? "btn-pink" : "btn-pink-outline"}`;

    const isBuzzer = (state.buzzer === "ACTIVE");
    updatePill("sensor-buzzer-badge", isBuzzer, "[ACTIVE ALARM]", "[INACTIVE]", "alert");

    // Overall System Status Pill in Menubar
    const sysText = document.getElementById("system-status-text");
    if (isCry || isWet || isTempWarn) {
        sysText.textContent = "DEMO ALERT";
        document.getElementById("system-status-pill").style.borderColor = "var(--hot-pink)";
    } else {
        sysText.textContent = "MONITORING";
        document.getElementById("system-status-pill").style.borderColor = "var(--hot-pink-border)";
    }

    // 7. Update Sleep Telemetry, Preferences, and Profile
    if (state.sleep) updateSleepUI(state.sleep);
    if (state.settings) updateSettingsUI(state.settings);
    if (state.baby) updateBabyUI(state.baby);
}

function updatePill(elemId, isActive, onText, offText, activeClass = "alert") {
    const el = document.getElementById(elemId);
    if (!el) return;
    el.textContent = isActive ? onText : offText;
    el.className = `sensor-pill ${isActive ? activeClass : "off"}`;
}

/* ================= 9. ALERTS & TIMELINE ACTIVITY ================= */
async function fetchEvents() {
    try {
        const res = await fetch("/api/events");
        if (!res.ok) return;

        const events = await res.json();
        renderEventsLog(activeFilter === "all" ? events : events.filter(evt => evt.category === activeFilter));
        renderMiniEventsFeed(events);

        // Check for new incoming alerts to pop a toast
        if (events.length > 0 && !isInitialLoad) {
            const unseen = events.filter(evt => evt.id > lastSeenEventId).sort((a, b) => a.id - b.id);
            for (const newest of unseen) {
                alertUnreadCount++;
                const badge = document.getElementById("alert-counter-badge");
                if (badge) {
                    badge.textContent = alertUnreadCount;
                    badge.style.display = "inline-block";
                }

                if (newest.category === "alerts" || (newest.category === "motion" && !muteMotionToasts)) {
                    showToast(newest.title, newest.message, newest.category === "alerts");
                }
                if (newest.category === "alerts") notifyParentDevice(newest);
                if (newest.category === "alerts") showParentAlert(newest);
            }
            lastSeenEventId = Math.max(lastSeenEventId, events[0].id);
        }

        if (events.length > 0 && isInitialLoad) {
            lastSeenEventId = events[0].id;
            isInitialLoad = false;
        }

    } catch (e) {
        console.error("Failed to fetch events:", e);
    }
}

function syncNotificationButton() {
    const button = document.getElementById("notification-toggle");
    if (button && "Notification" in window && Notification.permission === "granted" &&
        localStorage.getItem("smartcradle-device-alerts") === "on") {
        button.textContent = "Device alerts enabled";
    }
}

function showParentAlert(evt) {
    const banner = document.getElementById("parent-alert-banner");
    if (!banner) return;
    document.getElementById("parent-alert-title").textContent = evt.title || "New demo alert";
    document.getElementById("parent-alert-message").textContent = evt.message || "A demo event needs attention.";
    banner.hidden = false;
}

function dismissParentAlert() {
    const banner = document.getElementById("parent-alert-banner");
    if (banner) banner.hidden = true;
}

async function enableParentNotifications() {
    const button = document.getElementById("notification-toggle");
    if (!("Notification" in window)) {
        showToast("Device alerts unavailable", "This browser does not support system notifications.", true);
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        localStorage.setItem("smartcradle-device-alerts", "on");
        if (button) button.textContent = "Device alerts enabled";
        showToast("Device alerts enabled", "This device can show alerts while the Parent View is open.", false);
    } else {
        localStorage.removeItem("smartcradle-device-alerts");
        if (button) button.textContent = "Enable device alerts";
    }
}

function notifyParentDevice(evt) {
    if (localStorage.getItem("smartcradle-device-alerts") !== "on" || !("Notification" in window)) return;
    if (Notification.permission !== "granted" || document.visibilityState === "visible") return;
    new Notification(`SmartCradle: ${evt.title}`, { body: evt.message, tag: `smartcradle-${evt.id}` });
}

function renderEventsLog(events) {
    const container = document.getElementById("events-log-container");
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state">No events recorded in this category.</div>';
        return;
    }

    container.replaceChildren(...events.map(evt => makeEventRow(evt)));
}

function makeEventRow(evt) {
    const row = document.createElement("div");
    row.className = `timeline-item ${evt.category === "alerts" ? "alert-highlight" : ""}`;
    const time = document.createElement("span");
    time.className = "timeline-time";
    time.textContent = evt.timestamp || "";
    const badge = document.createElement("span");
    badge.className = `badge ${evt.is_simulated ? "badge-sim" : "badge-real"}`;
    badge.textContent = evt.source || "";
    const message = document.createElement("span");
    message.className = "timeline-msg";
    message.textContent = evt.message || "";
    row.append(time, badge, message);
    return row;
}

function renderMiniEventsFeed(events) {
    const mini = document.getElementById("dash-recent-events");
    if (!mini) return;

    if (!events || events.length === 0) {
        mini.innerHTML = '<div class="empty-state">No recent activity.</div>';
        return;
    }

    const top3 = events.slice(0, 3);
    mini.replaceChildren(...top3.map(evt => makeEventRow(evt)));
}

function setEventFilter(category) {
    activeFilter = category;
    document.querySelectorAll(".filter-pill").forEach(chip => {
        if (chip.dataset.filter === category) {
            chip.classList.add("active");
        } else {
            chip.classList.remove("active");
        }
    });
    fetchEvents();
}

async function clearEventHistory() {
    if (!confirm("Are you sure you want to clear all event history?")) {
        return;
    }

    try {
        await fetch("/api/events/clear", { method: "POST" });
        fetchEvents();
        showToast("History Cleared", "All event activity records removed.", false);
    } catch (e) {
        console.error("Failed to clear events:", e);
    }
}

/* ================= 10. TOAST STACK ================= */
function showToast(title, message, isAlert = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";

    const body = document.createElement("div");
    body.className = "toast-body";
    const heading = document.createElement("div");
    heading.className = "toast-title";
    heading.textContent = title;
    const detail = document.createElement("div");
    detail.className = "toast-msg";
    detail.textContent = message;
    body.append(heading, detail);
    const close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", () => toast.remove());
    toast.append(body, close);

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(24px)";
            toast.style.transition = "all 0.22s ease";
            setTimeout(() => toast.remove(), 250);
        }
    }, 4000);
}

/* ================= 11. SYSTEM RESET ================= */
async function resetSystem() {
    if (!confirm("Reset all simulated cradle sensors and motor to default values?")) {
        return;
    }

    try {
        const res = await fetch("/api/reset", { method: "POST" });
        const data = await res.json();
        updateUIState(data);

        document.getElementById("temp-slider").value = 27.0;
        document.getElementById("temp-number").value = "27.0";
        document.getElementById("thresh-number").value = "32.0";

        setVisionMode("normal");
        fetchEvents();
        showToast("System Reset", "All cradle parameters restored to defaults.", false);
    } catch (e) {
        console.error("Failed to reset system:", e);
    }
}

/* ================= 12. SLEEP & HEALTH ANALYTICS ENGINE ================= */
function tickSleepTimer() {
    if (currentSleepState && currentSleepState.is_sleeping) {
        currentSleepState.current_session_seconds = (currentSleepState.current_session_seconds || 0) + 1;
        const el = document.getElementById("sleep-session-timer");
        if (el) {
            el.textContent = formatTimerSeconds(currentSleepState.current_session_seconds);
        }
    }
}

function formatTimerSeconds(totalSecs) {
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
}

function updateSleepUI(sleep) {
    if (!sleep) return;
    currentSleepState = sleep;

    const scoreNum = document.getElementById("sleep-score-num");
    if (scoreNum) scoreNum.textContent = `${sleep.sleep_score}%`;

    const heroStatus = document.getElementById("sleep-hero-status");
    if (heroStatus) heroStatus.textContent = sleep.sleep_status;

    const timer = document.getElementById("sleep-session-timer");
    if (timer) timer.textContent = formatTimerSeconds(sleep.current_session_seconds || 0);

    const totalHours = document.getElementById("sleep-total-hours");
    if (totalHours) {
        const h = Math.floor((sleep.total_sleep_today_seconds || 0) / 3600);
        const m = Math.floor(((sleep.total_sleep_today_seconds || 0) % 3600) / 60);
        totalHours.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
    }

    const resp = document.getElementById("sleep-respiration-bpm");
    if (resp) resp.textContent = sleep.respiration_rate || 34;

    const awake = document.getElementById("sleep-awakenings-count");
    if (awake) awake.textContent = sleep.night_awakenings || 2;

    const soothe = document.getElementById("sleep-soothe-rate");
    if (soothe) soothe.textContent = `${sleep.soothing_success_rate || 88}%`;
}


/* ================= 13. CRADLE AUTOMATION & PROFILE PREFERENCES ================= */
function updateSettingsUI(settings) {
    if (!settings) return;

    // 1. Rocking Speed Segmented Controls
    ["gentle", "moderate", "calming"].forEach(spd => {
        const btn = document.getElementById(`btn-speed-${spd}`);
        if (btn) {
            if (settings.rocking_speed === spd) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        }
    });

    // 2. Audio Lullaby Chips
    ["brahms", "white_noise", "rain", "ocean", "off"].forEach(snd => {
        const chip = document.getElementById(`btn-sound-${snd}`);
        if (chip) {
            if (settings.lullaby_sound === snd) {
                chip.classList.add("active");
            } else {
                chip.classList.remove("active");
            }
        }
    });

    // 3. Ambient Nightlight Color Swatches
    const swatchMap = {
        "pink_glow": "swatch-pink",
        "warm_amber": "swatch-amber",
        "soft_white": "swatch-white",
        "off": "swatch-off"
    };
    Object.keys(swatchMap).forEach(key => {
        const sw = document.getElementById(swatchMap[key]);
        if (sw) {
            if (settings.nightlight === key) {
                sw.classList.add("active");
            } else {
                sw.classList.remove("active");
            }
        }
    });

    // 4. Nightlight Brightness Slider & Value Label
    const bText = document.getElementById("nightlight-bright-text");
    if (bText && settings.nightlight_brightness !== undefined) {
        bText.textContent = `${settings.nightlight_brightness}%`;
    }
    const slider = document.getElementById("nightlight-slider");
    if (slider && settings.nightlight_brightness !== undefined && document.activeElement !== slider) {
        slider.value = settings.nightlight_brightness;
    }
}

function updateBabyUI(baby) {
    if (!baby) return;

    const parentChild = document.getElementById("parent-child-name");
    if (parentChild) parentChild.textContent = baby.name || "your child";

    const nameEl = document.getElementById("profile-name-text");
    if (nameEl) nameEl.textContent = baby.name;

    const ageEl = document.getElementById("profile-age-text");
    if (ageEl) ageEl.textContent = `${baby.age} • Born July 12, 2026`;

    const weightEl = document.getElementById("profile-weight-text");
    if (weightEl) weightEl.textContent = `${baby.weight_kg} kg`;

    const pedEl = document.getElementById("profile-pediatrician-text");
    if (pedEl) pedEl.textContent = baby.pediatrician;

    const cardPed = document.getElementById("card-pediatrician-name");
    if (cardPed) cardPed.textContent = baby.pediatrician;
}

async function updateRockingSpeed(speed) {
    try {
        const res = await fetch("/api/settings/cradle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rocking_speed: speed })
        });
        if (res.ok) {
            const data = await res.json();
            updateSettingsUI(data);
            showToast("Rocking Speed", `Motor speed calibrated to ${speed.toUpperCase()}`, false);
        }
    } catch (e) {
        console.error("Failed to update rocking speed:", e);
    }
}

async function updateLullabySound(sound) {
    try {
        const res = await fetch("/api/settings/cradle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lullaby_sound: sound })
        });
        if (res.ok) {
            const data = await res.json();
            updateSettingsUI(data);
            const soundNames = {
                brahms: "Brahms Lullaby",
                white_noise: "White Noise",
                rain: "Gentle Rain",
                ocean: "Ocean Waves",
                off: "Audio Muted"
            };
            showToast("Audio Soothing", `Playing: ${soundNames[sound] || sound}`, false);
        }
    } catch (e) {
        console.error("Failed to update lullaby sound:", e);
    }
}

async function updateNightlightColor(color) {
    try {
        const res = await fetch("/api/settings/cradle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nightlight: color })
        });
        if (res.ok) {
            const data = await res.json();
            updateSettingsUI(data);
            const colorNames = {
                pink_glow: "Coral Glow",
                warm_amber: "Warm Amber",
                soft_white: "Soft White",
                off: "Nightlight Off"
            };
            showToast("Ambient Nightlight", `Illumination set to ${colorNames[color] || color}`, false);
        }
    } catch (e) {
        console.error("Failed to update nightlight color:", e);
    }
}

function updateNightlightBrightness(val) {
    const text = document.getElementById("nightlight-bright-text");
    if (text) text.textContent = `${val}%`;

    if (nightlightDebounce) clearTimeout(nightlightDebounce);
    nightlightDebounce = setTimeout(async () => {
        try {
            await fetch("/api/settings/cradle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nightlight_brightness: parseInt(val) })
            });
        } catch (e) {
            console.error("Failed to update nightlight brightness:", e);
        }
    }, 200);
}

function simulateDoctorCall() {
    showToast("Pediatric Emergency Call", "Calling Dr. Elena Rostova (+1 555-234-5678)... [SIMULATED]", true);
}
