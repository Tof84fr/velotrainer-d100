package com.velotrainer.vanrysel

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

class VirtualGearSystem {
    var currentGear: Int = 12
    val totalGears: Int = 24

    // 24 rapports de transmission virtuels
    private val ratios = listOf(
        1.00, 1.06, 1.13, 1.21, 1.36, 1.48, 1.62, 1.79,
        2.00, 2.15, 2.33, 2.50, 2.63, 2.78, 2.94, 3.13,
        3.33, 3.57, 3.85, 4.17, 4.42, 4.55, 4.82, 5.00
    )

    private val wheelCircumference = 2.105 // 700x25c en mètres

    fun shiftUp(): Boolean {
        if (currentGear < totalGears) {
            currentGear++
            return true
        }
        return false
    }

    fun shiftDown(): Boolean {
        if (currentGear > 1) {
            currentGear--
            return true
        }
        return false
    }

    fun computeResistance(cadenceRpm: Int, riderWeightKg: Double = 75.0, slopePercent: Double = 0.0): Int {
        val ratio = ratios[currentGear - 1]
        val cadence = max(30, cadenceRpm)
        val wheelRps = (cadence / 60.0) * ratio
        val speedMps = wheelRps * wheelCircumference

        val totalMass = riderWeightKg + 9.0 // vélo 9kg
        val crr = 0.004
        val cda = 0.32
        val rho = 1.225
        val g = 9.81

        val pRolling = crr * totalMass * g * speedMps
        val pAero = 0.5 * cda * rho * speedMps.pow(3.0)
        val pSlope = totalMass * g * (slopePercent / 100.0) * speedMps

        val targetPower = (pRolling + pAero + pSlope).roundToInt()
        // Limiter aux capacités du Van Rysel D100 (40W à 600W max)
        return max(40, min(600, targetPower))
    }
}
