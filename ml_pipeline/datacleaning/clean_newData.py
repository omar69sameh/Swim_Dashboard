import os
from pathlib import Path
from typing import Iterable, List, Tuple

import pandas as pd

try:
    # Use Tkinter just for the file / folder dialogs
    import tkinter as tk
    from tkinter import filedialog, messagebox
except Exception:  # pragma: no cover - in case Tk is unavailable
    tk = None
    filedialog = None
    messagebox = None


def pick_single_file() -> Path | None:
    """
    Open a file explorer dialog and return a single CSV file path.
    """
    if tk is None or filedialog is None:
        print("Tkinter is not available on this system.")
        return None

    root = tk.Tk()
    root.withdraw()
    root.update()

    file_path = filedialog.askopenfilename(
        title="Select a CSV file to clean",
        filetypes=[("CSV files", "*.csv")],
    )
    root.destroy()

    if not file_path:
        return None

    return Path(file_path)


def pick_folder() -> Path | None:
    """
    Open a folder picker dialog and return the selected directory.
    """
    if tk is None or filedialog is None:
        print("Tkinter is not available on this system.")
        return None

    root = tk.Tk()
    root.withdraw()
    root.update()

    folder_path = filedialog.askdirectory(title="Select a folder that contains CSV files")
    root.destroy()

    if not folder_path:
        return None

    return Path(folder_path)


def find_csv_files_in_folder(folder: Path) -> List[Path]:
    """
    Recursively find all CSV files under the given folder.
    """
    return [p for p in folder.rglob("*.csv") if p.is_file()]


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform a raw `newData` CSV into the same *format* as files
    in `cleaned_dataset`:

    - `time` becomes seconds from the start (0.0, 0.012, 0.022, ...)
    - `ax, ay, az, wx, wy, wz` become smoothed signals with names
      `ax_filtered, ay_filtered, ...`
    This function is now designed to always "re-clean" the data in a
    consistent way, even if:
      - the `time` column is already in seconds starting at 0, or
      - the signal columns are already named `*_filtered`.
    """
    df = df.copy()

    # --- 1) Ensure we have a usable time axis --------------------------------
    if "time" not in df.columns:
        raise ValueError("Missing required 'time' column.")

    time_series = df["time"]

    # If `time` is already numeric (e.g. seconds), use it directly,
    # otherwise interpret it as datetimes and convert to seconds.
    if pd.api.types.is_numeric_dtype(time_series):
        time_numeric = pd.to_numeric(time_series, errors="coerce")
        valid_mask = time_numeric.notna()
        time_numeric = time_numeric[valid_mask]

        if len(time_numeric) == 0:
            raise ValueError("All time values are invalid; cannot clean this file.")

        df = df.loc[valid_mask].reset_index(drop=True)
        time_seconds = time_numeric.reset_index(drop=True)
    else:
        time_dt = pd.to_datetime(time_series, errors="coerce", utc=True)
        valid_mask = time_dt.notna()
        time_dt = time_dt[valid_mask]

        if len(time_dt) == 0:
            raise ValueError("All time values are invalid; cannot clean this file.")

        df = df.loc[valid_mask].reset_index(drop=True)
        time_seconds = (time_dt - time_dt.iloc[0]).dt.total_seconds().reset_index(
            drop=True
        )

    t0 = time_seconds.iloc[0]
    time_seconds = time_seconds - t0

    def smooth(series: pd.Series, span: int = 15) -> pd.Series:
        series = pd.to_numeric(series, errors="coerce")
        return series.ewm(span=span, adjust=False).mean()

    out = pd.DataFrame()
    out["time"] = time_seconds.values


    for base in ["ax", "ay", "az", "wx", "wy", "wz"]:
        raw_col = base
        filtered_col = f"{base}_filtered"

        if raw_col in df.columns:
            source = df[raw_col]
        elif filtered_col in df.columns:
            source = df[filtered_col]
        else:
            raise ValueError(f"Missing expected column: '{raw_col}' or '{filtered_col}'")

        out[filtered_col] = smooth(source)

    return out


def build_output_path_for_folder_mode(
    input_path: Path, selected_root: Path, base_output_dir: Path
) -> Path:
    """
    Construct the output path for a cleaned file in *folder* mode.

    In this project (folder mode):
        selected_root   = .../datacleaning/newData
        base_output_dir = .../datacleaning/cleaned/newData
        input_path      = .../datacleaning/newData/Freestyle/session11.csv
        -> output       = .../datacleaning/cleaned/newData/Freestyle/session11.csv
    """
    relative = input_path.relative_to(selected_root)
    return base_output_dir / relative


def process_single_file(input_file: Path, output_file: Path) -> Tuple[Path, Path]:
    """
    Clean a single CSV file and write the result to the corresponding
    location under `output_root`.
    """
    df = pd.read_csv(input_file)
    df_clean = clean_dataframe(df)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    df_clean.to_csv(output_file, index=False)

    return input_file, output_file


def process_many_files(
    files: Iterable[Path], selected_root: Path, output_root: Path
) -> List[Tuple[Path, Path]]:
    """
    Clean many CSV files and return a list of (input_path, output_path)
    tuples for everything that was processed.
    """
    results: List[Tuple[Path, Path]] = []
    for csv_path in files:
        try:
            out_path = build_output_path_for_folder_mode(
                csv_path, selected_root=selected_root, base_output_dir=output_root
            )
            original, cleaned = process_single_file(csv_path, out_path)
            results.append((original, cleaned))
        except Exception as exc:  # pragma: no cover
            print(f"Error while processing {csv_path}: {exc}")
    return results


def main() -> None:
    """
    Entry point.

    - Asks whether to clean a single file or a whole folder.
    - Lets you choose the file/folder using normal Windows dialogs.
    - Saves results inside a top-level `cleaned` folder:
        * Single file  -> `cleaned/cleaned_<filename>.csv`
        * Whole folder -> `cleaned/<chosen_folder_name>/...`
    """
    # Decide mode
    print("Choose mode:")
    print("  1 - Clean a single CSV file")
    print("  2 - Clean all CSV files in a folder (recursively)")

    mode = input("Enter 1 or 2: ").strip()

    # This script itself lives inside the DATACLEANING folder.
    project_root = Path(__file__).resolve().parent

    if mode == "1":
        selected_file = pick_single_file()
        if selected_file is None:
            print("No file selected. Exiting.")
            return

        # Save cleaned file inside DATACLEANING/cleaned with a new name
        cleaned_root = project_root / "cleaned"
        cleaned_root.mkdir(parents=True, exist_ok=True)
        output_file = cleaned_root / f"cleaned_{selected_file.stem}.csv"

        original, cleaned = process_single_file(selected_file, output_file)
        print(f"Cleaned single file:\n  input : {original}\n  output: {cleaned}")

    elif mode == "2":
        selected_folder = pick_folder()
        if selected_folder is None:
            print("No folder selected. Exiting.")
            return

        csv_files = find_csv_files_in_folder(selected_folder)
        if not csv_files:
            print(f"No CSV files found under {selected_folder}")
            return

        # Mirror everything into DATACLEANING/cleaned/<chosen_folder_name>,
        # preserving the structure *under* the selected folder.
        cleaned_root = project_root / "cleaned" / selected_folder.name

        results = process_many_files(
            csv_files, selected_root=selected_folder, output_root=cleaned_root
        )

        print(f"Processed {len(results)} CSV files.")
        for original, cleaned in results:
            print(f"- {original} -> {cleaned}")

    else:
        print("Invalid choice. Please run the script again and choose 1 or 2.")


if __name__ == "__main__":
    main()

