#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import sys
from pathlib import Path
import fitz  # PyMuPDF

def parse_pages(pages_str, total_pages):
    """
    解析页码范围字符串，如 '1,5' 或 '3,' 或 ',10'
    
    Args:
        pages_str: 页码范围字符串
        total_pages: PDF总页数
    
    Returns:
        tuple: (start_page, end_page) 从1开始的页码
    """
    if not pages_str:
        return 1, total_pages
    
    parts = pages_str.split(',')
    
    # 处理 x 部分（开始页码）
    if parts[0].strip():
        start = int(parts[0].strip())
        if start < 1:
            start = 1
    else:
        start = 1
    
    # 处理 y 部分（结束页码）
    if len(parts) > 1 and parts[1].strip():
        end = int(parts[1].strip())
        if end > total_pages:
            end = total_pages
    else:
        end = total_pages
    
    # 确保 start <= end
    if start > end:
        start, end = end, start
    
    return start, end

def extract_pages(input_pdf, output_pdf, pages_str, preserve_metadata=True):
    """
    使用PyMuPDF从PDF文件中提取指定页码范围
    
    Args:
        input_pdf: 输入PDF文件路径
        output_pdf: 输出PDF文件路径
        pages_str: 页码范围字符串
        preserve_metadata: 是否保留元数据（默认为True）
    
    Returns:
        bool: 成功返回True，失败返回False
    """
    try:
        # 检查输入文件是否存在
        if not Path(input_pdf).exists():
            print(f"错误: 找不到文件 '{input_pdf}'")
            return False
        
        # 打开PDF文档
        doc = fitz.open(input_pdf)
        total_pages = len(doc)
        
        if total_pages == 0:
            print("错误: PDF文件为空！")
            doc.close()
            return False
        
        # 解析页码范围
        start_page, end_page = parse_pages(pages_str, total_pages)
        
        # 验证页码范围
        if start_page < 1 or end_page > total_pages:
            print(f"错误: 页码范围 {start_page}-{end_page} 超出PDF总页数 {total_pages}")
            doc.close()
            return False
        
        # 创建新的PDF文档
        new_doc = fitz.open()
        
        # 提取页面（注意：PyMuPDF索引从0开始）
        for page_num in range(start_page - 1, end_page):
            # 插入页面（保留原有页面内容）
            new_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
        
        # 复制元数据（可选）
        if preserve_metadata:
            new_doc.metadata = doc.metadata
        
        # 保存新PDF
        new_doc.save(output_pdf)
        new_doc.close()
        doc.close()
        
        # 显示提取信息
        extracted_count = end_page - start_page + 1
        print(f"✓ 成功从 '{input_pdf}' 提取了 {extracted_count} 页")
        print(f"  页码范围: {start_page} 到 {end_page}")
        print(f"  输出文件: '{output_pdf}'")
        print(f"  文件大小: {Path(output_pdf).stat().st_size / 1024:.2f} KB")
        return True
        
    except PermissionError:
        print(f"错误: 没有权限访问文件 '{input_pdf}'")
        return False
    except Exception as e:
        print(f"错误: {str(e)}")
        return False

def merge_pdfs(pdf_files, output_pdf):
    """
    合并多个PDF文件（额外功能）
    
    Args:
        pdf_files: PDF文件路径列表
        output_pdf: 输出文件路径
    """
    try:
        result_doc = fitz.open()
        
        for pdf_file in pdf_files:
            if not Path(pdf_file).exists():
                print(f"警告: 找不到文件 '{pdf_file}'，跳过")
                continue
            
            doc = fitz.open(pdf_file)
            result_doc.insert_pdf(doc)
            doc.close()
        
        result_doc.save(output_pdf)
        result_doc.close()
        print(f"✓ 成功合并 {len(pdf_files)} 个PDF文件到 '{output_pdf}'")
        return True
        
    except Exception as e:
        print(f"错误: {str(e)}")
        return False

def get_page_info(input_pdf):
    """
    获取PDF文件信息（辅助功能）
    """
    try:
        doc = fitz.open(input_pdf)
        total_pages = len(doc)
        metadata = doc.metadata
        
        print(f"文件: {input_pdf}")
        print(f"总页数: {total_pages}")
        if metadata:
            print("元数据:")
            for key, value in metadata.items():
                if value:
                    print(f"  {key}: {value}")
        doc.close()
        return True
    except Exception as e:
        print(f"错误: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(
        description='使用PyMuPDF从PDF文件中提取指定页码范围（高性能版本）',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 基本提取
  %(prog)s input.pdf output.pdf -p 3,5   # 提取第3-5页
  %(prog)s input.pdf output.pdf -p 3,    # 提取第3页到最后一页
  %(prog)s input.pdf output.pdf -p ,5    # 提取第1页到第5页
  %(prog)s input.pdf output.pdf          # 提取所有页（复制整个PDF）
  
  # 高级功能
  %(prog)s input.pdf output.pdf -p 5,10 --no-metadata  # 不保留元数据
  %(prog)s --info document.pdf                          # 查看PDF信息
  %(prog)s --merge file1.pdf file2.pdf merged.pdf       # 合并多个PDF
        """
    )
    
    parser.add_argument('--input', help='输入PDF文件路径')
    parser.add_argument('--output', help='输出PDF文件路径')
    parser.add_argument('-p', '--pages', 
                       help='页码范围，格式为 x,y (x默认1，y默认最后一页)',
                       default='')
    parser.add_argument('--no-metadata', 
                       action='store_true',
                       help='不保留元数据（默认保留）')
    parser.add_argument('--info', 
                       metavar='PDF_FILE',
                       help='显示PDF文件信息')
    parser.add_argument('--merge', 
                       nargs='+',
                       metavar='PDF_FILE',
                       help='合并多个PDF文件，最后一个为输出文件')
    
    # 兼容简单的两个参数用法：input.pdf output.pdf
    args, unknown = parser.parse_known_args()
    
    # 处理 --info 功能
    if args.info:
        return 0 if get_page_info(args.info) else 1
    
    # 处理 --merge 功能
    if args.merge:
        if len(args.merge) < 2:
            print("错误: --merge 需要至少2个文件（输入文件 + 输出文件）")
            return 1
        output_file = args.merge[-1]
        input_files = args.merge[:-1]
        return 0 if merge_pdfs(input_files, output_file) else 1
    
    # 处理基本提取功能（支持两种调用方式）
    input_pdf = args.input
    output_pdf = args.output
    
    # 尝试从位置参数获取（如果提供了2个位置参数）
    if not input_pdf and unknown:
        if len(unknown) >= 2:
            input_pdf = unknown[0]
            output_pdf = unknown[1]
        elif len(unknown) == 1:
            print("错误: 请指定输出文件")
            return 1
    
    if not input_pdf or not output_pdf:
        parser.print_help()
        return 1
    
    # 执行提取操作
    preserve_metadata = not args.no_metadata
    success = extract_pages(input_pdf, output_pdf, args.pages, preserve_metadata)
    
    return 0 if success else 1

if __name__ == '__main__':
    sys.exit(main())