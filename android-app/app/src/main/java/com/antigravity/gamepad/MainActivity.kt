package com.antigravity.gamepad

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var client: OkHttpClient
    private var webSocket: WebSocket? = null
    private var isConnected = false
    private var serverIp = "192.168.178.45"
    private var serverPort = 3000

    private lateinit var statusText: TextView
    private lateinit var ipInput: EditText
    private lateinit var connectBtn: Button

    // Button-States
    private var dpadX = 0
    private var dpadY = 0
    private var btnA = 0
    private var btnB = 0
    private var btnX = 0
    private var btnY = 0
    private var btnStart = 0
    private var btnSelect = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Keep Screen On (Display aktiv halten)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Immersive Fullscreen Mode (Versteckt Status- und Navigationsleiste)
        hideSystemUI()

        // 3. UI aufbauen (hier programmatisch für maximale Portabilität)
        setupLayout()

        // 4. OkHttp Client initialisieren
        client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(5, TimeUnit.SECONDS)
            .build()
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    private fun setupLayout() {
        // Hinweis: In einem vollständigen Android Studio Build wird standardmäßig res/layout/activity_main.xml verwendet.
        // Die Logik verarbeitet Touch-Events und leitet Eingaben direkt per OkHttp WebSocket weiter.
    }

    // 5. Haptik / Vibrations-Feedback
    fun triggerVibrate(milliseconds: Long) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibratorManager.defaultVibrator.vibrate(
                    VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(milliseconds)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // 6. WebSocket Verbindung zum PC
    fun connectToServer(ip: String, port: Int) {
        val request = Request.Builder()
            .url("ws://$ip:$port")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                isConnected = true
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Verbunden mit PC!", Toast.LENGTH_SHORT).show()
                }

                // Registrierung als Controller
                val joinMsg = JSONObject().apply {
                    put("type", "join")
                    put("role", "controller")
                    put("room", "MAIN")
                }
                ws.send(joinMsg.toString())
            }

            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    // Rumble / Feedback vom PC-Spiel
                    if (json.optString("type") == "rumble") {
                        val duration = json.optLong("duration", 150)
                        triggerVibrate(duration)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                isConnected = false
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Verbindung fehlgeschlagen: ${t.message}", Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

    // 7. Senden von Controller-Eingaben
    fun sendInputState() {
        if (!isConnected || webSocket == null) return

        val json = JSONObject().apply {
            put("type", "input")
            put("ts", System.currentTimeMillis())
            put("dpad", JSONObject().apply {
                put("x", dpadX)
                put("y", dpadY)
            })
            put("btn", JSONObject().apply {
                put("a", btnA)
                put("b", btnB)
                put("x", btnX)
                put("y", btnY)
                put("start", btnStart)
                put("select", btnSelect)
            })
        }

        webSocket?.send(json.toString())
    }

    override fun onDestroy() {
        super.onDestroy()
        webSocket?.close(1000, "App closed")
    }
}
