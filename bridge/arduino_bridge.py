"""
=====================================================================================
 ECO BIN — Arduino Uno + HX711 Serial Bridge & Automatic Reward Dispatcher
 Device ID: ECOBIN-001
=====================================================================================

This script:
 1. Reads live serial data from Arduino Uno connected to the HX711 load cell.
 2. Sends continuous real-time weight telemetry to the website (http://localhost:5000).
 3. Smooths load cell noise and detects when an item is placed on the scale.
 4. Computes the mathematical average weight across stable reading samples.
 5. Automatically posts the deposit to the website to credit reward points
    (10 grams = 1 point) directly to the currently logged-in user!
 6. Supports interactive simulation mode (--simulate) if Arduino is not connected.
=====================================================================================
"""

import sys
import time
import json
import argparse
import random
from collections import deque

# Ensure UTF-8 stdout on Windows terminal
if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None

try:
    import requests
except ImportError:
    requests = None

# ANSI colors for nice terminal output
class Colors:
    GREEN = '\033[92m'
    CYAN = '\033[96m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

def print_banner():
    print(f"{Colors.GREEN}{Colors.BOLD}")
    print(r"""
  ______ _____ ____    ____ _____ _   _ 
 |  ____/ ____/ __ \  |  _ \_   _| \ | |
 | |__ | |   | |  | | | |_) || | |  \| |
 |  __|| |   | |  | | |  _ < | | | . ` |
 | |___| |___| |__| | | |_) || |_| |\  |
 |______\_____\____/  |____/_____|_| \_|
    🌱 Smart Eco Rewarding Bin Bridge
    """)
    print(f"{Colors.CYAN}Device ID : ECOBIN-001{Colors.RESET}")
    print(f"{Colors.CYAN}Rule      : 10 grams = 1 Eco Point{Colors.RESET}")
    print(f"{Colors.CYAN}Formula   : points = floor(average_weight / 10){Colors.RESET}")
    print("-" * 55)

def find_arduino_port():
    """Auto-detect Arduino Uno or CH340 / FTDI COM port"""
    if not serial:
        return None
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None

    # Priority to ports with Arduino or CH340 or USB Serial description
    for p in ports:
        desc = (p.description or '').lower()
        hwid = (p.hwid or '').lower()
        if 'arduino' in desc or 'ch340' in desc or 'usb serial' in desc or 'uno' in desc:
            return p.device

    # Otherwise return first available port
    return ports[0].device

def parse_serial_line(line_text):
    """
    Parse either JSON format:
      {"deviceId":"ECOBIN-001","weight":145.2,"stable":true}
    Or raw plain text format:
      145.2
      WEIGHT: 145.2
    """
    line = line_text.strip()
    if not line:
        return None

    # Try JSON
    if line.startswith('{') and line.endswith('}'):
        try:
            data = json.loads(line)
            if 'weight' in data:
                return float(data['weight'])
        except Exception:
            pass

    # Try raw numbers
    if 'weight:' in line.lower():
        parts = line.split(':')
        if len(parts) > 1:
            try:
                return float(parts[1].replace('g', '').strip())
            except ValueError:
                pass

    try:
        val = float(line.replace('g', '').strip())
        return val
    except ValueError:
        return None

def send_telemetry(api_url, device_id, weight, is_stable, readings_buffer):
    """Post live stream reading to the website for real-time scale display"""
    if not requests:
        return
    try:
        payload = {
            'deviceId': device_id,
            'weight': round(weight, 1),
            'isStable': is_stable,
            'rawReadings': list(readings_buffer)
        }
        requests.post(f"{api_url}/telemetry", json=payload, timeout=1.0)
    except Exception as e:
        # Don't crash on network hiccup
        pass

def send_final_deposit(api_url, device_id, weight, avg_weight, readings_count):
    """
    Send the stable averaged weight to the server.
    The server awards points (10g = 1 point) automatically to the logged-in user!
    """
    if not requests:
        print(f"{Colors.RED}Error: requests library not installed.{Colors.RESET}")
        return None

    points_preview = int(avg_weight // 10)
    print(f"\n{Colors.GREEN}{Colors.BOLD}>>> DEPOSIT DETECTED! <<<{Colors.RESET}")
    print(f"    Raw Weight:      {weight:.1f} g")
    print(f"    {Colors.BOLD}Average Weight:  {avg_weight:.1f} g{Colors.RESET} (from {readings_count} stable samples)")
    print(f"    {Colors.CYAN}Calculated Pts:  {points_preview} points{Colors.RESET}")
    print(f"    Transmitting to website API...")

    payload = {
        'deviceId': device_id,
        'weightGrams': round(weight, 1),
        'averageWeightGrams': round(avg_weight, 1),
        'readingsCount': readings_count,
        'source': 'arduino-hx711',
        'notes': 'HX711 Average Weight Deposit'
    }

    try:
        res = requests.post(f"{api_url}/deposit", json=payload, timeout=3.0)
        if res.status_code == 200:
            data = res.json()
            user_name = data.get('userName', 'User')
            pts = data.get('pointsAwarded', points_preview)
            print(f"{Colors.GREEN}[OK] SUCCESS! {pts} points credited to {user_name}!{Colors.RESET}")
            print(f"  User Total Points: {data.get('user', {}).get('total_points', 'N/A')}")
            print(f"  User Average Weight: {data.get('user', {}).get('average_weight_grams', 'N/A')} g\n")
            return data
        else:
            print(f"{Colors.RED}Server response {res.status_code}: {res.text}{Colors.RESET}\n")
    except Exception as e:
        print(f"{Colors.RED}Could not reach website API at {api_url}: {e}{Colors.RESET}\n")
    return None

def run_hardware_bridge(port, baud, api_url, device_id):
    """Main loop reading from physical Arduino COM port"""
    print(f"{Colors.YELLOW}Connecting to Arduino on {port} @ {baud} baud...{Colors.RESET}")
    try:
        ser = serial.Serial(port, baud, timeout=1.0)
        time.sleep(2.0) # Allow Arduino reset after serial connect
        print(f"{Colors.GREEN}Connected to Arduino Uno on {port}!{Colors.RESET}")
    except Exception as e:
        print(f"{Colors.RED}Failed to open port {port}: {e}{Colors.RESET}")
        print(f"{Colors.YELLOW}Tip: Use --simulate to run without physical hardware.{Colors.RESET}")
        return

    readings_buffer = deque(maxlen=8)
    deposit_completed = False
    last_telemetry_time = 0

    print(f"{Colors.CYAN}Listening for HX711 weight data. Place recyclable waste into the bin...{Colors.RESET}\n")

    try:
        while True:
            if ser.in_waiting > 0:
                raw_bytes = ser.readline()
                try:
                    line_str = raw_bytes.decode('utf-8', errors='ignore').strip()
                except Exception:
                    continue

                weight = parse_serial_line(line_str)
                if weight is None:
                    continue

                # Ignore small negative noise
                if weight < 1.0:
                    weight = 0.0

                readings_buffer.append(weight)

                # Check stability
                is_stable = False
                avg_weight = 0.0
                if len(readings_buffer) >= 5:
                    window = list(readings_buffer)
                    min_w = min(window)
                    max_w = max(window)
                    avg_weight = sum(window) / len(window)

                    # Stable if fluctuation within 3g and weight > 10g
                    if (max_w - min_w) <= 3.0 and avg_weight > 10.0:
                        is_stable = True

                # Send telemetry every 250ms
                now = time.time()
                if now - last_telemetry_time > 0.25:
                    send_telemetry(api_url, device_id, weight, is_stable, readings_buffer)
                    last_telemetry_time = now

                    # Console status line
                    status_tag = f"{Colors.GREEN}[STABLE]{Colors.RESET}" if is_stable else "[MEASURING]"
                    sys.stdout.write(f"\rCurrent Weight: {weight:6.1f} g | Avg: {avg_weight:6.1f} g | {status_tag}   ")
                    sys.stdout.flush()

                # Trigger automatic deposit when stable
                if is_stable and not deposit_completed and avg_weight >= 10.0:
                    send_final_deposit(api_url, device_id, weight, avg_weight, len(readings_buffer))
                    deposit_completed = True
                    # Pause briefly so user can see completion
                    time.sleep(2.0)

                # Reset deposit state when waste is removed / bin empties (weight < 5g)
                if weight < 5.0 and deposit_completed:
                    deposit_completed = False
                    readings_buffer.clear()
                    print(f"{Colors.CYAN}Bin empty / tared. Ready for next recycling deposit!{Colors.RESET}")

            time.sleep(0.05)

    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Bridge stopped by user.{Colors.RESET}")
    finally:
        ser.close()

def run_simulation_mode(api_url, device_id):
    """
    Simulation mode when Arduino is not plugged in.
    Allows testing full workflow: placing items, live jitter, stable averaging, and point awarding.
    """
    print(f"\n{Colors.YELLOW}{Colors.BOLD}*** RUNNING IN SIMULATION MODE ***{Colors.RESET}")
    print("Simulates realistic Arduino Uno + HX711 load cell readings and sends them to the website.")
    print("Options:")
    print("  1: Deposit Plastic Bottle (~120g -> 12 points)")
    print("  2: Deposit Aluminum Soda Can (~180g -> 18 points)")
    print("  3: Deposit Glass Jar (~350g -> 35 points)")
    print("  4: Deposit Cardboard Bundle (~520g -> 52 points)")
    print("  5: Enter Custom Weight in Grams")
    print("  6: Continuous Random Auto-Deposit Loop (every 8s)")
    print("  q: Quit\n")

    items = {
        '1': ("Plastic Bottle", 120.0),
        '2': ("Aluminum Soda Can", 180.0),
        '3': ("Glass Jar", 350.0),
        '4': ("Cardboard Bundle", 520.0)
    }

    def simulate_deposit(item_name, target_weight):
        print(f"\n{Colors.CYAN}Placing '{item_name}' on simulated HX711 scale (~{target_weight}g)...{Colors.RESET}")
        readings = []
        # Generate 6 realistic jittery readings simulating HX711 settling
        for i in range(6):
            jitter = (random.random() - 0.5) * 4.0 # +/- 2g noise
            current_w = round(target_weight + jitter, 1)
            readings.append(current_w)

            # Stream live telemetry to website
            send_telemetry(api_url, device_id, current_w, is_stable=(i >= 3), readings_buffer=readings)
            sys.stdout.write(f"\rReading HX711 sample {i+1}/6: {current_w:.1f} g ...")
            sys.stdout.flush()
            time.sleep(0.4)

        avg_weight = round(sum(readings) / len(readings), 1)
        print(f"\n{Colors.GREEN}Scale stabilized! Calculated average weight: {avg_weight} g{Colors.RESET}")

        # Post deposit to award points automatically
        send_final_deposit(api_url, device_id, readings[-1], avg_weight, len(readings))

        # Reset scale to 0
        time.sleep(1.5)
        send_telemetry(api_url, device_id, 0.0, False, [])

    while True:
        try:
            choice = input(f"{Colors.BOLD}Select item to recycle (1-6, q to quit): {Colors.RESET}").strip()
            if choice.lower() == 'q':
                break
            elif choice in items:
                name, w = items[choice]
                simulate_deposit(name, w)
            elif choice == '5':
                raw = input("Enter weight in grams: ").strip()
                try:
                    w = float(raw)
                    simulate_deposit("Custom Recyclable Item", w)
                except ValueError:
                    print(f"{Colors.RED}Invalid number.{Colors.RESET}")
            elif choice == '6':
                print(f"{Colors.YELLOW}Starting auto loop. Press Ctrl+C to stop.{Colors.RESET}")
                item_keys = list(items.keys())
                while True:
                    key = random.choice(item_keys)
                    name, w = items[key]
                    simulate_deposit(name, w)
                    print(f"Waiting 8 seconds before next simulated drop...")
                    time.sleep(8)
            else:
                print("Invalid option. Choose 1 to 6 or q.")
        except KeyboardInterrupt:
            print("\nStopped.")
            break

def main():
    parser = argparse.ArgumentParser(description="ECO BIN Arduino Uno + HX711 Serial Bridge")
    parser.add_argument('--port', help='Arduino COM port (e.g. COM3 or /dev/ttyUSB0)')
    parser.add_argument('--baud', type=int, default=9600, help='Serial baud rate (default: 9600)')
    parser.add_argument('--server', default='http://localhost:5000/api/bin', help='Eco Bin API base URL')
    parser.add_argument('--device', default='ECOBIN-001', help='Device ID (default: ECOBIN-001)')
    parser.add_argument('--simulate', action='store_true', help='Run interactive simulation without hardware')

    args = parser.parse_args()
    print_banner()

    if args.simulate:
        run_simulation_mode(args.server, args.device)
        return

    # Check for port
    port = args.port
    if not port:
        port = find_arduino_port()

    if not port:
        print(f"{Colors.YELLOW}No physical Arduino COM port detected.{Colors.RESET}")
        print("1. Plug in your Arduino Uno via USB, or")
        print(f"2. Switching automatically to {Colors.GREEN}Simulation Mode{Colors.RESET} to test now!")
        run_simulation_mode(args.server, args.device)
        return

    run_hardware_bridge(port, args.baud, args.server, args.device)

if __name__ == '__main__':
    main()
