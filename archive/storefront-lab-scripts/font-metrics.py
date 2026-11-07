"""Sinh @font-face 'fallback' khop metrics voi Be Vietnam Pro de webfont swap KHONG doi layout.

Spec §7.2: LCP khong duoc bi ghi lai sau khi font swap. Ly do: fallback (Arial/system-ui)
co advance width khac Be Vietnam Pro -> khi font that tai xong, text H1 doi kich thuoc
-> trinh duyet ghi LCP moi o thoi diem muon (~2.8s) thay vi luc paint dau tien.

Giai phap (theo W3C css-fonts-4): khai bao @font-face cho fallback voi
  size-adjust / ascent-override / descent-override / line-gap-override
de fallback chiem DUNG bo nhu font that. Swap xong layout giong het -> khong co LCP moi.

Usage:  python scripts/font-metrics.py <target.woff2> <fallback.ttf> <out.json>
"""
import json
import sys
from fontTools.ttLib import TTFont


def read_font(path):
    f = TTFont(path, fontNumber=0)
    head = f["head"]
    os2 = f["OS/2"]
    hhea = f["hhea"]
    upm = head.unitsPerEm

    # Ty po chu thuong dung de tinh avg advance width
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    chars = [c for c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?:;-()" if ord(c) in cmap]
    widths = [hmtx[cmap[ord(c)]][0] for c in chars]
    avg = sum(widths) / len(widths) if widths else upm * 0.5

    data = {
        "upm": upm,
        "avgCharWidth": avg,
        "typoAscender": os2.sTypoAscender,
        "typoDescender": os2.sTypoDescender,
        "typoLineGap": os2.sTypoLineGap,
        "hheaAscender": hhea.ascent,
        "hheaDescender": hhea.descent,
        "hheaLineGap": hhea.lineGap,
        "winAscent": os2.usWinAscent,
        "winDescent": os2.usWinDescent,
    }
    f.close()
    return data


def build(target_path, fallback_path):
    t = read_font(target_path)
    fb = read_font(fallback_path)

    # size-adjust: ti so de advance width cua fallback bang target
    target_ratio = t["avgCharWidth"] / t["upm"]
    fallback_ratio = fb["avgCharWidth"] / fb["upm"]
    size_adjust = (target_ratio / fallback_ratio) * 100.0

    # ascent/descent override lay theo typo metrics cua TARGET (đơn vị %)
    ascent = abs(t["typoAscender"]) / t["upm"] * 100.0
    descent = abs(t["typoDescender"]) / t["upm"] * 100.0
    line_gap = abs(t["typoLineGap"]) / t["upm"] * 100.0

    return {
        "target": target_path,
        "fallback": fallback_path,
        "sizeAdjust": round(size_adjust, 4),
        "ascentOverride": round(ascent, 4),
        "descentOverride": round(descent, 4),
        "lineGapOverride": round(line_gap, 4),
        "targetAvgRatio": round(target_ratio, 5),
        "fallbackAvgRatio": round(fallback_ratio, 5),
        "target": {
            "upm": t["upm"],
            "typoAscender": t["typoAscender"],
            "typoDescender": t["typoDescender"],
            "typoLineGap": t["typoLineGap"],
            "winAscent": t["winAscent"],
            "winDescent": t["winDescent"],
        },
    }


if __name__ == "__main__":
    out = build(sys.argv[1], sys.argv[2])
    print(json.dumps(out, indent=2))
    if len(sys.argv) > 3:
        with open(sys.argv[3], "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
