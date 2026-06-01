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
Standalone Butterfly Stroke Analyzer
===================================
Built for:
- single IMU on RIGHT WRIST
- accelerometer 3-axis @ 100 Hz
- gyroscope 3-axis @ 60 Hz, stored/interpolated in 100 Hz CSV
- ABOVE-WATER butterfly simulation
- one complete stroke per CSV

Important:
This script does NOT require reference files at runtime.
It uses thresholds / prototype values that were calibrated once from reference
examples and then embedded here.

Why this is better than the previous versions:
- it does not reward raw speed too much
- it penalizes rough / chaotic / over-fast bad strokes
- it uses pattern quality + similarity to calibrated good/bad prototypes
- it works on new files by itself

Required columns:
    time, ax_filtered, ay_filtered, az_filtered,
    wx_filtered, wy_filtered, wz_filtered

Usage:
    python butterfly_stroke_analyzer_standalone.py your_stroke.csv
"""

# ---------------------------------------------------------------------
# Embedded calibration: derived once from sample good/bad strokes.
# This is NOT using runtime reference files.
# ---------------------------------------------------------------------
FEATURES = [
    'ang_mean', 'ang_p90', 'ang_peak', 'jerk_mean', 'jerk_p90',
    'dyn_p90', 'dyn_peak', 'wy_range_pull', 'wz_wy_ratio_pull',
    'phase_catch', 'phase_pull', 'phase_rec', 'wy_zero_crossings', 'ang_cv'
]

FEATURE_STD = {
    'ang_mean': 46.933247367105864,
    'ang_p90': 92.10327689772596,
    'ang_peak': 117.66135557739003,
    'jerk_mean': 573.6287725486126,
    'jerk_p90': 1290.8478728906864,
    'dyn_p90': 7.385540089588699,
    'dyn_peak': 8.532496978777543,
    'wy_range_pull': 130.6008477401851,
    'wz_wy_ratio_pull': 0.47092786822482285,
    'phase_catch': 0.1588278470695177,
    'phase_pull': 0.127906418317334,
    'phase_rec': 0.13762811526068017,
    'wy_zero_crossings': 1.0671873729054748,
    'ang_cv': 0.09440675778647732,
}

GOOD_CENTROID = {
    'ang_mean': 285.19690408770435,
    'ang_p90': 401.84882873255805,
    'ang_peak': 449.87442196150306,
    'jerk_mean': 1474.0097733511375,
    'jerk_p90': 2781.3756235217115,
    'dyn_p90': 14.23714503946041,
    'dyn_peak': 17.22811637423644,
    'wy_range_pull': 123.2451253563476,
    'wz_wy_ratio_pull': 1.429558419368572,
    'phase_catch': 0.35973597359735976,
    'phase_pull': 0.32673267326732675,
    'phase_rec': 0.3135313531353135,
    'wy_zero_crossings': 0.0,
    'ang_cv': 0.3383922732624501,
}

BAD_CENTROID = {
    'ang_mean': 378.12690675615005,
    'ang_p90': 566.9251916130346,
    'ang_peak': 661.3113105376812,
    'jerk_mean': 2598.771841254386,
    'jerk_p90': 5284.595812156446,
    'dyn_p90': 11.416946922094146,
    'dyn_peak': 14.541379469053425,
    'wy_range_pull': 285.5321598673827,
    'wz_wy_ratio_pull': 0.9186958591481145,
    'phase_catch': 0.2343234323432343,
    'phase_pull': 0.27392739273927397,
    'phase_rec': 0.49174917491749176,
    'wy_zero_crossings': 1.6666666666666667,
    'ang_cv': 0.4073301647270331,
}

# additional interpretable rules to prevent bad strokes from scoring high
RULE_WEIGHTS = {
    'smoothness': 18,
    'overspeed_control': 14,
    'phase_quality': 14,
    'pull_shape': 14,
    'axis_balance': 10,
    'signal_cleanliness': 10,
    'dynamic_drive': 10,
    'prototype_similarity': 10,
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
    return np.sqrt(df['ax_filtered']**2 + df['ay_filtered']**2 + df['az_filtered']**2)


def extract_true_gyro(df):
    wx = df['wx_filtered'].values
    wy = df['wy_filtered'].values
    wz = df['wz_filtered'].values
    changed = (np.diff(wx) != 0) | (np.diff(wy) != 0) | (np.diff(wz) != 0)
    mask = np.concatenate(([True], changed))
    return df[mask].reset_index(drop=True)


def robust_gravity_baseline(amag):
    # estimate baseline from quietest part of the stroke
    k = max(5, int(len(amag) * 0.1))
    return float(np.mean(np.sort(amag)[:k]))


def segment_phases(df):
    n = len(df)
    wy = df['wy_filtered'].values
    wy_lp = lowpass(wy, 8.0, 100.0)

    search_catch = int(n * 0.60)
    troughs, _ = find_peaks(-wy_lp[:search_catch], prominence=20.0)
    peaks, _ = find_peaks(wy_lp, prominence=30.0, distance=8)

    catch_end = int(troughs[0]) if len(troughs) else int(np.argmin(wy_lp[:search_catch]))
    peaks_after = peaks[peaks > catch_end]
    if len(peaks_after) > 0:
        pull_end = int(peaks_after[0])
    else:
        pull_end = min(n - 3, catch_end + max(8, n // 4))

    catch_end = max(3, min(catch_end, n - 10))
    pull_end = max(catch_end + 5, min(pull_end, n - 3))
    return catch_end, pull_end


def extract_features(df):
    required = ['time', 'ax_filtered', 'ay_filtered', 'az_filtered',
                'wx_filtered', 'wy_filtered', 'wz_filtered']
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df = df.sort_values('time').reset_index(drop=True)
    n = len(df)
    if n < 30:
        raise ValueError(f"Too few samples ({n}). Need at least 30.")

    t = df['time'].values
    duration = float(t[-1] - t[0])

    amag = accel_mag(df).values
    gravity = robust_gravity_baseline(amag)
    dyn = np.maximum(amag - gravity, 0.0)

    wx = df['wx_filtered'].values
    wy = df['wy_filtered'].values
    wz = df['wz_filtered'].values
    ang = np.sqrt(wx**2 + wy**2 + wz**2)

    catch_end, pull_end = segment_phases(df)
    pull_slice = slice(catch_end, pull_end + 1)
    rec_slice = slice(pull_end, n)

    # use true gyro samples for jerk
    dfg = extract_true_gyro(df)
    dtg = float(np.median(np.diff(dfg['time'].values))) if len(dfg) > 3 else (1 / 60.0)
    gx = lowpass(dfg['wx_filtered'].values, 12.0, 1.0 / dtg)
    gy = lowpass(dfg['wy_filtered'].values, 12.0, 1.0 / dtg)
    gz = lowpass(dfg['wz_filtered'].values, 12.0, 1.0 / dtg)
    jerk = np.sqrt(np.gradient(gx, dtg)**2 + np.gradient(gy, dtg)**2 + np.gradient(gz, dtg)**2)

    feat = {}
    feat['duration'] = duration
    feat['ang_mean'] = float(np.mean(ang))
    feat['ang_p90'] = float(np.percentile(ang, 90))
    feat['ang_peak'] = float(np.max(ang))
    feat['jerk_mean'] = float(np.mean(jerk))
    feat['jerk_p90'] = float(np.percentile(jerk, 90))
    feat['dyn_p90'] = float(np.percentile(dyn, 90))
    feat['dyn_peak'] = float(np.max(dyn))
    feat['wy_range_pull'] = float(np.max(wy[pull_slice]) - np.min(wy[pull_slice]))
    wy_mean_pull = float(np.mean(np.abs(wy[pull_slice])))
    wz_mean_pull = float(np.mean(np.abs(wz[pull_slice])))
    feat['wz_wy_ratio_pull'] = float(wz_mean_pull / (wy_mean_pull + 1e-6))
    feat['phase_catch'] = float(catch_end / n)
    feat['phase_pull'] = float((pull_end - catch_end) / n)
    feat['phase_rec'] = float((n - pull_end) / n)
    wy_lp = lowpass(wy, 8.0, 100.0)
    feat['wy_zero_crossings'] = int(np.sum(np.diff(np.signbit(wy_lp).astype(int)) != 0))
    feat['ang_cv'] = float(np.std(ang) / (np.mean(ang) + 1e-6))
    feat['gravity_est'] = gravity
    feat['samples'] = n
    feat['catch_end_idx'] = catch_end
    feat['pull_end_idx'] = pull_end
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
    # 1) smoothness: bad strokes in your setup are often very fast AND very jerky
    jerk = feat['jerk_mean']
    if jerk <= 1600:
        smooth = 100
    elif jerk <= 2200:
        smooth = 75 - 25 * (jerk - 1600) / 600
    elif jerk <= 2800:
        smooth = 50 - 30 * (jerk - 2200) / 600
    else:
        smooth = 15

    # 2) overspeed control: punish very high angular speed unless it is also smooth
    ang_mean = feat['ang_mean']
    if ang_mean <= 320:
        overspeed = 100
    elif ang_mean <= 360:
        overspeed = 80 - 25 * (ang_mean - 320) / 40
    elif ang_mean <= 400:
        overspeed = 55 - 25 * (ang_mean - 360) / 40
    else:
        overspeed = 20

    # 3) phase quality: above-water good strokes still need plausible timing
    pc, pp, pr = feat['phase_catch'], feat['phase_pull'], feat['phase_rec']
    phase = 100
    if not (0.20 <= pc <= 0.45):
        phase -= 30
    if not (0.20 <= pp <= 0.45):
        phase -= 30
    if not (0.20 <= pr <= 0.50):
        phase -= 30
    phase = clamp(phase)

    # 4) pull shape: too huge wy range often means exaggerated / chaotic motion above water
    wr = feat['wy_range_pull']
    if 90 <= wr <= 220:
        pull_shape = 100
    elif 70 <= wr < 90 or 220 < wr <= 300:
        pull_shape = 65
    else:
        pull_shape = 25

    # 5) axis balance: good references had higher wz/wy than the bad centroid
    ratio = feat['wz_wy_ratio_pull']
    if 1.15 <= ratio <= 1.85:
        axis = 100
    elif 0.95 <= ratio < 1.15 or 1.85 < ratio <= 2.10:
        axis = 65
    else:
        axis = 25

    # 6) signal cleanliness: many zero crossings in filtered wy usually means messy pattern
    zc = feat['wy_zero_crossings']
    if zc == 0:
        clean = 100
    elif zc == 1:
        clean = 65
    elif zc == 2:
        clean = 40
    else:
        clean = 15

    # 7) dynamic drive: reward having some motion, but do not let this dominate the score
    dp = feat['dyn_peak']
    if 10 <= dp <= 22:
        drive = 100
    elif 7 <= dp < 10 or 22 < dp <= 28:
        drive = 70
    else:
        drive = 35

    # 8) prototype similarity: embedded calibration, no runtime refs needed
    dg = distance_to_centroid(feat, GOOD_CENTROID)
    db = distance_to_centroid(feat, BAD_CENTROID)
    proto = 100.0 * db / (dg + db + 1e-9)

    scores = {
        'smoothness': float(clamp(smooth)),
        'overspeed_control': float(clamp(overspeed)),
        'phase_quality': float(clamp(phase)),
        'pull_shape': float(clamp(pull_shape)),
        'axis_balance': float(clamp(axis)),
        'signal_cleanliness': float(clamp(clean)),
        'dynamic_drive': float(clamp(drive)),
        'prototype_similarity': float(clamp(proto)),
    }
    return scores, dg, db


def analyze(csv_path):
    df = pd.read_csv(csv_path)
    feat = extract_features(df)
    scores, dg, db = rule_scores(feat)

    overall = sum(scores[k] * RULE_WEIGHTS[k] for k in RULE_WEIGHTS) / 100.0

    # risk / verdict bands tuned so bad strokes do not get falsely flattering labels
    if overall >= 75:
        verdict = 'GOOD / LOW RISK'
        risk = 'LOW'
    elif overall >= 60:
        verdict = 'BORDERLINE / MODERATE RISK'
        risk = 'MODERATE'
    elif overall >= 45:
        verdict = 'BAD / MODERATE-HIGH RISK'
        risk = 'MODERATE-HIGH'
    else:
        verdict = 'BAD / HIGH RISK'
        risk = 'HIGH'

    reasons = []
    if feat['jerk_mean'] > 2200:
        reasons.append('very jerky wrist motion')
    if feat['ang_mean'] > 360:
        reasons.append('movement is too fast / aggressive for a controlled stroke')
    if feat['wy_zero_crossings'] >= 2:
        reasons.append('unstable wy pattern across the stroke')
    if feat['phase_rec'] > 0.50:
        reasons.append('recovery phase takes too much of the stroke')
    if feat['wy_range_pull'] > 300:
        reasons.append('pull sweep is exaggerated / chaotic rather than controlled')
    if feat['wz_wy_ratio_pull'] < 1.0:
        reasons.append('axis balance in pull is closer to bad examples than good ones')
    if feat['dyn_peak'] < 7:
        reasons.append('stroke drive is weak')

    if not reasons:
        reasons.append('signal shape is generally controlled and closer to calibrated good strokes')

    return {
        'file': csv_path,
        'overall_score': round(overall, 1),
        'verdict': verdict,
        'risk': risk,
        'prototype_distance_good': round(dg, 3),
        'prototype_distance_bad': round(db, 3),
        'rule_scores': {k: round(v, 1) for k, v in scores.items()},
        'key_features': {
            'duration_s': round(feat['duration'], 3),
            'ang_mean_deg_s': round(feat['ang_mean'], 1),
            'ang_p90_deg_s': round(feat['ang_p90'], 1),
            'ang_peak_deg_s': round(feat['ang_peak'], 1),
            'jerk_mean_deg_s2': round(feat['jerk_mean'], 1),
            'jerk_p90_deg_s2': round(feat['jerk_p90'], 1),
            'dyn_peak_ms2': round(feat['dyn_peak'], 2),
            'wy_range_pull_deg_s': round(feat['wy_range_pull'], 1),
            'wz_wy_ratio_pull': round(feat['wz_wy_ratio_pull'], 2),
            'phase_catch_pct': round(feat['phase_catch'] * 100, 1),
            'phase_pull_pct': round(feat['phase_pull'] * 100, 1),
            'phase_recovery_pct': round(feat['phase_rec'] * 100, 1),
            'wy_zero_crossings': int(feat['wy_zero_crossings']),
        },
        'main_reasons': reasons,
    }


def print_report(r):
    print('\n' + '=' * 72)
    print('BUTTERFLY STROKE ANALYZER — STANDALONE ABOVE-WATER VERSION')
    print('=' * 72)
    print(f"File        : {r['file']}")
    print(f"Score       : {r['overall_score']}/100")
    print(f"Verdict     : {r['verdict']}")
    print(f"Risk        : {r['risk']}")
    print(f"Dist good   : {r['prototype_distance_good']}")
    print(f"Dist bad    : {r['prototype_distance_bad']}")
    print('-' * 72)
    print('Rule scores:')
    for k, v in r['rule_scores'].items():
        print(f"  {k:22s} {v:6.1f}/100")
    print('-' * 72)
    print('Key features:')
    for k, v in r['key_features'].items():
        print(f"  {k:22s} {v}")
    print('-' * 72)
    print('Why this result:')
    for reason in r['main_reasons']:
        print(f"  - {reason}")
    print('=' * 72 + '\n')


def process_folder_to_risk_dirs(input_folder, output_root):
    input_folder = Path(input_folder)
    output_root = Path(output_root)
    csv_files = sorted(input_folder.rglob('*.csv'))
    if not csv_files:
        raise ValueError(f'No CSV files found in: {input_folder}')

    processed = 0
    failed = 0
    for csv_file in csv_files:
        try:
            report = analyze(str(csv_file))
            risk = report['risk']
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


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--folder':
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
                output_root = filedialog.askdirectory(title='Select output folder for risk folders')
                root.destroy()
            if not output_root:
                print('No output folder selected.')
                sys.exit(1)

            processed, failed = process_folder_to_risk_dirs(input_folder, output_root)
            print(f'Finished. Processed: {processed}, Failed: {failed}')
        else:
            if not csv_file:
                root = tk.Tk()
                root.withdraw()
                print('Select mode:')
                print('  1) Single CSV file')
                print('  2) Folder of stroke CSV files')
                mode = input('Enter choice (1 or 2) [2]: ').strip() or '2'
                if mode == '2':
                    default_folder = Path(__file__).resolve().parent.parent / 'segmintsFiles' / 'Butterfly'
                    if default_folder.exists():
                        input_folder = str(default_folder)
                    else:
                        input_folder = filedialog.askdirectory(title='Select input folder with stroke CSV files')
                    print('Select any output folder you want for risk folders...')
                    output_root = filedialog.askdirectory(title='Select output folder for risk folders')
                    root.destroy()
                    if not input_folder or not output_root:
                        print('Input/output folder not selected.')
                        sys.exit(1)
                    processed, failed = process_folder_to_risk_dirs(input_folder, output_root)
                    print(f'Finished. Processed: {processed}, Failed: {failed}')
                    sys.exit(0)
                else:
                    csv_file = filedialog.askopenfilename(
                        title='Select CSV file',
                        filetypes=[('CSV files', '*.csv'), ('All files', '*.*')]
                    )
                    root.destroy()
                    if not csv_file:
                        print('No file selected.')
                        sys.exit(1)

            report = analyze(csv_file)
            print_report(report)

            out_path = csv_file.rsplit('.', 1)[0] + '_butterfly_report.json'
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2)
            print(f'JSON report saved to: {out_path}')
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f'ERROR: {e}')
        sys.exit(1)
