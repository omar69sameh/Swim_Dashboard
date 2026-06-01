
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
Standalone Freestyle Stroke Analyzer
====================================
Built for:
- single IMU on RIGHT WRIST
- linear accelerometer 3-axis @ 100 Hz
- gyroscope 3-axis @ 60 Hz, stored/interpolated in 100 Hz CSV
- ABOVE-WATER freestyle simulation
- one complete freestyle stroke per CSV

Important:
This script does NOT require reference files at runtime.
The 3 good and 3 bad freestyle examples were used once to tune the
embedded prototype values / thresholds, then baked into this file.

Required columns:
    time, ax_filtered, ay_filtered, az_filtered,
    wx_filtered, wy_filtered, wz_filtered

Usage:
    python freestyle_stroke_analyzer_standalone.py your_stroke.csv
"""

# ---------------------------------------------------------------------
# Embedded calibration from the provided freestyle examples
# ---------------------------------------------------------------------
FEATURES = [
    "ang_mean", "ang_p90", "ang_peak", "jerk_mean", "jerk_p90",
    "dyn_p90", "dyn_peak", "wx_range_pull", "wy_range_pull",
    "wz_range_pull", "wz_wy_ratio_pull", "wx_wz_ratio_pull",
    "phase_catch", "phase_pull", "phase_rec",
    "wz_zero_crossings", "wy_zero_crossings",
    "ang_cv", "recovery_cv", "pull_mean_ang"
]

FEATURE_STD = {
    "ang_mean": 24.467688707208808,
    "ang_p90": 35.88574631900595,
    "ang_peak": 30.675674201154823,
    "jerk_mean": 388.81131687013925,
    "jerk_p90": 759.9322312392644,
    "dyn_p90": 3.458868558274247,
    "dyn_peak": 4.028709908126057,
    "wx_range_pull": 97.0547280405841,
    "wy_range_pull": 81.61456952168487,
    "wz_range_pull": 78.1219243073949,
    "wz_wy_ratio_pull": 0.4829992942273361,
    "wx_wz_ratio_pull": 0.43170891642384923,
    "phase_catch": 0.08886410572829215,
    "phase_pull": 0.06509268291523439,
    "phase_rec": 0.05382675389537984,
    "wz_zero_crossings": 0.74535599249993,
    "wy_zero_crossings": 1.1055415967851334,
    "ang_cv": 0.18240880316044125,
    "recovery_cv": 0.03091333412764737,
    "pull_mean_ang": 44.329511443124666,
}

GOOD_CENTROID = {
    "ang_mean": 254.69889883083727,
    "ang_p90": 379.4171121708238,
    "ang_peak": 453.00897787888636,
    "jerk_mean": 1898.3287052850653,
    "jerk_p90": 4011.1886248865303,
    "dyn_p90": 10.47894356849069,
    "dyn_peak": 12.871669995814331,
    "wx_range_pull": 286.89437880667697,
    "wy_range_pull": 171.02994456672386,
    "wz_range_pull": 181.2726478940723,
    "wz_wy_ratio_pull": 0.9202325903929317,
    "wx_wz_ratio_pull": 1.349459809100802,
    "phase_catch": 0.2376237623762376,
    "phase_pull": 0.26402640264026406,
    "phase_rec": 0.49834983498349833,
    "wz_zero_crossings": 1.6666666666666667,
    "wy_zero_crossings": 1.6666666666666667,
    "ang_cv": 0.4832958086079497,
    "recovery_cv": 0.19731386881628207,
    "pull_mean_ang": 258.6646642203795,
}

BAD_CENTROID = {
    "ang_mean": 262.4243860385497,
    "ang_p90": 428.2727918315518,
    "ang_peak": 468.48845409676375,
    "jerk_mean": 2165.755229906687,
    "jerk_p90": 4397.5808561446975,
    "dyn_p90": 9.009319262582997,
    "dyn_peak": 11.786004598951186,
    "wx_range_pull": 223.83120425553867,
    "wy_range_pull": 155.7162962107498,
    "wz_range_pull": 274.68621576842304,
    "wz_wy_ratio_pull": 1.546326947731093,
    "wx_wz_ratio_pull": 0.9457988673800012,
    "phase_catch": 0.1914191419141914,
    "phase_pull": 0.2838283828382839,
    "phase_rec": 0.5247524752475248,
    "wz_zero_crossings": 1.0,
    "wy_zero_crossings": 1.6666666666666667,
    "ang_cv": 0.5637343077678317,
    "recovery_cv": 0.20536686659407288,
    "pull_mean_ang": 253.38384227437564,
}

# Interpretable rules — more important than raw speed
RULE_WEIGHTS = {
    "smoothness": 22,
    "pull_axis_balance": 18,
    "pull_structure": 16,
    "phase_quality": 14,
    "speed_control": 8,
    "pull_amplitude": 8,
    "recovery_stability": 6,
    "dynamic_drive": 4,
    "prototype_similarity": 4,
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
    return np.sqrt(df["ax_filtered"] ** 2 + df["ay_filtered"] ** 2 + df["az_filtered"] ** 2)


def extract_true_gyro(df):
    arr = df[["wx_filtered", "wy_filtered", "wz_filtered"]].values
    changed = np.any(np.diff(arr, axis=0) != 0, axis=1)
    mask = np.concatenate(([True], changed))
    return df.loc[mask].reset_index(drop=True)


def robust_gravity_baseline(amag):
    # quietest 10% of samples
    k = max(5, int(len(amag) * 0.1))
    return float(np.mean(np.sort(amag)[:k]))


def segment_phases_freestyle(df):
    """
    Freestyle right-wrist above water:

    The stroke is typically:
      entry/catch -> pull -> exit/recovery

    For this setup, angular-speed envelope is more reliable than raw accel.
    We use the first meaningful trough in the angular-speed envelope as the
    end of catch, then the first major peak after that as the pull peak/end.
    """
    n = len(df)
    wx = df["wx_filtered"].values
    wy = df["wy_filtered"].values
    wz = df["wz_filtered"].values
    ang = np.sqrt(wx ** 2 + wy ** 2 + wz ** 2)
    ang_lp = lowpass(ang, 8.0, 100.0)

    search_catch = max(10, int(n * 0.45))
    troughs, _ = find_peaks(-ang_lp[:search_catch], prominence=max(5.0, np.std(ang_lp[:search_catch]) * 0.15))
    if len(troughs) > 0:
        catch_end = int(troughs[0])
    else:
        catch_end = int(np.argmin(ang_lp[:search_catch]))

    peak_start = min(max(catch_end + 5, 5), n - 8)
    peak_end = min(max(peak_start + 5, int(n * 0.85)), n - 3)
    peaks, _ = find_peaks(ang_lp[peak_start:peak_end], prominence=max(8.0, np.std(ang_lp[peak_start:peak_end]) * 0.15))
    if len(peaks) > 0:
        pull_end = int(peaks[0]) + peak_start
    else:
        pull_end = int(np.argmax(ang_lp[peak_start:peak_end])) + peak_start

    catch_end = max(3, min(catch_end, n - 12))
    pull_end = max(catch_end + 5, min(pull_end, n - 4))
    return catch_end, pull_end


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
    gravity_est = robust_gravity_baseline(amag)
    dyn = np.maximum(amag - gravity_est, 0.0)

    wx = df["wx_filtered"].values
    wy = df["wy_filtered"].values
    wz = df["wz_filtered"].values
    ang = np.sqrt(wx ** 2 + wy ** 2 + wz ** 2)

    catch_end, pull_end = segment_phases_freestyle(df)
    n = len(df)
    pull_slice = slice(catch_end, pull_end + 1)
    recovery_slice = slice(pull_end, n)

    # jerk on true 60 Hz gyro rows
    dfg = extract_true_gyro(df)
    dtg = float(np.median(np.diff(dfg["time"].values))) if len(dfg) > 3 else (1 / 60.0)
    fsg = 1.0 / dtg
    gx = lowpass(dfg["wx_filtered"].values, 12.0, fsg)
    gy = lowpass(dfg["wy_filtered"].values, 12.0, fsg)
    gz = lowpass(dfg["wz_filtered"].values, 12.0, fsg)
    jerk = np.sqrt(np.gradient(gx, dtg) ** 2 + np.gradient(gy, dtg) ** 2 + np.gradient(gz, dtg) ** 2)

    wy_lp = lowpass(wy, 8.0, 100.0)
    wz_lp = lowpass(wz, 8.0, 100.0)

    feat = {}
    feat["duration"] = duration
    feat["samples"] = n
    feat["gravity_est"] = float(gravity_est)
    feat["catch_end_idx"] = int(catch_end)
    feat["pull_end_idx"] = int(pull_end)

    feat["ang_mean"] = float(np.mean(ang))
    feat["ang_p90"] = float(np.percentile(ang, 90))
    feat["ang_peak"] = float(np.max(ang))
    feat["jerk_mean"] = float(np.mean(jerk))
    feat["jerk_p90"] = float(np.percentile(jerk, 90))
    feat["dyn_p90"] = float(np.percentile(dyn, 90))
    feat["dyn_peak"] = float(np.max(dyn))

    feat["wx_range_pull"] = float(np.max(wx[pull_slice]) - np.min(wx[pull_slice]))
    feat["wy_range_pull"] = float(np.max(wy[pull_slice]) - np.min(wy[pull_slice]))
    feat["wz_range_pull"] = float(np.max(wz[pull_slice]) - np.min(wz[pull_slice]))

    mean_abs_wy = float(np.mean(np.abs(wy[pull_slice])))
    mean_abs_wz = float(np.mean(np.abs(wz[pull_slice])))
    mean_abs_wx = float(np.mean(np.abs(wx[pull_slice])))

    feat["wz_wy_ratio_pull"] = float(mean_abs_wz / (mean_abs_wy + 1e-6))
    feat["wx_wz_ratio_pull"] = float(mean_abs_wx / (mean_abs_wz + 1e-6))

    feat["phase_catch"] = float(catch_end / n)
    feat["phase_pull"] = float((pull_end - catch_end) / n)
    feat["phase_rec"] = float((n - pull_end) / n)

    feat["wz_zero_crossings"] = int(np.sum(np.diff(np.signbit(wz_lp).astype(int)) != 0))
    feat["wy_zero_crossings"] = int(np.sum(np.diff(np.signbit(wy_lp).astype(int)) != 0))

    feat["ang_cv"] = float(np.std(ang) / (np.mean(ang) + 1e-6))
    feat["recovery_cv"] = float(np.std(ang[recovery_slice]) / (np.mean(ang[recovery_slice]) + 1e-6))
    feat["pull_mean_ang"] = float(np.mean(ang[pull_slice]))
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


def rule_scores(feat):
    # 1) Smoothness — bad freestyle examples were mainly rougher / more abrupt
    jerk = feat["jerk_mean"]
    if jerk <= 1700:
        smoothness = 100
    elif jerk <= 2100:
        smoothness = 100 - 35 * (jerk - 1700) / 400
    elif jerk <= 2500:
        smoothness = 65 - 35 * (jerk - 2100) / 400
    else:
        smoothness = 20

    # 2) Pull axis balance — strongest separator in your reference set
    # good freestyle tended to keep wz/wy lower; bad strokes often over-dominated on wz
    ratio = feat["wz_wy_ratio_pull"]
    if 0.55 <= ratio <= 1.10:
        axis_balance = 100
    elif 0.40 <= ratio < 0.55 or 1.10 < ratio <= 1.35:
        axis_balance = 65
    else:
        axis_balance = 20

    # 3) Pull structure — compare wx contribution to wz
    xz = feat["wx_wz_ratio_pull"]
    if 1.00 <= xz <= 1.80:
        pull_structure = 100
    elif 0.80 <= xz < 1.00 or 1.80 < xz <= 2.10:
        pull_structure = 65
    else:
        pull_structure = 25

    # 4) Speed control — don't reward just being fast
    ang_mean = feat["ang_mean"]
    if 220 <= ang_mean <= 285:
        speed_control = 100
    elif 200 <= ang_mean < 220 or 285 < ang_mean <= 320:
        speed_control = 70
    else:
        speed_control = 35

    # 5) Phase quality — entry/catch, pull, recovery proportions
    pc, pp, pr = feat["phase_catch"], feat["phase_pull"], feat["phase_rec"]
    phase_quality = 100
    if not (0.12 <= pc <= 0.34):
        phase_quality -= 35
    if not (0.16 <= pp <= 0.38):
        phase_quality -= 35
    if not (0.35 <= pr <= 0.60):
        phase_quality -= 30
    phase_quality = clamp(phase_quality)

    # 6) Pull amplitude — very small or very exaggerated pull windows are suspicious
    wz_range = feat["wz_range_pull"]
    if 120 <= wz_range <= 250:
        pull_amplitude = 100
    elif 90 <= wz_range < 120 or 250 < wz_range <= 320:
        pull_amplitude = 65
    else:
        pull_amplitude = 25

    # 7) Recovery stability — smoother recovery is better
    rcv = feat["recovery_cv"]
    if rcv <= 0.20:
        recovery_stability = 100
    elif rcv <= 0.24:
        recovery_stability = 70
    else:
        recovery_stability = 35

    # 8) Dynamic drive — weak drive hurts, but should not dominate
    dp = feat["dyn_peak"]
    if 8.0 <= dp <= 16.5:
        dynamic_drive = 100
    elif 6.0 <= dp < 8.0 or 16.5 < dp <= 19.0:
        dynamic_drive = 70
    else:
        dynamic_drive = 35

    # 9) Prototype similarity — lightly weighted calibration anchor
    dg = distance_to_centroid(feat, GOOD_CENTROID)
    db = distance_to_centroid(feat, BAD_CENTROID)
    prototype_similarity = 100.0 * db / (dg + db + 1e-9)

    scores = {
        "smoothness": float(clamp(smoothness)),
        "pull_axis_balance": float(clamp(axis_balance)),
        "pull_structure": float(clamp(pull_structure)),
        "speed_control": float(clamp(speed_control)),
        "phase_quality": float(clamp(phase_quality)),
        "pull_amplitude": float(clamp(pull_amplitude)),
        "recovery_stability": float(clamp(recovery_stability)),
        "dynamic_drive": float(clamp(dynamic_drive)),
        "prototype_similarity": float(clamp(prototype_similarity)),
    }
    return scores, dg, db




def severe_penalty(feat):
    """
    Hard penalties for clear red flags.
    This stops obviously bad strokes from surviving on decent average scores.
    """
    penalty = 0

    if feat["jerk_mean"] > 2350:
        penalty += 10
    if feat["wz_wy_ratio_pull"] > 1.35:
        penalty += 10
    elif feat["wz_wy_ratio_pull"] > 1.15:
        penalty += 5
    if feat["wx_wz_ratio_pull"] < 0.80:
        penalty += 8
    if feat["phase_catch"] < 0.08 or feat["phase_catch"] > 0.36:
        penalty += 10
    if feat["phase_rec"] > 0.60 or feat["phase_rec"] < 0.32:
        penalty += 8
    if feat["wx_range_pull"] < 120 or feat["wx_range_pull"] > 320:
        penalty += 8
    if feat["wz_range_pull"] < 90 or feat["wz_range_pull"] > 320:
        penalty += 6

    return penalty

def analyze(csv_path):
    df = pd.read_csv(csv_path)
    feat = extract_features(df)
    scores, dg, db = rule_scores(feat)

    weighted_score = sum(scores[k] * RULE_WEIGHTS[k] for k in RULE_WEIGHTS) / 100.0
    penalty = severe_penalty(feat)
    overall = clamp(weighted_score - penalty)

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
    if feat["jerk_mean"] > 2200:
        reasons.append("wrist motion is too jerky / abrupt")
    if feat["wz_wy_ratio_pull"] > 1.35:
        reasons.append("pull axis balance is off — wz is dominating too much during pull")
    if feat["wx_wz_ratio_pull"] < 0.80:
        reasons.append("pull shape looks incomplete or poorly structured")
    if feat["ang_mean"] > 320:
        reasons.append("stroke is too fast/aggressive to be considered controlled")
    if not (0.12 <= feat["phase_catch"] <= 0.34):
        reasons.append("entry/catch timing is outside the normal freestyle range")
    if not (0.16 <= feat["phase_pull"] <= 0.38):
        reasons.append("pull phase duration is not well balanced")
    if not (0.35 <= feat["phase_rec"] <= 0.60):
        reasons.append("recovery takes too little or too much of the stroke")
    if feat["wz_range_pull"] > 320 or feat["wz_range_pull"] < 90:
        reasons.append("pull amplitude is too exaggerated or too small")
    if feat["recovery_cv"] > 0.24:
        reasons.append("recovery phase is unstable / inconsistent")
    if feat["dyn_peak"] < 6.0:
        reasons.append("stroke drive is weak")

    if not reasons:
        reasons.append("signal pattern is controlled and close to the calibrated good freestyle examples")

    return {
        "file": csv_path,
        "overall_score": round(overall, 1),
        "verdict": verdict,
        "risk": risk,
        "prototype_distance_good": round(dg, 3),
        "prototype_distance_bad": round(db, 3),
        "weighted_score_before_penalty": round(weighted_score, 1),
        "severe_penalty": int(penalty),
        "rule_scores": {k: round(v, 1) for k, v in scores.items()},
        "key_features": {
            "duration_s": round(feat["duration"], 3),
            "ang_mean_deg_s": round(feat["ang_mean"], 1),
            "ang_p90_deg_s": round(feat["ang_p90"], 1),
            "ang_peak_deg_s": round(feat["ang_peak"], 1),
            "jerk_mean_deg_s2": round(feat["jerk_mean"], 1),
            "jerk_p90_deg_s2": round(feat["jerk_p90"], 1),
            "dyn_peak_ms2": round(feat["dyn_peak"], 2),
            "wx_range_pull_deg_s": round(feat["wx_range_pull"], 1),
            "wy_range_pull_deg_s": round(feat["wy_range_pull"], 1),
            "wz_range_pull_deg_s": round(feat["wz_range_pull"], 1),
            "wz_wy_ratio_pull": round(feat["wz_wy_ratio_pull"], 2),
            "wx_wz_ratio_pull": round(feat["wx_wz_ratio_pull"], 2),
            "phase_catch_pct": round(feat["phase_catch"] * 100, 1),
            "phase_pull_pct": round(feat["phase_pull"] * 100, 1),
            "phase_recovery_pct": round(feat["phase_rec"] * 100, 1),
            "recovery_cv": round(feat["recovery_cv"], 3),
        },
        "main_reasons": reasons,
    }


def print_report(r):
    print("\n" + "=" * 74)
    print("FREESTYLE STROKE ANALYZER — STANDALONE ABOVE-WATER VERSION")
    print("=" * 74)
    print(f"File        : {r['file']}")
    print(f"Score       : {r['overall_score']}/100")
    print(f"Verdict     : {r['verdict']}")
    print(f"Risk        : {r['risk']}")
    print(f"Dist good   : {r['prototype_distance_good']}")
    print(f"Dist bad    : {r['prototype_distance_bad']}")
    print(f"Base score  : {r['weighted_score_before_penalty']}/100")
    print(f"Penalty     : -{r['severe_penalty']}")
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

            out_path = csv_file.rsplit(".", 1)[0] + "_freestyle_report.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)
            print(f"JSON report saved to: {out_path}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR: {e}")
        sys.exit(1)
