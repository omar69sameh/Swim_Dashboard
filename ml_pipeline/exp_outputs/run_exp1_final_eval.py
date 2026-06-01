import json
import sys
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score, precision_recall_fscore_support


def map_quality(value):
    s = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if s in {"low", "moderate", "good"}:
        return "Good"
    if s in {"moderate_high", "high", "bad", "risk"}:
        return "Bad"
    return None


def main():
    root = Path(r"c:\Users\tempuser\OneDrive\Desktop\Final")
    cleaned = root / "datacleaning" / "cleaned" / "testingNoClean_for_exp2"
    grutest = root / "exp_outputs" / "exp1_grutest_on_testingNoClean"
    out = root / "exp_outputs" / "exp1_segment_and_classify_eval"
    out.mkdir(parents=True, exist_ok=True)

    sys.path.insert(0, str(root / "dataSegmenatation"))
    import segment_and_classify as sac  # noqa: E402

    device = sac.torch.device("cuda" if sac.torch.cuda.is_available() else "cpu")
    model = root / "best_model_segmented.pth"
    scaler = root / "scaler_segmented.pkl"
    label = root / "label_mapping_segmented.pkl"
    hyper = root / "hyperparameters_segmented.pkl"

    rows = []
    for f in sorted(cleaned.rglob("*.csv")):
        true_q = f.parent.name
        _, session_df = sac.segment_and_classify_single_file(
            f,
            model,
            scaler,
            label,
            hyper,
            device=device,
            output_root=out,
            test_result_root=grutest,
            data_root=cleaned,
        )
        if session_df is None or session_df.empty:
            continue
        pred_q = map_quality(session_df.iloc[0].get("overall_quality_tier", ""))
        if pred_q is None:
            continue
        rows.append(
            {
                "file": f.name,
                "true_quality": true_q,
                "pred_quality": pred_q,
            }
        )

    df = pd.DataFrame(rows).drop_duplicates("file")
    y = df["true_quality"]
    p = df["pred_quality"]

    acc = accuracy_score(y, p)
    pr, rc, f1, _ = precision_recall_fscore_support(
        y, p, average="binary", pos_label="Good", zero_division=0
    )
    metrics = {
        "n_sessions": int(len(df)),
        "accuracy": float(acc),
        "precision": float(pr),
        "recall": float(rc),
        "f1": float(f1),
    }

    mpath = root / "exp_outputs" / "exp1_final_metrics.json"
    mpath.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print(mpath)


if __name__ == "__main__":
    main()
