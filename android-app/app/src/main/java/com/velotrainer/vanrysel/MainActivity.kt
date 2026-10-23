package com.velotrainer.vanrysel

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var ftmsManager: FtmsManager
    private val virtualGears = VirtualGearSystem()

    // Vues
    private lateinit var tvWatts: TextView
    private lateinit var tvWattsAvg: TextView
    private lateinit var tvCadence: TextView
    private lateinit var tvCadenceAvg: TextView
    private lateinit var tvSpeed: TextView
    private lateinit var tvDistance: TextView
    private lateinit var tvTimer: TextView
    private lateinit var tvBluetoothStatus: TextView
    private lateinit var tvControlTitle: TextView
    private lateinit var tvControlVal: TextView
    private lateinit var tvControlSub: TextView

    private lateinit var btnOpen3D: Button
    private lateinit var web3DView: WebView
    private lateinit var btnConnectTrainer: Button
    private lateinit var btnModeGear: Button
    private lateinit var btnModeErg: Button
    private lateinit var btnModeSim: Button
    private lateinit var btnUp: Button
    private lateinit var btnDown: Button
    private lateinit var btnPlayPause: Button
    private lateinit var btnReset: Button

    // État
    private var currentMode = "gear" // "gear", "erg", "sim"
    private var targetWatts = 150
    private var targetGrade = 0.0
    private var isSessionRunning = false
    private var elapsedSeconds = 0
    private var distanceMeters = 0.0
    private var totalWattsAccumulator = 0L
    private var totalSecondsAccumulator = 0L
    private var webPageLoaded = false

    private val timerHandler = Handler(Looper.getMainLooper())
    private val timerRunnable = object : Runnable {
        override fun run() {
            if (isSessionRunning) {
                elapsedSeconds++
                updateTimerDisplay()
                timerHandler.postDelayed(this, 1000)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupListeners()

        ftmsManager = FtmsManager(this)
        setupFtmsCallbacks()

        updateControlDisplay()
    }

    private fun initViews() {
        tvWatts = findViewById(R.id.tvWatts)
        tvWattsAvg = findViewById(R.id.tvWattsAvg)
        tvCadence = findViewById(R.id.tvCadence)
        tvCadenceAvg = findViewById(R.id.tvCadenceAvg)
        tvSpeed = findViewById(R.id.tvSpeed)
        tvDistance = findViewById(R.id.tvDistance)
        tvTimer = findViewById(R.id.tvTimer)
        tvBluetoothStatus = findViewById(R.id.tvBluetoothStatus)
        tvControlTitle = findViewById(R.id.tvControlTitle)
        tvControlVal = findViewById(R.id.tvControlVal)
        tvControlSub = findViewById(R.id.tvControlSub)

        btnOpen3D = findViewById(R.id.btnOpen3D)
        web3DView = findViewById(R.id.web3DView)
        btnConnectTrainer = findViewById(R.id.btnConnectTrainer)
        btnModeGear = findViewById(R.id.btnModeGear)
        btnModeErg = findViewById(R.id.btnModeErg)
        btnModeSim = findViewById(R.id.btnModeSim)
        btnUp = findViewById(R.id.btnUp)
        btnDown = findViewById(R.id.btnDown)
        btnPlayPause = findViewById(R.id.btnPlayPause)
        btnReset = findViewById(R.id.btnReset)

        // Configuration WebView pour le monde 3D (accélération matérielle)
        web3DView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
        }
        web3DView.addJavascriptInterface(AndroidTrainerBridge(), "AndroidTrainerBridge")
        web3DView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                webPageLoaded = true
                if (web3DView.visibility == View.VISIBLE) {
                    focusWebCourseButton()
                    syncWebGearDisplay()
                    syncWebSessionState()
                }
            }
        }
        web3DView.loadUrl("file:///android_asset/web/index.html")

        btnOpen3D.post { btnOpen3D.requestFocus() }
    }

    private fun setupListeners() {
        btnOpen3D.setOnClickListener {
            if (web3DView.visibility == View.VISIBLE) {
                hide3DView()
            } else {
                show3DView()
            }
        }

        btnConnectTrainer.setOnClickListener {
            if (ftmsManager.isConnected) {
                ftmsManager.disconnect()
            } else {
                requestBluetoothPermissionsAndConnect()
            }
        }

        btnModeGear.setOnClickListener { setMode("gear") }
        btnModeErg.setOnClickListener { setMode("erg") }
        btnModeSim.setOnClickListener { setMode("sim") }

        btnUp.setOnClickListener { handleActionUp() }
        btnDown.setOnClickListener { handleActionDown() }

        btnPlayPause.setOnClickListener { togglePlayPause() }
        btnReset.setOnClickListener { resetSession() }
    }

    private fun setupFtmsCallbacks() {
        ftmsManager.onDataReceived = { data ->
            runOnUiThread {
                tvWatts.text = data.powerWatts.toString()
                tvCadence.text = data.cadenceRpm.toString()
                tvSpeed.text = String.format("%.1f", data.speedKmh)

                // Transmettre les données au monde 3D WebView si affiché
                if (web3DView.visibility == View.VISIBLE) {
                    web3DView.evaluateJavascript(
                        "if(window.app) window.app.onTrainerDataReceived({powerWatts: ${data.powerWatts}, cadenceRpm: ${data.cadenceRpm}, speedKmh: ${data.speedKmh}});",
                        null
                    )
                }

                if (isSessionRunning) {
                    distanceMeters += (data.speedKmh / 3.6)
                    val km = distanceMeters / 1000.0
                    tvDistance.text = String.format("Distance : %.2f km", km)

                    totalWattsAccumulator += data.powerWatts
                    totalSecondsAccumulator++
                    val avg = totalWattsAccumulator / totalSecondsAccumulator
                    tvWattsAvg.text = "Moyenne : $avg W"

                    // Si mode vitesses virtuelles Zwift Cog
                    if (currentMode == "gear") {
                        val target = virtualGears.computeResistance(data.cadenceRpm)
                        ftmsManager.setTargetPower(target)
                    }
                }
            }
        }

        ftmsManager.onConnectionStateChanged = { connected, deviceName ->
            runOnUiThread {
                if (connected) {
                    btnConnectTrainer.text = "Connecté: ${deviceName ?: "D100"}"
                    btnConnectTrainer.setBackgroundColor(0xFF059669.toInt())
                    tvBluetoothStatus.text = "Home trainer connecté."
                } else {
                    btnConnectTrainer.text = getString(R.string.btn_connect)
                    btnConnectTrainer.setBackgroundColor(0xFF0284C7.toInt())
                    if (tvBluetoothStatus.text == "Home trainer connecté.") {
                        tvBluetoothStatus.text = "Home trainer déconnecté."
                    }
                }
            }
        }

        ftmsManager.onStatusChanged = { status ->
            runOnUiThread {
                tvBluetoothStatus.text = status
                if (!ftmsManager.isConnected) {
                    btnConnectTrainer.text = when {
                        status.startsWith("Recherche") -> "Recherche..."
                        status.startsWith("Home trainer détecté") ||
                            status.startsWith("Bluetooth connecté") -> "Connexion..."
                        else -> getString(R.string.btn_connect)
                    }
                }
            }
        }
    }

    private fun show3DView() {
        web3DView.visibility = View.VISIBLE
        web3DView.isFocusable = true
        web3DView.isFocusableInTouchMode = true
        web3DView.requestFocus()
        if (webPageLoaded) {
            focusWebCourseButton()
            syncWebGearDisplay()
            syncWebSessionState()
        }
    }

    private fun hide3DView() {
        web3DView.visibility = View.GONE
        btnOpen3D.requestFocus()
    }

    private fun focusWebCourseButton() {
        web3DView.evaluateJavascript(
            "var button = document.getElementById('btnToggle3D'); if (button) button.focus();",
            null
        )
    }

    private fun syncWebGearDisplay() {
        if (!webPageLoaded || currentMode != "gear") return
        web3DView.evaluateJavascript(
            "if (window.app) window.app.setGearFromNative(${virtualGears.currentGear});",
            null
        )
    }

    private fun syncWebSessionState() {
        if (!webPageLoaded) return
        val isRunning = isSessionRunning
        web3DView.evaluateJavascript(
            "if (window.app) window.app.setNativeSessionRunning($isRunning);",
            null
        )
    }

    // Keep the D-pad for focus navigation; channel keys are reserved for workout controls.
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_CHANNEL_UP -> {
                handleActionUp()
                true
            }
            KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                handleActionDown()
                true
            }
            KeyEvent.KEYCODE_BACK -> {
                if (web3DView.visibility == View.VISIBLE) {
                    hide3DView()
                    true
                } else {
                    super.onKeyDown(keyCode, event)
                }
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    private fun handleActionUp() {
        when (currentMode) {
            "gear" -> {
                virtualGears.shiftUp()
                updateControlDisplay()
                syncWebGearDisplay()
            }
            "erg" -> {
                targetWatts = kotlin.math.min(600, targetWatts + 10)
                updateControlDisplay()
                ftmsManager.setTargetPower(targetWatts)
            }
            "sim" -> {
                targetGrade = kotlin.math.min(6.0, targetGrade + 0.5)
                updateControlDisplay()
                ftmsManager.setSimulationIncline(targetGrade)
            }
        }
    }

    private fun handleActionDown() {
        when (currentMode) {
            "gear" -> {
                virtualGears.shiftDown()
                updateControlDisplay()
                syncWebGearDisplay()
            }
            "erg" -> {
                targetWatts = kotlin.math.max(50, targetWatts - 10)
                updateControlDisplay()
                ftmsManager.setTargetPower(targetWatts)
            }
            "sim" -> {
                targetGrade = kotlin.math.max(-5.0, targetGrade - 0.5)
                updateControlDisplay()
                ftmsManager.setSimulationIncline(targetGrade)
            }
        }
    }

    private fun setMode(mode: String) {
        currentMode = mode
        btnModeGear.setBackgroundColor(if (mode == "gear") 0xFF1D4ED8.toInt() else 0xFF1E293B.toInt())
        btnModeErg.setBackgroundColor(if (mode == "erg") 0xFF1D4ED8.toInt() else 0xFF1E293B.toInt())
        btnModeSim.setBackgroundColor(if (mode == "sim") 0xFF1D4ED8.toInt() else 0xFF1E293B.toInt())

        updateControlDisplay()

        if (mode == "erg") ftmsManager.setTargetPower(targetWatts)
        if (mode == "sim") ftmsManager.setSimulationIncline(targetGrade)
    }

    private fun updateControlDisplay() {
        when (currentMode) {
            "gear" -> {
                tvControlTitle.text = "VITESSE VIRTUELLE (ZWIFT COG)"
                tvControlVal.text = "V ${virtualGears.currentGear}"
                tvControlSub.text = "Touches CH + / CH − : vitesses · Flèches : menus"
            }
            "erg" -> {
                tvControlTitle.text = "MODE ERG (PUISSANCE CIBLE)"
                tvControlVal.text = "$targetWatts W"
                tvControlSub.text = "Résistance asservie automatiquement"
            }
            "sim" -> {
                tvControlTitle.text = "SIMULATION PENTE (MAX +6%)"
                tvControlVal.text = String.format("%+.1f %%", targetGrade)
                tvControlSub.text = "Pente Van Rysel D100"
            }
        }
    }

    private fun togglePlayPause() {
        isSessionRunning = !isSessionRunning
        if (isSessionRunning) {
            btnPlayPause.text = getString(R.string.btn_pause)
            btnPlayPause.setBackgroundColor(0xFFF59E0B.toInt())
            timerHandler.post(timerRunnable)
        } else {
            btnPlayPause.text = getString(R.string.btn_start)
            btnPlayPause.setBackgroundColor(0xFF10B981.toInt())
            timerHandler.removeCallbacks(timerRunnable)
        }
        syncWebSessionState()
    }

    private fun resetSession() {
        isSessionRunning = false
        timerHandler.removeCallbacks(timerRunnable)
        elapsedSeconds = 0
        distanceMeters = 0.0
        totalWattsAccumulator = 0L
        totalSecondsAccumulator = 0L

        btnPlayPause.text = getString(R.string.btn_start)
        btnPlayPause.setBackgroundColor(0xFF10B981.toInt())
        updateTimerDisplay()
        tvDistance.text = "Distance : 0.00 km"
        tvWattsAvg.text = "Moyenne : 0 W"
        syncWebSessionState()
    }

    private fun updateTimerDisplay() {
        val h = elapsedSeconds / 3600
        val m = (elapsedSeconds % 3600) / 60
        val s = elapsedSeconds % 60
        tvTimer.text = String.format("%02d:%02d:%02d", h, m, s)
    }

    private fun requestBluetoothPermissionsAndConnect() {
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        val missingPermissions = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isEmpty()) {
            ftmsManager.startScanAndConnect()
        } else {
            tvBluetoothStatus.text = "Autorisez le Bluetooth pour rechercher le home trainer."
            ActivityCompat.requestPermissions(this, missingPermissions.toTypedArray(), REQUEST_BLUETOOTH_PERMISSIONS)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_BLUETOOTH_PERMISSIONS) return

        if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            ftmsManager.startScanAndConnect()
        } else {
            tvBluetoothStatus.text = "Permission Bluetooth refusée. Autorisez les appareils à proximité dans les réglages."
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        ftmsManager.disconnect()
        timerHandler.removeCallbacks(timerRunnable)
    }

    private companion object {
        const val REQUEST_BLUETOOTH_PERMISSIONS = 101
    }

    private inner class AndroidTrainerBridge {
        @JavascriptInterface
        fun toggleSession() {
            runOnUiThread { togglePlayPause() }
        }
    }
}
