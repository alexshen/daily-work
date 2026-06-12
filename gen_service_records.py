import re
import datetime
import argparse
from pathlib import Path
from typing import List

import pandas as pd
import win32com.client as win32

# 中文数字映射表
CHINESE_NUMBERS = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "十一": 11, "十二": 12
}

def parse_month_from_text(month_text: str) -> int:
    if not month_text:
        return None
    text = str(month_text).strip()
    match = re.search(r'[（(](.+?)[）)]', text)
    if match:
        inner = match.group(1)
    else:
        inner = text
    inner = inner.replace('月份', '').strip()
    return CHINESE_NUMBERS.get(inner, None)

def is_yellow_fill(cell) -> bool:
    try:
        color = cell.Interior.Color
        return color == 65535
    except:
        return False

def get_merged_cell_value(cell):
    if cell.MergeCells:
        return cell.MergeArea.Cells(1, 1).Value
    else:
        return cell.Value

def extract_year_from_cell(cell):
    val = cell.Value
    if val is None:
        raise ValueError("年份单元格为空")
    match = re.search(r"\d{4}", str(val))
    if not match:
        raise ValueError(f"未从 '{val}' 中提取到年份")
    return int(match.group())

def process_sheet(sheet, year: int, month: int) -> list:
    records = []
    for row in range(5, 35):
        try:
            volunteer_name = get_merged_cell_value(sheet.Cells(row, 1))
            volunteer_id   = get_merged_cell_value(sheet.Cells(row, 2))
            client_name    = get_merged_cell_value(sheet.Cells(row, 4))
            client_id      = get_merged_cell_value(sheet.Cells(row, 5))
        except Exception as e:
            print(f"  警告：第 {row} 行读取信息失败: {e}")
            continue

        if not volunteer_name or not client_name:
            continue

        for col in range(6, 13):
            cell = sheet.Cells(row, col)
            if is_yellow_fill(cell) and cell.Value is not None:
                try:
                    day = int(cell.Value)
                    service_date = datetime.date(year, month, day)
                except (ValueError, TypeError):
                    print(f"  警告：工作表 '{sheet.Name}' 第{row}行第{col}列日期无效 ({cell.Value})，跳过。")
                    continue

                records.append({
                    "服务日期": service_date.strftime("%Y/%m/%d"),   # 字符串格式
                    "服务对象名字": str(client_name).strip(),
                    "身份证号": str(client_id).strip() if client_id else "",
                    "服务项目": "上海市“老伙伴”计划",
                    "服务内容": "电话联络",
                    "服务结果": "完成",
                    "志愿者姓名": str(volunteer_name).strip(),
                    "志愿者身份证号": str(volunteer_id).strip() if volunteer_id else "",
                })
    return records

def process_one_file(excel_path: str, password: str) -> list:
    excel_path = Path(excel_path).absolute()
    if not excel_path.exists():
        raise FileNotFoundError(f"文件不存在: {excel_path}")

    excel_app = win32.gencache.EnsureDispatch('Excel.Application')
    excel_app.Visible = False
    excel_app.DisplayAlerts = False
    excel_app.ScreenUpdating = False
    excel_app.Interactive = False

    all_records = []
    try:
        wb = excel_app.Workbooks.Open(str(excel_path), Password=password)
        sheets = wb.Worksheets
        sheets_to_process = list(sheets)[:-1]

        if not sheets_to_process:
            print(f"  文件 {excel_path.name} 没有需要处理的工作表")
            return []

        for sheet in sheets_to_process:
            print(f"  正在处理工作表: {sheet.Name}")
            year_cell = sheet.Range("A1")
            try:
                year = extract_year_from_cell(year_cell)
            except Exception as e:
                print(f"    跳过，无法提取年份: {e}")
                continue

            month_cell = sheet.Range("F3")
            month_text = month_cell.Value
            if not month_text:
                print(f"    跳过，月份单元格为空")
                continue

            month = parse_month_from_text(str(month_text).strip())
            if month is None:
                print(f"    跳过，无法解析月份: {month_text}")
                continue

            print(f"    年份={year}, 月份={month}")
            records = process_sheet(sheet, year, month)
            all_records.extend(records)
            print(f"    本工作表共提取 {len(records)} 条记录")

        wb.Close(SaveChanges=False)
    finally:
        excel_app.Quit()

    return all_records

def main(input_files: List[str], password: str, output_path: str):
    all_records = []
    for file_path in input_files:
        print(f"\n正在处理文件: {file_path}")
        try:
            records = process_one_file(file_path, password)
            all_records.extend(records)
            print(f"文件 {Path(file_path).name} 共提取 {len(records)} 条记录")
        except Exception as e:
            print(f"处理文件 {file_path} 时出错: {e}")

    if not all_records:
        print("未提取到任何探访记录")
        return

    df = pd.DataFrame(all_records)
    
    # 直接使用 xlsxwriter 设置列格式
    with pd.ExcelWriter(output_path, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='探访记录', index=False)
        workbook = writer.book
        worksheet = writer.sheets['探访记录']
        text_format = workbook.add_format({'num_format': '@'})
        
        # 查找身份证号列索引
        for col_name in ["身份证号", "志愿者身份证号"]:
            if col_name in df.columns:
                col_idx = df.columns.get_loc(col_name)
                worksheet.set_column(col_idx, col_idx, None, text_format)
    
    print(f"处理完成！共输出 {len(all_records)} 条记录，身份证号与志愿者身份证号已设为文本格式。")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="提取加密Excel中的探访记录")
    parser.add_argument("input_files", nargs="+", help="输入Excel文件路径")
    parser.add_argument("-o", "--output", default="output.xlsx", help="输出文件")
    parser.add_argument("-p", "--password", default="", help="Excel密码")
    args = parser.parse_args()
    main(args.input_files, args.password, args.output)