package com.velotrainer.vanrysel

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class TrainerData(
    val powerWatts: Int = 0,
    val cadenceRpm: Int = 0,
    val speedKmh: Double = 0.0,
    val distanceMeters: Int = 0
)

class FtmsManager(private val context: Context) {

    companion object {
        private const val TAG = "FtmsManager"
        private const val SCAN_TIMEOUT_MS = 20_000L

        // UUIDs standards Bluetooth SIG FTMS
        val UUID_FTMS_SERVICE: UUID = UUID.fromString("00001826-0000-1000-8000-00805f9b34fb")
        val UUID_INDOOR_BIKE_DATA: UUID = UUID.fromString("00002ad2-0000-1000-8000-00805f9b34fb")
        val UUID_CONTROL_POINT: UUID = UUID.fromString("00002ad9-0000-1000-8000-00805f9b34fb")
        val UUID_CLIENT_CONFIG: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private var bluetoothGatt: BluetoothGatt? = null
    private var controlPointChar: BluetoothGattCharacteristic? = null
    private var activeScanner: android.bluetooth.le.BluetoothLeScanner? = null
    private var activeScanCallback: ScanCallback? = null
    private var scanTimeout: Runnable? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    var isConnected: Boolean = false
        private set

    var onDataReceived: ((TrainerData) -> Unit)? = null
    var onConnectionStateChanged: ((Boolean, String?) -> Unit)? = null
    var onStatusChanged: ((String) -> Unit)? = null

    @SuppressLint("MissingPermission")
    fun startScanAndConnect() {
        if (activeScanCallback != null || bluetoothGatt != null) return

        val adapter = bluetoothAdapter
        if (adapter == null) {
            onStatusChanged?.invoke("Cette TV ne dispose pas du Bluetooth.")
            return
        }
        if (!adapter.isEnabled) {
            onStatusChanged?.invoke("Activez le Bluetooth dans les réglages de la TV.")
            return
        }

        val scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            onStatusChanged?.invoke("Le scan Bluetooth est indisponible sur cette TV.")
            return
        }

        Log.d(TAG, "Démarrage du scan Bluetooth LE...")
        onStatusChanged?.invoke("Recherche du Van Rysel D100…")

        val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val deviceName = result.scanRecord?.deviceName ?: result.device.name ?: ""
                Log.d(TAG, "Périphérique trouvé : $deviceName [${result.device.address}]")
                val advertisesFtms = result.scanRecord?.serviceUuids
                    ?.any { it.uuid == UUID_FTMS_SERVICE } == true

                if (advertisesFtms ||
                    deviceName.contains("D100", ignoreCase = true) ||
                    deviceName.contains("Van Rysel", ignoreCase = true) ||
                    deviceName.contains("Trainer", ignoreCase = true)
                ) {
                    stopScan()
                    onStatusChanged?.invoke("Home trainer détecté, connexion…")
                    connectToDevice(result.device)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                if (activeScanCallback !== this) return
                clearScan()
                onStatusChanged?.invoke("Échec du scan Bluetooth (code $errorCode). Réessayez.")
            }
        }

        activeScanner = scanner
        activeScanCallback = scanCallback
        try {
            scanner.startScan(scanCallback)
            val timeout = Runnable {
                if (activeScanCallback === scanCallback) {
                    stopScan()
                    onStatusChanged?.invoke(
                        "Aucun home trainer trouvé. Allumez-le et déconnectez-le des autres applications."
                    )
                }
            }
            scanTimeout = timeout
            mainHandler.postDelayed(timeout, SCAN_TIMEOUT_MS)
        } catch (error: SecurityException) {
            clearScan()
            onStatusChanged?.invoke("Autorisez les appareils à proximité pour utiliser le Bluetooth.")
        } catch (error: IllegalStateException) {
            clearScan()
            onStatusChanged?.invoke("Le Bluetooth est indisponible. Vérifiez les réglages de la TV.")
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        val callback = activeScanCallback ?: return
        try {
            activeScanner?.stopScan(callback)
        } catch (error: SecurityException) {
            onStatusChanged?.invoke("L'autorisation Bluetooth a été retirée.")
        }
        clearScan()
    }

    private fun clearScan() {
        scanTimeout?.let(mainHandler::removeCallbacks)
        scanTimeout = null
        activeScanCallback = null
        activeScanner = null
    }

    @SuppressLint("MissingPermission")
    private fun connectToDevice(device: BluetoothDevice) {
        Log.d(TAG, "Connexion à ${device.name ?: device.address}...")
        try {
            bluetoothGatt = device.connectGatt(context, false, gattCallback)
            if (bluetoothGatt == null) {
                onStatusChanged?.invoke("Impossible d'ouvrir la connexion Bluetooth. Réessayez.")
            }
        } catch (error: SecurityException) {
            onStatusChanged?.invoke("Autorisez les appareils à proximité pour utiliser le Bluetooth.")
        }
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        stopScan()
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        controlPointChar = null
        isConnected = false
        onConnectionStateChanged?.invoke(false, null)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                onStatusChanged?.invoke("Connexion Bluetooth interrompue (code $status).")
                gatt.close()
                bluetoothGatt = null
                controlPointChar = null
                isConnected = false
                onConnectionStateChanged?.invoke(false, gatt.device.name)
            } else if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.d(TAG, "GATT Connecté ! Découverte des services...")
                onStatusChanged?.invoke("Bluetooth connecté, recherche du service FTMS…")
                gatt.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "GATT Déconnecté.")
                gatt.close()
                bluetoothGatt = null
                controlPointChar = null
                isConnected = false
                onConnectionStateChanged?.invoke(false, gatt.device.name)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(UUID_FTMS_SERVICE)
                if (service == null) {
                    onStatusChanged?.invoke("Appareil détecté, mais le service FTMS est absent.")
                    gatt.disconnect()
                    return
                }

                val dataChar = service.getCharacteristic(UUID_INDOOR_BIKE_DATA)
                var descriptorWriteStarted = false
                if (dataChar != null) {
                    gatt.setCharacteristicNotification(dataChar, true)
                    val descriptor = dataChar.getDescriptor(UUID_CLIENT_CONFIG)
                    if (descriptor != null) {
                        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        descriptorWriteStarted = gatt.writeDescriptor(descriptor)
                    }
                }

                controlPointChar = service.getCharacteristic(UUID_CONTROL_POINT)
                if (!descriptorWriteStarted) requestControl()

                isConnected = true
                onStatusChanged?.invoke("Home trainer connecté.")
                onConnectionStateChanged?.invoke(true, gatt.device.name ?: "Van Rysel D100")
            } else {
                onStatusChanged?.invoke("Impossible de lire les services FTMS (code $status).")
                gatt.disconnect()
            }
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int
        ) {
            if (descriptor.uuid != UUID_CLIENT_CONFIG) return
            if (status == BluetoothGatt.GATT_SUCCESS) {
                requestControl()
            } else {
                onStatusChanged?.invoke("Notifications FTMS indisponibles (code $status).")
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == UUID_INDOOR_BIKE_DATA) {
                parseIndoorBikeData(characteristic.value)
            }
        }
    }

    // Demande de contrôle du frein électromagnétique
    @SuppressLint("MissingPermission")
    fun requestControl() {
        val cp = controlPointChar ?: return
        val gatt = bluetoothGatt ?: return
        cp.value = byteArrayOf(0x00) // OpCode 0x00: Request Control
        gatt.writeCharacteristic(cp)
    }

    // Mode ERG : Définir la puissance cible en Watts (Opcode 0x05)
    @SuppressLint("MissingPermission")
    fun setTargetPower(watts: Int) {
        val cp = controlPointChar ?: return
        val gatt = bluetoothGatt ?: return
        val safeWatts = max(0, min(600, watts)) // Limite physique Van Rysel D100 : 600W

        val buffer = ByteBuffer.allocate(3).order(ByteOrder.LITTLE_ENDIAN)
        buffer.put(0x05.toByte())
        buffer.putShort(safeWatts.toShort())

        cp.value = buffer.array()
        gatt.writeCharacteristic(cp)
    }

    // Mode Simulation de Pente : Pente de 0% à +6.0% (Opcode 0x11)
    @SuppressLint("MissingPermission")
    fun setSimulationIncline(gradePercent: Double) {
        val cp = controlPointChar ?: return
        val gatt = bluetoothGatt ?: return
        val clampedGrade = max(-10.0, min(6.0, gradePercent))
        val gradeUnits = (clampedGrade * 100).roundToInt().toShort()

        val buffer = ByteBuffer.allocate(7).order(ByteOrder.LITTLE_ENDIAN)
        buffer.put(0x11.toByte())
        buffer.putShort(0.toShort()) // Vitesse du vent
        buffer.putShort(gradeUnits)  // Pente en 0.01%
        buffer.put(0x33.toByte())    // Crr
        buffer.put(0x33.toByte())    // Cw

        cp.value = buffer.array()
        gatt.writeCharacteristic(cp)
    }

    // Décodage des octets de la trame FTMS Indoor Bike Data
    private fun parseIndoorBikeData(bytes: ByteArray) {
        if (bytes.size < 4) return
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

        val flags = buffer.short.toInt() and 0xFFFF
        var speedKmh = 0.0
        var cadenceRpm = 0
        var powerWatts = 0

        // Bit 0 = 0 -> Vitesse présente (0.01 km/h)
        val moreData = (flags and 0x0001) != 0
        if (!moreData && buffer.remaining() >= 2) {
            speedKmh = (buffer.short.toInt() and 0xFFFF) * 0.01
        }

        // Bit 1 -> Vitesse moyenne
        if ((flags and 0x0002) != 0 && buffer.remaining() >= 2) {
            buffer.short
        }

        // Bit 2 -> Cadence instantanée (0.5 RPM)
        if ((flags and 0x0004) != 0 && buffer.remaining() >= 2) {
            cadenceRpm = ((buffer.short.toInt() and 0xFFFF) * 0.5).roundToInt()
        }

        // Bit 3 -> Cadence moyenne
        if ((flags and 0x0008) != 0 && buffer.remaining() >= 2) {
            buffer.short
        }

        // Bit 4 -> Distance totale (3 octets)
        if ((flags and 0x0010) != 0 && buffer.remaining() >= 3) {
            buffer.get()
            buffer.get()
            buffer.get()
        }

        // Bit 5 -> Resistance
        if ((flags and 0x0020) != 0 && buffer.remaining() >= 2) {
            buffer.short
        }

        // Bit 6 -> Puissance instantanée (sint16 en Watts)
        if ((flags and 0x0040) != 0 && buffer.remaining() >= 2) {
            powerWatts = max(0, buffer.short.toInt())
        }

        val data = TrainerData(
            powerWatts = powerWatts,
            cadenceRpm = cadenceRpm,
            speedKmh = speedKmh
        )

        onDataReceived?.invoke(data)
    }
}
