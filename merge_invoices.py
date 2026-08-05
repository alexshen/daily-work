#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
发票2合1合并脚本 - 使用PyMuPDF

功能：将2个发票PDF合并到一个A4页面上，保留合适的页边距，
      两个发票按原始宽高比缩放、居中排列（上下或左右），便于打印。

依赖: pip install pymupdf

用法:
    python merge_invoices.py 发票1.pdf 发票2.pdf 输出.pdf
    python merge_invoices.py --layout side-by-side --margin-mm 12 发票1.pdf 发票2.pdf 输出.pdf
"""

import argparse
import sys
from pathlib import Path

import fitz  # PyMuPDF

# A4 尺寸（单位: 点，1pt = 1/72 英寸）
A4_WIDTH = 595.276
A4_HEIGHT = 841.890

MM_TO_PT = 72.0 / 25.4  # 1毫米对应的点数


def fit_rect(src_w, src_h, region):
    """将源页面按原始宽高比缩放，居中放入目标区域，返回目标矩形。"""
    scale = min(region.width / src_w, region.height / src_h)
    w = src_w * scale
    h = src_h * scale
    x = region.x0 + (region.width - w) / 2
    y = region.y0 + (region.height - h) / 2
    return fitz.Rect(x, y, x + w, y + h)


def place_invoice(page, src_doc, page_no, region):
    """将源PDF的一页按比例缩放后放入指定区域（保持矢量内容）。"""
    src_page = src_doc[page_no]
    rect = fit_rect(src_page.rect.width, src_page.rect.height, region)
    page.show_pdf_page(rect, src_doc, page_no, keep_proportion=True)


def merge_two_invoices(invoice1, invoice2, output, margin_mm=15, gap_mm=8,
                       layout="stack", divider=True):
    """
    将两个发票PDF合并到一个A4页面。

    Args:
        invoice1: 第一个发票PDF路径
        invoice2: 第二个发票PDF路径
        output: 输出PDF路径
        margin_mm: 页边距（毫米）
        gap_mm: 两个发票之间的间距（毫米）
        layout: 布局方式，'stack' 上下排列 / 'side-by-side' 左右排列
        divider: 是否在两个发票之间绘制分隔线
    """
    margin = margin_mm * MM_TO_PT
    gap = gap_mm * MM_TO_PT

    # 创建A4页面
    out_doc = fitz.open()
    out_page = out_doc.new_page(width=A4_WIDTH, height=A4_HEIGHT)
    page_rect = out_page.rect

    # 内容区域（扣除页边距）
    content = fitz.Rect(
        page_rect.x0 + margin,
        page_rect.y0 + margin,
        page_rect.x1 - margin,
        page_rect.y1 - margin,
    )

    if layout == "stack":
        # 上下排列
        region_h = (content.height - gap) / 2
        regions = [
            fitz.Rect(content.x0, content.y0, content.x1, content.y0 + region_h),
            fitz.Rect(content.x0, content.y0 + region_h + gap, content.x1, content.y1),
        ]
    else:  # side-by-side
        region_w = (content.width - gap) / 2
        regions = [
            fitz.Rect(content.x0, content.y0, content.x0 + region_w, content.y1),
            fitz.Rect(content.x0 + region_w + gap, content.y0, content.x1, content.y1),
        ]

    infos = []
    for path, region in zip([invoice1, invoice2], regions):
        doc = fitz.open(path)
        if len(doc) == 0:
            print(f"❌ 警告: {path} 为空文档")
            doc.close()
            continue
        if len(doc) > 1:
            print(f"⚠️  警告: {path} 包含 {len(doc)} 页，只取第1页")
        place_invoice(out_page, doc, 0, region)
        infos.append((Path(path).name, region))
        doc.close()

    if divider:
        # 在两个发票之间的间距处绘制一条细分隔线
        if layout == "stack":
            line_y = content.y0 + (content.height - gap) / 2 + gap / 2
            line_pts = [
                (content.x0 + margin * 0.3, line_y),
                (content.x1 - margin * 0.3, line_y),
            ]
        else:
            line_x = content.x0 + (content.width - gap) / 2 + gap / 2
            line_pts = [
                (line_x, content.y0 + margin * 0.3),
                (line_x, content.y1 - margin * 0.3),
            ]
        out_page.draw_line(line_pts[0], line_pts[1], color=(0.7, 0.7, 0.7), width=0.6)

    out_doc.save(output, deflate=True)
    out_doc.close()

    print(f"✅ 合并成功: {output}")
    for name, region in infos:
        print(f"   - {name}: 区域 {region.width:.1f}x{region.height:.1f} pt")


def main():
    parser = argparse.ArgumentParser(description="将2个发票PDF合并到一张A4纸上")
    parser.add_argument("invoice1", help="第一个发票PDF")
    parser.add_argument("invoice2", help="第二个发票PDF")
    parser.add_argument("output", help="输出PDF文件")
    parser.add_argument("--margin-mm", type=float, default=15,
                        help="页边距（毫米），默认15")
    parser.add_argument("--gap-mm", type=float, default=8,
                        help="两个发票之间的间距（毫米），默认8")
    parser.add_argument("--layout", choices=["stack", "side-by-side"], default="stack",
                        help="布局: stack 上下排列 / side-by-side 左右排列，默认 stack")
    parser.add_argument("--no-divider", action="store_true",
                        help="不绘制分隔线")
    args = parser.parse_args()

    for p in (args.invoice1, args.invoice2):
        if not Path(p).exists():
            print(f"❌ 文件不存在: {p}")
            sys.exit(1)

    merge_two_invoices(
        args.invoice1,
        args.invoice2,
        args.output,
        margin_mm=args.margin_mm,
        gap_mm=args.gap_mm,
        layout=args.layout,
        divider=not args.no_divider,
    )


if __name__ == "__main__":
    main()
