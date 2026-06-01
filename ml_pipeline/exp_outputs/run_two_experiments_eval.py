import json
import shutil
import sys
from pathlib import Path
import subprocess
import re

import pandas as pd
from sklearn.metrics import accuracy_score, precision_recall_fscore_support


def main() -> None:
    root = Path(r"c:\Users\tempuser\OneDrive\Desktop\Final")
    test_raw = Path(r"c:\Users\tempuser\OneDrive\Desktop\testingNoClean")
    exp_root = root / "exp_outputs"
    exp_root.mkdir(parents=True, exist_ok=True)

    # 1) Clean labeled testing set while preserving style/quality folder structure.
    sys.path.insert(0, str(root / "datacleaning"))
    import clean_newData as cnd  # noqa: E402

    cleaned_test = root / "datacleaning" / "cleaned" / "testingNoClean_labeled"
    csv_files = sorted(p for p in test_raw.rglob("*.csv") if p.is_file())
    cnd.process_many_files(csv_files, selected_root=test_raw, output_root=cleaned_test)
    print(f"CLEANED_TEST_FILES={len(csv_files)}")

    # 2) GRUTEST style classification output.
    pyexe = sys.executable
    exp1_style = exp_root / "exp1_grutest_style"
    shutil.rmtree(exp1_style, ignore_errors=True)
    subprocess.run(
        [
            pyexe,
            str(root / "GRU-LSTM" / "GRUTEST.py"),
            "--classify-folder",
            str(cleaned_test),
            "--output",
            str(exp1_style),
        ],
        check=True,
    )

    # 3) Experiment 1: segment_and_classify quality on cleaned testing set.
    sys.path.insert(0, str(root / "dataSegmenatation"))
    import segment_and_classify as sac  # noqa: E402

    device = sac.torch.device("cuda" if sac.torch.cuda.is_available() else "cpu")
    model_path = root / "best_model_segmented.pth"
    scaler_path = root / "scaler_segmented.pkl"
    label_path = root / "label_mapping_segmented.pkl"
    hyper_path = root / "hyperparameters_segmented.pkl"

    exp1_out = exp_root / "exp1_segment_and_classify"
    shutil.rmtree(exp1_out, ignore_errors=True)
    exp1_out.mkdir(parents=True, exist_ok=True)

    exp1_rows = []
    for f in sorted(cleaned_test.rglob("*.csv")):
        rel = f.relative_to(cleaned_test)
        _ts, tq, _src = sac.infer_ground_truth_from_relative_path(rel)
        _stroke_df, session_df = sac.segment_and_classify_single_file(
            f,
            model_path,
            scaler_path,
            label_path,
            hyper_path,
            device=device,
            output_root=exp1_out,
            test_result_root=exp1_style,
            data_root=cleaned_test,
        )
        if session_df is None:
            continue
        pred_q = sac.normalize_quality_binary(session_df.iloc[0]["overall_quality_tier"])
        exp1_rows.append(
            {
                "file": str(rel),
                "true_quality": tq,
                "pred_quality": pred_q,
            }
        )

    exp1_df = pd.DataFrame(exp1_rows).dropna(subset=["true_quality", "pred_quality"])
    y1 = exp1_df["true_quality"].astype(str).str.lower()
    p1 = exp1_df["pred_quality"].astype(str).str.lower()
    pr1, rc1, f11, _ = precision_recall_fscore_support(
        y1, p1, average="binary", pos_label="good", zero_division=0
    )
    m1 = {
        "n_files": int(len(exp1_df)),
        "accuracy": float(accuracy_score(y1, p1)),
        "precision": float(pr1),
        "recall": float(rc1),
        "f1": float(f11),
    }

    # 4) Experiment 2: GRUTEST -> segment_strokes -> feature_extraction quality.
    import segment_strokes as ss  # noqa: E402

    exp2_seg = exp_root / "exp2_segmented_from_grutest"
    shutil.rmtree(exp2_seg, ignore_errors=True)
    exp2_seg.mkdir(parents=True, exist_ok=True)
    ss.segment_all_to_stroke_files(exp1_style, exp2_seg)

    sys.path.insert(0, str(root / "featuerExtraction"))
    import feature_extraction as fe  # noqa: E402

    exp2_quality = exp_root / "exp2_feature_quality"
    shutil.rmtree(exp2_quality, ignore_errors=True)
    exp2_quality.mkdir(parents=True, exist_ok=True)
    fe.process_folder(exp2_seg, exp2_quality, gb_layout=False)

    true_map = {
        p.name: sac.normalize_quality_binary(p.parent.name)
        for p in cleaned_test.rglob("*.csv")
        if p.is_file()
    }

    exp2_rows = []
    for rp in exp2_quality.rglob("*_report.json"):
        d = json.loads(rp.read_text(encoding="utf-8"))
        fname = rp.name.replace("_report.json", ".csv")
        m = re.match(r"^stroke\d+_(.+)$", fname)
        session_name = m.group(1) if m else fname
        tq = true_map.get(session_name)
        risk = str(d.get("risk", "")).lower()
        pq = "good" if ("low" in risk or "good" in risk) else ("bad" if risk else None)
        exp2_rows.append(
            {
                "file": fname,
                "true_quality": tq,
                "pred_quality": pq,
            }
        )

    exp2_df = pd.DataFrame(exp2_rows).dropna(subset=["true_quality", "pred_quality"])
    y2 = exp2_df["true_quality"].astype(str).str.lower()
    p2 = exp2_df["pred_quality"].astype(str).str.lower()
    pr2, rc2, f12, _ = precision_recall_fscore_support(
        y2, p2, average="binary", pos_label="good", zero_division=0
    )
    m2 = {
        "n_strokes": int(len(exp2_df)),
        "accuracy": float(accuracy_score(y2, p2)),
        "precision": float(pr2),
        "recall": float(rc2),
        "f1": float(f12),
    }

    out = {
        "experiment1_segment_and_classify": m1,
        "experiment2_feature_extraction": m2,
    }
    out_path = exp_root / "paper_metrics.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    print(f"SAVED={out_path}")


if __name__ == "__main__":
    main()
