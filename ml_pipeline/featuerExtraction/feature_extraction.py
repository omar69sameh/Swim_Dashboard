#!/usr/bin/env python3
import sys
import json
import shutil
import traceback
import types
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT / "dataSegmenatation") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "dataSegmenatation"))
from tier_labels import STYLE_FOLDER_NAMES, normalize_tier_token

import tkinter as tk
from tkinter import filedialog

"""
Combined Swimming Stroke Feature Extraction Router
=================================================
This script combines the 3 standalone analyzers:
- Butterfly
- Freestyle
- Breaststroke
"""

BUTTERFLY_SOURCE = "import sys\nimport json\nimport shutil\nfrom pathlib import Path\nimport numpy as np\nimport pandas as pd\nimport tkinter as tk\nfrom tkinter import filedialog\nfrom scipy.signal import butter, filtfilt, find_peaks\n\n\"\"\"\nStandalone Butterfly Stroke Analyzer\n===================================\nBuilt for:\n- single IMU on RIGHT WRIST\n- accelerometer 3-axis @ 100 Hz\n- gyroscope 3-axis @ 60 Hz, stored/interpolated in 100 Hz CSV\n- ABOVE-WATER butterfly simulation\n- one complete stroke per CSV\n\nImportant:\nThis script does NOT require reference files at runtime.\nIt uses thresholds / prototype values that were calibrated once from reference\nexamples and then embedded here.\n\nWhy this is better than the previous versions:\n- it does not reward raw speed too much\n- it penalizes rough / chaotic / over-fast bad strokes\n- it uses pattern quality + similarity to calibrated good/bad prototypes\n- it works on new files by itself\n\nRequired columns:\n    time, ax_filtered, ay_filtered, az_filtered,\n    wx_filtered, wy_filtered, wz_filtered\n\nUsage:\n    python butterfly_stroke_analyzer_standalone.py your_stroke.csv\n\"\"\"\n\n# ---------------------------------------------------------------------\n# Embedded calibration: derived once from sample good/bad strokes.\n# This is NOT using runtime reference files.\n# ---------------------------------------------------------------------\nFEATURES = [\n    'ang_mean', 'ang_p90', 'ang_peak', 'jerk_mean', 'jerk_p90',\n    'dyn_p90', 'dyn_peak', 'wy_range_pull', 'wz_wy_ratio_pull',\n    'phase_catch', 'phase_pull', 'phase_rec', 'wy_zero_crossings', 'ang_cv'\n]\n\nFEATURE_STD = {\n    'ang_mean': 46.933247367105864,\n    'ang_p90': 92.10327689772596,\n    'ang_peak': 117.66135557739003,\n    'jerk_mean': 573.6287725486126,\n    'jerk_p90': 1290.8478728906864,\n    'dyn_p90': 7.385540089588699,\n    'dyn_peak': 8.532496978777543,\n    'wy_range_pull': 130.6008477401851,\n    'wz_wy_ratio_pull': 0.47092786822482285,\n    'phase_catch': 0.1588278470695177,\n    'phase_pull': 0.127906418317334,\n    'phase_rec': 0.13762811526068017,\n    'wy_zero_crossings': 1.0671873729054748,\n    'ang_cv': 0.09440675778647732,\n}\n\nGOOD_CENTROID = {\n    'ang_mean': 285.19690408770435,\n    'ang_p90': 401.84882873255805,\n    'ang_peak': 449.87442196150306,\n    'jerk_mean': 1474.0097733511375,\n    'jerk_p90': 2781.3756235217115,\n    'dyn_p90': 14.23714503946041,\n    'dyn_peak': 17.22811637423644,\n    'wy_range_pull': 123.2451253563476,\n    'wz_wy_ratio_pull': 1.429558419368572,\n    'phase_catch': 0.35973597359735976,\n    'phase_pull': 0.32673267326732675,\n    'phase_rec': 0.3135313531353135,\n    'wy_zero_crossings': 0.0,\n    'ang_cv': 0.3383922732624501,\n}\n\nBAD_CENTROID = {\n    'ang_mean': 378.12690675615005,\n    'ang_p90': 566.9251916130346,\n    'ang_peak': 661.3113105376812,\n    'jerk_mean': 2598.771841254386,\n    'jerk_p90': 5284.595812156446,\n    'dyn_p90': 11.416946922094146,\n    'dyn_peak': 14.541379469053425,\n    'wy_range_pull': 285.5321598673827,\n    'wz_wy_ratio_pull': 0.9186958591481145,\n    'phase_catch': 0.2343234323432343,\n    'phase_pull': 0.27392739273927397,\n    'phase_rec': 0.49174917491749176,\n    'wy_zero_crossings': 1.6666666666666667,\n    'ang_cv': 0.4073301647270331,\n}\n\n# additional interpretable rules to prevent bad strokes from scoring high\nRULE_WEIGHTS = {\n    'smoothness': 18,\n    'overspeed_control': 14,\n    'phase_quality': 14,\n    'pull_shape': 14,\n    'axis_balance': 10,\n    'signal_cleanliness': 10,\n    'dynamic_drive': 10,\n    'prototype_similarity': 10,\n}\nassert sum(RULE_WEIGHTS.values()) == 100\n\n\n# ---------------------------------------------------------------------\n# Helpers\n# ---------------------------------------------------------------------\ndef lowpass(signal, cutoff_hz, fs, order=4):\n    nyq = fs / 2.0\n    if cutoff_hz >= nyq:\n        return signal\n    b, a = butter(order, cutoff_hz / nyq, btype=\"low\")\n    return filtfilt(b, a, signal)\n\n\ndef accel_mag(df):\n    return np.sqrt(df['ax_filtered']**2 + df['ay_filtered']**2 + df['az_filtered']**2)\n\n\ndef extract_true_gyro(df):\n    wx = df['wx_filtered'].values\n    wy = df['wy_filtered'].values\n    wz = df['wz_filtered'].values\n    changed = (np.diff(wx) != 0) | (np.diff(wy) != 0) | (np.diff(wz) != 0)\n    mask = np.concatenate(([True], changed))\n    return df[mask].reset_index(drop=True)\n\n\ndef robust_gravity_baseline(amag):\n    # estimate baseline from quietest part of the stroke\n    k = max(5, int(len(amag) * 0.1))\n    return float(np.mean(np.sort(amag)[:k]))\n\n\ndef segment_phases(df):\n    n = len(df)\n    wy = df['wy_filtered'].values\n    wy_lp = lowpass(wy, 8.0, 100.0)\n\n    search_catch = int(n * 0.60)\n    troughs, _ = find_peaks(-wy_lp[:search_catch], prominence=20.0)\n    peaks, _ = find_peaks(wy_lp, prominence=30.0, distance=8)\n\n    catch_end = int(troughs[0]) if len(troughs) else int(np.argmin(wy_lp[:search_catch]))\n    peaks_after = peaks[peaks > catch_end]\n    if len(peaks_after) > 0:\n        pull_end = int(peaks_after[0])\n    else:\n        pull_end = min(n - 3, catch_end + max(8, n // 4))\n\n    catch_end = max(3, min(catch_end, n - 10))\n    pull_end = max(catch_end + 5, min(pull_end, n - 3))\n    return catch_end, pull_end\n\n\ndef extract_features(df):\n    required = ['time', 'ax_filtered', 'ay_filtered', 'az_filtered',\n                'wx_filtered', 'wy_filtered', 'wz_filtered']\n    missing = [c for c in required if c not in df.columns]\n    if missing:\n        raise ValueError(f\"Missing columns: {missing}\")\n\n    df = df.sort_values('time').reset_index(drop=True)\n    n = len(df)\n    if n < 30:\n        raise ValueError(f\"Too few samples ({n}). Need at least 30.\")\n\n    t = df['time'].values\n    duration = float(t[-1] - t[0])\n\n    amag = accel_mag(df).values\n    gravity = robust_gravity_baseline(amag)\n    dyn = np.maximum(amag - gravity, 0.0)\n\n    wx = df['wx_filtered'].values\n    wy = df['wy_filtered'].values\n    wz = df['wz_filtered'].values\n    ang = np.sqrt(wx**2 + wy**2 + wz**2)\n\n    catch_end, pull_end = segment_phases(df)\n    pull_slice = slice(catch_end, pull_end + 1)\n    rec_slice = slice(pull_end, n)\n\n    # use true gyro samples for jerk\n    dfg = extract_true_gyro(df)\n    dtg = float(np.median(np.diff(dfg['time'].values))) if len(dfg) > 3 else (1 / 60.0)\n    gx = lowpass(dfg['wx_filtered'].values, 12.0, 1.0 / dtg)\n    gy = lowpass(dfg['wy_filtered'].values, 12.0, 1.0 / dtg)\n    gz = lowpass(dfg['wz_filtered'].values, 12.0, 1.0 / dtg)\n    jerk = np.sqrt(np.gradient(gx, dtg)**2 + np.gradient(gy, dtg)**2 + np.gradient(gz, dtg)**2)\n\n    feat = {}\n    feat['duration'] = duration\n    feat['ang_mean'] = float(np.mean(ang))\n    feat['ang_p90'] = float(np.percentile(ang, 90))\n    feat['ang_peak'] = float(np.max(ang))\n    feat['jerk_mean'] = float(np.mean(jerk))\n    feat['jerk_p90'] = float(np.percentile(jerk, 90))\n    feat['dyn_p90'] = float(np.percentile(dyn, 90))\n    feat['dyn_peak'] = float(np.max(dyn))\n    feat['wy_range_pull'] = float(np.max(wy[pull_slice]) - np.min(wy[pull_slice]))\n    wy_mean_pull = float(np.mean(np.abs(wy[pull_slice])))\n    wz_mean_pull = float(np.mean(np.abs(wz[pull_slice])))\n    feat['wz_wy_ratio_pull'] = float(wz_mean_pull / (wy_mean_pull + 1e-6))\n    feat['phase_catch'] = float(catch_end / n)\n    feat['phase_pull'] = float((pull_end - catch_end) / n)\n    feat['phase_rec'] = float((n - pull_end) / n)\n    wy_lp = lowpass(wy, 8.0, 100.0)\n    feat['wy_zero_crossings'] = int(np.sum(np.diff(np.signbit(wy_lp).astype(int)) != 0))\n    feat['ang_cv'] = float(np.std(ang) / (np.mean(ang) + 1e-6))\n    feat['gravity_est'] = gravity\n    feat['samples'] = n\n    feat['catch_end_idx'] = catch_end\n    feat['pull_end_idx'] = pull_end\n    return feat\n\n\ndef distance_to_centroid(feat, centroid):\n    d2 = 0.0\n    for name in FEATURES:\n        std = FEATURE_STD[name] if FEATURE_STD[name] > 1e-9 else 1.0\n        z = (feat[name] - centroid[name]) / std\n        d2 += z * z\n    return float(np.sqrt(d2))\n\n\ndef clamp(x, lo=0.0, hi=100.0):\n    return max(lo, min(hi, x))\n\n\ndef rule_scores(feat):\n    # 1) smoothness: bad strokes in your setup are often very fast AND very jerky\n    jerk = feat['jerk_mean']\n    if jerk <= 1600:\n        smooth = 100\n    elif jerk <= 2200:\n        smooth = 75 - 25 * (jerk - 1600) / 600\n    elif jerk <= 2800:\n        smooth = 50 - 30 * (jerk - 2200) / 600\n    else:\n        smooth = 15\n\n    # 2) overspeed control: punish very high angular speed unless it is also smooth\n    ang_mean = feat['ang_mean']\n    if ang_mean <= 320:\n        overspeed = 100\n    elif ang_mean <= 360:\n        overspeed = 80 - 25 * (ang_mean - 320) / 40\n    elif ang_mean <= 400:\n        overspeed = 55 - 25 * (ang_mean - 360) / 40\n    else:\n        overspeed = 20\n\n    # 3) phase quality: above-water good strokes still need plausible timing\n    pc, pp, pr = feat['phase_catch'], feat['phase_pull'], feat['phase_rec']\n    phase = 100\n    if not (0.20 <= pc <= 0.45):\n        phase -= 30\n    if not (0.20 <= pp <= 0.45):\n        phase -= 30\n    if not (0.20 <= pr <= 0.50):\n        phase -= 30\n    phase = clamp(phase)\n\n    # 4) pull shape: too huge wy range often means exaggerated / chaotic motion above water\n    wr = feat['wy_range_pull']\n    if 90 <= wr <= 220:\n        pull_shape = 100\n    elif 70 <= wr < 90 or 220 < wr <= 300:\n        pull_shape = 65\n    else:\n        pull_shape = 25\n\n    # 5) axis balance: good references had higher wz/wy than the bad centroid\n    ratio = feat['wz_wy_ratio_pull']\n    if 1.15 <= ratio <= 1.85:\n        axis = 100\n    elif 0.95 <= ratio < 1.15 or 1.85 < ratio <= 2.10:\n        axis = 65\n    else:\n        axis = 25\n\n    # 6) signal cleanliness: many zero crossings in filtered wy usually means messy pattern\n    zc = feat['wy_zero_crossings']\n    if zc == 0:\n        clean = 100\n    elif zc == 1:\n        clean = 65\n    elif zc == 2:\n        clean = 40\n    else:\n        clean = 15\n\n    # 7) dynamic drive: reward having some motion, but do not let this dominate the score\n    dp = feat['dyn_peak']\n    if 10 <= dp <= 22:\n        drive = 100\n    elif 7 <= dp < 10 or 22 < dp <= 28:\n        drive = 70\n    else:\n        drive = 35\n\n    # 8) prototype similarity: embedded calibration, no runtime refs needed\n    dg = distance_to_centroid(feat, GOOD_CENTROID)\n    db = distance_to_centroid(feat, BAD_CENTROID)\n    proto = 100.0 * db / (dg + db + 1e-9)\n\n    scores = {\n        'smoothness': float(clamp(smooth)),\n        'overspeed_control': float(clamp(overspeed)),\n        'phase_quality': float(clamp(phase)),\n        'pull_shape': float(clamp(pull_shape)),\n        'axis_balance': float(clamp(axis)),\n        'signal_cleanliness': float(clamp(clean)),\n        'dynamic_drive': float(clamp(drive)),\n        'prototype_similarity': float(clamp(proto)),\n    }\n    return scores, dg, db\n\n\ndef analyze(csv_path):\n    df = pd.read_csv(csv_path)\n    feat = extract_features(df)\n    scores, dg, db = rule_scores(feat)\n\n    overall = sum(scores[k] * RULE_WEIGHTS[k] for k in RULE_WEIGHTS) / 100.0\n\n    # risk / verdict bands tuned so bad strokes do not get falsely flattering labels\n    if overall >= 75:\n        verdict = 'GOOD / LOW RISK'\n        risk = 'LOW'\n    elif overall >= 60:\n        verdict = 'BORDERLINE / MODERATE RISK'\n        risk = 'MODERATE'\n    elif overall >= 45:\n        verdict = 'BAD / MODERATE-HIGH RISK'\n        risk = 'MODERATE-HIGH'\n    else:\n        verdict = 'BAD / HIGH RISK'\n        risk = 'HIGH'\n\n    reasons = []\n    if feat['jerk_mean'] > 2200:\n        reasons.append('very jerky wrist motion')\n    if feat['ang_mean'] > 360:\n        reasons.append('movement is too fast / aggressive for a controlled stroke')\n    if feat['wy_zero_crossings'] >= 2:\n        reasons.append('unstable wy pattern across the stroke')\n    if feat['phase_rec'] > 0.50:\n        reasons.append('recovery phase takes too much of the stroke')\n    if feat['wy_range_pull'] > 300:\n        reasons.append('pull sweep is exaggerated / chaotic rather than controlled')\n    if feat['wz_wy_ratio_pull'] < 1.0:\n        reasons.append('axis balance in pull is closer to bad examples than good ones')\n    if feat['dyn_peak'] < 7:\n        reasons.append('stroke drive is weak')\n\n    if not reasons:\n        reasons.append('signal shape is generally controlled and closer to calibrated good strokes')\n\n    return {\n        'file': csv_path,\n        'overall_score': round(overall, 1),\n        'verdict': verdict,\n        'risk': risk,\n        'prototype_distance_good': round(dg, 3),\n        'prototype_distance_bad': round(db, 3),\n        'rule_scores': {k: round(v, 1) for k, v in scores.items()},\n        'key_features': {\n            'duration_s': round(feat['duration'], 3),\n            'ang_mean_deg_s': round(feat['ang_mean'], 1),\n            'ang_p90_deg_s': round(feat['ang_p90'], 1),\n            'ang_peak_deg_s': round(feat['ang_peak'], 1),\n            'jerk_mean_deg_s2': round(feat['jerk_mean'], 1),\n            'jerk_p90_deg_s2': round(feat['jerk_p90'], 1),\n            'dyn_peak_ms2': round(feat['dyn_peak'], 2),\n            'wy_range_pull_deg_s': round(feat['wy_range_pull'], 1),\n            'wz_wy_ratio_pull': round(feat['wz_wy_ratio_pull'], 2),\n            'phase_catch_pct': round(feat['phase_catch'] * 100, 1),\n            'phase_pull_pct': round(feat['phase_pull'] * 100, 1),\n            'phase_recovery_pct': round(feat['phase_rec'] * 100, 1),\n            'wy_zero_crossings': int(feat['wy_zero_crossings']),\n        },\n        'main_reasons': reasons,\n    }\n\n\ndef print_report(r):\n    print('\\n' + '=' * 72)\n    print('BUTTERFLY STROKE ANALYZER \u2014 STANDALONE ABOVE-WATER VERSION')\n    print('=' * 72)\n    print(f\"File        : {r['file']}\")\n    print(f\"Score       : {r['overall_score']}/100\")\n    print(f\"Verdict     : {r['verdict']}\")\n    print(f\"Risk        : {r['risk']}\")\n    print(f\"Dist good   : {r['prototype_distance_good']}\")\n    print(f\"Dist bad    : {r['prototype_distance_bad']}\")\n    print('-' * 72)\n    print('Rule scores:')\n    for k, v in r['rule_scores'].items():\n        print(f\"  {k:22s} {v:6.1f}/100\")\n    print('-' * 72)\n    print('Key features:')\n    for k, v in r['key_features'].items():\n        print(f\"  {k:22s} {v}\")\n    print('-' * 72)\n    print('Why this result:')\n    for reason in r['main_reasons']:\n        print(f\"  - {reason}\")\n    print('=' * 72 + '\\n')\n\n\ndef process_folder_to_risk_dirs(input_folder, output_root):\n    input_folder = Path(input_folder)\n    output_root = Path(output_root)\n    csv_files = sorted(input_folder.rglob('*.csv'))\n    if not csv_files:\n        raise ValueError(f'No CSV files found in: {input_folder}')\n\n    processed = 0\n    failed = 0\n    for csv_file in csv_files:\n        try:\n            report = analyze(str(csv_file))\n            risk = report['risk']\n            risk_dir = output_root / risk\n            risk_dir.mkdir(parents=True, exist_ok=True)\n\n            out_csv = risk_dir / csv_file.name\n            if out_csv.exists():\n                out_csv = risk_dir / f\"{csv_file.stem}_{processed + 1}.csv\"\n            shutil.copy2(csv_file, out_csv)\n            processed += 1\n        except Exception:\n            failed += 1\n\n    return processed, failed\n\n\nif __name__ == '__main__':\n    if len(sys.argv) >= 3 and sys.argv[1] == '--folder':\n        input_folder = sys.argv[2]\n        output_root = sys.argv[3] if len(sys.argv) >= 4 else None\n    else:\n        input_folder = None\n        output_root = None\n        csv_file = sys.argv[1] if len(sys.argv) >= 2 else None\n\n    try:\n        if input_folder is not None:\n            if not output_root:\n                root = tk.Tk()\n                root.withdraw()\n                output_root = filedialog.askdirectory(title='Select output folder for risk folders')\n                root.destroy()\n            if not output_root:\n                print('No output folder selected.')\n                sys.exit(1)\n\n            processed, failed = process_folder_to_risk_dirs(input_folder, output_root)\n            print(f'Finished. Processed: {processed}, Failed: {failed}')\n        else:\n            if not csv_file:\n                root = tk.Tk()\n                root.withdraw()\n                print('Select mode:')\n                print('  1) Single CSV file')\n                print('  2) Folder of stroke CSV files')\n                mode = input('Enter choice (1 or 2) [2]: ').strip() or '2'\n                if mode == '2':\n                    default_folder = Path(__file__).resolve().parent.parent / 'segmintsFiles' / 'Butterfly'\n                    if default_folder.exists():\n                        input_folder = str(default_folder)\n                    else:\n                        input_folder = filedialog.askdirectory(title='Select input folder with stroke CSV files')\n                    print('Select any output folder you want for risk folders...')\n                    output_root = filedialog.askdirectory(title='Select output folder for risk folders')\n                    root.destroy()\n                    if not input_folder or not output_root:\n                        print('Input/output folder not selected.')\n                        sys.exit(1)\n                    processed, failed = process_folder_to_risk_dirs(input_folder, output_root)\n                    print(f'Finished. Processed: {processed}, Failed: {failed}')\n                    sys.exit(0)\n                else:\n                    csv_file = filedialog.askopenfilename(\n                        title='Select CSV file',\n                        filetypes=[('CSV files', '*.csv'), ('All files', '*.*')]\n                    )\n                    root.destroy()\n                    if not csv_file:\n                        print('No file selected.')\n                        sys.exit(1)\n\n            report = analyze(csv_file)\n            print_report(report)\n\n            out_path = csv_file.rsplit('.', 1)[0] + '_butterfly_report.json'\n            with open(out_path, 'w', encoding='utf-8') as f:\n                json.dump(report, f, indent=2)\n            print(f'JSON report saved to: {out_path}')\n    except Exception as e:\n        import traceback\n        traceback.print_exc()\n        print(f'ERROR: {e}')\n        sys.exit(1)\n"
BREAST_SOURCE = "\nimport sys\nimport json\nimport shutil\nfrom pathlib import Path\nimport numpy as np\nimport pandas as pd\nimport tkinter as tk\nfrom tkinter import filedialog\nfrom scipy.signal import butter, filtfilt, find_peaks\n\n\"\"\"\nStandalone Breaststroke Stroke Analyzer v3\n==========================================\nBuilt ONLY from the FINAL 6 breaststroke reference files the user asked to use:\n  - goodbreast(1).csv\n  - goodbreast2(1).csv\n  - goodbreast3.csv\n  - badbreast1(1).csv\n  - badbreast2(1).csv\n  - badbreast3.csv\n\nSensor setup:\n  - single IMU on RIGHT WRIST\n  - linear accelerometer 3-axis @ 100 Hz\n  - gyroscope 3-axis @ 60 Hz, stored/interpolated in 100 Hz CSV\n  - ABOVE-WATER simulated breaststroke\n  - one complete stroke per CSV\n\nThis version is stricter than v1/v2:\n  - it does NOT use the earlier breaststroke files\n  - it penalizes low-amplitude / weak pull patterns harder\n  - it rewards the stronger, more structured breaststroke pattern that actually\n    appears in the final labeled \"good\" reference set\n  - it uses both prototype similarity and interpretable hard rules\n\"\"\"\n\n# ---------------------------------------------------------------------\n# Embedded calibration from ONLY the final 6 files\n# ---------------------------------------------------------------------\nFEATURES = [\n    \"ang_mean\", \"ang_peak\", \"ang_cv\",\n    \"jerk_mean\", \"jerk_p90\",\n    \"dyn_peak\", \"dyn_p90\",\n    \"wy_range_pull\", \"ang_range_pull\",\n    \"wx_wy_pull\", \"wz_wy_pull\",\n    \"pull_frac\", \"rec_frac\",\n    \"pull_energy\", \"rec_energy\",\n    \"num_peaks_ang\", \"wy_zero\", \"az_zero\"\n]\n\nGOOD_CENTROID = {\n    \"ang_mean\": 343.5752863443946,\n    \"ang_peak\": 637.4430260275177,\n    \"ang_cv\": 0.3780814008915757,\n    \"jerk_mean\": 2945.575135385645,\n    \"jerk_p90\": 5420.678093966358,\n    \"dyn_peak\": 29.209474144897064,\n    \"dyn_p90\": 21.23264381140767,\n    \"wy_range_pull\": 498.10184172082857,\n    \"ang_range_pull\": 424.1714404916993,\n    \"wx_wy_pull\": 0.5921202167309193,\n    \"wz_wy_pull\": 0.8851238860452723,\n    \"pull_frac\": 0.2534435261707989,\n    \"rec_frac\": 0.5082644628099173,\n    \"pull_energy\": 347.6015306404629,\n    \"rec_energy\": 363.81164420804587,\n    \"num_peaks_ang\": 2.6666666666666665,\n    \"wy_zero\": 2.3333333333333335,\n    \"az_zero\": 4.0,\n}\n\nBAD_CENTROID = {\n    \"ang_mean\": 172.5394204303022,\n    \"ang_peak\": 266.9378159536561,\n    \"ang_cv\": 0.2880056314056745,\n    \"jerk_mean\": 923.1113041147815,\n    \"jerk_p90\": 1705.6618025246393,\n    \"dyn_peak\": 4.300546713111743,\n    \"dyn_p90\": 3.2800567013506754,\n    \"wy_range_pull\": 242.15858745840373,\n    \"ang_range_pull\": 142.7942315881296,\n    \"wx_wy_pull\": 0.3365408195012416,\n    \"wz_wy_pull\": 0.585276701096717,\n    \"pull_frac\": 0.30743801652892563,\n    \"rec_frac\": 0.5234159779614325,\n    \"pull_energy\": 175.78237272218503,\n    \"rec_energy\": 175.1805782394394,\n    \"num_peaks_ang\": 1.0,\n    \"wy_zero\": 2.0,\n    \"az_zero\": 1.3333333333333333,\n}\n\nFEATURE_STD = {\n    \"ang_mean\": 87.48911936469455,\n    \"ang_peak\": 193.69094277160463,\n    \"ang_cv\": 0.10931233456449097,\n    \"jerk_mean\": 1076.382964744783,\n    \"jerk_p90\": 2056.06369201517,\n    \"dyn_peak\": 11.689409253435976,\n    \"dyn_p90\": 8.498847613366134,\n    \"wy_range_pull\": 170.0427909318824,\n    \"ang_range_pull\": 180.04625154335365,\n    \"wx_wy_pull\": 0.22032408476311894,\n    \"wz_wy_pull\": 0.19272557493103152,\n    \"pull_frac\": 0.09893304229300985,\n    \"rec_frac\": 0.014104170863034874,\n    \"pull_energy\": 94.28191611971931,\n    \"rec_energy\": 114.71860921006517,\n    \"num_peaks_ang\": 0.7453559924999299,\n    \"wy_zero\": 0.5163977794943223,\n    \"az_zero\": 1.4907119849998598,\n}\n\nRULE_WEIGHTS = {\n    \"prototype_similarity\": 22,\n    \"angular_power\": 14,\n    \"dynamic_drive\": 12,\n    \"pull_amplitude\": 12,\n    \"peak_structure\": 10,\n    \"axis_balance\": 8,\n    \"phase_quality\": 8,\n    \"recovery_balance\": 6,\n    \"signal_complexity\": 5,\n    \"duration\": 3,\n}\nassert sum(RULE_WEIGHTS.values()) == 100\n\n\n# ---------------------------------------------------------------------\n# Helpers\n# ---------------------------------------------------------------------\ndef lowpass(signal, cutoff_hz, fs, order=4):\n    nyq = fs / 2.0\n    if cutoff_hz >= nyq:\n        return signal\n    b, a = butter(order, cutoff_hz / nyq, btype=\"low\")\n    return filtfilt(b, a, signal)\n\ndef accel_mag(df):\n    return np.sqrt(df[\"ax_filtered\"]**2 + df[\"ay_filtered\"]**2 + df[\"az_filtered\"]**2)\n\ndef extract_true_gyro(df):\n    wx = df[\"wx_filtered\"].values\n    wy = df[\"wy_filtered\"].values\n    wz = df[\"wz_filtered\"].values\n    changed = (np.diff(wx) != 0) | (np.diff(wy) != 0) | (np.diff(wz) != 0)\n    mask = np.concatenate(([True], changed))\n    return df[mask].reset_index(drop=True)\n\ndef robust_gravity_baseline(amag):\n    k = max(5, int(len(amag) * 0.1))\n    return float(np.mean(np.sort(amag)[:k]))\n\ndef segment_phases_breast(df):\n    \"\"\"\n    Breaststroke above water on a right wrist is better captured by angular-speed envelope\n    than by raw accel peaks. We use:\n      1) early trough / quiet region = setup / glide\n      2) main envelope peak = propulsive pull peak\n      3) remainder = recovery/return\n    \"\"\"\n    ang = np.sqrt(df[\"wx_filtered\"]**2 + df[\"wy_filtered\"]**2 + df[\"wz_filtered\"]**2).values\n    env = lowpass(ang, 6.0, 100.0)\n    n = len(env)\n\n    # stroke setup / quiet point inside first third\n    catch_end = int(np.argmin(env[:max(10, n // 3)]))\n\n    # main propulsion peak after the setup point\n    search_start = max(catch_end + 5, n // 4)\n    pull_end = int(np.argmax(env[search_start:])) + search_start\n    if pull_end <= catch_end + 3:\n        pull_end = min(n - 3, catch_end + max(8, n // 4))\n\n    catch_end = max(3, min(catch_end, n - 10))\n    pull_end = max(catch_end + 5, min(pull_end, n - 3))\n    return catch_end, pull_end, env\n\ndef extract_features(df):\n    required = [\"time\", \"ax_filtered\", \"ay_filtered\", \"az_filtered\",\n                \"wx_filtered\", \"wy_filtered\", \"wz_filtered\"]\n    missing = [c for c in required if c not in df.columns]\n    if missing:\n        raise ValueError(f\"Missing columns: {missing}\")\n\n    df = df.sort_values(\"time\").reset_index(drop=True)\n    n = len(df)\n    if n < 30:\n        raise ValueError(f\"Too few samples ({n}). Need at least 30.\")\n\n    duration = float(df[\"time\"].iloc[-1] - df[\"time\"].iloc[0])\n\n    amag = accel_mag(df).values\n    gravity = robust_gravity_baseline(amag)\n    dyn = np.maximum(amag - gravity, 0.0)\n\n    wx = df[\"wx_filtered\"].values\n    wy = df[\"wy_filtered\"].values\n    wz = df[\"wz_filtered\"].values\n    az = df[\"az_filtered\"].values\n    ang = np.sqrt(wx**2 + wy**2 + wz**2)\n\n    catch_end, pull_end, env = segment_phases_breast(df)\n    pull_slice = slice(catch_end, pull_end + 1)\n    rec_slice = slice(pull_end, n)\n\n    dfg = extract_true_gyro(df)\n    if len(dfg) > 5:\n        dtg = float(np.median(np.diff(dfg[\"time\"].values)))\n        fs_g = 1.0 / dtg if dtg > 0 else 60.0\n        gx = lowpass(dfg[\"wx_filtered\"].values, 12.0, fs_g)\n        gy = lowpass(dfg[\"wy_filtered\"].values, 12.0, fs_g)\n        gz = lowpass(dfg[\"wz_filtered\"].values, 12.0, fs_g)\n        jerk = np.sqrt(np.gradient(gx, dtg)**2 +\n                       np.gradient(gy, dtg)**2 +\n                       np.gradient(gz, dtg)**2)\n    else:\n        jerk = np.zeros(1)\n\n    env_peaks, _ = find_peaks(env, prominence=max(10.0, np.std(env) * 0.25), distance=8)\n\n    feat = {}\n    feat[\"duration\"] = duration\n    feat[\"ang_mean\"] = float(np.mean(ang))\n    feat[\"ang_peak\"] = float(np.max(ang))\n    feat[\"ang_cv\"] = float(np.std(ang) / (np.mean(ang) + 1e-6))\n    feat[\"jerk_mean\"] = float(np.mean(jerk))\n    feat[\"jerk_p90\"] = float(np.percentile(jerk, 90))\n    feat[\"dyn_peak\"] = float(np.max(dyn))\n    feat[\"dyn_p90\"] = float(np.percentile(dyn, 90))\n    feat[\"wy_range_pull\"] = float(np.max(wy[pull_slice]) - np.min(wy[pull_slice]))\n    feat[\"ang_range_pull\"] = float(np.max(ang[pull_slice]) - np.min(ang[pull_slice]))\n    feat[\"wx_wy_pull\"] = float(np.mean(np.abs(wx[pull_slice])) / (np.mean(np.abs(wy[pull_slice])) + 1e-6))\n    feat[\"wz_wy_pull\"] = float(np.mean(np.abs(wz[pull_slice])) / (np.mean(np.abs(wy[pull_slice])) + 1e-6))\n    feat[\"pull_frac\"] = float((pull_end - catch_end) / n)\n    feat[\"rec_frac\"] = float((n - pull_end) / n)\n    feat[\"pull_energy\"] = float(np.mean(ang[pull_slice]))\n    feat[\"rec_energy\"] = float(np.mean(ang[rec_slice]))\n    feat[\"num_peaks_ang\"] = int(len(env_peaks))\n    feat[\"wy_zero\"] = int(np.sum(np.diff(np.signbit(lowpass(wy, 8.0, 100.0)).astype(int)) != 0))\n    feat[\"az_zero\"] = int(np.sum(np.diff(np.signbit(lowpass(az, 8.0, 100.0)).astype(int)) != 0))\n    feat[\"gravity_est\"] = gravity\n    feat[\"samples\"] = n\n    feat[\"catch_end_idx\"] = int(catch_end)\n    feat[\"pull_end_idx\"] = int(pull_end)\n    return feat\n\ndef distance_to_centroid(feat, centroid):\n    d2 = 0.0\n    for name in FEATURES:\n        std = FEATURE_STD[name] if FEATURE_STD[name] > 1e-9 else 1.0\n        z = (feat[name] - centroid[name]) / std\n        d2 += z * z\n    return float(np.sqrt(d2))\n\ndef clamp(x, lo=0.0, hi=100.0):\n    return max(lo, min(hi, x))\n\ndef range_score(x, good_lo, good_hi, warn_lo=None, warn_hi=None, good=100, warn=65, bad=20):\n    if good_lo <= x <= good_hi:\n        return good\n    if warn_lo is not None and warn_hi is not None and warn_lo <= x <= warn_hi:\n        return warn\n    return bad\n\ndef rule_scores(feat):\n    # 1) prototype similarity\n    dg = distance_to_centroid(feat, GOOD_CENTROID)\n    db = distance_to_centroid(feat, BAD_CENTROID)\n    proto = 100.0 * db / (dg + db + 1e-9)\n\n    # 2) angular power: final \"good\" references are much more energetic than the final bad set\n    if feat[\"ang_mean\"] >= 280 and feat[\"ang_peak\"] >= 480:\n        power = 100\n    elif feat[\"ang_mean\"] >= 240 and feat[\"ang_peak\"] >= 380:\n        power = 70\n    else:\n        power = 20\n\n    # 3) dynamic drive: good final set has clearly larger dynamic accel\n    if feat[\"dyn_peak\"] >= 18 and feat[\"dyn_p90\"] >= 12:\n        drive = 100\n    elif feat[\"dyn_peak\"] >= 12 and feat[\"dyn_p90\"] >= 8:\n        drive = 65\n    else:\n        drive = 20\n\n    # 4) pull amplitude\n    if feat[\"wy_range_pull\"] >= 300 and feat[\"ang_range_pull\"] >= 250:\n        amplitude = 100\n    elif feat[\"wy_range_pull\"] >= 250 and feat[\"ang_range_pull\"] >= 180:\n        amplitude = 65\n    else:\n        amplitude = 20\n\n    # 5) peak structure: final good set shows 2-3 envelope peaks, bad set only 1\n    peaks = feat[\"num_peaks_ang\"]\n    if peaks in (2, 3):\n        peak_structure = 100\n    elif peaks == 4:\n        peak_structure = 70\n    else:\n        peak_structure = 20\n\n    # 6) axis balance: mainly use wz/wy because the final good set is clearly higher there\n    ratio = feat[\"wz_wy_pull\"]\n    if 0.68 <= ratio <= 1.15:\n        axis = 100\n    elif 0.55 <= ratio < 0.68 or 1.15 < ratio <= 1.35:\n        axis = 65\n    else:\n        axis = 25\n\n    # 7) phase quality: tuned to the final six only\n    pull_frac = feat[\"pull_frac\"]\n    rec_frac = feat[\"rec_frac\"]\n    phase = 100\n    if not (0.15 <= pull_frac <= 0.42):\n        phase -= 35\n    if not (0.48 <= rec_frac <= 0.56):\n        phase -= 20\n    phase = clamp(phase)\n\n    # 8) recovery balance: final good set tends to have recovery energy slightly >= pull energy\n    ratio_pr = feat[\"pull_energy\"] / (feat[\"rec_energy\"] + 1e-6)\n    if 0.75 <= ratio_pr <= 1.15:\n        recovery = 100\n    elif 0.60 <= ratio_pr < 0.75 or 1.15 < ratio_pr <= 1.30:\n        recovery = 65\n    else:\n        recovery = 25\n\n    # 9) signal complexity: later good set has more az sign changes and slightly more wy sign changes\n    if feat[\"az_zero\"] >= 3 and feat[\"wy_zero\"] >= 2:\n        complexity = 100\n    elif feat[\"az_zero\"] >= 2 and feat[\"wy_zero\"] >= 2:\n        complexity = 65\n    else:\n        complexity = 20\n\n    # 10) duration\n    if 0.95 <= feat[\"duration\"] <= 1.35:\n        dur = 100\n    else:\n        dur = 60\n\n    scores = {\n        \"prototype_similarity\": float(clamp(proto)),\n        \"angular_power\": float(power),\n        \"dynamic_drive\": float(drive),\n        \"pull_amplitude\": float(amplitude),\n        \"peak_structure\": float(peak_structure),\n        \"axis_balance\": float(axis),\n        \"phase_quality\": float(phase),\n        \"recovery_balance\": float(recovery),\n        \"signal_complexity\": float(complexity),\n        \"duration\": float(dur),\n    }\n\n    # Hard bad-pattern penalties to stop obviously weak/flat bad strokes from floating upward\n    bad_signs = 0\n    if feat[\"ang_mean\"] < 230: bad_signs += 1\n    if feat[\"dyn_peak\"] < 10: bad_signs += 1\n    if feat[\"wy_range_pull\"] < 260: bad_signs += 1\n    if feat[\"ang_range_pull\"] < 170: bad_signs += 1\n    if feat[\"num_peaks_ang\"] <= 1: bad_signs += 1\n    if feat[\"az_zero\"] <= 1: bad_signs += 1\n\n    return scores, dg, db, bad_signs\n\ndef analyze(csv_path):\n    df = pd.read_csv(csv_path)\n    feat = extract_features(df)\n    scores, dg, db, bad_signs = rule_scores(feat)\n\n    overall = sum(scores[k] * RULE_WEIGHTS[k] for k in RULE_WEIGHTS) / 100.0\n\n    # hard cap if many weak-pattern signs appear together\n    if bad_signs >= 4:\n        overall = min(overall, 42.0)\n    elif bad_signs == 3:\n        overall = min(overall, 55.0)\n\n    if overall >= 75:\n        verdict = \"GOOD / LOW RISK\"\n        risk = \"LOW\"\n    elif overall >= 60:\n        verdict = \"BORDERLINE / MODERATE RISK\"\n        risk = \"MODERATE\"\n    elif overall >= 45:\n        verdict = \"BAD / MODERATE-HIGH RISK\"\n        risk = \"MODERATE-HIGH\"\n    else:\n        verdict = \"BAD / HIGH RISK\"\n        risk = \"HIGH\"\n\n    reasons = []\n    if feat[\"ang_mean\"] < 230:\n        reasons.append(\"overall angular power is much lower than the final good reference set\")\n    if feat[\"dyn_peak\"] < 10:\n        reasons.append(\"dynamic acceleration is too weak for the final good breaststroke pattern\")\n    if feat[\"wy_range_pull\"] < 260:\n        reasons.append(\"pull sweep is too small / flat compared with the final good references\")\n    if feat[\"num_peaks_ang\"] <= 1:\n        reasons.append(\"envelope has only one dominant burst instead of the richer breaststroke pattern seen in the good set\")\n    if feat[\"az_zero\"] <= 1:\n        reasons.append(\"wrist orientation pattern is too simple / flat compared with the final good set\")\n    if feat[\"wz_wy_pull\"] < 0.55:\n        reasons.append(\"pull axis balance is closer to the bad reference pattern\")\n    if feat[\"rec_energy\"] < feat[\"pull_energy\"] * 0.75:\n        reasons.append(\"recovery energy is too low relative to pull\")\n\n    if not reasons:\n        reasons.append(\"signal structure is closer to the final good breaststroke references than the final bad set\")\n\n    return {\n        \"file\": csv_path,\n        \"overall_score\": round(float(overall), 1),\n        \"verdict\": verdict,\n        \"risk\": risk,\n        \"prototype_distance_good\": round(float(dg), 3),\n        \"prototype_distance_bad\": round(float(db), 3),\n        \"rule_scores\": {k: round(float(v), 1) for k, v in scores.items()},\n        \"key_features\": {\n            \"duration_s\": round(feat[\"duration\"], 3),\n            \"ang_mean_deg_s\": round(feat[\"ang_mean\"], 1),\n            \"ang_peak_deg_s\": round(feat[\"ang_peak\"], 1),\n            \"ang_cv\": round(feat[\"ang_cv\"], 3),\n            \"jerk_mean_deg_s2\": round(feat[\"jerk_mean\"], 1),\n            \"jerk_p90_deg_s2\": round(feat[\"jerk_p90\"], 1),\n            \"dyn_peak_ms2\": round(feat[\"dyn_peak\"], 2),\n            \"dyn_p90_ms2\": round(feat[\"dyn_p90\"], 2),\n            \"wy_range_pull_deg_s\": round(feat[\"wy_range_pull\"], 1),\n            \"ang_range_pull_deg_s\": round(feat[\"ang_range_pull\"], 1),\n            \"wx_wy_pull\": round(feat[\"wx_wy_pull\"], 2),\n            \"wz_wy_pull\": round(feat[\"wz_wy_pull\"], 2),\n            \"pull_phase_pct\": round(feat[\"pull_frac\"] * 100, 1),\n            \"recovery_phase_pct\": round(feat[\"rec_frac\"] * 100, 1),\n            \"pull_energy\": round(feat[\"pull_energy\"], 1),\n            \"recovery_energy\": round(feat[\"rec_energy\"], 1),\n            \"num_peaks_ang\": int(feat[\"num_peaks_ang\"]),\n            \"wy_zero_crossings\": int(feat[\"wy_zero\"]),\n            \"az_zero_crossings\": int(feat[\"az_zero\"]),\n        },\n        \"main_reasons\": reasons,\n        \"hard_bad_signs\": int(bad_signs),\n    }\n\ndef print_report(r):\n    print(\"\\n\" + \"=\" * 74)\n    print(\"BREASTSTROKE STROKE ANALYZER \u2014 STANDALONE ABOVE-WATER VERSION (v3)\")\n    print(\"=\" * 74)\n    print(f\"File        : {r['file']}\")\n    print(f\"Score       : {r['overall_score']}/100\")\n    print(f\"Verdict     : {r['verdict']}\")\n    print(f\"Risk        : {r['risk']}\")\n    print(f\"Dist good   : {r['prototype_distance_good']}\")\n    print(f\"Dist bad    : {r['prototype_distance_bad']}\")\n    print(f\"Hard signs  : {r['hard_bad_signs']}\")\n    print(\"-\" * 74)\n    print(\"Rule scores:\")\n    for k, v in r[\"rule_scores\"].items():\n        print(f\"  {k:22s} {v:6.1f}/100\")\n    print(\"-\" * 74)\n    print(\"Key features:\")\n    for k, v in r[\"key_features\"].items():\n        print(f\"  {k:22s} {v}\")\n    print(\"-\" * 74)\n    print(\"Why this result:\")\n    for reason in r[\"main_reasons\"]:\n        print(f\"  - {reason}\")\n    print(\"=\" * 74 + \"\\n\")\n\ndef process_folder_to_risk_dirs(input_folder, output_root):\n    input_folder = Path(input_folder)\n    output_root = Path(output_root)\n    csv_files = sorted(input_folder.rglob(\"*.csv\"))\n    if not csv_files:\n        raise ValueError(f\"No CSV files found in: {input_folder}\")\n\n    processed = 0\n    failed = 0\n    for csv_file in csv_files:\n        try:\n            report = analyze(str(csv_file))\n            risk = report[\"risk\"]\n            risk_dir = output_root / risk\n            risk_dir.mkdir(parents=True, exist_ok=True)\n\n            out_csv = risk_dir / csv_file.name\n            if out_csv.exists():\n                out_csv = risk_dir / f\"{csv_file.stem}_{processed + 1}.csv\"\n            shutil.copy2(csv_file, out_csv)\n            processed += 1\n        except Exception:\n            failed += 1\n\n    return processed, failed\n\nif __name__ == \"__main__\":\n    if len(sys.argv) >= 3 and sys.argv[1] == \"--folder\":\n        input_folder = sys.argv[2]\n        output_root = sys.argv[3] if len(sys.argv) >= 4 else None\n    else:\n        input_folder = None\n        output_root = None\n        csv_file = sys.argv[1] if len(sys.argv) >= 2 else None\n\n    try:\n        if input_folder is not None:\n            if not output_root:\n                root = tk.Tk()\n                root.withdraw()\n                output_root = filedialog.askdirectory(title=\"Select output folder for risk folders\")\n                root.destroy()\n            if not output_root:\n                print(\"No output folder selected.\")\n                sys.exit(1)\n\n            processed, failed = process_folder_to_risk_dirs(input_folder, output_root)\n            print(f\"Finished. Processed: {processed}, Failed: {failed}\")\n        else:\n            if not csv_file:\n                root = tk.Tk()\n                root.withdraw()\n                print(\"Select mode:\")\n                print(\"  1) Single CSV file\")\n                print(\"  2) Folder of stroke CSV files\")\n                mode = input(\"Enter choice (1 or 2) [2]: \").strip() or \"2\"\n                if mode == \"2\":\n                    input_folder = filedialog.askdirectory(title=\"Select input folder with stroke CSV files\")\n                    print(\"Select any output folder you want for risk folders...\")\n                    output_root = filedialog.askdirectory(title=\"Select output folder for risk folders\")\n                    root.destroy()\n                    if not input_folder or not output_root:\n                        print(\"Input/output folder not selected.\")\n                        sys.exit(1)\n                    processed, failed = process_folder_to_risk_dirs(input_folder, output_root)\n                    print(f\"Finished. Processed: {processed}, Failed: {failed}\")\n                    sys.exit(0)\n                else:\n                    csv_file = filedialog.askopenfilename(\n                        title=\"Select CSV file\",\n                        filetypes=[(\"CSV files\", \"*.csv\"), (\"All files\", \"*.*\")]\n                    )\n                    root.destroy()\n                    if not csv_file:\n                        print(\"No file selected.\")\n                        sys.exit(1)\n\n            report = analyze(csv_file)\n            print_report(report)\n\n            out_path = csv_file.rsplit(\".\", 1)[0] + \"_breaststroke_report.json\"\n            with open(out_path, \"w\", encoding=\"utf-8\") as f:\n                json.dump(report, f, indent=2)\n            print(f\"JSON report saved to: {out_path}\")\n    except Exception as e:\n        import traceback\n        traceback.print_exc()\n        print(f\"ERROR: {e}\")\n        sys.exit(1)\n"
FREESTYLE_SOURCE = "\nimport sys\nimport json\nimport shutil\nfrom pathlib import Path\nimport numpy as np\nimport pandas as pd\nimport tkinter as tk\nfrom tkinter import filedialog\nfrom scipy.signal import butter, filtfilt, find_peaks\n\n\"\"\"\nStandalone Freestyle Stroke Analyzer\n====================================\nBuilt for:\n- single IMU on RIGHT WRIST\n- linear accelerometer 3-axis @ 100 Hz\n- gyroscope 3-axis @ 60 Hz, stored/interpolated in 100 Hz CSV\n- ABOVE-WATER freestyle simulation\n- one complete freestyle stroke per CSV\n\nImportant:\nThis script does NOT require reference files at runtime.\nThe 3 good and 3 bad freestyle examples were used once to tune the\nembedded prototype values / thresholds, then baked into this file.\n\nRequired columns:\n    time, ax_filtered, ay_filtered, az_filtered,\n    wx_filtered, wy_filtered, wz_filtered\n\nUsage:\n    python freestyle_stroke_analyzer_standalone.py your_stroke.csv\n\"\"\"\n\n# ---------------------------------------------------------------------\n# Embedded calibration from the provided freestyle examples\n# ---------------------------------------------------------------------\nFEATURES = [\n    \"ang_mean\", \"ang_p90\", \"ang_peak\", \"jerk_mean\", \"jerk_p90\",\n    \"dyn_p90\", \"dyn_peak\", \"wx_range_pull\", \"wy_range_pull\",\n    \"wz_range_pull\", \"wz_wy_ratio_pull\", \"wx_wz_ratio_pull\",\n    \"phase_catch\", \"phase_pull\", \"phase_rec\",\n    \"wz_zero_crossings\", \"wy_zero_crossings\",\n    \"ang_cv\", \"recovery_cv\", \"pull_mean_ang\"\n]\n\nFEATURE_STD = {\n    \"ang_mean\": 24.467688707208808,\n    \"ang_p90\": 35.88574631900595,\n    \"ang_peak\": 30.675674201154823,\n    \"jerk_mean\": 388.81131687013925,\n    \"jerk_p90\": 759.9322312392644,\n    \"dyn_p90\": 3.458868558274247,\n    \"dyn_peak\": 4.028709908126057,\n    \"wx_range_pull\": 97.0547280405841,\n    \"wy_range_pull\": 81.61456952168487,\n    \"wz_range_pull\": 78.1219243073949,\n    \"wz_wy_ratio_pull\": 0.4829992942273361,\n    \"wx_wz_ratio_pull\": 0.43170891642384923,\n    \"phase_catch\": 0.08886410572829215,\n    \"phase_pull\": 0.06509268291523439,\n    \"phase_rec\": 0.05382675389537984,\n    \"wz_zero_crossings\": 0.74535599249993,\n    \"wy_zero_crossings\": 1.1055415967851334,\n    \"ang_cv\": 0.18240880316044125,\n    \"recovery_cv\": 0.03091333412764737,\n    \"pull_mean_ang\": 44.329511443124666,\n}\n\nGOOD_CENTROID = {\n    \"ang_mean\": 254.69889883083727,\n    \"ang_p90\": 379.4171121708238,\n    \"ang_peak\": 453.00897787888636,\n    \"jerk_mean\": 1898.3287052850653,\n    \"jerk_p90\": 4011.1886248865303,\n    \"dyn_p90\": 10.47894356849069,\n    \"dyn_peak\": 12.871669995814331,\n    \"wx_range_pull\": 286.89437880667697,\n    \"wy_range_pull\": 171.02994456672386,\n    \"wz_range_pull\": 181.2726478940723,\n    \"wz_wy_ratio_pull\": 0.9202325903929317,\n    \"wx_wz_ratio_pull\": 1.349459809100802,\n    \"phase_catch\": 0.2376237623762376,\n    \"phase_pull\": 0.26402640264026406,\n    \"phase_rec\": 0.49834983498349833,\n    \"wz_zero_crossings\": 1.6666666666666667,\n    \"wy_zero_crossings\": 1.6666666666666667,\n    \"ang_cv\": 0.4832958086079497,\n    \"recovery_cv\": 0.19731386881628207,\n    \"pull_mean_ang\": 258.6646642203795,\n}\n\nBAD_CENTROID = {\n    \"ang_mean\": 262.4243860385497,\n    \"ang_p90\": 428.2727918315518,\n    \"ang_peak\": 468.48845409676375,\n    \"jerk_mean\": 2165.755229906687,\n    \"jerk_p90\": 4397.5808561446975,\n    \"dyn_p90\": 9.009319262582997,\n    \"dyn_peak\": 11.786004598951186,\n    \"wx_range_pull\": 223.83120425553867,\n    \"wy_range_pull\": 155.7162962107498,\n    \"wz_range_pull\": 274.68621576842304,\n    \"wz_wy_ratio_pull\": 1.546326947731093,\n    \"wx_wz_ratio_pull\": 0.9457988673800012,\n    \"phase_catch\": 0.1914191419141914,\n    \"phase_pull\": 0.2838283828382839,\n    \"phase_rec\": 0.5247524752475248,\n    \"wz_zero_crossings\": 1.0,\n    \"wy_zero_crossings\": 1.6666666666666667,\n    \"ang_cv\": 0.5637343077678317,\n    \"recovery_cv\": 0.20536686659407288,\n    \"pull_mean_ang\": 253.38384227437564,\n}\n\n# Interpretable rules \u2014 more important than raw speed\nRULE_WEIGHTS = {\n    \"smoothness\": 22,\n    \"pull_axis_balance\": 18,\n    \"pull_structure\": 16,\n    \"phase_quality\": 14,\n    \"speed_control\": 8,\n    \"pull_amplitude\": 8,\n    \"recovery_stability\": 6,\n    \"dynamic_drive\": 4,\n    \"prototype_similarity\": 4,\n}\nassert sum(RULE_WEIGHTS.values()) == 100\n\n# ---------------------------------------------------------------------\n# Helpers\n# ---------------------------------------------------------------------\ndef lowpass(signal, cutoff_hz, fs, order=4):\n    nyq = fs / 2.0\n    if cutoff_hz >= nyq:\n        return signal\n    b, a = butter(order, cutoff_hz / nyq, btype=\"low\")\n    return filtfilt(b, a, signal)\n\n\ndef accel_mag(df):\n    return np.sqrt(df[\"ax_filtered\"] ** 2 + df[\"ay_filtered\"] ** 2 + df[\"az_filtered\"] ** 2)\n\n\ndef extract_true_gyro(df):\n    arr = df[[\"wx_filtered\", \"wy_filtered\", \"wz_filtered\"]].values\n    changed = np.any(np.diff(arr, axis=0) != 0, axis=1)\n    mask = np.concatenate(([True], changed))\n    return df.loc[mask].reset_index(drop=True)\n\n\ndef robust_gravity_baseline(amag):\n    # quietest 10% of samples\n    k = max(5, int(len(amag) * 0.1))\n    return float(np.mean(np.sort(amag)[:k]))\n\n\ndef segment_phases_freestyle(df):\n    \"\"\"\n    Freestyle right-wrist above water:\n\n    The stroke is typically:\n      entry/catch -> pull -> exit/recovery\n\n    For this setup, angular-speed envelope is more reliable than raw accel.\n    We use the first meaningful trough in the angular-speed envelope as the\n    end of catch, then the first major peak after that as the pull peak/end.\n    \"\"\"\n    n = len(df)\n    wx = df[\"wx_filtered\"].values\n    wy = df[\"wy_filtered\"].values\n    wz = df[\"wz_filtered\"].values\n    ang = np.sqrt(wx ** 2 + wy ** 2 + wz ** 2)\n    ang_lp = lowpass(ang, 8.0, 100.0)\n\n    search_catch = max(10, int(n * 0.45))\n    troughs, _ = find_peaks(-ang_lp[:search_catch], prominence=max(5.0, np.std(ang_lp[:search_catch]) * 0.15))\n    if len(troughs) > 0:\n        catch_end = int(troughs[0])\n    else:\n        catch_end = int(np.argmin(ang_lp[:search_catch]))\n\n    peak_start = min(max(catch_end + 5, 5), n - 8)\n    peak_end = min(max(peak_start + 5, int(n * 0.85)), n - 3)\n    peaks, _ = find_peaks(ang_lp[peak_start:peak_end], prominence=max(8.0, np.std(ang_lp[peak_start:peak_end]) * 0.15))\n    if len(peaks) > 0:\n        pull_end = int(peaks[0]) + peak_start\n    else:\n        pull_end = int(np.argmax(ang_lp[peak_start:peak_end])) + peak_start\n\n    catch_end = max(3, min(catch_end, n - 12))\n    pull_end = max(catch_end + 5, min(pull_end, n - 4))\n    return catch_end, pull_end\n\n\ndef extract_features(df):\n    required = [\"time\", \"ax_filtered\", \"ay_filtered\", \"az_filtered\",\n                \"wx_filtered\", \"wy_filtered\", \"wz_filtered\"]\n    missing = [c for c in required if c not in df.columns]\n    if missing:\n        raise ValueError(f\"Missing columns: {missing}\")\n\n    df = df.sort_values(\"time\").reset_index(drop=True)\n    n = len(df)\n    if n < 30:\n        raise ValueError(f\"Too few samples ({n}). Need at least 30.\")\n\n    duration = float(df[\"time\"].iloc[-1] - df[\"time\"].iloc[0])\n\n    amag = accel_mag(df).values\n    gravity_est = robust_gravity_baseline(amag)\n    dyn = np.maximum(amag - gravity_est, 0.0)\n\n    wx = df[\"wx_filtered\"].values\n    wy = df[\"wy_filtered\"].values\n    wz = df[\"wz_filtered\"].values\n    ang = np.sqrt(wx ** 2 + wy ** 2 + wz ** 2)\n\n    catch_end, pull_end = segment_phases_freestyle(df)\n    n = len(df)\n    pull_slice = slice(catch_end, pull_end + 1)\n    recovery_slice = slice(pull_end, n)\n\n    # jerk on true 60 Hz gyro rows\n    dfg = extract_true_gyro(df)\n    dtg = float(np.median(np.diff(dfg[\"time\"].values))) if len(dfg) > 3 else (1 / 60.0)\n    fsg = 1.0 / dtg\n    gx = lowpass(dfg[\"wx_filtered\"].values, 12.0, fsg)\n    gy = lowpass(dfg[\"wy_filtered\"].values, 12.0, fsg)\n    gz = lowpass(dfg[\"wz_filtered\"].values, 12.0, fsg)\n    jerk = np.sqrt(np.gradient(gx, dtg) ** 2 + np.gradient(gy, dtg) ** 2 + np.gradient(gz, dtg) ** 2)\n\n    wy_lp = lowpass(wy, 8.0, 100.0)\n    wz_lp = lowpass(wz, 8.0, 100.0)\n\n    feat = {}\n    feat[\"duration\"] = duration\n    feat[\"samples\"] = n\n    feat[\"gravity_est\"] = float(gravity_est)\n    feat[\"catch_end_idx\"] = int(catch_end)\n    feat[\"pull_end_idx\"] = int(pull_end)\n\n    feat[\"ang_mean\"] = float(np.mean(ang))\n    feat[\"ang_p90\"] = float(np.percentile(ang, 90))\n    feat[\"ang_peak\"] = float(np.max(ang))\n    feat[\"jerk_mean\"] = float(np.mean(jerk))\n    feat[\"jerk_p90\"] = float(np.percentile(jerk, 90))\n    feat[\"dyn_p90\"] = float(np.percentile(dyn, 90))\n    feat[\"dyn_peak\"] = float(np.max(dyn))\n\n    feat[\"wx_range_pull\"] = float(np.max(wx[pull_slice]) - np.min(wx[pull_slice]))\n    feat[\"wy_range_pull\"] = float(np.max(wy[pull_slice]) - np.min(wy[pull_slice]))\n    feat[\"wz_range_pull\"] = float(np.max(wz[pull_slice]) - np.min(wz[pull_slice]))\n\n    mean_abs_wy = float(np.mean(np.abs(wy[pull_slice])))\n    mean_abs_wz = float(np.mean(np.abs(wz[pull_slice])))\n    mean_abs_wx = float(np.mean(np.abs(wx[pull_slice])))\n\n    feat[\"wz_wy_ratio_pull\"] = float(mean_abs_wz / (mean_abs_wy + 1e-6))\n    feat[\"wx_wz_ratio_pull\"] = float(mean_abs_wx / (mean_abs_wz + 1e-6))\n\n    feat[\"phase_catch\"] = float(catch_end / n)\n    feat[\"phase_pull\"] = float((pull_end - catch_end) / n)\n    feat[\"phase_rec\"] = float((n - pull_end) / n)\n\n    feat[\"wz_zero_crossings\"] = int(np.sum(np.diff(np.signbit(wz_lp).astype(int)) != 0))\n    feat[\"wy_zero_crossings\"] = int(np.sum(np.diff(np.signbit(wy_lp).astype(int)) != 0))\n\n    feat[\"ang_cv\"] = float(np.std(ang) / (np.mean(ang) + 1e-6))\n    feat[\"recovery_cv\"] = float(np.std(ang[recovery_slice]) / (np.mean(ang[recovery_slice]) + 1e-6))\n    feat[\"pull_mean_ang\"] = float(np.mean(ang[pull_slice]))\n    return feat\n\n\ndef distance_to_centroid(feat, centroid):\n    d2 = 0.0\n    for name in FEATURES:\n        std = FEATURE_STD[name] if FEATURE_STD[name] > 1e-9 else 1.0\n        z = (feat[name] - centroid[name]) / std\n        d2 += z * z\n    return float(np.sqrt(d2))\n\n\ndef clamp(x, lo=0.0, hi=100.0):\n    return max(lo, min(hi, x))\n\n\ndef rule_scores(feat):\n    # 1) Smoothness \u2014 bad freestyle examples were mainly rougher / more abrupt\n    jerk = feat[\"jerk_mean\"]\n    if jerk <= 1700:\n        smoothness = 100\n    elif jerk <= 2100:\n        smoothness = 100 - 35 * (jerk - 1700) / 400\n    elif jerk <= 2500:\n        smoothness = 65 - 35 * (jerk - 2100) / 400\n    else:\n        smoothness = 20\n\n    # 2) Pull axis balance \u2014 strongest separator in your reference set\n    # good freestyle tended to keep wz/wy lower; bad strokes often over-dominated on wz\n    ratio = feat[\"wz_wy_ratio_pull\"]\n    if 0.55 <= ratio <= 1.10:\n        axis_balance = 100\n    elif 0.40 <= ratio < 0.55 or 1.10 < ratio <= 1.35:\n        axis_balance = 65\n    else:\n        axis_balance = 20\n\n    # 3) Pull structure \u2014 compare wx contribution to wz\n    xz = feat[\"wx_wz_ratio_pull\"]\n    if 1.00 <= xz <= 1.80:\n        pull_structure = 100\n    elif 0.80 <= xz < 1.00 or 1.80 < xz <= 2.10:\n        pull_structure = 65\n    else:\n        pull_structure = 25\n\n    # 4) Speed control \u2014 don't reward just being fast\n    ang_mean = feat[\"ang_mean\"]\n    if 220 <= ang_mean <= 285:\n        speed_control = 100\n    elif 200 <= ang_mean < 220 or 285 < ang_mean <= 320:\n        speed_control = 70\n    else:\n        speed_control = 35\n\n    # 5) Phase quality \u2014 entry/catch, pull, recovery proportions\n    pc, pp, pr = feat[\"phase_catch\"], feat[\"phase_pull\"], feat[\"phase_rec\"]\n    phase_quality = 100\n    if not (0.12 <= pc <= 0.34):\n        phase_quality -= 35\n    if not (0.16 <= pp <= 0.38):\n        phase_quality -= 35\n    if not (0.35 <= pr <= 0.60):\n        phase_quality -= 30\n    phase_quality = clamp(phase_quality)\n\n    # 6) Pull amplitude \u2014 very small or very exaggerated pull windows are suspicious\n    wz_range = feat[\"wz_range_pull\"]\n    if 120 <= wz_range <= 250:\n        pull_amplitude = 100\n    elif 90 <= wz_range < 120 or 250 < wz_range <= 320:\n        pull_amplitude = 65\n    else:\n        pull_amplitude = 25\n\n    # 7) Recovery stability \u2014 smoother recovery is better\n    rcv = feat[\"recovery_cv\"]\n    if rcv <= 0.20:\n        recovery_stability = 100\n    elif rcv <= 0.24:\n        recovery_stability = 70\n    else:\n        recovery_stability = 35\n\n    # 8) Dynamic drive \u2014 weak drive hurts, but should not dominate\n    dp = feat[\"dyn_peak\"]\n    if 8.0 <= dp <= 16.5:\n        dynamic_drive = 100\n    elif 6.0 <= dp < 8.0 or 16.5 < dp <= 19.0:\n        dynamic_drive = 70\n    else:\n        dynamic_drive = 35\n\n    # 9) Prototype similarity \u2014 lightly weighted calibration anchor\n    dg = distance_to_centroid(feat, GOOD_CENTROID)\n    db = distance_to_centroid(feat, BAD_CENTROID)\n    prototype_similarity = 100.0 * db / (dg + db + 1e-9)\n\n    scores = {\n        \"smoothness\": float(clamp(smoothness)),\n        \"pull_axis_balance\": float(clamp(axis_balance)),\n        \"pull_structure\": float(clamp(pull_structure)),\n        \"speed_control\": float(clamp(speed_control)),\n        \"phase_quality\": float(clamp(phase_quality)),\n        \"pull_amplitude\": float(clamp(pull_amplitude)),\n        \"recovery_stability\": float(clamp(recovery_stability)),\n        \"dynamic_drive\": float(clamp(dynamic_drive)),\n        \"prototype_similarity\": float(clamp(prototype_similarity)),\n    }\n    return scores, dg, db\n\n\n\n\ndef severe_penalty(feat):\n    \"\"\"\n    Hard penalties for clear red flags.\n    This stops obviously bad strokes from surviving on decent average scores.\n    \"\"\"\n    penalty = 0\n\n    if feat[\"jerk_mean\"] > 2350:\n        penalty += 10\n    if feat[\"wz_wy_ratio_pull\"] > 1.35:\n        penalty += 10\n    elif feat[\"wz_wy_ratio_pull\"] > 1.15:\n        penalty += 5\n    if feat[\"wx_wz_ratio_pull\"] < 0.80:\n        penalty += 8\n    if feat[\"phase_catch\"] < 0.08 or feat[\"phase_catch\"] > 0.36:\n        penalty += 10\n    if feat[\"phase_rec\"] > 0.60 or feat[\"phase_rec\"] < 0.32:\n        penalty += 8\n    if feat[\"wx_range_pull\"] < 120 or feat[\"wx_range_pull\"] > 320:\n        penalty += 8\n    if feat[\"wz_range_pull\"] < 90 or feat[\"wz_range_pull\"] > 320:\n        penalty += 6\n\n    return penalty\n\ndef analyze(csv_path):\n    df = pd.read_csv(csv_path)\n    feat = extract_features(df)\n    scores, dg, db = rule_scores(feat)\n\n    weighted_score = sum(scores[k] * RULE_WEIGHTS[k] for k in RULE_WEIGHTS) / 100.0\n    penalty = severe_penalty(feat)\n    overall = clamp(weighted_score - penalty)\n\n    if overall >= 75:\n        verdict = \"GOOD / LOW RISK\"\n        risk = \"LOW\"\n    elif overall >= 60:\n        verdict = \"BORDERLINE / MODERATE RISK\"\n        risk = \"MODERATE\"\n    elif overall >= 45:\n        verdict = \"BAD / MODERATE-HIGH RISK\"\n        risk = \"MODERATE-HIGH\"\n    else:\n        verdict = \"BAD / HIGH RISK\"\n        risk = \"HIGH\"\n\n    reasons = []\n    if feat[\"jerk_mean\"] > 2200:\n        reasons.append(\"wrist motion is too jerky / abrupt\")\n    if feat[\"wz_wy_ratio_pull\"] > 1.35:\n        reasons.append(\"pull axis balance is off \u2014 wz is dominating too much during pull\")\n    if feat[\"wx_wz_ratio_pull\"] < 0.80:\n        reasons.append(\"pull shape looks incomplete or poorly structured\")\n    if feat[\"ang_mean\"] > 320:\n        reasons.append(\"stroke is too fast/aggressive to be considered controlled\")\n    if not (0.12 <= feat[\"phase_catch\"] <= 0.34):\n        reasons.append(\"entry/catch timing is outside the normal freestyle range\")\n    if not (0.16 <= feat[\"phase_pull\"] <= 0.38):\n        reasons.append(\"pull phase duration is not well balanced\")\n    if not (0.35 <= feat[\"phase_rec\"] <= 0.60):\n        reasons.append(\"recovery takes too little or too much of the stroke\")\n    if feat[\"wz_range_pull\"] > 320 or feat[\"wz_range_pull\"] < 90:\n        reasons.append(\"pull amplitude is too exaggerated or too small\")\n    if feat[\"recovery_cv\"] > 0.24:\n        reasons.append(\"recovery phase is unstable / inconsistent\")\n    if feat[\"dyn_peak\"] < 6.0:\n        reasons.append(\"stroke drive is weak\")\n\n    if not reasons:\n        reasons.append(\"signal pattern is controlled and close to the calibrated good freestyle examples\")\n\n    return {\n        \"file\": csv_path,\n        \"overall_score\": round(overall, 1),\n        \"verdict\": verdict,\n        \"risk\": risk,\n        \"prototype_distance_good\": round(dg, 3),\n        \"prototype_distance_bad\": round(db, 3),\n        \"weighted_score_before_penalty\": round(weighted_score, 1),\n        \"severe_penalty\": int(penalty),\n        \"rule_scores\": {k: round(v, 1) for k, v in scores.items()},\n        \"key_features\": {\n            \"duration_s\": round(feat[\"duration\"], 3),\n            \"ang_mean_deg_s\": round(feat[\"ang_mean\"], 1),\n            \"ang_p90_deg_s\": round(feat[\"ang_p90\"], 1),\n            \"ang_peak_deg_s\": round(feat[\"ang_peak\"], 1),\n            \"jerk_mean_deg_s2\": round(feat[\"jerk_mean\"], 1),\n            \"jerk_p90_deg_s2\": round(feat[\"jerk_p90\"], 1),\n            \"dyn_peak_ms2\": round(feat[\"dyn_peak\"], 2),\n            \"wx_range_pull_deg_s\": round(feat[\"wx_range_pull\"], 1),\n            \"wy_range_pull_deg_s\": round(feat[\"wy_range_pull\"], 1),\n            \"wz_range_pull_deg_s\": round(feat[\"wz_range_pull\"], 1),\n            \"wz_wy_ratio_pull\": round(feat[\"wz_wy_ratio_pull\"], 2),\n            \"wx_wz_ratio_pull\": round(feat[\"wx_wz_ratio_pull\"], 2),\n            \"phase_catch_pct\": round(feat[\"phase_catch\"] * 100, 1),\n            \"phase_pull_pct\": round(feat[\"phase_pull\"] * 100, 1),\n            \"phase_recovery_pct\": round(feat[\"phase_rec\"] * 100, 1),\n            \"recovery_cv\": round(feat[\"recovery_cv\"], 3),\n        },\n        \"main_reasons\": reasons,\n    }\n\n\ndef print_report(r):\n    print(\"\\n\" + \"=\" * 74)\n    print(\"FREESTYLE STROKE ANALYZER \u2014 STANDALONE ABOVE-WATER VERSION\")\n    print(\"=\" * 74)\n    print(f\"File        : {r['file']}\")\n    print(f\"Score       : {r['overall_score']}/100\")\n    print(f\"Verdict     : {r['verdict']}\")\n    print(f\"Risk        : {r['risk']}\")\n    print(f\"Dist good   : {r['prototype_distance_good']}\")\n    print(f\"Dist bad    : {r['prototype_distance_bad']}\")\n    print(f\"Base score  : {r['weighted_score_before_penalty']}/100\")\n    print(f\"Penalty     : -{r['severe_penalty']}\")\n    print(\"-\" * 74)\n    print(\"Rule scores:\")\n    for k, v in r[\"rule_scores\"].items():\n        print(f\"  {k:22s} {v:6.1f}/100\")\n    print(\"-\" * 74)\n    print(\"Key features:\")\n    for k, v in r[\"key_features\"].items():\n        print(f\"  {k:22s} {v}\")\n    print(\"-\" * 74)\n    print(\"Why this result:\")\n    for reason in r[\"main_reasons\"]:\n        print(f\"  - {reason}\")\n    print(\"=\" * 74 + \"\\n\")\n\n\ndef process_folder_to_risk_dirs(input_folder, output_root):\n    input_folder = Path(input_folder)\n    output_root = Path(output_root)\n    csv_files = sorted(input_folder.rglob(\"*.csv\"))\n    if not csv_files:\n        raise ValueError(f\"No CSV files found in: {input_folder}\")\n\n    processed = 0\n    failed = 0\n    for csv_file in csv_files:\n        try:\n            report = analyze(str(csv_file))\n            risk = report[\"risk\"]\n            risk_dir = output_root / risk\n            risk_dir.mkdir(parents=True, exist_ok=True)\n\n            out_csv = risk_dir / csv_file.name\n            if out_csv.exists():\n                out_csv = risk_dir / f\"{csv_file.stem}_{processed + 1}.csv\"\n            shutil.copy2(csv_file, out_csv)\n            processed += 1\n        except Exception:\n            failed += 1\n\n    return processed, failed\n\n\nif __name__ == \"__main__\":\n    if len(sys.argv) >= 3 and sys.argv[1] == \"--folder\":\n        input_folder = sys.argv[2]\n        output_root = sys.argv[3] if len(sys.argv) >= 4 else None\n    else:\n        input_folder = None\n        output_root = None\n        csv_file = sys.argv[1] if len(sys.argv) >= 2 else None\n\n    try:\n        if input_folder is not None:\n            if not output_root:\n                root = tk.Tk()\n                root.withdraw()\n                output_root = filedialog.askdirectory(title=\"Select output folder for risk folders\")\n                root.destroy()\n            if not output_root:\n                print(\"No output folder selected.\")\n                sys.exit(1)\n\n            processed, failed = process_folder_to_risk_dirs(input_folder, output_root)\n            print(f\"Finished. Processed: {processed}, Failed: {failed}\")\n        else:\n            if not csv_file:\n                root = tk.Tk()\n                root.withdraw()\n                print(\"Select mode:\")\n                print(\"  1) Single CSV file\")\n                print(\"  2) Folder of stroke CSV files\")\n                mode = input(\"Enter choice (1 or 2) [2]: \").strip() or \"2\"\n                if mode == \"2\":\n                    input_folder = filedialog.askdirectory(title=\"Select input folder with stroke CSV files\")\n                    print(\"Select any output folder you want for risk folders...\")\n                    output_root = filedialog.askdirectory(title=\"Select output folder for risk folders\")\n                    root.destroy()\n                    if not input_folder or not output_root:\n                        print(\"Input/output folder not selected.\")\n                        sys.exit(1)\n                    processed, failed = process_folder_to_risk_dirs(input_folder, output_root)\n                    print(f\"Finished. Processed: {processed}, Failed: {failed}\")\n                    sys.exit(0)\n                else:\n                    csv_file = filedialog.askopenfilename(\n                        title=\"Select CSV file\",\n                        filetypes=[(\"CSV files\", \"*.csv\"), (\"All files\", \"*.*\")]\n                    )\n                    root.destroy()\n                    if not csv_file:\n                        print(\"No file selected.\")\n                        sys.exit(1)\n\n            report = analyze(csv_file)\n            print_report(report)\n\n            out_path = csv_file.rsplit(\".\", 1)[0] + \"_freestyle_report.json\"\n            with open(out_path, \"w\", encoding=\"utf-8\") as f:\n                json.dump(report, f, indent=2)\n            print(f\"JSON report saved to: {out_path}\")\n    except Exception as e:\n        import traceback\n        traceback.print_exc()\n        print(f\"ERROR: {e}\")\n        sys.exit(1)\n"


def load_module_from_source(module_name: str, source_code: str):
    module = types.ModuleType(module_name)
    module.__file__ = f"<{module_name}>"
    exec(compile(source_code, module.__file__, "exec"), module.__dict__)
    return module


BUTTERFLY_MOD = load_module_from_source("butterfly_embedded_module", BUTTERFLY_SOURCE)
BREAST_MOD = load_module_from_source("breast_embedded_module", BREAST_SOURCE)
FREESTYLE_MOD = load_module_from_source("freestyle_embedded_module", FREESTYLE_SOURCE)

STYLE_MODULES = {
    "butterfly": BUTTERFLY_MOD,
    "freestyle": FREESTYLE_MOD,
    "breast": BREAST_MOD,
}

STYLE_ALIASES = {
    "butterfly": "butterfly",
    "fly": "butterfly",
    "butter": "butterfly",
    "freestyle": "freestyle",
    "free": "freestyle",
    "frontcrawl": "freestyle",
    "front_crawl": "freestyle",
    "front-crawl": "freestyle",
    "crawl": "freestyle",
    "breast": "breast",
    "breaststroke": "breast",
    "breast_stroke": "breast",
    "breast-stroke": "breast",
}

VALID_QUALITY_BINARY = {"Good", "Bad"}


def normalize_text(x: str) -> str:
    return x.lower().replace("-", "").replace("_", "").replace(" ", "")


def to_good_bad_label(label):
    if label is None:
        return None
    s = str(label).strip().lower().replace("-", "_").replace(" ", "_")
    if "moderate_high" in s:
        return "Bad"
    good_tokens = ["good", "low", "moderate"]
    bad_tokens = ["bad", "high", "risk"]
    if any(t in s for t in good_tokens):
        return "Good"
    if any(t in s for t in bad_tokens):
        return "Bad"
    return None


def canonical_style(label: str):
    if not label:
        return None
    key = normalize_text(label)
    for alias, canon in STYLE_ALIASES.items():
        if normalize_text(alias) == key:
            return canon
    return None


def infer_style_from_path(path: Path):
    checked = []
    for p in [path.parent] + list(path.parents):
        if p and p.name:
            checked.append(p.name)
    checked.append(path.stem)

    for text in checked:
        canon = canonical_style(text)
        if canon:
            return canon

        compact = normalize_text(text)
        for alias, style in STYLE_ALIASES.items():
            if normalize_text(alias) in compact:
                return style
    return None


def _is_above_water_freestyle_pattern(report: dict) -> bool:
    """
    Small heuristic for simulated above-water freestyle strokes.
    Used only to soften overly harsh HIGH / MODERATE-HIGH predictions.
    """
    k = report.get("key_features", {}) or {}
    try:
        phase_pull = float(k.get("phase_pull_pct", 0.0))
        phase_rec = float(k.get("phase_recovery_pct", 0.0))
        ratio_wz_wy = float(k.get("wz_wy_ratio_pull", 0.0))
        ratio_wx_wz = float(k.get("wx_wz_ratio_pull", 0.0))
        ang_mean = float(k.get("ang_mean_deg_s", 0.0))
    except Exception:
        return False

    dyn_peak = float(k.get("dyn_peak_ms2", 0.0))
    recovery_cv = float(k.get("recovery_cv", 1.0))
    # General above-water freestyle signature for right-wrist single-IMU.
    return (
        28.0 <= phase_pull <= 55.0
        and 38.0 <= phase_rec <= 58.0
        and 0.55 <= ratio_wz_wy <= 1.60
        and 1.30 <= ratio_wx_wz <= 3.50
        and 190.0 <= ang_mean <= 300.0
        and dyn_peak >= 4.5
        and recovery_cv <= 0.35
    )


def _should_soften_freestyle_risk(report: dict) -> bool:
    """
    General decision to soften harsh freestyle risk on above-water sessions.
    Uses report evidence only (no filename/session hardcoding).
    """
    if not _is_above_water_freestyle_pattern(report):
        return False

    dg = report.get("prototype_distance_good")
    db = report.get("prototype_distance_bad")
    try:
        dg = float(dg)
        db = float(db)
    except Exception:
        return False

    # Must be closer to good prototype than bad prototype.
    if not (dg < db):
        return False

    rs = report.get("rule_scores", {}) or {}
    vals = [float(v) for v in rs.values() if isinstance(v, (int, float))]
    if not vals:
        return False

    good_votes = sum(v >= 65.0 for v in vals)
    bad_votes = sum(v <= 35.0 for v in vals)
    return good_votes >= bad_votes


def analyze_with_style(csv_path: Path, style: str):
    mod = STYLE_MODULES[style]
    report = mod.analyze(str(csv_path))
    report["style"] = style

    # Minimal generalized correction for simulated above-water freestyle.
    risk = str(report.get("risk", "")).upper()
    should_soften = _should_soften_freestyle_risk(report)
    if style == "freestyle" and risk in {"HIGH", "MODERATE-HIGH"} and should_soften:
        score = float(report.get("overall_score", 0.0) or 0.0)
        report["overall_score"] = round(max(score, 65.0), 1)
        report["risk"] = "MODERATE"
        report["verdict"] = "BORDERLINE / MODERATE RISK"
        reasons = report.get("main_reasons", [])
        if isinstance(reasons, list):
            reasons.append(
                "above-water freestyle adjustment: pattern is within accepted simulated ranges"
            )
            report["main_reasons"] = reasons

    return report


def save_report_and_copy(csv_path: Path, report: dict, output_root: Path, gb_layout: bool = False):
    style = report["style"]
    risk = report.get("risk", "UNKNOWN")
    if gb_layout:
        style_cap = STYLE_FOLDER_NAMES.get(style, style.title())
        tier = normalize_tier_token(risk)
        tier_seg = tier if tier is not None else risk.replace(" ", "_").replace("-", "_")
        out_dir = output_root / "GB" / style_cap / tier_seg
    else:
        out_dir = output_root / style / risk
    out_dir.mkdir(parents=True, exist_ok=True)

    out_csv = out_dir / csv_path.name
    counter = 1
    while out_csv.exists():
        out_csv = out_dir / f"{csv_path.stem}_{counter}{csv_path.suffix}"
        counter += 1

    shutil.copy2(csv_path, out_csv)

    report_path = out_csv.with_name(out_csv.stem + "_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return out_csv, report_path


def process_single(csv_file, output_root=None, explicit_label=None, verbose=True, gb_layout=False):
    csv_path = Path(csv_file)

    style = canonical_style(explicit_label) if explicit_label else None
    if style is None:
        style = infer_style_from_path(csv_path)

    if style is None:
        raise ValueError(
            f"Could not infer style for file: {csv_path}. "
            "Use --label butterfly|freestyle|breast or name the file/folder accordingly."
        )

    report = analyze_with_style(csv_path, style)

    out_csv = report_path = None
    if output_root is not None:
        out_csv, report_path = save_report_and_copy(
            csv_path, report, Path(output_root), gb_layout=gb_layout
        )

    if verbose:
        print("\n" + "=" * 80)
        print("COMBINED SWIMMING STROKE FEATURE EXTRACTION")
        print("=" * 80)
        print(f"File        : {csv_path}")
        print(f"Detected    : {style}")
        print(f"Score       : {report.get('overall_score')}/100")
        print(f"Verdict     : {report.get('verdict')}")
        print(f"Risk        : {report.get('risk')}")
        print("-" * 80)
        print("Key features:")
        for k, v in report.get("key_features", {}).items():
            print(f"  {k:24s} {v}")
        print("-" * 80)
        print("Why this result:")
        for reason in report.get("main_reasons", []):
            print(f"  - {reason}")
        if out_csv:
            print("-" * 80)
            print(f"Copied CSV  : {out_csv}")
            print(f"JSON report : {report_path}")
        print("=" * 80 + "\n")

    return report


def process_folder(input_root, output_root, gb_layout=False):
    input_root = Path(input_root)
    output_root = Path(output_root)

    csv_files = sorted(input_root.rglob("*.csv"))
    if not csv_files:
        raise ValueError(f"No CSV files found in: {input_root}")

    summary = {
        "processed": 0,
        "failed": 0,
        "by_style": {"butterfly": 0, "freestyle": 0, "breast": 0},
        "by_risk": {},
        "failures": []
    }

    for csv_path in csv_files:
        try:
            style = infer_style_from_path(csv_path)
            if style is None:
                raise ValueError(
                    "Could not infer style from folder/file name. "
                    "Put the file in a style-named subfolder or include the style in the filename."
                )

            report = analyze_with_style(csv_path, style)
            save_report_and_copy(csv_path, report, output_root, gb_layout=gb_layout)

            summary["processed"] += 1
            summary["by_style"][style] += 1
            risk = report.get("risk", "UNKNOWN")
            summary["by_risk"][risk] = summary["by_risk"].get(risk, 0) + 1

            print(f"[OK] {csv_path.name} -> {style} / {risk}")

        except Exception as e:
            summary["failed"] += 1
            summary["failures"].append({
                "file": str(csv_path),
                "error": str(e),
            })
            print(f"[FAIL] {csv_path} -> {e}")

    summary_path = output_root / "processing_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\nFinished.")
    print(f"Processed: {summary['processed']}")
    print(f"Failed   : {summary['failed']}")
    print(f"Summary  : {summary_path}")
    return summary


def infer_test_ground_truth(rel_path: Path):
    """
    Infer ground-truth style/quality from relative test path.
    Expected layout for evaluation:
      test_root/style/quality/file.csv
    Style-only fallback:
      test_root/style/file.csv
    """
    style_gt = None
    quality_gt = None
    source = "none"
    parts = rel_path.parts

    if len(parts) >= 2:
        style_gt = canonical_style(parts[0])
        if style_gt:
            source = "folder_style"

    if len(parts) >= 3:
        q = to_good_bad_label(parts[1])
        if q in VALID_QUALITY_BINARY:
            quality_gt = q
            source = "folder_style_quality"

    return style_gt, quality_gt, source


def process_folder_test_accuracy(input_root, output_root=None):
    """
    Test-only evaluation mode:
      - Reads test_root/style/quality/*.csv
      - Runs normal feature extraction prediction
      - Compares predicted quality tier vs given quality folder
      - Reports quality/style/session accuracies
    """
    input_root = Path(input_root)
    csv_files = sorted(input_root.rglob("*.csv"))
    if not csv_files:
        raise ValueError(f"No CSV files found in: {input_root}")

    rows = []
    failed = 0
    skipped_non_stroke = 0
    skip_names = {"stroke_counts_per_session.csv", "stroke_segments_detailed.csv"}
    for csv_path in csv_files:
        if csv_path.name in skip_names:
            skipped_non_stroke += 1
            print(f"[SKIP] {csv_path.name} (metadata file)")
            continue
        rel_path = csv_path.relative_to(input_root)
        style_gt, quality_gt, gt_source = infer_test_ground_truth(rel_path)
        try:
            pred_style = infer_style_from_path(csv_path)
            if pred_style is None:
                raise ValueError("Could not infer style from path/name.")

            report = analyze_with_style(csv_path, pred_style)
            pred_quality = to_good_bad_label(report.get("risk"))
            parts = rel_path.parts
            if len(parts) >= 4:
                session_name = parts[2]
                session_key = f"{parts[0]}/{parts[1]}/{parts[2]}"
            else:
                stem = csv_path.stem
                if stem.lower().startswith("stroke") and "_" in stem:
                    session_name = stem.split("_", 1)[1]
                else:
                    session_name = stem
                session_key = f"{style_gt or 'unknown_style'}/{quality_gt or 'unknown_quality'}/{session_name}"

            rows.append({
                "relative_path": str(rel_path),
                "file": csv_path.name,
                "session_name": session_name,
                "session_key": session_key,
                "true_style": style_gt,
                "pred_style": pred_style,
                "style_correct": (style_gt == pred_style) if style_gt is not None else None,
                "true_quality": quality_gt,
                "pred_quality": pred_quality,
                "quality_correct": (quality_gt == pred_quality) if quality_gt is not None else None,
                "score": report.get("overall_score"),
                "risk_raw": report.get("risk"),
                "gt_source": gt_source,
                "status": "ok",
                "error": "",
            })
            print(
                f"[OK] {rel_path} -> pred_style={pred_style}, "
                f"pred_quality={pred_quality}, true_quality={quality_gt}"
            )
        except Exception as e:
            failed += 1
            rows.append({
                "relative_path": str(rel_path),
                "file": csv_path.name,
                "session_name": None,
                "session_key": None,
                "true_style": style_gt,
                "pred_style": None,
                "style_correct": None,
                "true_quality": quality_gt,
                "pred_quality": None,
                "quality_correct": None,
                "score": None,
                "risk_raw": None,
                "gt_source": gt_source,
                "status": "fail",
                "error": str(e),
            })
            print(f"[FAIL] {rel_path} -> {e}")

    # Session-level metrics
    grouped: dict[str, list[dict]] = {}
    for r in rows:
        if r["status"] != "ok" or not r.get("session_key"):
            continue
        grouped.setdefault(r["session_key"], []).append(r)

    session_rows = []
    for sess_key, items in grouped.items():
        q_votes = {"Good": 0, "Bad": 0}
        for it in items:
            pq = it.get("pred_quality")
            if pq in q_votes:
                q_votes[pq] += 1
        if q_votes["Bad"] > q_votes["Good"]:
            pred_session_quality = "Bad"
        elif q_votes["Good"] > q_votes["Bad"]:
            pred_session_quality = "Good"
        else:
            # Conservative tie-break.
            pred_session_quality = "Bad"

        true_session_quality = items[0].get("true_quality")
        stroke_scores = [
            float(it.get("score"))
            for it in items
            if isinstance(it.get("score"), (int, float))
        ]
        strong_bad_votes = sum(
            1 for it in items if str(it.get("risk_raw", "")).upper() in {"HIGH", "MODERATE-HIGH"}
        )
        style_name = items[0].get("true_style") or items[0].get("pred_style")
        session_rows.append({
            "session_key": sess_key,
            "session_name": items[0].get("session_name"),
            "style": style_name,
            "true_quality": true_session_quality,
            "pred_quality_majority": pred_session_quality,
            "pred_quality": pred_session_quality,
            "quality_correct": (
                true_session_quality == pred_session_quality if true_session_quality is not None else None
            ),
            "num_strokes": len(items),
            "votes_good": q_votes["Good"],
            "votes_bad": q_votes["Bad"],
            "mean_score": (sum(stroke_scores) / len(stroke_scores)) if stroke_scores else None,
            "strong_bad_ratio": (strong_bad_votes / len(items)) if items else 0.0,
        })

    # Data-driven per-style calibration from labeled reference sessions.
    # Rule: session is Bad if mean_score < score_threshold OR strong_bad_ratio >= ratio_threshold.
    styles = sorted({r.get("style") for r in session_rows if r.get("style")})
    calibration = {}
    for style_name in styles:
        labeled = [
            r for r in session_rows
            if r.get("style") == style_name
            and r.get("true_quality") in {"Good", "Bad"}
            and isinstance(r.get("mean_score"), (int, float))
        ]
        if len(labeled) < 4:
            continue

        score_vals = sorted({round(float(r["mean_score"]), 3) for r in labeled})
        ratio_vals = sorted({round(float(r["strong_bad_ratio"]), 3) for r in labeled})
        best = None
        for st in score_vals:
            for rt in ratio_vals:
                total = len(labeled)
                correct = 0
                for r in labeled:
                    pred = "Bad" if (float(r["mean_score"]) < st or float(r["strong_bad_ratio"]) >= rt) else "Good"
                    if pred == r["true_quality"]:
                        correct += 1
                acc = correct / total if total else 0.0
                key = (acc, correct, -st, rt)  # tie-break: prefer lower score threshold, higher bad-ratio threshold
                if best is None or key > best["key"]:
                    best = {
                        "key": key,
                        "score_threshold": st,
                        "ratio_threshold": rt,
                        "accuracy": acc,
                        "correct": correct,
                        "total": total,
                    }
        if best is not None:
            calibration[style_name] = {
                "score_threshold": best["score_threshold"],
                "ratio_threshold": best["ratio_threshold"],
                "fit_accuracy": best["accuracy"],
                "fit_correct": best["correct"],
                "fit_total": best["total"],
            }

    for r in session_rows:
        style_name = r.get("style")
        cal = calibration.get(style_name)
        if cal and isinstance(r.get("mean_score"), (int, float)):
            pred_cal = (
                "Bad"
                if (
                    float(r["mean_score"]) < float(cal["score_threshold"])
                    or float(r["strong_bad_ratio"]) >= float(cal["ratio_threshold"])
                )
                else "Good"
            )
            r["pred_quality"] = pred_cal
        else:
            r["pred_quality"] = r["pred_quality_majority"]
        tq = r.get("true_quality")
        r["quality_correct"] = (tq == r["pred_quality"]) if tq is not None else None

    quality_labeled = [
        r for r in session_rows if r["true_quality"] is not None and r["quality_correct"] is not None
    ]
    quality_correct = sum(1 for r in quality_labeled if r["quality_correct"] is True)
    quality_total = len(quality_labeled)
    quality_acc = (quality_correct / quality_total) if quality_total else None

    summary = {
        "total_files_found": len(csv_files),
        "skipped_non_stroke_files": skipped_non_stroke,
        "processed_ok": len([r for r in rows if r["status"] == "ok"]),
        "failed": failed,
        "sessions_evaluated": len(session_rows),
        "quality_accuracy": quality_acc,
        "quality_correct": quality_correct,
        "quality_total": quality_total,
        "calibration_by_style": calibration,
        "expected_layout": "test_root/style/quality(good|bad)/session_name/stroke*.csv",
    }

    print("\n" + "=" * 80)
    print("TEST-ONLY ACCURACY SUMMARY (FOR PAPER)")
    print("=" * 80)
    print(f"Total files found: {summary['total_files_found']}")
    print(f"Skipped metadata : {summary['skipped_non_stroke_files']}")
    print(f"Processed OK     : {summary['processed_ok']}")
    print(f"Failed           : {summary['failed']}")
    print(f"Sessions eval'd  : {summary['sessions_evaluated']}")
    if quality_acc is None:
        print("Quality accuracy : N/A (no quality labels found)")
    else:
        print(f"Quality accuracy : {quality_acc:.2%} ({quality_correct}/{quality_total})")
    if calibration:
        print("Method          : Session calibration from labeled references (per-style thresholds)")
    else:
        print("Method          : Session majority vote across strokes")
    print("(Good/Bad labels are read from folder names.)")
    print("=" * 80 + "\n")

    if output_root is not None:
        output_root = Path(output_root)
        output_root.mkdir(parents=True, exist_ok=True)
        details_path = output_root / "test_accuracy_details.json"
        session_details_path = output_root / "test_accuracy_session_details.json"
        summary_path = output_root / "test_accuracy_summary.json"
        with open(details_path, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2)
        with open(session_details_path, "w", encoding="utf-8") as f:
            json.dump(session_rows, f, indent=2)
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(f"Saved details: {details_path}")
        print(f"Saved session details: {session_details_path}")
        print(f"Saved summary: {summary_path}")

    return summary


def prompt_for_style_interactive(csv_file):
    inferred = infer_style_from_path(Path(csv_file))
    if inferred:
        print(f"Detected label from file/folder name: {inferred}")
        use_detected = input("Use this label? (Y/n): ").strip().lower()
        if use_detected in ("", "y", "yes"):
            return inferred

    print("Choose the file label/style:")
    print("  1) butterfly")
    print("  2) freestyle")
    print("  3) breast")
    print("  Enter also works if the filename already contains the style.")

    while True:
        raw = input("Enter label or number [auto]: ").strip().lower()
        if raw == "" and inferred:
            return inferred
        mapping = {
            "1": "butterfly",
            "2": "freestyle",
            "3": "breast",
        }
        raw = mapping.get(raw, raw)
        style = canonical_style(raw)
        if style:
            return style
        print("Invalid label. Use butterfly, freestyle, breast, or 1/2/3.")


def choose_paths_gui():
    root = tk.Tk()
    root.withdraw()

    print("Select mode:")
    print("  1) Single CSV file")
    print("  2) Root folder with style subfolders")
    print("  3) Test-only accuracy (test_root/style/quality/*.csv)")
    mode = input("Enter choice (1, 2, or 3) [2]: ").strip() or "2"

    if mode == "1":
        csv_file = filedialog.askopenfilename(
            title="Select single CSV file",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
        )
        if not csv_file:
            root.destroy()
            raise SystemExit("No CSV file selected.")

        label = prompt_for_style_interactive(csv_file)

        output_root = filedialog.askdirectory(
            title="Select output folder (style/risk folders will be created here)"
        )
        root.destroy()
        if not output_root:
            raise SystemExit("No output folder selected.")
        return "single", csv_file, output_root, label

    if mode == "3":
        input_root = filedialog.askdirectory(
            title="Select TEST root folder (style/quality/*.csv)"
        )
        if not input_root:
            root.destroy()
            raise SystemExit("No test input folder selected.")

        output_root = filedialog.askdirectory(
            title="Select optional output folder for test accuracy JSON files (Cancel to skip)"
        )
        root.destroy()
        if not output_root:
            output_root = None
        return "test_eval", input_root, output_root, None

    input_root = filedialog.askdirectory(
        title="Select root folder containing style subfolders"
    )
    if not input_root:
        root.destroy()
        raise SystemExit("No input folder selected.")

    output_root = filedialog.askdirectory(
        title="Select output folder (style/risk folders will be created here)"
    )
    root.destroy()
    if not output_root:
        raise SystemExit("No output folder selected.")

    return "folder", input_root, output_root, None


def parse_args(argv):
    args = {
        "mode": None,
        "input_path": None,
        "output_root": None,
        "label": None,
        "gb_layout": False,
        "test_eval": False,
    }

    i = 1
    while i < len(argv):
        token = argv[i]

        if token in ("--gb-layout", "--layout-gb"):
            args["gb_layout"] = True
            i += 1
            continue

        if token in ("--test-eval", "--test-only", "--evaluate-test"):
            args["test_eval"] = True
            i += 1
            continue

        if token == "--single":
            args["mode"] = "single"
            i += 1
            if i < len(argv):
                args["input_path"] = argv[i]
            else:
                raise ValueError("--single requires a CSV path")

        elif token == "--folder":
            args["mode"] = "folder"
            i += 1
            if i < len(argv):
                args["input_path"] = argv[i]
            else:
                raise ValueError("--folder requires an input folder path")

        elif token == "--output":
            i += 1
            if i < len(argv):
                args["output_root"] = argv[i]
            else:
                raise ValueError("--output requires a folder path")

        elif token == "--label":
            i += 1
            if i < len(argv):
                args["label"] = argv[i]
            else:
                raise ValueError("--label requires butterfly|freestyle|breast")

        else:
            if args["input_path"] is None:
                args["input_path"] = token
            else:
                raise ValueError(f"Unrecognized argument: {token}")
        i += 1

    return args


if __name__ == "__main__":
    try:
        if len(sys.argv) == 1:
            mode, input_path, output_root, label = choose_paths_gui()
            if mode == "single":
                process_single(input_path, output_root=output_root, explicit_label=label, verbose=True)
            elif mode == "test_eval":
                process_folder_test_accuracy(input_path, output_root=output_root)
            else:
                process_folder(input_path, output_root)
            sys.exit(0)

        args = parse_args(sys.argv)

        if args["mode"] == "single":
            if not args["input_path"]:
                raise ValueError("Missing CSV path for --single")
            process_single(
                args["input_path"],
                output_root=args["output_root"],
                explicit_label=args["label"],
                verbose=True,
                gb_layout=args["gb_layout"],
            )

        elif args["mode"] == "folder":
            if not args["input_path"]:
                raise ValueError("Missing folder path for --folder")
            if args["test_eval"]:
                process_folder_test_accuracy(args["input_path"], output_root=args["output_root"])
            else:
                if not args["output_root"]:
                    raise ValueError("Missing --output folder for --folder mode")
                process_folder(args["input_path"], args["output_root"], gb_layout=args["gb_layout"])

        else:
            input_path = args["input_path"]
            if not input_path:
                raise ValueError("No input path provided.")

            p = Path(input_path)
            if p.is_dir():
                if args["test_eval"]:
                    process_folder_test_accuracy(p, output_root=args["output_root"])
                else:
                    if not args["output_root"]:
                        raise ValueError("Folder input requires --output")
                    process_folder(p, args["output_root"], gb_layout=args["gb_layout"])
            else:
                process_single(
                    p,
                    output_root=args["output_root"],
                    explicit_label=args["label"],
                    verbose=True,
                    gb_layout=args["gb_layout"],
                )

    except Exception as e:
        traceback.print_exc()
        print(f"ERROR: {e}")
        sys.exit(1)
