"""Subset font WOFF2 theo dung ky tu storefront thuc su dung.

Spec §7.1 — ngan sach tai ve lan dau. Font hien tai: 11 file WOFF2 = 179 kB,
trong do nhieu file cho weight/ky tu ma giao dien khong dung (500, 800, latin-ext,
tieng Viet day du). Subset theo ky tu that + bo file khong dung -> giam manh
payload font, giup LCP/FCP nhanh hon tren Slow 4G.

Usage:
  python scripts/subset-fonts.py [--chars FILE] [--out public/fonts]
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@fontsource" / "be-vietnam-pro" / "files"

# Ky tu chung cho moi weight: ASCII + ky tu dac biet tieng Viet dung trong UI.
BASE_CHARS = (
    " !\"#$%&'()*+,-./0123456789:;<=>?@"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`"
    "abcdefghijklmnopqrstuvwxyz{|}~"
    "§©·–—…→"
    "àáâãèéêìíòóôõùúýăđĩũơư"
    "ạảấầẩẫậắằẳặẻẽếềểệỉịọỏốồổỗộớờởợụủứừửữự"
    "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯ"
    "ẠẢẤẦẨẪẬẮẰẲẶẺẼẾỀỂỆỈỊỌỎỐỒỔỖỘỚỜỞỢỤỦỨỪỬỮỰ"
    "ÊÔ"
)

# Chi giu cac weight thuc su dung (do bang scripts/font-fit.cjs + quet CSS).
WEIGHTS = [400, 700]


def read_chars(path: Path) -> str:
    if path.exists():
        raw = path.read_text(encoding="utf-8")
        # Giu lai cac ky tu da doc (ke ca dau cach/newline) + tap ky tu dac biet.
        return "".join(sorted(set(raw)))
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", default=str(ROOT / "scripts" / "_subset-chars.txt"))
    ap.add_argument("--out", default=str(ROOT / "public" / "fonts"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    extra = read_chars(Path(args.chars))
    chars = "".join(sorted(set(BASE_CHARS + extra)))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Ky tu can subset: {len(chars)}")

    total_before = 0
    total_after = 0
    produced = []

    for weight in WEIGHTS:
        for subset in ("latin", "vietnamese"):
            src = SRC / f"be-vietnam-pro-{subset}-{weight}-normal.woff2"
            if not src.exists():
                print(f"  THIEU: {src.name}")
                continue
            before = src.stat().st_size
            total_before += before
            dst = out_dir / f"be-vietnam-pro-{subset}-{weight}-normal.woff2"
            if not args.dry_run:
                # pyftsubset: giu cac ky tu da biet; bo ten tep -> giu ten tep de
                # khop voi CSS/HTML hien tai (khong doi duong dan).
                cmd = [
                    sys.executable, "-m", "fontTools.subset", str(src),
                    "--text=" + chars,
                    "--output-file=" + str(dst),
                    "--layout-features=*",
                    "--no-hinting",
                    "--desubroutinize",
                    "--name-IDs=*",
                    "--drop-tables+=DSIG",
                ]
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
            after = dst.stat().st_size if dst.exists() else 0
            total_after += after
            produced.append((dst.name, before, after))
            print(f"  {dst.name:52} {before/1024:7.1f} kB -> {after/1024:7.1f} kB")

    print(f"\nTONG: {total_before/1024:.1f} kB -> {total_after/1024:.1f} kB "
          f"(giam {100*(1-total_after/total_before):.0f}%)")

    # Xoa file font khong con dung (weights 500/600/800, latin-ext).
    if not args.dry_run:
        keep = {n for n, _, _ in produced}
        removed = 0
        for f in sorted(out_dir.glob("*.woff2")):
            if f.name not in keep:
                removed += f.stat().st_size
                f.unlink()
                print(f"  XOA: {f.name} ({f.stat().st_size if False else 0} kB)")
        print(f"Da xoa file thua: {removed/1024:.1f} kB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
