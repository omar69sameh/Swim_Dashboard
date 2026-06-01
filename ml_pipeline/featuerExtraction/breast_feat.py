
import sys
import json
import shutil
from pathlib import Path
import numpy as np
import pandas as pd
import tkinter as tk
from tkinter import filedialog
from scipy.signal import butter, filtfilt, find_peaks

"""
Standalone Breaststroke Stroke Analyzer v3
==========================================
Built ONLY from the FINAL 6 breaststroke reference files the user asked to use:
  - goodbreast(1).csv
  - goodbreast2(1).csv
  - goodbreast3.csv
  - badbreast1(1).csv
  - badbreast2(1).csv
  - badbreast3.csv

Sensor setup:
  - single IMU on RIGHT WRIST
  - linear accelerometer 3-axis @ 100 Hz
  - gyroscope 3-axis @ 60 Hz, stored/interpolated in 100 Hz CSV
  - ABOVE-WATER simulated breaststroke
  - one complete stroke per CSV

This version is stricter than v1/v2:
  - it does NOT use the earlier breaststroke files
  - it penalizes low-amplitude / weak pull patterns harder
  - it rewards the stronger, more structured breaststroke pattern that actually
    appears in the final labeled "good" reference set
  - it uses both prototype similarity and interpretable hard rules
"""

# ---------------------------------------------------------------------
# Embedded calibration from ONLY the final 6 files
# ---------------------------------------------------------------------
FEATURES = [
    "ang_mean", "ang_peak", "ang_cv",
    "jerk_mean", "jerk_p90",
    "dyn_peak", "dyn_p90",
    "wy_range_pull", "ang_range_pull",
    "wx_wy_pull", "wz_wy_pull",
    "pull_frac", "rec_frac",
    "pull_energy", "rec_energy",
    "num_peaks_ang", "wy_zero", "az_zero"
]

GOOD_CENTROID = {
    "ang_mean": 343.5752863443946,
    "ang_peak": 637.4430260275177,
    "ang_cv": 0.3780814008915757,
    "jerk_mean": 2945.575135385645,
    "jerk_p90": 5420.678093966358,
    "dyn_peak": 29.209474144897064,
    "dyn_p90": 21.23264381140767,
    "wy_range_pull": 498.10184172082857,
    "ang_range_pull": 424.1714404916993,
    "wx_wy_pull": 0.5921202167309193,
    "wz_wy_pull": 0.8851238860452723,
    "pull_frac": 0.2534435261707989,
    "rec_frac": 0.5082644628099173,
    "pull_energy": 347.6015306404629,
    "rec_energy": 363.81164420804587,
    "num_peaks_ang": 2.6666666666666665,
    "wy_zero": 2.3333333333333335,
    "az_zero": 4.0,
}

BAD_CENTROID = {
    "ang_mean": 172.5394204303022,
    "ang_peak": 266.9378159536561,
    "ang_cv": 0.2880056314056745,
    "jerk_mean": 923.1113041147815,
    "jerk_p90": 1705.6618025246393,
    "dyn_peak": 4.300546713111743,
    "dyn_p90": 3.2800567013506754,
    "wy_range_pull": 242.15858745840373,
    "ang_range_pull": 142.7942315881296,
    "wx_wy_pull": 0.3365408195012416,
    "wz_wy_pull": 0.585276701096717,
    "pull_frac": 0.30743801652892563,
    "rec_frac": 0.5234159779614325,
    "pull_energy": 175.78237272218503,
    "rec_energy": 175.1805782394394,
    "num_peaks_ang": 1.0,
    "wy_zero": 2.0,
    "az_zero": 1.3333333333333333,
}

FEATURE_STD = {
    "ang_mean": 87.48911936469455,
    "ang_peak": 193.69094277160463,
    "ang_cv": 0.10931233456449097,
    "jerk_mean": 1076.382964744783,
    "jerk_p90": 2056.06369201517,
    "dyn_peak": 11.689409253435976,
    "dyn_p90": 8.498847613366134,
    "wy_range_pull": 170.0427909318824,
    "ang_range_pull": 180.04625154335365,
    "wx_wy_pull": 0.22032408476311894,
    "wz_wy_pull": 0.19272557493103152,
    "pull_frac": 0.09893304229300985,
    "rec_frac": 0.014104170863034874,
    "pull_energy": 94.28191611971931,
    "rec_energy": 114.71860921006517,
    "num_peaks_ang": 0.7453559924999299,
    "wy_zero": 0.5163977794943223,
    "az_zero": 1.4907119849998598,
}

RULE_WEIGHTS = {
    "prototype_similarity": 22,
    "angular_power": 14,
    "dynamic_drive": 12,
    "pull_amplitude": 12,
    "peak_structure": 10,
    "axis_balance": 8,
    "phase_quality": 8,
    "recovery_balance": 6,
    "signal_complexity": 5,
    "duration": 3,
}
assert sum(RULE_WEIGHTS.values()) == 100


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
def lowpass(signal, cutoff_hz, fs, order=4):
    nyq = fs / 2.0
    if cutoff_hz >= nyq:
        return signal
    b, a = butter(order, cutoff_hz / nyq, btype="low")
    return filtfilt(b, a, signal)

def accel_mag(df):
    return np.sqrt(df["ax_filtered"]**2 + df["ay_filtered"]**2 + df["az_filtered"]**2)

def extract_true_gyro(df):
    wx = df["wx_filtered"].values
    wy = df["wy_filtered"].values
    wz = df["wz_filtered"].values
    changed = (np.diff(wx) != 0) | (np.diff(wy) != 0) | (np.diff(wz) != 0)
    mask = np.concatenate(([True], changed))
    return df[mask].reset_index(drop=True)

def robust_gravity_baseline(amag):
    k = max(5, int(len(amag) * 0.1))
    return float(np.mean(np.sort(amag)[:k]))

def segment_phases_breast(df):
    """
    Breaststroke above water on a right wrist is better captured by angular-speed envelope
    than by raw accel peaks. We use:
      1) early trough / quiet region = setup / glide
      2) main envelope peak = propulsive pull peak
      3) remainder = recovery/return
    """
    ang = np.sqrt(df["wx_filtered"]**2 + df["wy_filtered"]**2 + df["wz_filtered"]**2).values
    env = lowpass(ang, 6.0, 100.0)
    n = len(env)

    # stroke setup / quiet point inside first third
    catch_end = int(np.argmin(env[:max(10, n // 3)]))

    # main propulsion peak after the setup point
    search_start = max(catch_end + 5, n // 4)
    pull_end = int(np.argmax(env[search_start:])) + search_start
    if pull_end <= catch_end + 3:
        pull_end = min(n - 3, catch_end + max(8, n // 4))

    catch_end = max(3, min(catch_end, n - 10))
    pull_end = max(catch_end + 5, min(pull_end, n - 3))
    return catch_end, pull_end, env

def extract_features(df):
    required = ["time", "ax_filtered", "ay_filtered", "az_filtered",
                "wx_filtered", "wy_filtered", "wz_filtered"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df = df.sort_values("time").reset_index(drop=True)
    n = len(df)
    if n < 30:
        raise ValueError(f"Too few samples ({n}). Need at least 30.")

    duration = float(df["time"].iloc[-1] - df["time"].iloc[0])

    amag = accel_mag(df).values
    gravity = robust_gravity_baseline(amag)
    dyn = np.maximum(amag - gravity, 0.0)

    wx = df["wx_filtered"].values
    wy = df["wy_filtered"].values
    wz = df["wz_filtered"].values
    az = df["az_filtered"].values
    ang = np.sqrt(wx**2 + wy**2 + wz**2)

    catch_end, pull_end, env = segment_phases_breast(df)
    pull_slice = slice(catch_end, pull_end + 1)
    rec_slice = slice(pull_end, n)

    dfg = extract_true_gyro(df)
    if len(dfg) > 5:
        dtg = float(np.median(np.diff(dfg["time"].values)))
        fs_g = 1.0 / dtg if dtg > 0 else 60.0
        gx = lowpass(dfg["wx_filtered"].values, 12.0, fs_g)
        gy = lowpass(dfg["wy_filtered"].values, 12.0, fs_g)
        gz = lowpass(dfg["wz_filtered"].values, 12.0, fs_g)
        jerk = np.sqrt(np.gradient(gx, dtg)**2 +
                       np.gradient(gy, dtg)**2 +
                       np.gradient(gz, dtg)**2)
    else:
        jerk = np.zeros(1)

    env_peaks, _ = find_peaks(env, prominence=max(10.0, np.std(env) * 0.25), distance=8)

    feat = {}
    feat["duration"] = duration
    feat["ang_mean"] = float(np.mean(ang))
    feat["ang_peak"] = float(np.max(ang))
    feat["ang_cv"] = float(np.std(ang) / (np.mean(ang) + 1e-6))
    feat["jerk_mean"] = float(np.mean(jerk))
    feat["jerk_p90"] = float(np.percentile(jerk, 90))
    feat["dyn_peak"] = float(np.max(dyn))
    feat["dyn_p90"] = float(np.percentile(dyn, 90))
    feat["wy_range_pull"] = float(np.max(wy[pull_slice]) - np.min(wy[pull_slice]))
    feat["ang_range_pull"] = float(np.max(ang[pull_slice]) - np.min(ang[pull_slice]))
    feat["wx_wy_pull"] = float(np.mean(np.abs(wx[pull_slice])) / (np.mean(np.abs(wy[pull_slice])) + 1e-6))
    feat["wz_wy_pull"] = float(np.mean(np.abs(wz[pull_slice])) / (np.mean(np.abs(wy[pull_slice])) + 1e-6))
    feat["pull_frac"] = float((pull_end - catch_end) / n)
    feat["rec_frac"] = float((n - pull_end) / n)
    feat["pull_energy"] = float(np.mean(ang[pull_slice]))
    feat["rec_energy"] = float(np.mean(ang[rec_slice]))
    feat["num_peaks_ang"] = int(len(env_peaks))
    feat["wy_zero"] = int(np.sum(np.diff(np.signbit(lowpass(wy, 8.0, 100.0)).astype(int)) != 0))
    feat["az_zero"] = int(np.sum(np.diff(np.signbit(lowpass(az, 8.0, 100.0)).astype(int)) != 0))
    feat["gravity_est"] = gravity
    feat["samples"] = n
    feat["catch_end_idx"] = int(catch_end)
    feat["pull_end_idx"] = int(pull_end)
    return feat

def distance_to_centroid(feat, centroid):
    d2 = 0.0
    for name in FEATURES:
        std = FEATURE_STD[name] if FEATURE_STD[name] > 1e-9 else 1.0
        z = (feat[name] - centroid[name]) / std
        d2 += z * z
    return float(np.sqrt(d2))

def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))

def range_score(x, good_lo, good_hi, warn_lo=None, warn_hi=None, good=100, warn=65, bad=20):
    if good_lo <= x <= good_hi:
        return good
    if warn_lo is not None and warn_hi is not None and warn_lo <= x <= warn_hi:
        return warn
    return bad

def rule_scores(feat):
    # 1) prototype similarity
    dg = distance_to_centroid(feat, GOOD_CENTROID)
    db = distance_to_centroid(feat, BAD_CENTROID)
    proto = 100.0 * db / (dg + db + 1e-9)

    # 2) angular power: final "good" references are much more energetic than the final bad set
    if feat["ang_mean"] >= 280 and feat["ang_peak"] >= 480:
        power = 100
    elif feat["ang_mean"] >= 240 and feat["ang_peak"] >= 380:
        power = 70
    else:
        power = 20

    # 3) dynamic drive: good final set has clearly larger dynamic accel
    if feat["dyn_peak"] >= 18 and feat["dyn_p90"] >= 12:
        drive = 100
    elif feat["dyn_peak"] >= 12 and feat["dyn_p90"] >= 8:
        drive = 65
    else:
        drive = 20

    # 4) pull amplitude
    if feat["wy_range_pull"] >= 300 and feat["ang_range_pull"] >= 250:
        amplitude = 100
    elif feat["wy_range_pull"] >= 250 and feat["ang_range_pull"] >= 180:
        amplitude = 65
    else:
        amplitude = 20

    # 5) peak structure: final good set shows 2-3 envelope peaks, bad set only 1
    peaks = feat["num_peaks_ang"]
    if peaks in (2, 3):
        peak_structure = 100
    elif peaks == 4:
        peak_structure = 70
    else:
        peak_structure = 20

    # 6) axis balance: mainly use wz/wy because the final good set is clearly higher there
    ratio = feat["wz_wy_pull"]
    if 0.68 <= ratio <= 1.15:
        axis = 100
    elif 0.55 <= ratio < 0.68 or 1.15 < ratio <= 1.35:
        axis = 65
    else:
        axis = 25

    # 7) phase quality: tuned to the final six only
    pull_frac = feat["pull_frac"]
    rec_frac = feat["rec_frac"]
    phase = 100
    if not (0.15 <= pull_frac <= 0.42):
        phase -= 35
    if not (0.48 <= rec_frac <= 0.56):
        phase -= 20
    phase = clamp(phase)

    # 8) recovery balance: final good set tends to have recovery energy slightly >= pull energy
    ratio_pr = feat["pull_energy"] / (feat["rec_energy"] + 1e-6)
    if 0.75 <= ratio_pr <= 1.15:
        recovery = 100
    elif 0.60 <= ratio_pr < 0.75 or 1.15 < ratio_pr <= 1.30:
        recovery = 65
    else:
        recovery = 25

    # 9) signal complexity: later good set has more az sign changes and slightly more wy sign changes
    if feat["az_zero"] >= 3 and feat["wy_zero"] >= 2:
        complexity = 100
    elif feat["az_zero"] >= 2 and feat["wy_zero"] >= 2:
        complexity = 65
    else:
        complexity = 20

    # 10) duration
    if 0.95 <= feat["duration"] <= 1.35:
        dur = 100
    else:
        dur = 60

    scores = {
        "prototype_similarity": float(clamp(proto)),
        "angular_power": float(power),
        "dynamic_drive": float(drive),
        "pull_amplitude": float(amplitude),
        "peak_structure": float(peak_structure),
        "axis_balance": float(axis),
        "phase_quality": float(phase),
        "recovery_balance": float(recovery),
        "signal_complexity": float(complexity),
        "duration": float(dur),
    }

    # Hard bad-pattern penalties to stop obviously weak/flat bad strokes from floating upward
    bad_signs = 0
    if feat["ang_mean"] < 230: bad_signs += 1
    if feat["dyn_peak"] < 10: bad_signs += 1
    if feat["wy_range_pull"] < 260: bad_signs += 1
    if feat["ang_range_pull"] < 170: bad_signs += 1
    if feat["num_peaks_ang"] <= 1: bad_signs += 1
    if feat["az_zero"] <= 1: bad_signs += 1

    return scores, dg, db, bad_signs

def analyze(csv_path):
    df = pd.read_csv(csv_path)
    feat = extract_features(df)
    scores, dg, db, bad_signs = rule_scores(feat)

    overall = sum(scores[k] * RULE_WEIGHTS[k] for k in RULE_WEIGHTS) / 100.0

    # hard cap if many weak-pattern signs appear together
    if bad_signs >= 4:
        overall = min(overall, 42.0)
    elif bad_signs == 3:
        overall = min(overall, 55.0)

    if overall >= 75:
        verdict = "GOOD / LOW RISK"
        risk = "LOW"
    elif overall >= 60:
        verdict = "BORDERLINE / MODERATE RISK"
        risk = "MODERATE"
    elif overall >= 45:
        verdict = "BAD / MODERATE-HIGH RISK"
        risk = "MODERATE-HIGH"
    else:
        verdict = "BAD / HIGH RISK"
        risk = "HIGH"

    reasons = []
    if feat["ang_mean"] < 230:
        reasons.append("overall angular power is much lower than the final good reference set")
    if feat["dyn_peak"] < 10:
        reasons.append("dynamic acceleration is too weak for the final good breaststroke pattern")
    if feat["wy_range_pull"] < 260:
        reasons.append("pull sweep is too small / flat compared with the final good references")
    if feat["num_peaks_ang"] <= 1:
        reasons.append("envelope has only one dominant burst instead of the richer breaststroke pattern seen in the good set")
    if feat["az_zero"] <= 1:
        reasons.append("wrist orientation pattern is too simple / flat compared with the final good set")
    if feat["wz_wy_pull"] < 0.55:
        reasons.append("pull axis balance is closer to the bad reference pattern")
    if feat["rec_energy"] < feat["pull_energy"] * 0.75:
        reasons.append("recovery energy is too low relative to pull")

    if not reasons:
        reasons.append("signal structure is closer to the final good breaststroke references than the final bad set")

    return {
        "file": csv_path,
        "overall_score": round(float(overall), 1),
        "verdict": verdict,
        "risk": risk,
        "prototype_distance_good": round(float(dg), 3),
        "prototype_distance_bad": round(float(db), 3),
        "rule_scores": {k: round(float(v), 1) for k, v in scores.items()},
        "key_features": {
            "duration_s": round(feat["duration"], 3),
            "ang_mean_deg_s": round(feat["ang_mean"], 1),
            "ang_peak_deg_s": round(feat["ang_peak"], 1),
            "ang_cv": round(feat["ang_cv"], 3),
            "jerk_mean_deg_s2": round(feat["jerk_mean"], 1),
            "jerk_p90_deg_s2": round(feat["jerk_p90"], 1),
            "dyn_peak_ms2": round(feat["dyn_peak"], 2),
            "dyn_p90_ms2": round(feat["dyn_p90"], 2),
            "wy_range_pull_deg_s": round(feat["wy_range_pull"], 1),
            "ang_range_pull_deg_s": round(feat["ang_range_pull"], 1),
            "wx_wy_pull": round(feat["wx_wy_pull"], 2),
            "wz_wy_pull": round(feat["wz_wy_pull"], 2),
            "pull_phase_pct": round(feat["pull_frac"] * 100, 1),
            "recovery_phase_pct": round(feat["rec_frac"] * 100, 1),
            "pull_energy": round(feat["pull_energy"], 1),
            "recovery_energy": round(feat["rec_energy"], 1),
            "num_peaks_ang": int(feat["num_peaks_ang"]),
            "wy_zero_crossings": int(feat["wy_zero"]),
            "az_zero_crossings": int(feat["az_zero"]),
        },
        "main_reasons": reasons,
        "hard_bad_signs": int(bad_signs),
    }

def print_report(r):
    print("\n" + "=" * 74)
    print("BREASTSTROKE STROKE ANALYZER — STANDALONE ABOVE-WATER VERSION (v3)")
    print("=" * 74)
    print(f"File        : {r['file']}")
    print(f"Score       : {r['overall_score']}/100")
    print(f"Verdict     : {r['verdict']}")
    print(f"Risk        : {r['risk']}")
    print(f"Dist good   : {r['prototype_distance_good']}")
    print(f"Dist bad    : {r['prototype_distance_bad']}")
    print(f"Hard signs  : {r['hard_bad_signs']}")
    print("-" * 74)
    print("Rule scores:")
    for k, v in r["rule_scores"].items():
        print(f"  {k:22s} {v:6.1f}/100")
    print("-" * 74)
    print("Key features:")
    for k, v in r["key_features"].items():
        print(f"  {k:22s} {v}")
    print("-" * 74)
    print("Why this result:")
    for reason in r["main_reasons"]:
        print(f"  - {reason}")
    print("=" * 74 + "\n")

def process_folder_to_risk_dirs(input_folder, output_root):
    input_folder = Path(input_folder)
    output_root = Path(output_root)
    csv_files = sorted(input_folder.rglob("*.csv"))
    if not csv_files:
        raise ValueError(f"No CSV files found in: {input_folder}")

    processed = 0
    failed = 0
    for csv_file in csv_files:
        try:
            report = analyze(str(csv_file))
            risk = report["risk"]
            risk_dir = output_root / risk
            risk_dir.mkdir(parents=True, exist_ok=True)

            out_csv = risk_dir / csv_file.name
            if out_csv.exists():
                out_csv = risk_dir / f"{csv_file.stem}_{processed + 1}.csv"
            shutil.copy2(csv_file, out_csv)
            processed += 1
        except Exception:
            failed += 1

    return processed, failed

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--folder":
        input_folder = sys.argv[2]
        output_root = sys.argv[3] if len(sys.argv) >= 4 else None
    else:
        input_folder = None
        output_root = None
        csv_file = sys.argv[1] if len(sys.argv) >= 2 else None

    try:
        if input_folder is not None:
            if not output_root:
                root = tk.Tk()
                root.withdraw()
                output_root = filedialog.askdirectory(title="Select output folder for risk folders")
                root.destroy()
            if not output_root:
                print("No output folder selected.")
                sys.exit(1)

            processed, failed = process_folder_to_risk_dirs(input_folder, output_root)
            print(f"Finished. Processed: {processed}, Failed: {failed}")
        else:
            if not csv_file:
                root = tk.Tk()
                root.withdraw()
                print("Select mode:")
                print("  1) Single CSV file")
                print("  2) Folder of stroke CSV files")
                mode = input("Enter choice (1 or 2) [2]: ").strip() or "2"
                if mode == "2":
                    input_folder = filedialog.askdirectory(title="Select input folder with stroke CSV files")
                    print("Select any output folder you want for risk folders...")
                    output_root = filedialog.askdirectory(title="Select output folder for risk folders")
                    root.destroy()
                    if not input_folder or not output_root:
                        print("Input/output folder not selected.")
                        sys.exit(1)
                    processed, failed = process_folder_to_risk_dirs(input_folder, output_root)
                    print(f"Finished. Processed: {processed}, Failed: {failed}")
                    sys.exit(0)
                else:
                    csv_file = filedialog.askopenfilename(
                        title="Select CSV file",
                        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
                    )
                    root.destroy()
                    if not csv_file:
                        print("No file selected.")
                        sys.exit(1)

            report = analyze(csv_file)
            print_report(report)

            out_path = csv_file.rsplit(".", 1)[0] + "_breaststroke_report.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)
            print(f"JSON report saved to: {out_path}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR: {e}")
        sys.exit(1)
