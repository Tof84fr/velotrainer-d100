package com.velotrainer.vanrysel

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.UUID

enum class ClickButton { PLUS, MINUS }

/**
 * Télécommande Zwift Click (boutons + / −) fournie avec le D100 Zwift Edition.
 * Protocole Zwift : service 0x0001, notifications sur 0x0002, poignée de main « RideOn » sur 0x0003.
 */
class ZwiftClickManager(private val context: Context) {

    companion object {
        private const val TAG = "ZwiftClick"
        private const val SCAN_WINDOW_MS = 25_000L
        private const val SCAN_PAUSE_MS = 8_000L
        private const val ZWIFT_MANUFACTURER_ID = 0x094A

        val UUID_SERVICE: UUID = UUID.fromString("00000001-19ca-4651-86e5-fa29dcdd09d1")
        val UUID_ASYNC: UUID = UUID.fromString("00000002-19ca-4651-86e5-fa29dcdd09d1")
        val UUID_SYNC_RX: UUID = UUID.fromString("00000003-19ca-4651-86e5-fa29dcdd09d1")
        val UUID_SYNC_TX: UUID = UUID.fromString("00000004-19ca-4651-86e5-fa29dcdd09d1")
        val UUID_CLIENT_CONFIG: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private val RIDE_ON = "RideOn".toByteArray(Charsets.US_ASCII)

        // Types de messages Zwift
        private const val MSG_CLICK = 0x37
        private const val MSG_RIDE = 0x23

        // Boutons Zwift Ride / Click v2 (bit à 0 = appuyé)
        private const val RIDE_SHIFT_UP_LEFT = 0x200
        private const val RIDE_SHIFT_DOWN_LEFT = 0x400
        private const val RIDE_SHIFT_UP_RIGHT = 0x2000
        private const val RIDE_SHIFT_DOWN_RIGHT = 0x4000
    }

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private val mainHandler = Handler(Looper.getMainLooper())
    private var gatt: BluetoothGatt? = null
    private var scanCallback: ScanCallback? = null
    private var wanted = false
    private val pendingDescriptors = ArrayDeque<BluetoothGattDescriptor>()
    private var plusPressed = false
    private var minusPressed = false

    var isConnected: Boolean = false
        private set

    var onButtonChanged: ((ClickButton, Boolean) -> Unit)? = null
    var onStatusChanged: ((String, Boolean) -> Unit)? = null

    /** Recherche le Zwift Click en boucle jusqu'à la connexion ou l'appel de [stop]. */
    fun start() {
        wanted = true
        if (gatt == null && scanCallback == null) startScan()
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        wanted = false
        mainHandler.removeCallbacksAndMessages(null)
        stopScan()
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        if (isConnected) {
            isConnected = false
            onStatusChanged?.invoke("Zwift Click déconnecté", false)
        }
        releaseAll()
    }

    @SuppressLint("MissingPermission")
    private fun startScan() {
        val scanner = bluetoothAdapter?.takeIf { it.isEnabled }?.bluetoothLeScanner ?: return
        onStatusChanged?.invoke("Recherche du Zwift Click… appuyez sur un bouton pour le réveiller", false)
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                if (scanCallback !== this || !isZwiftClick(result)) return
                Log.d(TAG, "Zwift Click trouvé : ${result.device.address}")
                stopScan()
                connect(result.device)
            }

            override fun onScanFailed(errorCode: Int) {
                if (scanCallback !== this) return
                scanCallback = null
                scheduleRescan()
            }
        }
        scanCallback = callback
        try {
            scanner.startScan(callback)
            mainHandler.postDelayed({
                if (scanCallback === callback) {
                    stopScan()
                    scheduleRescan()
                }
            }, SCAN_WINDOW_MS)
        } catch (error: SecurityException) {
            scanCallback = null
        } catch (error: IllegalStateException) {
            scanCallback = null
        }
    }

    private fun isZwiftClick(result: ScanResult): Boolean {
        val name = result.scanRecord?.deviceName ?: ""
        if (name.contains("Click", ignoreCase = true)) return true
        val data = result.scanRecord?.getManufacturerSpecificData(ZWIFT_MANUFACTURER_ID) ?: return false
        // Premier octet = type d'appareil Zwift : 9 = Click, 10/11 = Click v2
        return data.isNotEmpty() && (data[0].toInt() and 0xFF) in 9..11
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        val callback = scanCallback ?: return
        scanCallback = null
        try {
            bluetoothAdapter?.bluetoothLeScanner?.stopScan(callback)
        } catch (error: SecurityException) {
            Log.w(TAG, "Arrêt du scan impossible", error)
        } catch (error: IllegalStateException) {
            Log.w(TAG, "Arrêt du scan impossible", error)
        }
    }

    private fun scheduleRescan() {
        if (!wanted) return
        mainHandler.postDelayed({ if (wanted && gatt == null && scanCallback == null) startScan() }, SCAN_PAUSE_MS)
    }

    @SuppressLint("MissingPermission")
    private fun connect(device: BluetoothDevice) {
        onStatusChanged?.invoke("Zwift Click détecté, connexion…", false)
        try {
            gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } catch (error: SecurityException) {
            gatt = null
        }
        if (gatt == null) scheduleRescan()
    }

    private fun releaseAll() {
        if (plusPressed) onButtonChanged?.invoke(ClickButton.PLUS, false)
        if (minusPressed) onButtonChanged?.invoke(ClickButton.MINUS, false)
        plusPressed = false
        minusPressed = false
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                g.discoverServices()
                return
            }
            g.close()
            mainHandler.post {
                if (gatt === g) gatt = null
                val wasConnected = isConnected
                isConnected = false
                releaseAll()
                if (wasConnected) onStatusChanged?.invoke("Zwift Click déconnecté", false)
                scheduleRescan()
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val service = g.getService(UUID_SERVICE)
            if (status != BluetoothGatt.GATT_SUCCESS || service == null) {
                Log.w(TAG, "Service Zwift absent (statut $status)")
                g.disconnect()
                return
            }
            pendingDescriptors.clear()
            listOf(UUID_ASYNC, UUID_SYNC_TX).forEach { uuid ->
                val characteristic = service.getCharacteristic(uuid) ?: return@forEach
                g.setCharacteristicNotification(characteristic, true)
                val descriptor = characteristic.getDescriptor(UUID_CLIENT_CONFIG) ?: return@forEach
                val indicate = characteristic.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0
                descriptor.value = if (indicate) BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                else BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                pendingDescriptors.addLast(descriptor)
            }
            writeNextDescriptorOrHandshake(g)
        }

        override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            writeNextDescriptorOrHandshake(g)
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            val value = characteristic.value ?: return
            if (characteristic.uuid == UUID_ASYNC) parseMessage(value)
        }
    }

    @SuppressLint("MissingPermission")
    private fun writeNextDescriptorOrHandshake(g: BluetoothGatt) {
        val next = pendingDescriptors.removeFirstOrNull()
        if (next != null) {
            if (!g.writeDescriptor(next)) writeNextDescriptorOrHandshake(g)
            return
        }
        // Poignée de main non chiffrée : le Click envoie ensuite l'état des boutons en clair
        val rx = g.getService(UUID_SERVICE)?.getCharacteristic(UUID_SYNC_RX)
        if (rx != null) {
            rx.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            rx.value = RIDE_ON
            g.writeCharacteristic(rx)
        }
        mainHandler.post {
            isConnected = true
            onStatusChanged?.invoke("Zwift Click connecté", true)
        }
    }

    private fun parseMessage(bytes: ByteArray) {
        if (bytes.isEmpty()) return
        when (bytes[0].toInt() and 0xFF) {
            MSG_CLICK -> {
                // ClickKeyPadStatus : champ 1 = bouton +, champ 2 = bouton − (0 = appuyé)
                val fields = parseVarintFields(bytes, 1)
                fields[1]?.let { updateButton(ClickButton.PLUS, it == 0L) }
                fields[2]?.let { updateButton(ClickButton.MINUS, it == 0L) }
            }
            MSG_RIDE -> {
                val bitmap = parseVarintFields(bytes, 1)[1] ?: return
                val up = (bitmap and (RIDE_SHIFT_UP_LEFT or RIDE_SHIFT_UP_RIGHT).toLong()) !=
                    (RIDE_SHIFT_UP_LEFT or RIDE_SHIFT_UP_RIGHT).toLong()
                val down = (bitmap and (RIDE_SHIFT_DOWN_LEFT or RIDE_SHIFT_DOWN_RIGHT).toLong()) !=
                    (RIDE_SHIFT_DOWN_LEFT or RIDE_SHIFT_DOWN_RIGHT).toLong()
                updateButton(ClickButton.PLUS, up)
                updateButton(ClickButton.MINUS, down)
            }
        }
    }

    private fun updateButton(button: ClickButton, pressed: Boolean) {
        val previous = if (button == ClickButton.PLUS) plusPressed else minusPressed
        if (previous == pressed) return
        if (button == ClickButton.PLUS) plusPressed = pressed else minusPressed = pressed
        mainHandler.post { onButtonChanged?.invoke(button, pressed) }
    }

    // Décodage minimal protobuf : champs varint de premier niveau
    private fun parseVarintFields(bytes: ByteArray, start: Int): Map<Int, Long> {
        val fields = HashMap<Int, Long>()
        var i = start
        fun readVarint(): Long? {
            var result = 0L
            var shift = 0
            while (i < bytes.size && shift < 64) {
                val b = bytes[i++].toInt() and 0xFF
                result = result or ((b and 0x7F).toLong() shl shift)
                if (b and 0x80 == 0) return result
                shift += 7
            }
            return null
        }
        while (i < bytes.size) {
            val key = readVarint() ?: break
            val field = (key shr 3).toInt()
            when ((key and 0x7).toInt()) {
                0 -> fields[field] = readVarint() ?: break
                2 -> {
                    val len = readVarint() ?: break
                    i += len.toInt()
                }
                else -> break
            }
        }
        return fields
    }
}
