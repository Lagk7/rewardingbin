/*
 * ===================================================================================
 *  PROJECT: ECO BIN — Eco Rewarding Smart Bin
 *  DEVICE ID: ECOBIN-001
 *  HARDWARE: Arduino Uno + HX711 Load Cell Amplifier (5kg / 10kg / 20kg bar)
 * ===================================================================================
 *
 *  WIRING INSTRUCTIONS:
 *  ---------------------------------------------------------------------------------
 *  HX711 Module          Arduino Uno
 *  ---------------------------------------------------------------------------------
 *  VCC                   5V
 *  GND                   GND
 *  DT (Data Out)         Digital Pin 3
 *  SCK (Clock)           Digital Pin 2
 *  ---------------------------------------------------------------------------------
 *  Load Cell 4-Wires:
 *  Red    -> E+ (Excitation +)
 *  Black  -> E- (Excitation -)
 *  White  -> A- (Signal -)
 *  Green  -> A+ (Signal +)
 *  ---------------------------------------------------------------------------------
 *
 *  REQUIRED LIBRARY:
 *  Install "HX711 Arduino Library" by Bogdan Necula via Arduino IDE:
 *  Sketch -> Include Library -> Manage Libraries -> Search "HX711" -> Install
 *
 *  HOW IT WORKS:
 *  1. On power-on, the scale automatically tares (zeros out empty weight).
 *  2. Continually reads weight in grams.
 *  3. Formats telemetry as JSON:
 *     {"deviceId":"ECOBIN-001","weight":185.4,"unit":"g","stable":true}
 *  4. Python bridge script (bridge/arduino_bridge.py) reads this over USB Serial
 *     and posts it live to the Eco Bin website.
 *  5. Points (10g = 1 point) are automatically calculated and awarded to the logged-in user!
 * ===================================================================================
 */

#include "HX711.h"

// Pin Definitions
const int LOADCELL_DOUT_PIN = 3;
const int LOADCELL_SCK_PIN = 2;
const int TARE_BUTTON_PIN = 4; // Optional physical push-button to tare (Pin 4 to GND with INPUT_PULLUP)

// Device Identification
const char* DEVICE_ID = "ECOBIN-001";

// Calibration factor
// Adjust this factor to calibrate your specific load cell!
// Common starting values for standard 5kg load cells: ~420.0 to ~450.0
// If 100g reads as 50g, divide calibration_factor by 2.
// If 100g reads as 200g, multiply calibration_factor by 2.
float calibration_factor = 420.0;

HX711 scale;

// Stability detection variables
float lastReadings[5] = {0, 0, 0, 0, 0};
int readingIndex = 0;
const int NUM_READINGS = 5;

void setup() {
  // Start Serial communication at 9600 baud
  Serial.begin(9600);
  while (!Serial) {
    ; // Wait for serial port to connect (needed for native USB)
  }

  // Setup Tare Button
  pinMode(TARE_BUTTON_PIN, INPUT_PULLUP);

  // Initialize HX711
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);

  // Send startup status
  Serial.println("{\"status\":\"initializing\",\"deviceId\":\"ECOBIN-001\"}");

  // Wait for HX711 to stabilize
  delay(1000);

  if (scale.is_ready()) {
    scale.set_scale(calibration_factor);
    scale.tare(); // Zero the scale on startup
    Serial.println("{\"status\":\"ready\",\"deviceId\":\"ECOBIN-001\",\"msg\":\"Tare complete\"}");
  } else {
    Serial.println("{\"status\":\"error\",\"deviceId\":\"ECOBIN-001\",\"msg\":\"HX711 not found! Check wiring.\"}");
  }
}

void loop() {
  // Check if tare button is pressed or serial command 't' is sent
  if (digitalRead(TARE_BUTTON_PIN) == LOW || (Serial.available() > 0 && Serial.read() == 't')) {
    scale.tare();
    Serial.println("{\"status\":\"tared\",\"deviceId\":\"ECOBIN-001\",\"weight\":0.0}");
    delay(500);
  }

  if (scale.is_ready()) {
    // Read average of 3 raw readings for hardware noise reduction
    float weight = scale.get_units(3);

    // Filter tiny negative noise close to zero
    if (weight < 0.5 && weight > -2.0) {
      weight = 0.0;
    }

    // Round to 1 decimal place
    weight = round(weight * 10.0) / 10.0;

    // Track stability
    lastReadings[readingIndex] = weight;
    readingIndex = (readingIndex + 1) % NUM_READINGS;

    // Check if stable (all recent readings within 3 grams of each other)
    float minVal = lastReadings[0];
    float maxVal = lastReadings[0];
    float sum = 0;
    for (int i = 0; i < NUM_READINGS; i++) {
      if (lastReadings[i] < minVal) minVal = lastReadings[i];
      if (lastReadings[i] > maxVal) maxVal = lastReadings[i];
      sum += lastReadings[i];
    }
    float avgWeight = round((sum / NUM_READINGS) * 10.0) / 10.0;
    bool isStable = (maxVal - minVal) <= 3.0 && weight > 5.0;

    // Send JSON telemetry line over Serial
    Serial.print("{\"deviceId\":\"");
    Serial.print(DEVICE_ID);
    Serial.print("\",\"weight\":");
    Serial.print(weight, 1);
    Serial.print(",\"averageWeight\":");
    Serial.print(avgWeight, 1);
    Serial.print(",\"stable\":");
    Serial.print(isStable ? "true" : "false");
    Serial.println("}");
  } else {
    Serial.println("{\"status\":\"waiting\",\"deviceId\":\"ECOBIN-001\"}");
  }

  // Sample delay (approx 3 to 4 readings per second)
  delay(300);
}
