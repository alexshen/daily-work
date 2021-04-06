#! /usr/bin/env python3

import os
import glob
import argparse
import openpyxl
import xlrd


def cell_address(s):
    return tuple(int(e) for e in s.split(','))


def last_non_empty_col(sheet, row, col):
    '''
    find the last non empty cell in the consecutive non empty range starting at
    (row, col)
    '''
    while col + 1 < sheet.ncols and sheet.cell(row, col + 1).value:
        col += 1
    return col


def copy_range(src_ws: xlrd.sheet, src_row, src_col_start, src_col_end,
               dest_ws: openpyxl.worksheet.worksheet.Worksheet, dest_row, dest_col):
    '''
    copy the source range to the destination range
    returns True if any non empty cell is copied
    '''
    col = src_col_start
    copied = False
    while col <= src_col_end:
        c = src_ws.cell(src_row, col)
        if c.value:
            dest_ws.cell(dest_row, dest_col).value = c.value
            copied = True
        col += 1
        dest_col += 1
    return copied


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument(
        'source', nargs='+', help='source workbook path, simple unix shell style pattern can be used')
    parser.add_argument(
        '--top-left', metavar='ROW,COL', type=cell_address, help='the top left cell of the range in each worksheet to merge, i.e. row,col')
    parser.add_argument('--header', action='store_true', default=False,
                        help='whether each range has a header row')
    parser.add_argument('-w', type=int, dest='width',
                        help='width of the range to merge')
    parser.add_argument('-o', required=True, dest='output',
                        help='output workbook path')
    args = parser.parse_args()

    output = openpyxl.Workbook()
    out_ws = output.worksheets[0]
    first = True
    range_width = args.width
    out_row = 1
    for p in args.source:
        for f in glob.glob(p):
            ws = xlrd.open_workbook(f).sheet_by_index(0)
            row, col = args.top_left
            row -= 1
            col -= 1
            if not range_width:
                range_width = last_non_empty_col(ws, row, col) - col + 1
            if args.header:
                if first:
                    first = False
                else:
                    row += 1
            while row < ws.nrows and copy_range(ws, row, col, col + range_width - 1, out_ws,
                                                out_row, 1):
                row += 1
                out_row += 1
    output.save(args.output)
