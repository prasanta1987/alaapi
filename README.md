# Live Vocal Class Studio (WebRTC + Firebase)

High-fidelity WebRTC audio/video studio built for singing and vocal coaching sessions, configured with raw musical audio dynamics (disabling echo cancellation, noise suppression, and auto gain control).

---

## 📁 Project Structure

The project has been refactored into a modular, maintainable multi-file architecture:

```text
alaapi/
├── .firebaserc                     # Firebase active project configuration
├── firebase.json                   # Firebase Hosting configuration & rewrites
├── README.md                       # Documentation & setup instructions
└── public/                         # Public static assets served by Firebase Hosting
    ├── index.html                  # Main application HTML structure
    ├── css/
    │   └── style.css               # Extracted custom styles & scrollbar design
    └── js/
        ├── firebase-config.js      # Firebase app initialization, auth, and credentials
        ├── webrtc.js               # WebRTC peer connection, ICE handling & STUN config
        ├── media.js                # Microphone/camera stream, wake lock & hardware switching
        ├── ui.js                   # DOM elements, view transitions & user feedback
        └── app.js                  # Main controller orchestrating app lifecycle & signaling
```

---

## ⚙️ Configuration

### Firebase Credentials
Open [`public/js/firebase-config.js`](public/js/firebase-config.js). 

If you're not using dynamic injected configuration, replace the configuration with your credentials from the [Firebase Console](https://console.firebase.google.com/) (**Project Settings** > **General** > **Your Apps** > **Web app**):

```javascript
export const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "alaapi.firebaseapp.com",
    projectId: "alaapi",
    storageBucket: "alaapi.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

---

## 🚀 Running the Project

### Option 1: Firebase CLI
Serve locally with the Firebase emulator:
```bash
firebase serve
```
Or deploy directly to Firebase Hosting:
```bash
firebase deploy --only hosting
```

### Option 2: Any Local Static Server
Since modern ES modules (`type="module"`) are used, you can serve the `public/` directory with any static server:
```bash
# Using Node's npx serve
npx serve public

# Using Python
python -m http.server -d public 8000
```
Then visit `http://localhost:8000` or `http://localhost:5000` in your browser.

---

## 🎵 Features
- **High-Fidelity Raw Audio**: Configured with `echoCancellation: false`, `noiseSuppression: false`, and `autoGainControl: false` at 48kHz stereo for pure musical timbre. *(Headphones recommended)*
- **Screen Wake Lock**: Prevents phone or computer screens from sleeping during active lessons.
- **Hardware Device Selector**: Live switching of camera, microphone, and audio output (speakers).
- **Responsive P2P Overlay View**: Optimized for desktop and mobile portrait/landscape orientations.

